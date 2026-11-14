import json, struct, sys

def load(p):
    b = open(p, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack_from('<I', b, off)[0]
    return j, b[off + 8: off + 8 + bl]

src, dst = sys.argv[1], sys.argv[2]
js, _ = load(src)
j, binb = load(dst)
prim = j['meshes'][0]['primitives'][0]
def arr(ai):
    a = j['accessors'][ai]; v = j['bufferViews'][a['bufferView']]
    fmt = 'I' if a['componentType'] == 5125 else 'f'
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    return struct.unpack_from('<%d%s' % (a['count'] * n, fmt), binb, v['byteOffset']), n, a['count']
pos, _, vc = arr(prim['attributes']['POSITION'])
mn = [min(pos[i::3]) for i in range(3)]; mx = [max(pos[i::3]) for i in range(3)]
ref = js['accessors'][js['meshes'][0]['primitives'][0]['attributes']['POSITION']]
print('pos min', [round(x, 4) for x in mn], 'ref', ref['min'])
print('pos max', [round(x, 4) for x in mx], 'ref', ref['max'])
idx, _, ic = arr(prim['indices'])
print('indeks max', max(idx), '< köşe', vc, 'OK' if max(idx) < vc else 'HATA')
nrm, _, _ = arr(prim['attributes']['NORMAL'])
print('normal örnek', [round(x, 3) for x in nrm[:6]])
uv, _, _ = arr(prim['attributes']['TEXCOORD_0'])
print('uv aralık', round(min(uv), 3), round(max(uv), 3))
# Dejenere üçgen oranı (yanlış çözümde çok yüksek olur)
deg = sum(1 for t in range(0, len(idx), 3) if idx[t] == idx[t+1] or idx[t+1] == idx[t+2] or idx[t] == idx[t+2])
print('dejenere üçgen', deg, '/', len(idx) // 3)
