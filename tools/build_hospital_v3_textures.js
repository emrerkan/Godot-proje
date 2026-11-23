#!/usr/bin/env node
/**
 * build_hospital_v3_textures.js
 * Generates and copies 2K/1K PBR textures (Diffuse, nor_gl, arm) + Godot 4 BC7/BC5/BC1 .import files
 * for Map5_Karantina_Hastanesi_3v3v3v3_v3.gltf
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map5_Hastane_v3');
const TEX_DIR = path.join(OUT_DIR, 'textures');
const COL_TEX_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3', 'textures');
const ORM_TEX_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3', 'textures');

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

// Generate Godot 4 .import file with exact BC7 / BC5 / BC1 VRAM compression matching Map3_Col_v3
function writeTextureImport(fileName, role) {
  // role: 'color' (BC7: high_quality=true, normal_map=2), 'normal' (BC5: high_quality=false, normal_map=1), 'arm' (BC1: high_quality=false, normal_map=2)
  const resPath = `res://asset model/haritalar/Map5_Hastane_v3/textures/${fileName}`;
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

// 1. Copy shared high-res CC0 textures from Map3_Col_v3 & Map4_Orman_v3
const COPY_FROM_COL = [
  'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png',
  'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg',
  'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg', 'portable_generator_spec_1k.jpg',
  'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg',
  'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg',
  'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg',
  'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png',
  'tent_camo_canvas_Diffuse.png', 'tent_camo_canvas_nor_gl.png', 'tent_camo_canvas_arm.png',
  'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg',
  'corrugated_iron_02_2k_Diffuse.jpg', 'corrugated_iron_02_2k_nor_gl.jpg', 'corrugated_iron_02_2k_arm.jpg',
  'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png',
  'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png',
  'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png',
  'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png',
  'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png',
  'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png',
  'grass_desert_scrub_Diffuse.png', 'grass_desert_scrub_nor_gl.png', 'grass_desert_scrub_arm.png'
];

const COPY_FROM_ORM = [
  'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png',
  'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg',
  'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg',
  'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg',
  'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png',
  'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png'
];

for (const f of COPY_FROM_COL) {
  fs.copyFileSync(path.join(COL_TEX_DIR, f), path.join(TEX_DIR, f));
}
for (const f of COPY_FROM_ORM) {
  fs.copyFileSync(path.join(ORM_TEX_DIR, f), path.join(TEX_DIR, f));
}
console.log(`Copied ${COPY_FROM_COL.length + COPY_FROM_ORM.length} CC0 textures from Map3/Map4.`);

// 2. Generate Custom Hospital v3 High-Res PBR Texture Sets
// (A) Dirty Hospital Vinyl Corridor Tiles (8x8 grid per UV tile, terrazzo speckles, dark grout, grime stains)
writePBRSet('hospital_vinyl_tile_2k', 1024, false, (u, v) => {
  const gx = (u * 8) % 1;
  const gy = (v * 8) % 1;
  const tx = Math.floor(u * 8);
  const ty = Math.floor(v * 8);
  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isGrout = border < 0.024;
  const n1 = fbm(u, v, 8, 4, 101);
  const speckle = hash2((u * 512) | 0, (v * 512) | 0, 202);
  const tileTint = (hash2(tx, ty, 303) - 0.5) * 14;
  const grime = Math.max(0, fbm(u, v, 4, 4, 404) - 0.48) * 1.9;
  if (isGrout) {
    return { r: 44, g: 47, b: 49, ao: 115, rough: 225, metal: 0, h: 0.15 };
  }
  let baseR = 132 + tileTint + (n1 - 0.5) * 24;
  let baseG = 138 + tileTint + (n1 - 0.5) * 24;
  let baseB = 136 + tileTint + (n1 - 0.5) * 22;
  if (speckle > 0.85) { baseR -= 22; baseG -= 20; baseB -= 18; }
  else if (speckle < 0.12) { baseR += 18; baseG += 18; baseB += 16; }
  // Grime darkening
  baseR = baseR * (1 - grime * 0.55) + 38 * (grime * 0.55);
  baseG = baseG * (1 - grime * 0.55) + 35 * (grime * 0.55);
  baseB = baseB * (1 - grime * 0.55) + 30 * (grime * 0.55);
  const rough = 78 + grime * 120 + (n1 - 0.5) * 35;
  const h = 0.65 + (n1 - 0.5) * 0.18 - grime * 0.12;
  return { r: baseR, g: baseG, b: baseB, ao: 235 - grime * 60, rough, metal: 0, h };
});

// (B) Surgical Green Linoleum Floor (seamless rolled sheets with welded seam, chemical stains, scuff marks)
writePBRSet('surgical_green_linoleum_2k', 1024, false, (u, v) => {
  const n1 = fbm(u, v, 6, 4, 501);
  const n2 = fbm(u, v, 24, 3, 502);
  const seam = Math.abs((u * 2) % 1 - 0.5) < 0.008;
  const scuff = Math.max(0, fbm(u * 1.5, v * 0.5, 12, 3, 503) - 0.62) * 2.5;
  let r = 64 + (n1 - 0.5) * 20 + (n2 - 0.5) * 14 - scuff * 28;
  let g = 104 + (n1 - 0.5) * 26 + (n2 - 0.5) * 16 - scuff * 35;
  let b = 88 + (n1 - 0.5) * 22 + (n2 - 0.5) * 14 - scuff * 28;
  if (seam) { r = 48; g = 75; b = 64; }
  const rough = seam ? 190 : (85 + n1 * 45 + scuff * 95);
  const h = seam ? 0.35 : (0.6 + (n2 - 0.5) * 0.15 - scuff * 0.1);
  return { r, g, b, ao: seam ? 160 : 240, rough, metal: 0, h };
});

// (C) ICU Blue Ward Floor (clinical pale slate-blue grid tiles with wear and disinfectant streaks)
writePBRSet('icu_blue_linoleum_2k', 1024, false, (u, v) => {
  const gx = (u * 6) % 1;
  const gy = (v * 6) % 1;
  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isGrout = border < 0.018;
  const n1 = fbm(u, v, 8, 4, 601);
  const wear = Math.max(0, fbm(u, v, 5, 4, 602) - 0.5) * 1.8;
  if (isGrout) {
    return { r: 38, g: 48, b: 58, ao: 130, rough: 210, metal: 0, h: 0.2 };
  }
  let r = 72 + (n1 - 0.5) * 22 - wear * 25;
  let g = 102 + (n1 - 0.5) * 26 - wear * 28;
  let b = 128 + (n1 - 0.5) * 30 - wear * 32;
  const rough = 82 + wear * 105 + (n1 - 0.5) * 30;
  return { r, g, b, ao: 235 - wear * 50, rough, metal: 0, h: 0.65 + (n1 - 0.5) * 0.15 };
});

// (D) Hospital Plaster Wall with Turquoise Stretcher Bumper Guard & Peeling Paint / Mold
writePBRSet('hospital_wall_plaster_2k', 1024, false, (u, v) => {
  const n1 = fbm(u, v, 8, 4, 701);
  const n2 = fbm(u, v, 32, 3, 702);
  const peelMask = fbm(u, v, 10, 4, 703);
  // v in [0, 1] represents wall height 0..3m
  // Bottom baseboard (v < 0.06), lower turquoise wainscoting (0.06..0.38), bumper strip (0.38..0.44), upper dirty white plaster (0.44..1.0)
  const dampBottom = Math.max(0, (0.18 - v) * 4.5) * fbm(u, v, 6, 3, 704);
  let r, g, b, rough, metal = 0, h = 0.6, ao = 235;

  if (v < 0.05) {
    // Dark rubber baseboard
    r = 36 + n2 * 12; g = 40 + n2 * 12; b = 42 + n2 * 12;
    rough = 150; h = 0.75; ao = 180;
  } else if (v >= 0.37 && v <= 0.44) {
    // Turquoise/Teal impact stretcher bumper guard rail with metallic bracket lines
    const band = (v - 0.37) / 0.07;
    const isEdge = band < 0.15 || band > 0.85;
    r = isEdge ? 45 : (42 + n1 * 18);
    g = isEdge ? 55 : (118 + n1 * 24);
    b = isEdge ? 58 : (116 + n1 * 24);
    rough = isEdge ? 110 : 95;
    metal = isEdge ? 140 : 15;
    h = 0.92;
    ao = isEdge ? 165 : 245;
  } else if (v < 0.37) {
    // Lower seafoam/teal painted wainscoting with chipped plaster patches
    const isPeeled = peelMask > 0.72;
    if (isPeeled) {
      r = 88 + n2 * 25; g = 85 + n2 * 25; b = 78 + n2 * 22;
      rough = 225; h = 0.32; ao = 175;
    } else {
      r = 78 + (n1 - 0.5) * 22;
      g = 116 + (n1 - 0.5) * 26;
      b = 110 + (n1 - 0.5) * 24;
      rough = 135 + n2 * 35; h = 0.62 + (n2 - 0.5) * 0.1;
    }
  } else {
    // Upper dirty plaster with peeling paint & water leak streaks
    const leak = Math.max(0, (v - 0.65) * 2.5) * Math.max(0, fbm(u * 3, v * 0.5, 8, 3, 705) - 0.45);
    const isPeeled = peelMask > 0.68;
    if (isPeeled) {
      r = 92 + n2 * 24; g = 88 + n2 * 22; b = 80 + n2 * 20;
      rough = 230; h = 0.30; ao = 170;
    } else {
      r = 148 + (n1 - 0.5) * 26 - leak * 65;
      g = 146 + (n1 - 0.5) * 26 - leak * 68;
      b = 138 + (n1 - 0.5) * 24 - leak * 72;
      rough = 155 + leak * 70 + (n2 - 0.5) * 30;
      h = 0.64 + (n2 - 0.5) * 0.12 - leak * 0.1;
    }
  }
  if (dampBottom > 0.05) {
    r *= (1 - dampBottom * 0.6);
    g *= (1 - dampBottom * 0.55);
    b *= (1 - dampBottom * 0.65);
    rough = Math.min(245, rough + dampBottom * 60);
  }
  return { r, g, b, ao, rough, metal, h };
});

// (E) Ceramic Bathroom/Operating Wall Tile (dirty white ceramic 12x12 tiles with blood/rust grime in grout)
writePBRSet('hospital_ceramic_tile_2k', 1024, false, (u, v) => {
  const gx = (u * 12) % 1;
  const gy = (v * 12) % 1;
  const border = Math.min(gx, 1 - gx, gy, 1 - gy);
  const isGrout = border < 0.032;
  const n1 = fbm(u, v, 8, 4, 801);
  const stain = Math.max(0, fbm(u, v, 5, 4, 802) - 0.52) * 2.0;
  if (isGrout) {
    return { r: 58 - stain * 20, g: 55 - stain * 22, b: 50 - stain * 22, ao: 120, rough: 230, metal: 0, h: 0.18 };
  }
  const r = 155 + (n1 - 0.5) * 22 - stain * 48;
  const g = 160 + (n1 - 0.5) * 22 - stain * 55;
  const b = 158 + (n1 - 0.5) * 20 - stain * 58;
  const rough = 52 + stain * 135 + (n1 - 0.5) * 20;
  return { r, g, b, ao: 242 - stain * 55, rough, metal: 0, h: 0.72 - border * 0.15 };
});

// (F) Brushed Stainless Steel (Morgue doors, Surgical tables, Scrub sinks, Autopsy equipment)
writePBRSet('hospital_brushed_steel_1k', 512, false, (u, v) => {
  const brush = fbm(u * 6, v * 0.5, 16, 3, 901);
  const smudge = Math.max(0, fbm(u, v, 6, 3, 902) - 0.52) * 1.8;
  const r = 148 + (brush - 0.5) * 28 - smudge * 35;
  const g = 154 + (brush - 0.5) * 28 - smudge * 35;
  const b = 158 + (brush - 0.5) * 30 - smudge * 32;
  const rough = 68 + smudge * 95 + (brush - 0.5) * 25;
  return { r, g, b, ao: 240 - smudge * 40, rough, metal: 225, h: 0.5 + (brush - 0.5) * 0.18 };
});

// (G) Hero Medical Equipment & Ambulance White/Red Enamel Atlas (Ambulance body, MRI scanner, ICU beds)
writePBRSet('hero_medical_enamel_2k', 1024, false, (u, v) => {
  const n1 = fbm(u, v, 8, 4, 1001);
  const grime = Math.max(0, fbm(u, v, 6, 4, 1002) - 0.5) * 1.9;
  // Red paramedic stripe band across v in [0.42, 0.56]
  const isRedBand = v > 0.42 && v < 0.56;
  const isPanelLine = (Math.abs((u * 4) % 1 - 0.5) < 0.008) || (Math.abs((v * 4) % 1 - 0.5) < 0.008);
  if (isPanelLine) {
    return { r: 38, g: 40, b: 42, ao: 110, rough: 195, metal: 80, h: 0.15 };
  }
  let r, g, b;
  if (isRedBand) {
    r = 168 + (n1 - 0.5) * 24 - grime * 55;
    g = 34 + (n1 - 0.5) * 12 - grime * 15;
    b = 32 + (n1 - 0.5) * 12 - grime * 15;
  } else {
    r = 172 + (n1 - 0.5) * 26 - grime * 60;
    g = 176 + (n1 - 0.5) * 26 - grime * 60;
    b = 178 + (n1 - 0.5) * 24 - grime * 58;
  }
  const rough = 72 + grime * 115 + (n1 - 0.5) * 24;
  return { r, g, b, ao: 238 - grime * 55, rough, metal: 35, h: 0.65 - grime * 0.12 };
});

// (H) Biohazard Yellow/Black Quarantine Tarp & Caution Canvas
writePBRSet('quarantine_yellow_tarp_1k', 512, false, (u, v) => {
  const wrinkle = fbm(u, v, 10, 4, 1101);
  const dirt = Math.max(0, fbm(u, v, 6, 3, 1102) - 0.48) * 1.8;
  // Hazard diagonal stripe along bottom/top edges (v < 0.15 or v > 0.85)
  const inBorder = v < 0.16 || v > 0.84;
  const stripe = ((u * 12 + v * 12) % 1) < 0.5;
  let r, g, b;
  if (inBorder && stripe) {
    r = 28 + dirt * 20; g = 28 + dirt * 20; b = 26 + dirt * 20;
  } else {
    r = 185 + (wrinkle - 0.5) * 30 - dirt * 65;
    g = 152 + (wrinkle - 0.5) * 28 - dirt * 58;
    b = 36 + (wrinkle - 0.5) * 14 - dirt * 15;
  }
  const rough = 105 + dirt * 85 + (wrinkle - 0.5) * 35;
  return { r, g, b, ao: 230 - dirt * 50, rough, metal: 0, h: 0.5 + (wrinkle - 0.5) * 0.35 };
});

// (I) Alpha-Masked Decal 1: Dried Blood Trail & Surgical Spatter (alphaMode: MASK)
writePBRSet('decal_blood_trail', 512, true, (u, v) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const dist = Math.hypot(dx * 0.85, dy * 1.15);
  const n = fbm(u, v, 8, 4, 1201);
  const spatter = fbm(u, v, 24, 3, 1202);
  const maskVal = (1.0 - dist) + (n - 0.5) * 0.55 + (spatter > 0.68 ? 0.35 : 0);
  const alpha = maskVal > 0.38 ? 255 : 0;
  const coag = fbm(u, v, 12, 3, 1203);
  const r = 68 + coag * 38;
  const g = 14 + coag * 10;
  const b = 12 + coag * 10;
  // Slightly glossy coagulated blood
  return { r, g, b, a: alpha, ao: 210, rough: 48 + coag * 55, metal: 0, h: alpha > 0 ? 0.62 + coag * 0.15 : 0.5 };
});

// (J) Alpha-Masked Decal 2: Quarantine Hazard Tape & Biohazard Floor Stencil (alphaMode: MASK)
writePBRSet('decal_hazard_stripes', 512, true, (u, v) => {
  const wear = fbm(u, v, 12, 4, 1301);
  // Two parallel tape strips + center biohazard stencil markings
  const inStrip = (v > 0.12 && v < 0.32) || (v > 0.68 && v < 0.88);
  const dx = (u - 0.5) * 3.2;
  const dy = (v - 0.5) * 3.2;
  const rDist = Math.hypot(dx, dy);
  const inRing = rDist > 0.25 && rDist < 0.48;
  const valid = (inStrip || inRing) && (wear > 0.22);
  const alpha = valid ? 255 : 0;
  const diag = ((u * 10 + v * 10) % 1) < 0.5;
  const r = diag ? 195 - wear * 45 : 28;
  const g = diag ? 158 - wear * 40 : 28;
  const b = diag ? 25 : 28;
  return { r, g, b, a: alpha, ao: 235, rough: 115 + wear * 60, metal: 0, h: alpha > 0 ? 0.68 : 0.5 };
});

// (K) Alpha-Masked Decal 3: Reflective Water / Chemical Spill Puddle (roughness 0.08 -> ~20 byte)
writePBRSet('decal_chemical_puddle', 512, true, (u, v) => {
  const dx = (u - 0.5) * 2.0;
  const dy = (v - 0.5) * 2.0;
  const dist = Math.hypot(dx, dy);
  const n = fbm(u, v, 6, 4, 1401);
  const alpha = ((1.0 - dist) + (n - 0.5) * 0.55) > 0.35 ? 255 : 0;
  const r = 34 + n * 18;
  const g = 52 + n * 24;
  const b = 56 + n * 26;
  return { r, g, b, a: alpha, ao: 245, rough: 20, metal: 15, h: 0.5 };
});

// (L) Alpha-Masked Decal 4: Scattered Medical Charts, X-Ray Films & Red ER Guide Line
writePBRSet('decal_medical_charts', 512, true, (u, v) => {
  const n = fbm(u, v, 10, 3, 1501);
  // Multiple rectangular chart pages on the UV canvas
  const p1 = u > 0.12 && u < 0.44 && v > 0.15 && v < 0.58;
  const p2 = u > 0.52 && u < 0.86 && v > 0.32 && v < 0.78;
  const p3 = u > 0.25 && u < 0.65 && v > 0.65 && v < 0.92;
  const isTextLine = ((v * 48) % 1) < 0.25 && ((u * 12) % 1) > 0.15;
  if (p1 || p2) {
    const dirt = n * 45;
    const c = isTextLine ? 55 : (185 - dirt);
    return { r: c, g: c, b: c - 8, a: 255, ao: 230, rough: 175, metal: 0, h: 0.65 };
  } else if (p3) {
    // Dark blue-black X-ray film sheet
    const bone = Math.sin(u * 28) * Math.cos(v * 28) > 0.25 ? 65 : 0;
    return { r: 28 + bone, g: 45 + bone, b: 68 + bone, a: 255, ao: 240, rough: 45, metal: 0, h: 0.68 };
  }
  return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
});

// (M) Alpha-Masked Decal 5: Weathered Blood-Stained & Splattered Floor Medical Cross (+) (alphaMode: MASK, 0 emission!)
writePBRSet('decal_blood_cross', 1024, true, (u, v) => {
  const dx = (u - 0.5) * 2.0; // [-1, 1]
  const dy = (v - 0.5) * 2.0; // [-1, 1]
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const rDist = Math.hypot(dx, dy);

  const nLow = fbm(u, v, 6, 4, 1601);
  const nMid = fbm(u, v, 16, 4, 1602);
  const nHigh = fbm(u, v, 42, 3, 1603);
  const spatter = fbm(u, v, 28, 3, 1604);

  // Base painted medical cross arms (width ~0.27, length ~0.78 in [-1,1] space)
  const armW = 0.27;
  const armL = 0.78;
  const inHoriz = ax < armL && ay < armW;
  const inVert = ay < armL && ax < armW;
  const inCross = inHoriz || inVert;

  // Distance to cross outer edge for realistic paint chipping, peeling & erosion
  let edgeDist = 0;
  if (inCross) {
    const dH = (inHoriz) ? Math.min(armL - ax, armW - ay) : -1;
    const dV = (inVert) ? Math.min(armL - ay, armW - ax) : -1;
    edgeDist = Math.max(dH, dV);
  }

  // Stretcher wheel & boot track erosion lines cutting diagonally across the cross
  const trackAngle = dx * 0.78 + dy * 0.62;
  const trackPerp = -dx * 0.62 + dy * 0.78;
  const inWheelTrack = (Math.abs(trackPerp - 0.22) < 0.065 || Math.abs(trackPerp + 0.22) < 0.065) && Math.abs(trackAngle) < 0.92;
  const trackScrape = inWheelTrack && (nMid > 0.42);

  // Chipped paint mask inside the cross
  const paintErosion = (edgeDist < 0.065 && nMid < 0.58) || (nLow < 0.27 && nHigh < 0.48) || (trackScrape && nHigh > 0.52);
  const hasPaint = inCross && !paintErosion;

  // Coagulated blood pool & radial drag smears spilling out from the cross center and arms
  const bloodPoolShape = (1.0 - rDist * 1.05) + (nLow - 0.5) * 0.65 + (inCross ? 0.24 : 0.0);
  const dragSmear = Math.max(0, 0.72 - Math.abs(trackPerp) * 1.45) * (1.0 - Math.abs(trackAngle) * 0.85) * nMid;
  const bloodDrops = (rDist < 0.94 && spatter > 0.71 && nMid > 0.44) ? 0.55 : 0.0;
  const bloodIntensity = Math.max(bloodPoolShape * 0.85, dragSmear * 1.25, bloodDrops);
  const hasBlood = bloodIntensity > 0.37;

  if (!hasPaint && !hasBlood) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  let r, g, b, rough, ao, h;
  if (hasBlood && (!hasPaint || bloodIntensity > 0.49)) {
    // Coagulated dark arterial/venous blood pool & wet drag smear over/around the cross
    const coag = fbm(u, v, 14, 3, 1605);
    const wetCore = bloodIntensity > 0.58;
    r = wetCore ? (42 + coag * 28) : (64 + coag * 32 - nHigh * 14);
    g = wetCore ? (5 + coag * 6) : (10 + coag * 9);
    b = wetCore ? (5 + coag * 6) : (9 + coag * 8);
    // Low roughness on thick coagulated blood so flashlight gleams off it realistically while dark in shadow!
    rough = wetCore ? (36 + coag * 26) : (58 + coag * 45);
    ao = 195 + coag * 35;
    h = 0.64 + coag * 0.18;
  } else {
    // Weathered, peeling, grime-darkened dark-crimson floor stencil paint (0 emission!)
    const grime = Math.max(0, nLow - 0.42) * 1.8;
    r = 104 + (nMid - 0.5) * 24 - grime * 46;
    g = 22 + (nMid - 0.5) * 10 - grime * 11;
    b = 20 + (nMid - 0.5) * 10 - grime * 11;
    rough = 128 + grime * 65 + (nHigh - 0.5) * 28;
    ao = 220 - grime * 45;
    h = 0.56 + (edgeDist < 0.03 ? 0.08 : 0.0) - grime * 0.06;
  }

  return { r, g, b, a: 255, ao, rough, metal: 0, h };
});

// (N) Alpha-Masked Decal 6: Blood-Smeared Emergency Floor Guide Line & Stretcher Drag Trail (alphaMode: MASK, 0 emission!)
writePBRSet('decal_blood_guideline', 1024, true, (u, v) => {
  // u in [0, 1] is along the corridor length; v in [0, 1] is across the strip width
  const dy = (v - 0.5) * 2.0; // [-1, 1] across width
  const ay = Math.abs(dy);

  const nLow = fbm(u * 2.0, v, 8, 4, 1701);
  const nMid = fbm(u * 3.0, v, 20, 4, 1702);
  const nHigh = fbm(u * 4.0, v, 48, 3, 1703);
  const spatter = fbm(u * 3.0, v, 32, 3, 1704);

  // Taper off at u near 0 and 1 so strips never end with a hard rectangular cut
  const endFade = Math.min(u * 7.5, (1.0 - u) * 7.5, 1.0);

  // Worn painted dark-crimson emergency floor guide stripe in center (|dy| < 0.30) with broken stencil gaps
  const inStripeBand = ay < 0.30 && u > 0.03 && u < 0.97;
  const paintPeel = (nLow < 0.36) || (ay > 0.22 && nMid < 0.55) || (nHigh < 0.25) || (endFade < 0.45 && nMid < 0.7);
  const hasPaint = inStripeBand && !paintPeel;

  // Dual bloody stretcher wheel tracks & drag smears wavering along the guide line
  const wave = (fbm(u, 0.5, 6, 3, 1705) - 0.5) * 0.38;
  const track1 = Math.abs((dy - wave) - 0.24) < 0.095;
  const track2 = Math.abs((dy - wave) + 0.24) < 0.095;
  const centerDrag = Math.abs(dy - wave * 1.2) < (0.22 + nLow * 0.28);

  // Coagulated blood smear intensity along the line + splatter droplets outside the stripe
  let bloodVal = 0.0;
  if (centerDrag) {
    bloodVal = Math.max(bloodVal, (nLow * 0.75 + nMid * 0.45) * endFade);
  }
  if (track1 || track2) {
    bloodVal = Math.max(bloodVal, (0.42 + nMid * 0.52) * endFade);
  }
  if (ay < 0.88 && spatter > 0.70 && nMid > 0.46) {
    bloodVal = Math.max(bloodVal, 0.55 * endFade);
  }
  const hasBlood = bloodVal > 0.44;

  if (!hasPaint && !hasBlood) {
    return { r: 0, g: 0, b: 0, a: 0, ao: 255, rough: 200, metal: 0, h: 0.5 };
  }

  let r, g, b, rough, ao, h;
  if (hasBlood && (!hasPaint || bloodVal > 0.54)) {
    // Dark coagulated blood drag trail, wheel tracks, and splatter drops
    const coag = fbm(u * 2.5, v, 16, 3, 1706);
    const wet = bloodVal > 0.62;
    r = wet ? (44 + coag * 28) : (66 + coag * 30 - nHigh * 12);
    g = wet ? (5 + coag * 6) : (11 + coag * 8);
    b = wet ? (5 + coag * 6) : (10 + coag * 8);
    rough = wet ? (38 + coag * 25) : (62 + coag * 45);
    ao = 195 + coag * 35;
    h = 0.63 + coag * 0.16;
  } else {
    // Faded, scuffed dark-red painted corridor floor stripe
    const grime = Math.max(0, nLow - 0.40) * 1.85;
    r = 102 + (nMid - 0.5) * 22 - grime * 45;
    g = 22 + (nMid - 0.5) * 10 - grime * 11;
    b = 20 + (nMid - 0.5) * 10 - grime * 11;
    rough = 135 + grime * 65 + (nHigh - 0.5) * 26;
    ao = 222 - grime * 45;
    h = 0.55 - grime * 0.05;
  }

  return { r, g, b, a: 255, ao, rough, metal: 0, h };
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
fs.writeFileSync(path.join(TEX_DIR, 'CREDITS.txt'), `TacticalDark - Map5_Karantina_Hastanesi_3v3v3v3_v3 PBR Textures
CC0 Photogrammetry Textures from Poly Haven & ambientCG (shared with Map3_Col_v3 & Map4_Orman_v3):
- chipped_concrete_2k, concrete_moss_2k, concrete_road_barrier, portable_generator, Barrel_01_explosive
- wooden_military_crate, steel_frame_shelves_01, power_box_01, sandbag_burlap, tent_camo_canvas
- rusty_metal_2k, corrugated_iron_02_2k, dark_wooden_planks_2k, gravel_ground_01_2k, rock_face_01, boulder_01
- Custom procedural baked 2K/1K hospital PBR textures: hospital_vinyl_tile_2k, surgical_green_linoleum_2k,
  icu_blue_linoleum_2k, hospital_wall_plaster_2k, hospital_ceramic_tile_2k, hospital_brushed_steel_1k,
  hero_medical_enamel_2k, quarantine_yellow_tarp_1k, decal_blood_trail, decal_blood_cross, decal_blood_guideline,
  decal_hazard_stripes, decal_chemical_puddle, decal_medical_charts.
`, 'utf8');

console.log(`Successfully prepared ${allTexFiles.length} textures and ${allTexFiles.length} .import files in ${TEX_DIR}`);
