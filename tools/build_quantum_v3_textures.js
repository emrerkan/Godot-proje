#!/usr/bin/env node
/**
 * build_quantum_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map2_Yeralti_Kuantum_Labirenti_5v5v5v5_v3.gltf inside asset model/haritalar/Map2_Kuantum_v3/textures/
 *
 * CRITICAL ART DIRECTION (QUANTUM V1, HOSPITAL V3, SUBWAY V3 & WAREHOUSE V3 LESSONS):
 * - In old Map2_Yeralti_Kuantum_Labirenti_5v5v5v5.glb, user complained: "fenere ihtiyaç yok gibi"
 *   (too bright, neon strips everywhere ruined the darkness), and in Hospital v3 the user hated glowing pink/neon floor lines!
 * - Therefore: ZERO glowing/neon floor lines, crosses, or bright glowing surfaces!
 * - All floor decals, blood/cryo trails, hazard markings, titanium deck plates, and bulkhead walls MUST be
 *   non-emissive (0 emission) dark tactical PBR materials (0.07..0.34 linear albedo average) that stay pitch-dark
 *   in the shadows and gleam with high-tech metallic/specular detail under the player's flashlight via Normal Map
 *   and Roughness/Metallic contrast!
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map2_Kuantum_v3');
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
  // channels: 3 (RGB) or 4 (RGBA)
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
    raw[rowStart] = 1; // Sub filter for fast & tight compression
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

// Compute OpenGL Normal map + ARM map from heightfield, AO field, Roughness field, Metalness field
function writePBRSet(baseName, size, isAlpha, evalPixel) {
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
  const bumpScale = 4.5;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heightMap[y * size + xp] - heightMap[y * size + xm]) * bumpScale;
      const dy = (heightMap[yp * size + x] - heightMap[ym * size + x]) * bumpScale;
      // OpenGL normal (+Y is up, so -dy)
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
  // role: 'color' (BC7: high_quality=true, normal_map=2), 'normal' (BC5: high_quality=false, normal_map=1), 'arm' (BC1: high_quality=false, normal_map=2)
  const resPath = `res://asset model/haritalar/Map2_Kuantum_v3/textures/${fileName}`;
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

// 1. Copy shared high-res CC0 textures from Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3
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
  'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png',
  'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png'
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

// 2. Procedurally Generate Custom Quantum v3 High-Res PBR Texture Sets (0 emission, dark tactical sci-fi research facility palette)

// (1) quantum_titanium_deck_2k (1024x1024, RGB):
// Octagonal brushed dark-gunmetal titanium laboratory deck tiles (4x4 modular hex/square grid)
// with recessed sub-floor cable channels, diamond anti-slip micro-tread, bolt heads,
// and low-roughness (38..80, metal: 175..220) metallic sheen interrupted by cryo-frost and scorch wear.
writePBRSet('quantum_titanium_deck_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const tx = Math.floor(u * 4);
  const ty = Math.floor(v * 4);

  const nLow = fbm(u, v, 5, 4, 8101);
  const nMid = fbm(u, v, 16, 4, 8102);
  const nHigh = fbm(u, v, 48, 3, 8103);
  const brush = fbm(u * 10.0, v * 1.2, 24, 3, 8104);

  // Local cell coordinates centered at (0,0) in [-0.5, 0.5]
  const lx = gx - 0.5;
  const ly = gy - 0.5;
  const ax = Math.abs(lx);
  const ay = Math.abs(ly);
  // Octagonal chamfered distance
  const octDist = Math.max(ax, ay, (ax + ay) * 0.76);

  // Recessed sub-floor cable channel around tile borders & corner diamond pockets
  const isChannel = octDist > 0.455;
  const isBevel = octDist > 0.425 && octDist <= 0.455;

  if (isChannel) {
    // Deep recessed sub-floor cable routing channel with parallel dark conduit pipes inside
    const pipeWave = Math.sin(((ax > ay ? gy : gx) * 16.0) * Math.PI);
    const isPipe = pipeWave > 0.25;
    return {
      r: isPipe ? 34 : 18,
      g: isPipe ? 38 : 20,
      b: isPipe ? 44 : 24,
      ao: isPipe ? 125 : 65,
      rough: isPipe ? 62 : 135,
      metal: isPipe ? 185 : 110,
      h: isPipe ? 0.24 : 0.10
    };
  }

  // Corner hex socket bolts on each octagonal plate
  const bx = Math.abs(ax - 0.36);
  const by = Math.abs(ay - 0.36);
  const boltDist = Math.hypot(bx, by);
  const isBolt = boltDist < 0.032;
  const isBoltWell = boltDist >= 0.032 && boltDist < 0.046;

  // Inner inspection hatch seam & diamond anti-slip micro-tread ring
  const isInnerSeam = Math.abs(octDist - 0.25) < 0.010;
  const inTreadRing = octDist > 0.27 && octDist < 0.40;

  let treadBump = 0;
  if (inTreadRing) {
    const dx = (u * 72) % 1 - 0.5;
    const dy = (v * 72) % 1 - 0.5;
    const rotA = (dx + dy) * 0.707;
    const rotB = (dx - dy) * 0.707;
    const lug = Math.hypot(rotA / 0.34, rotB / 0.14);
    if (lug < 1.0) treadBump = (1.0 - lug) * 0.14;
  }

  // Brushed dark-gunmetal titanium base (0.07..0.28 linear albedo range -> ~50..92 sRGB)
  const tileVar = (hash2(tx, ty, 8105) - 0.5) * 10;
  let r = 56 + tileVar + (brush - 0.5) * 16 + (nLow - 0.5) * 10 + treadBump * 45;
  let g = 62 + tileVar + (brush - 0.5) * 16 + (nLow - 0.5) * 10 + treadBump * 48;
  let b = 70 + tileVar + (brush - 0.5) * 18 + (nLow - 0.5) * 12 + treadBump * 52;

  let rough = 52 + (1.0 - brush) * 18 + (nMid - 0.5) * 14 - treadBump * 25;
  rough = Math.max(38, Math.min(80, rough));
  let metal = Math.max(175, Math.min(220, 198 + Math.round((brush - 0.5) * 24 + treadBump * 40)));
  let h = 0.66 + (brush - 0.5) * 0.04 + treadBump;
  let ao = 235;

  if (isInnerSeam || isBoltWell) {
    r *= 0.45; g *= 0.45; b *= 0.48;
    ao = 95;
    rough = 78;
    h = 0.32;
  } else if (isBolt) {
    r = 84; g = 90; b = 98;
    ao = 215;
    rough = 42;
    metal = 220;
    h = 0.78;
  } else if (isBevel) {
    const t = (0.455 - octDist) / 0.030;
    h = 0.28 + t * 0.38;
    ao = Math.round(135 + t * 95);
    rough = 44;
    metal = 215;
  }

  // Cryo-frost rime crystallization in corners & scorch plasma wear marks
  const frostField = fbm(u * 2.0, v * 2.0, 7, 4, 8106) + (octDist > 0.32 ? 0.08 : -0.05);
  const scorchField = fbm(u * 1.5, v * 1.5, 5, 4, 8107);

  if (frostField > 0.66) {
    const f = Math.min(1.0, (frostField - 0.66) * 4.5);
    r = r * (1 - f * 0.55) + 92 * (f * 0.55);
    g = g * (1 - f * 0.55) + 112 * (f * 0.55);
    b = b * (1 - f * 0.55) + 128 * (f * 0.55);
    rough = Math.max(38, Math.min(80, rough + f * 24));
    metal = Math.round(metal * (1 - f * 0.35));
    h += f * 0.05 * nHigh;
  } else if (scorchField > 0.68) {
    const s = Math.min(1.0, (scorchField - 0.68) * 5.0);
    r *= (1 - s * 0.52);
    g *= (1 - s * 0.50);
    b *= (1 - s * 0.44);
    rough = Math.min(80, rough + s * 22);
  }

  return { r, g, b, ao, rough, metal, h };
});

// (2) quantum_cleanroom_slate_2k (1024x1024, RGB):
// Dark slate-teal & carbon-fibre composite cleanroom floor for the Bio-Stasis & Quantum Server sectors,
// with anti-static copper grounding grid lines (metal: 210 on thin grid seams, rough: 45..85 on slate tiles)
// and chemical scuff marks.
writePBRSet('quantum_cleanroom_slate_2k', 1024, false, (u, v) => {
  const gx = (u * 6) % 1;
  const gy = (v * 6) % 1;
  const tx = Math.floor(u * 6);
  const ty = Math.floor(v * 6);

  const nLow = fbm(u, v, 6, 4, 8201);
  const nMid = fbm(u, v, 18, 4, 8202);
  const nHigh = fbm(u, v, 52, 3, 8203);

  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isCopperGrid = border < 0.016;
  const isGridGasket = border >= 0.016 && border < 0.028;

  if (isCopperGrid) {
    // Anti-static beryllium-copper grounding strip embedded between cleanroom tiles (metal: 210, 0 emission!)
    const Tarnish = (nMid - 0.5) * 18;
    return {
      r: 124 + Tarnish,
      g: 78 + Tarnish * 0.7,
      b: 48 + Tarnish * 0.5,
      ao: 215,
      rough: 42 + (nHigh - 0.5) * 14,
      metal: 210,
      h: 0.68
    };
  }
  if (isGridGasket) {
    return { r: 22, g: 26, b: 30, ao: 110, rough: 145, metal: 20, h: 0.34 };
  }

  // Carbon-fibre twill micro-weave pattern inside each dark slate-teal composite tile
  const weaveX = Math.floor(u * 240);
  const weaveY = Math.floor(v * 240);
  const twill = ((weaveX + weaveY * 2) % 4) < 2 ? 1.0 : 0.0;
  const microWeave = (twill - 0.5) * 7.0;

  // Sub-grid perforated airflow micro-dimples in central cleanroom tile zone
  const inSubGrid = gx > 0.18 && gx < 0.82 && gy > 0.18 && gy < 0.82;
  const dimpleDist = Math.hypot(((gx * 12) % 1) - 0.5, ((gy * 12) % 1) - 0.5);
  const isMicroIndentation = inSubGrid && dimpleDist < 0.14 && ((tx + ty) % 2 === 0);

  const tileTone = (hash2(tx, ty, 8204) - 0.5) * 8;
  let r = 42 + tileTone + (nLow - 0.5) * 12 + microWeave;
  let g = 56 + tileTone + (nLow - 0.5) * 14 + microWeave;
  let b = 64 + tileTone + (nLow - 0.5) * 16 + microWeave;

  let rough = 58 + (nLow - 0.5) * 20 + (1.0 - twill) * 10;
  rough = Math.max(45, Math.min(85, rough));
  let metal = 45 + Math.round(twill * 25);
  let h = 0.62 + twill * 0.03 + (nMid - 0.5) * 0.03;
  let ao = 238;

  if (isMicroIndentation) {
    r *= 0.72; g *= 0.74; b *= 0.76;
    ao = 155;
    h -= 0.08;
    rough = 72;
  }

  // Chemical reagent scuff marks & cryo-cart wheel streaks
  const scuffField = fbm(u * 2.2, v * 1.4, 9, 4, 8205);
  if (scuffField > 0.63) {
    const sc = Math.min(1.0, (scuffField - 0.63) * 4.2);
    r = r * (1 - sc * 0.45) + 28 * (sc * 0.45);
    g = g * (1 - sc * 0.42) + 36 * (sc * 0.42);
    b = b * (1 - sc * 0.40) + 38 * (sc * 0.40);
    rough = Math.min(85, rough + sc * 26);
    h -= sc * 0.02;
  }

  return { r, g, b, ao, rough, metal, h };
});

// (3) quantum_basalt_cavern_2k (1024x1024, RGB):
// Subterranean dark volcanic basalt rock & reinforced shotcrete cavern floor for the outer excavation
// perimeter and particle-accelerator trenches (rough: 145..220, wet mineral veins rough: 45).
writePBRSet('quantum_basalt_cavern_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 8301);
  const nMid = fbm(u, v, 16, 4, 8302);
  const nHigh = fbm(u, v, 48, 3, 8303);
  const crag = fbm(u * 1.5, v * 1.5, 10, 4, 8304);

  // Domain-warped wet quartz/magnetite mineral veins & subterranean groundwater seepage fissures
  const warpU = u + (nLow - 0.5) * 0.14;
  const warpV = v + (nMid - 0.5) * 0.14;
  const vein1 = Math.abs(fbm(warpU, warpV, 6, 3, 8305) - 0.50);
  const vein2 = Math.abs(fbm(warpV, warpU, 9, 3, 8306) - 0.48);
  const isWetVein = (vein1 < 0.018 && nLow > 0.34) || (vein2 < 0.014 && nMid > 0.38);

  if (isWetVein) {
    // Glossy wet mineral vein & seepage line catching sharp flashlight specular glints (rough: 45)
    const sheen = (nHigh - 0.5) * 14;
    return {
      r: 32 + sheen,
      g: 38 + sheen,
      b: 46 + sheen,
      ao: 135,
      rough: 45,
      metal: 65,
      h: 0.24 + (nHigh - 0.5) * 0.06
    };
  }

  // Dark volcanic columnar basalt rock & rough sprayed shotcrete patches
  const isShotcrete = nLow > 0.62;
  const rockRelief = (crag - 0.5) * 28 + (nHigh - 0.5) * 18;

  let r, g, b, rough, metal, h, ao;
  if (isShotcrete) {
    // Sprayed dark fiber-reinforced tunnel shotcrete
    r = 56 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
    g = 58 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
    b = 60 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 14;
    rough = Math.max(145, Math.min(220, 192 + (nHigh - 0.5) * 32));
    metal = 0;
    h = 0.54 + (nMid - 0.5) * 0.16 + (nHigh - 0.5) * 0.08;
    ao = Math.round(175 + (nMid - 0.5) * 55);
  } else {
    // Deep subterranean blue-black volcanic basalt cleavage
    r = 40 + rockRelief;
    g = 43 + rockRelief;
    b = 50 + rockRelief;
    rough = Math.max(145, Math.min(220, 168 + (1.0 - crag) * 44));
    metal = 18;
    h = 0.36 + crag * 0.42 + (nHigh - 0.5) * 0.08;
    ao = Math.round(125 + crag * 110);
  }

  // Damp cavern puddle film in lowest basalt pockets
  if (crag < 0.30) {
    const damp = (0.30 - crag) / 0.30;
    r *= (1 - damp * 0.35);
    g *= (1 - damp * 0.32);
    b *= (1 - damp * 0.28);
    rough = Math.round(rough * (1 - damp * 0.65) + 45 * (damp * 0.65));
  }

  return { r, g, b, ao, rough, metal, h };
});

// (4) quantum_bulkhead_wall_2k (1024x1024, RGB):
// Heavy underground laboratory armor bulkhead wall — lower ribbed blast plinth (v < 0.28)
// with dark weathered amber/black chevron hazard trim (0 emission!), middle dark-anthracite
// titanium-alloy acoustic armor panels (v in [0.28, 0.78]) with recessed service conduits and rivet seams,
// upper conduit raceway & structural flange (v > 0.78), battle scorch marks and coolant leak stains.
writePBRSet('quantum_bulkhead_wall_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8401);
  const nMid = fbm(u, v, 18, 4, 8402);
  const nHigh = fbm(u, v, 48, 3, 8403);
  const brush = fbm(u * 8.0, v * 1.5, 20, 3, 8404);

  // Coolant leak & battle scorch overlay across the entire wall height
  const leakStreak = Math.max(0, fbm(u * 5.0, v * 1.1, 8, 4, 8405) - 0.54) * 2.4;
  const scorchBlast = fbm(u * 1.8, v * 1.8, 5, 4, 8406);

  // 1) Lower ribbed blast plinth (v < 0.28)
  if (v < 0.28) {
    // Dark weathered amber/black chevron hazard trim band at v in [0.21, 0.265] (ZERO emission!)
    if (v >= 0.21 && v < 0.265) {
      const wear = fbm(u * 3.5, v * 3.5, 12, 4, 8407);
      const chevron = ((u * 16.0 + (v - 0.21) * 18.0) % 1 + 1) % 1;
      const isAmber = chevron < 0.50;
      const isScratchedMetal = wear > 0.67;

      if (isScratchedMetal) {
        return {
          r: 78 + (nHigh - 0.5) * 18,
          g: 82 + (nHigh - 0.5) * 18,
          b: 88 + (nHigh - 0.5) * 18,
          ao: 195,
          rough: 58,
          metal: 205,
          h: 0.60
        };
      }
      // Muted dark tactical ochre-amber & gunmetal black (0 emission!)
      const grime = Math.max(0, (wear - 0.34) * 1.5);
      const r = (isAmber ? 128 : 26) * (1 - grime * 0.48) + 36 * (grime * 0.48);
      const g = (isAmber ? 88  : 28) * (1 - grime * 0.48) + 38 * (grime * 0.48);
      const b = (isAmber ? 26  : 32) * (1 - grime * 0.48) + 40 * (grime * 0.48);
      return {
        r, g, b,
        ao: 215,
        rough: 95 + grime * 55,
        metal: isAmber ? 35 : 140,
        h: 0.72 + (nMid - 0.5) * 0.04
      };
    }

    // Heavy structural armor ledge at v in [0.265, 0.28]
    if (v >= 0.265) {
      return { r: 28, g: 32, b: 38, ao: 95, rough: 64, metal: 205, h: 0.86 };
    }

    // Vertical blast-ribbed titanium-concrete composite plinth (v < 0.21)
    const ribWave = Math.sin(u * Math.PI * 32.0);
    const isRibCrest = ribWave > 0.2;
    const baseC = 46 + (isRibCrest ? 10 : -8) + (nLow - 0.5) * 12 + (nHigh - 0.5) * 10;
    return {
      r: baseC,
      g: baseC + 3,
      b: baseC + 7,
      ao: isRibCrest ? 225 : 130,
      rough: isRibCrest ? 74 : 135,
      metal: 155,
      h: isRibCrest ? 0.74 : 0.42
    };
  }

  // 2) Middle dark-anthracite titanium-alloy acoustic armor panels (v in [0.28, 0.78])
  if (v <= 0.78) {
    const pu = (u * 2) % 1;
    const pv = (v - 0.28) / 0.50;
    const pBorder = Math.min(pu, 1.0 - pu, pv, 1.0 - pv);
    const isPanelSeam = pBorder < 0.018;

    if (isPanelSeam) {
      return { r: 16, g: 18, b: 22, ao: 65, rough: 140, metal: 145, h: 0.14 };
    }

    // Horizontal recessed service conduit trench at mid-wall (v in [0.50, 0.56])
    if (v >= 0.50 && v <= 0.56) {
      const cv = (v - 0.50) / 0.06;
      const isCablePipe = Math.abs(cv - 0.32) < 0.14 || Math.abs(cv - 0.68) < 0.14;
      const clampX = ((u * 16) % 1) < 0.12;
      if (clampX) {
        return { r: 74, g: 80, b: 88, ao: 185, rough: 52, metal: 215, h: 0.68 };
      }
      return {
        r: isCablePipe ? 48 : 20,
        g: isCablePipe ? 56 : 22,
        b: isCablePipe ? 66 : 26,
        ao: isCablePipe ? 165 : 75,
        rough: isCablePipe ? 48 : 145,
        metal: isCablePipe ? 195 : 110,
        h: isCablePipe ? 0.48 : 0.20
      };
    }

    // Perimeter rivets & acoustic micro-ribbed titanium armor skin
    const rGridU = (pu * 12) % 1;
    const rGridV = (pv * 10) % 1;
    const inRivetBand = pBorder > 0.032 && pBorder < 0.075;
    const isRivet = inRivetBand && Math.hypot(rGridU - 0.5, rGridV - 0.5) < 0.22;

    // Angled armored bevel reinforcement ribs
    const diagRib = Math.sin((pu * 6.0 + pv * 4.0) * Math.PI * 2.0);
    const acousticMicro = Math.sin(v * Math.PI * 180.0) * 0.5 + 0.5;

    let r = 48 + (brush - 0.5) * 14 + (nLow - 0.5) * 10 + (diagRib > 0.65 ? 8 : 0);
    let g = 54 + (brush - 0.5) * 14 + (nLow - 0.5) * 10 + (diagRib > 0.65 ? 9 : 0);
    let b = 62 + (brush - 0.5) * 16 + (nLow - 0.5) * 12 + (diagRib > 0.65 ? 11 : 0);
    let rough = 54 + (1.0 - brush) * 22 + acousticMicro * 12;
    let metal = 192;
    let h = 0.62 + (diagRib > 0.65 ? 0.08 : 0.0) + acousticMicro * 0.03;
    let ao = 230;

    if (isRivet) {
      r = 82; g = 88; b = 96;
      rough = 42;
      metal = 220;
      h = 0.80;
      ao = 195;
    }

    // Coolant leak & battle scorch stains
    if (leakStreak > 0.28) {
      const lk = Math.min(1.0, (leakStreak - 0.28) * 1.8);
      r = r * (1 - lk * 0.50) + 26 * (lk * 0.50);
      g = g * (1 - lk * 0.40) + 52 * (lk * 0.40);
      b = b * (1 - lk * 0.35) + 64 * (lk * 0.35);
      rough = Math.max(32, rough * (1 - lk * 0.45));
    }
    if (scorchBlast > 0.68) {
      const sb = Math.min(1.0, (scorchBlast - 0.68) * 5.0);
      r *= (1 - sb * 0.55);
      g *= (1 - sb * 0.55);
      b *= (1 - sb * 0.50);
      rough = Math.min(165, rough + sb * 70);
    }

    return { r, g, b, ao, rough, metal, h };
  }

  // 3) Upper conduit raceway & structural I-beam flange (v > 0.78)
  const uvUp = (v - 0.78) / 0.22;
  const isFlangeBeam = uvUp < 0.16 || uvUp > 0.84;
  const conduitRow = Math.sin(uvUp * Math.PI * 6.0);
  const isBracket = ((u * 8) % 1) < 0.11;

  if (isFlangeBeam || isBracket) {
    const c = 54 + (nMid - 0.5) * 14;
    return {
      r: c, g: c + 4, b: c + 10,
      ao: 210,
      rough: 58 + (nHigh - 0.5) * 16,
      metal: 205,
      h: 0.78
    };
  }

  const onPipe = conduitRow > 0.0;
  return {
    r: onPipe ? (62 + conduitRow * 16) : 22,
    g: onPipe ? (66 + conduitRow * 16) : 24,
    b: onPipe ? (72 + conduitRow * 18) : 28,
    ao: onPipe ? Math.round(160 + conduitRow * 75) : 85,
    rough: onPipe ? 48 : 135,
    metal: onPipe ? 210 : 120,
    h: onPipe ? (0.48 + conduitRow * 0.24) : 0.22
  };
});

// (5) hero_tokamak_coil_2k (1024x1024, RGB):
// Superconducting Tokamak Fusion Reactor & Particle Accelerator hull atlas —
// braided copper/niobium superconductor coil windings (metal: 230, rough: 35..70),
// dark cryogenic heat-shield tiling, heavy bolted pressure flanges, and plasma arc burn scorch marks.
writePBRSet('hero_tokamak_coil_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8501);
  const nMid = fbm(u, v, 18, 4, 8502);
  const nHigh = fbm(u, v, 52, 3, 8503);

  // Plasma arc burn scorch marks across the reactor casing
  const arcScorch = fbm(u * 2.2, v * 2.2, 7, 4, 8504);
  const scorchMask = arcScorch > 0.66 ? Math.min(1.0, (arcScorch - 0.66) * 4.5) : 0.0;

  // Band 1 (v in [0.26, 0.64]): Braided copper/niobium superconductor coil windings (metal: 230, rough: 35..70)
  if (v >= 0.26 && v <= 0.64) {
    // Structural titanium restraining clamp bridges every 0.25 in U
    const clampDist = Math.min(((u * 4) % 1), 1.0 - ((u * 4) % 1));
    if (clampDist < 0.045) {
      const boltY = ((v - 0.26) / 0.38 * 6) % 1;
      const isBolt = Math.hypot((clampDist / 0.045) - 0.5, boltY - 0.5) < 0.26;
      return {
        r: isBolt ? 92 : 54,
        g: isBolt ? 98 : 60,
        b: isBolt ? 106 : 68,
        ao: isBolt ? 225 : 175,
        rough: isBolt ? 40 : 58,
        metal: 215,
        h: isBolt ? 0.88 : 0.78
      };
    }

    // High-density parallel superconductor windings with fine diagonal copper/niobium braid relief
    const turnPhase = ((v - 0.26) / 0.38 * 28.0) % 1;
    const wireArch = Math.sin(turnPhase * Math.PI);
    const braidWave = Math.sin((u * 180.0 + turnPhase * 4.0) * Math.PI * 2.0) * 0.5 + 0.5;
    const isNbTiStripe = (((Math.floor((v - 0.26) / 0.38 * 28.0)) % 4) === 0);

    let r, g, b;
    if (isNbTiStripe) {
      // Silver-blue Niobium-Titanium superconducting bus turn
      r = 96 + wireArch * 32 + (braidWave - 0.5) * 14;
      g = 108 + wireArch * 34 + (braidWave - 0.5) * 14;
      b = 124 + wireArch * 38 + (braidWave - 0.5) * 16;
    } else {
      // Pure cryogenic oxygen-free copper superconductor winding
      r = 146 + wireArch * 42 + (braidWave - 0.5) * 18;
      g = 86  + wireArch * 28 + (braidWave - 0.5) * 12;
      b = 48  + wireArch * 18 + (braidWave - 0.5) * 8;
    }

    // Apply plasma arc burn scorch
    r *= (1 - scorchMask * 0.62);
    g *= (1 - scorchMask * 0.62);
    b *= (1 - scorchMask * 0.55);

    const rough = Math.max(35, Math.min(70, 38 + (1.0 - wireArch) * 20 + (1.0 - braidWave) * 10 + scorchMask * 25));
    const h = 0.44 + wireArch * 0.34 + braidWave * 0.05;
    const ao = Math.round(130 + wireArch * 115);

    return { r, g, b, ao, rough, metal: 230, h };
  }

  // Band 2 (v < 0.26): Heavy bolted pressure flanges & torus vacuum vessel rings
  if (v < 0.26) {
    const fu = (u * 16) % 1;
    const fv = v / 0.26;
    const isFlangeGroove = Math.abs(fv - 0.50) < 0.06;
    const boltDist = Math.hypot(fu - 0.5, (fv < 0.5 ? fv - 0.25 : fv - 0.75) * 2.2);
    const isHexBolt = boltDist < 0.24;

    if (isFlangeGroove) {
      return { r: 16, g: 18, b: 22, ao: 65, rough: 120, metal: 160, h: 0.16 };
    }

    let c = (isHexBolt ? 88 : 58) + (nMid - 0.5) * 14;
    c *= (1 - scorchMask * 0.55);
    return {
      r: c,
      g: c + 4,
      b: c + 10,
      ao: isHexBolt ? 220 : 185,
      rough: Math.max(35, Math.min(70, (isHexBolt ? 40 : 54) + scorchMask * 22)),
      metal: 225,
      h: isHexBolt ? (0.82 + (0.24 - boltDist) * 0.3) : 0.62
    };
  }

  // Band 3 (v > 0.64): Dark cryogenic heat-shield hexagonal/octagonal ceramic-titanium tiling
  const tu = (u * 8) % 1;
  const tv = ((v - 0.64) / 0.36 * 4) % 1;
  const tBorder = Math.min(tu, 1.0 - tu, tv, 1.0 - tv);
  const isTileGap = tBorder < 0.035;
  const isCenterDimple = Math.hypot(tu - 0.5, tv - 0.5) < 0.12;

  if (isTileGap) {
    return { r: 14, g: 16, b: 20, ao: 60, rough: 145, metal: 120, h: 0.14 };
  }

  let r = (44 + (nLow - 0.5) * 12 + (nHigh - 0.5) * 10) * (1 - scorchMask * 0.55);
  let g = (50 + (nLow - 0.5) * 12 + (nHigh - 0.5) * 10) * (1 - scorchMask * 0.55);
  let b = (58 + (nLow - 0.5) * 14 + (nHigh - 0.5) * 10) * (1 - scorchMask * 0.50);

  return {
    r, g, b,
    ao: isCenterDimple ? 145 : 225,
    rough: Math.max(38, Math.min(82, 52 + (nMid - 0.5) * 18 + scorchMask * 28)),
    metal: 195,
    h: isCenterDimple ? 0.44 : (0.68 - (tBorder < 0.08 ? (0.08 - tBorder) * 3.0 : 0.0))
  };
});

// (6) hero_quantum_server_2k (1024x1024, RGB):
// Liquid-cooled Quantum Mainframe & Cryo-Chiller cabinet atlas —
// perforated black-anodized hexagonal mesh door panels (AO cavities in hex holes),
// gold-plated quantum processor backplane strips (metal: 235, rough: 32),
// braided coolant manifold pipes, and frost condensation.
writePBRSet('hero_quantum_server_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8601);
  const nMid = fbm(u, v, 18, 4, 8602);
  const nHigh = fbm(u, v, 48, 3, 8603);

  // Frost condensation patches along cryo-chiller manifolds
  const frostCond = Math.max(0, fbm(u * 2.5, v * 2.5, 8, 4, 8604) - 0.58) * 2.8;

  // Cabinet structural frame dividers (2 columns: Left u < 0.52 = Hex Mesh Door, Right u >= 0.52 = Gold QPU Backplane & Coolant Pipes)
  const isFrameBorder = u < 0.03 || u > 0.97 || Math.abs(u - 0.52) < 0.022 || v < 0.03 || v > 0.97;
  if (isFrameBorder) {
    const c = 36 + (nMid - 0.5) * 10 + frostCond * 35;
    return {
      r: c, g: c + 4, b: c + 10,
      ao: 220,
      rough: Math.max(38, Math.min(85, 52 + frostCond * 25)),
      metal: 205,
      h: 0.78
    };
  }

  // Left half (u in [0.03, 0.50]): Perforated black-anodized hexagonal mesh door panel with AO cavities in hex holes
  if (u < 0.52) {
    const hx = u * 64.0;
    const hy = v * 64.0 * 1.1547;
    const row = Math.floor(hy);
    const col = Math.floor(hx + (row % 2) * 0.5);
    const cx = (hx + (row % 2) * 0.5) - col - 0.5;
    const cy = hy - row - 0.5;
    const hexDist = Math.hypot(cx, cy);
    const isHexHole = hexDist < 0.34;
    const isHexRim = hexDist >= 0.34 && hexDist < 0.42;

    if (isHexHole) {
      // Deep shadowed cavity inside perforated server door mesh (0 emission!)
      // Faintly visible internal gold/copper heatsink fin silhouette inside cavity
      const fin = Math.sin(v * Math.PI * 140.0) > 0.3;
      return {
        r: fin ? 34 : 10,
        g: fin ? 26 : 12,
        b: fin ? 16 : 15,
        ao: 35,
        rough: fin ? 48 : 180,
        metal: fin ? 210 : 80,
        h: 0.08
      };
    }

    // Black-anodized brushed aluminum hex mesh web
    const r = 34 + (isHexRim ? 10 : 0) + (nHigh - 0.5) * 8 + frostCond * 38;
    const g = 38 + (isHexRim ? 12 : 0) + (nHigh - 0.5) * 8 + frostCond * 46;
    const b = 44 + (isHexRim ? 14 : 0) + (nHigh - 0.5) * 10 + frostCond * 54;
    return {
      r, g, b,
      ao: isHexRim ? 175 : 230,
      rough: Math.max(36, Math.min(78, 46 + frostCond * 24)),
      metal: 195,
      h: isHexRim ? 0.54 : 0.68
    };
  }

  // Right half (u in [0.54, 0.97]): Gold-plated quantum processor dilution chandelier backplane & braided coolant manifold pipes
  const ru = (u - 0.54) / 0.43;

  // Vertical braided stainless-steel cryo-coolant manifold pipes at ru in [0.72, 0.94]
  if (ru > 0.72) {
    const pipeU = ((ru - 0.72) / 0.22 * 2.0) % 1;
    const isPipeBody = pipeU > 0.12 && pipeU < 0.88;
    if (!isPipeBody) {
      return { r: 16, g: 18, b: 22, ao: 70, rough: 140, metal: 120, h: 0.18 };
    }
    const cyl = Math.sin(((pipeU - 0.12) / 0.76) * Math.PI);
    const braid = Math.sin((pipeU * 40.0 + v * 120.0) * Math.PI) * Math.sin((pipeU * 40.0 - v * 120.0) * Math.PI);
    const r = 82 + cyl * 34 + braid * 14 + frostCond * 32;
    const g = 90 + cyl * 36 + braid * 14 + frostCond * 42;
    const b = 102 + cyl * 40 + braid * 16 + frostCond * 54;
    return {
      r, g, b,
      ao: Math.round(140 + cyl * 100),
      rough: Math.max(34, Math.min(76, 44 + (1.0 - cyl) * 18 + frostCond * 22)),
      metal: 220,
      h: 0.48 + cyl * 0.34 + braid * 0.04
    };
  }

  // Gold-plated quantum processor backplane strips & coaxial microwave bus lines (metal: 235, rough: 32)
  const stageY = (v * 8.0) % 1;
  const isGoldPlateStage = stageY < 0.42;
  const coaxBus = Math.sin(ru * Math.PI * 24.0);
  const isGoldCoax = coaxBus > 0.35;

  if (isGoldPlateStage || isGoldCoax) {
    const sheen = isGoldPlateStage ? (Math.sin(stageY / 0.42 * Math.PI) * 24) : (coaxBus * 22);
    return {
      r: 164 + sheen + (nHigh - 0.5) * 12,
      g: 128 + sheen * 0.8 + (nHigh - 0.5) * 10,
      b: 46  + sheen * 0.3 + (nHigh - 0.5) * 6,
      ao: 235,
      rough: 32,
      metal: 235,
      h: isGoldPlateStage ? 0.76 : (0.58 + coaxBus * 0.14)
    };
  }

  // Dark silicon/carbon QPU backplane substrate beneath the gold bus strips
  return {
    r: 22 + (nMid - 0.5) * 6,
    g: 28 + (nMid - 0.5) * 6,
    b: 34 + (nMid - 0.5) * 8,
    ao: 125,
    rough: 64,
    metal: 150,
    h: 0.34
  };
});

// (7) hero_biopod_glass_1k (512x512, RGB):
// Shattered/cracked Bio-Stasis containment cylinder & robotic arm housing —
// dark emerald-tinted armored glass panels with spiderweb fracture lines in the normal/height map,
// stainless steel end-caps, and dried bio-fluid residue inside (rough: 22..65, metal: 90..190).
writePBRSet('hero_biopod_glass_1k', 512, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8701);
  const nMid = fbm(u, v, 18, 4, 8702);
  const nHigh = fbm(u, v, 48, 3, 8703);

  // Top & bottom stainless-steel containment end-caps & robotic actuator collars (v < 0.18 or v > 0.82)
  if (v < 0.18 || v > 0.82) {
    const rib = Math.sin(u * Math.PI * 36.0) * 0.5 + 0.5;
    const isSeam = Math.abs(v - 0.16) < 0.012 || Math.abs(v - 0.84) < 0.012;
    if (isSeam) {
      return { r: 18, g: 22, b: 24, ao: 75, rough: 60, metal: 140, h: 0.18 };
    }
    const c = 76 + rib * 22 + (nMid - 0.5) * 12;
    return {
      r: c, g: c + 4, b: c + 8,
      ao: Math.round(180 + rib * 60),
      rough: Math.max(22, Math.min(65, 38 + (1.0 - rib) * 18)),
      metal: 190,
      h: 0.64 + rib * 0.18
    };
  }

  // Spiderweb fracture lines centered at impact point (0.48, 0.52) on the armored stasis glass
  const dx = u - 0.48;
  const dy = v - 0.52;
  const rad = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);

  // Radial spokes + concentric stress rings perturbed by noise
  const spokeFreq = 14.0;
  const spokeWave = Math.abs(Math.sin(ang * spokeFreq + (nLow - 0.5) * 1.8));
  const ringWave = Math.abs(Math.sin((rad * 18.0 + (nMid - 0.5) * 0.55) * Math.PI));
  const isRadialCrack = rad < 0.42 && spokeWave < (0.085 - rad * 0.12);
  const isRingCrack = rad > 0.04 && rad < 0.38 && ringWave < 0.095 && nLow > 0.36;
  const isImpactCore = rad < 0.045;
  const isCrack = isRadialCrack || isRingCrack || isImpactCore;

  // Dried amber-emerald bio-fluid residue coating the lower inner cylinder wall
  const bioResidue = Math.max(0, (0.62 - v) * 1.4) * fbm(u * 2.5, v * 2.5, 8, 4, 8704);

  if (isCrack) {
    // Refracting shattered glass fracture edge catching intense flashlight normal glints
    return {
      r: 86 + (nHigh - 0.5) * 24,
      g: 124 + (nHigh - 0.5) * 28,
      b: 118 + (nHigh - 0.5) * 26,
      ao: 135,
      rough: 24,
      metal: 145,
      h: isImpactCore ? 0.18 : 0.26
    };
  }

  // Dark emerald-tinted armored stasis glass (0 emission! Low roughness 22..45)
  let r = 24 + (nLow - 0.5) * 8;
  let g = 52 + (nLow - 0.5) * 14;
  let b = 48 + (nLow - 0.5) * 12;
  let rough = 24 + (nMid - 0.5) * 8;
  let metal = 110;
  let h = 0.72 + (nLow - 0.5) * 0.03;

  if (bioResidue > 0.24) {
    const br = Math.min(1.0, (bioResidue - 0.24) * 2.6);
    r = r * (1 - br) + (48 + (nHigh - 0.5) * 14) * br;
    g = g * (1 - br) + (68 + (nHigh - 0.5) * 16) * br;
    b = b * (1 - br) + (38 + (nHigh - 0.5) * 10) * br;
    rough = Math.min(65, rough + br * 36);
    metal = Math.round(metal * (1 - br * 0.2) + 90 * (br * 0.2));
    h -= br * 0.05;
  }

  return { r, g, b, ao: 230, rough, metal, h };
});

// (8) decal_blood_cryo_spill (512x512, RGBA for alphaMode: "MASK"):
// Dark coagulated blood mixed with crystalline blue-grey liquid-nitrogen/coolant spill puddle
// and bloody drag tracks (0 emission! Low roughness 20..55 so it gleams sharply when the player's flashlight sweeps across it).
writePBRSet('decal_blood_cryo_spill', 512, true, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 8801);
  const nMid = fbm(u, v, 16, 4, 8802);
  const nHigh = fbm(u, v, 48, 3, 8803);

  // Main cryo-blood pool + secondary frozen coolant puddle + bloody body/boot drag tracks
  const dx1 = (u - 0.45) * 1.15;
  const dy1 = (v - 0.46) * 1.10;
  const distMain = Math.hypot(dx1, dy1) - (nLow - 0.5) * 0.25 - (nMid - 0.5) * 0.10;
  const inMainPool = distMain < 0.29;

  const dx2 = (u - 0.68) * 1.30;
  const dy2 = (v - 0.34) * 1.25;
  const distCryo = Math.hypot(dx2, dy2) - (nLow - 0.5) * 0.18 - (nMid - 0.5) * 0.08;
  const inCryoPool = distCryo < 0.18;

  // Bloody drag streaks & smeared heel/hand tracks pulling toward bottom-right
  const dragAxis = (u - 0.45) * 0.70 + (v - 0.46) * 0.71;
  const dragCross = Math.abs((u - 0.45) * 0.71 - (v - 0.46) * 0.70);
  const streakWave = Math.sin(dragCross * Math.PI * 52.0 + (nLow - 0.5) * 2.5);
  const inDragTrack = dragAxis > 0.12 && dragAxis < 0.54 && dragCross < 0.11 && streakWave > -0.15 && nMid > 0.34;

  if (!inMainPool && !inCryoPool && !inDragTrack) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Fluid composition: dark coagulated arterial blood vs crystalline blue-grey liquid-nitrogen rime & coolant
  const swirl = fbm(u + nLow * 0.14, v - nLow * 0.14, 8, 4, 8804);
  const isCryoCrystalline = (inCryoPool && !inMainPool) || (swirl > 0.56 && !inDragTrack);
  const isFrostRim = (inMainPool && distMain > 0.235) || (inCryoPool && distCryo > 0.135);

  let r, g, b, rough, metal, h;
  if (isFrostRim || isCryoCrystalline) {
    // Crystalline blue-grey liquid-nitrogen / cryo-coolant glaze (0 emission! Low roughness 20..42)
    const crystal = (nHigh - 0.5) * 22;
    r = 68 + crystal;
    g = 86 + crystal;
    b = 102 + crystal;
    rough = Math.max(20, Math.min(55, 24 + (nMid - 0.5) * 16));
    metal = 48;
    h = 0.68 + (nHigh - 0.5) * 0.12;
  } else {
    // Dark coagulated venous blood flash-frozen in the coolant spill (0 emission! Low roughness 20..50)
    r = 64 + (nMid - 0.5) * 18;
    g = 9  + (nMid - 0.5) * 5;
    b = 12 + (nMid - 0.5) * 5;
    rough = Math.max(20, Math.min(55, (inDragTrack ? 42 : 26) + (nLow - 0.5) * 14));
    metal = 24;
    h = inDragTrack ? (0.58 + streakWave * 0.05) : (0.64 + (swirl - 0.5) * 0.06);
  }

  return { r, g, b, a: 255, ao: 220, rough, metal, h };
});

// (9) decal_quantum_sector_stencil (512x512, RGBA for alphaMode: "MASK"):
// Worn, chipped tactical sector warning chevrons, radiation/magnetic-hazard trefoil stencil,
// and scorched floor guide markings (0 emission, muted dark ochre & slate grey).
writePBRSet('decal_quantum_sector_stencil', 512, true, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 8901);
  const nMid = fbm(u, v, 18, 4, 8902);
  const nHigh = fbm(u, v, 48, 3, 8903);

  // Top & bottom parallel tactical chevron warning bars (v in [0.08, 0.22] and [0.78, 0.92])
  const inTopChevron = v >= 0.08 && v <= 0.22 && u >= 0.05 && u <= 0.95;
  const inBotChevron = v >= 0.78 && v <= 0.92 && u >= 0.05 && u <= 0.95;

  // Central radiation / strong-magnetic-field trefoil hazard stencil at (0.5, 0.5)
  const dx = u - 0.50;
  const dy = v - 0.50;
  const rad = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx); // -PI..PI
  const deg = ((ang * 180 / Math.PI) + 360) % 360;

  // 3 radiation trefoil blades (each 60 deg wide, spaced 120 deg apart) + central hub + outer containment ring
  const inBladeAngle = (deg >= 15 && deg <= 75) || (deg >= 135 && deg <= 195) || (deg >= 255 && deg <= 315);
  const inTrefoilBlade = rad > 0.065 && rad < 0.205 && inBladeAngle;
  const inTrefoilHub = rad < 0.042;
  const inOuterRing = rad > 0.235 && rad < 0.265 && Math.abs(dx) > 0.025;

  // Flanking tactical sector code bar blocks ("Q-04" style stencil bars) at left and right
  const inSideBars = Math.abs(dy) < 0.14 && Math.abs(dx) > 0.31 && Math.abs(dx) < 0.43 &&
                     (((Math.floor((v - 0.36) * 28)) % 2) === 0);

  const inStencilMask = inTopChevron || inBotChevron || inTrefoilBlade || inTrefoilHub || inOuterRing || inSideBars;
  if (!inStencilMask) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Heavy paint chipping & plasma scorch erosion revealing underlying deck floor
  const chipNoise = fbm(u * 2.8, v * 2.8, 10, 4, 8904);
  if (chipNoise > 0.71) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Muted dark ochre & tactical slate-grey non-emissive stencil paint (0 emission!)
  const chevStripe = ((u * 9.0 + (inTopChevron ? v : -v) * 9.0) % 1 + 1) % 1;
  const isOchre = (inTopChevron || inBotChevron) ? (chevStripe < 0.52) : (inTrefoilBlade || inTrefoilHub);

  let r = isOchre ? (132 + (nLow - 0.5) * 18) : (64 + (nLow - 0.5) * 14);
  let g = isOchre ? (96  + (nLow - 0.5) * 16) : (70 + (nLow - 0.5) * 14);
  let b = isOchre ? (28  + (nLow - 0.5) * 8)  : (78 + (nLow - 0.5) * 16);
  let rough = 94 + (nMid - 0.5) * 26;
  let h = 0.65 + (nHigh - 0.5) * 0.05;

  // Scorched soot & boot traffic grime over the floor markings
  const scorch = fbm(u, v, 6, 3, 8905);
  if (scorch > 0.56) {
    const s = Math.min(1.0, (scorch - 0.56) * 2.8);
    r = r * (1 - s * 0.65) + 22 * (s * 0.65);
    g = g * (1 - s * 0.65) + 24 * (s * 0.65);
    b = b * (1 - s * 0.65) + 26 * (s * 0.65);
    rough = Math.min(185, rough + s * 65);
    h -= s * 0.03;
  }

  return { r, g, b, a: 255, ao: 225, rough, metal: 15, h };
});

// (10) decal_circuit_glass_debris (512x512, RGBA for alphaMode: "MASK"):
// Shattered tempered stasis-pod glass shards, snapped gold/green fiber-optic circuit boards,
// and severed cryogenic hose fragments on the floor (0 emission, low roughness 25..60 on glass/gold shards for flashlight sparkle).
writePBRSet('decal_circuit_glass_debris', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 9001);
  const nMid = fbm(u, v, 20, 4, 9002);
  const nHigh = fbm(u, v, 52, 3, 9003);

  // 1) Snapped dark-emerald & gold quantum fiber-optic PCB circuit boards (2 angular broken boards)
  const u1 = (u - 0.34) * 0.86 + (v - 0.42) * 0.51;
  const v1 = -(u - 0.34) * 0.51 + (v - 0.42) * 0.86;
  const snapJag = (nMid - 0.5) * 0.06;
  const inCircuitBoard1 = Math.abs(u1) < 0.16 && v1 > -0.18 && v1 < (0.15 + snapJag);

  const u2 = (u - 0.68) * 0.78 - (v - 0.64) * 0.62;
  const v2 = (u - 0.68) * 0.62 + (v - 0.64) * 0.78;
  const inCircuitBoard2 = Math.abs(u2) < 0.13 && v2 > -0.14 && v2 < (0.12 - snapJag);

  // 2) Severed corrugated stainless/rubber cryogenic transfer hose fragment snaking across top-right to bottom-left
  const hoseCurve = Math.sin(u * Math.PI * 2.2 + 0.3) * 0.12;
  const hoseDist = Math.abs((v - 0.28) - hoseCurve);
  const inCryoHose = u > 0.22 && u < 0.78 && hoseDist < 0.032;

  // 3) Shattered tempered stasis-pod glass shards scattered across the tile
  const shardCellX = Math.floor(u * 9);
  const shardCellY = Math.floor(v * 9);
  const su = (u * 9) % 1 - 0.5;
  const sv = (v * 9) % 1 - 0.5;
  const shardSeed = hash2(shardCellX, shardCellY, 9004);
  const rotAng = shardSeed * Math.PI * 2.0;
  const rsu = su * Math.cos(rotAng) + sv * Math.sin(rotAng);
  const rsv = -su * Math.sin(rotAng) + sv * Math.cos(rotAng);
  // Triangular/polygonal glass shard silhouette in active cells
  const inGlassShard = shardSeed > 0.42 &&
                       (Math.abs(rsu) * 1.4 + Math.abs(rsv) * 1.1 < 0.36) &&
                       (rsu + rsv * 0.7 < 0.22);

  if (inCryoHose) {
    // Corrugated cryo-hose rings with braided metallic sleeve & dark rubber valleys
    const ring = Math.sin(u * Math.PI * 96.0) * 0.5 + 0.5;
    const cyl = Math.sqrt(Math.max(0, 1.0 - Math.pow(hoseDist / 0.032, 2)));
    return {
      r: 44 + ring * 38 * cyl,
      g: 50 + ring * 42 * cyl,
      b: 58 + ring * 46 * cyl,
      a: 255,
      ao: Math.round(140 + ring * 95),
      rough: Math.max(32, Math.min(75, 38 + (1.0 - ring) * 32)),
      metal: ring > 0.45 ? 205 : 40,
      h: 0.56 + cyl * 0.28 + ring * 0.08
    };
  }

  if (inCircuitBoard1 || inCircuitBoard2) {
    const cu = inCircuitBoard1 ? u1 : u2;
    const cv = inCircuitBoard1 ? v1 : v2;
    // Gold micro-traces, QFP processor pads & copper bus pins on dark solder-mask PCB
    const traceX = Math.abs(((cu * 48) % 1) - 0.5) < 0.14;
    const traceY = Math.abs(((cv * 48) % 1) - 0.5) < 0.14;
    const isICChip = Math.abs(cu) < 0.055 && Math.abs(cv) < 0.055;
    const isGoldTrace = !isICChip && ((traceX && nMid > 0.38) || (traceY && nLow > 0.45));
    const isEdgeConnector = Math.abs(cu) > 0.125 && (((Math.floor(cv * 90)) % 2) === 0);

    if (isICChip) {
      return {
        r: 24, g: 26, b: 30, a: 255,
        ao: 215, rough: 48, metal: 80, h: 0.78
      };
    }
    if (isGoldTrace || isEdgeConnector) {
      // Specular gold circuit traces & edge connector fingers (rough: 25..42, metal: 235)
      return {
        r: 162 + (nHigh - 0.5) * 18,
        g: 126 + (nHigh - 0.5) * 14,
        b: 44  + (nHigh - 0.5) * 8,
        a: 255,
        ao: 235,
        rough: 28 + (nMid - 0.5) * 10,
        metal: 235,
        h: 0.72
      };
    }
    // Dark emerald fiber-optic PCB substrate
    return {
      r: 22 + (nLow - 0.5) * 8,
      g: 58 + (nLow - 0.5) * 14,
      b: 42 + (nLow - 0.5) * 10,
      a: 255,
      ao: 215,
      rough: 46 + (nHigh - 0.5) * 14,
      metal: 35,
      h: 0.66
    };
  }

  if (inGlassShard) {
    // Faceted tempered stasis-glass shard with tilted normal height slope so flashlights sparkle across the floor!
    const facetSlope = 0.66 + rsu * 0.55 - rsv * 0.45;
    return {
      r: 68 + shardSeed * 28 + (nHigh - 0.5) * 14,
      g: 98 + shardSeed * 32 + (nHigh - 0.5) * 16,
      b: 96 + shardSeed * 30 + (nHigh - 0.5) * 16,
      a: 255,
      ao: 225,
      rough: Math.max(25, Math.min(60, 26 + (1.0 - shardSeed) * 20)),
      metal: 155,
      h: Math.max(0.42, Math.min(0.92, facetSlope))
    };
  }

  return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
});

// 3. Write .import files for ALL textures in TEX_DIR
const allTexFiles = fs.readdirSync(TEX_DIR).filter(f => (f.endsWith('.png') || f.endsWith('.jpg')) && !f.endsWith('.import'));
for (const f of allTexFiles) {
  let role = 'color';
  if (f.includes('_nor_gl')) role = 'normal';
  else if (f.includes('_arm') || f.includes('_rough') || f.includes('_spec')) role = 'arm';
  writeTextureImport(f, role);
}

// 4. Write CREDITS.txt
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map2_Yeralti_Kuantum_Labirenti_5v5v5v5_v3 PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, industrial_light_lens, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K underground quantum research facility PBR textures (0 emission, dark tactical sci-fi palette, flashlight-reactive normal & roughness/metallic):
  quantum_titanium_deck_2k, quantum_cleanroom_slate_2k, quantum_basalt_cavern_2k,
  quantum_bulkhead_wall_2k, hero_tokamak_coil_2k, hero_quantum_server_2k,
  hero_biopod_glass_1k, decal_blood_cryo_spill, decal_quantum_sector_stencil,
  decal_circuit_glass_debris.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
