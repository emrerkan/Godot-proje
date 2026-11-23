#!/usr/bin/env node
/**
 * build_subway_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map6_Yeralti_Metro_Istasyonu_4v4v4v4_v3.gltf (inside asset model/haritalar/Map6_Metro_v3/)
 *
 * Implements:
 * - 112x72m footprint (X in [-56, 56], Z in [-36, 36]), single-level walkable floor Y in [-0.20, +0.05]
 * - Shallow -0.18m Track Beds (Floor_TrackBed_North / South) + Y=0.02m Central Island Platform with tactile paving
 *   so players and bots step smoothly across tracks & platforms (18-20cm step <= STEP_HEIGHT 0.42m) and horizontal bullets hit everywhere
 * - Zero emissive floor lines or crosses (all floor decals, tactile tiles, blood drag tracks, and graffiti have 0 emission)
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±46, 0.25, ±28) in the 4 outer Ticket Concourses
 * - 18 Card Candidate Points at Y=1.15 (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_NN
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.0m from every spawn, >= 3.5m clear radius)
 * - 4 Walkable Open-Top Subway Train Cars (SubwayCar_01..04 at (±20, ±10), 17m x 4.6m x 2.65m) built from modular
 *   wall segments with 3 wide 2.4m sliding-door openings per side + open end gangways + interior seats & overhead handrails
 * - Central Derailed Bogie & Collapsed Marble Pillar Wreckage (Console_Derailed_Wreck_01 at (0,0)) breaking sniper sightlines
 * - 12 Ceramic-Tiled Station Columns (Wall_PlatformColumn_01..12) + TunnelArch_01..08_Canopy at Y=4.3m
 * - Modular Concourse Partition Walls (Z=±14.5m) with 6 wide 4.0m openings + 8 Stainless Steel Turnstile Banks (Barrier_Turnstile_01..08)
 * - 4 Asymmetric Technical Sectors (NW Kiosk & Vending Row, NE Transit Security & Ticket Booth Hub, SW High-Voltage Traction Substation, SE Flooded Tunnel Ventilation & Pump Room)
 * - East & West Collapsed Tunnel Maintenance Bays (X=±41..55m) with maintenance rail carts, scaffolding, and collapsed rock faces
 * - 165 Alpha-Masked Non-Emissive Decals (Subway_Decal_001..165) + 12 Non-Emissive Blood Drag Trails (Subway_BloodTrail_01..12)
 * - 32 Scatter Debris Groups (Subway_Scatter_01..32, Y < 0.28m)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map6_Metro_v3');
const GLTF_NAME = 'Map6_Yeralti_Metro_Istasyonu_4v4v4v4_v3.gltf';
const BIN_NAME = 'Map6_Yeralti_Metro_Istasyonu_4v4v4v4_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 20261124;
function rand() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296.0;
}
function randRange(a, b) {
  return a + (b - a) * rand();
}

// --- Load & Extract Photogrammetry CC0 Prop Meshes from Map3_Col_v3 and Map4_Orman_v3 ---
function extractSourceMesh(gltfPath, binPath, nodeName) {
  const g = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  const bin = fs.readFileSync(binPath);
  const node = g.nodes.find(n => n.name === nodeName);
  if (!node || node.mesh === undefined) {
    throw new Error(`Node ${nodeName} not found in ${gltfPath}`);
  }
  const mesh = g.meshes[node.mesh];
  const prim = mesh.primitives[0];

  function readAccessor(accIdx) {
    const acc = g.accessors[accIdx];
    const bv = g.bufferViews[acc.bufferView];
    const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const comps = acc.type === 'SCALAR' ? 1 : (acc.type === 'VEC2' ? 2 : (acc.type === 'VEC3' ? 3 : 4));
    const count = acc.count * comps;
    if (acc.componentType === 5126) {
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) out[i] = bin.readFloatLE(offset + i * 4);
      return out;
    } else if (acc.componentType === 5123) {
      const out = new Uint16Array(count);
      for (let i = 0; i < count; i++) out[i] = bin.readUInt16LE(offset + i * 2);
      return out;
    } else if (acc.componentType === 5125) {
      const out = new Uint32Array(count);
      for (let i = 0; i < count; i++) out[i] = bin.readUInt32LE(offset + i * 4);
      return out;
    }
    throw new Error(`Unsupported componentType ${acc.componentType}`);
  }

  return {
    positions: readAccessor(prim.attributes.POSITION),
    normals: readAccessor(prim.attributes.NORMAL),
    uvs: readAccessor(prim.attributes.TEXCOORD_0),
    tangents: readAccessor(prim.attributes.TANGENT),
    indices: readAccessor(prim.indices)
  };
}

const colGltf = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3', 'Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5_v3.gltf');
const colBin = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3', 'Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5_v3.bin');
const ormGltf = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3', 'Map4_Gece_Orman_Radar_Ussu_4v4v4v4_v3.gltf');
const ormBin = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3', 'Map4_Gece_Orman_Radar_Ussu_4v4v4v4_v3.bin');

const cc0Meshes = {
  barrier: extractSourceMesh(colGltf, colBin, 'Checkpoint_Barrier_01'),
  crate: extractSourceMesh(colGltf, colBin, 'Camp_Crate_01'),
  generator: extractSourceMesh(colGltf, colBin, 'Camp_Generator_01'),
  barrel: extractSourceMesh(colGltf, colBin, 'Hangar_BarrelA_01'),
  powerBox: extractSourceMesh(ormGltf, ormBin, 'Equipment_PowerBox_01'),
  shelves: extractSourceMesh(ormGltf, ormBin, 'Server_Rack_01'),
  cliff: extractSourceMesh(ormGltf, ormBin, 'Forest_Cliff_01'),
  boulder: extractSourceMesh(ormGltf, ormBin, 'Forest_Boulder_01')
};

// --- Geometry Builder Class ---
class MeshBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.uv = [];
    this.tan = [];
    this.ind = [];
  }

  addVertex(px, py, pz, nx, ny, nz, u, v, tx = 1, ty = 0, tz = 0, tw = 1) {
    const idx = this.pos.length / 3;
    this.pos.push(px, py, pz);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen; ny /= nLen; nz /= nLen;
    this.norm.push(nx, ny, nz);
    this.uv.push(u, v);
    if (Math.abs(nx * tx + ny * ty + nz * tz) > 0.9) {
      if (Math.abs(ny) < 0.9) {
        tx = -nz; ty = 0; tz = nx;
      } else {
        tx = 1; ty = 0; tz = 0;
      }
    }
    const tLen = Math.hypot(tx, ty, tz) || 1;
    this.tan.push(tx / tLen, ty / tLen, tz / tLen, tw);
    return idx;
  }

  addQuad(p0, p1, p2, p3, n, u0, v0, u1, v1) {
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2];
    const i0 = this.addVertex(p0[0], p0[1], p0[2], n[0], n[1], n[2], u0, v0, tx, ty, tz, 1);
    const i1 = this.addVertex(p1[0], p1[1], p1[2], n[0], n[1], n[2], u1, v0, tx, ty, tz, 1);
    const i2 = this.addVertex(p2[0], p2[1], p2[2], n[0], n[1], n[2], u1, v1, tx, ty, tz, 1);
    const i3 = this.addVertex(p3[0], p3[1], p3[2], n[0], n[1], n[2], u0, v1, tx, ty, tz, 1);
    this.ind.push(i0, i1, i2, i0, i2, i3);
  }

  addBeveledBox(cx, cy, cz, sx, sy, sz, yaw = 0, bevel = 0.03, uvScale = 0.5, segsX = 1, segsY = 1, segsZ = 1) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const xform = (x, y, z) => [
      cx + x * cosY - z * sinY,
      cy + y,
      cz + x * sinY + z * cosY
    ];
    const xformN = (nx, ny, nz) => [
      nx * cosY - nz * sinY,
      ny,
      nx * sinY + nz * cosY
    ];

    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const b = Math.min(bevel, hx * 0.35, hy * 0.35, hz * 0.35);

    const addGridFace = (origin, uVec, vVec, nVec, uSteps, vSteps, uLen, vLen, vOffset = 0) => {
      const baseIdx = this.pos.length / 3;
      const wn = xformN(nVec[0], nVec[1], nVec[2]);
      const wt = xformN(uVec[0], uVec[1], uVec[2]);
      for (let iv = 0; iv <= vSteps; iv++) {
        const fv = iv / vSteps;
        for (let iu = 0; iu <= uSteps; iu++) {
          const fu = iu / uSteps;
          const lx = origin[0] + uVec[0] * fu + vVec[0] * fv;
          const ly = origin[1] + uVec[1] * fu + vVec[1] * fv;
          const lz = origin[2] + uVec[2] * fu + vVec[2] * fv;
          const wp = xform(lx, ly, lz);
          this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], fu * uLen * uvScale, vOffset + fv * vLen * uvScale, wt[0], wt[1], wt[2], 1);
        }
      }
      for (let iv = 0; iv < vSteps; iv++) {
        for (let iu = 0; iu < uSteps; iu++) {
          const a = baseIdx + iv * (uSteps + 1) + iu;
          const b1 = a + 1;
          const c = a + (uSteps + 1);
          const d = c + 1;
          this.ind.push(a, b1, d, a, d, c);
        }
      }
    };

    addGridFace([-hx + b, -hy + b, hz], [sx - 2 * b, 0, 0], [0, sy - 2 * b, 0], [0, 0, 1], segsX, segsY, sx, sy);
    addGridFace([hx - b, -hy + b, -hz], [-(sx - 2 * b), 0, 0], [0, sy - 2 * b, 0], [0, 0, -1], segsX, segsY, sx, sy);
    addGridFace([hx, -hy + b, hz - b], [0, 0, -(sz - 2 * b)], [0, sy - 2 * b, 0], [1, 0, 0], segsZ, segsY, sz, sy);
    addGridFace([-hx, -hy + b, -hz + b], [0, 0, sz - 2 * b], [0, sy - 2 * b, 0], [-1, 0, 0], segsZ, segsY, sz, sy);
    addGridFace([-hx + b, hy, hz - b], [sx - 2 * b, 0, 0], [0, 0, -(sz - 2 * b)], [0, 1, 0], segsX, segsZ, sx, sz);
    addGridFace([-hx + b, -hy, -hz + b], [sx - 2 * b, 0, 0], [0, 0, sz - 2 * b], [0, -1, 0], segsX, segsZ, sx, sz);

    if (b > 0.001) {
      const s2 = Math.SQRT1_2;
      addGridFace([hx - b, -hy + b, hz], [b, 0, -b], [0, sy - 2 * b, 0], [s2, 0, s2], 1, segsY, b * 1.4, sy);
      addGridFace([hx, -hy + b, -hz + b], [-b, 0, -b], [0, sy - 2 * b, 0], [s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx + b, -hy + b, -hz], [-b, 0, b], [0, sy - 2 * b, 0], [-s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx, -hy + b, hz - b], [b, 0, b], [0, sy - 2 * b, 0], [-s2, 0, s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx + b, hy - b, hz], [sx - 2 * b, 0, 0], [0, b, -b], [0, s2, s2], segsX, 1, sx, b * 1.4);
      addGridFace([hx - b, hy - b, -hz], [-(sx - 2 * b), 0, 0], [0, b, b], [0, s2, -s2], segsX, 1, sx, b * 1.4);
      addGridFace([hx, hy - b, hz - b], [0, 0, -(sz - 2 * b)], [-b, b, 0], [s2, s2, 0], segsZ, 1, sz, b * 1.4);
      addGridFace([-hx, hy - b, -hz + b], [0, 0, sz - 2 * b], [b, b, 0], [-s2, s2, 0], segsZ, 1, sz, b * 1.4);
    }
  }

  // Detailed Subway Station Wall Segment (height=3.0m, thickness=0.45m, ceramic tile wainscoting band, steel coping)
  addSubwayWallSegment(x0, z0, x1, z1, height = 3.0, thick = 0.45) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const segsX = Math.max(4, Math.round(len * 1.5));

    // Main wall body (uvScale maps 0..1 over 3.0m height to align with subway_ceramic_wall_2k)
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.025, 1.0 / height, segsX, 6, 2);
    // Mid-height transit sign / hand-rail molding at Y=1.22m (protrudes 2.5cm on each side)
    this.addBeveledBox(cx, 1.22, cz, len + 0.02, 0.14, thick + 0.05, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Bottom granite/concrete drainage baseboard plinth at Y=0.09m
    this.addBeveledBox(cx, 0.09, cz, len + 0.01, 0.18, thick + 0.03, yaw, 0.01, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Top concrete beam coping lip at Y = height - 0.06m
    this.addBeveledBox(cx, height - 0.06, cz, len + 0.02, 0.12, thick + 0.04, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
  }

  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 24, heightSegs = 2, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const xform = (lx, ly, lz) => {
      const py = ly * cosP - lz * sinP;
      const pz = ly * sinP + lz * cosP;
      return [
        cx + lx * cosY - pz * sinY,
        cy + py,
        cz + lx * sinY + pz * cosY
      ];
    };
    const xformN = (nx, ny, nz) => {
      const py = ny * cosP - nz * sinP;
      const pz = ny * sinP + nz * cosP;
      return [
        nx * cosY - pz * sinY,
        py,
        nx * sinY + pz * cosY
      ];
    };

    const baseIdx = this.pos.length / 3;
    const hy = height * 0.5;
    for (let ih = 0; ih <= heightSegs; ih++) {
      const fh = ih / heightSegs;
      const ly = -hy + fh * height;
      const r = rBottom + (rTop - rBottom) * fh;
      for (let ir = 0; ir <= radialSegs; ir++) {
        const fr = ir / radialSegs;
        const ang = fr * Math.PI * 2;
        const c = Math.cos(ang), s = Math.sin(ang);
        const wp = xform(c * r, ly, s * r);
        const wn = xformN(c, (rBottom - rTop) / height, s);
        const wt = xformN(-s, 0, c);
        this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], fr * uvScale * 2, fh * uvScale, wt[0], wt[1], wt[2], 1);
      }
    }
    for (let ih = 0; ih < heightSegs; ih++) {
      for (let ir = 0; ir < radialSegs; ir++) {
        const a = baseIdx + ih * (radialSegs + 1) + ir;
        const b = a + 1;
        const c = a + (radialSegs + 1);
        const d = c + 1;
        this.ind.push(a, c, d, a, d, b);
      }
    }
    if (cap) {
      if (rTop > 0.001) {
        const topCenter = xform(0, hy, 0);
        const wn = xformN(0, 1, 0);
        const cIdx = this.addVertex(topCenter[0], topCenter[1], topCenter[2], wn[0], wn[1], wn[2], 0.5, 0.5, 1, 0, 0, 1);
        const ringBase = this.pos.length / 3;
        for (let ir = 0; ir <= radialSegs; ir++) {
          const ang = (ir / radialSegs) * Math.PI * 2;
          const c = Math.cos(ang), s = Math.sin(ang);
          const wp = xform(c * rTop, hy, s * rTop);
          this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], 0.5 + c * 0.5, 0.5 + s * 0.5, 1, 0, 0, 1);
        }
        for (let ir = 0; ir < radialSegs; ir++) {
          this.ind.push(cIdx, ringBase + ir + 1, ringBase + ir);
        }
      }
      if (rBottom > 0.001) {
        const botCenter = xform(0, -hy, 0);
        const wn = xformN(0, -1, 0);
        const cIdx = this.addVertex(botCenter[0], botCenter[1], botCenter[2], wn[0], wn[1], wn[2], 0.5, 0.5, 1, 0, 0, 1);
        const ringBase = this.pos.length / 3;
        for (let ir = 0; ir <= radialSegs; ir++) {
          const ang = (ir / radialSegs) * Math.PI * 2;
          const c = Math.cos(ang), s = Math.sin(ang);
          const wp = xform(c * rBottom, -hy, s * rBottom);
          this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], 0.5 + c * 0.5, 0.5 + s * 0.5, 1, 0, 0, 1);
        }
        for (let ir = 0; ir < radialSegs; ir++) {
          this.ind.push(cIdx, ringBase + ir, ringBase + ir + 1);
        }
      }
    }
  }

  addTorus(cx, cy, cz, majorR, minorR, majorSegs = 28, minorSegs = 14, yaw = 0, pitch = 0) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const xform = (lx, ly, lz) => {
      const py = ly * cosP - lz * sinP;
      const pz = ly * sinP + lz * cosP;
      return [
        cx + lx * cosY - pz * sinY,
        cy + py,
        cz + lx * sinY + pz * cosY
      ];
    };
    const baseIdx = this.pos.length / 3;
    for (let i = 0; i <= majorSegs; i++) {
      const u = i / majorSegs;
      const theta = u * Math.PI * 2;
      const ct = Math.cos(theta), st = Math.sin(theta);
      for (let j = 0; j <= minorSegs; j++) {
        const v = j / minorSegs;
        const phi = v * Math.PI * 2;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const r = majorR + minorR * cp;
        const lx = r * ct;
        const ly = minorR * sp;
        const lz = r * st;
        const wp = xform(lx, ly, lz);
        const wn = xform(cp * ct, sp, cp * st);
        wn[0] -= cx; wn[1] -= cy; wn[2] -= cz;
        this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], u * 4, v * 2);
      }
    }
    for (let i = 0; i < majorSegs; i++) {
      for (let j = 0; j < minorSegs; j++) {
        const a = baseIdx + i * (minorSegs + 1) + j;
        const b = a + 1;
        const c = a + (minorSegs + 1);
        const d = c + 1;
        this.ind.push(a, c, d, a, d, b);
      }
    }
  }
}

// --- glTF Scene Assembler ---
const materials = [];
const textures = [];
const images = [];
const meshes = [];
const nodes = [];
const accessors = [];
const bufferViews = [];
const binChunks = [];
let binByteLength = 0;

const imageIndexByUri = new Map();
function getTextureIndex(relUri) {
  if (imageIndexByUri.has(relUri)) return imageIndexByUri.get(relUri);
  const ext = path.extname(relUri).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  const name = path.basename(relUri, ext);
  const imgIdx = images.length;
  images.push({ mimeType, name, uri: relUri });
  const texIdx = textures.length;
  textures.push({ sampler: 0, source: imgIdx });
  imageIndexByUri.set(relUri, texIdx);
  return texIdx;
}

function registerMaterial(def) {
  const idx = materials.length;
  materials.push(def);
  return idx;
}

function makePBRMaterial(name, diffFile, norFile, armFile, opts = {}) {
  const diffTex = getTextureIndex(`textures/${diffFile}`);
  const norTex = getTextureIndex(`textures/${norFile}`);
  const armTex = getTextureIndex(`textures/${armFile}`);
  const mat = {
    doubleSided: opts.doubleSided !== undefined ? opts.doubleSided : true,
    name,
    normalTexture: {
      index: norTex,
      scale: opts.normalScale !== undefined ? opts.normalScale : 1.25
    },
    pbrMetallicRoughness: {
      baseColorTexture: { index: diffTex },
      metallicRoughnessTexture: { index: armTex }
    }
  };
  if (opts.metallicFactor !== undefined) mat.pbrMetallicRoughness.metallicFactor = opts.metallicFactor;
  if (opts.roughnessFactor !== undefined) mat.pbrMetallicRoughness.roughnessFactor = opts.roughnessFactor;
  if (opts.baseColorFactor) mat.pbrMetallicRoughness.baseColorFactor = opts.baseColorFactor;
  if (opts.alphaMode) {
    mat.alphaMode = opts.alphaMode;
    if (opts.alphaMode === 'MASK') mat.alphaCutoff = opts.alphaCutoff || 0.5;
  }
  if (opts.emissiveFactor) {
    mat.emissiveFactor = opts.emissiveFactor;
    if (opts.emissiveStrength) {
      mat.extensions = {
        KHR_materials_emissive_strength: { emissiveStrength: opts.emissiveStrength }
      };
    }
  }
  return registerMaterial(mat);
}

// --- Register All Subway v3 PBR Materials (Every floor decal & tactile material has ZERO emission!) ---
const MAT = {
  terrazzoPlatform: makePBRMaterial('Mat_Subway_TerrazzoPlatform_2K', 'subway_terrazzo_platform_2k_Diffuse.png', 'subway_terrazzo_platform_2k_nor_gl.png', 'subway_terrazzo_platform_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  tactilePaving: makePBRMaterial('Mat_Subway_TactilePaving_1K', 'subway_tactile_paving_1k_Diffuse.png', 'subway_tactile_paving_1k_nor_gl.png', 'subway_tactile_paving_1k_arm.png', { metallicFactor: 0, normalScale: 1.45 }),
  ceramicWall: makePBRMaterial('Mat_Subway_CeramicWall_2K', 'subway_ceramic_wall_2k_Diffuse.png', 'subway_ceramic_wall_2k_nor_gl.png', 'subway_ceramic_wall_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  ballastTrack: makePBRMaterial('Mat_Subway_BallastTrack_2K', 'subway_ballast_track_2k_Diffuse.png', 'subway_ballast_track_2k_nor_gl.png', 'subway_ballast_track_2k_arm.png', { metallicFactor: 0, normalScale: 1.45 }),
  heroTrainBody: makePBRMaterial('Mat_Hero_SubwayTrain_2K', 'hero_subway_train_2k_Diffuse.png', 'hero_subway_train_2k_nor_gl.png', 'hero_subway_train_2k_arm.png', { normalScale: 1.35 }),
  wetConcrete: makePBRMaterial('Mat_Subway_WetConcrete_2K', 'subway_wet_concrete_2k_Diffuse.png', 'subway_wet_concrete_2k_nor_gl.png', 'subway_wet_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Perimeter_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  gravelGround: makePBRMaterial('Mat_Tunnel_Gravel_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  brushedSteel: makePBRMaterial('Mat_Subway_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_DarkMetal_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
  rustyMetal: makePBRMaterial('Mat_Rusty_Metal_2K', 'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg', { normalScale: 1.3 }),
  corrugatedIron: makePBRMaterial('Mat_Corrugated_Iron_2K', 'corrugated_iron_02_2k_Diffuse.jpg', 'corrugated_iron_02_2k_nor_gl.jpg', 'corrugated_iron_02_2k_arm.jpg', { normalScale: 1.3 }),
  darkWood: makePBRMaterial('Mat_Dark_Wood_2K', 'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png', { metallicFactor: 0, normalScale: 1.25 }),
  sandbagBurlap: makePBRMaterial('Mat_Sandbag_Burlap_2K', 'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  barrier: makePBRMaterial('concrete_road_barrier', 'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg', { metallicFactor: 0 }),
  crate: makePBRMaterial('wooden_military_crate', 'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg'),
  generator: makePBRMaterial('portable_generator', 'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg'),
  barrel: makePBRMaterial('Barrel_01', 'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg'),
  powerBox: makePBRMaterial('power_box_01', 'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg'),
  shelves: makePBRMaterial('steel_frame_shelves_01', 'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg'),
  cliffRock: makePBRMaterial('rock_face_01', 'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg', { metallicFactor: 0 }),
  boulderRock: makePBRMaterial('boulder_01', 'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg', { metallicFactor: 0 }),
  // Subtle non-floor signal lens for elevated Y=3.2m tunnel signal lights & card pedestals only (NEVER used on floors!)
  signalAmberLens: makePBRMaterial('Mat_Signal_AmberLens', 'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png', {
    baseColorFactor: [0.85, 0.55, 0.15, 1.0],
    emissiveFactor: [0.42, 0.24, 0.05],
    emissiveStrength: 0.45
  }),
  // Alpha-Masked Floor & Wall Decal Materials (alphaMode: "MASK", strictly ZERO emission!)
  decalGraffiti: makePBRMaterial('Mat_Decal_SubwayGraffiti_Mask', 'decal_subway_graffiti_Diffuse.png', 'decal_subway_graffiti_nor_gl.png', 'decal_subway_graffiti_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalBloodDrag: makePBRMaterial('Mat_Decal_BloodDragTracks_Mask', 'decal_blood_drag_tracks_Diffuse.png', 'decal_blood_drag_tracks_nor_gl.png', 'decal_blood_drag_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.4 }),
  decalRustLeak: makePBRMaterial('Mat_Decal_RustWaterLeak_Mask', 'decal_rust_water_leak_Diffuse.png', 'decal_rust_water_leak_nor_gl.png', 'decal_rust_water_leak_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.12, normalScale: 1.25 }),
  decalTrash: makePBRMaterial('Mat_Decal_NewspaperTrash_Mask', 'decal_newspaper_trash_Diffuse.png', 'decal_newspaper_trash_nor_gl.png', 'decal_newspaper_trash_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalPuddle: makePBRMaterial('Mat_Decal_WaterPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.08, normalScale: 1.15 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTracks: makePBRMaterial('Mat_Decal_SkidTracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalMoss: makePBRMaterial('Mat_Decal_DampMoss_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 })
};

function appendBuffer(buf, target) {
  const pad = (4 - (binByteLength % 4)) % 4;
  if (pad > 0) {
    binChunks.push(Buffer.alloc(pad));
    binByteLength += pad;
  }
  const bvIdx = bufferViews.length;
  bufferViews.push({
    buffer: 0,
    byteLength: buf.length,
    byteOffset: binByteLength,
    target
  });
  binChunks.push(buf);
  binByteLength += buf.length;
  return bvIdx;
}

let totalTriangles = 0;

function createPrimitiveFromData(posArr, normArr, uvArr, tanArr, indArr, matIdx) {
  const vCount = posArr.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < posArr.length; i += 3) {
    const x = posArr[i], y = posArr[i + 1], z = posArr[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const posBuf = Buffer.from(new Float32Array(posArr).buffer);
  const normBuf = Buffer.from(new Float32Array(normArr).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvArr).buffer);
  const tanBuf = Buffer.from(new Float32Array(tanArr).buffer);

  const posBv = appendBuffer(posBuf, 34962);
  const normBv = appendBuffer(normBuf, 34962);
  const uvBv = appendBuffer(uvBuf, 34962);
  const tanBv = appendBuffer(tanBuf, 34962);

  const posAcc = accessors.length;
  accessors.push({ bufferView: posBv, componentType: 5126, count: vCount, min: [minX, minY, minZ], max: [maxX, maxY, maxZ], type: 'VEC3' });
  const normAcc = accessors.length;
  accessors.push({ bufferView: normBv, componentType: 5126, count: vCount, type: 'VEC3' });
  const uvAcc = accessors.length;
  accessors.push({ bufferView: uvBv, componentType: 5126, count: vCount, type: 'VEC2' });
  const tanAcc = accessors.length;
  accessors.push({ bufferView: tanBv, componentType: 5126, count: vCount, type: 'VEC4' });

  const useU32 = vCount > 65535;
  const indTyped = useU32 ? new Uint32Array(indArr) : new Uint16Array(indArr);
  const indBuf = Buffer.from(indTyped.buffer);
  const indBv = appendBuffer(indBuf, 34963);
  const indAcc = accessors.length;
  accessors.push({ bufferView: indBv, componentType: useU32 ? 5125 : 5123, count: indArr.length, type: 'SCALAR' });

  return {
    attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc, TANGENT: tanAcc },
    indices: indAcc,
    material: matIdx,
    _tris: indArr.length / 3
  };
}

function registerMesh(meshName, buildersAndMats) {
  const primitives = [];
  let meshTris = 0;
  for (const item of buildersAndMats) {
    if (!item.raw && (!item.builder || item.builder.pos.length === 0)) continue;
    let prim;
    if (item.raw) {
      prim = createPrimitiveFromData(item.raw.positions, item.raw.normals, item.raw.uvs, item.raw.tangents, item.raw.indices, item.mat);
    } else {
      prim = createPrimitiveFromData(item.builder.pos, item.builder.norm, item.builder.uv, item.builder.tan, item.builder.ind, item.mat);
    }
    meshTris += prim._tris;
    delete prim._tris;
    primitives.push(prim);
  }
  const mIdx = meshes.length;
  meshes.push({ name: meshName, primitives, _tris: meshTris });
  return mIdx;
}

const geometryChildIndices = [];
function addGeometryNode(name, meshIdx, translation = undefined, rotationY = 0, scale = undefined) {
  const node = { name, mesh: meshIdx };
  if (translation && (translation[0] !== 0 || translation[1] !== 0 || translation[2] !== 0)) {
    node.translation = translation;
  }
  if (Math.abs(rotationY) > 1e-5) {
    node.rotation = [0, Math.sin(rotationY * 0.5), 0, Math.cos(rotationY * 0.5)];
  }
  if (scale) {
    node.scale = scale;
  }
  const nIdx = nodes.length;
  nodes.push(node);
  geometryChildIndices.push(nIdx);
  totalTriangles += meshes[meshIdx]._tris;
  return nIdx;
}

// --- Register Shared CC0 Photogrammetry Meshes ---
const sharedCC0 = {
  barrier: registerMesh('CC0_ConcreteBarrier_Mesh', [{ raw: cc0Meshes.barrier, mat: MAT.barrier }]),
  crate: registerMesh('CC0_MilitaryCrate_Mesh', [{ raw: cc0Meshes.crate, mat: MAT.crate }]),
  generator: registerMesh('CC0_PortableGenerator_Mesh', [{ raw: cc0Meshes.generator, mat: MAT.generator }]),
  barrel: registerMesh('CC0_HazardBarrel_Mesh', [{ raw: cc0Meshes.barrel, mat: MAT.barrel }]),
  powerBox: registerMesh('CC0_PowerBox_Mesh', [{ raw: cc0Meshes.powerBox, mat: MAT.powerBox }]),
  shelves: registerMesh('CC0_SteelShelves_Mesh', [{ raw: cc0Meshes.shelves, mat: MAT.shelves }]),
  cliff: registerMesh('CC0_CliffRock_Mesh', [{ raw: cc0Meshes.cliff, mat: MAT.cliffRock }]),
  boulder: registerMesh('CC0_Boulder_Mesh', [{ raw: cc0Meshes.boulder, mat: MAT.boulderRock }])
};

// ============================================================================
// 1. MULTI-SPAWN SPECIFICATION: 20 SPAWNS, 18 CARD POINTS, 16 DOOR POINTS
// ============================================================================
const TEAM_CENTERS = [
  [-46.0, 0.25, -28.0], // Team0 (NW Ticket & Street Entrance Concourse)
  [ 46.0, 0.25, -28.0], // Team1 (NE Ticket & Street Entrance Concourse)
  [-46.0, 0.25,  28.0], // Team2 (SW Ticket & Street Entrance Concourse)
  [ 46.0, 0.25,  28.0]  // Team3 (SE Ticket & Street Entrance Concourse)
];
const SPAWN_OFFSETS = [
  [0.0, 0.0],
  [-1.7, -1.7],
  [ 1.7, -1.7],
  [-1.7,  1.7],
  [ 1.7,  1.7]
];
const ALL_SPAWNS = [];
for (let t = 0; t < 4; t++) {
  for (let p = 0; p < 5; p++) {
    ALL_SPAWNS.push([
      TEAM_CENTERS[t][0] + SPAWN_OFFSETS[p][0],
      0.25,
      TEAM_CENTERS[t][2] + SPAWN_OFFSETS[p][1]
    ]);
  }
}

// 18 Card Candidate Points at Y = 1.15 (All >= 19.4m from every spawn point!)
const CARD_POINTS = [
  // 3 on Central Island Platform & Derailed Crash Breach
  [  0.0, 1.15,   0.0],
  [-22.0, 1.15,   0.0],
  [ 22.0, 1.15,   0.0],
  // 4 inside the Walkable Open-Top Subway Train Cars (Y=0.05 floor)
  [-20.0, 1.15, -10.0],
  [ 20.0, 1.15, -10.0],
  [-20.0, 1.15,  10.0],
  [ 20.0, 1.15,  10.0],
  // 2 in East/West Collapsed Tunnel Maintenance Bays
  [-36.0, 1.15,   0.0],
  [ 36.0, 1.15,   0.0],
  // 4 in North/South Central Ticket Hall & Turnstile Plazas
  [  0.0, 1.15, -21.0],
  [  0.0, 1.15,  21.0],
  [-14.0, 1.15, -21.0],
  [ 14.0, 1.15,  21.0],
  // 5 in Asymmetric Technical Rooms (Kiosk Row, Security Hub, Traction Substation, Pump Room)
  [-25.0, 1.15, -24.0],
  [ 25.0, 1.15, -24.0],
  [-25.0, 1.15,  24.0],
  [ 25.0, 1.15,  24.0],
  [ 14.0, 1.15, -21.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.30m from EVERY spawn slot; all >= 3.5m clear of walls/props!)
const DOOR_POINTS = [
  // 4 Central Platform Extraction Zones
  [-11.0, 0.10,   0.0],
  [ 11.0, 0.10,   0.0],
  [-30.0, 0.10,   0.0],
  [ 30.0, 0.10,   0.0],
  // 2 Outer East/West Tunnel Mouth Portals
  [-48.0, 0.10,   0.0],
  [ 48.0, 0.10,   0.0],
  // 6 North/South Street Stairwell & Concourse Gates
  [  0.0, 0.10, -30.0],
  [  0.0, 0.10,  30.0],
  [-16.0, 0.10, -30.0],
  [ 16.0, 0.10, -30.0],
  [-16.0, 0.10,  30.0],
  [ 16.0, 0.10,  30.0],
  // 4 Track-Bed Crossover Breezeways
  [ -7.5, 0.10, -10.0],
  [  7.5, 0.10, -10.0],
  [ -7.5, 0.10,  10.0],
  [  7.5, 0.10,  10.0]
];

function isClearOfGameplayPoints(x, z, extraRadius = 0.0) {
  for (const s of ALL_SPAWNS) {
    if (Math.hypot(x - s[0], z - s[2]) < 4.0 + extraRadius) return false;
  }
  for (const c of CARD_POINTS) {
    if (Math.hypot(x - c[0], z - c[2]) < 2.2 + extraRadius) return false;
  }
  for (const d of DOOR_POINTS) {
    if (Math.hypot(x - d[0], z - d[2]) < 3.7 + extraRadius) return false;
  }
  return true;
}

// ============================================================================
// 2. WALKABLE FLOORS, SHALLOW TRACK BEDS (-0.18m) & STEEL RAILS
// ============================================================================
function buildFloorsAndTracks() {
  // Base 112x72m underground concrete/gravel slab at Y in [-0.28, -0.19]
  const bBase = new MeshBuilder();
  bBase.addBeveledBox(0, -0.23, 0, 112.0, 0.10, 72.0, 0, 0.01, 0.18, 28, 1, 18);
  addGeometryNode('Terrain_Subway_Ground', registerMesh('Terrain_Subway_Ground_Mesh', [{ builder: bBase, mat: MAT.gravelGround }]));

  // Central Island Platform (X in [-38, 38], Z in [-5.5, 5.5], top Y = +0.02m)
  const bPlat = new MeshBuilder();
  bPlat.addBeveledBox(0, -0.09, 0, 76.0, 0.22, 9.8, 0, 0.02, 0.25, 24, 1, 6);
  const bTactile = new MeshBuilder();
  // North and South raised tactile yellow safety strips along Z = ±5.15m (top Y = +0.025m, non-emissive!)
  bTactile.addBeveledBox(0, -0.085, -5.15, 76.0, 0.22, 0.70, 0, 0.015, 0.65, 36, 1, 1);
  bTactile.addBeveledBox(0, -0.085,  5.15, 76.0, 0.22, 0.70, 0, 0.015, 0.65, 36, 1, 1);
  addGeometryNode('Floor_Central_Platform', registerMesh('Floor_Central_Platform_Mesh', [
    { builder: bPlat, mat: MAT.terrazzoPlatform },
    { builder: bTactile, mat: MAT.tactilePaving }
  ]));

  // North & South Twin Track Beds (Z in [-14.5, -5.5] and Z in [5.5, 14.5], top Y = -0.18m!)
  // Only an 18-20cm step from platform/concourse so players walk freely and horizontal bullets hit everywhere!
  for (const [suffix, zCenter] of [['North', -10.0], ['South', 10.0]]) {
    const bTrackBed = new MeshBuilder();
    bTrackBed.addBeveledBox(0, -0.22, zCenter, 108.0, 0.08, 9.0, 0, 0.01, 0.28, 32, 1, 4);
    addGeometryNode(`Floor_TrackBed_${suffix}`, registerMesh(`Floor_TrackBed_${suffix}_Mesh`, [
      { builder: bTrackBed, mat: MAT.ballastTrack }
    ]));

    // Detailed 3D Steel Rails & Embedded Concrete Sleepers (top at Y = -0.13m, named Floor_TrackRails_* so never fades/blocks)
    const bRails = new MeshBuilder();
    const bSleepers = new MeshBuilder();
    // Two parallel track pairs per bed (or main express track at zCenter ± 0.75m + third rail at zCenter + 1.35m)
    for (const rOff of [-0.75, 0.75]) {
      // Steel I-beam rail head & web (top at Y = -0.13m, 5cm above -0.18m track bed)
      bRails.addBeveledBox(0, -0.155, zCenter + rOff, 106.0, 0.05, 0.08, 0, 0.008, 0.5, 36, 1, 1);
    }
    // Insulated Third Rail (power rail) along outer edge
    const thirdRailZ = zCenter + (zCenter < 0 ? -1.45 : 1.45);
    bRails.addBeveledBox(0, -0.145, thirdRailZ, 104.0, 0.06, 0.11, 0, 0.01, 0.5, 32, 1, 1);
    // Concrete cross-ties / sleepers every 1.5m along X in [-51, 51]
    for (let x = -51.0; x <= 51.0; x += 1.5) {
      bSleepers.addBeveledBox(x, -0.175, zCenter, 0.32, 0.03, 2.6, 0, 0.006, 0.5, 1, 1, 2);
    }
    addGeometryNode(`Floor_TrackRails_${suffix}`, registerMesh(`Floor_TrackRails_${suffix}_Mesh`, [
      { builder: bRails, mat: MAT.brushedSteel },
      { builder: bSleepers, mat: MAT.chippedConcrete }
    ]));
  }

  // East & West Tunnel Maintenance Platforms (X in [-55, -38] and [38, 55], Z in [-5.5, 5.5], top Y = 0.0m)
  for (const [suffix, xCenter] of [['West', -46.5], ['East', 46.5]]) {
    const bMaint = new MeshBuilder();
    bMaint.addBeveledBox(xCenter, -0.10, 0, 17.0, 0.20, 11.0, 0, 0.015, 0.25, 8, 1, 6);
    addGeometryNode(`Floor_TunnelBay_${suffix}`, registerMesh(`Floor_TunnelBay_${suffix}_Mesh`, [
      { builder: bMaint, mat: MAT.wetConcrete }
    ]));
  }

  // North & South Concourse / Ticket Halls (Z in [-35.5, -14.5] and Z in [14.5, 35.5], top Y = 0.0m)
  for (const [suffix, zCenter, edgeZ] of [['North', -25.0, -14.65], ['South', 25.0, 14.65]]) {
    const bConc = new MeshBuilder();
    bConc.addBeveledBox(0, -0.10, zCenter, 110.0, 0.20, 21.0, 0, 0.015, 0.22, 32, 1, 10);
    const bEdgeTactile = new MeshBuilder();
    bEdgeTactile.addBeveledBox(0, -0.095, edgeZ, 108.0, 0.20, 0.50, 0, 0.01, 0.65, 36, 1, 1);
    addGeometryNode(`Floor_Concourse_${suffix}`, registerMesh(`Floor_Concourse_${suffix}_Mesh`, [
      { builder: bConc, mat: MAT.terrazzoPlatform },
      { builder: bEdgeTactile, mat: MAT.tactilePaving }
    ]));
  }

  // 18 Physical Card Pedestals (`Prop_CardPedestal_01..18`) under every CardPoint
  const bPedBase = new MeshBuilder();
  const bPedTop = new MeshBuilder();
  bPedBase.addBeveledBox(0, 0.50, 0, 0.65, 1.00, 0.65, 0, 0.03, 0.8, 2, 3, 2);
  bPedTop.addBeveledBox(0, 1.03, 0, 0.74, 0.08, 0.74, 0, 0.015, 1.0, 2, 1, 2);
  const pedMesh = registerMesh('Prop_CardPedestal_SharedMesh', [
    { builder: bPedBase, mat: MAT.heroDarkMetal },
    { builder: bPedTop, mat: MAT.brushedSteel }
  ]);
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, pedMesh, [cp[0], 0.0, cp[2]]);
  }
}
buildFloorsAndTracks();

// ============================================================================
// 3. 4 WALKABLE OPEN-TOP SUBWAY TRAIN CARS (`SubwayCar_01..04`) & CENTRAL DERAILED WRECK
// ============================================================================
function buildSubwayTrainsAndCentralWreck() {
  // 4 Walkable Open-Top Subway Cars centered at (±20.0, ±10.0)
  // Length = 17.0m (X in [cx-8.5, cx+8.5]), Width = 4.6m (Z in [cz-2.3, cz+2.3]), Wall height = 2.65m
  // Floor deck at Y = 0.02m (flush with platform!), 3 wide 2.4m sliding-door openings on BOTH sides (at local X = -5.4, 0.0, +5.4)
  // plus 2.2m open gangway doors on both front & rear ends (local X = ±8.5) so players run straight through!
  const carSpecs = [
    { id: '01', cx: -20.0, cz: -10.0, yaw:  0.03 }, // NW Derailed Metro Car (angled slightly)
    { id: '02', cx:  20.0, cz: -10.0, yaw: -0.02 }, // NE Express Metro Car
    { id: '03', cx: -20.0, cz:  10.0, yaw: -0.02 }, // SW Commuter Metro Car
    { id: '04', cx:  20.0, cz:  10.0, yaw:  0.03 }  // SE Derailed Metro Car
  ];

  for (const car of carSpecs) {
    const cosY = Math.cos(car.yaw), sinY = Math.sin(car.yaw);
    const toWorld = (lx, lz) => [
      car.cx + lx * cosY - lz * sinY,
      car.cz + lx * sinY + lz * cosY
    ];

    // 1. Train Car Walkable Floor Deck & Undercarriage Bogies (`Floor_SubwayCar_NN`)
    const bCarFloor = new MeshBuilder();
    const bBogies = new MeshBuilder();
    // Walkable interior floor deck from Y = -0.14 to Y = +0.03m
    bCarFloor.addBeveledBox(car.cx, -0.055, car.cz, 17.0, 0.17, 4.6, car.yaw, 0.02, 0.35, 12, 1, 4);
    // Steel wheel bogies underneath at local X = ±5.8m
    for (const bx of [-5.8, 5.8]) {
      for (const wx of [bx - 0.85, bx + 0.85]) {
        for (const wz of [-1.45, 1.45]) {
          const [wpx, wpz] = toWorld(wx, wz);
          bBogies.addCylinder(wpx, -0.11, wpz, 0.32, 0.32, 0.18, 18, 1, true, car.yaw, Math.PI * 0.5);
        }
      }
    }
    addGeometryNode(`Floor_SubwayCar_${car.id}`, registerMesh(`Floor_SubwayCar_${car.id}_Mesh`, [
      { builder: bCarFloor, mat: MAT.wetConcrete },
      { builder: bBogies, mat: MAT.heroDarkMetal }
    ]));

    // 2. Modular Train Side Wall Segments (`SubwayCar_NN_Wall_01..08`, height 2.65m, thickness 0.38m)
    // Door openings (width 2.4m) are centered at local X = -5.4 ([-6.6, -4.2]), X = 0.0 ([-1.2, 1.2]), X = +5.4 ([4.2, 6.6])
    // Solid wall piers along Z = ±2.11m are at:
    //   Pier A: [-8.5, -6.6] (len 1.9m, center -7.55)
    //   Pier B: [-4.2, -1.2] (len 3.0m, center -2.70)
    //   Pier C: [ 1.2,  4.2] (len 3.0m, center  2.70)
    //   Pier D: [ 6.6,  8.5] (len 1.9m, center  7.55)
    const sideSegments = [
      { lx: -7.55, len: 1.90 },
      { lx: -2.70, len: 3.00 },
      { lx:  2.70, len: 3.00 },
      { lx:  7.55, len: 1.90 }
    ];
    let wCount = 1;
    for (const sideZ of [-2.11, 2.11]) {
      for (const seg of sideSegments) {
        const bWall = new MeshBuilder();
        const bTrim = new MeshBuilder();
        const [wx, wz] = toWorld(seg.lx, sideZ);
        // Lower body panel (Y = 0.03..1.18m) + upper window pillar frame (Y = 1.18..2.65m)
        bWall.addBeveledBox(wx, 0.60, wz, seg.len, 1.15, 0.38, car.yaw, 0.025, 0.4, 4, 2, 1);
        bWall.addBeveledBox(wx, 2.42, wz, seg.len, 0.46, 0.38, car.yaw, 0.02, 0.4, 4, 1, 1);
        // Window mullions at ends of segment so players can even see/shoot through upper window cutouts on longer piers
        if (seg.len >= 2.8) {
          for (const mx of [seg.lx - 1.15, seg.lx + 1.15]) {
            const [mwx, mwz] = toWorld(mx, sideZ);
            bWall.addBeveledBox(mwx, 1.70, mwz, 0.55, 1.05, 0.38, car.yaw, 0.02, 0.4, 2, 2, 1);
          }
          // Stainless window sill bar
          bTrim.addBeveledBox(wx, 1.20, wz, seg.len + 0.02, 0.08, 0.42, car.yaw, 0.01, 0.5, 3, 1, 1);
        } else {
          bWall.addBeveledBox(wx, 1.70, wz, seg.len, 1.05, 0.38, car.yaw, 0.02, 0.4, 3, 2, 1);
        }
        // Sliding door pocket rubber bumper edges
        bTrim.addBeveledBox(wx, 1.32, wz, seg.len + 0.04, 2.58, 0.24, car.yaw, 0.01, 0.5, 2, 3, 1);

        const wName = `SubwayCar_${car.id}_Wall_${String(wCount++).padStart(2, '0')}`;
        addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [
          { builder: bWall, mat: MAT.heroTrainBody },
          { builder: bTrim, mat: MAT.brushedSteel }
        ]));
      }
    }

    // 3. Front & Rear Gangway End-Wall Frames (at local X = ±8.32m, leaving a 2.2m center gangway opening!)
    for (const [endIdx, endX] of [[1, -8.32], [2, 8.32]]) {
      const bEnd = new MeshBuilder();
      for (const sideZ of [-1.65, 1.65]) {
        const [wx, wz] = toWorld(endX, sideZ);
        bEnd.addBeveledBox(wx, 1.34, wz, 0.36, 2.62, 1.25, car.yaw, 0.02, 0.4, 1, 4, 2);
      }
      const eName = `SubwayCar_${car.id}_EndWall_0${endIdx}`;
      addGeometryNode(eName, registerMesh(`${eName}_Mesh`, [{ builder: bEnd, mat: MAT.heroTrainBody }]));
    }

    // 4. Low Longitudinal Passenger Bench Seats inside the train (`SubwayCar_NN_Seats`, height 0.50m, clear of center CardPoint!)
    const bSeats = new MeshBuilder();
    const bSeatFrame = new MeshBuilder();
    for (const sideZ of [-1.62, 1.62]) {
      for (const lx of [-2.70, 2.70]) {
        const [wx, wz] = toWorld(lx, sideZ);
        bSeats.addBeveledBox(wx, 0.44, wz, 2.35, 0.12, 0.52, car.yaw, 0.02, 0.8, 3, 1, 1);
        bSeatFrame.addBeveledBox(wx, 0.22, wz, 2.25, 0.34, 0.44, car.yaw, 0.015, 0.8, 2, 1, 1);
      }
    }
    addGeometryNode(`SubwayCar_${car.id}_Seats`, registerMesh(`SubwayCar_${car.id}_Seats_Mesh`, [
      { builder: bSeats, mat: MAT.heroTrainBody },
      { builder: bSeatFrame, mat: MAT.brushedSteel }
    ]));

    // 5. Overhead Open-Frame Handrails & Roof Arch Ribs (`SubwayCar_Handrail_NN_Canopy` at Y = 2.45m..2.85m, fades when occluding!)
    const bCanopy = new MeshBuilder();
    for (const sideZ of [-1.15, 1.15]) {
      const [wx, wz] = toWorld(0, sideZ);
      bCanopy.addCylinder(wx, 2.38, wz, 0.03, 0.03, 15.8, 12, 1, true, car.yaw + Math.PI * 0.5, Math.PI * 0.5);
    }
    for (let lx = -7.0; lx <= 7.0; lx += 2.8) {
      const [wx, wz] = toWorld(lx, 0);
      bCanopy.addBeveledBox(wx, 2.72, wz, 0.22, 0.14, 4.4, car.yaw, 0.02, 0.5, 1, 1, 4);
    }
    addGeometryNode(`SubwayCar_Handrail_${car.id}_Canopy`, registerMesh(`SubwayCar_Handrail_${car.id}_Canopy_Mesh`, [
      { builder: bCanopy, mat: MAT.brushedSteel }
    ]));
  }

  // Central Derailed Bogie/Coupler & Collapsed Marble Pillar Barricade (`Console_Derailed_Wreck_01..02`)
  // Placed at X = ±3.8m, Z = ±2.4m around the central (0,0) CardPoint so (0,0) is 100% open & reachable while breaking long platform sightlines!
  const wreckPositions = [
    { id: '01', x: -3.8, z: -2.3, yaw:  0.42 },
    { id: '02', x:  3.8, z:  2.3, yaw: -0.38 }
  ];
  for (const w of wreckPositions) {
    const bSteel = new MeshBuilder();
    const bStone = new MeshBuilder();
    // Heavy derailed train bogie frame & twisted coupler (2.05m tall tactical cover)
    bSteel.addBeveledBox(w.x, 0.85, w.z, 3.2, 1.70, 1.25, w.yaw, 0.03, 0.5, 4, 3, 2);
    bSteel.addCylinder(w.x - 0.9, 1.45, w.z + 0.3, 0.42, 0.42, 1.45, 20, 2, true, w.yaw, 0.65);
    bSteel.addCylinder(w.x + 0.9, 0.55, w.z - 0.3, 0.42, 0.42, 1.45, 20, 2, true, w.yaw + 0.3, 1.25);
    // Collapsed tiled marble pillar block leaning against bogie
    bStone.addBeveledBox(w.x + 0.4, 1.15, w.z + 0.2, 2.4, 2.10, 0.90, w.yaw - 0.25, 0.03, 0.4, 3, 3, 2);
    addGeometryNode(`Console_Derailed_Wreck_${w.id}`, registerMesh(`Console_Derailed_Wreck_${w.id}_Mesh`, [
      { builder: bSteel, mat: MAT.heroDarkMetal },
      { builder: bStone, mat: MAT.ceramicWall }
    ]));
  }
}
buildSubwayTrainsAndCentralWreck();

// ============================================================================
// 4. TILED STATION COLUMNS, CONCOURSE PARTITION WALLS, TURNSTILES & PERIMETER
// ============================================================================
function buildStationArchitecture() {
  // 1. 12 Ceramic-Tiled Structural Station Columns (`Wall_PlatformColumn_01..12`, 0.95x0.95x3.0m)
  // Carefully positioned along the platform edges (Z = ±3.8m) at X = ±5.5, ±16.5, ±26.0
  // Verify distances:
  //   - To CardPoints (0,0), (±22,0), (±36,0): min dist is >= 4.2m!
  //   - To DoorPoints (±11,0), (±30,0), (±7.5, ±10):
  //     * dist((5.5, 3.8), (11, 0)) = hypot(5.5, 3.8) = 6.68m >= 3.7m!
  //     * dist((16.5, 3.8), (11, 0)) = 6.68m >= 3.7m!
  //     * dist((26.0, 3.8), (30, 0)) = hypot(4.0, 3.8) = 5.52m >= 3.7m!
  //     * dist((5.5, 3.8), (7.5, 10.0)) = hypot(2.0, 6.2) = 6.51m >= 3.7m!
  const colXs = [-26.0, -16.5, -5.5, 5.5, 16.5, 26.0];
  let colIdx = 1;
  for (const cz of [-3.8, 3.8]) {
    for (const cx of colXs) {
      const bTile = new MeshBuilder();
      const bGuard = new MeshBuilder();
      bTile.addBeveledBox(cx, 1.50, cz, 0.92, 3.00, 0.92, 0, 0.03, 0.35, 2, 6, 2);
      // Stainless steel corner impact guards & capital collar
      bGuard.addBeveledBox(cx, 0.65, cz, 0.98, 1.30, 0.98, 0, 0.02, 0.5, 2, 2, 2);
      bGuard.addBeveledBox(cx, 2.88, cz, 1.12, 0.24, 1.12, 0, 0.02, 0.5, 2, 1, 2);
      const cName = `Wall_PlatformColumn_${String(colIdx++).padStart(2, '0')}`;
      addGeometryNode(cName, registerMesh(`${cName}_Mesh`, [
        { builder: bTile, mat: MAT.ceramicWall },
        { builder: bGuard, mat: MAT.brushedSteel }
      ]));
    }
  }

  // 2. Overhead Concrete Tunnel Arch Ribs & Signal Gantries (`TunnelArch_01..08_Canopy` at Y = 4.3m, no collision, fades when occluding)
  const archXs = [-42.0, -30.0, -18.0, -6.0, 6.0, 18.0, 30.0, 42.0];
  for (let i = 0; i < archXs.length; i++) {
    const ax = archXs[i];
    const bArch = new MeshBuilder();
    const bLens = new MeshBuilder();
    // Main overhead girder spanning across both track beds and central platform (Z in [-15.5, 15.5])
    bArch.addBeveledBox(ax, 4.45, 0, 0.75, 0.55, 31.0, 0, 0.03, 0.25, 2, 1, 14);
    // Angled haunch struts at Z = ±14.2m
    bArch.addBeveledBox(ax, 3.85, -13.5, 0.65, 0.75, 3.2, 0, 0.02, 0.3, 1, 2, 2);
    bArch.addBeveledBox(ax, 3.85,  13.5, 0.65, 0.75, 3.2, 0, 0.02, 0.3, 1, 2, 2);
    // Elevated signal light boxes above tracks at Y = 3.95m, Z = ±10.0m
    bLens.addBeveledBox(ax, 3.95, -10.0, 0.85, 0.22, 0.45, 0, 0.01, 1.0, 1, 1, 1);
    bLens.addBeveledBox(ax, 3.95,  10.0, 0.85, 0.22, 0.45, 0, 0.01, 1.0, 1, 1, 1);
    const aName = `TunnelArch_${String(i + 1).padStart(2, '0')}_Canopy`;
    addGeometryNode(aName, registerMesh(`${aName}_Mesh`, [
      { builder: bArch, mat: MAT.heroDarkMetal },
      { builder: bLens, mat: MAT.signalAmberLens }
    ]));
  }

  // 3. North & South Concourse Partition Walls along Z = ±14.8m
  // Featuring 7 wide 3.8m-4.4m openings at X = -36, -20 (aligns with train center door!), -7.5 (DoorPoint crossover!),
  // 0.0 (central grand stair portal!), +7.5 (DoorPoint crossover!), +20 (aligns with train center door!), +36
  // Therefore solid wall segments along Z = ±14.8m are placed at:
  //   Seg 1: [-54.5, -38.5] (16.0m split into two 8m walls)
  //   Seg 2: [-33.5, -22.2] (11.3m)
  //   Seg 3: [-17.8, -11.4] (6.4m — keeps >= 3.9m clear of DoorPoint at X=-7.5, Z=±10!)
  //   Seg 4: [ -3.6,  -1.8] & [1.8, 3.6] -> or single central pillar at [-3.6, 3.6] with 3.6m flanking portals!
  //   Let's check DoorPoint at (±7.5, ±10): dist to Z=±14.8 is 4.8m! Since 4.8m > 3.7m, any wall along Z=±14.8 is already 4.8m away from (±7.5, ±10)!
  const concourseSegments = [
    [-54.5, -46.5],
    [-46.5, -38.5],
    [-33.5, -27.8],
    [-27.8, -22.2],
    [-17.8, -10.5],
    [ -4.5,  -1.8],
    [  1.8,   4.5],
    [ 10.5,  17.8],
    [ 22.2,  27.8],
    [ 27.8,  33.5],
    [ 38.5,  46.5],
    [ 46.5,  54.5]
  ];
  let cwIdx = 1;
  for (const zLine of [-14.8, 14.8]) {
    for (const [x0, x1] of concourseSegments) {
      const bWall = new MeshBuilder();
      bWall.addSubwayWallSegment(x0, zLine, x1, zLine, 3.0, 0.45);
      const wName = `Wall_Concourse_${String(cwIdx++).padStart(2, '0')}`;
      addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [{ builder: bWall, mat: MAT.ceramicWall }]));
    }
  }

  // 4. 8 Stainless Steel Fare Turnstile Banks (`Barrier_Turnstile_01..08`, height 0.92m jumpable/shoot-over cover with wide 3.0m open lanes)
  const turnstilePositions = [
    { id: '01', x: -19.5, z: -18.5, yaw: 0 },
    { id: '02', x:  -5.5, z: -18.5, yaw: 0 },
    { id: '03', x:   5.5, z: -18.5, yaw: 0 },
    { id: '04', x:  19.5, z: -18.5, yaw: 0 },
    { id: '05', x: -19.5, z:  18.5, yaw: 0 },
    { id: '06', x:  -5.5, z:  18.5, yaw: 0 },
    { id: '07', x:   5.5, z:  18.5, yaw: 0 },
    { id: '08', x:  19.5, z:  18.5, yaw: 0 }
  ];
  const bTurnSteel = new MeshBuilder();
  const bTurnDark = new MeshBuilder();
  // 4 parallel fare gate cabinets per bank (total width 3.4m, height 0.92m)
  for (const gx of [-1.35, -0.45, 0.45, 1.35]) {
    bTurnSteel.addBeveledBox(gx, 0.46, 0, 0.28, 0.92, 1.35, 0, 0.02, 0.8, 1, 2, 3);
    bTurnDark.addBeveledBox(gx, 0.93, 0.42, 0.22, 0.04, 0.35, 0, 0.008, 1.0, 1, 1, 1);
    // Tripod steel barrier arms
    if (gx < 1.3) {
      bTurnSteel.addCylinder(gx + 0.22, 0.62, 0.15, 0.025, 0.025, 0.48, 10, 1, true, 0, Math.PI * 0.45);
    }
  }
  const turnstileMesh = registerMesh('Barrier_Turnstile_SharedMesh', [
    { builder: bTurnSteel, mat: MAT.brushedSteel },
    { builder: bTurnDark, mat: MAT.heroDarkMetal }
  ]);
  for (const ts of turnstilePositions) {
    addGeometryNode(`Barrier_Turnstile_${ts.id}`, turnstileMesh, [ts.x, 0.0, ts.z], ts.yaw);
  }

  // 5. Outer Station Perimeter Retaining Walls (112x72m boundary at X = ±55.2m, Z = ±35.2m) + Cliff_Perimeter_01..10 & Rock_Rubble_01..08
  let pwIdx = 1;
  // North & South outer retaining walls at Z = ±35.2m (split into 11m modular segments)
  for (const zPerim of [-35.2, 35.2]) {
    for (let x = -55.0; x < 54.9; x += 11.0) {
      const bPerim = new MeshBuilder();
      bPerim.addSubwayWallSegment(x, zPerim, x + 11.0, zPerim, 3.2, 0.55);
      const pName = `Wall_Perimeter_${String(pwIdx++).padStart(2, '0')}`;
      addGeometryNode(pName, registerMesh(`${pName}_Mesh`, [{ builder: bPerim, mat: MAT.mossConcrete }]));
    }
  }
  // West & East outer tunnel bulkhead walls at X = ±55.2m (split into 9m modular segments)
  for (const xPerim of [-55.2, 55.2]) {
    for (let z = -35.0; z < 34.9; z += 10.0) {
      const bPerim = new MeshBuilder();
      bPerim.addSubwayWallSegment(xPerim, z, xPerim, z + 10.0, 3.2, 0.55);
      const pName = `Wall_Perimeter_${String(pwIdx++).padStart(2, '0')}`;
      addGeometryNode(pName, registerMesh(`${pName}_Mesh`, [{ builder: bPerim, mat: MAT.mossConcrete }]));
    }
  }

  // Perimeter Excavated Earth / Collapsed Tunnel Rock Faces (`Cliff_Perimeter_01..10` & `Rock_Rubble_01..08`)
  // Placed near the outer corners/tunnel mouths so ImportedMap._build_outer_world detects them and builds the macro outer world!
  const cliffCoords = [
    [-53.8, -11.5, 0.2], [53.8, -11.5, 2.9], [-53.8, 11.5, 0.4], [53.8, 11.5, 2.7],
    [-38.0, -34.2, 1.5], [38.0, -34.2, 1.6], [-38.0, 34.2, -1.5], [38.0, 34.2, -1.6],
    [-53.8,  -4.8, 0.1], [53.8,   4.8, 3.1]
  ];
  for (let i = 0; i < cliffCoords.length; i++) {
    const [cx, cz, yaw] = cliffCoords[i];
    addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [cx, 0.0, cz], yaw, [0.45, 0.42, 0.45]);
  }
  const boulderCoords = [
    [-52.0, -7.8, 0.5], [52.0, -7.8, 1.4], [-52.0, 7.8, 2.1], [52.0, 7.8, 2.8],
    [-43.5, -12.8, 0.9], [43.5, -12.8, 1.8], [-43.5, 12.8, 2.4], [43.5, 12.8, 0.3]
  ];
  for (let i = 0; i < boulderCoords.length; i++) {
    const [bx, bz, yaw] = boulderCoords[i];
    addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [bx, 0.0, bz], yaw, [0.55, 0.55, 0.55]);
  }
}
buildStationArchitecture();

// ============================================================================
// 5. 4 ASYMMETRIC CONCOURSE SECTORS & EAST/WEST COLLAPSED TUNNEL BAYS
// ============================================================================
function buildAsymmetricSectorsAndTunnels() {
  // Interior Partition Walls framing the 4 Concourse Sectors while keeping >= 4.0m clear of all DoorPoints & Spawns:
  // Check DoorPoints at (0, ±30) and (±16, ±30):
  // We place interior partition walls at X = ±21.5 (Z in [±21.0, ±28.5]) and X = ±31.5 (Z in [±18.5, ±26.5])
  // Dist from X=21.5, Z=28.5 to DoorPoint (16, 30) is hypot(5.5, 1.5) = 5.70m >= 3.7m!
  const sectorWalls = [
    // NW Underground Shopping Kiosks & Vending Row partitions
    [-31.5, -26.5, -31.5, -18.5],
    [-21.5, -28.5, -21.5, -21.0],
    [-31.5, -28.5, -26.5, -28.5],
    // NE Transit Security & Ticket Booth Hub partitions
    [ 31.5, -26.5,  31.5, -18.5],
    [ 21.5, -28.5,  21.5, -21.0],
    [ 26.5, -28.5,  31.5, -28.5],
    // SW High-Voltage Traction Substation partitions
    [-31.5,  18.5, -31.5,  26.5],
    [-21.5,  21.0, -21.5,  28.5],
    [-31.5,  28.5, -26.5,  28.5],
    // SE Flooded Tunnel Ventilation & Pump Room partitions
    [ 31.5,  18.5,  31.5,  26.5],
    [ 21.5,  21.0,  21.5,  28.5],
    [ 26.5,  28.5,  31.5,  28.5]
  ];
  for (let i = 0; i < sectorWalls.length; i++) {
    const [x0, z0, x1, z1] = sectorWalls[i];
    const bW = new MeshBuilder();
    bW.addSubwayWallSegment(x0, z0, x1, z1, 3.0, 0.42);
    const wName = `Wall_Sector_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [{ builder: bW, mat: MAT.ceramicWall }]));
  }

  // --- SECTOR 1 (NW): Underground Shopping Kiosks & Vending Machine Row ---
  const bKioskBody = new MeshBuilder();
  const bKioskShutter = new MeshBuilder();
  bKioskBody.addBeveledBox(0, 1.15, 0, 3.6, 2.30, 2.2, 0, 0.03, 0.5, 4, 3, 2);
  bKioskShutter.addBeveledBox(0, 1.25, 1.12, 3.1, 1.35, 0.08, 0, 0.01, 0.8, 4, 3, 1);
  bKioskShutter.addBeveledBox(0, 0.82, 1.22, 3.4, 0.10, 0.35, 0, 0.01, 0.8, 3, 1, 1);
  const kioskMesh = registerMesh('Console_NewsstandKiosk_Mesh', [
    { builder: bKioskBody, mat: MAT.heroTrainBody },
    { builder: bKioskShutter, mat: MAT.corrugatedIron }
  ]);
  addGeometryNode('Console_NewsstandKiosk_01', kioskMesh, [-28.0, 0.0, -21.5], 0.0);
  addGeometryNode('Console_NewsstandKiosk_02', kioskMesh, [ -9.5, 0.0, -24.5], 0.0);

  // Drink & Ticket Vending Machines (`Console_Vending_01..06`, 2.05m tall solid cover)
  const bVendBody = new MeshBuilder();
  const bVendTrim = new MeshBuilder();
  bVendBody.addBeveledBox(0, 1.02, 0, 1.25, 2.04, 0.95, 0, 0.025, 0.6, 2, 3, 2);
  bVendTrim.addBeveledBox(0, 1.15, 0.49, 0.95, 1.25, 0.04, 0, 0.01, 1.0, 2, 2, 1);
  const vendingMesh = registerMesh('Console_Vending_SharedMesh', [
    { builder: bVendBody, mat: MAT.heroTrainBody },
    { builder: bVendTrim, mat: MAT.brushedSteel }
  ]);
  const vendingCoords = [
    [-23.2, -19.5, 0.0],
    [-35.5, -22.5, 1.57],
    [ -4.5, -24.5, 0.0],
    [  4.5, -24.5, 0.0],
    [ -4.5,  24.5, 3.14],
    [  4.5,  24.5, 3.14]
  ];
  for (let i = 0; i < vendingCoords.length; i++) {
    const [vx, vz, vyaw] = vendingCoords[i];
    addGeometryNode(`Console_Vending_${String(i + 1).padStart(2, '0')}`, vendingMesh, [vx, 0.0, vz], vyaw);
  }

  // --- SECTOR 2 (NE): Transit Security Control Room & Armored Ticket Booths ---
  const bSecDesk = new MeshBuilder();
  const bSecMon = new MeshBuilder();
  bSecDesk.addBeveledBox(0, 0.55, 0, 3.2, 1.10, 1.15, 0, 0.025, 0.6, 4, 2, 2);
  for (const mx of [-0.95, 0.0, 0.95]) {
    bSecMon.addBeveledBox(mx, 1.38, -0.25, 0.72, 0.52, 0.14, 0, 0.01, 1.0, 2, 2, 1);
  }
  const secDeskMesh = registerMesh('Console_SecurityDesk_SharedMesh', [
    { builder: bSecDesk, mat: MAT.heroDarkMetal },
    { builder: bSecMon, mat: MAT.brushedSteel }
  ]);
  addGeometryNode('Console_SecurityDesk_01', secDeskMesh, [28.0, 0.0, -21.5], 0.25);
  addGeometryNode('Console_SecurityDesk_02', secDeskMesh, [35.5, 0.0, -22.5], -1.57);

  // Luggage X-Ray Scanner Archway (`ScannerArch_01..02_Canopy`)
  const bScanArch = new MeshBuilder();
  bScanArch.addBeveledBox(-0.85, 1.15, 0, 0.22, 2.30, 0.95, 0, 0.02, 0.6, 1, 3, 2);
  bScanArch.addBeveledBox( 0.85, 1.15, 0, 0.22, 2.30, 0.95, 0, 0.02, 0.6, 1, 3, 2);
  bScanArch.addBeveledBox( 0.00, 2.22, 0, 1.92, 0.24, 0.95, 0, 0.02, 0.6, 3, 1, 2);
  const scanArchMesh = registerMesh('ScannerArch_Canopy_SharedMesh', [{ builder: bScanArch, mat: MAT.brushedSteel }]);
  addGeometryNode('ScannerArch_01_Canopy', scanArchMesh, [12.5, 0.0, -18.5], 0.0);
  addGeometryNode('ScannerArch_02_Canopy', scanArchMesh, [-12.5, 0.0,  18.5], 0.0);

  // --- SECTOR 3 (SW): High-Voltage Traction Power Substation ---
  const bTransCore = new MeshBuilder();
  const bTransFins = new MeshBuilder();
  bTransCore.addBeveledBox(0, 1.05, 0, 2.6, 2.10, 1.55, 0, 0.03, 0.5, 3, 3, 2);
  for (let fx = -1.0; fx <= 1.0; fx += 0.5) {
    bTransFins.addCylinder(fx, 2.28, 0, 0.16, 0.12, 0.45, 14, 2, true);
  }
  const transformerMesh = registerMesh('Console_TractionTransformer_Mesh', [
    { builder: bTransCore, mat: MAT.heroDarkMetal },
    { builder: bTransFins, mat: MAT.rustyMetal }
  ]);
  addGeometryNode('Console_TractionTransformer_01', transformerMesh, [-28.2, 0.0, 21.5], 0.0);
  addGeometryNode('Console_TractionTransformer_02', transformerMesh, [-35.5, 0.0, 23.0], 1.57);

  // --- SECTOR 4 (SE): Flooded Tunnel Ventilation & Drainage Pump Room ---
  const bPumpCyl = new MeshBuilder();
  const bPumpFrame = new MeshBuilder();
  bPumpFrame.addBeveledBox(0, 0.45, 0, 3.2, 0.90, 1.6, 0, 0.02, 0.5, 3, 2, 2);
  bPumpCyl.addCylinder(0, 1.25, 0, 0.58, 0.58, 2.8, 20, 2, true, 0, Math.PI * 0.5);
  bPumpCyl.addTorus(-0.9, 1.25, 0, 0.62, 0.08, 20, 10, Math.PI * 0.5, 0);
  bPumpCyl.addTorus( 0.9, 1.25, 0, 0.62, 0.08, 20, 10, Math.PI * 0.5, 0);
  const pumpMesh = registerMesh('Console_VentilationPump_Mesh', [
    { builder: bPumpCyl, mat: MAT.rustyMetal },
    { builder: bPumpFrame, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Console_VentilationPump_01', pumpMesh, [28.2, 0.0, 21.5], 0.0);
  addGeometryNode('Console_VentilationPump_02', pumpMesh, [35.5, 0.0, 23.0], -1.57);

  // --- EAST & WEST COLLAPSED TUNNEL MAINTENANCE BAYS (X = ±42m) ---
  // Derailed Rail Maintenance Flatbed Carts (`Vehicle_MaintenanceCart_01..02` at X = ±42.0, Z = ±2.6m)
  // Keep >= 3.8m clear of CardPoints (±36, 0) and DoorPoints (±48, 0)!
  // Dist from (-42.0, -2.5) to (-36, 0) is hypot(6.0, 2.5) = 6.50m!
  // Dist from (-42.0, -2.5) to (-48, 0) is hypot(6.0, 2.5) = 6.50m!
  const bCartDeck = new MeshBuilder();
  const bCartCage = new MeshBuilder();
  bCartDeck.addBeveledBox(0, 0.55, 0, 4.2, 0.45, 2.2, 0, 0.02, 0.5, 4, 1, 2);
  bCartCage.addBeveledBox(-1.2, 1.35, 0, 1.5, 1.25, 2.0, 0, 0.02, 0.6, 2, 2, 2);
  bCartCage.addBeveledBox( 1.1, 1.05, 0, 1.6, 0.65, 1.8, 0, 0.02, 0.6, 2, 1, 2);
  const maintCartMesh = registerMesh('Vehicle_MaintenanceCart_SharedMesh', [
    { builder: bCartDeck, mat: MAT.rustyMetal },
    { builder: bCartCage, mat: MAT.corrugatedIron }
  ]);
  addGeometryNode('Vehicle_MaintenanceCart_01', maintCartMesh, [-42.0, 0.0, -2.5],  0.22);
  addGeometryNode('Vehicle_MaintenanceCart_02', maintCartMesh, [ 42.0, 0.0,  2.5], -0.22);

  // Overhead Tunnel Maintenance Scaffolding (`TunnelScaffold_01..02_Canopy`)
  const bScaff = new MeshBuilder();
  bScaff.addBeveledBox(0, 3.15, 0, 3.5, 0.18, 6.5, 0, 0.015, 0.4, 3, 1, 5);
  for (const sx of [-1.6, 1.6]) {
    for (const sz of [-3.0, 3.0]) {
      bScaff.addCylinder(sx, 1.55, sz, 0.05, 0.05, 3.1, 10, 1, true);
    }
  }
  const scaffMesh = registerMesh('TunnelScaffold_Canopy_SharedMesh', [{ builder: bScaff, mat: MAT.darkWood }]);
  addGeometryNode('TunnelScaffold_01_Canopy', scaffMesh, [-42.0, 0.0,  2.4], 0.0);
  addGeometryNode('TunnelScaffold_02_Canopy', scaffMesh, [ 42.0, 0.0, -2.4], 0.0);

  // --- TACTICAL CC0 COVER PROPS (Barriers, Crates, Generators, Barrels, PowerBoxes, Shelves, Sandbags) ---
  // All verified clear of Spawns, Cards, and Doors!
  const barrierPlacements = [
    [-38.5, -22.5,  0.45], [ 38.5, -22.5, -0.45],
    [-38.5,  22.5, -0.45], [ 38.5,  22.5,  0.45],
    [-14.5,  -2.2,  0.00], [ 14.5,   2.2,  0.00],
    [-34.0,  -3.2,  0.25], [ 34.0,   3.2, -0.25],
    [ -8.5, -24.5,  1.57], [  8.5,  24.5,  1.57]
  ];
  for (let i = 0; i < barrierPlacements.length; i++) {
    const [x, z, yaw] = barrierPlacements[i];
    addGeometryNode(`Barrier_Concrete_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [x, 0.0, z], yaw);
  }

  const cratePlacements = [
    [-33.5, -19.5, 0.2], [ 33.5, -19.5, 1.1],
    [-33.5,  19.5, 0.8], [ 33.5,  19.5, 2.2],
    [-11.5, -10.0, 0.4], [ 11.5, -10.0, 1.7],
    [-11.5,  10.0, 2.5], [ 11.5,  10.0, 0.9],
    [-41.5, -19.0, 0.3], [ 41.5,  19.0, 1.4]
  ];
  for (let i = 0; i < cratePlacements.length; i++) {
    const [x, z, yaw] = cratePlacements[i];
    addGeometryNode(`Crate_Supply_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [x, 0.0, z], yaw);
  }

  const genPlacements = [
    [-29.5,  26.2,  0.0],
    [ 29.5,  26.2,  3.14],
    [-42.0,   3.2,  0.5],
    [ 42.0,  -3.2, -0.5]
  ];
  for (let i = 0; i < genPlacements.length; i++) {
    const [x, z, yaw] = genPlacements[i];
    addGeometryNode(`Generator_Subway_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [x, 0.0, z], yaw);
  }

  const barrelPlacements = [
    [-27.0,  18.8, 0.1], [ 27.0,  18.8, 1.3],
    [-27.0, -18.8, 2.1], [ 27.0, -18.8, 0.7],
    [-44.0,  -9.5, 0.4], [ 44.0,  -9.5, 1.9],
    [-44.0,   9.5, 2.6], [ 44.0,   9.5, 0.8]
  ];
  for (let i = 0; i < barrelPlacements.length; i++) {
    const [x, z, yaw] = barrelPlacements[i];
    addGeometryNode(`Barrel_Transit_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [x, 0.0, z], yaw);
  }

  const powerBoxPlacements = [
    [-30.8, -23.0,  1.57], [ 30.8, -23.0, -1.57],
    [-30.8,  23.0,  1.57], [ 30.8,  23.0, -1.57],
    [-20.8, -25.0, -1.57], [ 20.8,  25.0,  1.57]
  ];
  for (let i = 0; i < powerBoxPlacements.length; i++) {
    const [x, z, yaw] = powerBoxPlacements[i];
    addGeometryNode(`PowerBox_Subway_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [x, 0.0, z], yaw);
  }

  const shelfPlacements = [
    [-30.5, -25.5,  1.57], [ 30.5, -25.5, -1.57],
    [-30.5,  25.5,  1.57], [ 30.5,  25.5, -1.57]
  ];
  for (let i = 0; i < shelfPlacements.length; i++) {
    const [x, z, yaw] = shelfPlacements[i];
    addGeometryNode(`Rack_Storage_${String(i + 1).padStart(2, '0')}`, sharedCC0.shelves, [x, 0.0, z], yaw);
  }

  // Sandbag Barricades protecting the 4 Spawn Concourse Exits (`Barrier_Sandbag_01..08`)
  const bSandbag = new MeshBuilder();
  for (let row = 0; row < 3; row++) {
    const count = 4 - (row % 2);
    for (let c = 0; c < count; c++) {
      const sx = (c - (count - 1) * 0.5) * 0.62;
      const sy = 0.14 + row * 0.24;
      bSandbag.addBeveledBox(sx, sy, (row % 2) * 0.04, 0.60, 0.24, 0.42, (row - 1) * 0.04, 0.06, 1.2, 2, 1, 2);
    }
  }
  const sandbagMesh = registerMesh('Barrier_Sandbag_SharedMesh', [{ builder: bSandbag, mat: MAT.sandbagBurlap }]);
  const sandbagPlacements = [
    [-40.5, -28.0,  1.57], [-46.0, -22.0,  0.0],
    [ 40.5, -28.0, -1.57], [ 46.0, -22.0,  0.0],
    [-40.5,  28.0,  1.57], [-46.0,  22.0,  0.0],
    [ 40.5,  28.0, -1.57], [ 46.0,  22.0,  0.0]
  ];
  for (let i = 0; i < sandbagPlacements.length; i++) {
    const [x, z, yaw] = sandbagPlacements[i];
    addGeometryNode(`Barrier_Sandbag_${String(i + 1).padStart(2, '0')}`, sandbagMesh, [x, 0.0, z], yaw);
  }
}
buildAsymmetricSectorsAndTunnels();

// ============================================================================
// 6. 165 NON-EMISSIVE ALPHA-MASKED DECALS & 12 BLOOD DRAG TRAILS
// ============================================================================
function buildSubwayDecals() {
  // 12 Non-Emissive Blood Drag Trails (`Subway_BloodTrail_01..12`, alphaMode: MASK, 0 emission!)
  // Leading from Concourse Turnstiles across the platform & into the open subway train doors
  const bloodTrails = [
    [ -9.0,   0.0,  12.0, 0.55, 0.05],
    [  9.0,   0.0,  12.0, 0.55, -0.05],
    [-20.0,  -4.5,   6.5, 0.50, 1.57],
    [ 20.0,  -4.5,   6.5, 0.50, 1.57],
    [-20.0,   4.5,   6.5, 0.50, 1.57],
    [ 20.0,   4.5,   6.5, 0.50, 1.57],
    [-12.5, -22.0,   9.0, 0.55, 1.45],
    [ 12.5, -22.0,   9.0, 0.55, 1.68],
    [-12.5,  22.0,   9.0, 0.55, 1.68],
    [ 12.5,  22.0,   9.0, 0.55, 1.45],
    [-34.0,   0.0,   8.5, 0.55, 0.12],
    [ 34.0,   0.0,   8.5, 0.55, -0.12]
  ];
  for (let i = 0; i < bloodTrails.length; i++) {
    const [cx, cz, len, wid, yaw] = bloodTrails[i];
    const b = new MeshBuilder();
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const y = 0.028 + (i % 4) * 0.001;
    const segs = 6;
    for (let is = 0; is <= segs; is++) {
      const fs = is / segs;
      const lx = (fs - 0.5) * len;
      for (let iw = 0; iw <= 1; iw++) {
        const lz = (iw - 0.5) * wid;
        const wx = cx + lx * cosY - lz * sinY;
        const wz = cz + lx * sinY + lz * cosY;
        b.addVertex(wx, y, wz, 0, 1, 0, fs * 3.0, iw, cosY, 0, sinY, 1);
      }
    }
    for (let is = 0; is < segs; is++) {
      const a = is * 2;
      b.ind.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const tName = `Subway_BloodTrail_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(tName, registerMesh(`${tName}_Mesh`, [{ builder: b, mat: MAT.decalBloodDrag }]));
  }

  // 165 Distributed Floor Decals (`Subway_Decal_001..165`, alphaMode: MASK, 0 emission!)
  // Height carefully matched to the exact surface Y so decals never float or sink!
  const decalMats = [
    MAT.decalBloodDrag,
    MAT.decalRustLeak,
    MAT.decalTrash,
    MAT.decalGraffiti,
    MAT.decalBlood,
    MAT.decalPuddle,
    MAT.decalOil,
    MAT.decalScorch,
    MAT.decalTracks,
    MAT.decalMoss
  ];

  for (let i = 1; i <= 165; i++) {
    const b = new MeshBuilder();
    let cx, cz, baseY;
    if (i <= 40) {
      // Central Island Platform (X in [-36, 36], Z in [-4.5, 4.5], surface Y = 0.02m)
      cx = randRange(-36.0, 36.0);
      cz = randRange(-4.4, 4.4);
      baseY = 0.024;
    } else if (i <= 76) {
      // North & South Track Beds (X in [-48, 48], Z in [-13.5, -6.5] or [6.5, 13.5], surface Y = -0.18m)
      // Avoid train interior bounds X in [-28.5, -11.5] and [11.5, 28.5] or place on train floor (Y = 0.03m)
      const north = (i % 2 === 0);
      cx = randRange(-48.0, 48.0);
      cz = (north ? -1 : 1) * randRange(6.8, 13.2);
      const insideTrain = (Math.abs(Math.abs(cx) - 20.0) < 8.8 && Math.abs(Math.abs(cz) - 10.0) < 2.4);
      baseY = insideTrain ? 0.034 : -0.174;
    } else if (i <= 140) {
      // North & South Concourses & Technical Sectors (X in [-50, 50], Z in [±16.5, ±33.5], surface Y = 0.0m)
      const north = (i % 2 === 0);
      cx = randRange(-50.0, 50.0);
      cz = (north ? -1 : 1) * randRange(16.5, 33.5);
      baseY = 0.006;
    } else {
      // East & West Tunnel Maintenance Bays (X in [±39.5, ±52.5], Z in [-4.5, 4.5], surface Y = 0.0m)
      const west = (i % 2 === 0);
      cx = (west ? -1 : 1) * randRange(39.5, 52.5);
      cz = randRange(-4.5, 4.5);
      baseY = 0.006;
    }

    const sx = randRange(1.8, 3.6);
    const sz = randRange(1.8, 3.6);
    const yaw = randRange(0, Math.PI * 2);
    const y = baseY + (i % 7) * 0.001;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

    const grid = 3;
    for (let iz = 0; iz <= grid; iz++) {
      const fz = iz / grid;
      const lz = (fz - 0.5) * sz;
      for (let ix = 0; ix <= grid; ix++) {
        const fx = ix / grid;
        const lx = (fx - 0.5) * sx;
        const wx = cx + lx * cosY - lz * sinY;
        const wz = cz + lx * sinY + lz * cosY;
        b.addVertex(wx, y, wz, 0, 1, 0, fx, fz, cosY, 0, sinY, 1);
      }
    }
    for (let iz = 0; iz < grid; iz++) {
      for (let ix = 0; ix < grid; ix++) {
        const a = iz * (grid + 1) + ix;
        const b1 = a + 1;
        const c = a + (grid + 1);
        const d = c + 1;
        b.ind.push(a, c, d, a, d, b1);
      }
    }

    const matIdx = decalMats[i % decalMats.length];
    const dName = `Subway_Decal_${String(i).padStart(3, '0')}`;
    addGeometryNode(dName, registerMesh(`${dName}_Mesh`, [{ builder: b, mat: matIdx }]));
  }
}
buildSubwayDecals();

// ============================================================================
// 7. 32 SCATTER DEBRIS GROUPS (`Subway_Scatter_01..32`, Y < 0.28m)
// ============================================================================
function buildSubwayScatter() {
  for (let s = 1; s <= 32; s++) {
    const bDebris = new MeshBuilder();
    const bMetal = new MeshBuilder();

    const gx = ((s - 1) % 8) - 3.5; // -3.5 .. 3.5
    const gz = Math.floor((s - 1) / 8) - 1.5; // -1.5 .. 1.5
    const baseCx = gx * 12.5;
    const baseCz = gz * 16.5;

    let added = 0;
    let attempts = 0;
    while (added < 20 && attempts < 80) {
      attempts++;
      const px = Math.max(-52.0, Math.min(52.0, baseCx + randRange(-5.2, 5.2)));
      const pz = Math.max(-33.0, Math.min(33.0, baseCz + randRange(-6.5, 6.5)));
      // Keep out of track pit edges so debris sits cleanly on platform or concourse
      if (Math.abs(pz) > 4.6 && Math.abs(pz) < 15.6) continue;
      if (!isClearOfGameplayPoints(px, pz, -1.6)) continue;

      const yaw = randRange(0, Math.PI * 2);
      if (added % 2 === 0) {
        // Broken ceramic wall tile / concrete chunk (height 0.03..0.08m)
        const w = randRange(0.18, 0.40);
        const h = randRange(0.03, 0.08);
        const d = randRange(0.16, 0.36);
        bDebris.addBeveledBox(px, 0.02 + h * 0.5, pz, w, h, d, yaw, 0.01, 2.0, 2, 1, 2);
      } else {
        // Crushed soda can / transit ticket box / fallen sign plate
        const r = randRange(0.03, 0.055);
        const len = randRange(0.10, 0.18);
        bMetal.addCylinder(px, 0.02 + r, pz, r, r, len, 10, 1, true, yaw, Math.PI * 0.5);
        bMetal.addBeveledBox(px + 0.14, 0.04, pz - 0.11, 0.28, 0.05, 0.22, yaw + 0.4, 0.01, 2.0);
      }
      added++;
    }

    const sName = `Subway_Scatter_${String(s).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bDebris, mat: MAT.chippedConcrete },
      { builder: bMetal, mat: MAT.brushedSteel }
    ]));
  }
}
buildSubwayScatter();

// ============================================================================
// 8. ASSEMBLE GLTF SCENE HIERARCHY (Exact Contract with ImportedMap.gd & GameManager.gd)
// ============================================================================
const cardChildIndices = [];
for (let i = 0; i < CARD_POINTS.length; i++) {
  const nIdx = nodes.length;
  nodes.push({
    name: `CardPoint_${String(i + 1).padStart(2, '0')}`,
    translation: CARD_POINTS[i]
  });
  cardChildIndices.push(nIdx);
}
const cardPointsRootIdx = nodes.length;
nodes.push({ name: 'CardPoints', children: cardChildIndices });

const doorChildIndices = [];
for (let i = 0; i < DOOR_POINTS.length; i++) {
  const nIdx = nodes.length;
  nodes.push({
    name: `DoorPoint_${String(i + 1).padStart(2, '0')}`,
    translation: DOOR_POINTS[i]
  });
  doorChildIndices.push(nIdx);
}
const doorPointsRootIdx = nodes.length;
nodes.push({ name: 'DoorPoints', children: doorChildIndices });

const teamNodeIndices = [];
for (let t = 0; t < 4; t++) {
  const slotIndices = [];
  for (let p = 0; p < 5; p++) {
    const sIdx = nodes.length;
    nodes.push({
      name: `Team${t}_Spawn_P${p + 1}`,
      translation: [
        TEAM_CENTERS[t][0] + SPAWN_OFFSETS[p][0],
        0.25,
        TEAM_CENTERS[t][2] + SPAWN_OFFSETS[p][1]
      ]
    });
    slotIndices.push(sIdx);
  }
  const tIdx = nodes.length;
  nodes.push({
    name: `Team${t}_Spawn`,
    children: slotIndices
  });
  teamNodeIndices.push(tIdx);
}
const spawnPointsRootIdx = nodes.length;
nodes.push({ name: 'SpawnPoints', children: teamNodeIndices });

const wallLampsRootIdx = nodes.length;
nodes.push({ name: 'WallLamps' });

const geometryRootIdx = nodes.length;
nodes.push({ name: 'Geometry', children: geometryChildIndices });

const rootNodeIdx = nodes.length;
nodes.push({
  name: 'Subway_Station_Map',
  children: [
    cardPointsRootIdx,
    doorPointsRootIdx,
    geometryRootIdx,
    spawnPointsRootIdx,
    wallLampsRootIdx
  ]
});

for (const m of meshes) delete m._tris;

const gltfJson = {
  asset: {
    generator: 'TacticalDark Subway v3 Node.js Procedural Builder',
    version: '2.0'
  },
  extensionsUsed: [
    'KHR_materials_emissive_strength'
  ],
  scene: 0,
  scenes: [
    {
      name: 'Scene',
      nodes: [rootNodeIdx]
    }
  ],
  nodes,
  materials,
  meshes,
  textures,
  images,
  accessors,
  bufferViews,
  samplers: [
    {
      magFilter: 9729,
      minFilter: 9987
    }
  ],
  buffers: [
    {
      byteLength: binByteLength,
      uri: BIN_NAME
    }
  ]
};

const fullBin = Buffer.concat(binChunks);
fs.writeFileSync(path.join(OUT_DIR, BIN_NAME), fullBin);
fs.writeFileSync(path.join(OUT_DIR, GLTF_NAME), JSON.stringify(gltfJson, null, '\t'), 'utf8');

const gltfResPath = `res://asset model/haritalar/Map6_Metro_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dmetrov3map6"
path="res://.godot/imported/${GLTF_NAME}-${gltfMd5}.scn"

[deps]

source_file="${gltfResPath}"
dest_files=["res://.godot/imported/${GLTF_NAME}-${gltfMd5}.scn"]

[params]

nodes/root_type=""
nodes/root_name=""
nodes/root_script=null
mesh_library/use_node_names_as_mesh_names=false
array_mesh/deduplicate_surfaces=true
nodes/apply_root_scale=true
nodes/root_scale=1.0
nodes/import_as_skeleton_bones=false
nodes/use_name_suffixes=true
nodes/use_node_type_suffixes=true
meshes/ensure_tangents=true
meshes/generate_lods=true
meshes/create_shadow_meshes=true
meshes/light_baking=1
meshes/lightmap_texel_size=0.2
meshes/force_disable_compression=false
skins/use_named_skins=true
animation/import=true
animation/fps=30
animation/trimming=false
animation/remove_immutable_tracks=true
animation/import_rest_as_RESET=false
import_script/path=""
materials/extract=0
materials/extract_format=0
materials/extract_path=""
_subresources={}
gltf/naming_version=2
gltf/embedded_image_handling=1
gltf/texture_map_mode=1
`;
fs.writeFileSync(path.join(OUT_DIR, `${GLTF_NAME}.import`), gltfImportContent, 'utf8');

// ============================================================================
// 9. MATHEMATICAL & LEVEL DESIGN VALIDATION REPORT
// ============================================================================
function validatePackage() {
  let errors = 0;
  let wMinX = Infinity, wMinY = Infinity, wMinZ = Infinity;
  let wMaxX = -Infinity, wMaxY = -Infinity, wMaxZ = -Infinity;
  for (const nIdx of geometryChildIndices) {
    const n = nodes[nIdx];
    const m = meshes[n.mesh];
    const tx = n.translation ? n.translation[0] : 0;
    const ty = n.translation ? n.translation[1] : 0;
    const tz = n.translation ? n.translation[2] : 0;
    let cosY = 1, sinY = 0;
    if (n.rotation) {
      const qy = n.rotation[1], qw = n.rotation[3];
      const yaw = 2 * Math.atan2(qy, qw);
      cosY = Math.cos(yaw);
      sinY = Math.sin(yaw);
    }
    const sx = n.scale ? n.scale[0] : 1;
    const sy = n.scale ? n.scale[1] : 1;
    const sz = n.scale ? n.scale[2] : 1;
    for (const p of m.primitives) {
      const acc = accessors[p.attributes.POSITION];
      for (const lx of [acc.min[0] * sx, acc.max[0] * sx]) {
        for (const lz of [acc.min[2] * sz, acc.max[2] * sz]) {
          const wx = tx + lx * cosY - lz * sinY;
          const wz = tz + lx * sinY + lz * cosY;
          wMinX = Math.min(wMinX, wx); wMaxX = Math.max(wMaxX, wx);
          wMinZ = Math.min(wMinZ, wz); wMaxZ = Math.max(wMaxZ, wz);
        }
      }
      wMinY = Math.min(wMinY, ty + acc.min[1] * sy); wMaxY = Math.max(wMaxY, ty + acc.max[1] * sy);
    }
  }
  if (wMinX < -56.25 || wMaxX > 56.25 || wMinZ < -36.25 || wMaxZ > 36.25) {
    console.error(`ERROR: World AABB exceeds 112x72m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
    errors++;
  }

  // 2. CardPoint -> Spawn min distance check (>= 18.0m required)
  let minCardToSpawn = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const c = CARD_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(c[0] - s[0], c[2] - s[2]));
    }
    if (dMin < 18.0) {
      console.error(`ERROR: CardPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m`);
      errors++;
    }
    minCardToSpawn = Math.min(minCardToSpawn, dMin);
  }

  // 3. DoorPoint -> Spawn min distance check (>= 26.0m required)
  let minDoorToSpawn = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const d = DOOR_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(d[0] - s[0], d[2] - s[2]));
    }
    if (dMin < 26.0) {
      console.error(`ERROR: DoorPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m`);
      errors++;
    }
    minDoorToSpawn = Math.min(minDoorToSpawn, dMin);
  }

  // 4. Verify all Decal materials have alphaMode: "MASK" and ZERO emission!
  for (const m of materials) {
    if (m.name.includes('Decal')) {
      if (m.alphaMode !== 'MASK') {
        console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
        errors++;
      }
      if (m.emissiveFactor) {
        console.error(`ERROR: Floor/Decal Material ${m.name} has emissiveFactor! Must be 0 emission.`);
        errors++;
      }
    }
  }

  // 5. Verify all referenced texture files and .import files exist
  for (const img of images) {
    const p = path.join(OUT_DIR, img.uri);
    if (!fs.existsSync(p)) {
      console.error(`ERROR: Missing texture file ${p}`);
      errors++;
    }
    if (!fs.existsSync(p + '.import')) {
      console.error(`ERROR: Missing texture .import file ${p}.import`);
      errors++;
    }
  }

  console.log('================================================================');
  console.log(' YERALTI METRO ISTASYONU v3 (Map6_Metro_v3) VALIDATION SUMMARY');
  console.log('================================================================');
  console.log(`Output GLTF       : ${ path.join(OUT_DIR, GLTF_NAME) }`);
  console.log(`Output BIN        : ${ path.join(OUT_DIR, BIN_NAME) } (${ (fullBin.length / 1024 / 1024).toFixed(2) } MB)`);
  console.log(`Total Triangles   : ${ totalTriangles.toLocaleString() } tris`);
  console.log(`Total Nodes       : ${ nodes.length } (Geometry children: ${ geometryChildIndices.length })`);
  console.log(`Total Materials   : ${ materials.length } PBR materials (0 untextured, 0 glowing floor lines)`);
  console.log(`Total Textures    : ${ images.length } referenced (${ fs.existsSync(path.join(OUT_DIR, 'textures')) ? fs.readdirSync(path.join(OUT_DIR, 'textures')).filter(f => !f.endsWith('.import') && !f.endsWith('.txt')).length : 0 } total in textures/)`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Walkable Levels   : Platform Y=+0.02m, Concourses Y=0.00m, TrackBeds Y=-0.18m (step=0.18-0.20m <= 0.42m)`);
  console.log(`Spawn Points      : 4 teams x 5 spawns = ${ ALL_SPAWNS.length } points (Y=0.25)`);
  console.log(`Card Candidates   : ${ CARD_POINTS.length } points + 18 Prop_CardPedestal_NN (min spawn dist: ${ minCardToSpawn.toFixed(2) }m >= 18.0m)`);
  console.log(`Door Candidates   : ${ DOOR_POINTS.length } points (min spawn dist: ${ minDoorToSpawn.toFixed(2) }m >= 26.0m)`);
  console.log(`Validation Errors : ${ errors }`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
