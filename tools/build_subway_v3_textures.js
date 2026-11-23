#!/usr/bin/env node
/**
 * build_subway_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map6_Metro_Taktik_Istasyonu_3v3v3v3_v3.gltf
 *
 * CRITICAL ART DIRECTION (HOSPITAL V3 LESSONS):
 * - ZERO glowing/neon pink or bright emissive floor lines or signs!
 * - All floor markings, tactical guide lines, blood drag trails, graffiti, and tactile paving
 *   are 100% NON-EMISSIVE (0 emission) dark/matte PBR materials that stay dark in shadow and
 *   react realistically to the player's flashlight via Normal Map and Roughness contrast.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map6_Metro_v3');
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
  const resPath = `res://asset model/haritalar/Map6_Metro_v3/textures/${fileName}`;
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

// 2. Procedurally Generate Custom Subway v3 High-Res PBR Texture Sets
// (1) subway_terrazzo_platform_2k (1024x1024, non-alpha):
// Dirty dark-grey granite/terrazzo subway platform tiles (6x6 grid) with aggregate speckles, dark grout seams, wet damp sheen patches, and boot scuff marks.
writePBRSet('subway_terrazzo_platform_2k', 1024, false, (u, v) => {
  const gx = (u * 6) % 1;
  const gy = (v * 6) % 1;
  const tx = Math.floor(u * 6);
  const ty = Math.floor(v * 6);
  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isGrout = border < 0.025;
  const isBevel = border >= 0.025 && border < 0.048;

  const nLow = fbm(u, v, 6, 4, 2101);
  const nMid = fbm(u, v, 18, 3, 2102);
  const speckle1 = hash2((u * 512) | 0, (v * 512) | 0, 2103);
  const speckle2 = hash2((u * 256) | 0, (v * 256) | 0, 2104);
  const tileVar = (hash2(tx, ty, 2105) - 0.5) * 12;

  if (isGrout) {
    const gNoise = (nMid - 0.5) * 12;
    return {
      r: 30 + gNoise,
      g: 32 + gNoise,
      b: 34 + gNoise,
      ao: 105,
      rough: 230,
      metal: 0,
      h: 0.14
    };
  }

  // Dark granite/terrazzo base (matte dark grey, linear average ~0.18..0.28)
  let r = 82 + tileVar + (nLow - 0.5) * 20;
  let g = 85 + tileVar + (nLow - 0.5) * 20;
  let b = 88 + tileVar + (nLow - 0.5) * 22;

  // Terrazzo mineral aggregate chips
  if (speckle1 > 0.87) {
    r -= 24; g -= 24; b -= 22;
  } else if (speckle1 < 0.11) {
    r += 22; g += 22; b += 20;
  } else if (speckle2 > 0.88) {
    r += 14; g += 11; b += 8;
  }

  // Grime & boot scuff marks
  const scuff = Math.max(0, fbm(u * 1.6, v * 0.8, 12, 3, 2106) - 0.54) * 2.2;
  const damp = Math.max(0, fbm(u, v, 4, 4, 2107) - 0.50) * 2.1;

  r = r * (1 - scuff * 0.45) - damp * 18;
  g = g * (1 - scuff * 0.45) - damp * 17;
  b = b * (1 - scuff * 0.45) - damp * 15;

  // Wet damp sheen patches have low roughness (50..85) so flashlights gleam across the platform!
  let rough = 105 + (nMid - 0.5) * 32 + scuff * 85 - damp * 65;
  rough = Math.max(46, Math.min(235, rough));

  const bevelDrop = isBevel ? ((0.048 - border) / 0.023) * 0.22 : 0.0;
  const h = 0.68 + (nMid - 0.5) * 0.14 - scuff * 0.08 - bevelDrop;
  const ao = (isBevel ? 185 : 235) - scuff * 45;

  return { r, g, b, ao, rough, metal: 8, h };
});

// (2) subway_tactile_paving_1k (512x512, non-alpha):
// Weather-worn, mud-stained yellow/ochre blister tactile platform edge paving tiles
// (muted dirty amber-ochre R:145, G:115, B:32 with dark soot & raised circular tactile blisters in normal map, NEVER neon!)
writePBRSet('subway_tactile_paving_1k', 512, false, (u, v) => {
  // 2x2 tile grid in UV space, each tile has a 6x6 array of raised circular blisters (12x12 total)
  const tileGX = (u * 2) % 1;
  const tileGY = (v * 2) % 1;
  const tileBorder = Math.min(tileGX, 1 - tileGX, tileGY, 1 - tileGY);
  const isJoint = tileBorder < 0.024;

  const nLow = fbm(u, v, 6, 4, 2201);
  const nHigh = fbm(u, v, 24, 3, 2202);
  const soot = Math.max(0, fbm(u, v, 8, 4, 2203) - 0.44) * 1.85;

  if (isJoint) {
    return { r: 28, g: 26, b: 22, ao: 95, rough: 235, metal: 0, h: 0.12 };
  }

  // Blister cell (12x12 grid across UV)
  const bx = ((u * 12) % 1) - 0.5;
  const by = ((v * 12) % 1) - 0.5;
  const bDist = Math.hypot(bx, by);
  const inTileMargin = tileBorder < 0.075;

  let blisterH = 0.0;
  let blisterAO = 230;
  let wearTop = 0.0;
  if (!inTileMargin && bDist < 0.33) {
    // Raised frustum/dome blister
    const normR = bDist / 0.33;
    blisterH = Math.sqrt(Math.max(0, 1.0 - normR * normR)) * 0.38;
    if (normR > 0.78) blisterAO = 165; // crevice ring around base of blister
    if (normR < 0.45) wearTop = 1.0;   // boot wear on top of blister dome
  }

  // Muted dirty amber-ochre base (R:145, G:115, B:32), weathered by dark soot and boot mud
  let r = 145 + (nLow - 0.5) * 22 + (nHigh - 0.5) * 12 + wearTop * 8;
  let g = 115 + (nLow - 0.5) * 18 + (nHigh - 0.5) * 10 + wearTop * 6;
  let b = 32  + (nLow - 0.5) * 10 + (nHigh - 0.5) * 8;

  // Mud & soot darkening in grooves between blisters
  const grooveMud = Math.min(1.0, soot * (1.05 - blisterH * 1.4));
  r = r * (1 - grooveMud * 0.65) + 34 * (grooveMud * 0.65);
  g = g * (1 - grooveMud * 0.65) + 30 * (grooveMud * 0.65);
  b = b * (1 - grooveMud * 0.65) + 25 * (grooveMud * 0.65);

  const rough = 128 + grooveMud * 85 - wearTop * 28 + (nHigh - 0.5) * 24;
  const ao = Math.min(blisterAO, 232 - grooveMud * 75);
  const h = 0.48 + blisterH + (nHigh - 0.5) * 0.05;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (3) subway_ceramic_wall_2k (1024x1024, non-alpha):
// Classic underground bevel-edged dirty subway brick-pattern ceramic wall tiles (16x8 staggered bond),
// dark slate-teal lower band, grimy off-white/grey upper tiles, rust/water leak streaks from ceiling,
// chipped missing tiles exposing concrete, and dark mold at the base.
writePBRSet('subway_ceramic_wall_2k', 1024, false, (u, v) => {
  // 8 horizontal courses per UV tile, 16 vertical columns? Wait: "16x8 staggered bond" -> 8 columns x 16 rows of subway brick tiles (each tile 2:1 aspect)
  const cols = 8;
  const rows = 16;
  const rowIdx = Math.floor(v * rows);
  const stagger = (rowIdx % 2) * 0.5;
  const uStag = (u * cols + stagger);
  const colIdx = Math.floor(uStag) % cols;
  const gx = uStag % 1;
  const gy = (v * rows) % 1;

  const nLow = fbm(u, v, 6, 4, 2301);
  const nMid = fbm(u, v, 16, 4, 2302);
  const nHigh = fbm(u, v, 36, 3, 2303);

  // Chipped/missing ceramic tile mask exposing raw rough dark mortar/concrete underneath
  const tileHash = hash2(colIdx, rowIdx, 2304);
  const isMissingTile = (tileHash > 0.91) || (tileHash > 0.83 && nLow < 0.36);

  // Rust/water leak vertical streaks running down from top (v near 0 or 1; support both orientations)
  const streakNoise = Math.max(0, fbm(u * 4.5, v * 0.5, 8, 4, 2305) - 0.47) * 2.3;
  const topBottomMold = Math.max(0, (0.16 - Math.min(v, 1 - v)) * 5.2) * fbm(u, v, 8, 3, 2306);

  if (isMissingTile) {
    // Exposed dark pitted concrete backing behind missing tile
    const cR = 62 + (nMid - 0.5) * 24 - streakNoise * 22;
    const cG = 60 + (nMid - 0.5) * 22 - streakNoise * 24;
    const cB = 56 + (nMid - 0.5) * 20 - streakNoise * 25;
    return {
      r: cR, g: cG, b: cB,
      ao: 135,
      rough: 235,
      metal: 0,
      h: 0.20 + (nHigh - 0.5) * 0.14
    };
  }

  // Grout joints (wider vertically in aspect)
  const borderX = Math.min(gx, 1 - gx);
  const borderY = Math.min(gy, 1 - gy) * 0.5;
  const border = Math.min(borderX, borderY);
  const isGrout = border < 0.032;
  const isBevel = border >= 0.032 && border < 0.085;

  if (isGrout) {
    return {
      r: 38 - streakNoise * 14,
      g: 36 - streakNoise * 15,
      b: 33 - streakNoise * 16,
      ao: 105,
      rough: 228,
      metal: 0,
      h: 0.24
    };
  }

  // Classic subway color bands: dark slate-teal lower courses & accent trim stripe, grimy grey/off-white main field
  const isTealBand = (rowIdx <= 4) || (rowIdx === 12);
  const tileTint = (tileHash - 0.5) * 14;
  let r, g, b;
  if (isTealBand) {
    // Dark slate-teal ceramic glaze
    r = 44 + tileTint + (nLow - 0.5) * 16;
    g = 76 + tileTint + (nLow - 0.5) * 20;
    b = 82 + tileTint + (nLow - 0.5) * 20;
  } else {
    // Grimy underground ceramic off-white / warm grey (kept below 0.38 linear average)
    r = 128 + tileTint + (nLow - 0.5) * 24;
    g = 130 + tileTint + (nLow - 0.5) * 24;
    b = 124 + tileTint + (nLow - 0.5) * 22;
  }

  // Apply rust/water leak streaks (brownish-orange dark rust deposit)
  if (streakNoise > 0.05) {
    const s = Math.min(1.0, streakNoise * 0.75);
    r = r * (1 - s) + 74 * s;
    g = g * (1 - s) + 46 * s;
    b = b * (1 - s) + 28 * s;
  }

  // Apply dark damp mold near base/top
  if (topBottomMold > 0.04) {
    const m = Math.min(0.85, topBottomMold * 0.75);
    r *= (1 - m);
    g *= (1 - m * 0.92);
    b *= (1 - m);
  }

  const bevelSlope = isBevel ? ((border - 0.032) / 0.053) : 1.0;
  const h = 0.42 + bevelSlope * 0.36 + (nMid - 0.5) * 0.04;
  // Glazed ceramic has low roughness (55..95) except where covered in rust/mold
  const rough = Math.min(230, 58 + streakNoise * 95 + topBottomMold * 110 + (nHigh - 0.5) * 18);
  const ao = (isBevel ? 195 : 242) - streakNoise * 45 - topBottomMold * 65;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (4) subway_ballast_track_2k (1024x1024, non-alpha):
// Crushed dark basalt track ballast gravel with embedded weathered concrete/timber railway sleepers (ties),
// oil stains, and strong normal map relief.
writePBRSet('subway_ballast_track_2k', 1024, false, (u, v) => {
  // 4 horizontal railway sleepers (ties) per V repeat
  const tiePhase = (v * 4) % 1;
  const inTie = tiePhase > 0.22 && tiePhase < 0.64 && u > 0.04 && u < 0.96;
  const tieEdge = inTie ? Math.min(tiePhase - 0.22, 0.64 - tiePhase, u - 0.04, 0.96 - u) : 0;

  // Center grease / oil drip band along the track center (u near 0.5) and rail seat chairs (u near 0.24 and 0.76)
  const centerOil = Math.exp(-Math.pow((u - 0.5) * 4.5, 2)) * fbm(u, v, 6, 4, 2401);
  const railSeat = (Math.abs(u - 0.24) < 0.045 || Math.abs(u - 0.76) < 0.045);

  const nLow = fbm(u, v, 8, 4, 2402);
  const nMid = fbm(u, v, 24, 4, 2403);
  const nRock = fbm(u, v, 48, 3, 2404);

  if (inTie) {
    if (railSeat) {
      // Rusted cast-iron tie plate / fastener clip under the rail
      const rust = nMid * 26;
      return {
        r: 68 + rust,
        g: 44 + rust * 0.7,
        b: 34 + rust * 0.5,
        ao: 155,
        rough: 135 + (nRock - 0.5) * 35,
        metal: 175,
        h: 0.86 + (nRock - 0.5) * 0.1
      };
    }
    // Weathered creosote-soaked timber / dark pre-stressed concrete sleeper with wood grain along U
    const grain = fbm(u * 0.5, v * 6.0, 16, 4, 2405);
    let r = 64 + (grain - 0.5) * 24 + (nLow - 0.5) * 14;
    let g = 56 + (grain - 0.5) * 20 + (nLow - 0.5) * 12;
    let b = 48 + (grain - 0.5) * 18 + (nLow - 0.5) * 10;

    // Darken by oil stain in track center
    r *= (1 - centerOil * 0.55);
    g *= (1 - centerOil * 0.55);
    b *= (1 - centerOil * 0.55);

    const rough = 175 - centerOil * 95 + (grain - 0.5) * 30;
    const bevel = Math.min(1.0, tieEdge * 18.0);
    const h = 0.42 + bevel * 0.34 + (grain - 0.5) * 0.12;
    const ao = 165 + bevel * 65 - centerOil * 35;
    return { r, g, b, ao, rough, metal: 0, h };
  }

  // Crushed angular dark basalt ballast stones
  const cell1 = valueNoise(u * 44, v * 44, 44, 2406);
  const cell2 = valueNoise(u * 88, v * 88, 88, 2407);
  const stoneRidge = 1.0 - Math.abs(cell1 - 0.5) * 2.0;
  const stoneFacet = stoneRidge * 0.65 + cell2 * 0.35;

  let r = 46 + stoneFacet * 38 + (nLow - 0.5) * 16;
  let g = 48 + stoneFacet * 38 + (nLow - 0.5) * 16;
  let b = 52 + stoneFacet * 40 + (nLow - 0.5) * 16;

  // Brake dust rust tint near rail lines (u ~ 0.24, 0.76)
  const brakeDust = Math.exp(-Math.pow((Math.abs(u - 0.5) - 0.26) * 9.0, 2));
  r += brakeDust * 22;
  g += brakeDust * 8;

  // Oil drip darkening in center
  r *= (1 - centerOil * 0.62);
  g *= (1 - centerOil * 0.62);
  b *= (1 - centerOil * 0.62);

  const rough = 195 - centerOil * 110 + (nRock - 0.5) * 30;
  const ao = 110 + stoneFacet * 125;
  const h = 0.15 + stoneFacet * 0.52 + (nRock - 0.5) * 0.12;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (5) hero_subway_train_2k (1024x1024, non-alpha):
// Metallic transit car exterior/interior body atlas — brushed stainless/corrugated steel ribs,
// dark transit-blue & faded crimson paint stripe, panel rivets, soot/scorch weathering,
// window/door frame seams, and grime.
writePBRSet('hero_subway_train_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 2501);
  const nMid = fbm(u, v, 18, 4, 2502);
  const brush = fbm(u * 8.0, v * 0.5, 16, 3, 2503);
  const soot = Math.max(0, fbm(u, v, 8, 4, 2504) - 0.46) * 2.0;

  // Vertical panel seams every 0.25 in U
  const panelU = (u * 4) % 1;
  const isVertSeam = panelU < 0.014 || panelU > 0.986;
  const isHorizSeam = Math.abs(v - 0.22) < 0.008 || Math.abs(v - 0.52) < 0.008 || Math.abs(v - 0.82) < 0.008;

  if (isVertSeam || isHorizSeam) {
    return { r: 26, g: 28, b: 30, ao: 95, rough: 215, metal: 90, h: 0.14 };
  }

  // Rivets along panel edges
  const rivetDistU = Math.min(Math.abs(panelU - 0.035), Math.abs(panelU - 0.965));
  const rivetV = ((v * 32) % 1) - 0.5;
  const rivetR = Math.hypot(rivetDistU * 4.0, rivetV);
  const isRivet = rivetR < 0.16;

  let r, g, b, rough, metal, h = 0.60, ao = 235;

  if (v < 0.22 || (v > 0.82)) {
    // Corrugated stainless steel lower skirt & upper roof fluting (horizontal ribs)
    const rib = Math.sin(v * Math.PI * 64);
    r = 112 + rib * 18 + (brush - 0.5) * 20;
    g = 116 + rib * 18 + (brush - 0.5) * 20;
    b = 122 + rib * 20 + (brush - 0.5) * 22;
    metal = 215;
    rough = 78 + (nMid - 0.5) * 28;
    h = 0.55 + rib * 0.22;
    ao = 205 + rib * 35;
  } else if (v >= 0.22 && v < 0.38) {
    // Dark transit-blue painted livery band
    r = 34 + (nLow - 0.5) * 14;
    g = 58 + (nLow - 0.5) * 18;
    b = 96 + (nLow - 0.5) * 24;
    metal = 65;
    rough = 92 + (nMid - 0.5) * 30;
    h = 0.62 + (brush - 0.5) * 0.05;
  } else if (v >= 0.38 && v < 0.46) {
    // Faded crimson / dark transit red accent stripe (non-emissive, weathered & chipped)
    const chip = nMid > 0.74;
    if (chip) {
      r = 105; g = 110; b = 115; metal = 195; rough = 95; h = 0.54;
    } else {
      r = 124 + (nLow - 0.5) * 22;
      g = 32  + (nLow - 0.5) * 10;
      b = 30  + (nLow - 0.5) * 10;
      metal = 45;
      rough = 105 + (nMid - 0.5) * 28;
      h = 0.64;
    }
  } else {
    // Brushed aluminum/stainless steel upper carbody (v in 0.46..0.82) with dark rubber window gasket frame indentation
    const winU = (u * 4) % 1;
    const inWinFrame = (winU > 0.18 && winU < 0.82 && v > 0.56 && v < 0.77);
    const inWinBorder = inWinFrame && (winU < 0.22 || winU > 0.78 || v < 0.59 || v > 0.74);
    if (inWinBorder) {
      // Black rubber window gasket seal
      r = 28; g = 30; b = 32; metal = 0; rough = 185; h = 0.74; ao = 170;
    } else if (inWinFrame) {
      // Dark smoked/tinted armored transit window glass panel
      r = 24 + (nLow - 0.5) * 8;
      g = 34 + (nLow - 0.5) * 10;
      b = 38 + (nLow - 0.5) * 10;
      metal = 20;
      rough = 35 + soot * 60;
      h = 0.45;
      ao = 240;
    } else {
      r = 126 + (brush - 0.5) * 24 + (nLow - 0.5) * 16;
      g = 130 + (brush - 0.5) * 24 + (nLow - 0.5) * 16;
      b = 136 + (brush - 0.5) * 26 + (nLow - 0.5) * 16;
      metal = 215;
      rough = 72 + (brush - 0.5) * 25;
      h = 0.60 + (brush - 0.5) * 0.08;
    }
  }

  if (isRivet) {
    h += 0.18;
    ao = Math.min(ao, 185);
  }

  // Soot, brake dust & tunnel grime weathering
  r = r * (1 - soot * 0.55) + 32 * (soot * 0.55);
  g = g * (1 - soot * 0.55) + 30 * (soot * 0.55);
  b = b * (1 - soot * 0.55) + 28 * (soot * 0.55);
  rough = Math.min(238, rough + soot * 90);
  ao = Math.max(90, ao - soot * 55);

  return { r, g, b, ao, rough, metal, h };
});

// (6) subway_wet_concrete_2k (1024x1024, non-alpha):
// Damp subterranean concourse & tunnel concrete floor/wall with water seepage dark patches
// (low roughness 45..85 in wet patches so flashlights gleam!) and expansion joints.
writePBRSet('subway_wet_concrete_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const joint = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.012;

  const nLow = fbm(u, v, 6, 4, 2601);
  const nMid = fbm(u, v, 18, 4, 2602);
  const nHigh = fbm(u, v, 48, 3, 2603);
  const wetMask = fbm(u, v, 4, 4, 2604);

  if (joint) {
    return { r: 26, g: 28, b: 30, ao: 100, rough: 220, metal: 0, h: 0.16 };
  }

  // Porous dark concrete base
  let r = 86 + (nLow - 0.5) * 24 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 12;
  let g = 88 + (nLow - 0.5) * 24 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 12;
  let b = 90 + (nLow - 0.5) * 26 + (nMid - 0.5) * 16 + (nHigh - 0.5) * 12;

  // Water seepage dark patches (wet concrete is darker due to internal reflection and has low roughness 45..85)
  const isWet = wetMask > 0.51;
  const wetStrength = isWet ? Math.min(1.0, (wetMask - 0.51) * 4.2) : 0.0;

  r *= (1.0 - wetStrength * 0.38);
  g *= (1.0 - wetStrength * 0.37);
  b *= (1.0 - wetStrength * 0.35);

  const dryRough = 175 + (nMid - 0.5) * 35 + (nHigh - 0.5) * 20;
  const wetRough = 48 + (nMid - 0.5) * 28;
  const rough = dryRough * (1.0 - wetStrength) + wetRough * wetStrength;

  // Wet seepage fills micro-pores, making height slightly smoother in wet puddles
  const dryH = 0.55 + (nMid - 0.5) * 0.18 + (nHigh - 0.5) * 0.12;
  const h = dryH * (1.0 - wetStrength * 0.55) + 0.52 * (wetStrength * 0.55);
  const ao = 230 - wetStrength * 25 + (nMid - 0.5) * 25;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (7) decal_subway_graffiti (512x512, isAlpha: true for alphaMode: "MASK"):
// Gritty urban stencil graffiti & weathered underground transit warning numerals/arrows
// (0 emission, chipped paint, partially washed out by grime).
writePBRSet('decal_subway_graffiti', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 2701);
  const nHigh = fbm(u, v, 28, 3, 2702);
  const drip = fbm(u * 12.0, v * 1.5, 8, 3, 2703);

  // Stencil border frame + directional transit evacuation chevron arrow + block stencil bars
  const inOuterBox = (u > 0.10 && u < 0.90 && v > 0.14 && v < 0.86);
  const isFrame = inOuterBox && (u < 0.14 || u > 0.86 || v < 0.19 || v > 0.81);
  // Stencil bridge gaps in frame
  const isBridgeGap = Math.abs(u - 0.5) < 0.04 || Math.abs(v - 0.5) < 0.05;

  // Bold stencil chevron arrow in right half (u in 0.52..0.78, v in 0.28..0.72)
  const chevDist = Math.abs((u - 0.54) - (0.22 - Math.abs(v - 0.5) * 0.85));
  const inChevron = (u > 0.48 && u < 0.80 && Math.abs(v - 0.5) < 0.23 && chevDist < 0.055);

  // Bold stencil numeral / hazard bars in left half (u in 0.20..0.46)
  const inDigitBar1 = (u > 0.20 && u < 0.27 && v > 0.28 && v < 0.72);
  const inDigitBar2 = (u > 0.31 && u < 0.45 && (
    (v > 0.28 && v < 0.36) ||
    (v > 0.46 && v < 0.54) ||
    (v > 0.64 && v < 0.72) ||
    (u > 0.39 && v > 0.28 && v < 0.54) ||
    (u < 0.37 && v > 0.46 && v < 0.72)
  ));

  // Paint drips hanging below stencil shapes
  const inDrip = (u > 0.20 && u < 0.78 && v > 0.72 && v < 0.84 && drip > 0.72 && nHigh > 0.48);

  const inStencil = ((isFrame && !isBridgeGap) || inChevron || inDigitBar1 || inDigitBar2 || inDrip);

  // Heavy paint chipping & grime erosion so it blends naturally into concrete/brick walls
  const chipped = (nLow < 0.33) || (nLow < 0.46 && nHigh < 0.45);
  if (!inStencil || chipped) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Muted, weathered ochre-rust & faded slate stencil paint (ZERO neon, ZERO emission!)
  const grime = Math.max(0, nLow - 0.45) * 1.8;
  const isAccent = inChevron || inDigitBar1;
  let r, g, b;
  if (isAccent) {
    // Weathered muted rust-amber stencil paint
    r = 138 + (nHigh - 0.5) * 20 - grime * 52;
    g = 94  + (nHigh - 0.5) * 16 - grime * 38;
    b = 34  + (nHigh - 0.5) * 10 - grime * 16;
  } else {
    // Faded ash-grey stencil paint
    r = 124 + (nHigh - 0.5) * 20 - grime * 48;
    g = 126 + (nHigh - 0.5) * 20 - grime * 48;
    b = 120 + (nHigh - 0.5) * 18 - grime * 46;
  }

  const rough = 145 + grime * 65 + (nHigh - 0.5) * 25;
  return { r, g, b, a: 255, ao: 225 - grime * 45, rough, metal: 0, h: 0.58 - grime * 0.05 };
});

// (8) decal_blood_drag_tracks (512x512, isAlpha: true for alphaMode: "MASK"):
// Coagulated dark blood drag marks, bloody footprints, and broken dark-crimson emergency evacuation floor stripe
// (0 emission, low roughness 35..80 on blood spots so flashlight reflects off the blood!).
writePBRSet('decal_blood_drag_tracks', 512, true, (u, v) => {
  const dy = (v - 0.5) * 2.0; // [-1, 1]
  const ay = Math.abs(dy);

  const nLow = fbm(u * 2.0, v, 8, 4, 2801);
  const nMid = fbm(u * 3.0, v, 20, 4, 2802);
  const nHigh = fbm(u * 4.0, v, 44, 3, 2803);
  const spatter = fbm(u * 3.0, v, 32, 3, 2804);

  const endFade = Math.min(u * 7.0, (1.0 - u) * 7.0, 1.0);

  // Broken dark-crimson painted floor stripe in center (|dy| < 0.24)
  const inStripe = ay < 0.24 && u > 0.04 && u < 0.96;
  const stripeGap = ((u * 8) % 1) > 0.78;
  const paintPeel = stripeGap || (nLow < 0.38) || (ay > 0.17 && nMid < 0.54) || (nHigh < 0.26);
  const hasPaint = inStripe && !paintPeel;

  // Wavering body drag smear + twin boot heel drag streaks + bloody footprints
  const wave = (fbm(u, 0.5, 6, 3, 2805) - 0.5) * 0.35;
  const dragBody = Math.abs(dy - wave) < (0.20 + nLow * 0.24);
  const heel1 = Math.abs((dy - wave) - 0.22) < 0.075;
  const heel2 = Math.abs((dy - wave) + 0.22) < 0.075;

  // Bloody boot sole prints staggered along the drag trail
  const stepIdx = Math.floor(u * 6);
  const stepU = ((u * 6) % 1) - 0.5;
  const stepSide = (stepIdx % 2 === 0) ? 0.36 : -0.36;
  const stepV = (dy - wave) - stepSide;
  const inBootPrint = (Math.hypot(stepU * 1.4, stepV * 2.2) < 0.26) && (Math.abs(stepU) > 0.05 || nMid > 0.42);

  let bloodVal = 0.0;
  if (dragBody) bloodVal = Math.max(bloodVal, (nLow * 0.75 + nMid * 0.45) * endFade);
  if (heel1 || heel2) bloodVal = Math.max(bloodVal, (0.44 + nMid * 0.50) * endFade);
  if (inBootPrint) bloodVal = Math.max(bloodVal, (0.48 + nHigh * 0.42) * endFade);
  if (ay < 0.86 && spatter > 0.71 && nMid > 0.46) bloodVal = Math.max(bloodVal, 0.54 * endFade);

  const hasBlood = bloodVal > 0.43;

  if (!hasPaint && !hasBlood) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  if (hasBlood && (!hasPaint || bloodVal > 0.52)) {
    const coag = fbm(u * 2.5, v, 16, 3, 2806);
    const wetCore = bloodVal > 0.60;
    const r = wetCore ? (44 + coag * 26) : (64 + coag * 28 - nHigh * 12);
    const g = wetCore ? (5 + coag * 5) : (10 + coag * 8);
    const b = wetCore ? (5 + coag * 5) : (9 + coag * 8);
    // Low roughness 35..80 on coagulated blood spots so flashlight reflects realistically!
    const rough = wetCore ? (36 + coag * 20) : (54 + coag * 25);
    return { r, g, b, a: 255, ao: 195 + coag * 35, rough, metal: 0, h: 0.64 + coag * 0.16 };
  }

  // Non-emissive weathered dark-crimson evacuation floor stripe
  const grime = Math.max(0, nLow - 0.40) * 1.85;
  const r = 96 + (nMid - 0.5) * 20 - grime * 42;
  const g = 20 + (nMid - 0.5) * 8 - grime * 10;
  const b = 18 + (nMid - 0.5) * 8 - grime * 10;
  const rough = 138 + grime * 65 + (nHigh - 0.5) * 24;
  return { r, g, b, a: 255, ao: 220 - grime * 45, rough, metal: 0, h: 0.55 - grime * 0.05 };
});

// (9) decal_rust_water_leak (512x512, isAlpha: true for alphaMode: "MASK"):
// Rusty ceiling water drip puddle & mineral stain ring on the platform floor (rough: 22..55 for wet center).
writePBRSet('decal_rust_water_leak', 512, true, (u, v) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const dist = Math.hypot(dx * 0.92, dy * 1.08);

  const nLow = fbm(u, v, 6, 4, 2901);
  const nMid = fbm(u, v, 16, 4, 2902);
  const radialVal = (1.0 - dist) + (nLow - 0.5) * 0.52 + (nMid - 0.5) * 0.22;

  if (radialVal < 0.34) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Wet inner puddle (radialVal > 0.54) vs crusty mineral/rust ring around outer rim (0.34..0.54)
  const isWetCenter = radialVal > 0.54;
  const isMineralRing = radialVal >= 0.34 && radialVal <= 0.46;

  let r, g, b, rough, h, ao;
  if (isWetCenter) {
    // Dark rusty standing water puddle with mirror-like flashlight gleam (rough: 22..55)
    r = 46 + nMid * 26;
    g = 32 + nMid * 18;
    b = 22 + nMid * 14;
    rough = 24 + nLow * 28;
    h = 0.50;
    ao = 235;
  } else if (isMineralRing) {
    // Dried calcified mineral & rust scale rim
    r = 98 + (nMid - 0.5) * 24;
    g = 64 + (nMid - 0.5) * 18;
    b = 38 + (nMid - 0.5) * 14;
    rough = 145 + nMid * 55;
    h = 0.62 + nMid * 0.10;
    ao = 205;
  } else {
    // Damp rust-stained concrete transition zone
    r = 74 + (nMid - 0.5) * 22;
    g = 46 + (nMid - 0.5) * 16;
    b = 28 + (nMid - 0.5) * 12;
    rough = 52 + nMid * 35;
    h = 0.55 + nMid * 0.06;
    ao = 220;
  }

  return { r, g, b, a: 255, ao, rough, metal: 10, h };
});

// (10) decal_newspaper_trash (512x512, isAlpha: true for alphaMode: "MASK"):
// Scattered dirty newspapers, crushed transit tickets, and torn poster scraps on the floor.
writePBRSet('decal_newspaper_trash', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 3001);
  const nHigh = fbm(u, v, 28, 3, 3002);

  // Sheet 1: Tilted broadsheet newspaper page
  const u1 = (u - 0.30) * 0.94 + (v - 0.36) * 0.34;
  const v1 = -(u - 0.30) * 0.34 + (v - 0.36) * 0.94;
  const inNews1 = Math.abs(u1) < 0.17 && Math.abs(v1) < 0.22 && (nLow > 0.18 || Math.abs(u1) < 0.14);

  // Sheet 2: Torn transit map / poster scrap
  const u2 = (u - 0.68) * 0.86 - (v - 0.58) * 0.50;
  const v2 = (u - 0.68) * 0.50 + (v - 0.58) * 0.86;
  const inPoster = Math.abs(u2) < 0.16 && Math.abs(v2) < 0.19 && (nLow > 0.24 || Math.abs(v2) < 0.14);

  // Small scattered magnetic stripe metro tickets
  const u3 = (u - 0.32) * 0.80 - (v - 0.78) * 0.60;
  const v3 = (u - 0.32) * 0.60 + (v - 0.78) * 0.80;
  const inTicket1 = Math.abs(u3) < 0.065 && Math.abs(v3) < 0.035;

  const u4 = (u - 0.74) * 0.92 + (v - 0.22) * 0.39;
  const v4 = -(u - 0.74) * 0.39 + (v - 0.22) * 0.92;
  const inTicket2 = Math.abs(u4) < 0.065 && Math.abs(v4) < 0.035;

  const grime = nLow * 52 + nHigh * 18;

  if (inNews1) {
    // Newspaper headline band, photo box, and newsprint columns
    const isHeadline = v1 < -0.13 && v1 > -0.18 && Math.abs(u1) < 0.14;
    const isPhoto = u1 > -0.13 && u1 < -0.01 && v1 > -0.10 && v1 < 0.05;
    const isTextCol = !isPhoto && ((Math.abs(v1 * 56) % 1) < 0.32) && ((Math.abs(u1 * 18) % 1) > 0.14);
    let c = 156 - grime;
    if (isHeadline) c = 42;
    else if (isPhoto) c = 62 + (nHigh - 0.5) * 28;
    else if (isTextCol) c = 68;
    return {
      r: c,
      g: c - 4,
      b: c - 12,
      a: 255,
      ao: 222 - nLow * 35,
      rough: 182 + nHigh * 35,
      metal: 0,
      h: 0.62 + (nLow - 0.5) * 0.14
    };
  }

  if (inPoster) {
    // Torn transit route poster scrap (muted slate-blue header + dirty paper body)
    const isHeader = v2 < -0.08;
    const r = (isHeader ? 48 : 142) - grime * 0.75;
    const g = (isHeader ? 72 : 138) - grime * 0.75;
    const b = (isHeader ? 96 : 128) - grime * 0.75;
    return {
      r, g, b,
      a: 255,
      ao: 225 - nLow * 35,
      rough: 165 + nHigh * 40,
      metal: 0,
      h: 0.64 + (nLow - 0.5) * 0.15
    };
  }

  if (inTicket1 || inTicket2) {
    // Crushed metro fare card with dark magnetic stripe along the center
    const tv = inTicket1 ? v3 : v4;
    const isMagStripe = Math.abs(tv) < 0.009;
    const r = isMagStripe ? 28 : (138 - grime * 0.6);
    const g = isMagStripe ? 26 : (120 - grime * 0.6);
    const b = isMagStripe ? 26 : (68  - grime * 0.5);
    return {
      r, g, b,
      a: 255,
      ao: 230,
      rough: isMagStripe ? 65 : 145,
      metal: isMagStripe ? 40 : 0,
      h: 0.60
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
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map6_Metro_Taktik_Istasyonu_3v3v3v3_v3 PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, industrial_light_lens, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K subway PBR textures (0 emission, flashlight-reactive normal & roughness):
  subway_terrazzo_platform_2k, subway_tactile_paving_1k, subway_ceramic_wall_2k, subway_ballast_track_2k,
  hero_subway_train_2k, subway_wet_concrete_2k, decal_subway_graffiti, decal_blood_drag_tracks,
  decal_rust_water_leak, decal_newspaper_trash.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
