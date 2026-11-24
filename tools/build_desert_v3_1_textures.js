#!/usr/bin/env node
/**
 * build_desert_v3_1_textures.js
 * Generates 21 realistic 2K/1K PBR texture sets (_albedo.png, _normal.png, _orm.png)
 * + Godot 4 BC7/BC5/BC1 VRAM-compressed .import files for Map3_Col_v3_1
 * inside: asset model/haritalar/Map3_Col_v3_1/textures/
 *
 * ART DIRECTION (ÇÖL İLERİ KARAKOLU v3.1):
 * - ZERO emission / ZERO neon! 100% grounded, sun-baked desert PBR.
 * - Authentic wind-rippled desert sand, fissured packed earth, weathered adobe,
 *   sand-drifted concrete, rusty corrugated iron, burlap sandbags, and desert decals.
 * - Optimized for Iris Xe GPU (~40-52 MB total PNG footprint).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3_1');
const TEX_DIR = path.join(OUT_DIR, 'textures');

fs.mkdirSync(TEX_DIR, { recursive: true });

// ============================================================================
// PNG ENCODER (exact project template)
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
function encodePNG(width, height, channels, pixelBuffer, zlibLevel = 6) {
  const colorType = channels === 4 ? 6 : 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
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
  const idat = zlib.deflateSync(raw, { level: zlibLevel });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// ============================================================================
// DETERMINISTIC MATH & TILEABLE NOISE PRIMITIVES
// ============================================================================
function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296.0;
}

function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3.0 - 2.0 * xf);
  const v = yf * yf * (3.0 - 2.0 * yf);
  let x0 = xi % period; if (x0 < 0) x0 += period;
  const x1 = (x0 + 1 === period) ? 0 : x0 + 1;
  let y0 = yi % period; if (y0 < 0) y0 += period;
  const y1 = (y0 + 1 === period) ? 0 : y0 + 1;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a + (b - a) * u) * (1.0 - v) + (c + (d - c) * u) * v;
}

function fbm(u, v, baseFreq, octaves, seed) {
  let sum = 0.0;
  let amp = 0.5;
  let norm = 0.0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * freq, v * freq, freq, seed + i * 31);
    norm += amp;
    freq <<= 1;
    amp *= 0.5;
  }
  return sum / norm;
}

function ridgedFbm(u, v, baseFreq, octaves, seed) {
  let sum = 0.0;
  let amp = 0.5;
  let norm = 0.0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(u * freq, v * freq, freq, seed + i * 47);
    const r = 1.0 - Math.abs(n * 2.0 - 1.0);
    sum += amp * r * r;
    norm += amp;
    freq <<= 1;
    amp *= 0.5;
  }
  return sum / norm;
}

// Reusable Worley output object (zero GC pressure in tight loops)
const _worleyOut = { d1: 0, d2: 0, edge: 0, id: 0 };
function worley(u, v, cells, seed, out = _worleyOut) {
  const px = u * cells;
  const py = v * cells;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let d1 = 999.0;
  let d2 = 999.0;
  let bestId = 0.0;

  for (let oy = -1; oy <= 1; oy++) {
    let cy = (iy + oy) % cells;
    if (cy < 0) cy += cells;
    for (let ox = -1; ox <= 1; ox++) {
      let cx = (ix + ox) % cells;
      if (cx < 0) cx += cells;
      const rx = hash2(cx, cy, seed);
      const ry = hash2(cx, cy, seed + 137);
      const dx = (ix + ox + rx) - px;
      const dy = (iy + oy + ry) - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bestId = hash2(cx, cy, seed + 293);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  out.d1 = d1;
  out.d2 = d2;
  out.edge = d2 - d1;
  out.id = bestId;
  return out;
}

function clampByte(v) {
  return v < 0 ? 0 : (v > 255 ? 255 : (v | 0));
}
function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3.0 - 2.0 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 1e-9 ? clamp01((wx * vx + wy * vy) / lenSq) : 0.0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

const TWO_PI = Math.PI * 2.0;

// ============================================================================
// GODOT 4 .import GENERATOR (BC7 / BC5 / BC1 VRAM COMPRESSED)
// ============================================================================
function writeTextureImport(fileName, role) {
  // role: 'color' (BC7: high_quality=true, normal_map=2),
  //       'normal' (BC5: high_quality=false, normal_map=1),
  //       'orm' (BC1: high_quality=false, normal_map=2)
  const resPath = `res://asset model/haritalar/Map3_Col_v3_1/textures/${fileName}`;
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
// PBR SET WRITER (_albedo.png, _normal.png, _orm.png + .import)
// ============================================================================
const _px = { r: 0, g: 0, b: 0, a: 255, ao: 230, rough: 180, metal: 0, h: 0.5 };
let totalPngBytes = 0;
let totalPngCount = 0;
let totalImportCount = 0;

function writePBRSet(baseName, size, isAlpha, evalPixel, bumpScale = 4.5, zlibLevel = 6) {
  const albedoName = `${baseName}_albedo.png`;
  const normalName = `${baseName}_normal.png`;
  const ormName = `${baseName}_orm.png`;

  const ch = isAlpha ? 4 : 3;
  const albedo = Buffer.allocUnsafe(size * size * ch);
  const orm = Buffer.allocUnsafe(size * size * 3);
  const heightMap = new Float32Array(size * size);

  const invSize = 1.0 / size;
  for (let y = 0; y < size; y++) {
    const v = y * invSize;
    const rowOff = y * size;
    for (let x = 0; x < size; x++) {
      const u = x * invSize;
      const idx = rowOff + x;
      _px.a = 255;
      _px.ao = 230;
      _px.rough = 200;
      _px.metal = 0;
      _px.h = 0.5;
      evalPixel(u, v, x, y, size, _px);

      const dIdx = idx * ch;
      albedo[dIdx] = clampByte(_px.r);
      albedo[dIdx + 1] = clampByte(_px.g);
      albedo[dIdx + 2] = clampByte(_px.b);
      if (isAlpha) albedo[dIdx + 3] = clampByte(_px.a);

      const oIdx = idx * 3;
      orm[oIdx] = clampByte(_px.ao);       // R = Ambient Occlusion
      orm[oIdx + 1] = clampByte(_px.rough); // G = Roughness
      orm[oIdx + 2] = clampByte(_px.metal); // B = Metallic
      heightMap[idx] = _px.h;
    }
  }

  // Sobel-like OpenGL Normal Map (+Y up)
  const nor = Buffer.allocUnsafe(size * size * 3);
  for (let y = 0; y < size; y++) {
    const ym = (y === 0 ? size - 1 : y - 1) * size;
    const yc = y * size;
    const yp = (y === size - 1 ? 0 : y + 1) * size;
    for (let x = 0; x < size; x++) {
      const xm = x === 0 ? size - 1 : x - 1;
      const xp = x === size - 1 ? 0 : x + 1;
      const dx = (heightMap[yc + xp] - heightMap[yc + xm]) * bumpScale;
      const dy = (heightMap[yp + x] - heightMap[ym + x]) * bumpScale;
      let nx = -dx;
      let ny = dy;
      let nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen; ny *= invLen; nz *= invLen;
      const nIdx = (yc + x) * 3;
      nor[nIdx] = clampByte((nx * 0.5 + 0.5) * 255.0);
      nor[nIdx + 1] = clampByte((ny * 0.5 + 0.5) * 255.0);
      nor[nIdx + 2] = clampByte((nz * 0.5 + 0.5) * 255.0);
    }
  }

  const albedoBuf = encodePNG(size, size, ch, albedo, zlibLevel);
  const normalBuf = encodePNG(size, size, 3, nor, zlibLevel);
  const ormBuf = encodePNG(size, size, 3, orm, zlibLevel);

  fs.writeFileSync(path.join(TEX_DIR, albedoName), albedoBuf);
  fs.writeFileSync(path.join(TEX_DIR, normalName), normalBuf);
  fs.writeFileSync(path.join(TEX_DIR, ormName), ormBuf);

  writeTextureImport(albedoName, 'color');
  writeTextureImport(normalName, 'normal');
  writeTextureImport(ormName, 'orm');

  const setBytes = albedoBuf.length + normalBuf.length + ormBuf.length;
  totalPngBytes += setBytes;
  totalPngCount += 3;
  totalImportCount += 3;

  console.log(
    `[${String(totalPngCount / 3).padStart(2, '0')}/21] ${baseName.padEnd(26)} ${size}x${size} ${isAlpha ? 'RGBA' : 'RGB '} -> ${(setBytes / 1048576).toFixed(2)} MB`
  );
}

console.log('=== Building Map3_Col_v3_1 PBR Textures (21 sets = 63 PNGs + 63 .import) ===');
const tStart = Date.now();

// ============================================================================
// 2048x2048 ZEMİNLER (3 SETS - OPAQUE)
// ============================================================================

// 1. ground_desert_sand — Warm ochre/sand with asymmetric wind ripples, fine pebbles, organic variation
writePBRSet('ground_desert_sand', 2048, false, (u, v, x, y, size, out) => {
  // Large-scale dune & soil color variation
  const macro = fbm(u, v, 3, 4, 101);
  const med = fbm(u, v, 8, 4, 137);
  // Domain warp for organic, branching wind ripples
  const warp1 = (fbm(u, v, 4, 3, 211) - 0.5) * 0.45;
  const warp2 = (fbm(u + 0.37, v + 0.19, 10, 2, 251) - 0.5) * 0.12;
  // Wind direction slightly diagonal (tileable integer frequencies: 14*v + 4*u)
  const phase = (v * 14.0 + u * 4.0) + warp1 * 3.2 + warp2 * 2.0;
  const s = Math.sin(phase * TWO_PI);
  // Asymmetric aeolian ripple profile (gentle windward slope, steeper leeward slip-face)
  const asym = Math.sin(phase * TWO_PI + 0.42 * s);
  const ripple = asym * 0.5 + 0.5;
  // Secondary cross-ripples in flatter areas
  const microRipple = Math.sin(((v * 34.0 + u * 8.0) + warp1 * 4.0) * TWO_PI) * 0.5 + 0.5;
  const rippleBlend = lerp(ripple, ripple * 0.82 + microRipple * 0.18, 0.35);

  // Fine sand grain & small desert pebbles settled in ripple troughs
  const grain = valueNoise(u * 256.0, v * 256.0, 256, 307);
  const fineGrain = valueNoise(u * 512.0, v * 512.0, 512, 331);
  const peb = worley(u, v, 44, 389);
  const troughMask = smoothstep(0.55, 0.12, rippleBlend);
  const isPebble = smoothstep(0.16, 0.05, peb.d1) * (peb.id > 0.52 ? 1.0 : 0.0) * (0.35 + 0.65 * troughMask);

  // Warm natural desert sand palette (ochre / Sahara tan / darker sienna troughs)
  let r = lerp(164, 208, rippleBlend * 0.65 + macro * 0.35);
  let g = lerp(124, 168, rippleBlend * 0.65 + macro * 0.35);
  let b = lerp(82, 118, rippleBlend * 0.65 + macro * 0.35);

  // Subtle reddish-earth patches & dusty light streaks
  const earthPatch = smoothstep(0.45, 0.78, med);
  r = lerp(r, r * 0.88 + 10, earthPatch * 0.45);
  g = lerp(g, g * 0.84, earthPatch * 0.45);
  b = lerp(b, b * 0.78, earthPatch * 0.45);

  // Grain sparkle/variation
  const grainMod = (grain - 0.5) * 18.0 + (fineGrain - 0.5) * 10.0;
  r += grainMod;
  g += grainMod * 0.9;
  b += grainMod * 0.75;

  // Pebbles: darker brown/grey desert stones
  if (isPebble > 0.01) {
    const pShade = lerp(75, 138, peb.id);
    r = lerp(r, pShade * 1.12, isPebble);
    g = lerp(g, pShade * 0.98, isPebble);
    b = lerp(b, pShade * 0.80, isPebble);
  }

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(192, 250, rippleBlend * 0.75 + 0.25) - isPebble * 28;
  // Dry sand is matte (roughness ~0.78-0.94), quartz grains & pebbles slightly less rough
  out.rough = lerp(215, 244, 1.0 - rippleBlend * 0.35) - (fineGrain > 0.86 ? 26 : 0) - isPebble * 22;
  out.metal = 0;
  out.h = 0.28 + rippleBlend * 0.48 + (macro - 0.5) * 0.14 + (grain - 0.5) * 0.05 + isPebble * 0.22;
}, 7.2, 6);

// 2. ground_packed_earth — Compacted cracked desert soil, dried mud veins, small gravel & dust
writePBRSet('ground_packed_earth', 2048, false, (u, v, x, y, size, out) => {
  const macro = fbm(u, v, 4, 4, 401);
  const med = fbm(u, v, 12, 4, 439);
  const micro = fbm(u, v, 48, 3, 463);

  // Domain-warped Voronoi for organic polygonal desiccation cracks
  const wu = u + (fbm(u, v, 8, 3, 503) - 0.5) * 0.045;
  const wv = v + (fbm(u + 0.41, v + 0.27, 8, 3, 521) - 0.5) * 0.045;
  const cell1 = worley(wu, wv, 11, 547);
  const cell2 = worley(wu, wv, 24, 577);

  // Primary & secondary soil cracks (intermittent so it looks like real packed earth, not a uniform grid)
  const crackMask = smoothstep(0.28, 0.68, macro);
  const crack1 = smoothstep(0.055, 0.008, cell1.edge) * (0.35 + 0.65 * crackMask);
  const crack2 = smoothstep(0.042, 0.006, cell2.edge) * 0.55 * crackMask;
  const crack = clamp01(Math.max(crack1, crack2));

  // Small gravel / stones embedded in compacted dirt
  const grav = worley(u, v, 36, 613);
  const pebble = smoothstep(0.22, 0.08, grav.d1) * (grav.id > 0.42 ? 1.0 : 0.0) * (1.0 - crack);
  const fineGrav = valueNoise(u * 256.0, v * 256.0, 256, 641);

  // Rich earthy desert clay / ochre-brown soil tones
  let r = lerp(128, 174, macro * 0.55 + med * 0.45);
  let g = lerp(96, 136, macro * 0.55 + med * 0.45);
  let b = lerp(66, 98, macro * 0.55 + med * 0.45);

  // Subtle plate-to-plate dried clay tint variation
  const plateTint = (cell1.id - 0.5) * 18.0;
  r += plateTint + (micro - 0.5) * 24.0;
  g += plateTint * 0.85 + (micro - 0.5) * 20.0;
  b += plateTint * 0.65 + (micro - 0.5) * 14.0;

  // Loose windblown sand dust collecting in low spots & cracks
  const dust = smoothstep(0.58, 0.85, fbm(u + 0.2, v + 0.5, 6, 3, 673));
  r = lerp(r, 188, dust * 0.35);
  g = lerp(g, 152, dust * 0.35);
  b = lerp(b, 108, dust * 0.35);

  // Embedded pebbles
  if (pebble > 0.01) {
    const ps = lerp(82, 152, grav.id);
    r = lerp(r, ps * 1.08, pebble);
    g = lerp(g, ps * 0.96, pebble);
    b = lerp(b, ps * 0.82, pebble);
  }

  // Deep dark crack interiors
  r = lerp(r, 54, crack * 0.82);
  g = lerp(g, 38, crack * 0.82);
  b = lerp(b, 26, crack * 0.82);

  // Slight curled rim right beside major cracks
  const rim = smoothstep(0.11, 0.045, cell1.edge) * (1.0 - crack1) * 0.08;

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(238, 82, crack) - pebble * 18;
  out.rough = lerp(218, 248, crack * 0.5 + dust * 0.5) - pebble * 28 + (fineGrav - 0.5) * 16;
  out.metal = 0;
  out.h = 0.56 + (med - 0.5) * 0.16 + (micro - 0.5) * 0.08 + rim + pebble * 0.24 - crack * 0.46;
}, 8.0, 6);

// 3. ground_helipad_concrete — Weathered cracked desert concrete partially covered with windblown sand
writePBRSet('ground_helipad_concrete', 2048, false, (u, v, x, y, size, out) => {
  // 2x2 concrete slab expansion joints
  const gx = Math.abs(((u * 2.0) % 1.0) - 0.5);
  const gy = Math.abs(((v * 2.0) % 1.0) - 0.5);
  const edgeDist = Math.min(0.5 - gx, 0.5 - gy);
  const seamJitter = (fbm(u, v, 32, 3, 701) - 0.5) * 0.008;
  const seam = smoothstep(0.011, 0.002, edgeDist + seamJitter);
  const bevel = smoothstep(0.025, 0.009, edgeDist + seamJitter) * (1.0 - seam);

  const macro = fbm(u, v, 5, 4, 733);
  const aggregate = fbm(u, v, 36, 4, 761);
  const fine = valueNoise(u * 256.0, v * 256.0, 256, 787);

  // Concrete cracks (domain-warped ridged lines)
  const wu = u + (fbm(u, v, 8, 2, 809) - 0.5) * 0.04;
  const wv = v + (fbm(u + 0.3, v + 0.6, 8, 2, 823) - 0.5) * 0.04;
  const cr = worley(wu, wv, 5, 853);
  const crack = smoothstep(0.018, 0.003, cr.edge) * smoothstep(0.35, 0.65, macro);

  // Sun-baked dusty desert concrete base
  let r = lerp(136, 170, macro * 0.5 + aggregate * 0.5) + (fine - 0.5) * 18;
  let g = lerp(128, 160, macro * 0.5 + aggregate * 0.5) + (fine - 0.5) * 16;
  let b = lerp(114, 142, macro * 0.5 + aggregate * 0.5) + (fine - 0.5) * 14;

  // Spalling / pitting on worn concrete
  const pit = smoothstep(0.74, 0.88, aggregate);
  r -= pit * 22; g -= pit * 20; b -= pit * 18;

  // Dark seams & cracks
  const groove = Math.max(seam, crack);
  r = lerp(r, 68, groove * 0.72);
  g = lerp(g, 60, groove * 0.72);
  b = lerp(b, 50, groove * 0.72);

  // Windblown desert sand drifting over concrete & filling seams
  const sandNoise = fbm(u * 1.0, v * 1.0, 4, 4, 881);
  const sandMask = clamp01(smoothstep(0.52, 0.78, sandNoise) * 0.85 + seam * 0.55);
  const sandRipple = Math.sin((v * 18.0 + u * 6.0 + sandNoise * 2.5) * TWO_PI) * 0.5 + 0.5;
  const sr = lerp(176, 206, sandRipple * 0.5 + fine * 0.5);
  const sg = lerp(138, 166, sandRipple * 0.5 + fine * 0.5);
  const sb = lerp(96, 120, sandRipple * 0.5 + fine * 0.5);

  r = lerp(r, sr, sandMask);
  g = lerp(g, sg, sandMask);
  b = lerp(b, sb, sandMask);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(lerp(236, 108, groove) - pit * 24, 224, sandMask * 0.7);
  out.rough = lerp(lerp(186, 232, aggregate * 0.6 + groove * 0.4), 238, sandMask);
  out.metal = 0;
  const concH = 0.55 + (aggregate - 0.5) * 0.12 - pit * 0.14 - bevel * 0.08 - groove * 0.34;
  const sandH = 0.62 + sandRipple * 0.14 + (fine - 0.5) * 0.04;
  out.h = lerp(concH, sandH, sandMask);
}, 6.5, 6);

// ============================================================================
// 1024x1024 YAPI & PROP (11 SETS - OPAQUE)
// ============================================================================

// 4. wall_adobe_plaster — Warm desert adobe/stucco wall, bottom wind/sand erosion, hairline cracks
writePBRSet('wall_adobe_plaster', 1024, false, (u, v, x, y, size, out) => {
  const macro = fbm(u, v, 4, 4, 1009);
  const trowel = fbm(u * 1.5, v * 0.8, 8, 4, 1031);
  const grit = fbm(u, v, 40, 3, 1061);

  // Subtle horizontal mud-brick courses underneath plaster
  const brickY = v * 12.0;
  const row = Math.floor(brickY);
  const brickX = u * 6.0 + (row & 1) * 0.5;
  const mortarY = smoothstep(0.08, 0.01, Math.abs((brickY % 1.0) - 0.5) * 2.0 - 0.88);
  const mortarX = smoothstep(0.08, 0.01, Math.abs((brickX % 1.0) - 0.5) * 2.0 - 0.90);
  const mortar = clamp01(Math.max(mortarY, mortarX));

  // Bottom erosion (v near 1.0 is bottom of wall) + patches where plaster flaked off
  const erodeNoise = fbm(u, v, 6, 4, 1091);
  const bottomErode = smoothstep(0.68, 0.95, v + (erodeNoise - 0.5) * 0.28);
  const patchErode = smoothstep(0.73, 0.83, erodeNoise) * 0.85;
  const exposed = clamp01(Math.max(bottomErode, patchErode));

  // Fine plaster cracks
  const cr = worley(u + (trowel - 0.5) * 0.03, v + (macro - 0.5) * 0.03, 7, 1117);
  const crack = smoothstep(0.022, 0.004, cr.edge) * (1.0 - exposed) * smoothstep(0.4, 0.7, macro);

  // Warm sun-baked desert stucco color
  let pr = lerp(188, 218, macro * 0.6 + trowel * 0.4) + (grit - 0.5) * 16;
  let pg = lerp(152, 182, macro * 0.6 + trowel * 0.4) + (grit - 0.5) * 14;
  let pb = lerp(112, 138, macro * 0.6 + trowel * 0.4) + (grit - 0.5) * 10;

  // Exposed mud-brick underneath (darker terracotta-brown)
  let br = lerp(136, 162, grit) - mortar * 22;
  let bg = lerp(98, 122, grit) - mortar * 18;
  let bb = lerp(68, 86, grit) - mortar * 14;

  let r = lerp(pr, br, exposed);
  let g = lerp(pg, bg, exposed);
  let b = lerp(pb, bb, exposed);

  // Bottom sand dust splash
  const dust = smoothstep(0.78, 1.0, v + (grit - 0.5) * 0.12) * 0.42;
  r = lerp(r, 192, dust);
  g = lerp(g, 158, dust);
  b = lerp(b, 114, dust);

  // Hairline cracks
  r = lerp(r, 92, crack * 0.65);
  g = lerp(g, 72, crack * 0.65);
  b = lerp(b, 52, crack * 0.65);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(240, 175, exposed) - crack * 65 - mortar * exposed * 42;
  out.rough = lerp(212, 246, exposed * 0.6 + grit * 0.4);
  out.metal = 0;
  out.h = lerp(0.68 + (trowel - 0.5) * 0.14 - crack * 0.25, 0.36 + (grit - 0.5) * 0.12 - mortar * 0.18, exposed);
}, 6.0, 6);

// 5. wall_concrete_weathered — Weathered military precast concrete barrier/wall
writePBRSet('wall_concrete_weathered', 1024, false, (u, v, x, y, size, out) => {
  const macro = fbm(u, v, 5, 4, 1201);
  const med = fbm(u, v, 18, 4, 1223);
  const fine = valueNoise(u * 192.0, v * 192.0, 192, 1249);

  // Horizontal formwork seams & vertical panel joint
  const hSeam = smoothstep(0.012, 0.002, Math.abs(((v * 3.0) % 1.0) - 0.5) * 2.0 - 0.975);
  const vSeam = smoothstep(0.012, 0.002, Math.abs(((u * 2.0) % 1.0) - 0.5) * 2.0 - 0.982);
  const seam = Math.max(hSeam, vSeam);

  // Formwork tie-rod holes (2x3 grid)
  const tx = ((u * 2.0 + 0.25) % 0.5) - 0.25;
  const ty = ((v * 3.0 + 0.5) % 1.0) - 0.5;
  const tieDist = Math.hypot(tx * 2.0, ty);
  const tieHole = smoothstep(0.048, 0.025, tieDist);
  const tieRim = smoothstep(0.068, 0.045, tieDist) * (1.0 - tieHole);

  // Vertical rain/dust streaks
  const streak = fbm(u * 4.0, v * 0.5, 6, 3, 1277);
  // Desert sand dust near base
  const baseDust = smoothstep(0.72, 1.0, v + (macro - 0.5) * 0.18);

  // Cool-warm dusty military concrete
  let r = lerp(128, 162, macro * 0.5 + med * 0.5) + (fine - 0.5) * 16 - streak * 16;
  let g = lerp(124, 156, macro * 0.5 + med * 0.5) + (fine - 0.5) * 15 - streak * 15;
  let b = lerp(114, 144, macro * 0.5 + med * 0.5) + (fine - 0.5) * 14 - streak * 13;

  // Chipped/pitted concrete
  const chip = smoothstep(0.72, 0.88, med);
  r -= chip * 24; g -= chip * 22; b -= chip * 20;

  // Base sand dust
  r = lerp(r, 184, baseDust * 0.55);
  g = lerp(g, 152, baseDust * 0.55);
  b = lerp(b, 112, baseDust * 0.55);

  // Dark seams & tie holes
  const dark = Math.max(seam * 0.7, tieHole * 0.85);
  r = lerp(r, 48, dark);
  g = lerp(g, 46, dark);
  b = lerp(b, 42, dark);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(236, 74, Math.max(seam * 0.8, tieHole)) - chip * 24;
  out.rough = lerp(190, 240, med * 0.5 + baseDust * 0.5);
  out.metal = 0;
  out.h = 0.58 + (med - 0.5) * 0.14 - chip * 0.16 - seam * 0.25 - tieHole * 0.36 + tieRim * 0.05;
}, 6.2, 6);

// 6. wood_dry_planks — Sun-dried, cracked arid desert timber planks
writePBRSet('wood_dry_planks', 1024, false, (u, v, x, y, size, out) => {
  const numPlanks = 6;
  const pv = v * numPlanks;
  const plankIdx = Math.floor(pv);
  const pf = pv - plankIdx;
  const plankSeed = 1301 + plankIdx * 43;

  // Gap between planks
  const gap = smoothstep(0.032, 0.008, Math.min(pf, 1.0 - pf));
  const bevel = smoothstep(0.065, 0.025, Math.min(pf, 1.0 - pf)) * (1.0 - gap);

  // Plank end joint (staggered)
  const jointPos = hash2(plankIdx, 7, 1327);
  let ju = Math.abs(u - jointPos);
  if (ju > 0.5) ju = 1.0 - ju;
  const endGap = smoothstep(0.007, 0.002, ju);
  const anyGap = Math.max(gap, endGap);

  // Elongated wood grain & sun-split cracks
  const grainWarp = fbm(u, pf * 0.25 + plankIdx * 0.17, 6, 3, plankSeed) * 0.35;
  const rings = Math.sin((pf * 16.0 + grainWarp * 18.0 + u * 2.0) * TWO_PI) * 0.5 + 0.5;
  const fibers = fbm(u * 2.0, v * 24.0, 8, 3, plankSeed + 19);
  const split = smoothstep(0.84, 0.95, ridgedFbm(u * 1.5, v * 12.0, 6, 3, plankSeed + 53));

  const plankTone = hash2(plankIdx, 13, 1361);
  // Sun-bleached dry desert wood (warm greyish-tan to weathered cedar)
  let r = lerp(118, 164, plankTone * 0.5 + rings * 0.3 + fibers * 0.2);
  let g = lerp(92, 134, plankTone * 0.5 + rings * 0.3 + fibers * 0.2);
  let b = lerp(66, 98, plankTone * 0.5 + rings * 0.3 + fibers * 0.2);

  // Sun-bleached grey streaks
  const bleach = smoothstep(0.55, 0.88, fbm(u, v, 5, 3, 1399));
  r = lerp(r, 152, bleach * 0.35);
  g = lerp(g, 138, bleach * 0.35);
  b = lerp(b, 118, bleach * 0.35);

  // Sand dust in splits & crevices
  const splitDark = split * 0.65;
  r = lerp(r, 56, splitDark);
  g = lerp(g, 42, splitDark);
  b = lerp(b, 30, splitDark);

  // Plank gaps
  r = lerp(r, 38, anyGap * 0.88);
  g = lerp(g, 30, anyGap * 0.88);
  b = lerp(b, 22, anyGap * 0.88);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(236, 58, anyGap) - split * 55;
  out.rough = lerp(208, 246, fibers * 0.5 + bleach * 0.5);
  out.metal = 0;
  out.h = 0.62 + (rings - 0.5) * 0.08 + (fibers - 0.5) * 0.09 - split * 0.22 - bevel * 0.14 - anyGap * 0.48;
}, 6.5, 6);

// 7. metal_rusty_corrugated — Corrugated galvanized iron with heavy desert rust & dust
writePBRSet('metal_rusty_corrugated', 1024, false, (u, v, x, y, size, out) => {
  // Vertical corrugated waves (14 ribs across U)
  const wave = Math.sin(u * 14.0 * TWO_PI);
  const ribH = wave * 0.5 + 0.5;

  // Horizontal overlapping sheet seam at v = 0.5
  const seam = smoothstep(0.014, 0.003, Math.abs(v - 0.5));

  const rustMacro = fbm(u, v, 5, 4, 1511);
  const rustDetail = fbm(u, v, 24, 4, 1543);
  const drip = fbm(u * 4.0, v * 1.0, 6, 3, 1571);

  // Rust concentrated in valleys, near seams, and organic blotches
  const rustMask = smoothstep(0.36, 0.68, rustMacro * 0.65 + rustDetail * 0.25 + (1.0 - ribH) * 0.22 + drip * 0.15);
  const deepRust = smoothstep(0.58, 0.82, rustMacro * 0.5 + rustDetail * 0.5) * rustMask;

  // Weathered galvanized steel base
  let mr = lerp(112, 148, rustDetail);
  let mg = lerp(114, 148, rustDetail);
  let mb = lerp(112, 144, rustDetail);

  // Orange-brown & dark oxide rust
  const rr = lerp(142, 92, deepRust) + (rustDetail - 0.5) * 28;
  const rg = lerp(68, 42, deepRust) + (rustDetail - 0.5) * 16;
  const rb = lerp(34, 24, deepRust) + (rustDetail - 0.5) * 10;

  let r = lerp(mr, rr, rustMask);
  let g = lerp(mg, rg, rustMask);
  let b = lerp(mb, rb, rustMask);

  // Desert dust settled in valleys
  const dust = (1.0 - ribH) * 0.28 * smoothstep(0.3, 0.8, rustDetail);
  r = lerp(r, 178, dust);
  g = lerp(g, 146, dust);
  b = lerp(b, 108, dust);

  // Overlap shadow
  r *= (1.0 - seam * 0.45);
  g *= (1.0 - seam * 0.45);
  b *= (1.0 - seam * 0.45);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(175, 248, ribH) - seam * 70 - deepRust * 24;
  out.rough = lerp(118, 240, rustMask * 0.85 + dust * 0.15);
  out.metal = lerp(210, 12, rustMask);
  out.h = 0.22 + ribH * 0.56 + (rustDetail - 0.5) * 0.08 * rustMask - seam * 0.18;
}, 8.5, 6);

// 8. metal_military_tan — Desert-tan military painted steel with rivets, scratches, edge wear & dust
writePBRSet('metal_military_tan', 1024, false, (u, v, x, y, size, out) => {
  // 2x2 military armor/equipment panels
  const pu = (u * 2.0) % 1.0;
  const pv = (v * 2.0) % 1.0;
  const edgeU = Math.min(pu, 1.0 - pu);
  const edgeV = Math.min(pv, 1.0 - pv);
  const edge = Math.min(edgeU, edgeV);

  const seam = smoothstep(0.012, 0.003, edge);
  const edgeWearBand = smoothstep(0.055, 0.012, edge) * (1.0 - seam);

  // Rivets along panel borders
  let rivet = 0.0;
  const rivetInset = 0.055;
  if (Math.abs(edgeU - rivetInset) < 0.025 || Math.abs(edgeV - rivetInset) < 0.025) {
    const ru = ((pu * 8.0 + 0.5) % 1.0) - 0.5;
    const rv = ((pv * 8.0 + 0.5) % 1.0) - 0.5;
    const rd = Math.hypot(ru, rv);
    rivet = smoothstep(0.22, 0.10, rd);
  }

  const grime = fbm(u, v, 6, 4, 1601);
  const wearNoise = fbm(u, v, 20, 4, 1627);
  // Fine metallic scratches
  const scratch = smoothstep(0.84, 0.94, ridgedFbm(u * 2.5, v * 0.6, 12, 3, 1663)) * smoothstep(0.45, 0.75, grime);
  const chipped = clamp01(edgeWearBand * smoothstep(0.38, 0.68, wearNoise) + scratch * 0.85);

  // Matte CARC desert-tan military paint
  let r = lerp(164, 186, grime) + (wearNoise - 0.5) * 12;
  let g = lerp(142, 162, grime) + (wearNoise - 0.5) * 10;
  let b = lerp(104, 120, grime) + (wearNoise - 0.5) * 8;

  // Exposed dark steel on scratches/chipped edges
  r = lerp(r, 98, chipped);
  g = lerp(g, 96, chipped);
  b = lerp(b, 92, chipped);

  // Dust settled near seams & rivets
  const dust = smoothstep(0.09, 0.015, edge) * 0.35 * grime;
  r = lerp(r, 188, dust);
  g = lerp(g, 158, dust);
  b = lerp(b, 118, dust);

  // Dark panel seams
  r = lerp(r, 42, seam * 0.82);
  g = lerp(g, 38, seam * 0.82);
  b = lerp(b, 32, seam * 0.82);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(238, 80, seam) - dust * 35;
  out.rough = lerp(176, 86, chipped) + dust * 48;
  out.metal = lerp(38, 224, chipped);
  out.h = 0.52 + (wearNoise - 0.5) * 0.03 + rivet * 0.24 - seam * 0.32 - scratch * 0.08;
}, 6.0, 6);

// 9. fabric_sandbag — Woven burlap/jute cloth with cross-hatch threads & trapped sand dust
writePBRSet('fabric_sandbag', 1024, false, (u, v, x, y, size, out) => {
  // Organic slight distortion of woven cloth
  const warpU = u + (fbm(u, v, 6, 3, 1709) - 0.5) * 0.016;
  const warpV = v + (fbm(u + 0.3, v + 0.7, 6, 3, 1733) - 0.5) * 0.016;

  // Burlap plain weave: 56 threads across
  const freq = 56.0;
  const fx = warpU * freq;
  const fy = warpV * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix; // 0..1 within thread
  const ty = fy - iy;

  const overX = ((ix + iy) & 1) === 0;
  const threadX = Math.sin(tx * Math.PI);
  const threadY = Math.sin(ty * Math.PI);
  const weaveH = overX ? (threadX * 0.85 + threadY * 0.25) : (threadY * 0.85 + threadX * 0.25);

  const fiberVar = hash2(ix & 63, iy & 63, 1759);
  const macro = fbm(u, v, 5, 4, 1787);
  const folds = fbm(u * 1.0, v * 2.0, 4, 3, 1811);

  // Warm jute / burlap tan-brown
  let r = lerp(136, 176, weaveH * 0.55 + macro * 0.35 + fiberVar * 0.1);
  let g = lerp(112, 148, weaveH * 0.55 + macro * 0.35 + fiberVar * 0.1);
  let b = lerp(78, 108, weaveH * 0.55 + macro * 0.35 + fiberVar * 0.1);

  // Fine sand dust trapped in weave valleys
  const dust = smoothstep(0.55, 0.2, weaveH) * smoothstep(0.35, 0.75, macro) * 0.55;
  r = lerp(r, 194, dust);
  g = lerp(g, 162, dust);
  b = lerp(b, 118, dust);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(142, 248, weaveH);
  out.rough = lerp(222, 248, 1.0 - weaveH * 0.4);
  out.metal = 0;
  out.h = 0.25 + weaveH * 0.42 + (folds - 0.5) * 0.26;
}, 5.5, 6);

// 10. fabric_tarp_tan — Sun-faded military canvas/tent tarp with ripstop grid & tension folds
writePBRSet('fabric_tarp_tan', 1024, false, (u, v, x, y, size, out) => {
  const macro = fbm(u, v, 4, 4, 1901);
  // Diagonal tension creases
  const crease = Math.sin((u * 3.0 + v * 2.0 + (macro - 0.5) * 1.4) * TWO_PI) * 0.5 + 0.5;
  const softFold = fbm(u, v, 3, 3, 1931);

  // Fine canvas + ripstop reinforcement grid
  const gx = Math.abs(((u * 32.0) % 1.0) - 0.5);
  const gy = Math.abs(((v * 32.0) % 1.0) - 0.5);
  const ripstop = (gx > 0.45 || gy > 0.45) ? 1.0 : 0.0;
  const microWeave = (Math.sin(u * 128.0 * TWO_PI) * Math.sin(v * 128.0 * TWO_PI)) * 0.5 + 0.5;

  // Stitched seam line across u = 0.5
  const seam = smoothstep(0.012, 0.003, Math.abs(u - 0.5));

  // Sun-faded military khaki-tan
  let r = lerp(152, 188, macro * 0.5 + softFold * 0.3 + crease * 0.2);
  let g = lerp(136, 168, macro * 0.5 + softFold * 0.3 + crease * 0.2);
  let b = lerp(102, 128, macro * 0.5 + softFold * 0.3 + crease * 0.2);

  // Subtle bleached sun patches & dusty smudges
  const sunFade = smoothstep(0.55, 0.85, macro);
  r = lerp(r, 198, sunFade * 0.32);
  g = lerp(g, 178, sunFade * 0.32);
  b = lerp(b, 142, sunFade * 0.32);

  r += ripstop * 5 - seam * 28;
  g += ripstop * 4 - seam * 25;
  b += ripstop * 3 - seam * 20;

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(196, 246, crease * 0.5 + softFold * 0.5) - seam * 55;
  out.rough = lerp(212, 242, macro * 0.6 + microWeave * 0.4);
  out.metal = 0;
  out.h = 0.35 + crease * 0.24 + softFold * 0.22 + ripstop * 0.04 + microWeave * 0.03 - seam * 0.12;
}, 4.8, 6);

// 11. rock_sandstone — Stratified sedimentary desert sandstone rock
writePBRSet('rock_sandstone', 1024, false, (u, v, x, y, size, out) => {
  // Warped horizontal sedimentary strata
  const warpV = v + (fbm(u, v, 4, 4, 2003) - 0.5) * 0.16;
  const strata1 = Math.sin(warpV * 14.0 * TWO_PI) * 0.5 + 0.5;
  const strata2 = Math.sin(warpV * 34.0 * TWO_PI + 1.3) * 0.5 + 0.5;
  const strata = strata1 * 0.65 + strata2 * 0.35;

  const rockFbm = fbm(u, v, 8, 5, 2039);
  const cr = worley(u + (rockFbm - 0.5) * 0.05, v + (rockFbm - 0.5) * 0.05, 8, 2069);
  const fracture = smoothstep(0.055, 0.01, cr.edge);

  // Warm desert sandstone palette: buff ochre, burnt sienna, dusty terracotta
  let r = lerp(142, 196, strata * 0.55 + rockFbm * 0.45);
  let g = lerp(100, 146, strata * 0.55 + rockFbm * 0.45);
  let b = lerp(68, 102, strata * 0.55 + rockFbm * 0.45);

  // Reddish iron-oxide sedimentary bands
  const redBand = smoothstep(0.62, 0.88, strata1);
  r = lerp(r, 172, redBand * 0.45);
  g = lerp(g, 96, redBand * 0.45);
  b = lerp(b, 62, redBand * 0.45);

  // Deep shadow in fractures
  r = lerp(r, 62, fracture * 0.72);
  g = lerp(g, 44, fracture * 0.72);
  b = lerp(b, 32, fracture * 0.72);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(238, 84, fracture) - (1.0 - strata) * 28;
  out.rough = lerp(206, 246, rockFbm * 0.6 + fracture * 0.4);
  out.metal = 0;
  out.h = 0.36 + strata * 0.28 + (rockFbm - 0.5) * 0.24 - fracture * 0.38;
}, 8.5, 6);

// 12. foliage_palm_bark — Fibrous diamond-scarred desert palm trunk bark
writePBRSet('foliage_palm_bark', 1024, false, (u, v, x, y, size, out) => {
  // Repeating diamond leaf-base scars
  const cols = 6.0;
  const rows = 14.0;
  const jitter = (fbm(u, v, 8, 3, 2111) - 0.5) * 0.25;
  const gy = v * rows + jitter;
  const rowI = Math.floor(gy);
  const gx = u * cols + (rowI & 1) * 0.5 + jitter * 0.6;
  const fx = (gx - Math.floor(gx)) - 0.5;
  const fy = (gy - rowI) - 0.5;

  // Diamond distance
  const diamond = Math.abs(fx) * 1.15 + Math.abs(fy) * 1.45;
  const ridge = smoothstep(0.68, 0.42, diamond) * smoothstep(0.18, 0.45, diamond);
  const crevice = smoothstep(0.55, 0.78, diamond);
  const fibers = fbm(u * 6.0, v * 1.5, 10, 4, 2143);

  // Dry fibrous grey-brown palm bark
  let r = lerp(86, 134, fibers * 0.6 + ridge * 0.4);
  let g = lerp(70, 110, fibers * 0.6 + ridge * 0.4);
  let b = lerp(52, 82, fibers * 0.6 + ridge * 0.4);

  // Dusty sunlit ridges
  r = lerp(r, 152, ridge * 0.32);
  g = lerp(g, 130, ridge * 0.32);
  b = lerp(b, 98, ridge * 0.32);

  // Dark deep crevices between leaf scars
  r = lerp(r, 42, crevice * 0.75);
  g = lerp(g, 34, crevice * 0.75);
  b = lerp(b, 26, crevice * 0.75);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(232, 78, crevice);
  out.rough = lerp(218, 248, fibers * 0.5 + crevice * 0.5);
  out.metal = 0;
  out.h = 0.45 + ridge * 0.34 + (fibers - 0.5) * 0.14 - crevice * 0.38;
}, 8.0, 6);

// 13. prop_crate_military — Military wooden ammo crate with battens, metal corners & matte stencil
writePBRSet('prop_crate_military', 1024, false, (u, v, x, y, size, out) => {
  const edgeU = Math.min(u, 1.0 - u);
  const edgeV = Math.min(v, 1.0 - v);
  const border = 0.11;
  const isFrame = (edgeU < border || edgeV < border) ? 1.0 : 0.0;
  // Center reinforcement slat
  const isCross = (Math.abs(v - 0.5) < 0.045) ? 1.0 : 0.0;
  const isBatten = Math.max(isFrame, isCross);

  // Corner metal brackets
  const isBracket = (edgeU < 0.13 && edgeV < 0.13 && (edgeU < 0.055 || edgeV < 0.055)) ? 1.0 : 0.0;

  // Inner recessed wooden boards
  const boardSeam = (1.0 - isBatten) * smoothstep(0.012, 0.003, Math.abs(((v * 6.0) % 1.0) - 0.5) * 2.0 - 0.96);
  const battenEdge = smoothstep(0.012, 0.002, Math.abs(Math.min(edgeU, edgeV) - border));

  const grain = fbm(u * 2.5, v * 14.0, 8, 4, 2207);
  const grime = fbm(u, v, 6, 4, 2239);

  // Olive-drab / sun-faded desert military crate paint
  let r = lerp(96, 126, grime * 0.6 + grain * 0.4);
  let g = lerp(98, 124, grime * 0.6 + grain * 0.4);
  let b = lerp(68, 86, grime * 0.6 + grain * 0.4);

  // Slightly lighter raised battens with worn edges
  if (isBatten > 0.5) {
    r += 10; g += 9; b += 7;
  }

  // Matte yellow-tan tactical stencil band in upper-left inner panel
  const inStencil = (u > 0.18 && u < 0.52 && v > 0.22 && v < 0.34);
  let stencil = 0.0;
  if (inStencil) {
    // Three tactical stencil bars
    const sx = (u - 0.18) / 0.34;
    if ((sx < 0.26) || (sx > 0.34 && sx < 0.62) || (sx > 0.70 && sx < 0.96)) {
      stencil = smoothstep(0.35, 0.65, grime + 0.18);
    }
  }
  r = lerp(r, 186, stencil * 0.75);
  g = lerp(g, 164, stencil * 0.75);
  b = lerp(b, 102, stencil * 0.75);

  // Dark gunmetal corner brackets
  if (isBracket > 0.5) {
    r = lerp(62, 84, grime);
    g = lerp(64, 82, grime);
    b = lerp(60, 76, grime);
  }

  // Desert dust accumulation in corners & recesses
  const dust = (1.0 - isBatten) * smoothstep(0.16, 0.11, Math.min(edgeU, edgeV)) * 0.45 + grime * 0.15;
  r = lerp(r, 186, dust * 0.45);
  g = lerp(g, 154, dust * 0.45);
  b = lerp(b, 112, dust * 0.45);

  // Dark board seams & frame shadow
  const dark = Math.max(boardSeam, battenEdge * 0.65);
  r = lerp(r, 34, dark);
  g = lerp(g, 32, dark);
  b = lerp(b, 26, dark);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(236, 92, dark) - (1.0 - isBatten) * 26;
  out.rough = isBracket > 0.5 ? lerp(120, 175, grime) : lerp(196, 238, grain * 0.5 + dust * 0.5);
  out.metal = isBracket > 0.5 ? 210 : 0;
  out.h = 0.38 + isBatten * 0.28 + isBracket * 0.10 + (grain - 0.5) * 0.07 - boardSeam * 0.22;
}, 6.5, 6);

// 14. prop_barrel_rust — Ribbed rusty military fuel barrel with faded desert paint & oil drips
writePBRSet('prop_barrel_rust', 1024, false, (u, v, x, y, size, out) => {
  // Two raised rolling hoops at v = 0.33 and v = 0.67 + top/bottom rims
  const hoop1 = smoothstep(0.032, 0.008, Math.abs(v - 0.33));
  const hoop2 = smoothstep(0.032, 0.008, Math.abs(v - 0.67));
  const rim = smoothstep(0.028, 0.006, Math.min(v, 1.0 - v));
  const rib = Math.max(hoop1, hoop2, rim);

  const macro = fbm(u, v, 5, 4, 2309);
  const detail = fbm(u, v, 22, 4, 2341);
  const drip = fbm(u * 5.0, v * 0.8, 6, 3, 2377);

  // Heavy rust near rims, hoops & blotches
  const rust = smoothstep(0.42, 0.72, macro * 0.6 + detail * 0.25 + rib * 0.28 + drip * 0.12);

  // Faded military desert-ochre / olive barrel paint with central muted red-brown hazard stripe
  const stripe = smoothstep(0.085, 0.072, Math.abs(v - 0.5));
  let pr = lerp(118, 146, macro);
  let pg = lerp(108, 132, macro);
  let pb = lerp(78, 96, macro);
  pr = lerp(pr, 136, stripe * 0.7);
  pg = lerp(pg, 64, stripe * 0.7);
  pb = lerp(pb, 48, stripe * 0.7);

  // Flaking rust colors
  const rr = lerp(132, 86, detail);
  const rg = lerp(58, 36, detail);
  const rb = lerp(28, 20, detail);

  let r = lerp(pr, rr, rust);
  let g = lerp(pg, rg, rust);
  let b = lerp(pb, rb, rust);

  // Dark oil drip from top rim
  const oilDrip = smoothstep(0.55, 0.82, drip) * smoothstep(0.42, 0.04, v);
  r = lerp(r, 32, oilDrip * 0.75);
  g = lerp(g, 28, oilDrip * 0.75);
  b = lerp(b, 24, oilDrip * 0.75);

  out.r = r;
  out.g = g;
  out.b = b;
  out.ao = lerp(236, 165, rust * 0.5) - oilDrip * 35;
  out.rough = lerp(lerp(138, 238, rust), 62, oilDrip * 0.85);
  out.metal = lerp(185, 16, clamp01(rust + oilDrip * 0.5));
  out.h = 0.42 + rib * 0.38 + (detail - 0.5) * 0.09 * rust;
}, 7.0, 6);

// ============================================================================
// 1024x1024 ALPHA MASKELİ (7 SETS - RGBA, BC7)
// ============================================================================

// 15. foliage_desert_scrub — Dry desert palm frond / arid scrub bush (alpha masked)
writePBRSet('foliage_desert_scrub', 1024, true, (u, v, x, y, size, out) => {
  // Central stem curving slightly from bottom-center (0.5, 0.98) to top (0.5, 0.08)
  const curveX = 0.5 + Math.sin(v * Math.PI) * 0.04;
  const dx = u - curveX;
  const side = dx >= 0 ? 1 : -1;
  const adx = Math.abs(dx);

  // Main central rachis/stem
  const stemWidth = lerp(0.018, 0.005, 1.0 - v);
  const onStem = (v > 0.07 && v < 0.98) ? smoothstep(stemWidth, stemWidth * 0.45, adx) : 0.0;

  // Radiating dry palm leaflets / desert scrub blades on both sides
  let onLeaf = 0.0;
  let leafCenter = 0.0;
  let leafVar = 0.5;
  const numPairs = 15;
  for (let i = 0; i < numPairs; i++) {
    const t = i / (numPairs - 1); // 0 top .. 1 bottom
    const baseY = lerp(0.12, 0.86, t);
    const baseX = 0.5 + Math.sin(baseY * Math.PI) * 0.04;
    const spread = Math.sin(t * Math.PI * 0.92 + 0.12);
    const len = lerp(0.14, 0.41, spread);
    const angle = lerp(-0.55, 0.18, t) + (hash2(i, side > 0 ? 1 : 2, 2411) - 0.5) * 0.14;
    const tipX = baseX + side * Math.cos(angle) * len;
    const tipY = baseY + Math.sin(angle) * len;

    // Project pixel onto leaflet segment
    const vx = tipX - baseX;
    const vy = tipY - baseY;
    const lenSq = vx * vx + vy * vy;
    const proj = clamp01(((u - baseX) * vx + (v - baseY) * vy) / lenSq);
    const cx = baseX + proj * vx;
    const cy = baseY + proj * vy;
    // Slight downward droop
    const droop = proj * proj * 0.045;
    const d = Math.hypot(u - cx, v - (cy + droop));
    const halfW = lerp(0.019, 0.002, proj) * (0.75 + 0.35 * Math.sin(proj * Math.PI));
    const mask = smoothstep(halfW, halfW * 0.35, d);
    if (mask > onLeaf) {
      onLeaf = mask;
      leafCenter = 1.0 - clamp01(d / (halfW + 1e-5));
      leafVar = hash2(i, side > 0 ? 3 : 4, 2437);
    }
  }

  const alpha = clamp01(Math.max(onStem, onLeaf));
  const noise = fbm(u, v, 14, 3, 2473);

  // Arid olive-khaki & dry straw-tan foliage colors
  const dryMix = clamp01(leafVar * 0.65 + (1.0 - v) * 0.25 + noise * 0.25);
  let r = lerp(84, 154, dryMix);
  let g = lerp(94, 134, dryMix);
  let b = lerp(48, 76, dryMix);

  // Woody stem color
  r = lerp(r, 118, onStem);
  g = lerp(g, 96, onStem);
  b = lerp(b, 64, onStem);

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = alpha * 255.0;
  out.ao = lerp(165, 245, leafCenter * 0.7 + onStem * 0.3);
  out.rough = lerp(188, 232, dryMix);
  out.metal = 0;
  out.h = 0.25 + onLeaf * (0.25 + leafCenter * 0.32) + onStem * 0.45;
}, 5.5, 6);

// 16. decal_sand_drift — Wind-piled desert sand drift mound (soft alpha edge)
writePBRSet('decal_sand_drift', 1024, true, (u, v, x, y, size, out) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const warp = (fbm(u, v, 4, 3, 2503) - 0.5) * 0.35;
  // Elliptical wind-sculpted drift shape
  const dist = Math.hypot(dx * 0.85, dy * 1.25) + warp;
  const alpha = smoothstep(0.95, 0.28, dist);

  const ripple = Math.sin((v * 14.0 + u * 4.0 + warp * 2.5) * TWO_PI) * 0.5 + 0.5;
  const grain = valueNoise(u * 256.0, v * 256.0, 256, 2539);
  const macro = fbm(u, v, 5, 3, 2579);

  out.r = lerp(176, 214, ripple * 0.55 + macro * 0.3 + grain * 0.15);
  out.g = lerp(138, 174, ripple * 0.55 + macro * 0.3 + grain * 0.15);
  out.b = lerp(94, 124, ripple * 0.55 + macro * 0.3 + grain * 0.15);
  out.a = alpha * 255.0;
  out.ao = lerp(208, 248, ripple * 0.6 + alpha * 0.4);
  out.rough = lerp(218, 244, 1.0 - ripple * 0.25);
  out.metal = 0;
  out.h = 0.2 + alpha * (0.45 + ripple * 0.24) + (grain - 0.5) * 0.04;
}, 6.0, 6);

// 17. decal_cracked_mud — Deeply fissured dried desert clay/mud patch (soft alpha edge)
writePBRSet('decal_cracked_mud', 1024, true, (u, v, x, y, size, out) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const shapeNoise = (fbm(u, v, 5, 4, 2609) - 0.5) * 0.45;
  const dist = Math.hypot(dx, dy) + shapeNoise;
  const alpha = smoothstep(0.92, 0.48, dist);

  const wu = u + (fbm(u, v, 8, 3, 2647) - 0.5) * 0.05;
  const wv = v + (fbm(u + 0.3, v + 0.4, 8, 3, 2671) - 0.5) * 0.05;
  const c1 = worley(wu, wv, 9, 2699);
  const crack = smoothstep(0.085, 0.015, c1.edge);
  const curl = smoothstep(0.16, 0.075, c1.edge) * (1.0 - crack);
  const grit = fbm(u, v, 32, 3, 2729);

  // Dried ochre-brown clay plates with dark deep cracks
  let r = lerp(132, 164, c1.id * 0.4 + grit * 0.6);
  let g = lerp(98, 126, c1.id * 0.4 + grit * 0.6);
  let b = lerp(68, 90, c1.id * 0.4 + grit * 0.6);

  r = lerp(r, 44, crack * 0.88);
  g = lerp(g, 32, crack * 0.88);
  b = lerp(b, 22, crack * 0.88);

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = alpha * 255.0;
  out.ao = lerp(238, 62, crack);
  out.rough = lerp(218, 248, crack * 0.5 + grit * 0.5);
  out.metal = 0;
  out.h = 0.55 + curl * 0.14 + (grit - 0.5) * 0.08 - crack * 0.50;
}, 8.5, 6);

// 18. decal_tire_tracks — Dual military vehicle off-road tire tracks pressed into desert sand
writePBRSet('decal_tire_tracks', 1024, true, (u, v, x, y, size, out) => {
  // Two parallel tracks centered at u = 0.28 and u = 0.72, running along V
  const dLeft = Math.abs(u - 0.28);
  const dRight = Math.abs(u - 0.72);
  const dTrack = Math.min(dLeft, dRight);
  const trackHalfW = 0.135;

  // Fade gently at top/bottom V ends
  const endFade = smoothstep(0.0, 0.14, v) * smoothstep(1.0, 0.86, v);
  const trackMask = smoothstep(trackHalfW + 0.045, trackHalfW - 0.015, dTrack) * endFade;
  // Raised displaced sand berms along outer edges of each track
  const bermMask = smoothstep(0.055, 0.012, Math.abs(dTrack - (trackHalfW + 0.02))) * endFade;

  // Chevron off-road military tread lugs
  const chevronPhase = (v * 18.0 + dTrack * 5.2) % 1.0;
  const lug = smoothstep(0.18, 0.34, chevronPhase) * smoothstep(0.84, 0.68, chevronPhase);
  const centerGroove = smoothstep(0.018, 0.005, dTrack);
  const tread = lug * (1.0 - centerGroove) * trackMask;

  const noise = fbm(u, v, 16, 3, 2801);
  const grain = valueNoise(u * 256.0, v * 256.0, 256, 2833);

  // Compressed darker damp-ochre sand inside track, lighter loose sand on berms
  let r = lerp(142, 186, bermMask * 0.7 + (1.0 - tread) * 0.3) + (grain - 0.5) * 14;
  let g = lerp(106, 148, bermMask * 0.7 + (1.0 - tread) * 0.3) + (grain - 0.5) * 12;
  let b = lerp(70, 102, bermMask * 0.7 + (1.0 - tread) * 0.3) + (grain - 0.5) * 10;

  r -= tread * 22;
  g -= tread * 18;
  b -= tread * 14;

  const alpha = clamp01((trackMask * 0.92 + bermMask * 0.62) * (0.78 + 0.22 * noise));

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = alpha * 255.0;
  out.ao = lerp(236, 132, tread) + bermMask * 12;
  out.rough = lerp(218, 244, bermMask * 0.6 + grain * 0.4);
  out.metal = 0;
  out.h = 0.50 + bermMask * 0.22 - trackMask * 0.14 - tread * 0.22 + (grain - 0.5) * 0.04;
}, 7.0, 6);

// 19. decal_helipad_mark — Matte weathered desert-yellow/off-white 'H' helipad circle (0 emission!)
writePBRSet('decal_helipad_mark', 1024, true, (u, v, x, y, size, out) => {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const rad = Math.hypot(dx, dy);

  // Outer circle ring (radius 0.40, thickness 0.055)
  const ring = smoothstep(0.036, 0.024, Math.abs(rad - 0.40));

  // Central 'H' letter
  const leftBar = (Math.abs(dx + 0.115) < 0.036 && Math.abs(dy) < 0.21) ? 1.0 : 0.0;
  const rightBar = (Math.abs(dx - 0.115) < 0.036 && Math.abs(dy) < 0.21) ? 1.0 : 0.0;
  const crossBar = (Math.abs(dy) < 0.036 && Math.abs(dx) < 0.13) ? 1.0 : 0.0;
  const letterH = Math.max(leftBar, rightBar, crossBar);

  const shape = Math.max(ring, letterH);

  // Heavy desert abrasion, chipped paint, and sand drift partially erasing the mark
  const wear = fbm(u, v, 6, 4, 2903);
  const micro = fbm(u, v, 28, 3, 2939);
  const sandDrift = smoothstep(0.56, 0.78, fbm(u + 0.15, v + 0.22, 4, 4, 2969));
  const paintKeep = smoothstep(0.28, 0.58, wear * 0.7 + micro * 0.3) * (1.0 - sandDrift * 0.82);
  const alpha = shape * paintKeep;

  // Matte sun-faded desert yellow-ochre ring + dusty off-white H (ZERO neon/emission!)
  let r = lerp(196, 198, letterH) + (micro - 0.5) * 18;
  let g = lerp(162, 186, letterH) + (micro - 0.5) * 16;
  let b = lerp(74, 152, letterH) + (micro - 0.5) * 14;

  // Dust coating over paint
  r = lerp(r, 178, sandDrift * 0.5);
  g = lerp(g, 148, sandDrift * 0.5);
  b = lerp(b, 108, sandDrift * 0.5);

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = alpha * 255.0;
  out.ao = 232;
  out.rough = lerp(208, 242, micro * 0.5 + sandDrift * 0.5);
  out.metal = 0;
  out.h = 0.50 + alpha * 0.06 + (micro - 0.5) * 0.08;
}, 4.5, 6);

// 20. decal_rubble_gravel — Scattered broken adobe chunks, sandstone rocks & desert gravel
writePBRSet('decal_rubble_gravel', 1024, true, (u, v, x, y, size, out) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const dist = Math.hypot(dx, dy);
  const radialFade = smoothstep(0.96, 0.42, dist);

  // Large angular adobe/sandstone rubble chunks + medium pebbles + fine gravel
  const cBig = worley(u, v, 9, 3001);
  const cMed = worley(u, v, 20, 3037);
  const cSmall = worley(u, v, 42, 3079);
  const surf = fbm(u, v, 24, 3, 3109);

  const bigRock = smoothstep(0.30, 0.14, cBig.d1 + (surf - 0.5) * 0.08) * (cBig.id > 0.48 ? 1.0 : 0.0);
  const medRock = smoothstep(0.28, 0.12, cMed.d1 + (surf - 0.5) * 0.06) * (cMed.id > 0.38 ? 1.0 : 0.0);
  const smallRock = smoothstep(0.26, 0.10, cSmall.d1) * (cSmall.id > 0.32 ? 1.0 : 0.0);

  // Dusty rubble bed underneath chunks
  const dustBed = smoothstep(0.72, 0.25, dist + (surf - 0.5) * 0.28) * 0.58;
  const rockMask = clamp01(Math.max(bigRock, medRock * 0.9, smallRock * 0.8));
  const alpha = clamp01(Math.max(rockMask, dustBed) * radialFade);

  // Color per rock (warm sandstone, terracotta adobe brick, grey-tan limestone)
  const rockId = bigRock > 0.3 ? cBig.id : (medRock > 0.3 ? cMed.id : cSmall.id);
  let rr = lerp(118, 186, rockId) + (surf - 0.5) * 22;
  let rg = lerp(94, 146, rockId) + (surf - 0.5) * 18;
  let rb = lerp(70, 106, rockId) + (surf - 0.5) * 14;

  // Dust bed color
  const dr = 174 + (surf - 0.5) * 16;
  const dg = 140 + (surf - 0.5) * 14;
  const db = 100 + (surf - 0.5) * 12;

  out.r = lerp(dr, rr, rockMask);
  out.g = lerp(dg, rg, rockMask);
  out.b = lerp(db, rb, rockMask);
  out.a = alpha * 255.0;
  out.ao = lerp(175, 245, rockMask * 0.7 + 0.3);
  out.rough = lerp(236, 206, rockMask);
  out.metal = 0;
  out.h = 0.22 + dustBed * 0.12 + smallRock * 0.16 + medRock * 0.28 + bigRock * 0.42 + (surf - 0.5) * 0.08;
}, 7.5, 6);

// 21. decal_oil_scorch — Dark engine oil spill & soot/scorch stain under generators/vehicles
writePBRSet('decal_oil_scorch', 1024, true, (u, v, x, y, size, out) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const warp = (fbm(u, v, 5, 4, 3203) - 0.5) * 0.48;
  const dist = Math.hypot(dx, dy) + warp;

  // Outer matte soot/scorch ring + inner dark viscous oil pool
  const soot = smoothstep(0.95, 0.35, dist);
  const oil = smoothstep(0.56, 0.26, dist + (fbm(u, v, 10, 3, 3251) - 0.5) * 0.22);
  const micro = fbm(u, v, 24, 3, 3299);

  // Very dark charcoal soot transitioning to slick dark-brown/black motor oil
  let r = lerp(52, 22, oil) + (micro - 0.5) * 12;
  let g = lerp(44, 20, oil) + (micro - 0.5) * 10;
  let b = lerp(36, 18, oil) + (micro - 0.5) * 8;

  out.r = r;
  out.g = g;
  out.b = b;
  out.a = clamp01(Math.max(soot * 0.85, oil)) * 255.0;
  out.ao = lerp(210, 145, oil);
  // Glossy oil center (~0.24 roughness) vs matte dry soot rim (~0.92 roughness)
  out.rough = lerp(236, 60, oil);
  out.metal = 0;
  out.h = 0.48 + (micro - 0.5) * 0.08 * (1.0 - oil * 0.7);
}, 3.5, 6);

// ============================================================================
// SUMMARY
// ============================================================================
const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);
const totalMB = (totalPngBytes / 1048576).toFixed(2);
console.log('======================================================================');
console.log(`DONE in ${elapsedSec}s`);
console.log(`Output dir : ${TEX_DIR}`);
console.log(`PNG files  : ${totalPngCount} (expected 63)`);
console.log(`.import    : ${totalImportCount} (expected 63)`);
console.log(`Total PNG  : ${totalMB} MB (target ~40-52 MB)`);
console.log('======================================================================');
