"""Tripo GLB (EXT_meshopt_compression + KHR_mesh_quantization) -> düz GLB (float köşe, uint32 indeks).
Godot bu iki uzantıyı içe aktaramıyor. Kullanım: python -I decode_meshopt.py <girdi.glb> <çıktı.glb>
Desteklenen: ATTRIBUTES v0 (0xA0) + filtre NONE/EXPONENTIAL/OCTAHEDRAL, TRIANGLES v0/v1 (0xE0/0xE1), INDICES."""
import json, struct, sys, math

# ───────────── meshopt köşe çözücü (v0) ─────────────
def _unzig8(v):
    return (v >> 1) ^ (-(v & 1) & 0xFF)

def _decode_bytes_group(data, pos, out, opos, bitslog2):
    if bitslog2 == 0:
        for k in range(16):
            out[opos + k] = 0
        return pos
    if bitslog2 == 3:
        out[opos:opos + 16] = data[pos:pos + 16]
        return pos + 16
    bits = 2 if bitslog2 == 1 else 4
    nbytes = 4 if bits == 2 else 8
    per = 8 // bits
    sentinel = (1 << bits) - 1
    var = pos + nbytes
    o = opos
    for bi in range(nbytes):
        byte = data[pos + bi]
        for _ in range(per):
            enc = byte >> (8 - bits)
            byte = (byte << bits) & 0xFF
            if enc == sentinel:
                out[o] = data[var]
                var += 1
            else:
                out[o] = enc
            o += 1
    return var

def _decode_bytes(data, pos, out, size):
    header_size = ((size // 16) + 3) // 4
    header = pos
    pos += header_size
    for i in range(0, size, 16):
        g = i // 16
        b = (data[header + g // 4] >> ((g % 4) * 2)) & 3
        pos = _decode_bytes_group(data, pos, out, i, b)
    return pos

def decode_vertex_buffer(data, count, stride):
    assert data[0] == 0xA0, 'köşe codec sürümü desteklenmiyor: %02x' % data[0]
    out = bytearray(count * stride)
    last = bytearray(data[len(data) - stride:])
    block = min((8192 // stride) & ~15, 256)
    pos = 1
    buf = bytearray(256)
    for vo in range(0, count, block):
        n = min(block, count - vo)
        aligned = (n + 15) & ~15
        for k in range(stride):
            pos = _decode_bytes(data, pos, buf, aligned)
            p = last[k]
            base = vo * stride + k
            for i in range(n):
                p = (p + _unzig8(buf[i])) & 0xFF
                out[base + i * stride] = p
            last[k] = p
    return out

# ───────────── filtreler ─────────────
def filter_exponential(raw, count, stride):
    n = count * stride // 4
    ints = struct.unpack('<%di' % n, raw)
    vals = []
    for v in ints:
        e = v >> 24
        m = ((v << 8) & 0xFFFFFFFF)
        if m & 0x80000000:
            m -= 1 << 32
        m >>= 8
        vals.append(m * math.ldexp(1.0, e))
    return struct.pack('<%df' % n, *vals)

def filter_octahedral(raw, count, stride):
    # stride 4 (int8 x4) veya 8 (int16 x4); sonuç aynı biçimde normalize tamsayı
    if stride == 4:
        comps = list(struct.unpack('<%db' % (count * 4), raw)); maxv = 127
    else:
        comps = list(struct.unpack('<%dh' % (count * 4), raw)); maxv = 32767
    out = []
    for i in range(count):
        x, y, one = comps[i*4], comps[i*4+1], comps[i*4+2]
        one = one if one != 0 else maxv
        fx, fy = x / one, y / one
        fz = 1.0 - abs(fx) - abs(fy)
        t = max(-fz, 0.0)
        fx -= t if fx >= 0 else -t
        fy -= t if fy >= 0 else -t
        l = math.sqrt(fx*fx + fy*fy + fz*fz) or 1.0
        out += [fx / l, fy / l, fz / l]
    return out  # float listesi (3/köşe)

# ───────────── indeks çözücü ─────────────
def _vbyte(data, pos):
    r = 0; shift = 0
    while True:
        b = data[pos]; pos += 1
        r |= (b & 127) << shift
        if b < 128:
            return r, pos
        shift += 7

def decode_index_buffer(data, count):
    ver = data[0] & 0x0F
    assert data[0] & 0xF0 == 0xE0, 'indeks codec değil'
    tri = count // 3
    code = 1
    pos = 1 + tri
    aux = len(data) - 16
    M = 0xFFFFFFFF
    ef = [[M, M] for _ in range(16)]; efo = 0
    vf = [M] * 16; vfo = 0
    nxt = 0; last = 0
    fecmax = 13 if ver >= 1 else 15
    out = [0] * count

    def dec_index(pos, last):
        v, pos = _vbyte(data, pos)
        d = (v >> 1) ^ (-(v & 1))
        return (last + d) & M, pos

    for t in range(tri):
        i = t * 3
        c3 = data[code + t]
        if c3 < 0xF0:
            fe = c3 >> 4
            a, b = ef[(efo - 1 - fe) & 15]
            fec = c3 & 15
            if fec < fecmax:
                if fec == 0:
                    c = nxt; nxt += 1; adv = 1
                else:
                    c = vf[(vfo - 1 - fec) & 15]; adv = 0
                out[i], out[i+1], out[i+2] = a, b, c
                vf[vfo] = c; vfo = (vfo + adv) & 15
            else:
                if fec != 15:
                    c = (last + (fec - (fec ^ 3))) & M
                else:
                    c, pos = dec_index(pos, last)
                last = c
                out[i], out[i+1], out[i+2] = a, b, c
                vf[vfo] = c; vfo = (vfo + 1) & 15
            ef[efo] = [c, b]; efo = (efo + 1) & 15
            ef[efo] = [a, c]; efo = (efo + 1) & 15
        else:
            if c3 < 0xFE:
                ca = data[aux + (c3 & 15)]
                feb = ca >> 4; fec = ca & 15
                a = nxt; nxt += 1
                if feb == 0:
                    b = nxt; nxt += 1
                else:
                    b = vf[(vfo - feb) & 15]
                if fec == 0:
                    c = nxt; nxt += 1
                else:
                    c = vf[(vfo - fec) & 15]
                out[i], out[i+1], out[i+2] = a, b, c
                vf[vfo] = a; vfo = (vfo + 1) & 15
                vf[vfo] = b; vfo = (vfo + (1 if feb == 0 else 0)) & 15
                vf[vfo] = c; vfo = (vfo + (1 if fec == 0 else 0)) & 15
            else:
                ca = data[pos]; pos += 1
                fea = 0 if c3 == 0xFE else 15
                feb = ca >> 4; fec = ca & 15
                if ca == 0:
                    nxt = 0
                if fea == 0:
                    a = nxt; nxt += 1
                else:
                    a = 0
                if feb == 0:
                    b = nxt; nxt += 1
                else:
                    b = vf[(vfo - feb) & 15]
                if fec == 0:
                    c = nxt; nxt += 1
                else:
                    c = vf[(vfo - fec) & 15]
                if fea == 15:
                    a, pos = dec_index(pos, last); last = a
                if feb == 15:
                    b, pos = dec_index(pos, last); last = b
                if fec == 15:
                    c, pos = dec_index(pos, last); last = c
                out[i], out[i+1], out[i+2] = a, b, c
                vf[vfo] = a; vfo = (vfo + 1) & 15
                vf[vfo] = b; vfo = (vfo + (1 if feb in (0, 15) else 0)) & 15
                vf[vfo] = c; vfo = (vfo + (1 if fec in (0, 15) else 0)) & 15
            ef[efo] = [b, a]; efo = (efo + 1) & 15
            ef[efo] = [c, b]; efo = (efo + 1) & 15
            ef[efo] = [a, c]; efo = (efo + 1) & 15
    return out

def decode_index_sequence(data, count):
    assert data[0] & 0xF0 == 0xD0
    pos = 1; last = [0, 0]; out = []
    for _ in range(count):
        v, pos = _vbyte(data, pos)
        cur = v & 1; v >>= 1
        d = (v >> 1) ^ (-(v & 1))
        last[cur] = (last[cur] + d) & 0xFFFFFFFF
        out.append(last[cur])
    return out

# ───────────── GLB okuma/yazma ─────────────
COMP = {5120: ('b', 1, 127.0), 5121: ('B', 1, 255.0), 5122: ('h', 2, 32767.0), 5123: ('H', 2, 65535.0), 5125: ('I', 4, None), 5126: ('f', 4, None)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def main(src, dst):
    b = open(src, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack_from('<I', b, off)[0]
    binb = b[off + 8: off + 8 + bl]

    # bufferView verisi (çözülmüş, sıkışık) — meshopt olanlar decode edilir
    views = {}
    for i, bv in enumerate(j['bufferViews']):
        ext = bv.get('extensions', {}).get('EXT_meshopt_compression')
        if not ext:
            o = bv.get('byteOffset', 0)
            views[i] = (binb[o:o + bv['byteLength']], bv.get('byteStride'))
            continue
        o = ext.get('byteOffset', 0)
        raw = binb[o:o + ext['byteLength']]
        cnt, st, mode, flt = ext['count'], ext['byteStride'], ext['mode'], ext.get('filter', 'NONE')
        if mode == 'ATTRIBUTES':
            dec = bytes(decode_vertex_buffer(raw, cnt, st))
            if flt == 'EXPONENTIAL':
                dec = filter_exponential(dec, cnt, st)
            elif flt == 'OCTAHEDRAL':
                dec = ('OCT', filter_octahedral(dec, cnt, st))
            elif flt != 'NONE':
                raise SystemExit('filtre desteklenmiyor: ' + flt)
            views[i] = (dec, st)
        elif mode == 'TRIANGLES':
            views[i] = (('IDX', decode_index_buffer(raw, cnt)), st)
        elif mode == 'INDICES':
            views[i] = (('IDX', decode_index_sequence(raw, cnt)), st)
        print('  bv', i, mode, flt, cnt, 'tamam')

    out_bin = bytearray()
    new_views = []
    def add_view(data, target=None):
        while len(out_bin) % 4:
            out_bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        out_bin.extend(data)
        new_views.append(v)
        return len(new_views) - 1

    # Görseller olduğu gibi
    img_view = {}
    for img in j.get('images', []):
        if 'bufferView' in img:
            ov = img['bufferView']
            if ov not in img_view:
                img_view[ov] = add_view(views[ov][0])
            img['bufferView'] = img_view[ov]

    # Accessor'ları float/uint32 sıkışık hale getir
    for a in j['accessors']:
        bvi = a.get('bufferView')
        if bvi is None:
            continue
        data, stride = views[bvi]
        n = NCOMP[a['type']]
        cnt = a['count']
        aoff = a.get('byteOffset', 0)
        if isinstance(data, tuple) and data[0] == 'IDX':
            idx = data[1][:cnt]
            a['componentType'] = 5125
            a.pop('normalized', None)
            a['bufferView'] = add_view(struct.pack('<%dI' % len(idx), *idx), 34963)
            a['byteOffset'] = 0
            continue
        if isinstance(data, tuple) and data[0] == 'OCT':
            vals = data[1]
        else:
            fmt, size, norm = COMP[a['componentType']]
            st = stride or size * n
            vals = []
            for k in range(cnt):
                base = aoff + k * st
                comp = struct.unpack_from('<%d%s' % (n, fmt), data, base)
                if a.get('normalized') and norm:
                    comp = [max(c / norm, -1.0) for c in comp]
                vals.extend(float(c) for c in comp)
        if a['type'] == 'VEC3' and len(vals) >= 3:
            pass
        a['componentType'] = 5126
        a.pop('normalized', None)
        a['byteOffset'] = 0
        a['bufferView'] = add_view(struct.pack('<%df' % len(vals), *vals), 34962)
        if a.get('min') is None and n <= 4:
            pass

    # Normalleri yeniden normalize et (8 bit kuantalama)
    for m in j['meshes']:
        for p in m['primitives']:
            ni = p['attributes'].get('NORMAL')
            if ni is None:
                continue
            a = j['accessors'][ni]
            v = new_views[a['bufferView']]
            raw = out_bin[v['byteOffset']: v['byteOffset'] + v['byteLength']]
            f = list(struct.unpack('<%df' % (len(raw) // 4), raw))
            for k in range(0, len(f), 3):
                l = math.sqrt(f[k]**2 + f[k+1]**2 + f[k+2]**2) or 1.0
                f[k] /= l; f[k+1] /= l; f[k+2] /= l
            out_bin[v['byteOffset']: v['byteOffset'] + v['byteLength']] = struct.pack('<%df' % len(f), *f)

    j['bufferViews'] = new_views
    j['buffers'] = [{'byteLength': len(out_bin)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        j.pop(key, None)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    while len(out_bin) % 4:
        out_bin.append(0)
    total = 12 + 8 + len(js) + 8 + len(out_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out_bin), 0x004E4942)); f.write(out_bin)
    idx_acc = j['accessors'][j['meshes'][0]['primitives'][0]['indices']]
    print('yazıldı', dst, 'üçgen', idx_acc['count'] // 3)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
