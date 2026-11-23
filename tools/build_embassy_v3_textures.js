#!/usr/bin/env node
/**
 * build_embassy_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map1_Elcilik_Baskini_3v3v3v3_v3.gltf inside asset model/haritalar/Map1_Elcilik_v3/textures/
 *
 * CRITICAL ART DIRECTION (HOSPITAL V3 & SUBWAY V3 LESSONS):
 * - ZERO glowing/neon floor lines or crosses!
 * - All floor decals, carpets, blood trails, marble patterns, and tactical markings MUST be
 *   non-emissive (0 emission) PBR materials that stay dark in the shadows and gleam realistically
 *   under the player's flashlight via Normal Map and Roughness contrast.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map1_Elcilik_v3');
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
  const resPath = `res://asset model/haritalar/Map1_Elcilik_v3/textures/${fileName}`;
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
  'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png',
  'decal_leaf_litter_Diffuse.png', 'decal_leaf_litter_nor_gl.png', 'decal_leaf_litter_arm.png',
  'grass_forest_fern_Diffuse.png', 'grass_forest_fern_nor_gl.png', 'grass_forest_fern_arm.png'
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

// 2. Procedurally Generate Custom Embassy v3 High-Res PBR Texture Sets
// (1) embassy_checker_marble_2k (1024x1024, RGB):
// Grand Ballroom checkerboard marble floor (4x4 diamond/square alternating dark charcoal-nero marble
// with subtle gold/white veins and warm smoked-ivory travertine marble tiles), recessed brass/dark grout lines,
// polished low-roughness (38..75) specular reflections mingled with dusty scuff marks and blast cracks.
writePBRSet('embassy_checker_marble_2k', 1024, false, (u, v) => {
  const gx = (u * 4) % 1;
  const gy = (v * 4) % 1;
  const tx = Math.floor(u * 4);
  const ty = Math.floor(v * 4);
  const isNero = ((tx + ty) % 2) === 0;

  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isDarkGrout = border < 0.014;
  const isBrassInlay = border >= 0.014 && border < 0.026;
  const isBevel = border >= 0.026 && border < 0.045;

  const nLow = fbm(u, v, 4, 4, 4101);
  const nMid = fbm(u, v, 14, 4, 4102);
  const nHigh = fbm(u, v, 36, 3, 4103);

  // Scuff / battle dust overlay + blast stress fracture lines
  const scuff = Math.max(0, fbm(u * 1.4, v * 1.4, 8, 4, 4104) - 0.54) * 2.1;
  const crackWarp = fbm(u, v, 10, 3, 4105);
  const crackField = Math.abs(fbm(u + crackWarp * 0.12, v - crackWarp * 0.12, 8, 3, 4106) - 0.50);
  const isBlastCrack = crackField < 0.008 && nLow > 0.44;

  if (isDarkGrout) {
    return { r: 24, g: 22, b: 20, ao: 95, rough: 215, metal: 0, h: 0.14 };
  }
  if (isBrassInlay) {
    // Recessed tarnished brass border strip between marble slabs
    const tarnish = (nMid - 0.5) * 24;
    return {
      r: 128 + tarnish - scuff * 35,
      g: 102 + tarnish * 0.8 - scuff * 30,
      b: 48 + tarnish * 0.4 - scuff * 15,
      ao: 185,
      rough: Math.min(180, 56 + scuff * 70 + (nHigh - 0.5) * 18),
      metal: 215,
      h: 0.42
    };
  }
  if (isBlastCrack) {
    return { r: 28, g: 26, b: 25, ao: 85, rough: 225, metal: 0, h: 0.18 };
  }

  // Marble directional veining with domain warping
  const tileSeed = hash2(tx, ty, 4107);
  const warpU = u + (nLow - 0.5) * 0.22 + tileSeed * 0.37;
  const warpV = v + (nMid - 0.5) * 0.22 - tileSeed * 0.29;
  const vein1 = Math.pow(Math.max(0, 1.0 - Math.abs(Math.sin((warpU * 2.5 + warpV * 1.8) * Math.PI * 3.0)) * 3.2), 2.4);
  const vein2 = Math.pow(Math.max(0, 1.0 - Math.abs(Math.cos((warpU * 1.4 - warpV * 2.6) * Math.PI * 5.0)) * 4.0), 2.8);

  let r, g, b;
  if (isNero) {
    // Dark charcoal-nero Marquina/Portoro marble with subtle warm gold & pale calcite veins
    r = 34 + (nLow - 0.5) * 12 + vein1 * 76 + vein2 * 52;
    g = 36 + (nLow - 0.5) * 12 + vein1 * 62 + vein2 * 48;
    b = 40 + (nLow - 0.5) * 14 + vein1 * 32 + vein2 * 44;
  } else {
    // Warm smoked-ivory travertine marble (darkened for night tactical ambience, avg <= 0.36 linear)
    r = 128 + (nLow - 0.5) * 20 - vein1 * 34 + vein2 * 16;
    g = 120 + (nLow - 0.5) * 18 - vein1 * 32 + vein2 * 14;
    b = 106 + (nLow - 0.5) * 16 - vein1 * 28 + vein2 * 12;
  }

  // Apply dusty boot scuffing & cordite soot
  r = r * (1 - scuff * 0.40) + 52 * (scuff * 0.40);
  g = g * (1 - scuff * 0.40) + 48 * (scuff * 0.40);
  b = b * (1 - scuff * 0.40) + 44 * (scuff * 0.40);

  // Polished low-roughness (38..75) specular floor mingled with dusty scuff marks
  let rough = 44 + (nMid - 0.5) * 16 + vein1 * 12 + scuff * 95;
  rough = Math.max(38, Math.min(210, rough));

  const bevelDrop = isBevel ? ((0.045 - border) / 0.019) * 0.20 : 0.0;
  const h = 0.72 - bevelDrop - vein1 * 0.04 + (nHigh - 0.5) * 0.03 - scuff * 0.05;
  const ao = (isBevel ? 190 : 242) - scuff * 40;

  return { r, g, b, ao, rough, metal: isNero && vein1 > 0.45 ? 45 : 0, h };
});

// (2) embassy_herringbone_parquet_2k (1024x1024, RGB):
// Rich dark walnut & mahogany herringbone wood parquet floor for the Diplomatic Library, Consul Suite & Art Gallery wings,
// with individual plank bevels, wood grain normal detail, and satin varnish roughness (55..95).
writePBRSet('embassy_herringbone_parquet_2k', 1024, false, (u, v) => {
  // 45-degree rotated herringbone coordinates (period = 8 zig-zag columns)
  const scale = 8.0;
  const rx = (u + v) * scale;
  const ry = (u - v + 2.0) * scale;

  // Classic herringbone step grid: plank aspect ratio 4:1
  const stepId = Math.floor(rx + Math.floor(ry));
  const isHorizPlank = (stepId % 2) === 0;

  let plankIdA, plankIdB, localAlong, localAcross;
  if (isHorizPlank) {
    // Plank oriented along rx (length 2, width 0.5 in scaled space -> use 1x4 grid)
    plankIdA = Math.floor(ry * 2.0);
    plankIdB = Math.floor((rx - plankIdA * 0.5) * 0.5);
    localAcross = (ry * 2.0) % 1;
    localAlong = ((rx - plankIdA * 0.5) * 0.5) % 1;
  } else {
    plankIdA = Math.floor(rx * 2.0);
    plankIdB = Math.floor((ry - plankIdA * 0.5) * 0.5);
    localAcross = (rx * 2.0) % 1;
    localAlong = ((ry - plankIdA * 0.5) * 0.5) % 1;
  }
  if (localAcross < 0) localAcross += 1;
  if (localAlong < 0) localAlong += 1;

  const edgeAcross = Math.min(localAcross, 1 - localAcross);
  const edgeAlong = Math.min(localAlong, 1 - localAlong) * 4.0;
  const border = Math.min(edgeAcross, edgeAlong);
  const isSeam = border < 0.045;
  const isBevel = border >= 0.045 && border < 0.11;

  const plankSeed = hash2(plankIdA & 255, (plankIdB & 255) + (isHorizPlank ? 100 : 0), 4201);
  const nLow = fbm(u, v, 6, 4, 4202);
  const dust = Math.max(0, fbm(u, v, 8, 4, 4203) - 0.55) * 1.9;

  if (isSeam) {
    return { r: 22, g: 16, b: 12, ao: 95, rough: 215, metal: 0, h: 0.18 };
  }

  // Anisotropic wood grain running along the plank direction
  const grainU = isHorizPlank ? (u + v) : (u - v + 1.0);
  const grainV = isHorizPlank ? (u - v + 1.0) : (u + v);
  const fiber = fbm((grainU + plankSeed) * 2.0, (grainV + plankSeed) * 18.0, 8, 4, 4204);
  const finePore = fbm((grainU + plankSeed) * 4.0, (grainV + plankSeed) * 36.0, 16, 3, 4205);

  // Alternate rich dark walnut & deep reddish-brown mahogany planks
  const isMahogany = plankSeed > 0.48;
  const toneShift = (plankSeed - 0.5) * 18;
  let r, g, b;
  if (isMahogany) {
    r = 86 + toneShift + (fiber - 0.5) * 26 + (finePore - 0.5) * 12;
    g = 46 + toneShift * 0.6 + (fiber - 0.5) * 16 + (finePore - 0.5) * 8;
    b = 30 + toneShift * 0.4 + (fiber - 0.5) * 12 + (finePore - 0.5) * 6;
  } else {
    // Deep aged walnut
    r = 72 + toneShift + (fiber - 0.5) * 24 + (finePore - 0.5) * 10;
    g = 50 + toneShift * 0.7 + (fiber - 0.5) * 18 + (finePore - 0.5) * 8;
    b = 34 + toneShift * 0.5 + (fiber - 0.5) * 12 + (finePore - 0.5) * 6;
  }

  // Subtle dark scuff/soot wear
  r = r * (1 - dust * 0.35) + 38 * (dust * 0.35);
  g = g * (1 - dust * 0.35) + 34 * (dust * 0.35);
  b = b * (1 - dust * 0.35) + 30 * (dust * 0.35);

  // Satin varnish roughness (55..95) with slight increase in open wood pores & dust
  let rough = 66 + (1.0 - fiber) * 22 + (finePore - 0.5) * 14 + dust * 65;
  rough = Math.max(55, Math.min(185, rough));

  const bevelDrop = isBevel ? ((0.11 - border) / 0.065) * 0.22 : 0.0;
  const h = 0.68 - bevelDrop + (fiber - 0.5) * 0.08 + (finePore - 0.5) * 0.06;
  const ao = (isBevel ? 175 : 238) - (1.0 - fiber) * 18 - dust * 35;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (3) embassy_courtyard_cobble_2k (1024x1024, RGB):
// European fan/arc-patterned granite cobblestone paving for the North Fountain Plaza & South VIP Limousine Driveway,
// with damp moss/mud in the deep stone joints and wet specular stone tops (rough: 50..110).
writePBRSet('embassy_courtyard_cobble_2k', 1024, false, (u, v) => {
  // Repeating 2x2 European bogenpflaster (overlapping circular fan arcs of granite sets)
  const fanCols = 2;
  const fanRows = 2;
  const fu = (u * fanCols) % 1;
  const fv = (v * fanRows) % 1;
  const fanRowIdx = Math.floor(v * fanRows);
  const stagU = (u * fanCols + (fanRowIdx % 2) * 0.5) % 1;

  // Evaluate nearest fan center among candidate staggered arc centers
  let bestR = 999;
  let bestAngle = 0;
  let bestCenterId = 0;
  const candidates = [
    [0.5, 0.0, 1],
    [0.0, 0.5, 2],
    [1.0, 0.5, 3],
    [0.5, 1.0, 4],
    [0.0, -0.5, 5],
    [1.0, -0.5, 6]
  ];
  for (let i = 0; i < candidates.length; i++) {
    const cx = candidates[i][0];
    const cy = candidates[i][1];
    const dx = stagU - cx;
    const dy = fv - cy;
    // Fan arcs radiate upward (dy >= -0.05) within radius ~0.72
    const dist = Math.hypot(dx, dy);
    if (dy > -0.15 && dist < 0.72 && dist < bestR) {
      bestR = dist;
      bestAngle = Math.atan2(dy, dx); // [0..PI]
      bestCenterId = candidates[i][2];
    }
  }

  // Concentric stone rings along bestR (7 rings per fan radius)
  const ringFreq = 9.0;
  const ringPos = bestR * ringFreq;
  const ringIdx = Math.floor(ringPos);
  const ringFrac = ringPos - ringIdx;

  // Number of granite cubes in this concentric arc scales with radius
  const numStonesInArc = Math.max(4, Math.round((bestR + 0.08) * 22));
  const normAngle = (bestAngle + Math.PI) / (2.0 * Math.PI);
  const arcPos = normAngle * numStonesInArc + (ringIdx % 2) * 0.5;
  const stoneIdx = Math.floor(arcPos);
  const arcFrac = arcPos - stoneIdx;

  const nLow = fbm(u, v, 6, 4, 4301);
  const nMid = fbm(u, v, 18, 4, 4302);
  const nHigh = fbm(u, v, 42, 3, 4303);

  // Organic jitter of stone boundaries
  const edgeDistR = Math.min(ringFrac, 1.0 - ringFrac) + (nMid - 0.5) * 0.07;
  const edgeDistA = Math.min(arcFrac, 1.0 - arcFrac) + (nMid - 0.5) * 0.07;
  const jointDist = Math.min(edgeDistR, edgeDistA);

  const isJoint = jointDist < 0.12;
  const stoneSeed = hash2(ringIdx + bestCenterId * 17, stoneIdx, 4304);
  const mossMask = fbm(u, v, 5, 4, 4305);
  const wetSheen = fbm(u, v, 4, 3, 4306);

  if (isJoint) {
    // Deep stone joint filled with damp dark mud and pockets of emerald courtyard moss
    const hasMoss = mossMask > 0.53;
    const r = hasMoss ? (34 + nHigh * 16) : (32 + nHigh * 14);
    const g = hasMoss ? (52 + nHigh * 22) : (30 + nHigh * 12);
    const b = hasMoss ? (28 + nHigh * 12) : (26 + nHigh * 10);
    return {
      r, g, b,
      ao: 85,
      rough: hasMoss ? 205 : 135,
      metal: 0,
      h: 0.12 + (nHigh - 0.5) * 0.06
    };
  }

  // Domed pillow height profile of each hand-split granite cobblestone
  const normEdge = Math.min(1.0, (jointDist - 0.12) / 0.36);
  const dome = Math.sqrt(normEdge);

  // Subtle granite color variation per stone (porphyry warm grey, charcoal basalt, cool blue-grey granite)
  const tint = (stoneSeed - 0.5) * 26;
  const warmShift = (hash2(stoneIdx, ringIdx, 4307) - 0.5) * 14;
  let r = 74 + tint + warmShift + (nMid - 0.5) * 18 + (nHigh - 0.5) * 14;
  let g = 75 + tint + (nMid - 0.5) * 18 + (nHigh - 0.5) * 14;
  let b = 78 + tint - warmShift * 0.6 + (nMid - 0.5) * 18 + (nHigh - 0.5) * 14;

  // Wet rain/fountain mist darkens stone slightly and gives specular stone tops (rough: 50..110)
  const wetFactor = Math.max(0, (wetSheen - 0.35) * 1.4);
  r *= (1.0 - wetFactor * 0.22);
  g *= (1.0 - wetFactor * 0.22);
  b *= (1.0 - wetFactor * 0.20);

  let rough = 96 - dome * 28 - wetFactor * 26 + (nHigh - 0.5) * 22;
  rough = Math.max(50, Math.min(110, rough));

  const h = 0.28 + dome * 0.52 + (nMid - 0.5) * 0.08 + (nHigh - 0.5) * 0.05;
  const ao = Math.round(135 + dome * 105);

  return { r, g, b, ao, rough, metal: 0, h };
});

// (4) embassy_neoclassical_stone_2k (1024x1024, RGB):
// Neoclassical palace wall facade & interior wall texture — lower carved limestone dado/wainscoting plinth,
// fluted plaster/ashlar stone blocks above, bullet-chipped plaster patches, decorative cornice molding at top,
// and smoke/soot stains.
writePBRSet('embassy_neoclassical_stone_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 4401);
  const nMid = fbm(u, v, 18, 4, 4402);
  const nHigh = fbm(u, v, 44, 3, 4403);
  const soot = Math.max(0, fbm(u * 2.0, v, 8, 4, 4404) - 0.47) * 2.0;

  // Bullet-impact chipped plaster/limestone craters scattered across mid-wall (v in 0.22..0.78)
  const cellU = Math.floor(u * 6);
  const cellV = Math.floor(v * 6);
  const cellSeed = hash2(cellU, cellV, 4405);
  const localCU = ((u * 6) % 1) - 0.5;
  const localCV = ((v * 6) % 1) - 0.5;
  const bulletDist = Math.hypot(localCU + (cellSeed - 0.5) * 0.3, localCV + (cellSeed - 0.5) * 0.25);
  const isBulletCrater = (v > 0.20 && v < 0.80) && (cellSeed > 0.68) && (bulletDist < (0.14 + (nMid - 0.5) * 0.06));

  if (isBulletCrater) {
    // Chipped raw masonry core inside bullet impact pockmark + dark powder burn rim
    const isCore = bulletDist < 0.065;
    const r = isCore ? (58 + nHigh * 22) : (44 + nMid * 18);
    const g = isCore ? (52 + nHigh * 20) : (40 + nMid * 16);
    const b = isCore ? (46 + nHigh * 18) : (36 + nMid * 14);
    return {
      r, g, b,
      ao: isCore ? 95 : 145,
      rough: 230,
      metal: 0,
      h: isCore ? 0.16 : 0.34
    };
  }

  let r = 118 + (nLow - 0.5) * 18 + (nMid - 0.5) * 12;
  let g = 112 + (nLow - 0.5) * 16 + (nMid - 0.5) * 12;
  let b = 100 + (nLow - 0.5) * 14 + (nMid - 0.5) * 10;
  let h = 0.58;
  let ao = 230;
  let rough = 152 + (nMid - 0.5) * 28;

  if (v < 0.14 || v > 0.88) {
    // Decorative neoclassical cornice & horizontal dentil/cyma molding bands at top & bottom
    const profile = Math.sin(v * Math.PI * 36.0);
    const isDentilBand = (v > 0.06 && v < 0.10) || (v > 0.90 && v < 0.94);
    const dentilCut = isDentilBand && (((u * 32) % 1) < 0.35);
    h = dentilCut ? 0.28 : (0.64 + profile * 0.22);
    ao = dentilCut ? 125 : Math.round(205 + profile * 35);
    r += profile * 12 - (dentilCut ? 28 : 0);
    g += profile * 11 - (dentilCut ? 26 : 0);
    b += profile * 10 - (dentilCut ? 24 : 0);
  } else if (v >= 0.62 && v <= 0.88) {
    // Lower carved limestone dado / wainscoting recessed coffer panels (4 panels across U)
    const panelU = (u * 4) % 1;
    const panelV = (v - 0.62) / 0.26;
    const pBorder = Math.min(panelU, 1 - panelU, panelV, 1 - panelV);
    if (pBorder < 0.08) {
      // Raised outer panel stiles
      h = 0.72;
      ao = 235;
    } else if (pBorder < 0.15) {
      // Carved ogee bevel frame around wainscoting coffer
      const bevelWave = Math.sin(((pBorder - 0.08) / 0.07) * Math.PI * 2.0);
      h = 0.56 + bevelWave * 0.18;
      ao = 165 + Math.round(bevelWave * 45);
      r -= 10; g -= 10; b -= 8;
    } else {
      // Recessed dark honed limestone panel field
      h = 0.46;
      ao = 215;
      r -= 14; g -= 13; b -= 11;
      rough = 128 + (nMid - 0.5) * 24;
    }
  } else {
    // Main upper wall: Neoclassical ashlar limestone courses with recessed rusticated V-joints & subtle pilaster fluting
    const rows = 6;
    const cols = 4;
    const rowY = (v - 0.14) / (0.62 - 0.14) * rows;
    const rIdx = Math.floor(rowY);
    const ry = rowY - rIdx;
    const stag = (rIdx % 2) * 0.5;
    const colX = u * cols + stag;
    const cIdx = Math.floor(colX);
    const rx = colX - cIdx;

    const jointX = Math.min(rx, 1 - rx);
    const jointY = Math.min(ry, 1 - ry) * 0.55;
    const joint = Math.min(jointX, jointY);
    const blockTint = (hash2(cIdx, rIdx, 4406) - 0.5) * 14;
    r += blockTint;
    g += blockTint * 0.95;
    b += blockTint * 0.88;

    if (joint < 0.032) {
      // Deep rusticated ashlar channel joint
      h = 0.24;
      ao = 110;
      r -= 32; g -= 30; b -= 28;
      rough = 215;
    } else if (joint < 0.075) {
      // Chamfered block edge
      const slope = (joint - 0.032) / 0.043;
      h = 0.28 + slope * 0.34;
      ao = Math.round(145 + slope * 85);
    } else {
      h = 0.62 + (nHigh - 0.5) * 0.07;
    }
  }

  // Apply blast smoke & soot stains
  r = r * (1 - soot * 0.52) + 32 * (soot * 0.52);
  g = g * (1 - soot * 0.52) + 30 * (soot * 0.52);
  b = b * (1 - soot * 0.52) + 28 * (soot * 0.52);
  rough = Math.min(235, rough + soot * 70 + (nHigh - 0.5) * 18);
  ao = Math.max(85, ao - soot * 55);

  return { r, g, b, ao, rough, metal: 0, h };
});

// (5) embassy_boxwood_hedge_2k (1024x1024, RGB):
// Dense manicured Baroque garden boxwood hedge foliage texture — deep dark emerald/olive leaf clusters
// (R:34..58, G:55..82, B:30..48), deep shadow cavities (AO), and crisp leaf relief in the normal map.
writePBRSet('embassy_boxwood_hedge_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 4501);
  const nMid = fbm(u, v, 18, 4, 4502);

  // Multi-layered overlapping small oval boxwood leaves (3 depth layers for lush 3D parallax relief)
  let topLayer = -1;
  let leafTone = 0.5;
  let leafDome = 0.0;
  let leafEdgeDist = 0.0;
  let veinDepression = 0.0;

  const layers = [
    { grid: 22, seed: 4510, baseH: 0.28 },
    { grid: 28, seed: 4520, baseH: 0.54 },
    { grid: 34, seed: 4530, baseH: 0.80 }
  ];

  for (let L = 0; L < layers.length; L++) {
    const gSize = layers[L].grid;
    const lSeed = layers[L].seed;
    const gu = u * gSize + L * 0.37;
    const gv = v * gSize + L * 0.61;
    const cx = Math.floor(gu);
    const cy = Math.floor(gv);
    const fx = (gu - cx) - 0.5;
    const fy = (gv - cy) - 0.5;

    const cellRand = hash2((cx % gSize + gSize) % gSize, (cy % gSize + gSize) % gSize, lSeed);
    if (cellRand < 0.24) continue; // gap exposing deeper cavity or woody twig

    const angle = hash2(cx, cy, lSeed + 3) * Math.PI * 2.0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const lx = fx * cosA - fy * sinA;
    const ly = fx * sinA + fy * cosA;

    // Oval boxwood leaf profile (semi-axes 0.42 x 0.28)
    const ellip = Math.hypot(lx / 0.42, ly / 0.28);
    if (ellip < 1.0) {
      topLayer = L;
      leafTone = cellRand;
      leafEdgeDist = 1.0 - ellip;
      leafDome = Math.sqrt(Math.max(0, 1.0 - ellip * ellip));
      // Central midrib leaf vein along lx axis
      veinDepression = Math.abs(ly) < 0.038 && Math.abs(lx) < 0.34 ? 0.10 : 0.0;
    }
  }

  if (topLayer < 0) {
    // Deep interior hedge shadow cavity with occasional dark woody twig
    const isTwig = Math.abs(nMid - 0.50) < 0.025;
    return {
      r: isTwig ? 42 : 20,
      g: isTwig ? 34 : 30,
      b: isTwig ? 24 : 18,
      ao: isTwig ? 115 : 55,
      rough: 210,
      metal: 0,
      h: isTwig ? 0.22 : 0.08
    };
  }

  // Deep dark emerald/olive leaf clusters strictly within R:34..58, G:55..82, B:30..48
  const layerBright = (topLayer / 2.0); // 0, 0.5, 1.0
  const varFactor = Math.min(1.0, Math.max(0.0, 0.25 + layerBright * 0.55 + (leafTone - 0.5) * 0.35 + (nLow - 0.5) * 0.25));

  const r = Math.round(34 + varFactor * 24 + veinDepression * 18);
  const g = Math.round(55 + varFactor * 27 + veinDepression * 22);
  const b = Math.round(30 + varFactor * 18);

  // Waxy boxwood leaf cuticle reflects flashlight softly (rough: 85..140)
  const rough = 135 - layerBright * 35 - leafDome * 18 + (nMid - 0.5) * 18;
  const ao = Math.round(105 + layerBright * 85 + leafEdgeDist * 55);
  const h = layers[topLayer].baseH + leafDome * 0.18 - veinDepression;

  return { r, g, b, ao, rough, metal: 0, h };
});

// (6) hero_limo_armored_2k (1024x1024, RGB):
// Armored VIP diplomatic limousine & grand piano body atlas — glossy obsidian-black armored steel panels
// (rough: 28..65, metal: 185..235), chrome trim bands, bullet-hole craters & spiderwebbed armored glass seams,
// mud splatter along lower rocker panels.
writePBRSet('hero_limo_armored_2k', 1024, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 4601);
  const nMid = fbm(u, v, 18, 4, 4602);
  const nHigh = fbm(u, v, 44, 3, 4603);

  // Panel door seams
  const panelU = (u * 4) % 1;
  const isDoorSeam = (panelU < 0.010 || panelU > 0.990) || Math.abs(v - 0.18) < 0.006 || Math.abs(v - 0.56) < 0.006;
  if (isDoorSeam) {
    return { r: 14, g: 15, b: 18, ao: 75, rough: 195, metal: 60, h: 0.12 };
  }

  // Chrome diplomatic beltline molding strips (v in 0.53..0.56 and v in 0.18..0.21)
  const isChromeTrim = (v >= 0.53 && v < 0.56) || (v >= 0.18 && v < 0.21);
  if (isChromeTrim) {
    const prof = Math.sin(((v % 0.03) / 0.03) * Math.PI);
    return {
      r: 175 + prof * 25 + (nMid - 0.5) * 14,
      g: 180 + prof * 25 + (nMid - 0.5) * 14,
      b: 188 + prof * 25 + (nMid - 0.5) * 14,
      ao: 235,
      rough: 28 + (nHigh - 0.5) * 12,
      metal: 235,
      h: 0.78 + prof * 0.14
    };
  }

  // Upper band (v > 0.58): Smoked bulletproof polycarbonate/glass window panel with spiderwebbed ballistic impact cracks
  if (v > 0.58 && v < 0.92 && panelU > 0.08 && panelU < 0.92) {
    const isRubberSeal = panelU < 0.11 || panelU > 0.89 || v < 0.61 || v > 0.89;
    if (isRubberSeal) {
      return { r: 22, g: 24, b: 26, ao: 155, rough: 190, metal: 0, h: 0.42 };
    }
    // Ballistic impact point in window center
    const dx = (panelU - 0.48) * 1.4;
    const dy = (v - 0.74) * 2.2;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const radialRay = Math.abs(Math.sin(angle * 11.0 + nLow * 1.8));
    const concentricRing = Math.abs(Math.sin(dist * 42.0 + nMid * 1.5));
    const isSpiderCrack = dist < 0.34 && (dist < 0.045 || (radialRay < 0.11 && dist < 0.32) || (concentricRing < 0.16 && dist < 0.22));

    if (isSpiderCrack) {
      // Frosted fractured laminated ballistic glass layer
      return {
        r: 122 + (nHigh - 0.5) * 25,
        g: 132 + (nHigh - 0.5) * 25,
        b: 138 + (nHigh - 0.5) * 25,
        ao: 180,
        rough: 145,
        metal: 35,
        h: 0.34 + (nHigh - 0.5) * 0.12
      };
    }

    // Intact glossy dark smoked armored glass
    return {
      r: 20 + (nLow - 0.5) * 6,
      g: 26 + (nLow - 0.5) * 8,
      b: 32 + (nLow - 0.5) * 8,
      ao: 245,
      rough: 28 + (nMid - 0.5) * 10,
      metal: 185,
      h: 0.52
    };
  }

  // Glossy obsidian-black armored steel body panels (also shared by grand piano lacquer finish)
  let r = 24 + (nLow - 0.5) * 8 + (nMid - 0.5) * 6;
  let g = 26 + (nLow - 0.5) * 8 + (nMid - 0.5) * 6;
  let b = 30 + (nLow - 0.5) * 10 + (nMid - 0.5) * 6;
  let rough = 34 + (nMid - 0.5) * 16;
  let metal = 210;
  let h = 0.60 + (nHigh - 0.5) * 0.02;
  let ao = 240;

  // Armor-piercing bullet dent craters on mid door panel (v in 0.30..0.50)
  const bdx = (panelU - 0.36) * 2.2;
  const bdy = (v - 0.39) * 3.8;
  const bDist = Math.hypot(bdx, bdy);
  if (bDist < 0.14) {
    // Exposed bright raw steel crater & chipped clearcoat halo
    const isInnerHole = bDist < 0.045;
    r = isInnerHole ? 32 : 128;
    g = isInnerHole ? 34 : 132;
    b = isInnerHole ? 38 : 138;
    rough = isInnerHole ? 185 : 85;
    metal = isInnerHole ? 110 : 230;
    h = isInnerHole ? 0.18 : (0.44 + (bDist / 0.14) * 0.22);
    ao = isInnerHole ? 80 : 175;
  }

  // Dried mud & road grime splatter along lower rocker panels (v < 0.24)
  const mudHeight = Math.max(0, (0.25 - v) * 4.0);
  const mudMask = mudHeight * fbm(u * 3.0, v * 3.0, 10, 4, 4604);
  if (mudMask > 0.34) {
    const m = Math.min(1.0, (mudMask - 0.34) * 2.6);
    r = r * (1 - m) + (76 + (nHigh - 0.5) * 16) * m;
    g = g * (1 - m) + (62 + (nHigh - 0.5) * 14) * m;
    b = b * (1 - m) + (46 + (nHigh - 0.5) * 12) * m;
    rough = rough * (1 - m) + 195 * m;
    metal = metal * (1 - m);
    h += m * 0.08;
    ao -= m * 45;
  }

  return { r, g, b, ao, rough, metal, h };
});

// (7) embassy_brass_ornate_1k (512x512, RGB):
// Tarnished antique gold/brass & bronze for palace chandeliers, grand piano frame, vault doors,
// fountain trim, and column capitals (metal: 220, rough: 48..95).
writePBRSet('embassy_brass_ornate_1k', 512, false, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 4701);
  const nMid = fbm(u, v, 18, 4, 4702);
  const nHigh = fbm(u, v, 40, 3, 4703);

  // Neoclassical filigreed rosette & fluted acanthus scroll relief pattern
  const cellU = ((u * 4) % 1) - 0.5;
  const cellV = ((v * 4) % 1) - 0.5;
  const rad = Math.hypot(cellU, cellV);
  const ang = Math.atan2(cellV, cellU);

  const fluting = Math.sin(u * Math.PI * 32.0) * 0.5 + 0.5;
  const rosettePetal = Math.cos(ang * 8.0) * Math.sin(rad * Math.PI * 5.0);
  const inMedallion = rad < 0.38;
  const relief = inMedallion ? (0.5 + rosettePetal * 0.38) : (0.35 + fluting * 0.35);

  // Antique patina / dark bronze verdigris tarnish in deep crevices (low relief)
  const crevice = Math.max(0, Math.min(1.0, (0.58 - relief) * 1.9 + (nLow - 0.5) * 0.4));

  // Rich antique brass / warm gold highlights vs dark bronze patina in recesses
  const r = 166 * (1 - crevice * 0.52) + 64 * (crevice * 0.52) + (nMid - 0.5) * 18;
  const g = 132 * (1 - crevice * 0.54) + 52 * (crevice * 0.54) + (nMid - 0.5) * 14;
  const b = 56  * (1 - crevice * 0.45) + 32 * (crevice * 0.45) + (nMid - 0.5) * 10;

  let rough = 52 + crevice * 40 + (nHigh - 0.5) * 14;
  rough = Math.max(48, Math.min(95, rough));

  const ao = Math.round(140 + relief * 105 - crevice * 45);
  const h = 0.32 + relief * 0.52 + (nHigh - 0.5) * 0.05;

  return { r, g, b, ao, rough, metal: 220, h };
});

// (8) decal_red_carpet_runner (512x512, RGBA for alphaMode: "MASK"):
// Torn, scorched, and blood-stained royal burgundy-crimson velvet diplomatic carpet runner
// with tarnished gold woven border fringes (0 emission, fabric weave normal map, rough: 165..215,
// with dark coagulated blood stains on it).
writePBRSet('decal_red_carpet_runner', 512, true, (u, v) => {
  const nLow = fbm(u, v, 6, 4, 4801);
  const nMid = fbm(u, v, 18, 4, 4802);
  const nHigh = fbm(u, v, 48, 3, 4803);

  // Runner carpet dimensions in UV space with blast-torn irregular edges & blast holes
  const edgeWaveL = 0.08 + (nLow - 0.5) * 0.06;
  const edgeWaveR = 0.92 + (nLow - 0.5) * 0.06;
  const endWaveT = 0.04 + (nMid - 0.5) * 0.05;
  const endWaveB = 0.96 + (nMid - 0.5) * 0.05;

  const inCarpetBounds = (u > edgeWaveL && u < edgeWaveR && v > endWaveT && v < endWaveB);

  // Blast scorch tear holes inside the carpet runner
  const tearHole1 = Math.hypot((u - 0.34) * 1.3, (v - 0.42)) + (nMid - 0.5) * 0.14;
  const tearHole2 = Math.hypot((u - 0.68), (v - 0.71) * 1.4) + (nMid - 0.5) * 0.14;
  const isTornOut = (tearHole1 < 0.11) || (tearHole2 < 0.09);

  if (!inCarpetBounds || isTornOut) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  // Charred scorch rim around blast tear holes and torn edges
  const distToEdge = Math.min(u - edgeWaveL, edgeWaveR - u, v - endWaveT, endWaveB - v, tearHole1 - 0.11, tearHole2 - 0.09);
  const isScorched = distToEdge < 0.055;

  // Fine woven velvet pile normal detail
  const weaveU = Math.sin(u * Math.PI * 180.0);
  const weaveV = Math.sin(v * Math.PI * 180.0);
  const weave = (weaveU * weaveV) * 0.5 + 0.5;

  // Tarnished gold woven border trim strips near left & right runner edges (u ~ 0.13..0.19 and 0.81..0.87)
  const isGoldBorder = (u > 0.13 && u < 0.185) || (u > 0.815 && u < 0.87) ||
                       (Math.abs(u - 0.21) < 0.008) || (Math.abs(u - 0.79) < 0.008);
  const greekKey = ((Math.floor(u * 64) + Math.floor(v * 64)) % 2) === 0;

  let r, g, b, rough, metal = 0;
  if (isGoldBorder && greekKey) {
    // Tarnished antique gold thread embroidery
    r = 126 + (nMid - 0.5) * 22;
    g = 98  + (nMid - 0.5) * 18;
    b = 42  + (nMid - 0.5) * 12;
    rough = 165 + weave * 25;
    metal = 95;
  } else {
    // Deep matte royal burgundy-crimson velvet pile (0 emission, dark tactical value)
    r = 92 + (nLow - 0.5) * 18 + (weave - 0.5) * 12;
    g = 18 + (nLow - 0.5) * 6  + (weave - 0.5) * 4;
    b = 22 + (nLow - 0.5) * 8  + (weave - 0.5) * 5;
    rough = 182 + weave * 28 + (nHigh - 0.5) * 14;
  }

  // Dark coagulated blood stains soaked into the velvet pile
  const bloodPool1 = Math.hypot((u - 0.48) * 1.2, (v - 0.28) * 0.9) - (nLow - 0.5) * 0.18;
  const bloodPool2 = Math.hypot((u - 0.52) * 0.9, (v - 0.62) * 1.1) - (nMid - 0.5) * 0.16;
  const inBlood = bloodPool1 < 0.19 || bloodPool2 < 0.16;

  if (inBlood) {
    r = 42 + (nHigh - 0.5) * 10;
    g = 7  + (nHigh - 0.5) * 3;
    b = 8  + (nHigh - 0.5) * 3;
    // Coagulated blood mated into carpet fibers has slightly lower roughness than dry velvet
    rough = 165 + weave * 18;
    metal = 0;
  }

  if (isScorched) {
    const s = 1.0 - Math.max(0, distToEdge / 0.055);
    r = r * (1 - s * 0.78) + 20 * (s * 0.78);
    g = g * (1 - s * 0.78) + 18 * (s * 0.78);
    b = b * (1 - s * 0.78) + 16 * (s * 0.78);
    rough = Math.min(215, rough + s * 30);
  }

  rough = Math.max(165, Math.min(215, rough));
  const h = 0.58 + weave * 0.14 + (isGoldBorder ? 0.05 : 0.0) - (isScorched ? 0.12 : 0.0);
  const ao = Math.round(195 + weave * 35 - (isScorched ? 65 : 0) - (inBlood ? 25 : 0));

  return { r, g, b, a: 255, ao, rough, metal, h };
});

// (9) decal_shattered_chandelier (512x512, RGBA for alphaMode: "MASK"):
// Scattered broken crystal chandelier prisms, shattered glass shards, and plaster blast debris
// on the ballroom floor (0 emission, low roughness 20..50 so crystal shards sparkle when the player's flashlight sweeps over them!).
writePBRSet('decal_shattered_chandelier', 512, true, (u, v) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const radial = Math.hypot(dx, dy);
  if (radial > 0.94) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  const nLow = fbm(u, v, 8, 4, 4901);
  const nMid = fbm(u, v, 22, 4, 4902);
  const nHigh = fbm(u, v, 48, 3, 4903);

  // Twisted fallen antique brass chandelier ring & candle arm fragments near center
  const ringDist = Math.abs(radial - (0.34 + (nLow - 0.5) * 0.12));
  const armAngle = Math.atan2(dy, dx);
  const isBrassArm = (ringDist < 0.032 && nMid > 0.38) ||
                     (radial < 0.42 && radial > 0.10 && Math.abs(Math.sin(armAngle * 3.0 + nLow)) < 0.065 && nMid > 0.44);

  if (isBrassArm) {
    return {
      r: 146 + (nHigh - 0.5) * 24,
      g: 114 + (nHigh - 0.5) * 20,
      b: 48  + (nHigh - 0.5) * 12,
      a: 255,
      ao: 205,
      rough: 46 + (nHigh - 0.5) * 14,
      metal: 220,
      h: 0.84 + (nHigh - 0.5) * 0.10
    };
  }

  // Procedural Voronoi-like faceted crystal prism shards & ceiling plaster chunks across a 16x16 grid
  const grid = 16;
  const gu = u * grid;
  const gv = v * grid;
  const cx = Math.floor(gu);
  const cy = Math.floor(gv);
  const fx = (gu - cx) - 0.5;
  const fy = (gv - cy) - 0.5;

  const cellSeed = hash2(cx, cy, 4904);
  const densityThreshold = 0.30 + radial * 0.48;
  if (cellSeed < densityThreshold) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  const shardAngle = hash2(cx, cy, 4905) * Math.PI * 2.0;
  const cosA = Math.cos(shardAngle);
  const sinA = Math.sin(shardAngle);
  const sx = fx * cosA - fy * sinA;
  const sy = fx * sinA + fy * cosA;

  // Elongated octagonal crystal teardrop prism or angular glass triangle
  const isCrystalPrism = cellSeed > 0.52;
  const inShape = isCrystalPrism
    ? (Math.abs(sx) < 0.36 && Math.abs(sy) < 0.18 && (Math.abs(sx) * 0.5 + Math.abs(sy)) < 0.28)
    : (Math.hypot(sx, sy) < 0.26 + (nHigh - 0.5) * 0.08);

  if (!inShape) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  if (isCrystalPrism) {
    // Multi-faceted cut lead-crystal chandelier prism: sharp triangular facet tilts in heightMap
    // so the normal map deflects the player's flashlight in crisp sparkling glints!
    const facetSlopeX = sx > 0 ? 1.0 : -1.0;
    const facetSlopeY = sy > 0 ? 1.0 : -1.0;
    const facetH = 0.78 - Math.abs(sx) * 0.55 - Math.abs(sy) * 0.75;
    const facetBright = (facetSlopeX * 0.5 + facetSlopeY * 0.5) * 18;
    const r = 136 + facetBright + (nHigh - 0.5) * 18;
    const g = 144 + facetBright + (nHigh - 0.5) * 18;
    const b = 154 + facetBright + (nHigh - 0.5) * 20;
    // Ultra-low roughness (20..42) for mirror-like crystal sparkle under flashlight
    const rough = 22 + (cellSeed - 0.5) * 24;
    return {
      r, g, b,
      a: 255,
      ao: 235,
      rough: Math.max(20, Math.min(48, rough)),
      metal: 45,
      h: Math.max(0.45, Math.min(0.95, facetH))
    };
  }

  // Fallen ceiling plaster blast chunks & dust mixed among the crystal shards (still keeping crystal dominance)
  return {
    r: 108 + (nHigh - 0.5) * 22,
    g: 104 + (nHigh - 0.5) * 20,
    b: 96  + (nHigh - 0.5) * 18,
    a: 255,
    ao: 195,
    rough: 44 + nMid * 16,
    metal: 0,
    h: 0.58 + (nHigh - 0.5) * 0.14
  };
});

// (10) decal_classified_documents (512x512, RGBA for alphaMode: "MASK"):
// Scattered burned/classified diplomatic dossiers, red-stamped secret folders, spilled ink,
// and muddy boot prints across the embassy floors (0 emission).
writePBRSet('decal_classified_documents', 512, true, (u, v) => {
  const nLow = fbm(u, v, 8, 4, 5001);
  const nMid = fbm(u, v, 20, 4, 5002);
  const nHigh = fbm(u, v, 44, 3, 5003);

  // 1) Manila diplomatic dossier folder (tilted at center-left)
  const u1 = (u - 0.34) * 0.92 + (v - 0.42) * 0.39;
  const v1 = -(u - 0.34) * 0.39 + (v - 0.42) * 0.92;
  const inFolder = (Math.abs(u1) < 0.19 && Math.abs(v1) < 0.24) ||
                   (u1 > 0.18 && u1 < 0.22 && Math.abs(v1 + 0.08) < 0.08); // folder side tab

  // 2) Classified white dispatch document page (partially burned edge at lower-right)
  const u2 = (u - 0.66) * 0.85 - (v - 0.56) * 0.52;
  const v2 = (u - 0.66) * 0.52 + (v - 0.56) * 0.85;
  const burnEat = (u2 + v2 > 0.18 + (nLow - 0.5) * 0.12);
  const inPage2 = Math.abs(u2) < 0.16 && Math.abs(v2) < 0.21 && !burnEat;

  // 3) Second scattered diplomatic briefing sheet near top-right
  const u3 = (u - 0.64) * 0.95 + (v - 0.22) * 0.31;
  const v3 = -(u - 0.64) * 0.31 + (v - 0.22) * 0.95;
  const inPage3 = Math.abs(u3) < 0.14 && Math.abs(v3) < 0.11;

  // 4) Spilled dark diplomatic fountain-pen ink blot puddle
  const inkDist = Math.hypot((u - 0.48) * 1.2, (v - 0.68)) - (nLow - 0.5) * 0.11 - (nMid - 0.5) * 0.05;
  const inInk = inkDist < 0.085;

  // 5) Muddy tactical combat boot lug print stamped diagonally across the papers
  const bu = (u - 0.44) * 0.78 - (v - 0.46) * 0.62;
  const bv = (u - 0.44) * 0.62 + (v - 0.46) * 0.78;
  const inBootSole = (Math.hypot(bu * 1.1, (bv - 0.07) * 1.5) < 0.12) ||
                     (Math.hypot(bu * 1.3, (bv + 0.11) * 1.8) < 0.09);
  const bootLug = ((Math.abs(bu * 48) % 1) > 0.28) && ((Math.abs(bv * 36) % 1) > 0.25);
  const hasBootMud = inBootSole && bootLug && nMid > 0.32;

  if (inInk) {
    // Glossy spilled dark midnight-blue/black fountain ink puddle
    return {
      r: 18 + nHigh * 8,
      g: 20 + nHigh * 8,
      b: 32 + nHigh * 12,
      a: 255,
      ao: 210,
      rough: 34 + nMid * 22,
      metal: 15,
      h: 0.54
    };
  }

  if (hasBootMud) {
    // Gritty dark brown combat boot mud track over the documents
    return {
      r: 54 + (nHigh - 0.5) * 16,
      g: 44 + (nHigh - 0.5) * 14,
      b: 32 + (nHigh - 0.5) * 10,
      a: 255,
      ao: 165,
      rough: 215,
      metal: 0,
      h: 0.70 + (nHigh - 0.5) * 0.08
    };
  }

  const grime = nLow * 36 + nHigh * 14;

  if (inPage2) {
    // Charred scorch margin along the burned corner
    const burnDist = (0.18 + (nLow - 0.5) * 0.12) - (u2 + v2);
    if (burnDist < 0.045) {
      return {
        r: 26, g: 22, b: 18,
        a: 255, ao: 145, rough: 225, metal: 0, h: 0.58
      };
    }
    // Red "CLASSIFIED" / "TOP SECRET" box stamp + redacted black censor bars + typed text lines
    const inRedStamp = Math.abs(u2 - 0.02) < 0.085 && Math.abs(v2 + 0.11) < 0.028 &&
                       (Math.abs(u2 - 0.02) > 0.072 || Math.abs(v2 + 0.11) > 0.018 || ((Math.abs(u2 * 90) % 1) > 0.32));
    const isRedactedBar = (v2 > -0.04 && v2 < -0.015 && u2 > -0.11 && u2 < 0.08) ||
                          (v2 > 0.04 && v2 < 0.065 && u2 > -0.11 && u2 < 0.05);
    const isTypedLine = Math.abs(u2) < 0.12 && ((Math.abs(v2 * 44) % 1) < 0.28) && ((Math.abs(u2 * 24) % 1) > 0.15);

    let r = 158 - grime;
    let g = 152 - grime;
    let b = 140 - grime;
    if (inRedStamp) {
      // Muted dark crimson ink stamp (0 emission!)
      r = 124 - grime * 0.4;
      g = 28;
      b = 26;
    } else if (isRedactedBar) {
      r = 28; g = 28; b = 30;
    } else if (isTypedLine) {
      r = 68; g = 66; b = 62;
    }
    return {
      r, g, b,
      a: 255,
      ao: 225 - nLow * 30,
      rough: 175 + nHigh * 30,
      metal: 0,
      h: 0.64 + (nMid - 0.5) * 0.10
    };
  }

  if (inFolder) {
    // Manila dossier folder with crimson confidential diagonal stripe & diplomatic crest seal
    const inSeal = Math.hypot(u1, v1 + 0.04) < 0.045 && Math.hypot(u1, v1 + 0.04) > 0.022;
    const inConfBand = Math.abs((u1 + v1) + 0.14) < 0.024 && Math.abs(u1) < 0.15 && Math.abs(v1) < 0.19;
    let r = 144 - grime * 0.85;
    let g = 122 - grime * 0.85;
    let b = 84  - grime * 0.75;
    if (inConfBand) {
      r = 118 - grime * 0.4;
      g = 26;
      b = 24;
    } else if (inSeal) {
      r = 112; g = 92; b = 42;
    }
    return {
      r, g, b,
      a: 255,
      ao: 220 - nLow * 35,
      rough: 168 + nHigh * 32,
      metal: inSeal ? 120 : 0,
      h: 0.62 + (nLow - 0.5) * 0.08
    };
  }

  if (inPage3) {
    const isHeaderBand = v3 < -0.06 && Math.abs(u3) < 0.11;
    const isText = ((Math.abs(v3 * 48) % 1) < 0.30) && Math.abs(u3) < 0.11;
    const c = isHeaderBand ? 105 : (isText ? 72 : (148 - grime));
    return {
      r: isHeaderBand ? 114 : c,
      g: isHeaderBand ? 32  : (c - 4),
      b: isHeaderBand ? 30  : (c - 10),
      a: 255,
      ao: 225,
      rough: 178,
      metal: 0,
      h: 0.60 + (nMid - 0.5) * 0.08
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
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map1_Elcilik_Baskini_3v3v3v3_v3 PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3, Map4_Orman_v3 & Map5_Hastane_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, hospital_brushed_steel_1k
- rusty_metal_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- hero_radar_metal, industrial_light_lens, decal_oil_spill, decal_scorch_crater, decal_tire_tracks,
  decal_moss_patch, decal_leaf_litter, grass_forest_fern, decal_blood_trail, decal_chemical_puddle
- Custom procedural baked 2K/1K embassy PBR textures (0 emission, flashlight-reactive normal & roughness):
  embassy_checker_marble_2k, embassy_herringbone_parquet_2k, embassy_courtyard_cobble_2k,
  embassy_neoclassical_stone_2k, embassy_boxwood_hedge_2k, hero_limo_armored_2k,
  embassy_brass_ornate_1k, decal_red_carpet_runner, decal_shattered_chandelier,
  decal_classified_documents.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
