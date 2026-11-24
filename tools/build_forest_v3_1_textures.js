#!/usr/bin/env node
/**
 * build_forest_v3_1_textures.js
 * Generates 2K/1K PBR textures (_albedo.png, _normal.png, _orm.png) + Godot 4 BC7/BC5/BC1 .import files
 * for Map4_Orman_v3_1 (Night Forest Military Camp & Logging Facility v3.1)
 * inside asset model/haritalar/Map4_Orman_v3_1/textures/
 *
 * CRITICAL ART DIRECTION:
 * - ZERO emission / ZERO neon!
 * - Rich damp nocturnal woodland PBR: moist forest loam, pine needles, velvety moss,
 *   glistening mud puddles, deeply fissured bark, creeping ground ivy vines, lush fern fronds,
 *   and spreading surface tree roots — all reactive to flashlights & camp lanterns via crisp
 *   Normal Maps and wet/dry Roughness contrast.
 * - Iris Xe GPU budget: 19 PBR sets (57 PNGs + 57 .import files), target total PNG size ~42-52 MB.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3_1');
const TEX_DIR = path.join(OUT_DIR, 'textures');

fs.mkdirSync(TEX_DIR, { recursive: true });

// ============================================================================
// PNG Encoder (CRC32 + Sub-filtered zlib deflate — matches project template)
// ============================================================================
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}
function encodePNG(width, height, channels, pixelBuffer, deflateLevel = 6) {
  const colorType = channels === 4 ? 6 : 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1; // Sub filter
    const srcStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const prev = x >= channels ? pixelBuffer[srcStart + x - channels] : 0;
      raw[rowStart + 1 + x] = (pixelBuffer[srcStart + x] - prev) & 0xff;
    }
  }
  const idat = zlib.deflateSync(raw, { level: deflateLevel });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// ============================================================================
// Deterministic Fast Noise, Math & Geometry Helpers
// ============================================================================
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296.0;
}

function makeRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
  };
}

function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3.0 - 2.0 * xf);
  const v = yf * yf * (3.0 - 2.0 * yf);
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(u, v, baseFreq, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + i * 31);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function voronoi(u, v, cells, seed) {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let minD1 = 99;
  let minD2 = 99;
  let cellId = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ((ix + ox) % cells + cells) % cells;
      const cy = ((iy + oy) % cells + cells) % cells;
      const px = ix + ox + hash2(cx, cy, seed);
      const py = iy + oy + hash2(cx, cy, seed + 17);
      const dx = px - gx;
      const dy = py - gy;
      const d = dx * dx + dy * dy;
      if (d < minD1) {
        minD2 = minD1;
        minD1 = d;
        cellId = hash2(cx, cy, seed + 53);
      } else if (d < minD2) {
        minD2 = d;
      }
    }
  }
  const d1 = Math.sqrt(minD1);
  const d2 = Math.sqrt(minD2);
  return { d1, d2, edge: d2 - d1, id: cellId };
}

function clampByte(v) {
  return v < 0 ? 0 : (v > 255 ? 255 : (v | 0));
}
function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Segment distance returning { dist, t, side }
function segmentInfo(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 1e-10 ? clamp01((wx * vx + wy * vy) / lenSq) : 0;
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return { dist: Math.hypot(dx, dy), t, dx, dy };
}

// 5x7 Military Stencil Font (non-emissive crate & olive metal markings)
const STENCIL_GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000']
};
function sampleStencilText(text, u, v, startU, startV, charW, charH, gapU) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const glyph = STENCIL_GLYPHS[ch];
    if (!glyph) continue;
    const cu = (u - (startU + i * (charW + gapU))) / charW;
    const cv = (v - startV) / charH;
    if (cu >= 0 && cu < 1 && cv >= 0 && cv < 1) {
      const gx = Math.min(4, Math.floor(cu * 5));
      const gy = Math.min(6, Math.floor(cv * 7));
      if (glyph[gy][gx] === '1') {
        const subX = (cu * 5) % 1;
        const subY = (cv * 7) % 1;
        if (Math.abs(cu - 0.5) < 0.045 && (gy === 0 || gy === 3 || gy === 6)) return false;
        if (subX > 0.06 && subX < 0.94 && subY > 0.06 && subY < 0.94) return true;
      }
    }
  }
  return false;
}

// ============================================================================
// PBR Writer (_albedo.png, _normal.png, _orm.png) + Godot 4 .import Writer
// ============================================================================
function writePBRSet(baseName, size, isAlpha, evalPixel, bumpScale = 4.8) {
  const albedoPath = path.join(TEX_DIR, `${baseName}_albedo.png`);
  const normalPath = path.join(TEX_DIR, `${baseName}_normal.png`);
  const ormPath = path.join(TEX_DIR, `${baseName}_orm.png`);

  const ch = isAlpha ? 4 : 3;
  const albedo = Buffer.alloc(size * size * ch);
  const orm = Buffer.alloc(size * size * 3);
  const heightMap = new Float32Array(size * size);

  const out = { r: 0, g: 0, b: 0, a: 255, ao: 230, rough: 170, metal: 0, h: 0.5 };
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      out.r = 0; out.g = 0; out.b = 0; out.a = 255;
      out.ao = 230; out.rough = 170; out.metal = 0; out.h = 0.5;
      const res = evalPixel(u, v, x, y, size, out) || out;

      const dIdx = idx * ch;
      albedo[dIdx] = clampByte(res.r);
      albedo[dIdx + 1] = clampByte(res.g);
      albedo[dIdx + 2] = clampByte(res.b);
      if (isAlpha) albedo[dIdx + 3] = clampByte(res.a !== undefined ? res.a : 255);

      const oIdx = idx * 3;
      orm[oIdx] = clampByte(res.ao !== undefined ? res.ao : 230);       // R = AO
      orm[oIdx + 1] = clampByte(res.rough !== undefined ? res.rough : 170); // G = Roughness
      orm[oIdx + 2] = clampByte(res.metal !== undefined ? res.metal : 0);   // B = Metallic
      heightMap[idx] = res.h !== undefined ? res.h : 0.5;
    }
  }

  const nor = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heightMap[y * size + xp] - heightMap[y * size + xm]) * bumpScale;
      const dy = (heightMap[yp * size + x] - heightMap[ym * size + x]) * bumpScale;
      let nx = -dx;
      let ny = dy;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const nIdx = (y * size + x) * 3;
      nor[nIdx] = clampByte((nx * 0.5 + 0.5) * 255);
      nor[nIdx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      nor[nIdx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
    }
  }

  const aBuf = encodePNG(size, size, ch, albedo, 6);
  const nBuf = encodePNG(size, size, 3, nor, 6);
  const oBuf = encodePNG(size, size, 3, orm, 6);
  fs.writeFileSync(albedoPath, aBuf);
  fs.writeFileSync(normalPath, nBuf);
  fs.writeFileSync(ormPath, oBuf);
  const setMB = ((aBuf.length + nBuf.length + oBuf.length) / (1024 * 1024)).toFixed(2);
  console.log(`Generated PBR set: ${baseName} (${size}x${size}${isAlpha ? ' RGBA' : ' RGB'}) — ${setMB} MB`);
}

// Canvas-style Painter for rich botanical decals & foliage (pine needles, ferns, ivy vines, leaves, roots)
function createCanvasPBR(size, isAlpha) {
  const n = size * size;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const a = new Float32Array(n);
  const ao = new Float32Array(n).fill(235);
  const rough = new Float32Array(n).fill(180);
  const metal = new Float32Array(n);
  const h = new Float32Array(n).fill(0.5);
  const z = new Float32Array(n).fill(-1e9);

  function plot(x, y, pr, pg, pb, pa, pao, prough, pmetal, ph, pz) {
    if (x < 0 || x >= size || y < 0 || y >= size || pa <= 0.004) return;
    const idx = y * size + x;
    if (pz !== undefined && pz < z[idx]) return;
    if (pa >= 0.996) {
      r[idx] = pr; g[idx] = pg; b[idx] = pb; a[idx] = 1.0;
      ao[idx] = pao; rough[idx] = prough; metal[idx] = pmetal; h[idx] = ph;
      if (pz !== undefined) z[idx] = pz;
    } else {
      const dstA = a[idx];
      const outA = pa + dstA * (1 - pa);
      if (outA > 1e-5) {
        const wSrc = pa / outA;
        const wDst = (dstA * (1 - pa)) / outA;
        r[idx] = pr * wSrc + r[idx] * wDst;
        g[idx] = pg * wSrc + g[idx] * wDst;
        b[idx] = pb * wSrc + b[idx] * wDst;
        a[idx] = outA;
        ao[idx] = pao * pa + ao[idx] * (1 - pa);
        rough[idx] = prough * pa + rough[idx] * (1 - pa);
        metal[idx] = pmetal * pa + metal[idx] * (1 - pa);
        h[idx] = ph * pa + h[idx] * (1 - pa);
      }
    }
  }

  function flush(baseName, bumpScale = 5.0) {
    // Softly bleed RGB colors into transparent pixels (for clean mipmap filtering without dark fringes)
    if (isAlpha) {
      for (let pass = 0; pass < 4; pass++) {
        const rCopy = new Float32Array(r);
        const gCopy = new Float32Array(g);
        const bCopy = new Float32Array(b);
        const aCopy = new Float32Array(a);
        for (let y = 1; y < size - 1; y++) {
          for (let x = 1; x < size - 1; x++) {
            const idx = y * size + x;
            if (aCopy[idx] > 0.02) continue;
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            const nbrs = [idx - 1, idx + 1, idx - size, idx + size];
            for (let k = 0; k < 4; k++) {
              const ni = nbrs[k];
              if (aCopy[ni] > 0.08 || (pass > 0 && (rCopy[ni] + gCopy[ni] + bCopy[ni]) > 0.1)) {
                sr += rCopy[ni]; sg += gCopy[ni]; sb += bCopy[ni]; cnt++;
              }
            }
            if (cnt > 0) {
              r[idx] = sr / cnt; g[idx] = sg / cnt; b[idx] = sb / cnt;
            }
          }
        }
      }
    }

    const ch = isAlpha ? 4 : 3;
    const albedo = Buffer.alloc(n * ch);
    const orm = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      const dIdx = i * ch;
      albedo[dIdx] = clampByte(r[i]);
      albedo[dIdx + 1] = clampByte(g[i]);
      albedo[dIdx + 2] = clampByte(b[i]);
      if (isAlpha) albedo[dIdx + 3] = clampByte(a[i] * 255);

      const oIdx = i * 3;
      orm[oIdx] = clampByte(ao[i]);
      orm[oIdx + 1] = clampByte(rough[i]);
      orm[oIdx + 2] = clampByte(metal[i]);
    }

    const nor = Buffer.alloc(n * 3);
    for (let y = 0; y < size; y++) {
      const ym = Math.max(0, y - 1);
      const yp = Math.min(size - 1, y + 1);
      for (let x = 0; x < size; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(size - 1, x + 1);
        const dx = (h[y * size + xp] - h[y * size + xm]) * bumpScale;
        const dy = (h[yp * size + x] - h[ym * size + x]) * bumpScale;
        let nx = -dx, ny = dy, nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const nIdx = (y * size + x) * 3;
        nor[nIdx] = clampByte((nx * 0.5 + 0.5) * 255);
        nor[nIdx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
        nor[nIdx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      }
    }

    const aBuf = encodePNG(size, size, ch, albedo, 6);
    const nBuf = encodePNG(size, size, 3, nor, 6);
    const oBuf = encodePNG(size, size, 3, orm, 6);
    fs.writeFileSync(path.join(TEX_DIR, `${baseName}_albedo.png`), aBuf);
    fs.writeFileSync(path.join(TEX_DIR, `${baseName}_normal.png`), nBuf);
    fs.writeFileSync(path.join(TEX_DIR, `${baseName}_orm.png`), oBuf);
    const setMB = ((aBuf.length + nBuf.length + oBuf.length) / (1024 * 1024)).toFixed(2);
    console.log(`Generated PBR set: ${baseName} (${size}x${size}${isAlpha ? ' RGBA' : ' RGB'}) — ${setMB} MB`);
  }

  return { size, r, g, b, a, ao, rough, metal, h, z, plot, flush };
}

// Godot 4 .import generator (BC7 color / BC5 normal / BC1 orm)
function writeTextureImport(fileName, role) {
  const resPath = `res://asset model/haritalar/Map4_Orman_v3_1/textures/${fileName}`;
  const md5 = crypto.createHash('md5').update(resPath).digest('hex');
  const uidHash = crypto.createHash('md5').update('uid:' + resPath).digest('hex').slice(0, 12);
  const isBptc = role === 'color';
  const ext = isBptc ? 'bptc.ctex' : 's3tc.ctex';
  const pathKey = isBptc ? 'path.bptc' : 'path.s3tc';
  const highQuality = role === 'color' ? 'true' : 'false';
  const normalMap = role === 'normal' ? '1' : '2';

  const content = `[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://c${uidHash}"
${pathKey}="res://.godot/imported/${fileName}-${md5}.${ext}"
metadata={
"imported_formats": ["s3tc_bptc"],
"vram_texture": true
}

[deps]

source_file="${resPath}"
dest_files=["res://.godot/imported/${fileName}-${md5}.${ext}"]

[params]

compress/mode=2
compress/high_quality=${highQuality}
compress/lossy_quality=0.7
compress/uastc_level=0
compress/rdo_quality_loss=0.0
compress/hdr_compression=1
compress/normal_map=${normalMap}
compress/channel_pack=0
mipmaps/generate=true
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/channel_remap/red=0
process/channel_remap/green=1
process/channel_remap/blue=2
process/channel_remap/alpha=3
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=0
`;
  fs.writeFileSync(path.join(TEX_DIR, `${fileName}.import`), content, 'utf8');
}

// ============================================================================
// PART A: 2048x2048 OPAQUE GROUND TEXTURES (4 sets)
// ============================================================================

// 1. ground_forest_soil (2048x2048 RGB)
// Rich moist forest loam, scattered fallen pine needles, small twigs, damp moss patches & moisture variation
(function buildGroundForestSoil() {
  const SIZE = 2048;
  const c = createCanvasPBR(SIZE, false);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = y * SIZE + x;
      const nLow = fbm(u, v, 4, 4, 101);
      const nMid = fbm(u, v, 14, 4, 137);
      const nHi = fbm(u, v, 48, 3, 173);
      const clump = fbm(u, v, 24, 3, 199);

      // Base dark moist woodland soil
      let r = 44 + (nLow - 0.5) * 18 + (nMid - 0.5) * 16 + (nHi - 0.5) * 10;
      let g = 34 + (nLow - 0.5) * 14 + (nMid - 0.5) * 12 + (nHi - 0.5) * 8;
      let b = 23 + (nLow - 0.5) * 10 + (nMid - 0.5) * 8 + (nHi - 0.5) * 6;
      let ao = 188 + clump * 48;
      let rough = 196 + (nMid - 0.5) * 34;
      let h = 0.44 + nLow * 0.14 + clump * 0.14 + (nHi - 0.5) * 0.06;

      // Damp humus low pockets (darker, shinier under flashlight)
      const damp = smoothstep(0.54, 0.78, 1.0 - nLow * 0.7 - nMid * 0.3);
      if (damp > 0.02) {
        r *= (1.0 - damp * 0.34);
        g *= (1.0 - damp * 0.32);
        b *= (1.0 - damp * 0.28);
        rough = lerp(rough, 86, damp * 0.85);
        h -= damp * 0.06;
      }

      // Scattered subtle dark moss patches creeping into damp spots
      const moss = smoothstep(0.58, 0.78, fbm(u + 0.17, v + 0.41, 6, 4, 223));
      if (moss > 0.02) {
        r = lerp(r, 34 + (nHi - 0.5) * 10, moss * 0.78);
        g = lerp(g, 56 + (nHi - 0.5) * 14, moss * 0.78);
        b = lerp(b, 24 + (nHi - 0.5) * 8, moss * 0.78);
        rough = lerp(rough, 185, moss * 0.5);
        h += moss * 0.05;
      }

      c.r[idx] = r; c.g[idx] = g; c.b[idx] = b; c.a[idx] = 1;
      c.ao[idx] = ao; c.rough[idx] = rough; c.metal[idx] = 0; c.h[idx] = h;
    }
  }

  // Stamp thousands of fallen pine needles & twigs (tileable wrap)
  const rng = makeRng(4101);
  const drawWrappedSeg = (x0, y0, x1, y1, rad, cr, cg, cb, cao, crough, ch) => {
    const minX = Math.floor(Math.min(x0, x1) - rad - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + rad + 1);
    const minY = Math.floor(Math.min(y0, y1) - rad - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + rad + 1);
    for (let py = minY; py <= maxY; py++) {
      const wy = ((py % SIZE) + SIZE) % SIZE;
      for (let px = minX; px <= maxX; px++) {
        const info = segmentInfo(px, py, x0, y0, x1, y1);
        if (info.dist < rad) {
          const tEdge = 1.0 - info.dist / rad;
          const profile = Math.sqrt(Math.max(0, tEdge));
          const wx = ((px % SIZE) + SIZE) % SIZE;
          const idx = wy * SIZE + wx;
          const alpha = clamp01(tEdge * 2.2);
          c.r[idx] = lerp(c.r[idx], cr * (0.85 + 0.25 * profile), alpha);
          c.g[idx] = lerp(c.g[idx], cg * (0.85 + 0.25 * profile), alpha);
          c.b[idx] = lerp(c.b[idx], cb * (0.85 + 0.25 * profile), alpha);
          c.ao[idx] = lerp(c.ao[idx], cao, alpha * 0.8);
          c.rough[idx] = lerp(c.rough[idx], crough, alpha * 0.8);
          c.h[idx] = Math.max(c.h[idx], ch + profile * 0.08);
        }
      }
    }
  };

  // Pine needles (warm russet brown, dark amber, dead olive-brown)
  for (let i = 0; i < 4200; i++) {
    const x0 = rng() * SIZE;
    const y0 = rng() * SIZE;
    const ang = rng() * Math.PI * 2;
    const len = 14 + rng() * 26;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    const tone = rng();
    const nr = lerp(56, 94, tone);
    const ng = lerp(40, 62, tone);
    const nb = lerp(22, 34, tone);
    drawWrappedSeg(x0, y0, x1, y1, 1.3 + rng() * 0.8, nr, ng, nb, 215, 165, 0.56 + rng() * 0.05);
  }
  // Small broken woodland twigs
  for (let i = 0; i < 190; i++) {
    const x0 = rng() * SIZE;
    const y0 = rng() * SIZE;
    const ang = rng() * Math.PI * 2;
    const len = 35 + rng() * 65;
    const mx = x0 + Math.cos(ang + (rng() - 0.5) * 0.4) * len * 0.5;
    const my = y0 + Math.sin(ang + (rng() - 0.5) * 0.4) * len * 0.5;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    const rad = 2.6 + rng() * 2.4;
    const shade = 0.78 + rng() * 0.35;
    drawWrappedSeg(x0, y0, mx, my, rad, 64 * shade, 48 * shade, 34 * shade, 195, 188, 0.64);
    drawWrappedSeg(mx, my, x1, y1, rad * 0.85, 60 * shade, 45 * shade, 32 * shade, 195, 188, 0.63);
  }

  c.flush('ground_forest_soil', 4.6);
})();

// 2. ground_mud_path (2048x2048 RGB)
// Muddy military camp path, truck tire & boot tracks, embedded gravel pebbles, wet mud ruts
writePBRSet('ground_mud_path', 2048, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 4, 4, 211);
  const nMid = fbm(u, v, 14, 4, 239);
  const nHi = fbm(u, v, 48, 3, 271);

  // Winding dual tire ruts running vertically along V
  const wobble = (Math.sin(v * Math.PI * 2) * 0.025 + Math.sin(v * Math.PI * 4 + 1.2) * 0.012);
  const rutL = Math.abs(u - (0.31 + wobble));
  const rutR = Math.abs(u - (0.69 + wobble));
  const rutDist = Math.min(rutL, rutR);
  const rutDepth = 1.0 - smoothstep(0.035, 0.135, rutDist);
  const rutBank = smoothstep(0.08, 0.145, rutDist) * (1.0 - smoothstep(0.145, 0.22, rutDist));

  // Tire tread chevrons inside ruts
  const treadPhase = (v * 38 + rutDist * 14) % 1;
  const treadLug = smoothstep(0.15, 0.35, treadPhase) * (1.0 - smoothstep(0.55, 0.75, treadPhase));
  const treadMask = rutDepth * (0.45 + 0.55 * nMid);

  // Boot footprints along center strip (u ~ 0.45..0.55)
  const bootCenter = Math.abs(u - (0.50 + wobble * 0.7));
  const bootSlot = ((v * 10) % 1) - 0.5;
  const bootMask = (1.0 - smoothstep(0.018, 0.048, bootCenter)) * (1.0 - smoothstep(0.12, 0.28, Math.abs(bootSlot))) * smoothstep(0.35, 0.7, nMid);

  // Embedded pebbles (voronoi)
  const vor = voronoi(u, v, 28, 293);
  const pebble = smoothstep(0.28, 0.12, vor.d1) * smoothstep(0.42, 0.74, vor.id);

  // Base dark muddy earth
  let r = 56 + (nLow - 0.5) * 18 + (nMid - 0.5) * 16 + (nHi - 0.5) * 10;
  let g = 45 + (nLow - 0.5) * 14 + (nMid - 0.5) * 12 + (nHi - 0.5) * 8;
  let b = 33 + (nLow - 0.5) * 10 + (nMid - 0.5) * 10 + (nHi - 0.5) * 6;
  let ao = 212;
  let rough = 172 + (nMid - 0.5) * 34;
  let h = 0.52 + (nLow - 0.5) * 0.12 + (nMid - 0.5) * 0.08 + (nHi - 0.5) * 0.035;

  // Raised mud banks beside ruts
  h += rutBank * 0.12;
  ao += rutBank * 14;

  // Deep wet mud ruts + tire tread
  if (rutDepth > 0.02) {
    h -= rutDepth * 0.22 - treadMask * treadLug * 0.055;
    ao = lerp(ao, 138, rutDepth * 0.7);
    const wetRut = clamp01(rutDepth * 0.9 + (1.0 - nLow) * 0.35);
    r *= (1.0 - wetRut * 0.38);
    g *= (1.0 - wetRut * 0.38);
    b *= (1.0 - wetRut * 0.34);
    rough = lerp(rough, 46 + (nHi - 0.5) * 14, wetRut * 0.92);
  }

  // Boot imprint
  if (bootMask > 0.05) {
    h -= bootMask * 0.08;
    ao -= bootMask * 38;
    r *= (1.0 - bootMask * 0.22);
    g *= (1.0 - bootMask * 0.22);
    b *= (1.0 - bootMask * 0.20);
    rough = lerp(rough, 82, bootMask * 0.65);
  }

  // Embedded gravel stones
  if (pebble > 0.05) {
    const stoneTone = 68 + vor.id * 34;
    r = lerp(r, stoneTone, pebble * 0.72);
    g = lerp(g, stoneTone * 0.96, pebble * 0.72);
    b = lerp(b, stoneTone * 0.90, pebble * 0.72);
    h += pebble * 0.09;
    rough = lerp(rough, 142, pebble * 0.6);
  }

  // Subtle mossy forest edge along outer borders (u < 0.12 or u > 0.88)
  const edgeZone = Math.max(1.0 - smoothstep(0.02, 0.14, u), smoothstep(0.86, 0.98, u));
  const edgeMoss = edgeZone * smoothstep(0.36, 0.68, nLow * 0.6 + nMid * 0.4);
  if (edgeMoss > 0.02) {
    r = lerp(r, 34, edgeMoss * 0.75);
    g = lerp(g, 54, edgeMoss * 0.75);
    b = lerp(b, 25, edgeMoss * 0.75);
    rough = lerp(rough, 196, edgeMoss * 0.7);
    h += edgeMoss * 0.07;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 5.2);

// 3. ground_moss_floor (2048x2048 RGB)
// Velvety deep woodland moss carpet with soft tufted pillows, humus crevices & damp sheen
writePBRSet('ground_moss_floor', 2048, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 4, 4, 311);
  const nMid = fbm(u, v, 16, 4, 337);
  const nHi = fbm(u, v, 56, 3, 367);
  const vor = voronoi(u + (nLow - 0.5) * 0.06, v + (nMid - 0.5) * 0.04, 14, 389);

  // Soft pillowy moss cushion height
  const cushion = clamp01(1.0 - vor.d1 * 1.15);
  const pillow = Math.pow(cushion, 0.75);
  const crevice = 1.0 - smoothstep(0.0, 0.16, vor.edge);

  // Rich forest moss palette (deep emerald / olive moss — readable under night flashlight!)
  const mossVar = clamp01(nLow * 0.55 + vor.id * 0.45);
  let r = lerp(26, 52, mossVar) + (nHi - 0.5) * 14 + pillow * 10;
  let g = lerp(48, 86, mossVar) + (nHi - 0.5) * 20 + pillow * 18;
  let b = lerp(20, 38, mossVar) + (nHi - 0.5) * 10 + pillow * 6;
  let ao = 170 + pillow * 72 - crevice * 75;
  let rough = 178 + (nHi - 0.5) * 28 - pillow * 18;
  let h = 0.36 + pillow * 0.34 + (nMid - 0.5) * 0.10 + (nHi - 0.5) * 0.07;

  // Dark humus & soil peeking through deep crevices between moss cushions
  const soilCrevice = clamp01(crevice * 0.85 + smoothstep(0.68, 0.86, 1.0 - nLow) * 0.65);
  if (soilCrevice > 0.05) {
    r = lerp(r, 34, soilCrevice * 0.78);
    g = lerp(g, 28, soilCrevice * 0.78);
    b = lerp(b, 19, soilCrevice * 0.78);
    h -= soilCrevice * 0.16;
    rough = lerp(rough, 118, soilCrevice * 0.5);
  }

  // Tiny pale lichen / clover tip accents
  const tipHighlight = smoothstep(0.76, 0.90, nMid * 0.5 + nHi * 0.5) * pillow;
  if (tipHighlight > 0.05) {
    r = lerp(r, 68, tipHighlight * 0.45);
    g = lerp(g, 102, tipHighlight * 0.45);
    b = lerp(b, 46, tipHighlight * 0.45);
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 5.0);

// 4. water_creek_bed (2048x2048 RGB)
// Dark pebbled forest creek water surface (0 emission, ORM roughness ~0.18 => ~46/255)
writePBRSet('water_creek_bed', 2048, false, (u, v, x, y, size, out) => {
  const TAU = Math.PI * 2;
  const nLow = fbm(u, v, 4, 4, 401);
  const nMid = fbm(u, v, 12, 4, 431);
  const nHi = fbm(u, v, 36, 3, 461);

  // Subtle submerged river pebbles beneath dark water
  const vor = voronoi(u, v, 22, 487);
  const pebble = smoothstep(0.42, 0.14, vor.d1);
  const pShade = 0.65 + vor.id * 0.55;

  // Seamless directional creek ripples flowing along V
  const w1 = Math.sin(TAU * (v * 6 + u * 2) + nLow * 3.8) * 0.22;
  const w2 = Math.sin(TAU * (v * 11 - u * 3) + nMid * 3.0) * 0.15;
  const w3 = Math.cos(TAU * (v * 18 + u * 5) + nMid * 2.6) * 0.09;
  const w4 = Math.sin(TAU * (v * 28 - u * 8) + nHi * 2.0) * 0.05;
  const wave = (w1 + w2 + w3 + w4) * 0.5 + 0.5;

  // Deep dark nocturnal creek water tint (0 emission!)
  let r = lerp(16, 28, wave * 0.55 + nLow * 0.45);
  let g = lerp(26, 42, wave * 0.55 + nLow * 0.45);
  let b = lerp(28, 46, wave * 0.55 + nLow * 0.45);

  // Faint submerged river stones visible through shallow eddies
  const shallow = smoothstep(0.35, 0.75, nLow) * 0.42;
  if (pebble > 0.05) {
    r = lerp(r, 38 * pShade, pebble * shallow);
    g = lerp(g, 42 * pShade, pebble * shallow);
    b = lerp(b, 36 * pShade, pebble * shallow);
  }

  // Roughness centered around ~0.18 (byte ~46, range 38..56) for realistic subtle wet creek reflection
  const rough = 46 + (wave - 0.5) * 14 + (nHi - 0.5) * 6;
  const metal = 10 + wave * 8;
  const ao = 205 + wave * 35;
  const h = clamp01(0.5 + (w1 + w2 + w3 + w4) * 0.62 + (nHi - 0.5) * 0.08);

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = metal; out.h = h;
}, 5.5);

// ============================================================================
// PART B: 1024x1024 OPAQUE STRUCTURE & PROP TEXTURES (8 sets)
// ============================================================================

// 5. wood_log_bark (1024x1024 RGB)
// Deeply fissured pine tree bark with scaly vertical plates & crevice moss
writePBRSet('wood_log_bark', 1024, false, (u, v, x, y, size, out) => {
  const warp = (fbm(u, v, 5, 3, 503) - 0.5) * 0.08;
  const nVert = fbm(u + warp, v * 0.25, 16, 4, 521);
  const nPlate = fbm(u + warp * 0.6, v * 0.5, 10, 4, 547);
  const nFine = fbm(u, v, 44, 3, 571);

  // Deep vertical pine bark fissures
  const ridge = Math.abs(Math.sin((u * 11 + warp * 18) * Math.PI));
  const fissure = smoothstep(0.18, 0.62, ridge * 0.65 + nVert * 0.55);
  const plateBreak = smoothstep(0.28, 0.72, nPlate);

  // Warm dark reddish-brown / grey-brown pine bark plates
  let r = lerp(24, 78, fissure) + (plateBreak - 0.5) * 18 + (nFine - 0.5) * 14;
  let g = lerp(18, 56, fissure) + (plateBreak - 0.5) * 12 + (nFine - 0.5) * 10;
  let b = lerp(14, 40, fissure) + (plateBreak - 0.5) * 8 + (nFine - 0.5) * 8;
  let ao = lerp(52, 232, fissure);
  let rough = lerp(225, 188, fissure) + (nFine - 0.5) * 20;
  let h = 0.14 + fissure * 0.64 + plateBreak * 0.14 + (nFine - 0.5) * 0.07;

  // Damp woodland moss clinging to vertical crevices & shaded bark plates
  const mossField = fbm(u * 1.2, v * 0.8, 6, 4, 593);
  const moss = smoothstep(0.56, 0.78, mossField) * (1.0 - fissure * 0.45);
  if (moss > 0.04) {
    r = lerp(r, 34, moss * 0.82);
    g = lerp(g, 62, moss * 0.82);
    b = lerp(b, 26, moss * 0.82);
    rough = lerp(rough, 205, moss * 0.6);
    h += moss * 0.06;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 6.2);

// 6. wood_log_cut (1024x1024 RGB)
// Cut pine log cross-section: concentric growth rings, heartwood/sapwood, radial cracks, outer bark
writePBRSet('wood_log_cut', 1024, false, (u, v, x, y, size, out) => {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const dist = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);

  const nLow = fbm(u, v, 5, 3, 607);
  const nMid = fbm(u, v, 18, 4, 631);
  const nHi = fbm(u, v, 52, 3, 653);

  // Organic slightly irregular log radius
  const barkEdge = 0.435 + (nLow - 0.5) * 0.032 + Math.sin(ang * 5 + 0.7) * 0.008;

  if (dist > barkEdge) {
    // Outer bark rim
    const barkRough = Math.sin(ang * 34 + nMid * 6) * 0.5 + 0.5;
    out.r = 46 + barkRough * 22 + (nHi - 0.5) * 12;
    out.g = 34 + barkRough * 15 + (nHi - 0.5) * 10;
    out.b = 24 + barkRough * 10 + (nHi - 0.5) * 8;
    out.ao = 145 + barkRough * 65;
    out.rough = 222;
    out.metal = 0;
    out.h = 0.58 + barkRough * 0.18;
    return;
  }

  // Concentric growth rings warped organically
  const warpedR = dist + (nLow - 0.5) * 0.028 + (nMid - 0.5) * 0.009;
  const ringWave = Math.sin(warpedR * Math.PI * 52);
  const ringDark = smoothstep(0.35, 0.92, ringWave);

  // Darker damp heartwood center -> lighter warm sapwood outer rings
  const sapMix = smoothstep(0.14, 0.34, warpedR);
  let r = lerp(92, 138, sapMix) - ringDark * 34 + (nMid - 0.5) * 18 + (nHi - 0.5) * 10;
  let g = lerp(66, 106, sapMix) - ringDark * 28 + (nMid - 0.5) * 14 + (nHi - 0.5) * 8;
  let b = lerp(42, 70, sapMix) - ringDark * 20 + (nMid - 0.5) * 10 + (nHi - 0.5) * 6;
  let ao = 220 - ringDark * 26;
  let rough = 186 + (nMid - 0.5) * 26;
  let h = 0.54 - ringDark * 0.04 + (nHi - 0.5) * 0.035;

  // Faint chainsaw kerf sweep marks
  const kerf = Math.sin((u * 0.8 + v * 0.6) * Math.PI * 86 + nLow * 2.0) * 0.5 + 0.5;
  h += (kerf - 0.5) * 0.025;
  r += (kerf - 0.5) * 7;
  g += (kerf - 0.5) * 6;
  b += (kerf - 0.5) * 4;

  // Radial drying checks/cracks from center
  const crackAngles = [0.42, 1.85, -1.12, -2.55, 2.75];
  for (let i = 0; i < crackAngles.length; i++) {
    let da = Math.abs(ang - crackAngles[i]);
    if (da > Math.PI) da = Math.PI * 2 - da;
    const crackLen = 0.24 + (i % 3) * 0.065;
    if (dist < crackLen) {
      const width = 0.0085 * (1.0 - dist / crackLen) + 0.0018;
      const arcDist = da * Math.max(0.02, dist);
      if (arcDist < width) {
        const ct = 1.0 - arcDist / width;
        r *= (1.0 - ct * 0.72);
        g *= (1.0 - ct * 0.72);
        b *= (1.0 - ct * 0.72);
        ao = lerp(ao, 38, ct);
        h -= ct * 0.28;
      }
    }
  }

  // Dark cambium ring right inside bark
  const cambium = smoothstep(barkEdge - 0.024, barkEdge, dist);
  if (cambium > 0.02) {
    r = lerp(r, 52, cambium * 0.7);
    g = lerp(g, 38, cambium * 0.7);
    b = lerp(b, 26, cambium * 0.7);
    ao = lerp(ao, 120, cambium * 0.7);
    h -= cambium * 0.08;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 5.2);

// 7. wood_cabin_planks (1024x1024 RGB)
// Damp dark cabin & bridge timber planks with wood grain, knots, nail heads & mossy seams
writePBRSet('wood_cabin_planks', 1024, false, (u, v, x, y, size, out) => {
  const plankCount = 8;
  const py = v * plankCount;
  const plankIdx = Math.floor(py);
  const pv = py - plankIdx;
  const buttOffset = hash2(plankIdx, 7, 701);
  const pu = (u + buttOffset) % 1;

  const plankTone = hash2(plankIdx, 19, 719);
  const nGrain = fbm(u * 0.35, v * 3.5 + plankIdx * 0.37, 14, 4, 733);
  const nLow = fbm(u, v, 5, 3, 751);
  const nHi = fbm(u, v, 44, 3, 769);

  // Horizontal & vertical seams
  const hSeam = Math.min(pv, 1.0 - pv);
  const vSeam = Math.min(pu, 1.0 - pu);
  const inHSeam = hSeam < 0.045;
  const inVSeam = vSeam < 0.008;

  // Wood fiber grain
  const grainWave = Math.sin((pv * 18 + nGrain * 5.5) * Math.PI) * 0.5 + 0.5;
  let r = 64 + (plankTone - 0.5) * 20 + (grainWave - 0.5) * 18 + (nLow - 0.5) * 14 + (nHi - 0.5) * 8;
  let g = 48 + (plankTone - 0.5) * 14 + (grainWave - 0.5) * 14 + (nLow - 0.5) * 12 + (nHi - 0.5) * 6;
  let b = 34 + (plankTone - 0.5) * 10 + (grainWave - 0.5) * 10 + (nLow - 0.5) * 8 + (nHi - 0.5) * 5;
  let ao = 218;
  let rough = 178 + (grainWave - 0.5) * 24 + (nLow - 0.5) * 28;
  let metal = 0;
  let h = 0.56 + (grainWave - 0.5) * 0.055 + (nHi - 0.5) * 0.025;

  // Damp moisture patches (shinier dark wet wood)
  const damp = smoothstep(0.52, 0.78, nLow);
  if (damp > 0.02) {
    r *= (1.0 - damp * 0.32);
    g *= (1.0 - damp * 0.30);
    b *= (1.0 - damp * 0.26);
    rough = lerp(rough, 92, damp * 0.75);
  }

  // Iron nail heads near plank butt joints
  const nailU = Math.min(Math.abs(pu - 0.032), Math.abs(pu - 0.968));
  const nailV = Math.min(Math.abs(pv - 0.26), Math.abs(pv - 0.74));
  const nailDist = Math.hypot(nailU * plankCount, nailV);
  if (nailDist < 0.068) {
    const nt = 1.0 - nailDist / 0.068;
    r = lerp(r, 48, nt);
    g = lerp(g, 42, nt);
    b = lerp(b, 38, nt);
    rough = lerp(rough, 118, nt);
    metal = lerp(metal, 175, nt);
    h -= nt * 0.08;
    ao = lerp(ao, 110, nt);
  }

  // Seams + creeping damp forest moss in horizontal plank gaps
  if (inHSeam || inVSeam) {
    const st = inHSeam ? (1.0 - hSeam / 0.045) : (1.0 - vSeam / 0.008);
    h -= st * 0.30;
    ao = lerp(ao, 36, st);
    r *= (1.0 - st * 0.65);
    g *= (1.0 - st * 0.65);
    b *= (1.0 - st * 0.65);
    rough = lerp(rough, 215, st);
  } else if (hSeam < 0.14) {
    const seamMoss = (1.0 - (hSeam - 0.045) / 0.095) * smoothstep(0.50, 0.78, fbm(u, v, 7, 3, 787));
    if (seamMoss > 0.05) {
      r = lerp(r, 32, seamMoss * 0.75);
      g = lerp(g, 56, seamMoss * 0.75);
      b = lerp(b, 24, seamMoss * 0.75);
      rough = lerp(rough, 205, seamMoss * 0.6);
    }
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = metal; out.h = h;
}, 5.4);

// 8. metal_rusty_shed (1024x1024 RGB)
// Mossy rusty corrugated metal shed roof/wall
writePBRSet('metal_rusty_shed', 1024, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 5, 4, 809);
  const nMid = fbm(u, v, 16, 4, 827);
  const nHi = fbm(u, v, 48, 3, 853);
  const streak = fbm(u * 4.0, v * 0.5, 10, 3, 877);

  // 14 vertical corrugated sinusoidal ribs
  const rib = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 14);
  let h = 0.22 + rib * 0.58 + (nHi - 0.5) * 0.025;
  let ao = 128 + rib * 116;

  // Horizontal sheet overlap seam at v = 0.50
  const seamDist = Math.abs(v - 0.50);
  if (seamDist < 0.012) {
    const st = 1.0 - seamDist / 0.012;
    h -= st * 0.18;
    ao -= st * 85;
  }

  // Base weathered dark galvanized steel
  let r = 74 + (nLow - 0.5) * 18 + (nMid - 0.5) * 14 + (nHi - 0.5) * 10;
  let g = 78 + (nLow - 0.5) * 18 + (nMid - 0.5) * 14 + (nHi - 0.5) * 10;
  let b = 82 + (nLow - 0.5) * 18 + (nMid - 0.5) * 14 + (nHi - 0.5) * 10;
  let rough = 88 + (nMid - 0.5) * 32;
  let metal = 192;

  // Heavy rust streaks in valleys & around horizontal seam
  const rustMask = clamp01(
    smoothstep(0.42, 0.74, streak * 0.65 + nLow * 0.35 + (1.0 - rib) * 0.22) +
    (seamDist < 0.06 ? (1.0 - seamDist / 0.06) * 0.55 : 0)
  );
  if (rustMask > 0.05) {
    const deepRust = smoothstep(0.45, 0.85, nMid);
    r = lerp(r, lerp(92, 68, deepRust) + (nHi - 0.5) * 16, rustMask * 0.88);
    g = lerp(g, lerp(44, 30, deepRust) + (nHi - 0.5) * 10, rustMask * 0.88);
    b = lerp(b, lerp(24, 18, deepRust) + (nHi - 0.5) * 8, rustMask * 0.88);
    rough = lerp(rough, 198, rustMask * 0.88);
    metal = lerp(metal, 34, rustMask * 0.88);
    h += rustMask * 0.03;
  }

  // Forest moss clinging to damp corrugated valleys
  const mossMask = smoothstep(0.60, 0.82, fbm(u + 0.31, v + 0.19, 6, 4, 887)) * (1.0 - rib * 0.55);
  if (mossMask > 0.04) {
    r = lerp(r, 34, mossMask * 0.84);
    g = lerp(g, 60, mossMask * 0.84);
    b = lerp(b, 26, mossMask * 0.84);
    rough = lerp(rough, 212, mossMask * 0.85);
    metal = lerp(metal, 0, mossMask * 0.9);
    h += mossMask * 0.05;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = metal; out.h = h;
}, 5.8);

// 9. metal_military_olive (1024x1024 RGB)
// Olive-drab military painted steel (generators, trucks, containers) with rivets, scratches & mud grime
writePBRSet('metal_military_olive', 1024, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 5, 4, 907);
  const nMid = fbm(u, v, 16, 4, 929);
  const nHi = fbm(u, v, 48, 3, 953);
  const scratch = fbm(u * 4.0, v * 1.4, 24, 3, 977);

  // 2x2 armored military steel panels
  const px = (u * 2) % 1;
  const py = (v * 2) % 1;
  const edge = Math.min(px, 1 - px, py, 1 - py);

  // Base military olive drab paint
  let r = 58 + (nLow - 0.5) * 14 + (nMid - 0.5) * 12 + (nHi - 0.5) * 8;
  let g = 66 + (nLow - 0.5) * 14 + (nMid - 0.5) * 12 + (nHi - 0.5) * 8;
  let b = 44 + (nLow - 0.5) * 10 + (nMid - 0.5) * 10 + (nHi - 0.5) * 6;
  let ao = 224;
  let rough = 122 + (nMid - 0.5) * 28;
  let metal = 135;
  let h = 0.55 + (nHi - 0.5) * 0.022;

  // Rivets along panel borders
  const rivMargin = 0.048;
  const onHLine = Math.min(Math.abs(py - rivMargin), Math.abs(py - (1 - rivMargin))) < 0.016;
  const onVLine = Math.min(Math.abs(px - rivMargin), Math.abs(px - (1 - rivMargin))) < 0.016;
  if (onHLine || onVLine) {
    const rPhaseU = ((px * 10) % 1) - 0.5;
    const rPhaseV = ((py * 10) % 1) - 0.5;
    const rd = onHLine ? Math.hypot(rPhaseU / 10, Math.min(Math.abs(py - rivMargin), Math.abs(py - (1 - rivMargin))))
                       : Math.hypot(Math.min(Math.abs(px - rivMargin), Math.abs(px - (1 - rivMargin))), rPhaseV / 10);
    if (rd < 0.014) {
      const dome = Math.sqrt(Math.max(0, 1.0 - (rd / 0.014) ** 2));
      h += dome * 0.16;
      ao = 165 + dome * 65;
      r += dome * 12; g += dome * 12; b += dome * 10;
      rough = 88;
      metal = 185;
    }
  }

  // Panel seam grooves + chipped bare steel edges
  if (edge < 0.012) {
    const st = 1.0 - edge / 0.012;
    h -= st * 0.22;
    ao = lerp(ao, 48, st);
    r *= (1.0 - st * 0.55);
    g *= (1.0 - st * 0.55);
    b *= (1.0 - st * 0.55);
  } else if (edge < 0.028) {
    const chip = (1.0 - (edge - 0.012) / 0.016) * smoothstep(0.45, 0.72, nMid);
    r = lerp(r, 114, chip * 0.72);
    g = lerp(g, 118, chip * 0.72);
    b = lerp(b, 120, chip * 0.72);
    rough = lerp(rough, 58, chip * 0.8);
    metal = lerp(metal, 220, chip * 0.85);
  }

  // Scratches & bare steel wear
  const bare = smoothstep(0.76, 0.88, scratch);
  if (bare > 0.05) {
    r = lerp(r, 116, bare * 0.7);
    g = lerp(g, 120, bare * 0.7);
    b = lerp(b, 122, bare * 0.7);
    rough = lerp(rough, 60, bare * 0.8);
    metal = lerp(metal, 218, bare * 0.8);
  }

  // Mud / forest grime splatter near bottom
  const mudSplash = clamp01((v - 0.62) / 0.38) * smoothstep(0.36, 0.72, nLow * 0.55 + nMid * 0.45);
  if (mudSplash > 0.04) {
    r = lerp(r, 48, mudSplash * 0.78);
    g = lerp(g, 38, mudSplash * 0.78);
    b = lerp(b, 27, mudSplash * 0.78);
    rough = lerp(rough, 186, mudSplash * 0.8);
    metal = lerp(metal, 15, mudSplash * 0.85);
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = metal; out.h = h;
}, 5.2);

// 10. rock_mossy_granite (1024x1024 RGB)
// Dark fractured forest granite with sharp strata crevices & lush green woodland moss
writePBRSet('rock_mossy_granite', 1024, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 4, 4, 1009);
  const nMid = fbm(u, v, 14, 4, 1031);
  const nHi = fbm(u, v, 48, 3, 1061);
  const vor = voronoi(u + (nLow - 0.5) * 0.08, v + (nMid - 0.5) * 0.06, 9, 1087);

  // Angular fractured granite blocks & cracks
  const crack = 1.0 - smoothstep(0.0, 0.11, vor.edge);
  const facet = 0.75 + vor.id * 0.45;
  const strata = Math.sin((v * 9 + u * 2 + nLow * 2.5) * Math.PI) * 0.5 + 0.5;

  // Dark granite grey-slate with mineral speckle
  let r = (58 * facet + strata * 14 + (nMid - 0.5) * 18 + (nHi - 0.5) * 20);
  let g = (60 * facet + strata * 14 + (nMid - 0.5) * 18 + (nHi - 0.5) * 20);
  let b = (62 * facet + strata * 14 + (nMid - 0.5) * 18 + (nHi - 0.5) * 20);
  let ao = 216 - crack * 145;
  let rough = 186 + (nMid - 0.5) * 34;
  let h = 0.52 + (vor.id - 0.5) * 0.24 + (strata - 0.5) * 0.10 + (nMid - 0.5) * 0.10 - crack * 0.32;

  if (crack > 0.1) {
    r *= (1.0 - crack * 0.65);
    g *= (1.0 - crack * 0.65);
    b *= (1.0 - crack * 0.65);
  }

  // Lush damp forest moss clinging to upper shelves & rock cracks
  const mossField = fbm(u + 0.22, v + 0.37, 5, 4, 1103);
  const moss = smoothstep(0.48, 0.72, mossField * 0.72 + crack * 0.25 + (1.0 - v) * 0.18);
  if (moss > 0.03) {
    r = lerp(r, 32 + (nHi - 0.5) * 10, moss * 0.85);
    g = lerp(g, 64 + (nHi - 0.5) * 16, moss * 0.85);
    b = lerp(b, 26 + (nHi - 0.5) * 8, moss * 0.85);
    rough = lerp(rough, 206, moss * 0.75);
    h += moss * 0.07;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 6.2);

// 11. fabric_sandbag_mud (1024x1024 RGB)
// Coarse woven burlap military sandbags with heavy mud splatters & stitched seams
writePBRSet('fabric_sandbag_mud', 1024, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 5, 4, 1201);
  const nMid = fbm(u, v, 16, 4, 1223);
  const nHi = fbm(u, v, 44, 3, 1249);

  // Coarse burlap warp & weft weave
  const warp = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 96 + (nMid - 0.5) * 1.4);
  const weft = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 96 + (nMid - 0.5) * 1.4);
  const weave = warp * 0.52 + weft * 0.48;
  const checker = ((Math.floor(u * 96) + Math.floor(v * 96)) & 1) ? warp : weft;

  // Soft pillowy sandbag folds
  const fold = Math.sin((u * 3 + v * 2 + nLow * 1.6) * Math.PI) * 0.5 + 0.5;

  // Warm khaki/tan woven burlap
  let r = 104 + (nLow - 0.5) * 20 + (checker - 0.5) * 26 + (nHi - 0.5) * 10;
  let g = 90 + (nLow - 0.5) * 18 + (checker - 0.5) * 22 + (nHi - 0.5) * 8;
  let b = 66 + (nLow - 0.5) * 14 + (checker - 0.5) * 18 + (nHi - 0.5) * 6;
  let ao = 185 + weave * 45 - (1.0 - fold) * 32;
  let rough = 228 + (nHi - 0.5) * 16;
  let h = 0.48 + fold * 0.14 + checker * 0.11;

  // Stitched seam line near v = 0.08 and v = 0.92
  const seamDist = Math.min(Math.abs(v - 0.08), Math.abs(v - 0.92));
  if (seamDist < 0.018) {
    const stitch = Math.sin(u * Math.PI * 2 * 44) > 0.1;
    const st = 1.0 - seamDist / 0.018;
    h -= st * (stitch ? 0.02 : 0.12);
    ao -= st * 55;
    r *= (1.0 - st * 0.25);
    g *= (1.0 - st * 0.25);
    b *= (1.0 - st * 0.25);
  }

  // Heavy dark forest mud splatters & damp bottom staining
  const mud = smoothstep(0.46, 0.74, fbm(u + 0.14, v + 0.28, 6, 4, 1277) * 0.75 + v * 0.32);
  if (mud > 0.04) {
    r = lerp(r, 42 + (nHi - 0.5) * 10, mud * 0.85);
    g = lerp(g, 33 + (nHi - 0.5) * 8, mud * 0.85);
    b = lerp(b, 23 + (nHi - 0.5) * 6, mud * 0.85);
    rough = lerp(rough, 118, mud * 0.78);
    h += mud * 0.04;
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = 0; out.h = h;
}, 4.8);

// 12. prop_crate_olive (1024x1024 RGB)
// Military olive wooden/metal reinforced supply crate with corner brackets, battens & stencil
writePBRSet('prop_crate_olive', 1024, false, (u, v, x, y, size, out) => {
  const nLow = fbm(u, v, 5, 4, 1301);
  const nMid = fbm(u, v, 16, 4, 1327);
  const nHi = fbm(u, v, 48, 3, 1361);

  const edgeU = Math.min(u, 1 - u);
  const edgeV = Math.min(v, 1 - v);
  const isCornerBracket = edgeU < 0.12 && edgeV < 0.12;
  const isFrame = edgeU < 0.085 || edgeV < 0.085;
  const isMidBrace = Math.abs(u - 0.5) < 0.032 && edgeV >= 0.085;

  // Inner horizontal crate slats (5 planks)
  const slatV = ((v - 0.085) / 0.83) * 5;
  const slatF = ((slatV % 1) + 1) % 1;
  const inSlatSeam = !isFrame && !isMidBrace && Math.min(slatF, 1 - slatF) < 0.035;

  // Wood grain direction (horizontal on slats/top-bottom frame, vertical on side frames/mid brace)
  const isVertWood = (edgeU < 0.085 && edgeV >= 0.085) || isMidBrace;
  const gCoordA = isVertWood ? v * 0.4 : u * 0.4;
  const gCoordB = isVertWood ? u * 4.0 : v * 4.0;
  const grain = Math.sin((gCoordB * 14 + fbm(gCoordA, gCoordB, 10, 3, 1381) * 5) * Math.PI) * 0.5 + 0.5;

  // Base military olive painted wood
  let r = 60 + (grain - 0.5) * 14 + (nLow - 0.5) * 14 + (nHi - 0.5) * 8;
  let g = 68 + (grain - 0.5) * 15 + (nLow - 0.5) * 14 + (nHi - 0.5) * 8;
  let b = 45 + (grain - 0.5) * 10 + (nLow - 0.5) * 10 + (nHi - 0.5) * 6;
  let ao = isFrame || isMidBrace ? 226 : 196;
  let rough = 166 + (nMid - 0.5) * 28;
  let metal = 0;
  let h = (isFrame || isMidBrace ? 0.72 : 0.48) + (grain - 0.5) * 0.04;

  // Recessed border shadow around frame & mid-brace
  if (!isFrame && (edgeU < 0.105 || edgeV < 0.105)) {
    const sh = 1.0 - (Math.min(edgeU, edgeV) - 0.085) / 0.02;
    ao -= sh * 65;
    r *= (1.0 - sh * 0.25); g *= (1.0 - sh * 0.25); b *= (1.0 - sh * 0.25);
  }
  if (inSlatSeam) {
    h -= 0.16;
    ao = 54;
    r *= 0.42; g *= 0.42; b *= 0.42;
  }

  // Dark steel corner reinforcement brackets + rivets
  if (isCornerBracket) {
    r = 46 + (nMid - 0.5) * 14;
    g = 48 + (nMid - 0.5) * 14;
    b = 46 + (nMid - 0.5) * 14;
    rough = 88 + (nMid - 0.5) * 26;
    metal = 200;
    h = 0.80 + (nHi - 0.5) * 0.02;
    ao = 215;
    // Rivet near corner
    const rd = Math.hypot(edgeU - 0.055, edgeV - 0.055);
    if (rd < 0.018) {
      h += (1.0 - rd / 0.018) * 0.10;
      r += 18; g += 18; b += 16;
    }
  }

  // Faded non-emissive stencil ("AMMO-42") in upper-left panel
  if (!isFrame && !isMidBrace && u > 0.13 && u < 0.45 && v > 0.16 && v < 0.30) {
    if (sampleStencilText('AMMO-42', u, v, 0.14, 0.18, 0.036, 0.092, 0.008)) {
      const wear = smoothstep(0.22, 0.58, nMid);
      r = lerp(r, 138, wear * 0.78);
      g = lerp(g, 134, wear * 0.78);
      b = lerp(b, 108, wear * 0.78);
      rough = lerp(rough, 185, wear * 0.6);
    }
  }

  // Edge scuffing & mud grime at bottom
  const mud = clamp01((v - 0.76) / 0.24) * smoothstep(0.35, 0.72, nLow * 0.6 + nMid * 0.4);
  if (mud > 0.05) {
    r = lerp(r, 46, mud * 0.75);
    g = lerp(g, 36, mud * 0.75);
    b = lerp(b, 24, mud * 0.75);
    rough = lerp(rough, 190, mud * 0.7);
    metal = lerp(metal, 0, mud * 0.8);
  }

  out.r = r; out.g = g; out.b = b; out.ao = ao; out.rough = rough; out.metal = metal; out.h = h;
}, 5.4);

// ============================================================================
// PART C: 1024x1024 ALPHA-MASKED FOLIAGE & GROUND DECALS (7 sets, RGBA BC7)
// ============================================================================

// Helper: draw tapered curved branch/stem on canvas
function paintBranch(c, pts, rStart, rEnd, col0, col1, roughVal, zBase, barkNoiseSeed) {
  const S = c.size;
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    const x0 = pts[i][0] * S, y0 = pts[i][1] * S;
    const x1 = pts[i + 1][0] * S, y1 = pts[i + 1][1] * S;
    const rad0 = lerp(rStart, rEnd, t0) * S;
    const rad1 = lerp(rStart, rEnd, t1) * S;
    const maxR = Math.max(rad0, rad1) + 2;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - maxR));
    const maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1) + maxR));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - maxR));
    const maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1) + maxR));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const info = segmentInfo(px, py, x0, y0, x1, y1);
        const rad = lerp(rad0, rad1, info.t);
        if (info.dist < rad) {
          const edge = 1.0 - info.dist / rad;
          const cyl = Math.sqrt(Math.max(0, 1.0 - (info.dist / rad) ** 2));
          const alpha = smoothstep(0.0, 0.22, edge);
          const tt = lerp(t0, t1, info.t);
          const bn = barkNoiseSeed ? (fbm(px / S, py / S, 24, 3, barkNoiseSeed) - 0.5) * 18 : 0;
          const pr = lerp(col0[0], col1[0], tt) * (0.68 + 0.42 * cyl) + bn;
          const pg = lerp(col0[1], col1[1], tt) * (0.68 + 0.42 * cyl) + bn * 0.8;
          const pb = lerp(col0[2], col1[2], tt) * (0.68 + 0.42 * cyl) + bn * 0.6;
          c.plot(px, py, pr, pg, pb, alpha, 150 + cyl * 88, roughVal, 0, 0.52 + cyl * 0.28, zBase + cyl * 0.1);
        }
      }
    }
  }
}

// 13. foliage_pine_needles (1024x1024 RGBA)
// Dense dark pine boughs & overlapping needle clusters with crisp alpha silhouette
(function buildFoliagePineNeedles() {
  const SIZE = 1024;
  const c = createCanvasPBR(SIZE, true);
  const rng = makeRng(1401);

  // Build 7 main pine boughs radiating from bottom-center & sides for rich canopy fill
  const boughs = [
    { x0: 0.50, y0: 0.94, ang: -Math.PI * 0.50, len: 0.82, spread: 0.28 },
    { x0: 0.48, y0: 0.88, ang: -Math.PI * 0.68, len: 0.64, spread: 0.24 },
    { x0: 0.52, y0: 0.88, ang: -Math.PI * 0.32, len: 0.64, spread: 0.24 },
    { x0: 0.50, y0: 0.68, ang: -Math.PI * 0.78, len: 0.50, spread: 0.22 },
    { x0: 0.50, y0: 0.68, ang: -Math.PI * 0.22, len: 0.50, spread: 0.22 },
    { x0: 0.50, y0: 0.46, ang: -Math.PI * 0.66, len: 0.38, spread: 0.20 },
    { x0: 0.50, y0: 0.46, ang: -Math.PI * 0.34, len: 0.38, spread: 0.20 }
  ];

  // Helper to paint a single crisp pine needle
  const paintNeedle = (x0, y0, ang, len, width, tone, zVal) => {
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - width - 2));
    const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(x0, x1) + width + 2));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - width - 2));
    const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(y0, y1) + width + 2));

    // Rich dark forest pine greens (with slight lighter tip variation for readability)
    const r0 = lerp(18, 34, tone), g0 = lerp(42, 72, tone), b0 = lerp(22, 34, tone);
    const r1 = lerp(30, 52, tone), g1 = lerp(66, 102, tone), b1 = lerp(28, 42, tone);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const info = segmentInfo(px, py, x0, y0, x1, y1);
        const w = width * (1.0 - info.t * 0.72);
        if (info.dist < w) {
          const edge = 1.0 - info.dist / w;
          const alpha = smoothstep(0.0, 0.35, edge);
          const ridge = Math.sqrt(Math.max(0, edge));
          const pr = lerp(r0, r1, info.t) * (0.82 + 0.28 * ridge);
          const pg = lerp(g0, g1, info.t) * (0.82 + 0.28 * ridge);
          const pb = lerp(b0, b1, info.t) * (0.82 + 0.28 * ridge);
          c.plot(px, py, pr, pg, pb, alpha, 170 + info.t * 60, 128 + (1 - ridge) * 35, 0, 0.54 + ridge * 0.16, zVal + info.t * 0.05);
        }
      }
    }
  };

  for (let bIdx = 0; bIdx < boughs.length; bIdx++) {
    const b = boughs[bIdx];
    const pts = [];
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const curve = Math.sin(t * Math.PI) * (bIdx % 2 === 0 ? 0.025 : -0.025);
      pts.push([
        b.x0 + Math.cos(b.ang) * b.len * t - Math.sin(b.ang) * curve,
        b.y0 + Math.sin(b.ang) * b.len * t + Math.cos(b.ang) * curve
      ]);
    }
    // Woody pine twig
    paintBranch(c, pts, 0.009, 0.003, [58, 42, 28], [48, 38, 24], 195, 0.2 + bIdx * 0.02, 1423);

    // Dense needles sprouting along both sides of the twig
    const needleCount = Math.floor(b.len * 380);
    for (let i = 0; i < needleCount; i++) {
      const t = 0.04 + (i / needleCount) * 0.95;
      const idxF = t * steps;
      const i0 = Math.min(steps - 1, Math.floor(idxF));
      const f = idxF - i0;
      const bx = lerp(pts[i0][0], pts[i0 + 1][0], f) * SIZE;
      const by = lerp(pts[i0][1], pts[i0 + 1][1], f) * SIZE;
      const side = (i % 2 === 0) ? 1 : -1;
      const fanAng = b.ang + side * (0.34 + rng() * 0.72) + (rng() - 0.5) * 0.25;
      const nLen = (54 + rng() * 62) * (1.0 - t * 0.30);
      const nWid = 3.0 + rng() * 1.6;
      const zLayer = 0.25 + rng() * 0.65;
      paintNeedle(bx, by, fanAng, nLen, nWid, rng(), zLayer);
    }
  }

  c.flush('foliage_pine_needles', 4.6);
})();

// 14. foliage_fern_bush (1024x1024 RGBA)
// Lush arching woodland fern fronds with crisp serrated leaflets (pinnae) & central rachis
(function buildFoliageFernBush() {
  const SIZE = 1024;
  const c = createCanvasPBR(SIZE, true);
  const rng = makeRng(1501);

  const fronds = [
    { x0: 0.50, y0: 0.95, ang: -Math.PI * 0.50, len: 0.86, bend: 0.03, maxW: 0.17, z: 0.50 },
    { x0: 0.49, y0: 0.95, ang: -Math.PI * 0.65, len: 0.78, bend: -0.06, maxW: 0.15, z: 0.40 },
    { x0: 0.51, y0: 0.95, ang: -Math.PI * 0.35, len: 0.78, bend: 0.06, maxW: 0.15, z: 0.42 },
    { x0: 0.48, y0: 0.94, ang: -Math.PI * 0.80, len: 0.62, bend: -0.08, maxW: 0.125, z: 0.30 },
    { x0: 0.52, y0: 0.94, ang: -Math.PI * 0.20, len: 0.62, bend: 0.08, maxW: 0.125, z: 0.32 },
    { x0: 0.50, y0: 0.94, ang: -Math.PI * 0.57, len: 0.68, bend: -0.04, maxW: 0.135, z: 0.62 },
    { x0: 0.50, y0: 0.94, ang: -Math.PI * 0.43, len: 0.68, bend: 0.04, maxW: 0.135, z: 0.64 }
  ];

  // Paint one elongated serrated fern pinna (leaflet)
  const paintPinna = (x0, y0, ang, len, halfW, tone, zVal) => {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const pad = halfW + 3;
    const x1 = x0 + cosA * len, y1 = y0 + sinA * len;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
    const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(x0, x1) + pad));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
    const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(y0, y1) + pad));

    const baseR = lerp(24, 42, tone);
    const baseG = lerp(64, 102, tone);
    const baseB = lerp(22, 36, tone);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - x0, dy = py - y0;
        const along = (dx * cosA + dy * sinA) / len;
        if (along < -0.02 || along > 1.02) continue;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        // Classic fern leaflet silhouette: swells near base, serrated lobes along edge, tapers to pointed tip
        const env = Math.sin(clamp01(along) * Math.PI * 0.88 + 0.12) * (1.0 - along * 0.35);
        const serrate = 0.80 + 0.20 * Math.abs(Math.sin(along * Math.PI * 7.0));
        const localW = halfW * env * serrate;
        if (perp < localW) {
          const edge = 1.0 - perp / Math.max(0.5, localW);
          const alpha = smoothstep(0.0, 0.25, edge);
          const midrib = 1.0 - smoothstep(0.0, 0.18, perp / Math.max(1.0, halfW));
          const tipBright = along * 0.22;
          const pr = baseR * (0.85 + tipBright) + midrib * 16;
          const pg = baseG * (0.85 + tipBright) + midrib * 24;
          const pb = baseB * (0.85 + tipBright) + midrib * 8;
          const hVal = 0.56 + edge * 0.14 + midrib * 0.08;
          c.plot(px, py, pr, pg, pb, alpha, 175 + edge * 55, 118 - midrib * 18, 0, hVal, zVal + along * 0.02);
        }
      }
    }
  };

  for (let fi = 0; fi < fronds.length; fi++) {
    const f = fronds[fi];
    const pts = [];
    const steps = 16;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const bendOff = Math.sin(t * Math.PI * 0.9) * f.bend;
      pts.push([
        f.x0 + Math.cos(f.ang) * f.len * t - Math.sin(f.ang) * bendOff,
        f.y0 + Math.sin(f.ang) * f.len * t + Math.cos(f.ang) * bendOff
      ]);
    }
    paintBranch(c, pts, 0.0055, 0.0014, [38, 62, 26], [48, 86, 30], 145, f.z - 0.01, 0);

    // Pairs of opposing pinnae along the frond rachis
    const pairs = 20;
    for (let p = 1; p <= pairs; p++) {
      const t = 0.10 + (p / (pairs + 1)) * 0.86;
      const idxF = t * steps;
      const i0 = Math.min(steps - 1, Math.floor(idxF));
      const frac = idxF - i0;
      const bx = lerp(pts[i0][0], pts[i0 + 1][0], frac) * SIZE;
      const by = lerp(pts[i0][1], pts[i0 + 1][1], frac) * SIZE;
      const tx = pts[i0 + 1][0] - pts[i0][0];
      const ty = pts[i0 + 1][1] - pts[i0][1];
      const tang = Math.atan2(ty, tx);

      const frondProfile = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const pinnaLen = f.maxW * SIZE * (0.28 + 0.72 * frondProfile);
      const pinnaW = Math.max(5.5, pinnaLen * 0.21);
      const tone = 0.25 + rng() * 0.7;

      paintPinna(bx, by, tang - 1.12 + t * 0.35, pinnaLen, pinnaW, tone, f.z + 0.01);
      paintPinna(bx, by, tang + 1.12 - t * 0.35, pinnaLen, pinnaW, tone * 0.92 + 0.06, f.z + 0.01);
    }
  }

  c.flush('foliage_fern_bush', 4.8);
})();

// 15. decal_vines_ivy (1024x1024 RGBA)
// Thick creeping woodland ivy vines & crisp 3-lobed heart ivy leaves with pale veins!
(function buildDecalVinesIvy() {
  const SIZE = 1024;
  const c = createCanvasPBR(SIZE, true);
  const rng = makeRng(1601);

  // Paint a crisp 3-lobed English ivy leaf with pale veins & waxy sheen
  const paintIvyLeaf = (cx, cy, ang, leafSize, tone, zVal) => {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const pad = leafSize * 1.15;
    const minX = Math.max(0, Math.floor(cx - pad));
    const maxX = Math.min(SIZE - 1, Math.ceil(cx + pad));
    const minY = Math.max(0, Math.floor(cy - pad));
    const maxY = Math.min(SIZE - 1, Math.ceil(cy + pad));

    const rBase = lerp(24, 42, tone);
    const gBase = lerp(66, 108, tone);
    const bBase = lerp(24, 40, tone);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx, dy = py - cy;
        // Local leaf coords: lx forward along leaf axis [-0.35..1.0], ly sideways
        const lx = (dx * cosA + dy * sinA) / leafSize;
        const ly = (-dx * sinA + dy * cosA) / leafSize;
        if (lx < -0.45 || lx > 1.05 || Math.abs(ly) > 0.95) continue;

        // Polar shape for broad, lush 3-lobed palmate English ivy leaf (full heart body + 3 pointed lobes)
        const rad = Math.hypot(lx - 0.14, ly);
        const theta = Math.atan2(ly, lx - 0.14);
        const absT = Math.abs(theta);

        // Broad filled body + 3 pronounced lobes + shallow heart notch at stem (absT ~ PI)
        const heartNotch = 1.0 - 0.55 * Math.exp(-Math.pow((Math.PI - absT) / 0.35, 2.0));
        const body = 0.48 * heartNotch;
        const mainLobe = 0.46 * Math.exp(-Math.pow(absT / 0.55, 2.0));
        const sideLobe = 0.36 * Math.exp(-Math.pow((absT - 1.15) / 0.48, 2.0));
        const maxR = Math.max(0.16, body + mainLobe + sideLobe);

        if (rad < maxR) {
          const edge = 1.0 - rad / maxR;
          const alpha = smoothstep(0.0, 0.16, edge);

          // Distinct pale-green central & side lobe veins (makes ivy immediately recognizable!)
          const dMainVein = (lx > -0.15 && lx < 0.78) ? Math.abs(ly) : 99;
          const dSideVein = (lx > -0.10 && lx < 0.45) ? Math.abs(Math.abs(ly) - (lx + 0.12) * 1.15) * 0.7 : 99;
          const vein = clamp01(
            (1.0 - smoothstep(0.012, 0.042, dMainVein)) +
            (1.0 - smoothstep(0.010, 0.034, dSideVein)) * 0.85
          );

          const curl = Math.sin(edge * Math.PI * 0.5);
          let pr = rBase * (0.82 + 0.28 * curl) + vein * 36;
          let pg = gBase * (0.82 + 0.28 * curl) + vein * 48;
          let pb = bBase * (0.82 + 0.28 * curl) + vein * 22;

          // Subtle darker leaf border shadow
          const borderDark = smoothstep(0.0, 0.22, edge);
          pr *= (0.72 + 0.28 * borderDark);
          pg *= (0.72 + 0.28 * borderDark);
          pb *= (0.72 + 0.28 * borderDark);

          // Waxy glossy ivy leaf roughness (~92) so flashlights catch each leaf!
          const roughVal = lerp(94, 128, vein);
          const hVal = 0.56 + curl * 0.18 + vein * 0.06;
          c.plot(px, py, pr, pg, pb, alpha, 175 + curl * 65, roughVal, 0, hVal, zVal + curl * 0.03);
        }
      }
    }
  };

  // 5 thick creeping gnarled ivy vine runners snaking across the ground decal
  const vineDefs = [
    { x0: 0.08, y0: 0.78, x1: 0.92, y1: 0.22, amp: 0.09, freq: 2.2, r0: 0.013, r1: 0.006, z: 0.30 },
    { x0: 0.12, y0: 0.28, x1: 0.88, y1: 0.76, amp: -0.08, freq: 2.0, r0: 0.012, r1: 0.005, z: 0.38 },
    { x0: 0.24, y0: 0.90, x1: 0.74, y1: 0.10, amp: 0.07, freq: 2.5, r0: 0.010, r1: 0.0045, z: 0.46 },
    { x0: 0.14, y0: 0.54, x1: 0.86, y1: 0.48, amp: -0.06, freq: 2.8, r0: 0.009, r1: 0.004, z: 0.54 },
    { x0: 0.34, y0: 0.14, x1: 0.66, y1: 0.86, amp: 0.055, freq: 2.3, r0: 0.0085, r1: 0.004, z: 0.62 }
  ];

  for (let vi = 0; vi < vineDefs.length; vi++) {
    const vd = vineDefs[vi];
    const pts = [];
    const steps = 24;
    const dx = vd.x1 - vd.x0, dy = vd.y1 - vd.y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wave = Math.sin(t * Math.PI * vd.freq + vi * 1.1) * vd.amp * Math.sin(t * Math.PI);
      pts.push([vd.x0 + dx * t + nx * wave, vd.y0 + dy * t + ny * wave]);
    }
    // Woody-green creeping vine stem
    paintBranch(c, pts, vd.r0, vd.r1, [46, 52, 28], [36, 58, 26], 162, vd.z, 1621 + vi * 13);

    // Sprout dense alternating lush ivy leaves along both sides of the vine
    const leafCount = 24;
    for (let li = 1; li < leafCount; li++) {
      const t = 0.05 + (li / leafCount) * 0.90;
      const idxF = t * steps;
      const i0 = Math.min(steps - 1, Math.floor(idxF));
      const frac = idxF - i0;
      const vx = lerp(pts[i0][0], pts[i0 + 1][0], frac) * SIZE;
      const vy = lerp(pts[i0][1], pts[i0 + 1][1], frac) * SIZE;
      const tx = pts[i0 + 1][0] - pts[i0][0];
      const ty = pts[i0 + 1][1] - pts[i0][1];
      const tang = Math.atan2(ty, tx);

      const side = (li % 2 === 0) ? 1 : -1;
      const leafAng = tang + side * (0.72 + (rng() - 0.5) * 0.42);
      const petioleLen = 12 + rng() * 14;
      const lx = vx + Math.cos(leafAng) * petioleLen;
      const ly = vy + Math.sin(leafAng) * petioleLen;
      const leafSize = (54 + rng() * 30) * (1.0 - Math.abs(t - 0.5) * 0.30);

      // Tiny petiole stem connecting vine to leaf
      paintBranch(c, [[vx / SIZE, vy / SIZE], [lx / SIZE, ly / SIZE]], 0.0032, 0.0020, [42, 58, 26], [38, 68, 28], 150, vd.z + 0.01, 0);
      paintIvyLeaf(lx, ly, leafAng + (rng() - 0.5) * 0.28, leafSize, rng(), vd.z + 0.02 + rng() * 0.04);
    }
  }

  c.flush('decal_vines_ivy', 5.2);
})();

// 16. decal_moss_patch (1024x1024 RGBA)
// Organic irregular tufted forest moss patch with natural feathered alpha edge
writePBRSet('decal_moss_patch', 1024, true, (u, v, x, y, size, out) => {
  const dx = u - 0.5, dy = v - 0.5;
  const dist = Math.hypot(dx, dy);
  const nLow = fbm(u, v, 4, 4, 1709);
  const nMid = fbm(u, v, 14, 4, 1733);
  const nHi = fbm(u, v, 46, 3, 1759);
  const vor = voronoi(u, v, 16, 1783);

  // Organic irregular blob radius fading cleanly to 0 before edges
  const blobField = (0.44 - dist) + (nLow - 0.5) * 0.24 + (nMid - 0.5) * 0.09;
  const alpha = smoothstep(0.0, 0.14, blobField) * (1.0 - smoothstep(0.42, 0.49, dist));

  const cushion = clamp01(1.0 - vor.d1 * 1.15);
  const mossVar = clamp01(nLow * 0.5 + vor.id * 0.5);

  out.r = lerp(26, 54, mossVar) + cushion * 12 + (nHi - 0.5) * 14;
  out.g = lerp(52, 92, mossVar) + cushion * 20 + (nHi - 0.5) * 20;
  out.b = lerp(22, 40, mossVar) + cushion * 6 + (nHi - 0.5) * 10;
  out.a = alpha * 255;
  out.ao = 165 + cushion * 75;
  out.rough = 182 + (nHi - 0.5) * 24 - cushion * 18;
  out.metal = 0;
  out.h = 0.5 + alpha * (0.14 + cushion * 0.22 + (nHi - 0.5) * 0.06);
}, 5.0);

// 17. decal_fallen_leaves (1024x1024 RGBA)
// Scattered fallen woodland leaves, scaled pine cones & fine twigs (alpha edge)
(function buildDecalFallenLeaves() {
  const SIZE = 1024;
  const c = createCanvasPBR(SIZE, true);
  const rng = makeRng(1801);

  // Paint one fallen broadleaf leaf (russet brown, dark ochre, weathered bronze, damp umber)
  const paintFallenLeaf = (cx, cy, ang, len, wid, paletteIdx, zVal) => {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const pad = Math.max(len, wid) + 3;
    const minX = Math.max(0, Math.floor(cx - pad));
    const maxX = Math.min(SIZE - 1, Math.ceil(cx + pad));
    const minY = Math.max(0, Math.floor(cy - pad));
    const maxY = Math.min(SIZE - 1, Math.ceil(cy + pad));

    const palettes = [
      [88, 52, 26],   // russet brown
      [104, 70, 30],  // muted forest ochre
      [68, 44, 24],   // dark damp umber
      [78, 58, 28],   // weathered bronze
      [56, 54, 28]    // dead olive-brown
    ];
    const col = palettes[paletteIdx % palettes.length];
    const shade = 0.82 + rng() * 0.34;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx, dy = py - cy;
        const lx = (dx * cosA + dy * sinA) / len;
        const ly = (-dx * sinA + dy * cosA) / wid;
        if (lx < -0.52 || lx > 0.52 || Math.abs(ly) > 0.55) continue;

        const t = lx + 0.5; // 0..1
        const halfW = Math.sin(t * Math.PI) * (0.48 + 0.08 * Math.sin(t * Math.PI * 5));
        const absY = Math.abs(ly);
        if (absY < halfW) {
          const edge = 1.0 - absY / Math.max(0.01, halfW);
          const alpha = smoothstep(0.0, 0.22, edge);
          const vein = 1.0 - smoothstep(0.0, 0.08, absY);
          const curl = Math.sin(edge * Math.PI * 0.5);
          const pr = col[0] * shade * (0.80 + 0.25 * curl) - vein * 10;
          const pg = col[1] * shade * (0.80 + 0.25 * curl) - vein * 8;
          const pb = col[2] * shade * (0.80 + 0.25 * curl) - vein * 6;
          c.plot(px, py, pr, pg, pb, alpha, 175 + curl * 55, 132 + (1 - curl) * 45, 0, 0.54 + curl * 0.14, zVal);
        }
      }
    }
  };

  // Paint a small scaled pine cone
  const paintPineCone = (cx, cy, ang, len, wid, zVal) => {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const pad = Math.max(len, wid) + 3;
    const minX = Math.max(0, Math.floor(cx - pad));
    const maxX = Math.min(SIZE - 1, Math.ceil(cx + pad));
    const minY = Math.max(0, Math.floor(cy - pad));
    const maxY = Math.min(SIZE - 1, Math.ceil(cy + pad));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx, dy = py - cy;
        const lx = (dx * cosA + dy * sinA) / len;
        const ly = (-dx * sinA + dy * cosA) / wid;
        const r2 = (lx * 2) ** 2 + (ly * 2) ** 2;
        if (r2 < 1.0) {
          const dome = Math.sqrt(Math.max(0, 1.0 - r2));
          const alpha = smoothstep(0.0, 0.18, 1.0 - r2);
          // Diamond pine cone scales
          const s1 = Math.sin((lx * 9 + ly * 7) * Math.PI) * 0.5 + 0.5;
          const s2 = Math.sin((lx * 9 - ly * 7) * Math.PI) * 0.5 + 0.5;
          const scale = s1 * s2;
          const pr = (48 + scale * 42) * (0.65 + 0.45 * dome);
          const pg = (34 + scale * 28) * (0.65 + 0.45 * dome);
          const pb = (22 + scale * 16) * (0.65 + 0.45 * dome);
          c.plot(px, py, pr, pg, pb, alpha, 110 + scale * 120, 192, 0, 0.56 + dome * 0.22 + scale * 0.12, zVal + dome * 0.05);
        }
      }
    }
  };

  // Scattered fine twigs first (lowest Z)
  for (let i = 0; i < 28; i++) {
    const rad = Math.sqrt(rng()) * 0.36;
    const a = rng() * Math.PI * 2;
    const x0 = 0.5 + Math.cos(a) * rad;
    const y0 = 0.5 + Math.sin(a) * rad;
    const tang = rng() * Math.PI * 2;
    const len = 0.07 + rng() * 0.11;
    const x1 = clamp01(x0 + Math.cos(tang) * len);
    const y1 = clamp01(y0 + Math.sin(tang) * len);
    paintBranch(c, [[x0, y0], [(x0 + x1) * 0.5 + (rng() - 0.5) * 0.02, (y0 + y1) * 0.5 + (rng() - 0.5) * 0.02], [x1, y1]],
      0.004, 0.0022, [60, 44, 28], [52, 38, 24], 195, 0.10 + i * 0.002, 0);
  }

  // Scattered fallen leaves (clustered naturally inside radius 0.42 so tile edges stay clean)
  for (let i = 0; i < 165; i++) {
    const rad = Math.sqrt(rng()) * 0.40;
    const a = rng() * Math.PI * 2;
    const cx = (0.5 + Math.cos(a) * rad) * SIZE;
    const cy = (0.5 + Math.sin(a) * rad) * SIZE;
    const len = 34 + rng() * 34;
    const wid = len * (0.52 + rng() * 0.26);
    paintFallenLeaf(cx, cy, rng() * Math.PI * 2, len, wid, i, 0.20 + i * 0.003);
  }

  // 7 small fallen pine cones sitting on top of the leaves
  for (let i = 0; i < 7; i++) {
    const rad = 0.06 + rng() * 0.28;
    const a = rng() * Math.PI * 2;
    const cx = (0.5 + Math.cos(a) * rad) * SIZE;
    const cy = (0.5 + Math.sin(a) * rad) * SIZE;
    paintPineCone(cx, cy, rng() * Math.PI * 2, 42 + rng() * 18, 26 + rng() * 10, 0.80 + i * 0.02);
  }

  c.flush('decal_fallen_leaves', 4.8);
})();

// 18. decal_mud_puddle (1024x1024 RGBA)
// Wet muddy puddle (very low roughness ~24..42 in standing water center, 0 emission, alpha edge)
writePBRSet('decal_mud_puddle', 1024, true, (u, v, x, y, size, out) => {
  const dx = u - 0.5, dy = v - 0.5;
  const dist = Math.hypot(dx, dy);
  const nLow = fbm(u, v, 4, 4, 1901);
  const nMid = fbm(u, v, 14, 4, 1931);
  const nHi = fbm(u, v, 44, 3, 1951);

  const shape = (0.42 - dist) + (nLow - 0.5) * 0.22 + (nMid - 0.5) * 0.06;
  const mudAlpha = smoothstep(0.0, 0.14, shape) * (1.0 - smoothstep(0.42, 0.49, dist));
  const waterMask = smoothstep(0.08, 0.20, shape);

  // Outer churned wet mud rim -> dark reflective muddy rainwater center
  let r = lerp(42, 22, waterMask) + (nMid - 0.5) * 10 * (1 - waterMask * 0.6);
  let g = lerp(34, 24, waterMask) + (nMid - 0.5) * 8 * (1 - waterMask * 0.6);
  let b = lerp(24, 22, waterMask) + (nMid - 0.5) * 6 * (1 - waterMask * 0.6);

  // Subtle wind ripples on standing water surface
  const ripple = Math.sin(dist * 75 + nLow * 6.0) * 0.5 + 0.5;
  const h = lerp(
    0.50 + (nMid - 0.5) * 0.12 + (nHi - 0.5) * 0.05,
    0.47 + (ripple - 0.5) * 0.025,
    waterMask
  );

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = mudAlpha * 255;
  out.ao = lerp(185, 232, waterMask);
  out.rough = lerp(96, 26 + ripple * 10, waterMask); // Glossy wet puddle reflection under flashlight!
  out.metal = lerp(0, 18, waterMask);
  out.h = h;
}, 4.6);

// 19. decal_tree_roots (1024x1024 RGBA)
// Spreading gnarled surface tree roots radiating from tree trunk base at center, bark + moss
(function buildDecalTreeRoots() {
  const SIZE = 1024;
  const c = createCanvasPBR(SIZE, true);
  const rng = makeRng(2001);

  // Soft dark soil/humus shadow collar around center trunk base
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const dist = Math.hypot(u - 0.5, v - 0.5);
      if (dist < 0.24) {
        const n = fbm(u, v, 10, 3, 2011);
        const a = smoothstep(0.24, 0.08, dist + (n - 0.5) * 0.07) * 0.72;
        if (a > 0.01) {
          c.plot(x, y, 30, 24, 17, a, 120, 195, 0, 0.48, 0.05);
        }
      }
    }
  }

  // Paint one gnarled root with fissured bark & mossy top ridge
  const paintRoot = (pts, rStart, rEnd, zBase, seed) => {
    const S = SIZE;
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1);
      const t1 = (i + 1) / (pts.length - 1);
      const x0 = pts[i][0] * S, y0 = pts[i][1] * S;
      const x1 = pts[i + 1][0] * S, y1 = pts[i + 1][1] * S;
      const rad0 = lerp(rStart, rEnd, t0) * S;
      const rad1 = lerp(rStart, rEnd, t1) * S;
      const maxR = Math.max(rad0, rad1) + 4;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - maxR));
      const maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1) + maxR));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - maxR));
      const maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1) + maxR));

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const info = segmentInfo(px, py, x0, y0, x1, y1);
          const rad = lerp(rad0, rad1, info.t);
          if (info.dist < rad) {
            const tt = lerp(t0, t1, info.t);
            const normD = info.dist / rad;
            const cyl = Math.sqrt(Math.max(0, 1.0 - normD * normD));
            const alpha = smoothstep(0.0, 0.25, 1.0 - normD);
            if (alpha <= 0.01) continue;

            const u = px / S, v = py / S;
            const bark = fbm(u, v, 24, 3, seed);
            const ridge = Math.sin(normD * Math.PI * 5 + bark * 5.0) * 0.5 + 0.5;
            const moss = smoothstep(0.42, 0.68, fbm(u + 0.19, v + 0.31, 7, 3, seed + 29)) * cyl;

            let pr = (56 + ridge * 26) * (0.58 + 0.48 * cyl);
            let pg = (42 + ridge * 18) * (0.58 + 0.48 * cyl);
            let pb = (28 + ridge * 12) * (0.58 + 0.48 * cyl);
            let roughVal = 202 - ridge * 16;

            if (moss > 0.05) {
              pr = lerp(pr, 32, moss * 0.82);
              pg = lerp(pg, 68, moss * 0.82);
              pb = lerp(pb, 26, moss * 0.82);
              roughVal = lerp(roughVal, 196, moss * 0.6);
            }

            const hVal = 0.52 + cyl * (0.34 - tt * 0.16) + ridge * 0.06;
            c.plot(px, py, pr, pg, pb, alpha, 115 + cyl * 115, roughVal, 0, hVal, zBase + cyl * 0.12 - tt * 0.05);
          }
        }
      }
    }
  };

  // 8 primary radiating surface roots + secondary forked rootlets
  const mainCount = 8;
  for (let i = 0; i < mainCount; i++) {
    const baseAng = (i / mainCount) * Math.PI * 2 + (rng() - 0.5) * 0.38;
    const len = 0.34 + rng() * 0.11;
    const pts = [];
    const steps = 14;
    let curAng = baseAng;
    let cx = 0.5, cy = 0.5;
    pts.push([cx, cy]);
    for (let s = 1; s <= steps; s++) {
      curAng += (rng() - 0.5) * 0.36;
      const stepLen = len / steps;
      cx += Math.cos(curAng) * stepLen;
      cy += Math.sin(curAng) * stepLen;
      pts.push([cx, cy]);
    }
    paintRoot(pts, 0.044 + rng() * 0.012, 0.002, 0.30 + i * 0.03, 2039 + i * 19);

    // Forked secondary rootlet branching off mid-way
    const forkIdx = 4 + Math.floor(rng() * 4);
    const fPts = [pts[forkIdx]];
    let fAng = baseAng + (i % 2 === 0 ? 0.58 : -0.58) + (rng() - 0.5) * 0.25;
    let fx = pts[forkIdx][0], fy = pts[forkIdx][1];
    const fSteps = 8;
    const fLen = 0.14 + rng() * 0.07;
    for (let s = 1; s <= fSteps; s++) {
      fAng += (rng() - 0.5) * 0.32;
      fx += Math.cos(fAng) * (fLen / fSteps);
      fy += Math.sin(fAng) * (fLen / fSteps);
      fPts.push([fx, fy]);
    }
    paintRoot(fPts, 0.022, 0.0018, 0.22 + i * 0.02, 2207 + i * 17);
  }

  c.flush('decal_tree_roots', 5.6);
})();

// ============================================================================
// Write Godot 4 .import files for ALL 57 textures (BC7 / BC5 / BC1)
// ============================================================================
const allPngs = fs.readdirSync(TEX_DIR).filter(f => f.endsWith('.png'));
let totalBytes = 0;
for (const f of allPngs) {
  totalBytes += fs.statSync(path.join(TEX_DIR, f)).size;
  let role = 'color';
  if (f.endsWith('_normal.png')) role = 'normal';
  else if (f.endsWith('_orm.png')) role = 'orm';
  writeTextureImport(f, role);
}

const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
console.log(`\nDONE: Generated ${allPngs.length} PNG textures and ${allPngs.length} .import files in ${TEX_DIR}`);
console.log(`Total PNG size: ${totalMB} MB`);
