#!/usr/bin/env node
/**
 * build_warehouse_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map7_Depo_3v3v3v3_v3.gltf inside asset model/haritalar/Map7_Depo_v3/textures/
 *
 * CRITICAL ART DIRECTION (HOSPITAL V3, SUBWAY V3 & EMBASSY V3 LESSONS):
 * - ZERO glowing/neon floor lines or crosses!
 * - All floor decals, forklift safety stripes, blood trails, epoxy floor markings, and stencils MUST be
 *   non-emissive (0 emission) PBR materials that stay dark in the shadows and gleam realistically
 *   under the player's flashlight via Normal Map and Roughness contrast.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map7_Depo_v3');
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
  const resPath = `res://asset model/haritalar/Map7_Depo_v3/textures/${fileName}`;
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

// 2. Procedurally Generate Custom Warehouse v3 High-Res PBR Texture Sets
// (1) warehouse_epoxy_concrete_2k (1024x1024, RGB):
// Industrial polished slate-grey/teal epoxy warehouse floor slab (4x4 expansion joint grid),
// semi-gloss epoxy coating (rough: 42..85) interrupted by rough chipped concrete craters (rough: 185..230),
// rubber forklift tire skid marks, and oil stains.
writePBRSet('warehouse_epoxy_concrete_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const tx = Math.floor(u * 4);
  const ty = Math.floor(v * 4);

  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isJoint = border < 0.015;
  const isJointBevel = border >= 0.015 && border < 0.032;

  const nLow = fbm(u, v, 4, 4, 7101);
  const nMid = fbm(u, v, 14, 4, 7102);
  const nHigh = fbm(u, v, 40, 3, 7103);

  if (isJoint) {
    // Elastomeric dark expansion joint sealant groove
    return { r: 22, g: 24, b: 26, ao: 85, rough: 195, metal: 0, h: 0.14 };
  }

  // Chipped concrete craters where heavy pallets/forklifts peeled away the epoxy resin coat
  const craterField = fbm(u * 1.5, v * 1.5, 6, 4, 7104) + (border < 0.08 ? 0.12 : 0.0);
  const isChippedCrater = craterField > 0.67;
  const isCraterRim = !isChippedCrater && craterField > 0.635;

  if (isChippedCrater) {
    // Raw porous grey cement substrate beneath peeled epoxy (rough: 185..230)
    const cNoise = (nMid - 0.5) * 20 + (nHigh - 0.5) * 16;
    const rough = Math.max(185, Math.min(230, 206 + (nHigh - 0.5) * 36));
    return {
      r: 72 + cNoise,
      g: 74 + cNoise,
      b: 76 + cNoise,
      ao: 145,
      rough,
      metal: 0,
      h: 0.34 + (nHigh - 0.5) * 0.10
    };
  }

  // Polished industrial slate-grey/teal epoxy base coat
  const slabSeed = (hash2(tx, ty, 7105) - 0.5) * 10;
  let r = 56 + slabSeed + (nLow - 0.5) * 14 + (nMid - 0.5) * 8;
  let g = 68 + slabSeed + (nLow - 0.5) * 14 + (nMid - 0.5) * 8;
  let b = 74 + slabSeed + (nLow - 0.5) * 16 + (nMid - 0.5) * 8;

  // Semi-gloss epoxy coating (rough: 42..85)
  let rough = 58 + (nLow - 0.5) * 24 + (nMid - 0.5) * 16;
  rough = Math.max(42, Math.min(85, rough));
  let h = 0.72 + (nMid - 0.5) * 0.03;
  let ao = 238;

  if (isCraterRim) {
    // Flaking epoxy edge around concrete spall crater
    h += 0.06;
    rough = 125;
    r += 10; g += 10; b += 10;
  }

  // Curved & diagonal rubber forklift tire skid marks across the floor slabs
  const skidWarp = (nLow - 0.5) * 0.08;
  const skid1 = Math.abs((u * 0.75 + v * 0.65 + skidWarp) % 0.45 - 0.22);
  const skid2 = Math.abs((u * 0.35 - v * 0.85 + skidWarp) % 0.52 - 0.26);
  const treadPattern = Math.sin((u * 48 + v * 48) * Math.PI) * 0.5 + 0.5;
  const onSkid = ((skid1 < 0.022 || Math.abs(skid1 - 0.055) < 0.022) && nMid > 0.38) ||
                 ((skid2 < 0.018 || Math.abs(skid2 - 0.050) < 0.018) && nMid > 0.44);

  if (onSkid) {
    const skidIntensity = (0.55 + treadPattern * 0.45) * 0.65;
    r = r * (1 - skidIntensity) + 22 * skidIntensity;
    g = g * (1 - skidIntensity) + 23 * skidIntensity;
    b = b * (1 - skidIntensity) + 25 * skidIntensity;
    rough = Math.min(165, rough + 68 * skidIntensity);
    h -= 0.02 * skidIntensity;
  }

  // Dark iridescent hydraulic oil stains
  const oilField = fbm(u, v, 5, 3, 7106);
  if (oilField > 0.68) {
    const oilStrength = Math.min(1.0, (oilField - 0.68) * 6.0);
    r *= (1 - oilStrength * 0.52);
    g *= (1 - oilStrength * 0.50);
    b *= (1 - oilStrength * 0.45);
    rough = Math.max(28, rough * (1 - oilStrength * 0.45));
  }

  if (isJointBevel) {
    const slope = (border - 0.015) / 0.017;
    h = 0.24 + slope * 0.48;
    ao = Math.round(135 + slope * 100);
  }

  return { r, g, b, ao, rough, metal: 0, h };
});

// (2) warehouse_loading_asphalt_2k (1024x1024, RGB):
// Weathered loading dock & truck yard tarmac asphalt with aggregate texture, tar crack repair seams,
// damp oil/rain puddles (rough: 35..75), and gravel dust.
writePBRSet('warehouse_loading_asphalt_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 7201);
  const nMid = fbm(u, v, 18, 4, 7202);
  const nHigh = fbm(u, v, 56, 3, 7203);
  const pebble = valueNoise(u * 110, v * 110, 110, 7204);

  // Domain-warped tar crack repair seams (glossy black hot-poured bitumen over Stress fractures)
  const warpX = (nLow - 0.5) * 0.16;
  const warpY = (nMid - 0.5) * 0.16;
  const seamA = Math.abs(fbm(u + warpX, v + warpY, 6, 3, 7205) - 0.50);
  const seamB = Math.abs(fbm(u - warpY, v + warpX, 8, 3, 7206) - 0.49);
  const isTarSeam = (seamA < 0.014 && nLow > 0.36) || (seamB < 0.011 && nMid > 0.40);

  if (isTarSeam) {
    // Smooth dark bitumen overband crack sealer
    return {
      r: 22 + (nHigh - 0.5) * 6,
      g: 23 + (nHigh - 0.5) * 6,
      b: 26 + (nHigh - 0.5) * 6,
      ao: 215,
      rough: 46 + (nMid - 0.5) * 18,
      metal: 0,
      h: 0.62 + (nMid - 0.5) * 0.04
    };
  }

  // Coarse tarmac asphalt aggregate base
  const aggContrast = (pebble - 0.5) * 26 + (nHigh - 0.5) * 18;
  let r = 52 + (nLow - 0.5) * 14 + aggContrast;
  let g = 54 + (nLow - 0.5) * 14 + aggContrast;
  let b = 58 + (nLow - 0.5) * 15 + aggContrast;

  // Gravel dust & loading yard tire dirt accumulation
  const dustMask = Math.max(0, fbm(u, v, 7, 4, 7207) - 0.52) * 2.2;
  r = r * (1 - dustMask * 0.42) + 84 * (dustMask * 0.42);
  g = g * (1 - dustMask * 0.42) + 78 * (dustMask * 0.42);
  b = b * (1 - dustMask * 0.42) + 68 * (dustMask * 0.42);

  let rough = 158 + (1.0 - pebble) * 32 + dustMask * 35;
  let h = 0.38 + pebble * 0.26 + (nMid - 0.5) * 0.10;
  let ao = Math.round(145 + pebble * 85);

  // Damp rain / diesel oil puddles in low tarmac depressions (rough: 35..75)
  const puddleField = fbm(u, v, 4, 4, 7208) - dustMask * 0.25;
  if (puddleField > 0.55) {
    const wetness = Math.min(1.0, (puddleField - 0.55) * 5.0);
    // Standing water/oil flattens micro-aggregate relief and darkens porous asphalt
    r *= (1.0 - wetness * 0.38);
    g *= (1.0 - wetness * 0.36);
    b *= (1.0 - wetness * 0.32);
    const puddleRough = 38 + (nMid - 0.5) * 24 + (1.0 - wetness) * 25;
    rough = Math.max(35, Math.min(75, puddleRough));
    h = h * (1.0 - wetness * 0.78) + 0.56 * (wetness * 0.78);
    ao = Math.round(ao * (1.0 - wetness) + 240 * wetness);
  }

  return { r, g, b, ao, rough, metal: 0, h };
});

// (3) warehouse_corrugated_cladding_2k (1024x1024, RGB):
// Heavy industrial warehouse wall cladding — lower reinforced concrete impact plinth (v < 0.30)
// with faded yellow/black hazard bumper band, upper ribbed dark-charcoal/navy trapezoidal corrugated
// steel siding (v >= 0.30), bolt rows, rust streaks, and dent normal relief.
writePBRSet('warehouse_corrugated_cladding_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7301);
  const nMid = fbm(u, v, 18, 4, 7302);
  const nHigh = fbm(u, v, 48, 3, 7303);

  // Lower reinforced concrete impact plinth (v < 0.30)
  if (v < 0.30) {
    // Faded yellow/black diagonal hazard bumper band along top of concrete plinth (v in 0.23..0.29)
    if (v >= 0.23 && v < 0.29) {
      const wear = fbm(u * 3.0, v * 3.0, 12, 4, 7304);
      const chevron = ((u * 16.0 + (v - 0.23) * 18.0) % 1 + 1) % 1;
      const isYellowStripe = chevron < 0.52;
      const chippedConcrete = wear > 0.64;

      if (chippedConcrete) {
        // Scuffed off paint revealing grey concrete underneath
        return {
          r: 78 + (nHigh - 0.5) * 18,
          g: 76 + (nHigh - 0.5) * 18,
          b: 72 + (nHigh - 0.5) * 16,
          ao: 175,
          rough: 205,
          metal: 0,
          h: 0.58 + (nHigh - 0.5) * 0.08
        };
      }
      // Muted, oil-scuffed hazard ochre-yellow & charcoal-black (0 emission!)
      const grime = Math.max(0, (wear - 0.35) * 1.4);
      const r = (isYellowStripe ? 138 : 28) * (1 - grime * 0.45) + 42 * (grime * 0.45);
      const g = (isYellowStripe ? 106 : 28) * (1 - grime * 0.45) + 40 * (grime * 0.45);
      const b = (isYellowStripe ? 34  : 30) * (1 - grime * 0.45) + 38 * (grime * 0.45);
      return {
        r, g, b,
        ao: 215,
        rough: 145 + grime * 55,
        metal: 0,
        h: 0.68 + (nMid - 0.5) * 0.05
      };
    }

    // Steel drip sill / transition ledge at v in 0.29..0.30
    if (v >= 0.29) {
      return { r: 34, g: 36, b: 40, ao: 110, rough: 155, metal: 160, h: 0.82 };
    }

    // Heavy poured concrete plinth wall (v < 0.23) with vertical formwork seams & forklift scrape gouges
    const formSeam = Math.min((u * 4) % 1, 1 - ((u * 4) % 1));
    const isSeam = formSeam < 0.012;
    const cNoise = (nLow - 0.5) * 18 + (nMid - 0.5) * 14 + (nHigh - 0.5) * 12;
    const damp = Math.max(0, (0.14 - v) / 0.14);
    const r = (76 + cNoise) * (1 - damp * 0.28);
    const g = (75 + cNoise) * (1 - damp * 0.28);
    const b = (72 + cNoise) * (1 - damp * 0.26);
    return {
      r: isSeam ? r * 0.65 : r,
      g: isSeam ? g * 0.65 : g,
      b: isSeam ? b * 0.65 : b,
      ao: isSeam ? 115 : Math.round(210 - damp * 40),
      rough: Math.round(195 - damp * 30 + (nHigh - 0.5) * 20),
      metal: 0,
      h: isSeam ? 0.42 : (0.64 + (nMid - 0.5) * 0.08)
    };
  }

  // Upper ribbed dark-charcoal/navy trapezoidal corrugated steel siding (v >= 0.30)
  const ribs = 16.0;
  const ribPhase = (u * ribs) % 1;
  // Trapezoidal box-rib wave profile: flat crest (0.15..0.45), angled web (0.45..0.55), flat valley (0.55..0.95), angled web (0.95..0.15)
  let trapProfile;
  if (ribPhase < 0.12) {
    trapProfile = 0.5 + (ribPhase / 0.12) * 0.5;
  } else if (ribPhase < 0.42) {
    trapProfile = 1.0;
  } else if (ribPhase < 0.54) {
    trapProfile = 1.0 - ((ribPhase - 0.42) / 0.12);
  } else if (ribPhase < 0.88) {
    trapProfile = 0.0;
  } else {
    trapProfile = ((ribPhase - 0.88) / 0.12) * 0.5;
  }

  // Impact dents warping the corrugated ribs
  const dentDist1 = Math.hypot((u - 0.33) * 2.2, (v - 0.52) * 2.8);
  const dentDist2 = Math.hypot((u - 0.74) * 2.4, (v - 0.68) * 2.4);
  const dentDeflect = (dentDist1 < 0.22 ? Math.cos(dentDist1 / 0.22 * Math.PI * 0.5) * 0.26 : 0) +
                      (dentDist2 < 0.18 ? Math.cos(dentDist2 / 0.18 * Math.PI * 0.5) * 0.22 : 0);

  // Horizontal panel lap joints & hex bolt rows at v = 0.34, 0.64, 0.94
  const boltRowDist = Math.min(Math.abs(v - 0.34), Math.abs(v - 0.64), Math.abs(v - 0.94));
  const isLapSeam = Math.abs(v - 0.625) < 0.005;
  const inValleyCenter = Math.abs(ribPhase - 0.71) < 0.09;
  const boltRad = Math.hypot((ribPhase - 0.71) * 1.4, boltRowDist * ribs * 0.9);
  const isHexBolt = inValleyCenter && boltRad < 0.11;

  if (isLapSeam) {
    return { r: 18, g: 22, b: 28, ao: 80, rough: 175, metal: 140, h: 0.18 };
  }

  // Dark charcoal / industrial slate-navy painted steel cladding
  let r = 38 + trapProfile * 12 + (nLow - 0.5) * 10;
  let g = 46 + trapProfile * 14 + (nLow - 0.5) * 10;
  let b = 58 + trapProfile * 16 + (nLow - 0.5) * 12;
  let rough = 92 + (1.0 - trapProfile) * 28 + (nMid - 0.5) * 22;
  let metal = 175;
  let h = 0.32 + trapProfile * 0.46 - dentDeflect + (nHigh - 0.5) * 0.03;
  let ao = Math.round(135 + trapProfile * 105 - dentDeflect * 120);

  if (isHexBolt) {
    r = 78; g = 82; b = 88;
    rough = 72;
    metal = 215;
    h += 0.16;
    ao = boltRad > 0.075 ? 110 : 230;
  }

  // Vertical rust streaks bleeding down from bolt rows and panel seams
  const rustStreak = Math.max(0, fbm(u * 6.0, v * 1.2, 8, 4, 7305) - 0.53) * 2.5 +
                     (inValleyCenter && v < 0.64 && v > 0.44 ? 0.25 : 0.0);
  if (rustStreak > 0.32) {
    const rs = Math.min(1.0, (rustStreak - 0.32) * 2.2);
    r = r * (1 - rs) + (98 + (nHigh - 0.5) * 24) * rs;
    g = g * (1 - rs) + (52 + (nHigh - 0.5) * 16) * rs;
    b = b * (1 - rs) + (30 + (nHigh - 0.5) * 10) * rs;
    rough = rough * (1 - rs) + 210 * rs;
    metal = metal * (1 - rs * 0.85);
    h -= rs * 0.03;
  }

  return { r, g, b, ao, rough, metal, h };
});

// (4) warehouse_rack_steel_1k (512x512, RGB):
// Heavy pallet rack structural steel — industrial chipped safety-orange & dark blue powder-coated
// steel beams, teardrop punch-hole slots in normal/AO map, scratched bare metal edges (metal: 195, rough: 65..135).
writePBRSet('warehouse_rack_steel_1k', 512, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7401);
  const nMid = fbm(u, v, 18, 4, 7402);
  const nHigh = fbm(u, v, 44, 3, 7403);

  // Atlas split: vertical upright columns in dark industrial blue with double rows of teardrop punch-hole slots (u < 0.5),
  // horizontal load beams in chipped safety-orange powder coat with step ledges (u >= 0.5).
  const isUprightBlue = u < 0.50;
  const localU = isUprightBlue ? (u * 2.0) : ((u - 0.50) * 2.0);

  // Structural flange edges where forks scrape off paint exposing bright bare steel
  const edgeDist = Math.min(localU, 1.0 - localU, (v * 4) % 1, 1.0 - ((v * 4) % 1));
  const scratchMask = fbm(u * 4.0, v * 4.0, 12, 3, 7404);
  const isBareSteelEdge = (edgeDist < 0.055 && scratchMask > 0.38) || (scratchMask > 0.74);

  // Teardrop punch-hole slots along upright columns (2 columns of slots)
  if (isUprightBlue) {
    const slotColX = Math.min(Math.abs(localU - 0.30), Math.abs(localU - 0.70));
    const slotRowY = ((v * 16.0) % 1);
    // Teardrop shape: wider circular top (slotRowY ~ 0.35), narrower slot bottom (slotRowY ~ 0.65)
    const inSlotY = slotRowY > 0.24 && slotRowY < 0.76;
    const slotHalfWidth = slotRowY < 0.46 ? 0.075 : 0.042;
    const isTeardropHole = inSlotY && (slotColX < slotHalfWidth);
    const isHoleBevel = inSlotY && !isTeardropHole && (slotColX < slotHalfWidth + 0.025);

    if (isTeardropHole) {
      // Deep dark punched cavity in the C-channel upright
      return { r: 12, g: 14, b: 18, ao: 45, rough: 185, metal: 110, h: 0.08 };
    }
    if (isHoleBevel) {
      return { r: 115, g: 122, b: 130, ao: 140, rough: 72, metal: 215, h: 0.42 };
    }
  }

  if (isBareSteelEdge) {
    // Scratched bare structural steel edges catching flashlight glints (metal: 195..225, rough: 65..88)
    const s = (nHigh - 0.5) * 22;
    return {
      r: 124 + s,
      g: 128 + s,
      b: 136 + s,
      ao: 225,
      rough: Math.max(65, Math.min(95, 74 + (nMid - 0.5) * 20)),
      metal: 210,
      h: 0.76 + (nHigh - 0.5) * 0.05
    };
  }

  // Powder-coated industrial steel (chipped safety-orange load beams vs dark slate-blue uprights)
  let r, g, b;
  if (isUprightBlue) {
    r = 32 + (nLow - 0.5) * 10 + (nMid - 0.5) * 8;
    g = 54 + (nLow - 0.5) * 12 + (nMid - 0.5) * 8;
    b = 86 + (nLow - 0.5) * 16 + (nMid - 0.5) * 10;
  } else {
    // Muted weathered safety-orange powder coat (0 emission, night tactical palette)
    r = 152 + (nLow - 0.5) * 22 + (nMid - 0.5) * 14;
    g = 72  + (nLow - 0.5) * 14 + (nMid - 0.5) * 10;
    b = 26  + (nLow - 0.5) * 8  + (nMid - 0.5) * 6;
  }

  // Grease & warehouse soot darkening
  const grime = Math.max(0, fbm(u, v, 8, 4, 7405) - 0.50) * 1.8;
  r = r * (1 - grime * 0.45) + 28 * (grime * 0.45);
  g = g * (1 - grime * 0.45) + 28 * (grime * 0.45);
  b = b * (1 - grime * 0.45) + 30 * (grime * 0.45);

  // Horizontal beam step ribs
  const beamRib = !isUprightBlue && (Math.abs(((v * 4) % 1) - 0.18) < 0.035 || Math.abs(((v * 4) % 1) - 0.82) < 0.035);
  const rough = Math.max(65, Math.min(135, 88 + grime * 42 + (nHigh - 0.5) * 18));
  const h = (beamRib ? 0.78 : 0.62) + (nMid - 0.5) * 0.04;
  const ao = beamRib ? 185 : Math.round(230 - grime * 45);

  return { r, g, b, ao, rough, metal: 195, h };
});

// (5) warehouse_cardboard_shrinkwrap_2k (1024x1024, RGB):
// Stacked corrugated cardboard shipping boxes, shipping barcode labels, strapping bands,
// and glossy wrinkled plastic shrink-wrap foil over wooden pallet bases
// (rough: 30..75 on shrink-wrap plastic bands so flashlights catch crinkly specular highlights!).
writePBRSet('warehouse_cardboard_shrinkwrap_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7501);
  const nMid = fbm(u, v, 18, 4, 7502);
  const nHigh = fbm(u, v, 48, 3, 7503);

  // Lower band (v < 0.16): Heavy wooden Euro-pallet base slats & stringer blocks
  if (v < 0.16) {
    const slatGap = ((u * 6) % 1) < 0.08 || (v > 0.055 && v < 0.095 && ((u * 3) % 1) > 0.24 && ((u * 3) % 1) < 0.88);
    if (slatGap) {
      return { r: 16, g: 14, b: 12, ao: 65, rough: 225, metal: 0, h: 0.12 };
    }
    const woodGrain = fbm(u * 14.0, v * 2.0, 10, 4, 7504);
    return {
      r: 86 + (woodGrain - 0.5) * 28 + (nHigh - 0.5) * 12,
      g: 66 + (woodGrain - 0.5) * 22 + (nHigh - 0.5) * 10,
      b: 44 + (woodGrain - 0.5) * 16 + (nHigh - 0.5) * 8,
      ao: 195,
      rough: 190 + (nHigh - 0.5) * 25,
      metal: 0,
      h: 0.48 + (woodGrain - 0.5) * 0.12
    };
  }

  // Stacked corrugated cardboard carton grid (3x3 cartons in v >= 0.16)
  const boxCols = 3;
  const boxRows = 3;
  const bv = (v - 0.16) / 0.84;
  const colIdx = Math.floor(u * boxCols);
  const rowIdx = Math.floor(bv * boxRows);
  const bu = ((u * boxCols + (rowIdx % 2) * 0.35) % 1);
  const bvy = (bv * boxRows) % 1;

  const boxBorder = Math.min(bu, 1.0 - bu, bvy, 1.0 - bvy);
  const isBoxGap = boxBorder < 0.018;
  const isPackingTape = (Math.abs(bvy - 0.50) < 0.045) || (bvy > 0.92 || bvy < 0.08);

  // Polypropylene tension strapping bands running vertically across the pallet load
  const isStrappingBand = Math.abs(u - 0.24) < 0.012 || Math.abs(u - 0.76) < 0.012;
  if (isStrappingBand) {
    const weave = Math.sin(v * Math.PI * 240.0) * 0.5 + 0.5;
    return {
      r: 28 + weave * 10,
      g: 32 + weave * 12,
      b: 36 + weave * 14,
      ao: 220,
      rough: 68 + weave * 25,
      metal: 20,
      h: 0.86 + weave * 0.04
    };
  }

  // Base kraft corrugated cardboard appearance
  const boxSeed = hash2(colIdx, rowIdx, 7505);
  const flute = Math.sin(v * Math.PI * 160.0) * 0.5 + 0.5;
  let r = 116 + (boxSeed - 0.5) * 22 + (nLow - 0.5) * 16 + (flute - 0.5) * 6;
  let g = 92  + (boxSeed - 0.5) * 18 + (nLow - 0.5) * 14 + (flute - 0.5) * 5;
  let b = 64  + (boxSeed - 0.5) * 14 + (nLow - 0.5) * 10 + (flute - 0.5) * 4;
  let rough = 182 + (nHigh - 0.5) * 24;
  let metal = 0;
  let h = isBoxGap ? 0.24 : (0.56 + (flute - 0.5) * 0.03);
  let ao = isBoxGap ? 95 : 225;

  if (isBoxGap) {
    r *= 0.35; g *= 0.35; b *= 0.35;
  } else if (isPackingTape) {
    // Tan acrylic parcel sealing tape
    r = 126 + (nMid - 0.5) * 12;
    g = 98  + (nMid - 0.5) * 10;
    b = 62  + (nMid - 0.5) * 8;
    rough = 58 + (nHigh - 0.5) * 16;
    h += 0.03;
  }

  // White thermal shipping barcode label sticker on each carton face
  const inLabel = bu > 0.58 && bu < 0.84 && bvy > 0.56 && bvy < 0.84;
  if (inLabel && !isBoxGap) {
    const lu = (bu - 0.58) / 0.26;
    const lv = (bvy - 0.56) / 0.28;
    const isBarcodeZone = lv > 0.45 && lv < 0.85 && lu > 0.10 && lu < 0.90;
    const barBit = hash2(Math.floor(lu * 38), rowIdx * 7 + colIdx, 7506) > 0.46;
    const isHeaderLine = (lv > 0.15 && lv < 0.26 && lu > 0.10 && lu < 0.65);

    if ((isBarcodeZone && barBit) || isHeaderLine) {
      r = 32; g = 32; b = 34;
    } else {
      // Muted off-white thermal paper label (darkened for tactical night value)
      r = 156 - nLow * 20;
      g = 152 - nLow * 20;
      b = 144 - nLow * 18;
    }
    rough = 135;
    h = 0.60;
  }

  // Glossy wrinkled clear plastic shrink-wrap foil stretched across the middle & upper pallet bands (v in 0.28..0.86)
  const inShrinkWrapZone = (v > 0.28 && v < 0.86) || (fbm(u, v, 6, 3, 7507) > 0.48 && v >= 0.18);
  if (inShrinkWrapZone) {
    // Diagonal tension wrinkles and crinkles in the stretch film
    const diag1 = Math.sin((u * 12.0 + v * 18.0 + (nLow - 0.5) * 1.6) * Math.PI * 2.0);
    const diag2 = Math.sin((u * 16.0 - v * 22.0 + (nMid - 0.5) * 1.4) * Math.PI * 2.0);
    const wrinkleRidge = Math.pow(Math.max(0, (diag1 * 0.5 + diag2 * 0.5) * 0.5 + 0.5), 2.2);

    // Multi-layered taut polyethylene foil slightly cools and brightens the underlying cardboard along wrinkle creases
    const filmOpacity = 0.16 + wrinkleRidge * 0.28;
    r = r * (1 - filmOpacity) + 138 * filmOpacity;
    g = g * (1 - filmOpacity) + 144 * filmOpacity;
    b = b * (1 - filmOpacity) + 150 * filmOpacity;

    // Low roughness (30..75) on shrink-wrap plastic bands so flashlights catch crinkly specular highlights!
    rough = Math.max(30, Math.min(75, 36 + (1.0 - wrinkleRidge) * 28 + (nHigh - 0.5) * 14));
    metal = 18;
    // Wrinkle relief bridges over cardboard box seams and creates sharp normal-map ridges
    h = Math.max(h, 0.64) + wrinkleRidge * 0.22 + (nMid - 0.5) * 0.06;
    ao = Math.round(215 + wrinkleRidge * 35);
  }

  return { r, g, b, ao, rough, metal, h };
});

// (6) hero_forklift_machinery_2k (1024x1024, RGB):
// Heavy industrial forklift, overhead gantry crane & conveyor machinery atlas — weathered industrial
// ochre-yellow & dark-iron armor plates, diamond-tread steel step plates, hydraulic grease grime,
// chipped paint, and panel rivets (metal: 155..220, rough: 55..125).
writePBRSet('hero_forklift_machinery_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7601);
  const nMid = fbm(u, v, 18, 4, 7602);
  const nHigh = fbm(u, v, 48, 3, 7603);

  // Panel division grid (4x4 industrial armor & machinery housing plates)
  const pu = (u * 4) % 1;
  const pv = (v * 4) % 1;
  const pBorder = Math.min(pu, 1.0 - pu, pv, 1.0 - pv);
  const isPanelSeam = pBorder < 0.016;

  if (isPanelSeam) {
    return { r: 16, g: 18, b: 20, ao: 70, rough: 120, metal: 155, h: 0.14 };
  }

  // Lower band (v < 0.28): Heavy cast dark-iron counterweight & diamond-tread steel step plates
  if (v < 0.28) {
    const isDiamondPlate = u > 0.45;
    if (isDiamondPlate) {
      // Raised alternating 45-degree diamond lug pattern
      const dx = (u * 48) % 1;
      const dy = (v * 48) % 1;
      const cellAlt = ((Math.floor(u * 48) + Math.floor(v * 48)) % 2) === 0;
      const lx = dx - 0.5;
      const ly = dy - 0.5;
      const rotA = (lx + ly) * 0.707;
      const rotB = (lx - ly) * 0.707;
      const lugDist = cellAlt
        ? Math.hypot(rotA / 0.34, rotB / 0.13)
        : Math.hypot(rotB / 0.34, rotA / 0.13);
      const onLug = lugDist < 1.0;

      const c = onLug ? (92 + (nHigh - 0.5) * 18) : (52 + (nMid - 0.5) * 14);
      return {
        r: c, g: c + 2, b: c + 6,
        ao: onLug ? 235 : 155,
        rough: onLug ? 62 : 108,
        metal: onLug ? 215 : 175,
        h: onLug ? (0.78 + (1.0 - lugDist) * 0.14) : 0.46
      };
    }

    // Cast dark-iron counterweight & mast carriage with hydraulic grease grime
    const c = 44 + (nLow - 0.5) * 14 + (nHigh - 0.5) * 12;
    return {
      r: c, g: c + 2, b: c + 4,
      ao: 205,
      rough: Math.max(55, Math.min(125, 88 + (nHigh - 0.5) * 28)),
      metal: 185,
      h: 0.56 + (nMid - 0.5) * 0.08 + (nHigh - 0.5) * 0.06
    };
  }

  // Perimeter rivets around each armor plate
  const rGridU = (pu * 10) % 1;
  const rGridV = (pv * 10) % 1;
  const inRivetBand = pBorder > 0.035 && pBorder < 0.085;
  const rivetDist = Math.hypot(rGridU - 0.5, rGridV - 0.5);
  const isRivet = inRivetBand && rivetDist < 0.24;

  // Louvered radiator engine cooling vents on mid-right panel (u in 0.52..0.73, v in 0.32..0.48)
  const inVentZone = u > 0.54 && u < 0.71 && v > 0.34 && v < 0.46;
  if (inVentZone) {
    const slotY = (v * 64) % 1;
    const isSlotOpen = slotY < 0.42;
    return {
      r: isSlotOpen ? 14 : 68,
      g: isSlotOpen ? 15 : 54,
      b: isSlotOpen ? 16 : 24,
      ao: isSlotOpen ? 55 : 195,
      rough: isSlotOpen ? 125 : 78,
      metal: 175,
      h: isSlotOpen ? 0.16 : (0.50 + slotY * 0.35)
    };
  }

  // Weathered industrial ochre-yellow machinery paint vs chipped bare steel & dark-iron housing bands
  const isDarkIronBand = (v > 0.50 && v < 0.62);
  const chipField = fbm(u * 2.5, v * 2.5, 10, 4, 7604) + (pBorder < 0.06 ? 0.18 : 0.0);
  const isChippedSteel = chipField > 0.68;

  let r, g, b, rough, metal, h = 0.64;
  if (isChippedSteel || isRivet) {
    // Exposed brushed raw steel under chipped paint or raised rivet dome
    r = 108 + (nHigh - 0.5) * 20;
    g = 112 + (nHigh - 0.5) * 20;
    b = 118 + (nHigh - 0.5) * 22;
    rough = 62 + (nMid - 0.5) * 16;
    metal = 215;
    h = isRivet ? (0.82 + (0.24 - rivetDist) * 0.45) : 0.54;
  } else if (isDarkIronBand) {
    r = 46 + (nLow - 0.5) * 12;
    g = 48 + (nLow - 0.5) * 12;
    b = 52 + (nLow - 0.5) * 14;
    rough = 84 + (nMid - 0.5) * 22;
    metal = 190;
  } else {
    // Heavy industrial caterpillar ochre-yellow (darkened for tactical night balance)
    r = 148 + (nLow - 0.5) * 20 + (nMid - 0.5) * 12;
    g = 104 + (nLow - 0.5) * 16 + (nMid - 0.5) * 10;
    b = 28  + (nLow - 0.5) * 8  + (nMid - 0.5) * 6;
    rough = 74 + (nMid - 0.5) * 24;
    metal = 165;
  }

  // Hydraulic grease grime & exhaust soot streaks around mast joints and panel seams
  const grease = Math.max(0, fbm(u * 2.0, v, 8, 4, 7605) - 0.51) * 2.2 + (pBorder < 0.07 ? 0.25 : 0.0);
  if (grease > 0.25) {
    const gr = Math.min(1.0, (grease - 0.25) * 1.6);
    r = r * (1 - gr * 0.72) + 22 * (gr * 0.72);
    g = g * (1 - gr * 0.72) + 20 * (gr * 0.72);
    b = b * (1 - gr * 0.72) + 18 * (gr * 0.72);
    // Oily hydraulic grease stays slick (low-to-mid roughness 55..110)
    rough = rough * (1 - gr * 0.4) + 58 * (gr * 0.4);
  }

  rough = Math.max(55, Math.min(125, rough));
  metal = Math.max(155, Math.min(220, metal));
  const ao = isRivet ? 185 : Math.round(230 - (pBorder < 0.05 ? 45 : 0));

  return { r, g, b, ao, rough, metal, h };
});

// (7) hero_semitruck_trailer_2k (1024x1024, RGB):
// Semi-truck cab & ribbed aluminum cargo trailer atlas — dirty anodized silver-grey & dark slate
// vertical ribs, locking bar hardware seams, mud-splattered lower panels, and weathered reflective
// DOT tape strips (0 emission, low roughness).
writePBRSet('hero_semitruck_trailer_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7701);
  const nMid = fbm(u, v, 18, 4, 7702);
  const nHigh = fbm(u, v, 44, 3, 7703);

  // Weathered reflective red/white DOT conspicuity tape strip along lower trailer rail (v in 0.20..0.235)
  // ZERO emission — uses micro-prismatic normal diamond relief & low roughness (28..48) to gleam under flashlight!
  if (v >= 0.20 && v < 0.235) {
    const seg = (u * 12) % 1;
    const isRedSeg = seg < 0.58;
    const microDiamond = ((Math.floor(u * 180) + Math.floor(v * 180)) % 2) * 0.08;
    const grime = Math.max(0, fbm(u * 4.0, v * 4.0, 10, 3, 7704) - 0.45) * 1.8;

    let r = isRedSeg ? 136 : 154;
    let g = isRedSeg ? 28  : 152;
    let b = isRedSeg ? 28  : 148;
    r = r * (1 - grime * 0.55) + 46 * (grime * 0.55);
    g = g * (1 - grime * 0.55) + 42 * (grime * 0.55);
    b = b * (1 - grime * 0.55) + 36 * (grime * 0.55);

    return {
      r, g, b,
      ao: 225,
      rough: Math.max(26, Math.min(95, 32 + grime * 55)),
      metal: 140,
      h: 0.76 + microDiamond
    };
  }

  // Vertical stainless-steel cargo door locking bars & cam-latch hinges at u = 0.22, 0.48, 0.52, 0.78
  const lockBarDist = Math.min(
    Math.abs(u - 0.22),
    Math.abs(u - 0.48),
    Math.abs(u - 0.52),
    Math.abs(u - 0.78)
  );
  const isDoorCenterSeam = Math.abs(u - 0.50) < 0.006;
  if (isDoorCenterSeam) {
    // Rubber weatherseal gasket between rear trailer swing doors
    return { r: 18, g: 20, b: 22, ao: 75, rough: 195, metal: 0, h: 0.14 };
  }

  if (lockBarDist < 0.011 && v > 0.14 && v < 0.94) {
    // Cylindrical galvanized steel locking rod + brackets every 0.22 in V
    const cylProfile = Math.sqrt(Math.max(0, 1.0 - Math.pow(lockBarDist / 0.011, 2)));
    const isBracket = Math.abs(((v * 5) % 1) - 0.5) < 0.08;
    return {
      r: 118 + cylProfile * 24 + (nHigh - 0.5) * 12,
      g: 122 + cylProfile * 24 + (nHigh - 0.5) * 12,
      b: 128 + cylProfile * 24 + (nHigh - 0.5) * 12,
      ao: isBracket ? 165 : 225,
      rough: 52 + (nMid - 0.5) * 18,
      metal: 220,
      h: 0.72 + cylProfile * 0.22 + (isBracket ? 0.06 : 0.0)
    };
  }

  // Ribbed anodized aluminum cargo trailer & dark slate cab body panels
  const isDarkSlateCabZone = v < 0.20 || v > 0.88;
  const ribWave = Math.sin(u * Math.PI * 56.0) * 0.5 + 0.5;
  const isRibCrest = ribWave > 0.62;
  const panelHorizSeam = Math.abs(v - 0.56) < 0.005 || Math.abs(v - 0.88) < 0.005;

  if (panelHorizSeam) {
    return { r: 24, g: 26, b: 30, ao: 95, rough: 165, metal: 120, h: 0.22 };
  }

  let r, g, b, rough, metal;
  if (isDarkSlateCabZone) {
    // Dark slate-charcoal cab chassis & roof rail trim
    r = 44 + (nLow - 0.5) * 12 + (nMid - 0.5) * 8;
    g = 48 + (nLow - 0.5) * 12 + (nMid - 0.5) * 8;
    b = 56 + (nLow - 0.5) * 14 + (nMid - 0.5) * 8;
    rough = 68 + (nMid - 0.5) * 20;
    metal = 185;
  } else {
    // Dirty anodized silver-grey vertical ribbed aluminum trailer skin
    const baseAlum = 104 + (isRibCrest ? 16 : -8) + (nLow - 0.5) * 18 + (nMid - 0.5) * 12;
    r = baseAlum;
    g = baseAlum + 3;
    b = baseAlum + 7;
    rough = 64 + (1.0 - ribWave) * 26 + (nHigh - 0.5) * 16;
    metal = 205;
  }

  let h = 0.44 + ribWave * 0.26 + (nHigh - 0.5) * 0.03;
  let ao = Math.round(165 + ribWave * 75);

  // Heavy highway mud & road grime splattered across lower trailer & cab skirt panels (v < 0.38)
  const mudFactor = Math.max(0, (0.38 - v) / 0.38);
  const mudNoise = mudFactor * fbm(u * 3.0, v * 3.0, 10, 4, 7705);
  if (mudNoise > 0.24) {
    const m = Math.min(1.0, (mudNoise - 0.24) * 3.2);
    r = r * (1 - m) + (68 + (nHigh - 0.5) * 16) * m;
    g = g * (1 - m) + (56 + (nHigh - 0.5) * 14) * m;
    b = b * (1 - m) + (42 + (nHigh - 0.5) * 12) * m;
    rough = rough * (1 - m) + 205 * m;
    metal = metal * (1 - m);
    h += m * 0.06;
    ao = Math.round(ao * (1 - m * 0.3));
  }

  return { r, g, b, ao, rough, metal, h };
});

// (8) decal_forklift_lane_stripes (512x512, RGBA for alphaMode: "MASK"):
// Worn, tire-scuffed industrial safety-ochre/black chevron floor lane stripes and stenciled bay numbers
// (0 emission! Heavily worn by rubber tire tracks and oil smudges).
writePBRSet('decal_forklift_lane_stripes', 512, true, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 7801);
  const nMid = fbm(u, v, 18, 4, 7802);
  const nHigh = fbm(u, v, 48, 3, 7803);

  // Layout: Top & bottom parallel forklift lane border hazard bands (v in 0.08..0.24 and 0.76..0.92),
  // plus central stenciled warehouse bay block marking ("07" / chevron frame) in v in 0.34..0.66
  const inTopBand = v >= 0.08 && v <= 0.24 && u >= 0.04 && u <= 0.96;
  const inBotBand = v >= 0.76 && v <= 0.92 && u >= 0.04 && u <= 0.96;

  // Stenciled "07" bay digits in the center lane
  const cu = u - 0.50;
  const cv = v - 0.50;
  // Digit '0' on left (cu in -0.20..-0.04, cv in -0.14..0.14) with stencil bridge gaps
  const inZeroOuter = cu > -0.20 && cu < -0.04 && cv > -0.14 && cv < 0.14;
  const inZeroInner = cu > -0.15 && cu < -0.09 && cv > -0.09 && cv < 0.09;
  const isStencilGap = Math.abs(cv) < 0.015;
  const inDigitZero = inZeroOuter && !inZeroInner && !isStencilGap;

  // Digit '7' on right (cu in 0.04..0.20, cv in -0.14..0.14)
  const inSevenTop = cu > 0.04 && cu < 0.20 && cv > -0.14 && cv < -0.085 && Math.abs(cu - 0.12) > 0.012;
  const diagSeven = cu - (0.17 - (cv + 0.085) * 0.45);
  const inSevenStem = cv >= -0.085 && cv < 0.14 && Math.abs(diagSeven) < 0.028 && !isStencilGap;
  const inDigitSeven = inSevenTop || inSevenStem;

  // Dashed guide lines flanking the central stencil
  const inDashLine = Math.abs(cv) < 0.032 && Math.abs(cu) > 0.26 && Math.abs(cu) < 0.44 && (((u * 12) % 1) < 0.65);

  const inPaintMask = inTopBand || inBotBand || inDigitZero || inDigitSeven || inDashLine;
  if (!inPaintMask) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Heavy peeling & flaking paint abrasion from years of pallet jacks and forklift traffic
  const peelNoise = fbm(u * 2.5, v * 2.5, 10, 4, 7804);
  if (peelNoise > 0.72) {
    // Completely scraped off paint revealing underlying floor via alpha mask
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // 45-degree safety-ochre & charcoal-black chevrons on top/bottom bands; solid safety-ochre on central stencil
  const chevPhase = ((u * 8.0 + (inTopBand ? v : -v) * 8.0) % 1 + 1) % 1;
  const isOchre = (inTopBand || inBotBand) ? (chevPhase < 0.55) : true;

  // Muted, non-emissive industrial epoxy traffic paint (0 emission!)
  let r = isOchre ? (142 + (nLow - 0.5) * 18) : (28 + (nLow - 0.5) * 8);
  let g = isOchre ? (104 + (nLow - 0.5) * 16) : (29 + (nLow - 0.5) * 8);
  let b = isOchre ? (28  + (nLow - 0.5) * 8)  : (32 + (nLow - 0.5) * 8);
  let rough = 92 + (nMid - 0.5) * 28;
  let h = 0.66 + (nHigh - 0.5) * 0.06;

  // Diagonal rubber forklift tire track scuffs & oil smudges over the painted stripes
  const tireTrack1 = Math.abs((u - v * 0.65) - 0.18);
  const tireTrack2 = Math.abs((u + v * 0.55) - 0.82);
  const tireLug = Math.sin((u * 38 + v * 38) * Math.PI * 2.0) * 0.5 + 0.5;
  const onTireScuff = (tireTrack1 < 0.095 || tireTrack2 < 0.085) && (tireLug > 0.30) && (nMid > 0.34);
  const oilSmudge = fbm(u, v, 6, 3, 7805) > 0.61;

  if (onTireScuff || oilSmudge) {
    const darkFactor = onTireScuff ? 0.68 : 0.55;
    r = r * (1 - darkFactor) + 22 * darkFactor;
    g = g * (1 - darkFactor) + 22 * darkFactor;
    b = b * (1 - darkFactor) + 24 * darkFactor;
    rough = oilSmudge ? 48 : 175;
    h -= 0.04;
  }

  return { r, g, b, a: 255, ao: 225, rough, metal: 0, h };
});

// (9) decal_blood_hydraulic_spill (512x512, RGBA for alphaMode: "MASK"):
// Dark coagulated blood mixed with black-crimson hydraulic fluid spill & bloody boot/forklift tire tracks
// (0 emission, low roughness 25..65 so it gleams wet under the player's flashlight).
writePBRSet('decal_blood_hydraulic_spill', 512, true, (u, v) => {
  const nLow = fbm(u, v, 5, 4, 7901);
  const nMid = fbm(u, v, 16, 4, 7902);
  const nHigh = fbm(u, v, 44, 3, 7903);

  // Main central pool + secondary splatter droplets + trailing forklift tire / combat boot tracks
  const dx1 = (u - 0.44) * 1.15;
  const dy1 = (v - 0.48) * 1.05;
  const distMain = Math.hypot(dx1, dy1) - (nLow - 0.5) * 0.24 - (nMid - 0.5) * 0.11;
  const inMainPool = distMain < 0.28;

  const dx2 = (u - 0.68) * 1.35;
  const dy2 = (v - 0.34) * 1.25;
  const distSub = Math.hypot(dx2, dy2) - (nLow - 0.5) * 0.16 - (nMid - 0.5) * 0.08;
  const inSubPool = distSub < 0.16;

  // Forklift chevron tire track & bloody boot prints rolling out of the spill toward bottom-right
  const trackLine = Math.abs((u - 0.44) * 0.72 - (v - 0.48) * 0.69);
  const alongTrack = (u - 0.44) * 0.69 + (v - 0.48) * 0.72;
  const chevronLug = Math.sin((alongTrack * 28.0 + Math.abs(trackLine) * 18.0) * Math.PI * 2.0);
  const inTireTrack = alongTrack > 0.10 && alongTrack < 0.52 && trackLine < 0.085 && chevronLug > 0.15 && nMid > 0.36;

  // Bloody tactical boot sole print near top-left edge of pool
  const bu = (u - 0.22) * 0.82 + (v - 0.26) * 0.57;
  const bv = -(u - 0.22) * 0.57 + (v - 0.26) * 0.82;
  const inBootPrint = ((Math.hypot(bu * 1.3, (bv - 0.055) * 1.6) < 0.085) ||
                       (Math.hypot(bu * 1.5, (bv + 0.065) * 1.9) < 0.065)) &&
                      (((Math.abs(bu * 56) % 1) > 0.25) && ((Math.abs(bv * 44) % 1) > 0.25));

  if (!inMainPool && !inSubPool && !inTireTrack && !inBootPrint) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Swirled fluid composition: dark arterial crimson coagulated blood mixed with black-crimson hydraulic oil
  const swirl = fbm(u + nLow * 0.15, v - nLow * 0.15, 8, 4, 7904);
  const isHydraulicRich = swirl > 0.52;

  let r, g, b, rough, metal, h;
  if (inTireTrack || inBootPrint) {
    // Tacky smeared blood & hydraulic grease track
    r = 46 + (nHigh - 0.5) * 12;
    g = 8  + (nHigh - 0.5) * 4;
    b = 9  + (nHigh - 0.5) * 4;
    rough = Math.max(25, Math.min(65, 48 + (nMid - 0.5) * 18));
    metal = 15;
    h = 0.58 + (nHigh - 0.5) * 0.05;
  } else {
    // Wet viscous pool with surface meniscus ridge at the outer rim
    const edgeRim = inMainPool ? Math.max(0, 1.0 - (0.28 - distMain) / 0.045) : 0.0;
    if (isHydraulicRich) {
      // Deep black-crimson synthetic hydraulic fluid swirl
      r = 32 + (nMid - 0.5) * 10;
      g = 10 + (nMid - 0.5) * 4;
      b = 14 + (nMid - 0.5) * 6;
      rough = 26 + (nHigh - 0.5) * 10;
      metal = 38;
    } else {
      // Rich dark coagulated venous blood (0 emission!)
      r = 68 + (nMid - 0.5) * 16;
      g = 8  + (nMid - 0.5) * 4;
      b = 10 + (nMid - 0.5) * 4;
      rough = 32 + (nLow - 0.5) * 16;
      metal = 20;
    }
    rough = Math.max(25, Math.min(65, rough));
    h = 0.62 + edgeRim * 0.14 + (swirl - 0.5) * 0.06;
  }

  return { r, g, b, a: 255, ao: 220, rough, metal, h };
});

// (10) decal_packing_debris_labels (512x512, RGBA for alphaMode: "MASK"):
// Scattered torn cardboard flaps, white shipping manifest sheets, broken wooden pallet splinters,
// and plastic strapping tape on the floor (0 emission).
writePBRSet('decal_packing_debris_labels', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 8001);
  const nMid = fbm(u, v, 20, 4, 8002);
  const nHigh = fbm(u, v, 48, 3, 8003);

  // 1) Torn corrugated cardboard box flap (tilted at center-left)
  const u1 = (u - 0.33) * 0.88 + (v - 0.44) * 0.47;
  const v1 = -(u - 0.33) * 0.47 + (v - 0.44) * 0.88;
  const tearEdge = 0.21 + (nLow - 0.5) * 0.08 + (nMid - 0.5) * 0.04;
  const inCardboardFlap = Math.abs(u1) < 0.18 && v1 > -0.22 && v1 < tearEdge;

  // 2) Scattered white shipping manifest / waybill sheet with barcode & black freight blocks (lower-right)
  const u2 = (u - 0.67) * 0.91 - (v - 0.60) * 0.41;
  const v2 = (u - 0.67) * 0.41 + (v - 0.60) * 0.91;
  const inManifestSheet = Math.abs(u2) < 0.15 && Math.abs(v2) < 0.19;

  // 3) Broken raw pine wooden pallet splinters scattered diagonally (top-right & bottom-left)
  const u3 = (u - 0.62) * 0.76 + (v - 0.24) * 0.65;
  const v3 = -(u - 0.62) * 0.65 + (v - 0.24) * 0.76;
  const jag3 = (nMid - 0.5) * 0.06;
  const inSplinter1 = Math.abs(u3) < (0.22 - Math.abs(v3) * 1.4 + jag3) && Math.abs(v3) < 0.042;

  const u4 = (u - 0.28) * 0.64 - (v - 0.78) * 0.77;
  const v4 = (u - 0.28) * 0.77 + (v - 0.78) * 0.64;
  const inSplinter2 = Math.abs(u4) < (0.18 - Math.abs(v4) * 1.3 + jag3) && Math.abs(v4) < 0.035;

  // 4) Discarded blue/black polypropylene plastic strapping tape ribbon snaking across the debris
  const strapWave = Math.sin(u * Math.PI * 2.5 + 0.4) * 0.14;
  const inStrapTape = u > 0.12 && u < 0.88 && Math.abs((v - 0.50) - strapWave) < 0.016;

  if (inStrapTape) {
    // Embossed diamond-textured polypropylene strapping band (low-mid roughness so it catches flashlight)
    const emboss = ((Math.floor(u * 160) + Math.floor(v * 160)) % 2) * 12;
    return {
      r: 26 + emboss,
      g: 34 + emboss,
      b: 44 + emboss,
      a: 255,
      ao: 225,
      rough: 56 + (nHigh - 0.5) * 18,
      metal: 20,
      h: 0.78 + emboss * 0.004
    };
  }

  const grime = nLow * 34 + nHigh * 14;

  if (inManifestSheet) {
    // White shipping manifest sheet with freight barcode, black routing header, and boot dust
    const isHeader = v2 < -0.11 && Math.abs(u2) < 0.12;
    const isBarcode = v2 > 0.06 && v2 < 0.14 && Math.abs(u2) < 0.11 && (hash2(Math.floor((u2 + 0.2) * 120), 3, 8004) > 0.45);
    const isTableGrid = Math.abs(u2) < 0.12 && (((Math.abs(v2 * 36) % 1) < 0.22) || Math.abs(u2) > 0.112);

    let r = 154 - grime;
    let g = 150 - grime;
    let b = 142 - grime;
    if (isHeader || isBarcode) {
      r = 28; g = 30; b = 32;
    } else if (isTableGrid) {
      r = 74; g = 74; b = 72;
    }
    return {
      r, g, b,
      a: 255,
      ao: 225 - nLow * 30,
      rough: 168 + nHigh * 28,
      metal: 0,
      h: 0.64 + (nMid - 0.5) * 0.08
    };
  }

  if (inCardboardFlap) {
    // Torn corrugated kraft cardboard flap with exposed inner wavy fluting along the torn edge
    const isExposedFluting = (tearEdge - v1) < 0.045;
    const fluteWave = Math.sin(u1 * Math.PI * 110.0) * 0.5 + 0.5;
    let r = 114 - grime * 0.7 + (isExposedFluting ? (fluteWave - 0.5) * 26 : 0);
    let g = 88  - grime * 0.6 + (isExposedFluting ? (fluteWave - 0.5) * 20 : 0);
    let b = 58  - grime * 0.5 + (isExposedFluting ? (fluteWave - 0.5) * 14 : 0);

    // Partial red fragile/handling icon stamp on flap
    const inStamp = Math.abs(u1 + 0.04) < 0.055 && Math.abs(v1 + 0.04) < 0.055 &&
                    (Math.abs(u1 + 0.04) > 0.042 || Math.abs(v1 + 0.04) > 0.042);
    if (inStamp) {
      r = 112; g = 30; b = 26;
    }

    return {
      r, g, b,
      a: 255,
      ao: isExposedFluting ? Math.round(145 + fluteWave * 75) : 220,
      rough: 185 + nHigh * 25,
      metal: 0,
      h: isExposedFluting ? (0.48 + fluteWave * 0.16) : (0.62 + (nLow - 0.5) * 0.06)
    };
  }

  if (inSplinter1 || inSplinter2) {
    // Broken raw pine pallet wood splinter with sharp fibrous grain normal relief
    const grain = fbm(u * 24.0, v * 24.0, 12, 3, 8005);
    return {
      r: 122 + (grain - 0.5) * 32 - grime * 0.4,
      g: 96  + (grain - 0.5) * 26 - grime * 0.4,
      b: 62  + (grain - 0.5) * 18 - grime * 0.3,
      a: 255,
      ao: 205,
      rough: 192 + (nHigh - 0.5) * 24,
      metal: 0,
      h: 0.68 + (grain - 0.5) * 0.16
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
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map7_Depo_3v3v3v3_v3 PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, industrial_light_lens, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K warehouse PBR textures (0 emission, flashlight-reactive normal & roughness):
  warehouse_epoxy_concrete_2k, warehouse_loading_asphalt_2k, warehouse_corrugated_cladding_2k,
  warehouse_rack_steel_1k, warehouse_cardboard_shrinkwrap_2k, hero_forklift_machinery_2k,
  hero_semitruck_trailer_2k, decal_forklift_lane_stripes, decal_blood_hydraulic_spill,
  decal_packing_debris_labels.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
