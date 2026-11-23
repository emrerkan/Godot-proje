#!/usr/bin/env node
/**
 * build_port_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map8_Liman_v3 inside asset model/haritalar/Map8_Liman_v3/textures/
 *
 * CRITICAL ART DIRECTION (ALL V3 MAPS & PORT V1 LESSONS):
 * - ZERO glowing/neon floor lines, crosses, or bright glowing water!
 * - Every floor, water, container, crane, prop, and decal texture MUST be non-emissive (0 emission)
 *   dark tactical rain-slicked maritime PBR so unlit quay/ship areas stay pitch-dark and tense,
 *   reacting dramatically to the player's flashlight and wall lamps via strong Normal Map and
 *   Roughness/Metallic contrast!
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map8_Liman_v3');
const TEX_DIR = path.join(OUT_DIR, 'textures');
const COL_TEX_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3', 'textures');
const ORM_TEX_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3', 'textures');
const HOSP_TEX_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map5_Hastane_v3', 'textures');

fs.mkdirSync(TEX_DIR, { recursive: true });

// --- CRC32 Table for PNG Encoder ---
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
function encodePNG(width, height, channels, pixelBuffer) {
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
  const idat = zlib.deflateSync(raw, { level: 4 });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// --- Deterministic Fast Value/FBM Noise ---
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296.0;
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
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 1e-9 ? clamp01((wx * vx + wy * vy) / lenSq) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

// Compute OpenGL Normal map + ARM map from heightfield, AO field, Roughness field, Metalness field
function writePBRSet(baseName, size, isAlpha, evalPixel, bumpScale = 4.5) {
  const diffPath = path.join(TEX_DIR, `${baseName}_Diffuse.png`);
  const norPath = path.join(TEX_DIR, `${baseName}_nor_gl.png`);
  const armPath = path.join(TEX_DIR, `${baseName}_arm.png`);

  const ch = isAlpha ? 4 : 3;
  const diff = Buffer.alloc(size * size * ch);
  const arm = Buffer.alloc(size * size * 3);
  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const res = evalPixel(u, v, x, y, size);
      const dIdx = idx * ch;
      diff[dIdx] = clampByte(res.r);
      diff[dIdx + 1] = clampByte(res.g);
      diff[dIdx + 2] = clampByte(res.b);
      if (isAlpha) diff[dIdx + 3] = clampByte(res.a !== undefined ? res.a : 255);

      const aIdx = idx * 3;
      arm[aIdx] = clampByte(res.ao !== undefined ? res.ao : 230); // R = AO
      arm[aIdx + 1] = clampByte(res.rough !== undefined ? res.rough : 160); // G = Roughness
      arm[aIdx + 2] = clampByte(res.metal !== undefined ? res.metal : 0); // B = Metallic
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
      // OpenGL normal (+Y is up)
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

  fs.writeFileSync(diffPath, encodePNG(size, size, ch, diff));
  fs.writeFileSync(norPath, encodePNG(size, size, 3, nor));
  fs.writeFileSync(armPath, encodePNG(size, size, 3, arm));
  console.log(`Generated PBR set: ${baseName} (${size}x${size})`);
}

// Generate Godot 4 .import file with exact BC7 / BC5 / BC1 VRAM compression
function writeTextureImport(fileName, role) {
  const resPath = `res://asset model/haritalar/Map8_Liman_v3/textures/${fileName}`;
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
// 1. Copy Shared High-Res CC0 Textures from Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3
// ============================================================================
const COPY_FROM_COL = [
  'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png',
  'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg',
  'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg', 'portable_generator_spec_1k.jpg',
  'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg',
  'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg',
  'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg',
  'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png',
  'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg',
  'corrugated_iron_02_2k_Diffuse.jpg', 'corrugated_iron_02_2k_nor_gl.jpg', 'corrugated_iron_02_2k_arm.jpg',
  'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png',
  'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png',
  'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png',
  'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png',
  'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png'
];

const COPY_FROM_ORM = [
  'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png',
  'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg',
  'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg',
  'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg',
  'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png',
  'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png'
];

const COPY_FROM_HOSP = [
  'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png',
  'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png',
  'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png'
];

for (const f of COPY_FROM_COL) {
  fs.copyFileSync(path.join(COL_TEX_DIR, f), path.join(TEX_DIR, f));
}
for (const f of COPY_FROM_ORM) {
  fs.copyFileSync(path.join(ORM_TEX_DIR, f), path.join(TEX_DIR, f));
}
for (const f of COPY_FROM_HOSP) {
  fs.copyFileSync(path.join(HOSP_TEX_DIR, f), path.join(TEX_DIR, f));
}
console.log(`Copied ${COPY_FROM_COL.length + COPY_FROM_ORM.length + COPY_FROM_HOSP.length} shared textures from Map3/Map4/Map5.`);

// ============================================================================
// Helper: 5x7 Military / Maritime Stencil Font (no brand logos, generic codes)
// ============================================================================
const STENCIL_GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '10001', '01110'],
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
        if (Math.abs(cu - 0.5) < 0.042 && (gy === 0 || gy === 3 || gy === 6)) return false;
        if (subX > 0.06 && subX < 0.94 && subY > 0.06 && subY < 0.94) return true;
      }
    }
  }
  return false;
}

// ============================================================================
// 2. Procedurally Generate 12 Custom Night Container Port v3 High-Res PBR Sets
//    (0 emission, rain-slicked industrial maritime night atmosphere)
// ============================================================================

// (1) port_wet_quay_concrete_2k (1024x1024, RGB):
// Rain-soaked heavy port quay concrete slabs (4x4 expansion joints) with wide dark reflective
// rainwater sheets (rough: 28..68 in wet zones so flashlights reflect dramatically!),
// embedded crane rail grooves, salt staining, and tire marks.
writePBRSet('port_wet_quay_concrete_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const tx = Math.floor(u * 4);
  const ty = Math.floor(v * 4);
  const tileSeed = hash2(tx, ty, 1201);

  const nLow = fbm(u, v, 4, 4, 1213);
  const nMid = fbm(u, v, 14, 4, 1229);
  const nHigh = fbm(u, v, 52, 3, 1249);

  // Embedded crane rail grooves running vertically at u = 0.14 and u = 0.86
  const dRail = Math.min(Math.abs(u - 0.14), Math.abs(u - 0.86));
  if (dRail < 0.030) {
    const boltPhase = ((v * 16) % 1) - 0.5;
    if (dRail < 0.008) {
      // Polished rain-slick crane rail steel head
      const crown = 1.0 - (dRail / 0.008) * 0.35;
      const rust = smoothstep(0.62, 0.88, nMid);
      return {
        r: lerp(96, 78, rust) * crown + (nHigh - 0.5) * 10,
        g: lerp(100, 56, rust) * crown + (nHigh - 0.5) * 10,
        b: lerp(104, 42, rust) * crown + (nHigh - 0.5) * 10,
        ao: 210,
        rough: lerp(42, 88, rust),
        metal: lerp(218, 130, rust),
        h: 0.58 + crown * 0.07
      };
    } else if (dRail < 0.019) {
      // Deep dark water-filled flangeway slot next to rail
      return {
        r: 14, g: 18, b: 20,
        ao: 26,
        rough: 30,
        metal: 35,
        h: 0.10
      };
    } else {
      // Heavy steel rail keeper curb plate with periodic anchor bolts
      const isBolt = Math.abs(dRail - 0.0245) < 0.0032 && Math.abs(boltPhase) < 0.14;
      const rust = smoothstep(0.42, 0.78, nMid);
      return {
        r: (isBolt ? 105 : lerp(68, 82, rust)) + (nHigh - 0.5) * 10,
        g: (isBolt ? 102 : lerp(70, 52, rust)) + (nHigh - 0.5) * 10,
        b: (isBolt ? 96 : lerp(72, 36, rust)) + (nHigh - 0.5) * 10,
        ao: isBolt ? 225 : 165,
        rough: isBolt ? 58 : lerp(68, 128, rust),
        metal: isBolt ? 210 : lerp(185, 95, rust),
        h: isBolt ? 0.64 : 0.49
      };
    }
  }

  // 4x4 expansion joint seams
  const edgeDist = Math.min(gx, 1 - gx, gy, 1 - gy);
  const inJoint = edgeDist < 0.020;
  const onChamfer = edgeDist >= 0.020 && edgeDist < 0.042;

  // Base weathered dark coastal quay concrete
  let r = 64 + (tileSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
  let g = 67 + (tileSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
  let b = 70 + (tileSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 15 + (nHigh - 0.5) * 13;
  let ao = 222;
  let rough = 178 + (nMid - 0.5) * 32 + (nHigh - 0.5) * 18;
  let metal = 0;
  let h = 0.54 + (nMid - 0.5) * 0.07 + (nHigh - 0.5) * 0.045;

  // Sea-salt efflorescence staining near slab joints & dry raised concrete edges
  const saltBand = (1.0 - smoothstep(0.03, 0.22, edgeDist)) * smoothstep(0.54, 0.82, nMid * 0.65 + nHigh * 0.35);
  if (saltBand > 0.05) {
    r = lerp(r, 110, saltBand * 0.48);
    g = lerp(g, 112, saltBand * 0.48);
    b = lerp(b, 108, saltBand * 0.46);
    rough = lerp(rough, 218, saltBand * 0.6);
  }

  // Heavy reach-stacker / container truck dual tire tracks along u ~ 0.38 and u ~ 0.62
  const trackDist = Math.min(Math.abs(u - 0.38), Math.abs(u - 0.62));
  if (trackDist < 0.085) {
    const trackEnv = 1.0 - smoothstep(0.035, 0.085, trackDist);
    const treadRib = 0.5 + 0.5 * Math.sin(v * Math.PI * 64 + Math.abs(trackDist) * 45);
    const tireMask = trackEnv * (0.45 + 0.55 * treadRib) * smoothstep(0.28, 0.72, nMid);
    r = lerp(r, 34, tireMask * 0.58);
    g = lerp(g, 35, tireMask * 0.58);
    b = lerp(b, 37, tireMask * 0.58);
    rough = lerp(rough, 112, tireMask * 0.42);
  }

  // Wide dark reflective rainwater sheets (rough: 28..68 in wet zones — dramatic flashlight response!)
  const rainField = nLow * 0.68 + nMid * 0.32;
  const wetSheet = smoothstep(0.42, 0.68, rainField);
  if (wetSheet > 0.02) {
    const deepPuddle = smoothstep(0.60, 0.80, rainField);
    r *= (1.0 - wetSheet * 0.36 - deepPuddle * 0.14);
    g *= (1.0 - wetSheet * 0.34 - deepPuddle * 0.12);
    b *= (1.0 - wetSheet * 0.30 - deepPuddle * 0.10);
    const targetRough = lerp(68, 28, deepPuddle) + (nHigh - 0.5) * 6;
    rough = lerp(rough, targetRough, wetSheet);
    // Standing rainwater levels out micro-bump so specular reflections are crisp
    h = lerp(h, 0.50, deepPuddle * 0.75);
    metal = lerp(metal, 14, deepPuddle);
  }

  if (inJoint) {
    const jt = 1.0 - edgeDist / 0.020;
    h -= 0.22 * jt;
    ao = lerp(ao, 44, jt);
    r *= (1.0 - 0.55 * jt);
    g *= (1.0 - 0.55 * jt);
    b *= (1.0 - 0.55 * jt);
    rough = lerp(rough, 52, jt); // wet water sitting in expansion joint
  } else if (onChamfer) {
    const ct = 1.0 - (edgeDist - 0.020) / 0.022;
    h -= 0.045 * ct;
    ao -= 22 * ct;
  }

  return { r, g, b, ao, rough, metal, h };
}, 5.0);

// (2) port_harbor_water_2k (1024x1024, RGB):
// Pitch-dark deep nocturnal harbor seawater (R:12..24, G:24..40, B:34..54, 0 emission!),
// multi-layered ocean ripple/chop normal map, oil-sheen slick variations, very low roughness
// (18..36) for realistic flashlight/lamp reflections.
writePBRSet('port_harbor_water_2k', 1024, false, (u, v) => {
  const TAU = Math.PI * 2;
  const nLow = fbm(u, v, 4, 4, 2203);
  const nMid = fbm(u, v, 12, 4, 2221);
  const nHigh = fbm(u, v, 36, 3, 2243);

  // Seamless multi-directional ocean swell & harbor chop wave heightfield
  const w1 = Math.sin(TAU * (u * 3 + v * 2) + nLow * 3.4) * 0.24;
  const w2 = Math.sin(TAU * (u * 5 - v * 4) + nMid * 2.8) * 0.16;
  const w3 = Math.cos(TAU * (u * 9 + v * 7) + nMid * 3.6) * 0.10;
  const w4 = Math.sin(TAU * (u * 15 - v * 11) + nHigh * 2.5) * 0.06;
  const chop = (w1 + w2 + w3 + w4) * 0.5 + 0.5;
  const h = clamp01(0.5 + (w1 + w2 + w3 + w4) * 0.65 + (nHigh - 0.5) * 0.14);

  // Pitch-dark deep oceanic night water strictly in R:12..24, G:24..40, B:34..54
  let r = lerp(12, 22, chop * 0.65 + nLow * 0.35);
  let g = lerp(24, 38, chop * 0.65 + nLow * 0.35);
  let b = lerp(34, 52, chop * 0.65 + nLow * 0.35);

  // Subtle dark harbor diesel/oil-sheen slicks (lowers roughness even more, subtle muted tint)
  const slick = smoothstep(0.56, 0.80, fbm(u + 0.25, v + 0.15, 5, 3, 2267));
  if (slick > 0.02) {
    const sheenPhase = Math.sin(slick * 12.0 + nMid * 5.0) * 0.5 + 0.5;
    r = Math.min(24, r + slick * sheenPhase * 4.5);
    g = Math.min(40, g + slick * (1.0 - sheenPhase) * 3.5);
    b = Math.min(54, b + slick * 3.0);
  }

  // Very low roughness (18..36) so flashlight & harbor wall lamps glint realistically off wave facets
  const rough = Math.max(18, Math.min(36, lerp(34, 22, chop) - slick * 6 + (nHigh - 0.5) * 6));
  const metal = lerp(12, 34, slick);
  const ao = Math.round(lerp(185, 245, chop));

  return { r, g, b, ao, rough, metal, h };
}, 6.2);

// (3) port_ship_deck_steel_2k (1024x1024, RGB):
// Cargo freighter painted non-skid steel deck plating — oxidized maritime oxide-red/dark-slate
// anti-slip diamond plate, welded deck seams, salt crust, rust bleed around tie-down D-rings
// (metal: 180, rough: 55..115).
writePBRSet('port_ship_deck_steel_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 3203);
  const nMid = fbm(u, v, 16, 4, 3221);
  const nHigh = fbm(u, v, 56, 3, 3251);

  // 2x2 welded steel deck plates
  const px = (u * 2) % 1;
  const py = (v * 2) % 1;
  const edge = Math.min(px, 1 - px, py, 1 - py);

  // Alternating 45-degree anti-slip diamond tread lugs
  const dpU = (u * 36) % 1;
  const dpV = (v * 36) % 1;
  const cellParity = (Math.floor(u * 36) + Math.floor(v * 36)) % 2;
  const ax = dpU - 0.5;
  const ay = dpV - 0.5;
  const rotA = cellParity === 0 ? (ax + ay) * 0.707 : (ax - ay) * 0.707;
  const rotB = cellParity === 0 ? (ax - ay) * 0.707 : (ax + ay) * 0.707;
  const lugDist = Math.hypot(rotA / 0.35, rotB / 0.11);
  const lug = clamp01(1.0 - smoothstep(0.62, 1.0, lugDist));

  // Base oxidized maritime oxide-red & dark-slate freighter deck paint
  const slateMix = smoothstep(0.32, 0.72, nLow);
  let r = lerp(74, 48, slateMix) + (nMid - 0.5) * 14 + (nHigh - 0.5) * 10;
  let g = lerp(42, 52, slateMix) + (nMid - 0.5) * 12 + (nHigh - 0.5) * 10;
  let b = lerp(38, 58, slateMix) + (nMid - 0.5) * 12 + (nHigh - 0.5) * 10;
  let ao = 212 + lug * 26;
  let rough = 94 - lug * 24 + (nMid - 0.5) * 22;
  let metal = 180 + lug * 32;
  let h = 0.54 + lug * 0.16 + (nHigh - 0.5) * 0.025;

  // Worn bare steel glint on top of raised diamond tread lugs
  if (lug > 0.35) {
    const wear = smoothstep(0.35, 0.85, lug) * smoothstep(0.30, 0.70, nMid);
    r = lerp(r, 98, wear * 0.55);
    g = lerp(g, 102, wear * 0.55);
    b = lerp(b, 106, wear * 0.55);
    rough = lerp(rough, 56, wear * 0.7);
    metal = lerp(metal, 222, wear * 0.7);
  }

  // Recessed cargo tie-down D-ring sockets (center of each 2x2 plate: px=0.5, py=0.5)
  const drDist = Math.hypot(px - 0.5, py - 0.5);
  if (drDist < 0.16) {
    // Rust bleed halo around tie-down socket
    const rustHalo = (1.0 - smoothstep(0.06, 0.16, drDist)) * smoothstep(0.25, 0.72, nMid);
    r = lerp(r, 88, rustHalo * 0.72);
    g = lerp(g, 46, rustHalo * 0.72);
    b = lerp(b, 26, rustHalo * 0.72);
    rough = lerp(rough, 114, rustHalo * 0.65);
    metal = lerp(metal, 130, rustHalo * 0.5);
  }
  if (drDist < 0.068) {
    // Recessed circular tie-down cup + forged steel D-ring bar
    const inCup = drDist < 0.052;
    const isRingBar = Math.abs(px - 0.5) < 0.032 && Math.abs(py - 0.5) < 0.011;
    if (isRingBar) {
      const cyl = Math.sqrt(Math.max(0, 1.0 - (Math.abs(py - 0.5) / 0.011) ** 2));
      r = 92 + cyl * 28; g = 90 + cyl * 26; b = 88 + cyl * 24;
      h = 0.58 + cyl * 0.22;
      ao = 150 + cyl * 85;
      rough = 62;
      metal = 215;
    } else if (inCup) {
      r = 18; g = 16; b = 15;
      h = 0.14;
      ao = 34;
      rough = 108;
      metal = 95;
    } else {
      // Forged steel socket rim
      h = 0.68;
      ao = 195;
      r = 76; g = 74; b = 72;
      rough = 74;
      metal = 205;
    }
  }

  // Welded deck seams (raised ripple weld bead along plate edges)
  if (edge < 0.022) {
    const weldRipple = 0.5 + 0.5 * Math.sin(((px < 0.025 || px > 0.975) ? v : u) * Math.PI * 120);
    const weldProfile = 1.0 - edge / 0.022;
    h = 0.62 + weldProfile * 0.14 + weldRipple * 0.035;
    ao = 155 + weldProfile * 45;
    r = lerp(r, 62, 0.55) + weldRipple * 12;
    g = lerp(g, 56, 0.55) + weldRipple * 10;
    b = lerp(b, 54, 0.55) + weldRipple * 10;
    rough = 84;
    metal = 195;
  } else if (edge < 0.065) {
    // Sea-salt crust buildup alongside weld seams
    const salt = (1.0 - (edge - 0.022) / 0.043) * smoothstep(0.52, 0.80, nMid * 0.6 + nHigh * 0.4);
    if (salt > 0.05) {
      r = lerp(r, 118, salt * 0.55);
      g = lerp(g, 118, salt * 0.55);
      b = lerp(b, 114, salt * 0.55);
      rough = lerp(rough, 115, salt * 0.75);
      metal = lerp(metal, 95, salt * 0.7);
    }
  }

  return {
    r, g, b, ao,
    rough: Math.max(55, Math.min(115, rough)),
    metal,
    h
  };
}, 5.4);

// ============================================================================
// Helper: Corrugated Shipping Container Generator (4 distinct colorways)
// ============================================================================
function generateShippingContainer(baseName, cfg) {
  const { seed, baseR, baseG, baseB, stencilCode, hasDoorBars, sootBias, rustAmount, dents } = cfg;

  writePBRSet(baseName, 1024, false, (u, v) => {
    const nLow = fbm(u, v, 5, 4, seed + 11);
    const nMid = fbm(u, v, 16, 4, seed + 37);
    const nHigh = fbm(u, v, 52, 3, seed + 73);
    const streakNoise = fbm(u * 4.5, v * 0.45, 12, 3, seed + 109);
    const scratchNoise = fbm(u * 3.5, v * 1.2, 24, 3, seed + 149);

    // Top and bottom structural header/sill beams
    const isTopRail = v < 0.075;
    const isBottomRail = v > 0.925;
    const isCornerPost = u < 0.045 || u > 0.955;
    const isFrame = isTopRail || isBottomRail || isCornerPost;

    // Deep vertical trapezoidal corrugation (16 ribs across U)
    const ribCycles = 16;
    const phase = (u * ribCycles) % 1;
    let trap = 0; // 0 = valley, 1 = ridge peak
    if (phase < 0.22) trap = 1.0;
    else if (phase < 0.38) trap = 1.0 - (phase - 0.22) / 0.16;
    else if (phase < 0.72) trap = 0.0;
    else if (phase < 0.88) trap = (phase - 0.72) / 0.16;
    else trap = 1.0;

    // Sharpness along trapezoidal bend edges (where paint chips to bare steel)
    const onBendEdge = (phase > 0.19 && phase < 0.25) || (phase > 0.85 && phase < 0.91);

    let h = isFrame ? 0.84 : (0.20 + trap * 0.58);
    let ao = isFrame ? 225 : (128 + trap * 112);

    // Frame recessed weld line
    if ((Math.abs(v - 0.075) < 0.008) || (Math.abs(v - 0.925) < 0.008) || Math.abs(u - 0.045) < 0.006 || Math.abs(u - 0.955) < 0.006) {
      h -= 0.16;
      ao -= 78;
    }

    // Subtle localized impact dents in container wall
    let dentWear = 0;
    if (!isFrame && dents) {
      for (const dn of dents) {
        const dd = Math.hypot((u - dn.u) / dn.rx, (v - dn.v) / dn.ry);
        if (dd < 1.0) {
          const dt = Math.cos(dd * Math.PI * 0.5);
          h -= dt * dt * dn.depth;
          ao -= dt * 32;
          dentWear = Math.max(dentWear, dt);
        }
      }
    }

    // Base weathered maritime paint
    const fade = (nLow - 0.5) * 18 + (nMid - 0.5) * 14 + (nHigh - 0.5) * 10;
    let r = baseR + fade;
    let g = baseG + fade * 0.92;
    let b = baseB + fade * 0.88;
    let rough = 104 + (nMid - 0.5) * 34 + (1.0 - trap) * 18;
    let metal = 155;

    // Optional door locking-rod shadows & hardware accents near u = 0.095 and u = 0.905
    if (hasDoorBars && !isTopRail && !isBottomRail) {
      const barDist = Math.min(Math.abs(u - 0.095), Math.abs(u - 0.905));
      if (barDist < 0.011) {
        const cyl = Math.sqrt(Math.max(0, 1.0 - (barDist / 0.011) ** 2));
        r = 78 + cyl * 36; g = 82 + cyl * 36; b = 86 + cyl * 38;
        h = 0.78 + cyl * 0.18;
        ao = 165 + cyl * 75;
        rough = 62;
        metal = 220;
      } else if (barDist < 0.024) {
        // Vertical shadow behind locking rod
        const sh = 1.0 - (barDist - 0.011) / 0.013;
        ao -= sh * 65;
        r *= (1.0 - sh * 0.35);
        g *= (1.0 - sh * 0.35);
        b *= (1.0 - sh * 0.35);
      }
    }

    // Faded stenciled maritime serial number band (upper-right u in [0.62, 0.91], v in [0.13, 0.25], 0 emission)
    if (stencilCode && v > 0.12 && v < 0.27 && u > 0.58 && u < 0.93) {
      const inGlyph = sampleStencilText(stencilCode, u, v, 0.60, 0.15, 0.032, 0.082, 0.008);
      if (inGlyph) {
        const chip = smoothstep(0.24, 0.52, nMid * 0.7 + nHigh * 0.3);
        r = lerp(r, 146, chip * 0.82);
        g = lerp(g, 144, chip * 0.82);
        b = lerp(b, 136, chip * 0.82);
        rough = lerp(rough, 142, chip * 0.75);
        metal = lerp(metal, 45, chip * 0.75);
      }
    }

    // Vertical rust streaks dripping down from top rail, corrugation bends, and base splash
    const topDrip = clamp01(1.0 - (v - 0.07) / 0.42) * smoothstep(0.46, 0.78, streakNoise);
    const baseRust = clamp01((v - 0.70) / 0.30) * smoothstep(0.32, 0.74, nLow * 0.55 + nMid * 0.45);
    const patchRust = smoothstep(0.64 - rustAmount * 0.14, 0.86 - rustAmount * 0.10, nLow * 0.6 + nMid * 0.4);
    const rustMask = clamp01(Math.max(topDrip * 0.85, baseRust * 0.9, patchRust * rustAmount));
    if (rustMask > 0.04) {
      r = lerp(r, 86 + (nHigh - 0.5) * 18, rustMask * 0.82);
      g = lerp(g, 42 + (nHigh - 0.5) * 12, rustMask * 0.82);
      b = lerp(b, 24 + (nHigh - 0.5) * 8, rustMask * 0.82);
      rough = lerp(rough, 178, rustMask * 0.85);
      metal = lerp(metal, 65, rustMask * 0.8);
      h -= rustMask * 0.025;
    }

    // Salt corrosion / dark rain grime & soot streaks
    const grime = smoothstep(0.45, 0.82, streakNoise * 0.65 + nLow * 0.35) * sootBias;
    if (grime > 0.04) {
      r *= (1.0 - grime * 0.42);
      g *= (1.0 - grime * 0.42);
      b *= (1.0 - grime * 0.40);
      rough = lerp(rough, 148, grime * 0.45);
    }
    const salt = clamp01((v - 0.62) / 0.38) * smoothstep(0.68, 0.88, nMid * 0.6 + nHigh * 0.4);
    if (salt > 0.05) {
      r = lerp(r, 114, salt * 0.38);
      g = lerp(g, 116, salt * 0.38);
      b = lerp(b, 114, salt * 0.38);
      rough = lerp(rough, 195, salt * 0.5);
    }

    // Chipped bare steel edges along corrugation ridges, dents, and scratches
    const bareSteel = clamp01(
      (onBendEdge ? smoothstep(0.48, 0.76, nMid) * 0.85 : 0) +
      dentWear * 0.75 +
      smoothstep(0.80, 0.90, scratchNoise) * 0.7
    );
    if (bareSteel > 0.08) {
      r = lerp(r, 118, bareSteel * 0.75);
      g = lerp(g, 122, bareSteel * 0.75);
      b = lerp(b, 126, bareSteel * 0.75);
      rough = lerp(rough, 54, bareSteel * 0.82);
      metal = lerp(metal, 224, bareSteel * 0.85);
    }

    return { r, g, b, ao, rough, metal, h };
  }, 5.8);
}

// (4) port_container_red_2k (1024x1024, RGB)
generateShippingContainer('port_container_red_2k', {
  seed: 4201,
  baseR: 96, baseG: 36, baseB: 30,
  stencilCode: 'CRG 4082',
  hasDoorBars: false,
  sootBias: 0.45,
  rustAmount: 0.85,
  dents: [
    { u: 0.28, v: 0.52, rx: 0.07, ry: 0.11, depth: 0.18 },
    { u: 0.72, v: 0.64, rx: 0.055, ry: 0.09, depth: 0.15 }
  ]
});

// (5) port_container_navy_2k (1024x1024, RGB)
generateShippingContainer('port_container_navy_2k', {
  seed: 5201,
  baseR: 30, baseG: 46, baseB: 68,
  stencilCode: 'MRN 7194',
  hasDoorBars: true,
  sootBias: 0.52,
  rustAmount: 0.72,
  dents: [
    { u: 0.44, v: 0.38, rx: 0.08, ry: 0.10, depth: 0.20 },
    { u: 0.66, v: 0.74, rx: 0.06, ry: 0.085, depth: 0.16 }
  ]
});

// (6) port_container_olive_2k (1024x1024, RGB)
generateShippingContainer('port_container_olive_2k', {
  seed: 6201,
  baseR: 46, baseG: 58, baseB: 38,
  stencilCode: 'LOG 3051',
  hasDoorBars: false,
  sootBias: 0.62,
  rustAmount: 0.95,
  dents: [
    { u: 0.33, v: 0.68, rx: 0.075, ry: 0.095, depth: 0.19 },
    { u: 0.78, v: 0.44, rx: 0.06, ry: 0.09, depth: 0.15 }
  ]
});

// (7) port_container_ochre_2k (1024x1024, RGB)
generateShippingContainer('port_container_ochre_2k', {
  seed: 7201,
  baseR: 112, baseG: 82, baseB: 34,
  stencilCode: 'FRT 9240',
  hasDoorBars: false,
  sootBias: 0.74,
  rustAmount: 0.80,
  dents: [
    { u: 0.52, v: 0.56, rx: 0.065, ry: 0.10, depth: 0.17 },
    { u: 0.22, v: 0.34, rx: 0.05, ry: 0.08, depth: 0.14 }
  ]
});

// (8) hero_gantry_crane_red_2k (1024x1024, RGB):
// Giant STS Container Gantry Crane & Cargo Ship Hull steel atlas — weathered maritime crimson-red
// & charcoal-iron girder plating, heavy bolted splice plates, rust drips, and diagonal black/ochre
// marine hazard trim (0 emission, metal: 195, rough: 60..120).
writePBRSet('hero_gantry_crane_red_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 8201);
  const nMid = fbm(u, v, 16, 4, 8221);
  const nHigh = fbm(u, v, 54, 3, 8243);
  const dripNoise = fbm(u * 4.0, v * 0.4, 14, 3, 8269);

  // Atlas split:
  // v in [0.00..0.60]: Heavy crimson-red STS crane boom & girder plates
  // v in [0.60..0.84]: Charcoal-iron hull / machinery house girder plating
  // v in [0.84..0.94]: Diagonal black/ochre marine hazard trim band (0 emission)
  // v in [0.94..1.00]: Charcoal-iron lower flange
  const px = (u * 2) % 1;
  const py = (v * 2) % 1;
  const edge = Math.min(px, 1 - px, py, 1 - py);

  const isCharcoalBand = (v >= 0.60 && v < 0.84) || v >= 0.94;
  const isHazardBand = v >= 0.84 && v < 0.94;

  // Heavy bolted splice plate straps crossing vertically at u = 0.0, 0.5 and horizontally at v = 0.60
  const onSpliceV = Math.min(px, 1 - px) < 0.068;
  const onSpliceH = Math.abs(v - 0.60) < 0.042;
  const onSplice = (onSpliceV || onSpliceH) && !isHazardBand;

  let r = isCharcoalBand ? 44 : 106;
  let g = isCharcoalBand ? 48 : 34;
  let b = isCharcoalBand ? 54 : 30;
  r += (nLow - 0.5) * 16 + (nMid - 0.5) * 12 + (nHigh - 0.5) * 8;
  g += (nLow - 0.5) * 12 + (nMid - 0.5) * 10 + (nHigh - 0.5) * 8;
  b += (nLow - 0.5) * 12 + (nMid - 0.5) * 10 + (nHigh - 0.5) * 8;

  let ao = 220;
  let rough = 86 + (nMid - 0.5) * 28;
  let metal = 195;
  let h = 0.54 + (nMid - 0.5) * 0.025 + (nHigh - 0.5) * 0.015;

  // Panel seam bevel
  if (edge < 0.012 && !isHazardBand) {
    h = 0.24;
    ao = 52;
    r *= 0.48; g *= 0.48; b *= 0.48;
  }

  // Heavy bolted splice plates
  if (onSplice) {
    h = 0.72;
    ao = 205;
    r = lerp(r, isCharcoalBand ? 54 : 92, 0.45);
    g = lerp(g, isCharcoalBand ? 58 : 32, 0.45);
    b = lerp(b, isCharcoalBand ? 62 : 28, 0.45);
    // Hex bolt grid along splice strap
    const bx = ((u * 24) % 1) - 0.5;
    const by = ((v * 24) % 1) - 0.5;
    const bDist = Math.hypot(bx, by);
    if (bDist < 0.22) {
      const dome = Math.sqrt(Math.max(0, 1.0 - (bDist / 0.22) ** 2));
      h = 0.74 + dome * 0.22;
      ao = 175 + dome * 65;
      r += dome * 28; g += dome * 26; b += dome * 24;
      rough = 62;
      metal = 222;
    }
  }

  // Diagonal black/ochre marine hazard trim (0 emission, weathered)
  if (isHazardBand) {
    const stripe = (((u * 14 + v * 14) % 1) + 1) % 1;
    const isOchre = stripe < 0.5;
    const chip = smoothstep(0.28, 0.56, nMid * 0.65 + nHigh * 0.35);
    if (chip > 0.08) {
      r = lerp(r, isOchre ? 126 : 24, chip * 0.90);
      g = lerp(g, isOchre ? 92 : 26, chip * 0.90);
      b = lerp(b, isOchre ? 28 : 28, chip * 0.90);
      rough = lerp(rough, isOchre ? 98 : 112, chip * 0.85);
      metal = lerp(metal, 88, chip * 0.75);
      h += 0.02 * chip;
    }
  }

  // Rust drips weeping below splice plates and girder joints
  const belowSpliceH = v > 0.64 && v < 0.83;
  const nearSpliceV = Math.min(px, 1 - px) < 0.11;
  const dripZone = (belowSpliceH ? clamp01(1.0 - (v - 0.64) / 0.19) : 0) + (nearSpliceV ? 0.55 : 0);
  const rustDrip = clamp01(dripZone * smoothstep(0.46, 0.78, dripNoise));
  if (rustDrip > 0.05) {
    r = lerp(r, 88, rustDrip * 0.75);
    g = lerp(g, 44, rustDrip * 0.75);
    b = lerp(b, 24, rustDrip * 0.75);
    rough = lerp(rough, 118, rustDrip * 0.85);
    metal = lerp(metal, 115, rustDrip * 0.75);
  }

  // Bare steel edge wear along splice borders
  const onSpliceEdge = Math.abs(Math.min(px, 1 - px) - 0.068) < 0.008 || Math.abs(Math.abs(v - 0.60) - 0.042) < 0.008;
  if (onSpliceEdge && !isHazardBand && nMid > 0.45) {
    r = lerp(r, 122, 0.65); g = lerp(g, 126, 0.65); b = lerp(b, 130, 0.65);
    rough = 60;
    metal = 225;
  }

  return {
    r, g, b, ao,
    rough: Math.max(60, Math.min(120, rough)),
    metal,
    h
  };
}, 5.5);

// (9) decal_port_dock_markings (512x512, RGBA for alphaMode: "MASK"):
// Worn, salt-eroded yellow/white port container bay parking lines, numbered berth stencils
// ("B-04", "QUAY"), and safety edge chevrons (0 emission!).
writePBRSet('decal_port_dock_markings', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 9203);
  const nMid = fbm(u, v, 24, 3, 9227);
  const nHigh = fbm(u, v, 60, 3, 9257);

  // Container bay corner parking brackets (top-left and top-right L-marks)
  const inTopBar = v > 0.08 && v < 0.135 && ((u > 0.08 && u < 0.34) || (u > 0.66 && u < 0.92));
  const inSideBar = v > 0.08 && v < 0.38 && ((u > 0.08 && u < 0.135) || (u > 0.865 && u < 0.92));
  const isBayLine = inTopBar || inSideBar;

  // Numbered berth stencil "B-04" (upper center) and "QUAY" (middle)
  const isTextB04 = sampleStencilText('B-04', u, v, 0.24, 0.22, 0.105, 0.19, 0.032);
  const isTextQuay = sampleStencilText('QUAY', u, v, 0.22, 0.48, 0.11, 0.16, 0.035);

  // Safety edge diagonal chevrons along bottom edge (v in [0.74, 0.90])
  let isChevron = false;
  if (v >= 0.74 && v <= 0.90 && u >= 0.08 && u <= 0.92) {
    const chPhase = (((u * 8 + v * 8) % 1) + 1) % 1;
    if (chPhase < 0.48) isChevron = true;
  }

  if (!isBayLine && !isTextB04 && !isTextQuay && !isChevron) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Heavy salt erosion & tire scuff breakup for alphaMode: "MASK"
  const scuff = fbm(u * 0.8, v * 3.8, 12, 3, 9281);
  const survive = nLow * 0.45 + nMid * 0.35 + nHigh * 0.20 - smoothstep(0.58, 0.84, scuff) * 0.44;
  if (survive < 0.28) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Weathered maritime ochre-yellow for bay lines & chevrons, salt-faded white for stencils (0 emission)
  const isYellow = isBayLine || isChevron;
  const grime = smoothstep(0.42, 0.80, nLow);
  const r = lerp(isYellow ? 142 : 146, 74, grime * 0.45) + (nHigh - 0.5) * 16;
  const g = lerp(isYellow ? 108 : 144, 70, grime * 0.45) + (nHigh - 0.5) * 14;
  const b = lerp(isYellow ? 34 : 136, 62, grime * 0.45) + (nHigh - 0.5) * 12;

  return {
    r, g, b,
    a: 255,
    ao: 215,
    rough: 158 + (nMid - 0.5) * 34,
    metal: 0,
    h: 0.55 + (nHigh - 0.5) * 0.025
  };
}, 3.2);

// (10) decal_rain_puddle_slick (512x512, RGBA for alphaMode: "MASK"):
// Large irregular reflective rainwater & diesel-sheen puddle on the quay (rough: 14..30,
// metal: 25, 0 emission — catches flashlight beam like a mirror!).
const PUDDLE_DROPS = [
  { u: 0.42, v: 0.46, r0: 0.09 },
  { u: 0.62, v: 0.54, r0: 0.07 },
  { u: 0.36, v: 0.62, r0: 0.06 }
];
writePBRSet('decal_rain_puddle_slick', 512, true, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 10201);
  const nMid = fbm(u, v, 14, 4, 10223);
  const nHigh = fbm(u, v, 40, 3, 10253);

  // Irregular multi-lobed puddle shape
  const d1 = Math.hypot((u - 0.48) / 0.38, (v - 0.50) / 0.32);
  const d2 = Math.hypot((u - 0.64) / 0.24, (v - 0.58) / 0.22);
  const d = Math.min(d1, d2) + (nLow - 0.5) * 0.48 + (nMid - 0.5) * 0.18;

  if (d > 0.96) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  const depth = clamp01(1.0 - d / 0.96);

  // Subtle concentric raindrop ripple rings in heightfield
  let ripple = 0;
  for (const dr of PUDDLE_DROPS) {
    const rd = Math.hypot(u - dr.u, v - dr.v);
    if (rd < dr.r0) {
      ripple += Math.sin(rd * 190) * (1.0 - rd / dr.r0) * 0.028;
    }
  }

  // Subtle dark diesel-sheen swirl inside puddle (strictly dark, 0 emission)
  const swirl = fbm(u * 1.4 + nLow * 0.4, v * 1.4 + nMid * 0.4, 8, 3, 10273);
  const sheen = smoothstep(0.48, 0.78, swirl) * depth;
  const irid = Math.sin(swirl * 18.0) * 0.5 + 0.5;

  const r = 18 + sheen * (10 + irid * 14) + (nHigh - 0.5) * 4;
  const g = 24 + sheen * (14 + (1.0 - irid) * 12) + (nHigh - 0.5) * 4;
  const b = 28 + sheen * (16 + irid * 10) + (nHigh - 0.5) * 4;

  return {
    r, g, b,
    a: 255,
    ao: Math.round(lerp(185, 225, depth)),
    rough: Math.max(14, Math.min(30, lerp(30, 14, depth) + (nHigh - 0.5) * 4)),
    metal: Math.round(lerp(18, 32, sheen)),
    h: 0.50 + ripple
  };
}, 3.8);

// (11) decal_rust_blood_drag (512x512, RGBA for alphaMode: "MASK"):
// Container-base orange rust bleed mixed with dark coagulated blood drag trails and wet boot prints
// (0 emission, rough: 28..65).
writePBRSet('decal_rust_blood_drag', 512, true, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 11201);
  const nMid = fbm(u, v, 18, 4, 11227);
  const nHigh = fbm(u, v, 52, 3, 11251);

  // Container-base rust bleed footprint along left-top edge (u in [0.10..0.46], v in [0.14..0.52])
  const boxDx = Math.max(0, Math.abs(u - 0.28) - 0.14);
  const boxDy = Math.max(0, Math.abs(v - 0.34) - 0.15);
  const rustDist = Math.hypot(boxDx, boxDy) + (nLow - 0.5) * 0.12 + (nMid - 0.5) * 0.05;
  const inRust = rustDist < 0.095 && (nLow * 0.6 + nMid * 0.4) > 0.34;

  // Dark coagulated arterial blood drag trails stretching from (0.30, 0.38) to (0.86, 0.78)
  const dragDist = distToSegment(u, v, 0.30, 0.38, 0.86, 0.78);
  const dragStreak = Math.sin((u * -0.62 + v * 0.78) * 145 + nMid * 4.5) * 0.5 + 0.5;
  const inDrag = dragDist < 0.095 && dragStreak > 0.36 && nLow > 0.30;

  // Blood pool origin near container corner (0.34, 0.42)
  const poolDist = Math.hypot((u - 0.34) / 0.16, (v - 0.42) / 0.14) + (nLow - 0.5) * 0.45 + (nMid - 0.5) * 0.2;
  const inPool = poolDist < 0.85;

  // Wet bloody combat boot prints
  let inBoot = false;
  const boots = [
    { u: 0.62, v: 0.32, ang: 0.52 },
    { u: 0.76, v: 0.46, ang: 0.68 },
    { u: 0.48, v: 0.74, ang: -0.35 }
  ];
  for (const bp of boots) {
    const dx = u - bp.u;
    const dy = v - bp.v;
    const lx = dx * Math.cos(bp.ang) + dy * Math.sin(bp.ang);
    const ly = -dx * Math.sin(bp.ang) + dy * Math.cos(bp.ang);
    const sole = Math.hypot(lx / 0.042, (ly - 0.028) / 0.052) < 1.0;
    const heel = Math.hypot(lx / 0.036, (ly + 0.048) / 0.036) < 1.0;
    if (sole || heel) {
      const lugs = (Math.sin(ly * 250) > -0.15) && (Math.abs(lx) > 0.008 || Math.sin(lx * 185) > 0);
      if (lugs && nMid > 0.26) inBoot = true;
    }
  }

  if (!inRust && !inDrag && !inPool && !inBoot) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Blood sits on top of rust bleed
  if (inPool || inDrag || inBoot) {
    const core = inPool ? clamp01(1.0 - poolDist / 0.85) : 0.35;
    return {
      r: lerp(48, 76, core * 0.7 + nMid * 0.3),
      g: lerp(7, 12, core * 0.5),
      b: lerp(8, 13, core * 0.5),
      a: 255,
      ao: Math.round(lerp(185, 140, core)),
      rough: Math.max(28, Math.min(65, lerp(56, 28, core) + (nHigh - 0.5) * 10)),
      metal: 14,
      h: 0.53 + core * 0.06
    };
  }

  // Damp orange-brown container-base rust bleed
  const rustCore = clamp01(1.0 - rustDist / 0.095);
  return {
    r: 86 + rustCore * 26 + (nHigh - 0.5) * 16,
    g: 40 + rustCore * 12 + (nHigh - 0.5) * 10,
    b: 18 + (nHigh - 0.5) * 8,
    a: 255,
    ao: 175,
    rough: Math.max(28, Math.min(65, 58 - rustCore * 14 + (nMid - 0.5) * 12)),
    metal: 22,
    h: 0.51 + (nHigh - 0.5) * 0.025
  };
}, 4.5);

// (12) decal_cargo_manifest_debris (512x512, RGBA for alphaMode: "MASK"):
// Scattered wet customs manifest sheets, snapped steel banding straps, frayed hemp mooring rope
// coils, and splintered pallet wood (0 emission).
const MANIFEST_SHEETS = [
  { u: 0.32, v: 0.28, w: 0.13, h: 0.17, ang: 0.28 },
  { u: 0.66, v: 0.34, w: 0.12, h: 0.16, ang: -0.46 },
  { u: 0.56, v: 0.72, w: 0.11, h: 0.15, ang: 0.82 }
];
const PALLET_SPLINTERS = [
  { u: 0.74, v: 0.66, len: 0.20, w: 0.024, ang: 0.42 },
  { u: 0.68, v: 0.78, len: 0.16, w: 0.019, ang: -0.25 },
  { u: 0.26, v: 0.76, len: 0.14, w: 0.020, ang: 1.15 },
  { u: 0.80, v: 0.48, len: 0.13, w: 0.016, ang: -1.05 }
];
const STEEL_STRAPS = [
  [0.14, 0.44, 0.52, 0.40],
  [0.52, 0.40, 0.78, 0.22],
  [0.44, 0.56, 0.84, 0.60]
];

writePBRSet('decal_cargo_manifest_debris', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 12203);
  const nMid = fbm(u, v, 24, 3, 12227);
  const nHigh = fbm(u, v, 64, 3, 12251);

  // 1. Frayed hemp mooring rope coil centered around (0.28, 0.58)
  const ru = u - 0.28;
  const rv = v - 0.58;
  const rRad = Math.hypot(ru, rv);
  const rAng = Math.atan2(rv, ru);
  const spiralR = 0.065 + ((rAng + Math.PI) / (Math.PI * 2)) * 0.022;
  // Concentric 3-loop mooring rope coil
  let ropeDist = 1.0;
  for (let loop = 0; loop < 3; loop++) {
    const targetR = spiralR + loop * 0.036;
    const dLoop = Math.abs(rRad - targetR);
    if (dLoop < ropeDist) ropeDist = dLoop;
  }
  const ropeHalfW = 0.0145;
  if (rRad > 0.045 && rRad < 0.185 && ropeDist < ropeHalfW) {
    const cyl = Math.sqrt(Math.max(0, 1.0 - (ropeDist / ropeHalfW) ** 2));
    const twist = 0.5 + 0.5 * Math.sin(rAng * 42 + rRad * 260);
    const fiber = (nHigh - 0.5) * 16;
    const shade = (0.55 + 0.45 * cyl) * (0.82 + 0.18 * twist);
    return {
      r: (96 + fiber) * shade,
      g: (78 + fiber) * shade,
      b: (52 + fiber) * shade,
      a: 255,
      ao: Math.round(115 + cyl * 115),
      rough: 192 + (1.0 - cyl) * 32,
      metal: 0,
      h: 0.62 + cyl * 0.28 + twist * 0.04
    };
  }

  // 2. Snapped metallic steel cargo banding straps
  for (const st of STEEL_STRAPS) {
    const bend = Math.sin((u + v) * 18) * 0.014;
    const d = distToSegment(u, v + bend, st[0], st[1], st[2], st[3]);
    if (d < 0.0085) {
      const edgeFade = 1.0 - d / 0.0085;
      const rust = smoothstep(0.55, 0.82, nMid);
      return {
        r: lerp(84, 78, rust) + edgeFade * 20,
        g: lerp(88, 48, rust) + edgeFade * 20,
        b: lerp(94, 30, rust) + edgeFade * 20,
        a: 255,
        ao: 195,
        rough: lerp(54, 118, rust),
        metal: lerp(210, 115, rust),
        h: 0.64 + edgeFade * 0.08
      };
    }
  }

  // 3. Splintered damp pallet wood planks
  for (const sp of PALLET_SPLINTERS) {
    const dx = u - sp.u;
    const dy = v - sp.v;
    const lx = dx * Math.cos(sp.ang) + dy * Math.sin(sp.ang);
    const ly = -dx * Math.sin(sp.ang) + dy * Math.cos(sp.ang);
    const taper = 1.0 - smoothstep(0.65, 1.0, Math.abs(lx) / (sp.len * 0.5)) * 0.65;
    if (Math.abs(lx) < sp.len * 0.5 && Math.abs(ly) < sp.w * 0.5 * taper) {
      const grain = fbm(lx * 2.5 + 0.5, ly * 18.0 + 0.5, 16, 3, 12289);
      const crown = Math.sqrt(Math.max(0, 1.0 - (ly / (sp.w * 0.5 * taper)) ** 2));
      return {
        r: (78 + (grain - 0.5) * 26) * (0.72 + 0.28 * crown),
        g: (58 + (grain - 0.5) * 20) * (0.72 + 0.28 * crown),
        b: (40 + (grain - 0.5) * 14) * (0.72 + 0.28 * crown),
        a: 255,
        ao: Math.round(145 + crown * 85),
        rough: 148 + (nMid - 0.5) * 32,
        metal: 0,
        h: 0.58 + crown * 0.18 + (grain - 0.5) * 0.04
      };
    }
  }

  // 4. Scattered wet customs manifest paper sheets
  for (const sh of MANIFEST_SHEETS) {
    const dx = u - sh.u;
    const dy = v - sh.v;
    const lx = dx * Math.cos(sh.ang) + dy * Math.sin(sh.ang);
    const ly = -dx * Math.sin(sh.ang) + dy * Math.cos(sh.ang);
    const halfW = sh.w * 0.5;
    const halfH = sh.h * 0.5;
    if (Math.abs(lx) < halfW && Math.abs(ly) < halfH) {
      const pu = (lx + halfW) / sh.w;
      const pv = (ly + halfH) / sh.h;
      // Torn wet corner check
      if (pu > 0.82 && pv > 0.84 && nMid < 0.52) continue;

      // Dark printed manifest table header & text lines
      const isHeader = pv > 0.10 && pv < 0.18 && pu > 0.12 && pu < 0.88;
      const isLine = pv > 0.24 && pv < 0.82 && pu > 0.12 && pu < 0.84 && ((pv * 18) % 1) < 0.34;
      const isInk = (isHeader || (isLine && nHigh > 0.38));
      const isStamp = Math.hypot(pu - 0.72, pv - 0.74) < 0.11;

      const damp = smoothstep(0.32, 0.78, nLow * 0.6 + nMid * 0.4);
      let r = lerp(128, 86, damp) + (nHigh - 0.5) * 12;
      let g = lerp(124, 84, damp) + (nHigh - 0.5) * 12;
      let b = lerp(114, 78, damp) + (nHigh - 0.5) * 10;

      if (isInk) {
        r *= 0.42; g *= 0.42; b *= 0.44;
      } else if (isStamp) {
        r = lerp(r, 98, 0.55); g = lerp(g, 36, 0.55); b = lerp(b, 32, 0.55);
      }

      return {
        r, g, b,
        a: 255,
        ao: 205,
        rough: lerp(138, 68, damp),
        metal: 0,
        h: 0.54 + (nMid - 0.5) * 0.045
      };
    }
  }

  return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
}, 4.8);

// ============================================================================
// 3. Write .import files for ALL textures in TEX_DIR (BC7 color / BC5 normal / BC1 arm)
// ============================================================================
const allTexFiles = fs.readdirSync(TEX_DIR).filter(f => (f.endsWith('.png') || f.endsWith('.jpg')) && !f.endsWith('.import'));
for (const f of allTexFiles) {
  let role = 'color';
  if (f.includes('_nor_gl')) role = 'normal';
  else if (f.includes('_arm') || f.includes('_rough') || f.includes('_spec')) role = 'arm';
  writeTextureImport(f, role);
}

// ============================================================================
// 4. Write CREDITS.txt
// ============================================================================
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map8_Liman_v3 (Night Container Port) PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K Night Container Port PBR textures (0 emission, rain-slicked industrial maritime night palette, flashlight-reactive normal & roughness/metallic):
  port_wet_quay_concrete_2k, port_harbor_water_2k, port_ship_deck_steel_2k,
  port_container_red_2k, port_container_navy_2k, port_container_olive_2k, port_container_ochre_2k,
  hero_gantry_crane_red_2k, decal_port_dock_markings, decal_rain_puddle_slick,
  decal_rust_blood_drag, decal_cargo_manifest_debris.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
