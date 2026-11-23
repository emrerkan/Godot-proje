#!/usr/bin/env node
/**
 * build_maze_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map0_Labirent_v3 inside asset model/haritalar/Map0_Labirent_v3/textures/
 *
 * CRITICAL ART DIRECTION (ALL V3 MAPS LESSONS):
 * - ZERO glowing/neon floor lines, crosses, or bright glowing surfaces!
 * - Every floor, wall, prop, and decal texture MUST be non-emissive (0 emission) dark tactical PBR
 *   (0.07..0.34 linear albedo average) so unlit labyrinth corridors stay pitch-dark and tense,
 *   reacting dramatically to the player's flashlight via strong Normal Map and Roughness/Metallic contrast!
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map0_Labirent_v3');
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
  const resPath = `res://asset model/haritalar/Map0_Labirent_v3/textures/${fileName}`;
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
// 2. Procedurally Generate 10 Custom Classic Bunker Maze v3 High-Res PBR Sets
//    (0 emission, gritty Cold-War subterranean military bunker & catacomb)
// ============================================================================

// Precomputed deterministic impact / spall sites for bunker_concrete_wall_2k
const BULLET_HOLES = [
  { u: 0.17, v: 0.56, r: 0.015 },
  { u: 0.21, v: 0.59, r: 0.011 },
  { u: 0.24, v: 0.54, r: 0.013 },
  { u: 0.68, v: 0.48, r: 0.016 },
  { u: 0.72, v: 0.51, r: 0.012 },
  { u: 0.85, v: 0.63, r: 0.014 },
  { u: 0.44, v: 0.71, r: 0.012 }
];
const SPALL_PATCHES = [
  { u: 0.34, v: 0.64, rx: 0.095, ry: 0.068 },
  { u: 0.79, v: 0.28, rx: 0.075, ry: 0.055 }
];

// (1) bunker_concrete_wall_2k (1024x1024, RGB):
// Heavy board-formed Cold-War military bunker reinforced concrete wall — horizontal timber formwork
// plank impressions, circular tie-rod anchor holes (AO cavities), damp dark-olive seepage at base
// (v < 0.25), faded military olive-drab & weathered ochre identification stripe (v in [0.35, 0.42],
// 0 emission), bullet pockmarks, and spalled concrete exposing rusted rebar.
writePBRSet('bunker_concrete_wall_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 4, 4, 1101);
  const nMid = fbm(u, v, 14, 4, 1109);
  const nHigh = fbm(u, v, 48, 3, 1123);

  // Horizontal timber formwork planks (12 rows)
  const plankCount = 12;
  const pv = (v * plankCount) % 1;
  const plankIdx = Math.floor(v * plankCount);
  const plankSeed = hash2(plankIdx, 7, 1141);
  const woodGrain = fbm(u, v * 0.25 + plankSeed * 4.0, 24, 3, 1151 + plankIdx * 5);
  const plankSeam = (pv < 0.032 || pv > 0.968);
  const verticalFormJoint = Math.abs(((u * 2 + (plankIdx % 2) * 0.5) % 1) - 0.5) < 0.005;

  // Base Cold-War raw bunker concrete (dark cool-warm grey, linear albedo ~0.12..0.22)
  let r = 82 + (plankSeed - 0.5) * 14 + (nLow - 0.5) * 20 + (nMid - 0.5) * 16 + (woodGrain - 0.5) * 10 + (nHigh - 0.5) * 10;
  let g = 84 + (plankSeed - 0.5) * 14 + (nLow - 0.5) * 20 + (nMid - 0.5) * 16 + (woodGrain - 0.5) * 10 + (nHigh - 0.5) * 10;
  let b = 80 + (plankSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 15 + (woodGrain - 0.5) * 9 + (nHigh - 0.5) * 9;
  let ao = 220 + (nMid - 0.5) * 24;
  let rough = 192 + (nMid - 0.5) * 32 + (nHigh - 0.5) * 18;
  let metal = 0;
  let h = 0.56 + (plankSeed - 0.5) * 0.05 + (woodGrain - 0.5) * 0.05 + (nMid - 0.5) * 0.08 + (nHigh - 0.5) * 0.04;

  // Raised concrete flash ridges along formwork seams
  if (plankSeam) {
    const ridge = pv < 0.032 ? (1.0 - pv / 0.032) : ((pv - 0.968) / 0.032);
    h += 0.07 * ridge;
    r -= 12 * ridge; g -= 12 * ridge; b -= 11 * ridge;
    ao -= 32 * ridge;
  }
  if (verticalFormJoint) {
    h -= 0.08;
    ao -= 48;
    r -= 16; g -= 16; b -= 15;
  }

  // Faded military olive-drab & weathered ochre identification stripe (v in [0.35, 0.42], 0 emission)
  if (v >= 0.35 && v <= 0.42) {
    const paintWear = fbm(u, v, 20, 4, 1187);
    const chipMask = smoothstep(0.28, 0.52, paintWear);
    if (chipMask > 0.05) {
      // Top thin ochre border, main olive-drab band, bottom thin ochre border
      const isOchreBand = (v < 0.365 || v > 0.405);
      const pr = isOchreBand ? 116 : 64;
      const pg = isOchreBand ? 94 : 74;
      const pb = isOchreBand ? 46 : 52;
      r = lerp(r, pr + (nHigh - 0.5) * 14, chipMask * 0.85);
      g = lerp(g, pg + (nHigh - 0.5) * 14, chipMask * 0.85);
      b = lerp(b, pb + (nHigh - 0.5) * 10, chipMask * 0.85);
      rough = lerp(rough, 148 + (nMid - 0.5) * 28, chipMask * 0.8);
      h += 0.015 * chipMask;
    }
  }

  // Circular tie-rod anchor holes (4x3 grid) + downward rust/moisture streaks
  const trU = ((u * 4 + 0.5) % 1) - 0.5;
  const trV = ((v * 3 + 0.5) % 1) - 0.5;
  const trDist = Math.hypot(trU / 4, trV / 3);
  if (trDist < 0.017) {
    const holeT = 1.0 - smoothstep(0.008, 0.017, trDist);
    h = lerp(h, 0.12, holeT);
    ao = lerp(ao, 38, holeT);
    r = lerp(r, 34, holeT);
    g = lerp(g, 33, holeT);
    b = lerp(b, 31, holeT);
    rough = lerp(rough, 225, holeT);
  } else if (Math.abs(trU) < 0.06 && trV > 0 && trV < 0.36) {
    // Rust & damp seepage streak below tie-rod cavity
    const streak = (1.0 - Math.abs(trU) / 0.06) * (1.0 - trV / 0.36) * smoothstep(0.32, 0.72, nMid);
    r = lerp(r, 62, streak * 0.45);
    g = lerp(g, 48, streak * 0.45);
    b = lerp(b, 34, streak * 0.45);
    rough = lerp(rough, 115, streak * 0.35);
  }

  // Damp dark-olive seepage at base (v < 0.25)
  const dampEdge = 0.25 + (nLow - 0.5) * 0.09 + (nMid - 0.5) * 0.04;
  if (v < dampEdge) {
    const dampT = clamp01(1.0 - v / dampEdge);
    const wetPatch = smoothstep(0.25, 0.72, nLow * 0.65 + nMid * 0.35);
    const f = dampT * (0.55 + 0.45 * wetPatch);
    r = lerp(r, 36, f * 0.72);
    g = lerp(g, 46, f * 0.68);
    b = lerp(b, 32, f * 0.72);
    rough = lerp(rough, 72 + (1.0 - dampT) * 45, f * 0.75);
    ao = lerp(ao, 145, f * 0.45);
  }

  // Spalled concrete exposing rusted rebar
  for (const sp of SPALL_PATCHES) {
    const du = (u - sp.u) / sp.rx;
    const dv = (v - sp.v) / sp.ry;
    const sd = Math.hypot(du, dv) + (nMid - 0.5) * 0.45 + (nHigh - 0.5) * 0.2;
    if (sd < 1.0) {
      const inner = smoothstep(1.0, 0.55, sd);
      // Exposed dark aggregate cavity
      r = lerp(r, 56 + (nHigh - 0.5) * 22, inner);
      g = lerp(g, 55 + (nHigh - 0.5) * 20, inner);
      b = lerp(b, 51 + (nHigh - 0.5) * 18, inner);
      h = lerp(h, 0.22 + (nHigh - 0.5) * 0.08, inner);
      ao = lerp(ao, 95, inner);
      rough = lerp(rough, 228, inner);

      // Rusted horizontal & vertical rebar grid inside deep spall
      if (sd < 0.72) {
        const rebarH = Math.abs(((v * 34) % 1) - 0.5);
        const rebarV = Math.abs(((u * 26) % 1) - 0.5);
        const barDist = Math.min(rebarH, rebarV);
        if (barDist < 0.14) {
          const cyl = Math.sqrt(Math.max(0, 1.0 - (barDist / 0.14) ** 2));
          const rib = 0.5 + 0.5 * Math.sin((rebarH < rebarV ? u : v) * 280);
          r = 76 + cyl * 34 + (nHigh - 0.5) * 14;
          g = 44 + cyl * 20 + (nHigh - 0.5) * 10;
          b = 28 + cyl * 14 + (nHigh - 0.5) * 8;
          h = 0.30 + cyl * 0.16 + rib * 0.025;
          ao = 120 + cyl * 85;
          rough = 105 + (1.0 - cyl) * 55;
          metal = 155;
        }
      }
    }
  }

  // Bullet pockmarks (cratered impact holes with spalled rim)
  for (const bh of BULLET_HOLES) {
    const d = Math.hypot(u - bh.u, v - bh.v) + (nHigh - 0.5) * bh.r * 0.35;
    if (d < bh.r * 1.45) {
      if (d < bh.r * 0.55) {
        const core = 1.0 - d / (bh.r * 0.55);
        h = lerp(h, 0.08, core);
        ao = lerp(ao, 32, core);
        r = lerp(r, 28, core); g = lerp(g, 28, core); b = lerp(b, 27, core);
        rough = 235;
      } else {
        // Pale chipped concrete rim
        const rim = 1.0 - Math.abs(d - bh.r * 0.88) / (bh.r * 0.57);
        r = lerp(r, 114, clamp01(rim) * 0.65);
        g = lerp(g, 112, clamp01(rim) * 0.65);
        b = lerp(b, 106, clamp01(rim) * 0.65);
        h -= 0.12 * clamp01(rim);
        rough = 232;
      }
    }
  }

  return { r, g, b, ao, rough, metal, h };
}, 5.2);

// (2) bunker_corridor_slab_2k (1024x1024, RGB):
// Subterranean bunker poured concrete corridor floor (4x4 expansion joint slabs) with recessed
// steel drainage channels, wet condensation sheen patches (rough: 42..80), gritty aggregate dust,
// and heavy combat boot wear along the center.
writePBRSet('bunker_corridor_slab_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const tx = Math.floor(u * 4);
  const ty = Math.floor(v * 4);
  const tileSeed = hash2(tx, ty, 2101);

  const nLow = fbm(u, v, 5, 4, 2111);
  const nMid = fbm(u, v, 16, 4, 2129);
  const nHigh = fbm(u, v, 56, 3, 2143);

  // Recessed steel drainage channel running down center-right of corridor tile (u in [0.455, 0.545])
  const inDrainTrench = Math.abs(u - 0.5) < 0.044;
  if (inDrainTrench) {
    const du = Math.abs(u - 0.5) / 0.044;
    const isFrame = du > 0.78;
    if (isFrame) {
      // Beveled galvanized steel trench lip
      const rust = smoothstep(0.56, 0.82, nMid);
      return {
        r: lerp(88, 72, rust) + (nHigh - 0.5) * 14,
        g: lerp(92, 54, rust) + (nHigh - 0.5) * 12,
        b: lerp(96, 40, rust) + (nHigh - 0.5) * 12,
        ao: 185,
        rough: lerp(72, 145, rust),
        metal: lerp(195, 75, rust),
        h: 0.46
      };
    }
    // Slotted steel drainage grate inside trench
    const slotV = (v * 44) % 1;
    const crossRib = du < 0.14;
    const isSlot = !crossRib && (slotV > 0.28 && slotV < 0.76);
    if (isSlot) {
      return {
        r: 14, g: 16, b: 17,
        ao: 28,
        rough: 68, // wet dark trench water glint
        metal: 30,
        h: 0.08
      };
    }
    const barShade = 74 + (nHigh - 0.5) * 16;
    return {
      r: barShade + 4,
      g: barShade + 2,
      b: barShade - 2,
      ao: 165,
      rough: 68 + (nMid - 0.5) * 28,
      metal: 185,
      h: 0.42
    };
  }

  // Expansion joint bevels (4x4 slab grid)
  const edgeDist = Math.min(gx, 1 - gx, gy, 1 - gy);
  const inJoint = edgeDist < 0.022;
  const onChamfer = edgeDist >= 0.022 && edgeDist < 0.045;

  // Base dark poured bunker concrete
  let r = 68 + (tileSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
  let g = 70 + (tileSeed - 0.5) * 12 + (nLow - 0.5) * 18 + (nMid - 0.5) * 15 + (nHigh - 0.5) * 14;
  let b = 69 + (tileSeed - 0.5) * 10 + (nLow - 0.5) * 17 + (nMid - 0.5) * 14 + (nHigh - 0.5) * 13;
  let ao = 225;
  let rough = 188 + (nMid - 0.5) * 32 + (nHigh - 0.5) * 20;
  let metal = 0;
  let h = 0.55 + (nMid - 0.5) * 0.07 + (nHigh - 0.5) * 0.045;

  // Gritty aggregate dust pockets near slab edges
  const dust = smoothstep(0.45, 0.80, nMid) * (1.0 - smoothstep(0.05, 0.25, edgeDist));
  if (dust > 0.05) {
    r = lerp(r, 88, dust * 0.45);
    g = lerp(g, 85, dust * 0.42);
    b = lerp(b, 78, dust * 0.40);
    rough = lerp(rough, 232, dust * 0.7);
  }

  // Heavy combat boot wear track along the corridor center (u near 0.22..0.78)
  const centerWear = Math.exp(-(((u - 0.5) * 3.2) ** 2));
  const scuffNoise = fbm(u * 2.5, v * 0.6, 12, 3, 2179);
  const bootWear = centerWear * smoothstep(0.32, 0.78, scuffNoise);
  r = lerp(r, 52, bootWear * 0.5);
  g = lerp(g, 53, bootWear * 0.5);
  b = lerp(b, 51, bootWear * 0.5);
  rough = lerp(rough, 132, bootWear * 0.45);

  // Wet condensation sheen patches (rough: 42..80) — dramatic flashlight response!
  const puddle = smoothstep(0.56, 0.76, nLow * 0.72 + nMid * 0.28);
  if (puddle > 0.02) {
    r *= (1.0 - puddle * 0.34);
    g *= (1.0 - puddle * 0.32);
    b *= (1.0 - puddle * 0.30);
    rough = lerp(rough, 42 + (1.0 - puddle) * 38, puddle);
    h = lerp(h, 0.52, puddle * 0.35);
  }

  if (inJoint) {
    const jt = 1.0 - edgeDist / 0.022;
    h -= 0.24 * jt;
    ao = lerp(ao, 48, jt);
    r *= (1.0 - 0.55 * jt);
    g *= (1.0 - 0.55 * jt);
    b *= (1.0 - 0.55 * jt);
    rough = 225;
  } else if (onChamfer) {
    const ct = 1.0 - (edgeDist - 0.022) / 0.023;
    h -= 0.05 * ct;
    ao -= 24 * ct;
  }

  return { r, g, b, ao, rough, metal, h };
}, 5.0);

// (3) bunker_steel_grate_2k (1024x1024, RGB):
// Heavy galvanized diamond-plate & slotted steel catwalk floor grating over dark sub-floor
// drainage trenches (metal: 210, rough: 48..95, deep dark AO in grate slots so it gleams
// dramatically under flashlight!).
writePBRSet('bunker_steel_grate_2k', 1024, false, (u, v) => {
  // 2x2 modular catwalk panels
  const px = (u * 2) % 1;
  const py = (v * 2) % 1;
  const nLow = fbm(u, v, 6, 4, 3101);
  const nMid = fbm(u, v, 20, 3, 3119);
  const nHigh = fbm(u, v, 64, 3, 3137);

  const edge = Math.min(px, 1 - px, py, 1 - py);
  const isBorderPlate = edge < 0.14;
  const isCenterCross = Math.abs(px - 0.5) < 0.045 || Math.abs(py - 0.5) < 0.045;

  // Panel seam bevel
  if (edge < 0.012) {
    return { r: 22, g: 24, b: 26, ao: 42, rough: 165, metal: 120, h: 0.25 };
  }

  if (isBorderPlate || isCenterCross) {
    // Galvanized diamond-plate steel frame
    const dpU = (u * 32) % 1;
    const dpV = (v * 32) % 1;
    const cellParity = (Math.floor(u * 32) + Math.floor(v * 32)) % 2;
    const ax = dpU - 0.5;
    const ay = dpV - 0.5;
    // Rotate 45 deg or -45 deg per checkerboard cell for alternating industrial diamond tread lugs
    const rotA = cellParity === 0 ? (ax + ay) * 0.707 : (ax - ay) * 0.707;
    const rotB = cellParity === 0 ? (ax - ay) * 0.707 : (ax + ay) * 0.707;
    const lugDist = Math.hypot(rotA / 0.34, rotB / 0.11);
    const lug = clamp01(1.0 - smoothstep(0.65, 1.0, lugDist));

    // Corner hex bolts on border frame
    const bx = Math.min(Math.abs(px - 0.07), Math.abs(px - 0.93));
    const by = Math.min(Math.abs(py - 0.07), Math.abs(py - 0.93));
    const boltDist = Math.hypot(bx, by);
    const isBolt = boltDist < 0.022;

    const grime = smoothstep(0.55, 0.85, nLow * 0.6 + nMid * 0.4) * (1.0 - lug * 0.7);
    let r = 82 + lug * 24 + (nHigh - 0.5) * 14;
    let g = 86 + lug * 25 + (nHigh - 0.5) * 14;
    let b = 90 + lug * 26 + (nHigh - 0.5) * 15;
    let rough = 66 - lug * 18 + (nMid - 0.5) * 22 + grime * 40;
    let metal = 212 - grime * 65;
    let ao = 215 + lug * 28 - grime * 35;
    let h = 0.68 + lug * 0.16 + (nHigh - 0.5) * 0.02;

    if (grime > 0.05) {
      r = lerp(r, 56, grime * 0.65);
      g = lerp(g, 48, grime * 0.65);
      b = lerp(b, 38, grime * 0.65);
    }

    if (isBolt) {
      const bt = 1.0 - smoothstep(0.012, 0.022, boltDist);
      h = lerp(h, 0.92, bt);
      ao = lerp(ao, 240, bt);
      rough = lerp(rough, 54, bt);
      metal = 225;
      r += 16 * bt; g += 16 * bt; b += 15 * bt;
    }

    return {
      r, g, b, ao,
      rough: Math.max(48, Math.min(115, rough)),
      metal,
      h
    };
  }

  // Slotted galvanized steel grating bars over dark sub-floor drainage trench
  const barX = (u * 48) % 1;
  const barY = (v * 16) % 1;
  const onBearingBar = barX < 0.24 || barX > 0.76;
  const onCrossBar = barY < 0.20 || barY > 0.80;

  if (!onBearingBar && !onCrossBar) {
    // Deep dark sub-floor trench cavity (deep dark AO so grate bars pop under flashlight!)
    const subNoise = fbm(u, v, 10, 2, 3169);
    return {
      r: 10 + subNoise * 8,
      g: 12 + subNoise * 9,
      b: 13 + subNoise * 9,
      ao: 24,
      rough: 95,
      metal: 25,
      h: 0.04
    };
  }

  // Serrated galvanized steel grate top surface
  const serration = 0.5 + 0.5 * Math.sin(v * Math.PI * 160);
  const rust = smoothstep(0.64, 0.88, nLow * 0.5 + nMid * 0.5);
  const r = lerp(88 + serration * 18, 74, rust) + (nHigh - 0.5) * 14;
  const g = lerp(92 + serration * 18, 52, rust) + (nHigh - 0.5) * 14;
  const b = lerp(96 + serration * 19, 36, rust) + (nHigh - 0.5) * 14;
  const h = (onBearingBar ? 0.64 : 0.58) + serration * 0.045;
  return {
    r, g, b,
    ao: onBearingBar ? 225 : 195,
    rough: Math.max(48, Math.min(95, lerp(58 + (1.0 - serration) * 18, 95, rust))),
    metal: lerp(215, 130, rust),
    h
  };
}, 5.5);

// (4) bunker_blast_door_steel_2k (1024x1024, RGB):
// Reinforced armored blast-door & bunker bulkhead steel plating — riveted dark-gunmetal armor
// plates, weathered yellow/black caution chevron edge trim (0 emission), rust streaks around
// heavy hinges, and scratched bare steel edges (metal: 205, rough: 55..125).
writePBRSet('bunker_blast_door_steel_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 4101);
  const nMid = fbm(u, v, 16, 4, 4127);
  const nHigh = fbm(u, v, 56, 3, 4153);
  const scratch = fbm(u * 4.0, v * 0.5, 24, 3, 4177);

  // 2x2 heavy armored plates with thick welded frame ribs
  const px = (u * 2) % 1;
  const py = (v * 2) % 1;
  const edge = Math.min(px, 1 - px, py, 1 - py);

  // Caution chevron trim band near bottom edge (v in [0.84, 0.94], 0 emission!)
  const inChevronBand = (v >= 0.84 && v <= 0.94 && u >= 0.04 && u <= 0.96);

  // Heavy welded hinge assemblies on left edge (u < 0.09, v near 0.22 and 0.72)
  const inHinge1 = u < 0.085 && Math.abs(v - 0.22) < 0.075;
  const inHinge2 = u < 0.085 && Math.abs(v - 0.72) < 0.075;
  const inHinge = inHinge1 || inHinge2;

  // Base dark-gunmetal painted armor plate
  let r = 56 + (nLow - 0.5) * 14 + (nMid - 0.5) * 10 + (nHigh - 0.5) * 8;
  let g = 61 + (nLow - 0.5) * 14 + (nMid - 0.5) * 10 + (nHigh - 0.5) * 8;
  let b = 64 + (nLow - 0.5) * 15 + (nMid - 0.5) * 11 + (nHigh - 0.5) * 9;
  let ao = 220;
  let rough = 92 + (nMid - 0.5) * 32;
  let metal = 205;
  let h = 0.58 + (nMid - 0.5) * 0.03 + (nHigh - 0.5) * 0.015;

  // Recessed armored plate seams & raised bevels
  if (edge < 0.016) {
    h = 0.22;
    ao = 48;
    r *= 0.45; g *= 0.45; b *= 0.45;
    rough = 125;
  } else if (edge < 0.038) {
    // Scratched bare steel beveled plate edge (bright metallic highlight under flashlight)
    const bevel = 1.0 - (edge - 0.016) / 0.022;
    const bare = smoothstep(0.30, 0.65, nMid);
    r = lerp(r, 118, bevel * bare * 0.8);
    g = lerp(g, 122, bevel * bare * 0.8);
    b = lerp(b, 126, bevel * bare * 0.8);
    rough = lerp(rough, 55, bevel * bare * 0.8);
    metal = 225;
    h += 0.06 * bevel;
  }

  // Dome rivets along plate perimeter (edge ~ 0.065)
  const nearRivetBand = Math.abs(edge - 0.065) < 0.02;
  if (nearRivetBand && !inHinge) {
    const rx = ((px * 12) % 1) - 0.5;
    const ry = ((py * 12) % 1) - 0.5;
    const rDist = Math.hypot(rx, ry);
    if (rDist < 0.24) {
      const dome = Math.sqrt(Math.max(0, 1.0 - (rDist / 0.24) ** 2));
      h = 0.62 + dome * 0.24;
      ao = 165 + dome * 75;
      r += dome * 24;
      g += dome * 24;
      b += dome * 24;
      rough = Math.max(55, rough - dome * 28);
      metal = 220;
    }
  }

  // Weathered yellow/black caution chevron edge trim (0 emission, dark muted ochre)
  if (inChevronBand) {
    const stripePhase = (((u * 14 + v * 14) % 1) + 1) % 1;
    const isYellow = stripePhase < 0.5;
    const paintChip = smoothstep(0.32, 0.58, nMid * 0.7 + nHigh * 0.3);
    if (paintChip > 0.1) {
      const cr = isYellow ? 128 : 26;
      const cg = isYellow ? 98 : 27;
      const cb = isYellow ? 30 : 28;
      r = lerp(r, cr, paintChip * 0.88);
      g = lerp(g, cg, paintChip * 0.88);
      b = lerp(b, cb, paintChip * 0.88);
      rough = lerp(rough, isYellow ? 108 : 118, paintChip * 0.85);
      metal = lerp(metal, 65, paintChip * 0.8);
      h += 0.018 * paintChip;
    }
  }

  // Heavy hinges + downward rust streaks
  if (inHinge) {
    const hv = inHinge1 ? (v - 0.22) / 0.075 : (v - 0.72) / 0.075;
    const knuckle = Math.abs(((hv * 3) % 1)) < 0.12;
    const cyl = Math.sqrt(Math.max(0, 1.0 - (Math.abs(u - 0.042) / 0.043) ** 2));
    h = knuckle ? 0.52 : (0.70 + cyl * 0.25);
    ao = knuckle ? 70 : (175 + cyl * 65);
    r = 68 + cyl * 26;
    g = 62 + cyl * 22;
    b = 58 + cyl * 18;
    rough = 78 + (1.0 - cyl) * 42;
    metal = 205;
  } else {
    // Rust streaks dripping down below hinges
    const belowH1 = u < 0.11 && v > 0.29 && v < 0.52;
    const belowH2 = u < 0.11 && v > 0.79 && v < 0.98;
    if (belowH1 || belowH2) {
      const dv = belowH1 ? (v - 0.29) / 0.23 : (v - 0.79) / 0.19;
      const rustStreak = (1.0 - dv) * (1.0 - u / 0.11) * smoothstep(0.28, 0.72, nMid);
      r = lerp(r, 86, rustStreak * 0.78);
      g = lerp(g, 48, rustStreak * 0.78);
      b = lerp(b, 28, rustStreak * 0.78);
      rough = lerp(rough, 125, rustStreak * 0.85);
      metal = lerp(metal, 95, rustStreak * 0.75);
    }
  }

  // Scratched bare steel micro-gashes across armor plates
  const scratchMask = smoothstep(0.76, 0.88, scratch);
  if (scratchMask > 0.05) {
    r = lerp(r, 124, scratchMask * 0.7);
    g = lerp(g, 128, scratchMask * 0.7);
    b = lerp(b, 132, scratchMask * 0.7);
    rough = lerp(rough, 55, scratchMask * 0.8);
    metal = 225;
    h -= 0.03 * scratchMask;
  }

  return {
    r, g, b, ao,
    rough: Math.max(55, Math.min(125, rough)),
    metal,
    h
  };
}, 5.2);

// (5) bunker_utility_pipes_1k (512x512, RGB):
// Industrial overhead bunker pipework, ventilation ducts, and electrical conduit bundle texture —
// oxidized olive/rust iron pipes, bolted pipe flanges, brass valve accents, and condensation grime
// (metal: 185, rough: 60..135).
writePBRSet('bunker_utility_pipes_1k', 512, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 5101);
  const nMid = fbm(u, v, 16, 3, 5119);
  const nHigh = fbm(u, v, 48, 3, 5147);

  // Horizontal layout across V:
  // [0.00..0.30]: Thick main oxidized olive iron steam/coolant pipe with bolted flanges
  // [0.34..0.64]: Ribbed galvanized steel ventilation duct
  // [0.68..0.82]: Medium rust-patina iron water pipe with brass valve collar
  // [0.85..0.98]: Twin electrical conduit bundle
  const inMainPipe = v >= 0.03 && v <= 0.29;
  const inVentDuct = v >= 0.34 && v <= 0.64;
  const inWaterPipe = v >= 0.68 && v <= 0.82;
  const inConduit1 = v >= 0.855 && v <= 0.905;
  const inConduit2 = v >= 0.92 && v <= 0.97;

  if (!inMainPipe && !inVentDuct && !inWaterPipe && !inConduit1 && !inConduit2) {
    // Dark recessed mounting bracket & shadow backing behind pipes
    const bracket = Math.abs(((u * 4) % 1) - 0.5) < 0.06;
    if (bracket) {
      return { r: 44, g: 46, b: 48, ao: 120, rough: 115, metal: 175, h: 0.32 };
    }
    return { r: 16, g: 18, b: 19, ao: 36, rough: 135, metal: 60, h: 0.08 };
  }

  if (inMainPipe) {
    const pv = (v - 0.16) / 0.13;
    const cyl = Math.sqrt(Math.max(0, 1.0 - pv * pv));
    // Bolted pipe flanges at u = 0.25 and u = 0.75
    const flangeDist = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
    const isFlange = flangeDist < 0.032;
    const rust = smoothstep(0.55, 0.82, nLow * 0.6 + nMid * 0.4);
    let r = lerp(62, 86, rust) * (0.55 + 0.45 * cyl) + (nHigh - 0.5) * 12;
    let g = lerp(70, 52, rust) * (0.55 + 0.45 * cyl) + (nHigh - 0.5) * 12;
    let b = lerp(56, 34, rust) * (0.55 + 0.45 * cyl) + (nHigh - 0.5) * 10;
    let h = 0.45 + cyl * 0.40;
    let rough = lerp(76, 132, rust);
    let metal = lerp(185, 110, rust);
    let ao = 100 + cyl * 140;

    if (isFlange) {
      h += 0.12;
      const boltPhase = ((v * 28) % 1) - 0.5;
      const isBolt = Math.abs(flangeDist - 0.016) < 0.008 && Math.abs(boltPhase) < 0.22;
      if (isBolt) {
        h += 0.06;
        r += 24; g += 22; b += 18;
        rough = 62;
        metal = 215;
      } else {
        r *= 0.88; g *= 0.88; b *= 0.88;
      }
    }
    return { r, g, b, ao, rough: Math.max(60, Math.min(135, rough)), metal, h };
  }

  if (inVentDuct) {
    const dv = (v - 0.49) / 0.15;
    const flatBevel = 1.0 - smoothstep(0.78, 1.0, Math.abs(dv));
    const rib = Math.abs(((u * 8) % 1) - 0.5) < 0.045;
    const grime = smoothstep(0.45, 0.80, nLow * 0.65 + nMid * 0.35);
    let r = lerp(84, 58, grime * 0.6) + (nHigh - 0.5) * 12;
    let g = lerp(88, 60, grime * 0.6) + (nHigh - 0.5) * 12;
    let b = lerp(92, 58, grime * 0.6) + (nHigh - 0.5) * 12;
    let h = 0.50 + flatBevel * 0.26 + (rib ? 0.08 : 0);
    return {
      r, g, b,
      ao: 130 + flatBevel * 105 - (rib ? 18 : 0),
      rough: Math.max(60, Math.min(135, 72 + grime * 48)),
      metal: 195 - grime * 50,
      h
    };
  }

  if (inWaterPipe) {
    const pv = (v - 0.75) / 0.07;
    const cyl = Math.sqrt(Math.max(0, 1.0 - pv * pv));
    // Brass valve collar around u in [0.44, 0.56]
    const isBrassValve = Math.abs(u - 0.50) < 0.055;
    if (isBrassValve) {
      const collarRing = Math.abs(Math.abs(u - 0.50) - 0.042) < 0.012;
      const scale = 0.62 + 0.38 * cyl;
      return {
        r: (148 + (nHigh - 0.5) * 14) * scale,
        g: (114 + (nHigh - 0.5) * 12) * scale,
        b: (46 + (nHigh - 0.5) * 8) * scale,
        ao: 120 + cyl * 120,
        rough: 60 + (1.0 - cyl) * 28,
        metal: 225,
        h: 0.55 + cyl * 0.34 + (collarRing ? 0.08 : 0)
      };
    }
    const rust = smoothstep(0.42, 0.78, nMid);
    const scale = 0.55 + 0.45 * cyl;
    return {
      r: lerp(78, 92, rust) * scale,
      g: lerp(54, 48, rust) * scale,
      b: lerp(42, 30, rust) * scale,
      ao: 105 + cyl * 130,
      rough: Math.max(60, Math.min(135, 86 + rust * 42)),
      metal: lerp(180, 115, rust),
      h: 0.48 + cyl * 0.32
    };
  }

  // Twin electrical conduits
  const cv = inConduit1 ? (v - 0.88) / 0.025 : (v - 0.945) / 0.025;
  const cyl = Math.sqrt(Math.max(0, 1.0 - cv * cv));
  const clamp = Math.abs(((u * 6) % 1) - 0.5) < 0.04;
  return {
    r: (clamp ? 96 : 68) * (0.55 + 0.45 * cyl),
    g: (clamp ? 98 : 72) * (0.55 + 0.45 * cyl),
    b: (clamp ? 102 : 76) * (0.55 + 0.45 * cyl),
    ao: 110 + cyl * 125,
    rough: clamp ? 64 : 84,
    metal: 190,
    h: 0.46 + cyl * 0.24 + (clamp ? 0.07 : 0)
  };
}, 5.4);

// (6) bunker_brick_catacomb_2k (1024x1024, RGB):
// Old damp subterranean red-brown / soot-blackened bunker foundation brickwork for the older
// western/southern tunnel sectors, with crumbling mortar joints, efflorescence salt streaks,
// and moss/mold near the floor.
writePBRSet('bunker_brick_catacomb_2k', 1024, false, (u, v) => {
  const rows = 16;
  const cols = 8;
  const row = Math.floor(v * rows);
  const vLocal = (v * rows) % 1;
  const uShift = (row % 2) * 0.5;
  const col = Math.floor((u * cols + uShift) % cols);
  const uLocal = (u * cols + uShift) % 1;

  const brickSeed = hash2(col, row, 6101);
  const brickSeed2 = hash2(col + 17, row + 31, 6113);
  const nLow = fbm(u, v, 5, 4, 6121);
  const nMid = fbm(u, v, 18, 4, 6133);
  const nHigh = fbm(u, v, 56, 3, 6151);

  // Crumbling mortar joint thickness modulated by noise
  const mortarV = 0.11 + (nMid - 0.5) * 0.05;
  const mortarU = 0.055 + (nMid - 0.5) * 0.025;
  const inMortar = vLocal < mortarV || vLocal > (1 - mortarV * 0.5) || uLocal < mortarU || uLocal > (1 - mortarU * 0.5);

  let r, g, b, ao, rough, h;
  if (inMortar) {
    // Recessed crumbling damp mortar
    r = 54 + (nMid - 0.5) * 18 + (nHigh - 0.5) * 12;
    g = 52 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 12;
    b = 46 + (nMid - 0.5) * 14 + (nHigh - 0.5) * 10;
    ao = 92 + (nHigh - 0.5) * 28;
    rough = 228 + (nHigh - 0.5) * 18;
    h = 0.24 + (nMid - 0.5) * 0.10 + (nHigh - 0.5) * 0.05;
  } else {
    // Aged subterranean red-brown / soot-darkened kiln brick
    const edgeDist = Math.min(
      (vLocal - mortarV) / 0.12,
      (1 - mortarV * 0.5 - vLocal) / 0.12,
      (uLocal - mortarU) / 0.08,
      (1 - mortarU * 0.5 - uLocal) / 0.08
    );
    const bevel = clamp01(edgeDist);
    const soot = smoothstep(0.42, 0.82, nLow * 0.7 + brickSeed2 * 0.3);

    r = (78 + (brickSeed - 0.5) * 28 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 12) * (1.0 - soot * 0.52);
    g = (44 + (brickSeed - 0.5) * 16 + (nMid - 0.5) * 12 + (nHigh - 0.5) * 10) * (1.0 - soot * 0.48);
    b = (34 + (brickSeed - 0.5) * 12 + (nMid - 0.5) * 10 + (nHigh - 0.5) * 8) * (1.0 - soot * 0.45);
    ao = 160 + bevel * 70 - soot * 30;
    rough = 185 + (nMid - 0.5) * 36 + (nHigh - 0.5) * 20;
    h = 0.48 + bevel * 0.24 + (brickSeed - 0.5) * 0.08 + (nMid - 0.5) * 0.07 + (nHigh - 0.5) * 0.04;
  }

  // Efflorescence white/chalky mineral salt streaks weeping down from mortar
  const saltStreakNoise = fbm(u * 2.5, v * 0.4, 14, 3, 6173);
  const saltMask = smoothstep(0.68, 0.86, saltStreakNoise) * smoothstep(0.25, 0.75, nLow);
  if (saltMask > 0.04) {
    r = lerp(r, 128, saltMask * 0.65);
    g = lerp(g, 124, saltMask * 0.65);
    b = lerp(b, 114, saltMask * 0.62);
    rough = lerp(rough, 238, saltMask * 0.8);
  }

  // Damp moss & dark mold near the floor (v < 0.22 and subtle lower edge v > 0.88)
  const floorDamp = Math.max(
    clamp01(1.0 - v / (0.24 + (nLow - 0.5) * 0.08)),
    clamp01((v - 0.86) / 0.14) * 0.55
  );
  if (floorDamp > 0.02) {
    const moss = floorDamp * smoothstep(0.32, 0.72, nMid * 0.7 + nHigh * 0.3);
    r = lerp(r, 34, moss * 0.78);
    g = lerp(g, 52, moss * 0.75);
    b = lerp(b, 28, moss * 0.78);
    rough = lerp(rough, 108, floorDamp * 0.6);
    h += moss * 0.05;
  }

  return { r, g, b, ao, rough, metal: 0, h };
}, 5.5);

// ============================================================================
// Helper: 5x7 Pixel-Art / Stencil Font for Decal Markings (A, B, 1, 2, -)
// ============================================================================
const STENCIL_GLYPHS = {
  A: [
    '01110',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001'
  ],
  B: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10001',
    '10001',
    '11110'
  ],
  '1': [
    '00100',
    '01100',
    '00100',
    '00100',
    '00100',
    '00100',
    '01110'
  ],
  '2': [
    '01110',
    '10001',
    '00001',
    '00110',
    '01000',
    '10000',
    '11111'
  ],
  '-': [
    '00000',
    '00000',
    '00000',
    '11111',
    '00000',
    '00000',
    '00000'
  ]
};

function sampleStencilText(text, u, v, startU, startV, charW, charH, gapU) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = STENCIL_GLYPHS[ch];
    if (!glyph) continue;
    const cu = (u - (startU + i * (charW + gapU))) / charW;
    const cv = (v - startV) / charH;
    if (cu >= 0 && cu < 1 && cv >= 0 && cv < 1) {
      const gx = Math.min(4, Math.floor(cu * 5));
      const gy = Math.min(6, Math.floor(cv * 7));
      // Stencil bridge cut through middle for authentic military spray-stencil feel
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

// (7) decal_bunker_sector_arrows (512x512, RGBA for alphaMode: "MASK"):
// Worn, chipped military stencil floor arrows & sector markings (A-1, B-2, chevron direction
// markers — 0 emission! Muted faded bone-white and rust-ochre paint broken by grime and boot scuffs).
writePBRSet('decal_bunker_sector_arrows', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 7101);
  const nMid = fbm(u, v, 24, 3, 7121);
  const nHigh = fbm(u, v, 64, 3, 7151);

  // Double bold directional chevron arrows pointing toward +U (right) in upper-center
  let isChevron = false;
  for (const offsetU of [0.34, 0.54]) {
    const dy = Math.abs(v - 0.34);
    if (dy < 0.19) {
      const targetU = offsetU + (0.19 - dy) * 0.72;
      if (Math.abs(u - targetU) < 0.042) {
        isChevron = true;
      }
    }
  }

  // Horizontal military stencil rule line separating chevron and sector IDs
  const isRuleLine = Math.abs(v - 0.59) < 0.016 && u > 0.14 && u < 0.86 && Math.abs(u - 0.50) > 0.03;

  // Sector labels "A-1" (left) and "B-2" (right) below rule line
  const isTextA1 = sampleStencilText('A-1', u, v, 0.16, 0.66, 0.075, 0.14, 0.022);
  const isTextB2 = sampleStencilText('B-2', u, v, 0.56, 0.66, 0.075, 0.14, 0.022);

  if (!isChevron && !isRuleLine && !isTextA1 && !isTextB2) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Heavy boot scuffs & chipped paint erosion for alphaMode: "MASK"
  const scuffStreak = fbm(u * 0.7, v * 3.5, 10, 3, 7177);
  const paintSurvive = nLow * 0.45 + nMid * 0.35 + nHigh * 0.20 - smoothstep(0.62, 0.86, scuffStreak) * 0.42;
  if (paintSurvive < 0.26) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Rust-ochre for directional chevrons & rule line, faded bone-white for sector IDs (0 emission)
  const isOchre = isChevron || isRuleLine;
  const grime = smoothstep(0.45, 0.82, nLow);
  const r = lerp(isOchre ? 132 : 144, 72, grime * 0.48) + (nHigh - 0.5) * 16;
  const g = lerp(isOchre ? 92 : 138, 66, grime * 0.48) + (nHigh - 0.5) * 14;
  const b = lerp(isOchre ? 42 : 124, 56, grime * 0.48) + (nHigh - 0.5) * 12;

  return {
    r, g, b,
    a: 255,
    ao: 215,
    rough: 168 + (nMid - 0.5) * 38,
    metal: 0,
    h: 0.56 + (nHigh - 0.5) * 0.03
  };
}, 3.2);

// Precomputed deterministic spent brass rifle/SMG shell casings for decal_blood_shell_casings
const SHELL_CASINGS = [
  { u: 0.26, v: 0.30, ang: 0.45, len: 0.036, rad: 0.0095 },
  { u: 0.34, v: 0.24, ang: 1.82, len: 0.032, rad: 0.0085 },
  { u: 0.64, v: 0.28, ang: 2.55, len: 0.038, rad: 0.0095 },
  { u: 0.72, v: 0.38, ang: 0.92, len: 0.030, rad: 0.0085 },
  { u: 0.58, v: 0.66, ang: 1.25, len: 0.036, rad: 0.0095 },
  { u: 0.76, v: 0.62, ang: 2.88, len: 0.034, rad: 0.0090 },
  { u: 0.28, v: 0.70, ang: 0.18, len: 0.035, rad: 0.0092 },
  { u: 0.45, v: 0.78, ang: 2.10, len: 0.032, rad: 0.0085 },
  { u: 0.81, v: 0.47, ang: 1.55, len: 0.036, rad: 0.0095 },
  { u: 0.19, v: 0.54, ang: 0.74, len: 0.033, rad: 0.0088 },
  { u: 0.67, v: 0.77, ang: 2.40, len: 0.031, rad: 0.0085 },
  { u: 0.42, v: 0.22, ang: 1.08, len: 0.037, rad: 0.0095 }
];

// (8) decal_blood_shell_casings (512x512, RGBA for alphaMode: "MASK"):
// Coagulated dark arterial blood pool with drag marks, bloody boot prints, and glinting spent
// brass rifle/SMG shell casings scattered across the concrete (0 emission, low roughness 25..65
// on blood & metallic 220 on brass casings so flashlights catch them!).
writePBRSet('decal_blood_shell_casings', 512, true, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8101);
  const nMid = fbm(u, v, 18, 4, 8123);
  const nHigh = fbm(u, v, 52, 3, 8147);

  // Check spent brass casings first (sit on top of blood/concrete)
  for (const sc of SHELL_CASINGS) {
    const dx = u - sc.u;
    const dy = v - sc.v;
    const cosA = Math.cos(sc.ang);
    const sinA = Math.sin(sc.ang);
    const lx = dx * cosA + dy * sinA;
    const ly = -dx * sinA + dy * cosA;
    if (Math.abs(lx) <= sc.len * 0.5 && Math.abs(ly) <= sc.rad) {
      // Tapered bottleneck rifle/SMG casing profile
      const t = (lx / (sc.len * 0.5)) * 0.5 + 0.5; // 0 = rim/base, 1 = neck/mouth
      const widthScale = t > 0.76 ? 0.72 : (t < 0.10 ? 1.06 : 1.0);
      if (Math.abs(ly) <= sc.rad * widthScale) {
        const cyl = Math.sqrt(Math.max(0, 1.0 - (ly / (sc.rad * widthScale)) ** 2));
        const extractorGroove = t > 0.10 && t < 0.17;
        const shade = (extractorGroove ? 0.65 : 1.0) * (0.58 + 0.42 * cyl);
        return {
          r: (168 + (nHigh - 0.5) * 14) * shade,
          g: (132 + (nHigh - 0.5) * 12) * shade,
          b: (52 + (nHigh - 0.5) * 8) * shade,
          a: 255,
          ao: 140 + cyl * 105,
          rough: 30 + (1.0 - cyl) * 20,
          metal: 225,
          h: 0.62 + cyl * 0.30
        };
      }
    }
  }

  // Coagulated arterial blood pool (centered around 0.42, 0.46)
  const poolDist = Math.hypot((u - 0.42) / 0.25, (v - 0.46) / 0.21) + (nLow - 0.5) * 0.55 + (nMid - 0.5) * 0.22;
  const inPool = poolDist < 0.88;

  // Drag marks stretching from pool toward (0.86, 0.74)
  const dragDist = distToSegment(u, v, 0.46, 0.48, 0.86, 0.74);
  const dragStreak = Math.sin((u * -0.58 + v * 0.81) * 140 + nMid * 4.0) * 0.5 + 0.5;
  const inDrag = dragDist < 0.085 && dragStreak > 0.38 && (nLow > 0.32);

  // Two bloody combat boot prints near (0.24, 0.74) and (0.68, 0.24)
  let inBootPrint = false;
  const boots = [
    { u: 0.25, v: 0.73, ang: -0.45 },
    { u: 0.68, v: 0.23, ang: 0.35 }
  ];
  for (const bp of boots) {
    const dx = u - bp.u;
    const dy = v - bp.v;
    const lx = dx * Math.cos(bp.ang) + dy * Math.sin(bp.ang);
    const ly = -dx * Math.sin(bp.ang) + dy * Math.cos(bp.ang);
    const sole = Math.hypot(lx / 0.042, (ly - 0.028) / 0.052) < 1.0;
    const heel = Math.hypot(lx / 0.036, (ly + 0.048) / 0.036) < 1.0;
    if (sole || heel) {
      const lugPattern = (Math.sin(ly * 260) > -0.15) && (Math.abs(lx) > 0.008 || Math.sin(lx * 190) > 0);
      if (lugPattern && nMid > 0.28) inBootPrint = true;
    }
  }

  // Blood splatter droplets around perimeter
  const splat = (Math.hypot(u - 0.5, v - 0.5) < 0.46) && (nMid > 0.76 && nHigh > 0.58);

  if (!inPool && !inDrag && !inBootPrint && !splat) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  const thickCore = inPool ? clamp01(1.0 - poolDist / 0.88) : 0.25;
  const r = lerp(52, 78, thickCore * 0.7 + nMid * 0.3);
  const g = lerp(8, 13, thickCore * 0.5);
  const b = lerp(9, 14, thickCore * 0.5);
  return {
    r, g, b,
    a: 255,
    ao: lerp(185, 145, thickCore),
    rough: Math.max(25, Math.min(65, lerp(58, 26, thickCore) + (nHigh - 0.5) * 12)),
    metal: 15,
    h: 0.52 + thickCore * 0.06
  };
}, 4.5);

// (9) decal_floor_drain_grate (512x512, RGBA for alphaMode: "MASK"):
// Recessed rusty cast-iron storm drain grate surrounded by a wet dark puddle ring
// (rough: 22..55, metal: 165 on iron bars).
writePBRSet('decal_floor_drain_grate', 512, true, (u, v) => {
  const nLow = fbm(u, v, 7, 4, 9101);
  const nMid = fbm(u, v, 20, 3, 9127);
  const nHigh = fbm(u, v, 56, 3, 9151);

  const du = Math.abs(u - 0.5);
  const dv = Math.abs(v - 0.5);
  const maxD = Math.max(du, dv);
  const radD = Math.hypot(du, dv);

  // Outer irregular wet puddle ring around the drain
  const puddleOuter = 0.44 + (nLow - 0.5) * 0.14 + (nMid - 0.5) * 0.06;
  const inPuddle = radD < puddleOuter;
  const inGrateBox = maxD < 0.27;

  if (!inPuddle && !inGrateBox) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  if (inGrateBox) {
    const isFrame = maxD > 0.225;
    if (isFrame) {
      // Heavy cast-iron outer drain bezel
      const rust = smoothstep(0.45, 0.78, nMid);
      return {
        r: lerp(64, 86, rust) + (nHigh - 0.5) * 12,
        g: lerp(64, 50, rust) + (nHigh - 0.5) * 10,
        b: lerp(62, 32, rust) + (nHigh - 0.5) * 10,
        a: 255,
        ao: 175,
        rough: Math.max(45, Math.min(115, lerp(62, 112, rust))),
        metal: lerp(175, 110, rust),
        h: 0.62 + (nHigh - 0.5) * 0.03
      };
    }

    // Parallel heavy cast-iron drain bars + center spine
    const barPhase = ((u * 22) % 1);
    const isBar = barPhase < 0.34 || dv < 0.022;
    if (isBar) {
      const barCenter = barPhase < 0.34 ? Math.abs(barPhase - 0.17) / 0.17 : dv / 0.022;
      const crown = Math.sqrt(Math.max(0, 1.0 - barCenter * barCenter));
      const rust = smoothstep(0.48, 0.80, nMid);
      return {
        r: lerp(58, 84, rust) * (0.65 + 0.35 * crown),
        g: lerp(56, 48, rust) * (0.65 + 0.35 * crown),
        b: lerp(54, 30, rust) * (0.65 + 0.35 * crown),
        a: 255,
        ao: 120 + crown * 95,
        rough: Math.max(42, Math.min(110, lerp(58, 108, rust))),
        metal: 165,
        h: 0.44 + crown * 0.18
      };
    }

    // Deep pitch-dark storm drain pit underneath
    return {
      r: 8, g: 10, b: 11,
      a: 255,
      ao: 18,
      rough: 36,
      metal: 20,
      h: 0.04
    };
  }

  // Wet dark condensation/water puddle ring surrounding the drain
  const ringT = clamp01(1.0 - (radD - 0.25) / Math.max(0.05, puddleOuter - 0.25));
  return {
    r: 26 + (nHigh - 0.5) * 8,
    g: 30 + (nHigh - 0.5) * 8,
    b: 29 + (nHigh - 0.5) * 8,
    a: 255,
    ao: lerp(200, 145, ringT),
    rough: Math.max(22, Math.min(55, lerp(52, 22, ringT) + (nMid - 0.5) * 10)),
    metal: 25,
    h: 0.48
  };
}, 5.5);

// Precomputed branching fracture segments for decal_rubble_cracks
const CRACK_SEGMENTS = [
  [0.50, 0.50, 0.28, 0.36],
  [0.28, 0.36, 0.14, 0.26],
  [0.28, 0.36, 0.19, 0.48],
  [0.50, 0.50, 0.72, 0.34],
  [0.72, 0.34, 0.86, 0.24],
  [0.72, 0.34, 0.84, 0.46],
  [0.50, 0.50, 0.64, 0.74],
  [0.64, 0.74, 0.78, 0.84],
  [0.64, 0.74, 0.54, 0.88],
  [0.50, 0.50, 0.30, 0.70],
  [0.30, 0.70, 0.16, 0.78],
  [0.50, 0.50, 0.48, 0.20],
  [0.48, 0.20, 0.38, 0.11]
];

// Scattered angular spall chips
const RUBBLE_CHIPS = [
  { u: 0.38, v: 0.44, rx: 0.028, ry: 0.020, ang: 0.5 },
  { u: 0.58, v: 0.42, rx: 0.032, ry: 0.022, ang: 1.9 },
  { u: 0.46, v: 0.62, rx: 0.026, ry: 0.018, ang: 2.6 },
  { u: 0.65, v: 0.58, rx: 0.024, ry: 0.016, ang: 0.9 },
  { u: 0.33, v: 0.56, rx: 0.022, ry: 0.018, ang: 1.4 },
  { u: 0.55, v: 0.31, rx: 0.020, ry: 0.015, ang: 2.2 },
  { u: 0.74, v: 0.42, rx: 0.019, ry: 0.014, ang: 0.2 },
  { u: 0.26, v: 0.42, rx: 0.021, ry: 0.015, ang: 1.1 },
  { u: 0.42, v: 0.76, rx: 0.018, ry: 0.014, ang: 2.8 }
];

// (10) decal_rubble_cracks (512x512, RGBA for alphaMode: "MASK"):
// Deep structural floor cracks, blast fractures, and scattered concrete dust/spall chips
// (0 emission, strong normal depth).
writePBRSet('decal_rubble_cracks', 512, true, (u, v) => {
  const nLow = fbm(u, v, 7, 4, 10101);
  const nMid = fbm(u, v, 22, 4, 10133);
  const nHigh = fbm(u, v, 58, 3, 10169);

  // Jitter coordinates slightly for jagged natural concrete fracture paths
  const ju = u + (nMid - 0.5) * 0.036 + (nHigh - 0.5) * 0.012;
  const jv = v + (fbm(u + 0.3, v + 0.7, 22, 3, 10193) - 0.5) * 0.036;

  // Raised angular concrete spall chips first
  for (const ch of RUBBLE_CHIPS) {
    const dx = u - ch.u;
    const dy = v - ch.v;
    const lx = dx * Math.cos(ch.ang) + dy * Math.sin(ch.ang);
    const ly = -dx * Math.sin(ch.ang) + dy * Math.cos(ch.ang);
    const cd = Math.hypot(lx / ch.rx, ly / ch.ry) + (nHigh - 0.5) * 0.35;
    if (cd < 1.0) {
      const dome = clamp01(1.0 - cd);
      const base = 78 + dome * 24 + (nHigh - 0.5) * 18;
      return {
        r: base + 2,
        g: base,
        b: base - 4,
        a: 255,
        ao: 175 + dome * 65,
        rough: 224,
        metal: 0,
        h: 0.68 + dome * 0.24
      };
    }
  }

  // Minimum distance to any structural crack segment
  let minCrack = 1.0;
  for (const seg of CRACK_SEGMENTS) {
    const d = distToSegment(ju, jv, seg[0], seg[1], seg[2], seg[3]);
    if (d < minCrack) minCrack = d;
  }

  const centerDist = Math.hypot(ju - 0.5, jv - 0.5);
  const crackWidth = 0.014 * (1.15 - clamp01(centerDist * 1.4));
  const rimWidth = crackWidth * 2.8;

  if (minCrack < crackWidth) {
    // Deep structural fracture void
    const depth = 1.0 - minCrack / crackWidth;
    return {
      r: 18 + (1.0 - depth) * 18,
      g: 18 + (1.0 - depth) * 17,
      b: 17 + (1.0 - depth) * 16,
      a: 255,
      ao: Math.round(28 + (1.0 - depth) * 65),
      rough: 238,
      metal: 0,
      h: 0.04 + (1.0 - depth) * 0.18
    };
  }

  if (minCrack < rimWidth || (centerDist < 0.16 && nMid > 0.38)) {
    // Fractured concrete dust & spall halo along crack edges
    const rimT = clamp01(1.0 - (minCrack - crackWidth) / Math.max(0.005, rimWidth - crackWidth));
    if (rimT * 0.8 + (nHigh - 0.3) * 0.5 > 0.32) {
      const dustVal = 66 + (nHigh - 0.5) * 22 + rimT * 14;
      return {
        r: dustVal + 2,
        g: dustVal,
        b: dustVal - 4,
        a: 255,
        ao: 155 + (1.0 - rimT) * 55,
        rough: 232,
        metal: 0,
        h: 0.42 - rimT * 0.12 + (nHigh - 0.5) * 0.06
      };
    }
  }

  return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
}, 6.0);

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
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map0_Labirent_v3 (Classic Bunker Maze) PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K Cold-War subterranean military bunker & catacomb PBR textures (0 emission, dark tactical palette, flashlight-reactive normal & roughness/metallic):
  bunker_concrete_wall_2k, bunker_corridor_slab_2k, bunker_steel_grate_2k,
  bunker_blast_door_steel_2k, bunker_utility_pipes_1k, bunker_brick_catacomb_2k,
  decal_bunker_sector_arrows, decal_blood_shell_casings, decal_floor_drain_grate,
  decal_rubble_cracks.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
