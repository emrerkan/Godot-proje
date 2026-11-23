#!/usr/bin/env node
/**
 * build_maze_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map0_Klasik_Labirent_5v5v5v5_v3.gltf (inside asset model/haritalar/Map0_Labirent_v3/)
 *
 * Implements:
 * - Iconic 124x92m footprint (X in [-62, 62], Z in [-46, 46]), full 5v5v5v5 (20 players)
 * - Strictly single-level walkable floor heights Y in [-0.02, +0.015] for 100% BotNav & horizontal gunplay
 * - ZERO emissive surfaces across all materials (pitch-dark Cold-War bunker where flashlight is king!)
 * - 100% Modular Occlusion-Friendly Heavy Bunker Walls (6-11.5m segments, height 3.0m, thickness 1.2m
 *   with beveled armor chamfers, concrete plinth, mid-wall conduit channel, top steel coping, and pilasters)
 * - 5 Visually Distinct Labyrinth Zones:
 *   * Center — Command War-Room Nexus (Steel grate floor, octagonal armored Console_CommandNexus_01,
 *     4 open blast-door corridors, overhead BunkerPipes_Center_01..04_Canopy at Y=3.8m)
 *   * NW Quadrant — Armory & Munitions Vault Maze (Board-formed concrete walls, weapon crate alcoves,
 *     sandbag choke points, steel ammunition racks)
 *   * NE Quadrant — Power & Diesel Generator Catacombs (Steel grate corridors, heavy diesel generators,
 *     power breaker panels, overhead BunkerPipes_NE_01..04_Canopy)
 *   * SW Quadrant — Old Brick Cistern & Drainage Tunnels (Damp subterranean brick walls, cistern pumps,
 *     drain grates, wet chemical/water puddles, moss patches)
 *   * SE Quadrant — Blast-Door Communications & Archive Maze (Riveted steel bulkhead walls, server/archive
 *     shelves, overhead BlastFrame_01..06_Canopy at Y=3.1m, sandbag firing posts)
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±52.0, 0.25, ±36.0) with (±1.7, ±1.7) spread (NO Pad_Team meshes!)
 * - 18 Card Candidate Points at Y=1.15 (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.5m from every spawn, >= 3.6m clear radius)
 * - 165 Alpha-Masked Floor Decals (Maze_Decal_001..165) + 12 Blood & Shell Casing Trails (Maze_BloodTrail_01..12)
 * - 32 Low-Profile Scatter Debris Groups (Maze_Scatter_01..32, Y < 0.26m)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map0_Labirent_v3');
const GLTF_NAME = 'Map0_Klasik_Labirent_5v5v5v5_v3.gltf';
const BIN_NAME = 'Map0_Klasik_Labirent_5v5v5v5_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112300;
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

  addBeveledBox(cx, cy, cz, sx, sy, sz, yaw = 0, bevel = 0.04, uvScale = 0.5, segsX = 1, segsY = 1, segsZ = 1) {
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

  // Heavy Cold-War Bunker Wall Segment (height=3.0m, thickness=1.2m, beveled armor chamfers, base plinth, top steel coping)
  addBunkerWallSegment(x0, z0, x1, z1, height = 3.0, thick = 1.2) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const segsX = Math.max(3, Math.round(len * 0.8));

    // Main reinforced bunker concrete/steel wall body (chamfered armor bevel)
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.08, 1.0 / height, segsX, 4, 2);
    // Heavy chamfered base plinth at Y=0.14m
    this.addBeveledBox(cx, 0.14, cz, len + 0.02, 0.28, thick + 0.08, yaw, 0.03, 0.5, Math.max(2, Math.round(len * 0.5)), 1, 1);
    // Mid-wall blast-channel & conduit belt at Y=1.32m
    this.addBeveledBox(cx, 1.32, cz, len + 0.01, 0.16, thick + 0.05, yaw, 0.02, 0.5, Math.max(2, Math.round(len * 0.5)), 1, 1);
    // Top steel/rebar coping cap at Y=height - 0.09m
    this.addBeveledBox(cx, height - 0.09, cz, len + 0.02, 0.18, thick + 0.08, yaw, 0.025, 0.5, Math.max(2, Math.round(len * 0.5)), 1, 1);

    // Vertical reinforced pilasters every ~3.8m
    const numRibs = Math.max(2, Math.floor(len / 3.8) + 1);
    for (let i = 0; i < numRibs; i++) {
      const t = numRibs === 1 ? 0 : (i / (numRibs - 1) - 0.5) * (len - 0.44);
      const rx = cx + t * cosY;
      const rz = cz + t * sinY;
      this.addBeveledBox(rx, height * 0.5, rz, 0.34, height - 0.04, thick + 0.10, yaw, 0.03, 0.5, 1, 3, 1);
    }
  }

  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 20, heightSegs = 2, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
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
  // CRITICAL: ZERO emission across all materials!
  return registerMaterial(mat);
}

// --- Register All Classic Bunker Maze v3 PBR Materials (STRICTLY 0 EMISSION!) ---
const MAT = {
  // Custom Classic Bunker Maze v3 PBR sets
  bunkerConcreteWall: makePBRMaterial('Mat_Bunker_ConcreteWall_2K', 'bunker_concrete_wall_2k_Diffuse.png', 'bunker_concrete_wall_2k_nor_gl.png', 'bunker_concrete_wall_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  bunkerCorridorSlab: makePBRMaterial('Mat_Bunker_CorridorSlab_2K', 'bunker_corridor_slab_2k_Diffuse.png', 'bunker_corridor_slab_2k_nor_gl.png', 'bunker_corridor_slab_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  bunkerSteelGrate: makePBRMaterial('Mat_Bunker_SteelGrate_2K', 'bunker_steel_grate_2k_Diffuse.png', 'bunker_steel_grate_2k_nor_gl.png', 'bunker_steel_grate_2k_arm.png', { normalScale: 1.35 }),
  bunkerBlastDoor: makePBRMaterial('Mat_Bunker_BlastDoorSteel_2K', 'bunker_blast_door_steel_2k_Diffuse.png', 'bunker_blast_door_steel_2k_nor_gl.png', 'bunker_blast_door_steel_2k_arm.png', { normalScale: 1.4 }),
  bunkerUtilityPipes: makePBRMaterial('Mat_Bunker_UtilityPipes_1K', 'bunker_utility_pipes_1k_Diffuse.png', 'bunker_utility_pipes_1k_nor_gl.png', 'bunker_utility_pipes_1k_arm.png', { normalScale: 1.3 }),
  bunkerBrickCatacomb: makePBRMaterial('Mat_Bunker_BrickCatacomb_2K', 'bunker_brick_catacomb_2k_Diffuse.png', 'bunker_brick_catacomb_2k_nor_gl.png', 'bunker_brick_catacomb_2k_arm.png', { metallicFactor: 0, normalScale: 1.45 }),
  // Shared CC0 PBR sets
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Cistern_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  gravelGround: makePBRMaterial('Mat_Bunker_Gravel_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  brushedSteel: makePBRMaterial('Mat_Bunker_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_CommandMetal_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
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
  // Alpha-Masked Floor Decals (alphaMode: "MASK", strictly ZERO emission!)
  decalSectorArrows: makePBRMaterial('Mat_Decal_SectorArrows_Mask', 'decal_bunker_sector_arrows_Diffuse.png', 'decal_bunker_sector_arrows_nor_gl.png', 'decal_bunker_sector_arrows_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalBloodCasings: makePBRMaterial('Mat_Decal_BloodCasings_Mask', 'decal_blood_shell_casings_Diffuse.png', 'decal_blood_shell_casings_nor_gl.png', 'decal_blood_shell_casings_arm.png', { alphaMode: 'MASK', metallicFactor: 0.2, roughnessFactor: 0.25, normalScale: 1.35 }),
  decalFloorDrain: makePBRMaterial('Mat_Decal_FloorDrain_Mask', 'decal_floor_drain_grate_Diffuse.png', 'decal_floor_drain_grate_nor_gl.png', 'decal_floor_drain_grate_arm.png', { alphaMode: 'MASK', metallicFactor: 0.65, normalScale: 1.4 }),
  decalRubbleCracks: makePBRMaterial('Mat_Decal_RubbleCracks_Mask', 'decal_rubble_cracks_Diffuse.png', 'decal_rubble_cracks_nor_gl.png', 'decal_rubble_cracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalPuddle: makePBRMaterial('Mat_Decal_CisternPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.08, normalScale: 1.15 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTracks: makePBRMaterial('Mat_Decal_Tracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalMoss: makePBRMaterial('Mat_Decal_CisternMoss_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 })
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
  [-52.0, 0.25, -36.0], // Team0 (NW Bunker Entry Staging Chamber)
  [ 52.0, 0.25, -36.0], // Team1 (NE Bunker Entry Staging Chamber)
  [-52.0, 0.25,  36.0], // Team2 (SW Bunker Entry Staging Chamber)
  [ 52.0, 0.25,  36.0]  // Team3 (SE Bunker Entry Staging Chamber)
];
const SPAWN_OFFSETS = [
  [ 0.0,  0.0],
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

// 18 Card Candidate Points at Y = 1.15 (All >= 18.0m from every team spawn point!)
const CARD_POINTS = [
  // 4 in Central Command War-Room Nexus
  [ -8.5, 1.15,   0.0],
  [  8.5, 1.15,   0.0],
  [  0.0, 1.15,  -7.5],
  [  0.0, 1.15,   7.5],
  // 4 in Cardinal Main Corridors
  [-23.5, 1.15,   0.0],
  [ 23.5, 1.15,   0.0],
  [  0.0, 1.15, -24.0],
  [  0.0, 1.15,  24.0],
  // 4 in Quadrant Deep Labyrinth Junctions (NW Armory, NE Generator, SW Cistern, SE Comms)
  [-30.0, 1.15, -21.5],
  [ 30.0, 1.15, -21.5],
  [-30.0, 1.15,  21.5],
  [ 30.0, 1.15,  21.5],
  // 4 in Outer Flanking Alcoves
  [-21.5, 1.15, -36.0],
  [ 21.5, 1.15, -36.0],
  [-21.5, 1.15,  36.0],
  [ 21.5, 1.15,  36.0],
  // 2 in East/West Deep Catacomb Rooms
  [-44.0, 1.15,   0.0],
  [ 44.0, 1.15,   0.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.5m from every spawn, >= 3.6m clear radius!)
const DOOR_POINTS = [
  // 4 Outer Cardinal Extraction Vaults (N/S/W/E)
  [  0.0, 0.10, -39.0],
  [  0.0, 0.10,  39.0],
  [-55.0, 0.10,   0.0],
  [ 55.0, 0.10,   0.0],
  // 4 North/South Outer Corridor Extraction Plazas
  [-13.0, 0.10, -36.0],
  [ 13.0, 0.10, -36.0],
  [-13.0, 0.10,  36.0],
  [ 13.0, 0.10,  36.0],
  // 4 Inner War-Room Corner Extraction Plazas
  [-14.5, 0.10, -13.0],
  [ 14.5, 0.10, -13.0],
  [-14.5, 0.10,  13.0],
  [ 14.5, 0.10,  13.0],
  // 4 Mid-Labyrinth East/West Extraction Chambers
  [-35.0, 0.10,  -9.0],
  [ 35.0, 0.10,  -9.0],
  [-35.0, 0.10,   9.0],
  [ 35.0, 0.10,   9.0]
];

function isClearOfGameplayPoints(x, z, extraMargin = 0.0) {
  for (const s of ALL_SPAWNS) {
    if (Math.hypot(x - s[0], z - s[2]) < 2.4 + extraMargin) return false;
  }
  for (const c of CARD_POINTS) {
    if (Math.hypot(x - c[0], z - c[2]) < 2.2 + extraMargin) return false;
  }
  for (const d of DOOR_POINTS) {
    if (Math.hypot(x - d[0], z - d[2]) < 4.2 + extraMargin) return false;
  }
  return true;
}

// ============================================================================
// 2. SINGLE-LEVEL BUNKER FLOORS (124x92m, Y in [-0.02, +0.015])
// ============================================================================
function buildFloorPlane(name, minX, maxX, minZ, maxZ, y, matIdx, uvScale = 0.25, subX = 16, subZ = 12) {
  const b = new MeshBuilder();
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  for (let iz = 0; iz <= subZ; iz++) {
    const fz = iz / subZ;
    const pz = minZ + fz * sz;
    for (let ix = 0; ix <= subX; ix++) {
      const fx = ix / subX;
      const px = minX + fx * sx;
      b.addVertex(px, y, pz, 0, 1, 0, px * uvScale, pz * uvScale, 1, 0, 0, 1);
    }
  }
  for (let iz = 0; iz < subZ; iz++) {
    for (let ix = 0; ix < subX; ix++) {
      const a = iz * (subX + 1) + ix;
      const b1 = a + 1;
      const c = a + (subX + 1);
      const d = c + 1;
      b.ind.push(a, c, d, a, d, b1);
    }
  }
  addGeometryNode(name, registerMesh(`${name}_Mesh`, [{ builder: b, mat: matIdx }]));
}

// Base 124x92m subterranean concrete corridor slab at Y = -0.02m
buildFloorPlane('Terrain_Bunker_Ground', -62.0, 62.0, -46.0, 46.0, -0.02, MAT.bunkerCorridorSlab, 0.22, 24, 18);

// 5 Distinct Sector Floor Overlays (Y = +0.012m to +0.015m)
buildFloorPlane('Floor_Center_SteelGrate', -14.0,  14.0, -12.0,  12.0, 0.015, MAT.bunkerSteelGrate, 0.35, 10, 10);
buildFloorPlane('Floor_NW_Armory',         -60.5, -14.0, -44.5, -12.0, 0.012, MAT.chippedConcrete,  0.25, 12, 10);
buildFloorPlane('Floor_NE_SteelGrate',      14.0,  60.5, -44.5, -12.0, 0.015, MAT.bunkerSteelGrate, 0.32, 12, 10);
buildFloorPlane('Floor_SW_Cistern',        -60.5, -14.0,  12.0,  44.5, 0.012, MAT.mossConcrete,     0.24, 12, 10);
buildFloorPlane('Floor_SE_Comms',           14.0,  60.5,  12.0,  44.5, 0.012, MAT.bunkerCorridorSlab, 0.28, 12, 10);

// ============================================================================
// 3. MODULAR OCCLUSION-FRIENDLY HEAVY BUNKER WALLS (6-11.5m segments, h=3.0m, t=1.2m)
// ============================================================================
let wallCounter = 1;
const WALL_SEGMENTS = []; // Stored for spatial checks (props/scatter clearance)

function addModularBunkerWall(prefix, x0, z0, x1, z1, matIdx, height = 3.0, thick = 1.2) {
  const totalLen = Math.hypot(x1 - x0, z1 - z0);
  if (totalLen < 0.5) return;
  // Subdivide any wall > 11.5m into occlusion-friendly 6-11.5m segments
  const pieces = Math.max(1, Math.ceil(totalLen / 10.5));
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const ax = x0 + (x1 - x0) * t0;
    const az = z0 + (z1 - z0) * t0;
    const bx = x0 + (x1 - x0) * t1;
    const bz = z0 + (z1 - z0) * t1;

    const b = new MeshBuilder();
    b.addBunkerWallSegment(ax, az, bx, bz, height, thick);
    const wName = `Wall_${prefix}_${String(wallCounter++).padStart(3, '0')}`;
    addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [{ builder: b, mat: matIdx }]));

    WALL_SEGMENTS.push({ x0: ax, z0: az, x1: bx, z1: bz, thick });
  }
}

function isNearAnyWall(x, z, pad = 1.1) {
  for (const w of WALL_SEGMENTS) {
    const dx = w.x1 - w.x0, dz = w.z1 - w.z0;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq > 1e-6 ? ((x - w.x0) * dx + (z - w.z0) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = w.x0 + t * dx;
    const pz = w.z0 + t * dz;
    if (Math.hypot(x - px, z - pz) < w.thick * 0.5 + pad) return true;
  }
  return false;
}

// --- 3A. Outer Bunker Fortress Perimeter Walls (X = ±61.2, Z = ±45.2, inner face ±60.6 / ±44.6) ---
// North Perimeter: NW Armory (Concrete) | NE Generator (Concrete)
addModularBunkerWall('Perim_N_W', -61.8, -45.2,   0.0, -45.2, MAT.bunkerConcreteWall);
addModularBunkerWall('Perim_N_E',   0.0, -45.2,  61.8, -45.2, MAT.bunkerConcreteWall);
// South Perimeter: SW Cistern (Brick) | SE Comms (Blast Steel)
addModularBunkerWall('Perim_S_W', -61.8,  45.2,   0.0,  45.2, MAT.bunkerBrickCatacomb);
addModularBunkerWall('Perim_S_E',   0.0,  45.2,  61.8,  45.2, MAT.bunkerBlastDoor);
// West Perimeter: NW Armory (Concrete) | SW Cistern (Brick)
addModularBunkerWall('Perim_W_N', -61.2, -44.6, -61.2,   0.0, MAT.bunkerConcreteWall);
addModularBunkerWall('Perim_W_S', -61.2,   0.0, -61.2,  44.6, MAT.bunkerBrickCatacomb);
// East Perimeter: NE Generator (Concrete) | SE Comms (Blast Steel)
addModularBunkerWall('Perim_E_N',  61.2, -44.6,  61.2,   0.0, MAT.bunkerConcreteWall);
addModularBunkerWall('Perim_E_S',  61.2,   0.0,  61.2,  44.6, MAT.bunkerBlastDoor);

// --- 3B. Central Command War-Room Nexus Walls (4 Open Blast-Door Corridors) ---
// North & South Nexus Walls (X in [-10.0, -4.5] and [4.5, 10.0] at Z = ±8.5)
addModularBunkerWall('Nexus_NW', -10.0, -8.5, -4.5, -8.5, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_NE',   4.5, -8.5, 10.0, -8.5, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_SW', -10.0,  8.5, -4.5,  8.5, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_SE',   4.5,  8.5, 10.0,  8.5, MAT.bunkerBlastDoor);
// West & East Nexus Walls (Z in [-8.5, -4.0] and [4.0, 8.5] at X = ±10.0)
addModularBunkerWall('Nexus_WN', -10.0, -8.5, -10.0, -4.0, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_WS', -10.0,  4.0, -10.0,  8.5, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_EN',  10.0, -8.5,  10.0, -4.0, MAT.bunkerBlastDoor);
addModularBunkerWall('Nexus_ES',  10.0,  4.0,  10.0,  8.5, MAT.bunkerBlastDoor);

// --- 3C. Cardinal Sightline Baffles (Break >44m Sightlines while keeping >= 4.6m Corridors!) ---
// North & South N-S corridor blast baffles at Z = ±17.5, X in [-2.0, 2.0]
addModularBunkerWall('Baffle_N', -2.0, -17.5, 2.0, -17.5, MAT.bunkerConcreteWall);
addModularBunkerWall('Baffle_S', -2.0,  17.5, 2.0,  17.5, MAT.bunkerBlastDoor);
// West & East E-W corridor blast baffles at X = ±34.5, Z in [-1.8, 1.8]
addModularBunkerWall('Baffle_W', -34.5, -1.8, -34.5, 1.8, MAT.bunkerConcreteWall);
addModularBunkerWall('Baffle_E',  34.5, -1.8,  34.5, 1.8, MAT.bunkerBlastDoor);

// --- 3D. 4 Quadrant Labyrinth Walls (Symmetrical Tactical Grid, Unique Quadrant Materials!) ---
const QUADRANT_SPECS = [
  { tag: 'NW', sx: -1, sz: -1, mat: MAT.bunkerConcreteWall, altMat: MAT.chippedConcrete },
  { tag: 'NE', sx:  1, sz: -1, mat: MAT.bunkerConcreteWall, altMat: MAT.corrugatedIron },
  { tag: 'SW', sx: -1, sz:  1, mat: MAT.bunkerBrickCatacomb, altMat: MAT.bunkerBrickCatacomb },
  { tag: 'SE', sx:  1, sz:  1, mat: MAT.bunkerBlastDoor,    altMat: MAT.bunkerConcreteWall }
];

for (const q of QUADRANT_SPECS) {
  const { tag, sx, sz, mat, altMat } = q;
  // 1. Inner Cardinal Corridor Baffle (X = sx*19.5, Z = sz*4.0 .. sz*15.5)
  addModularBunkerWall(`${tag}_InnerV`, sx * 19.5, sz * 4.0, sx * 19.5, sz * 15.5, mat);
  // 2. Inner N/S Corridor Wall (Z = sz*18.0, X = sx*7.2 .. sx*19.5)
  addModularBunkerWall(`${tag}_InnerH`, sx * 7.2, sz * 18.0, sx * 19.5, sz * 18.0, mat);
  // 3. Mid-Labyrinth Horizontal Spine (Z = sz*16.0, X = sx*25.5 .. sx*39.5)
  addModularBunkerWall(`${tag}_MidH`, sx * 25.5, sz * 16.0, sx * 39.5, sz * 16.0, altMat);
  // 4. Mid-Labyrinth Vertical Spine (X = sx*26.5, Z = sz*4.0 .. sz*16.0)
  addModularBunkerWall(`${tag}_MidV`, sx * 26.5, sz * 4.0, sx * 26.5, sz * 16.0, mat);
  // 5. Deep Quadrant Horizontal Partition (Z = sz*27.5, X = sx*19.5 .. sx*34.5)
  addModularBunkerWall(`${tag}_DeepH`, sx * 19.5, sz * 27.5, sx * 34.5, sz * 27.5, mat);
  // 6. Deep Quadrant Vertical Partition (X = sx*39.5, Z = sz*16.0 .. sz*28.0)
  addModularBunkerWall(`${tag}_DeepV`, sx * 39.5, sz * 16.0, sx * 39.5, sz * 28.0, altMat);
  // 7. Spawn Staging Inner Wall West/East (X = sx*44.5, Z = sz*27.5 .. sz*39.0)
  addModularBunkerWall(`${tag}_SpawnV`, sx * 44.5, sz * 27.5, sx * 44.5, sz * 39.0, mat);
  // 8. Spawn Staging Inner Wall North/South (Z = sz*27.5, X = sx*44.5 .. sx*54.5)
  addModularBunkerWall(`${tag}_SpawnH`, sx * 44.5, sz * 27.5, sx * 54.5, sz * 27.5, mat);
  // 9. Outer E/W Catacomb Wall (X = sx*48.0, Z = sz*4.5 .. sz*21.0)
  addModularBunkerWall(`${tag}_CatacombV`, sx * 48.0, sz * 4.5, sx * 48.0, sz * 21.0, altMat);
  // 10. Outer N/S Flanking Baffle (X = sx*27.5, Z = sz*34.0 .. sz*45.0)
  addModularBunkerWall(`${tag}_FlankV`, sx * 27.5, sz * 34.0, sx * 27.5, sz * 45.0, mat);
  // 11. Outer N/S Central Chamber Framing Wall (X = sx*6.5, Z = sz*29.5 .. sz*39.5)
  addModularBunkerWall(`${tag}_NorthVaultV`, sx * 6.5, sz * 29.5, sx * 6.5, sz * 39.5, mat);
  // 12. Outer Quadrant Sub-Divider (Z = sz*34.5, X = sx*33.5 .. sx*38.5)
  addModularBunkerWall(`${tag}_OuterSubH`, sx * 33.5, sz * 34.5, sx * 38.5, sz * 34.5, altMat);
}

// ============================================================================
// 4. HERO CENTERPIECE: OCTAGONAL COMMAND WAR-ROOM NEXUS & OVERHEAD CANOPIES
// ============================================================================
function buildCommandWarRoomNexus() {
  const bArmor = new MeshBuilder();
  const bSteel = new MeshBuilder();
  const bConcrete = new MeshBuilder();
  const bPipes = new MeshBuilder();

  // Heavy octagonal reinforced bunker foundation plinth (r=3.1m, h=0.35m)
  bConcrete.addCylinder(0, 0.175, 0, 3.25, 3.10, 0.35, 8, 1, true, Math.PI / 8, 0, 1.5);
  // Main octagonal armored tactical war-room bunker core (r=2.55m, h=2.20m solid cover)
  bArmor.addCylinder(0, 1.12, 0, 2.65, 2.50, 2.15, 8, 3, true, Math.PI / 8, 0, 1.8);
  // Upper blast-shielded command parapet & tactical table rim (h=2.25m)
  bSteel.addCylinder(0, 2.18, 0, 2.68, 2.55, 0.22, 8, 1, true, Math.PI / 8, 0, 2.0);
  // 8 Armored vertical buttress fins around the octagon
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rx = Math.cos(ang) * 2.58;
    const rz = Math.sin(ang) * 2.58;
    bArmor.addBeveledBox(rx, 1.10, rz, 0.42, 2.18, 0.36, -ang, 0.03, 0.8);
    // Low tactical console screens (non-emissive dark steel) on cardinal/diagonal faces
    const cx = Math.cos(ang + Math.PI / 8) * 2.75;
    const cz = Math.sin(ang + Math.PI / 8) * 2.75;
    bSteel.addBeveledBox(cx, 0.92, cz, 0.36, 0.88, 0.95, -(ang + Math.PI / 8), 0.03, 1.0);
  }
  // Central recessed command map mast & radio conduit stub (no tall obstruction, h=2.85m)
  bPipes.addCylinder(0, 2.48, 0, 0.45, 0.38, 0.65, 12, 1, true);
  bSteel.addBeveledBox(0, 2.82, 0, 1.15, 0.16, 1.15, Math.PI / 4, 0.02, 1.0);

  addGeometryNode('Console_CommandNexus_01', registerMesh('Console_CommandNexus_01_Mesh', [
    { builder: bArmor, mat: MAT.heroDarkMetal },
    { builder: bSteel, mat: MAT.bunkerBlastDoor },
    { builder: bConcrete, mat: MAT.bunkerConcreteWall },
    { builder: bPipes, mat: MAT.bunkerUtilityPipes }
  ]));

  // 4 Overhead Steel Pipe Bridges across the 4 Center Nexus Blast-Door Openings (Y = 3.8m, Canopy!)
  const centerPipeSpans = [
    { name: 'BunkerPipes_Center_01_Canopy', cx:  0.0, cz: -8.5, len: 10.2, yaw: 0 },
    { name: 'BunkerPipes_Center_02_Canopy', cx:  0.0, cz:  8.5, len: 10.2, yaw: 0 },
    { name: 'BunkerPipes_Center_03_Canopy', cx: -10.0, cz: 0.0, len:  9.2, yaw: Math.PI * 0.5 },
    { name: 'BunkerPipes_Center_04_Canopy', cx:  10.0, cz: 0.0, len:  9.2, yaw: Math.PI * 0.5 }
  ];
  for (const sp of centerPipeSpans) {
    const bp = new MeshBuilder();
    const bs = new MeshBuilder();
    // Steel I-beam header lintel at Y=3.35m
    bs.addBeveledBox(0, 3.35, 0, sp.len, 0.42, 1.25, 0, 0.03, 0.5);
    // 3 heavy overhead utility/coolant pipes at Y=3.85m
    for (const zOff of [-0.42, 0.0, 0.42]) {
      bp.addCylinder(0, 3.85, zOff, 0.14, 0.14, sp.len + 0.6, 12, 1, true, Math.PI * 0.5, Math.PI * 0.5);
    }
    // Pipe clamp collars
    for (let x = -sp.len * 0.35; x <= sp.len * 0.35; x += 2.2) {
      bs.addBeveledBox(x, 3.85, 0, 0.16, 0.38, 1.15, 0, 0.015, 1.0);
    }
    addGeometryNode(sp.name, registerMesh(`${sp.name}_Mesh`, [
      { builder: bp, mat: MAT.bunkerUtilityPipes },
      { builder: bs, mat: MAT.rustyMetal }
    ]), [sp.cx, 0, sp.cz], sp.yaw);
  }
}
buildCommandWarRoomNexus();

// --- NE Quadrant Overhead Utility Conduit Pipes (`BunkerPipes_NE_01..04_Canopy`, Y=3.6m) ---
function buildNEOverheadPipes() {
  const nePipes = [
    { name: 'BunkerPipes_NE_01_Canopy', cx: 23.0, cz: -12.0, len: 7.5, yaw: 0 },
    { name: 'BunkerPipes_NE_02_Canopy', cx: 33.0, cz: -21.5, len: 12.0, yaw: 0 },
    { name: 'BunkerPipes_NE_03_Canopy', cx: 44.0, cz: -12.0, len: 9.0, yaw: 0 },
    { name: 'BunkerPipes_NE_04_Canopy', cx: 23.0, cz: -31.5, len: 8.5, yaw: Math.PI * 0.5 }
  ];
  for (const sp of nePipes) {
    const bp = new MeshBuilder();
    const bs = new MeshBuilder();
    for (const zOff of [-0.36, 0.0, 0.36]) {
      bp.addCylinder(0, 3.60, zOff, 0.13, 0.13, sp.len, 12, 1, true, Math.PI * 0.5, Math.PI * 0.5);
    }
    bs.addBeveledBox(0, 3.40, 0, sp.len, 0.14, 1.0, 0, 0.015, 0.6);
    addGeometryNode(sp.name, registerMesh(`${sp.name}_Mesh`, [
      { builder: bp, mat: MAT.bunkerUtilityPipes },
      { builder: bs, mat: MAT.rustyMetal }
    ]), [sp.cx, 0, sp.cz], sp.yaw);
  }
}
buildNEOverheadPipes();

// --- SE Quadrant Overhead Blast-Door Frames (`BlastFrame_01..06_Canopy`, Y=3.1m) ---
function buildSEBlastFrames() {
  const frames = [
    { name: 'BlastFrame_01_Canopy', cx: 23.0, cz:  16.0, len: 6.2, yaw: 0 },
    { name: 'BlastFrame_02_Canopy', cx: 37.0, cz:  27.5, len: 5.5, yaw: 0 },
    { name: 'BlastFrame_03_Canopy', cx: 44.0, cz:  21.0, len: 8.8, yaw: 0 },
    { name: 'BlastFrame_04_Canopy', cx: 27.5, cz:  31.0, len: 6.8, yaw: Math.PI * 0.5 },
    { name: 'BlastFrame_05_Canopy', cx: 44.5, cz:  42.0, len: 6.2, yaw: Math.PI * 0.5 },
    { name: 'BlastFrame_06_Canopy', cx: 57.8, cz:  27.5, len: 6.6, yaw: 0 }
  ];
  for (const fr of frames) {
    const bs = new MeshBuilder();
    const bp = new MeshBuilder();
    // Overhead heavy riveted blast-door lintel beam at Y=3.1m
    bs.addBeveledBox(0, 3.15, 0, fr.len, 0.48, 1.32, 0, 0.04, 0.5);
    // Hydraulic blast-door piston cylinder mounted atop lintel
    bp.addCylinder(0, 3.55, 0, 0.15, 0.15, fr.len * 0.72, 12, 1, true, Math.PI * 0.5, Math.PI * 0.5);
    addGeometryNode(fr.name, registerMesh(`${fr.name}_Mesh`, [
      { builder: bs, mat: MAT.bunkerBlastDoor },
      { builder: bp, mat: MAT.heroDarkMetal }
    ]), [fr.cx, 0, fr.cz], fr.yaw);
  }
}
buildSEBlastFrames();

// ============================================================================
// 5. QUADRANT PROPS, SANDBAGS, CISTERN PUMPS, CARD PEDESTALS & PERIMETER ROCKS
// ============================================================================
// Shared procedural Sandbag Barricade Mesh (0.95m jumpable cover, sculpted 3-tier stacked bags)
function createSandbagMesh() {
  const b = new MeshBuilder();
  const rows = [
    { y: 0.16, zOff:  0.0, count: 5, sx: 0.52, sy: 0.30, sz: 0.44 },
    { y: 0.44, zOff:  0.02, count: 4, sx: 0.52, sy: 0.28, sz: 0.42 },
    { y: 0.70, zOff: -0.02, count: 3, sx: 0.50, sy: 0.26, sz: 0.40 }
  ];
  for (const r of rows) {
    for (let i = 0; i < r.count; i++) {
      const lx = (i - (r.count - 1) * 0.5) * 0.54;
      b.addBeveledBox(lx, r.y, r.zOff, r.sx, r.sy, r.sz, (i % 2 === 0 ? 0.04 : -0.04), 0.08, 1.2, 2, 1, 2);
    }
  }
  return registerMesh('Shared_SandbagBarricade_Mesh', [{ builder: b, mat: MAT.sandbagBurlap }]);
}
const sharedSandbagMesh = createSandbagMesh();

// Shared procedural Cistern Pump Assembly (SW Quadrant landmark prop)
function createCisternPumpMesh() {
  const bBody = new MeshBuilder();
  const bPipe = new MeshBuilder();
  bBody.addBeveledBox(0, 0.14, 0, 1.5, 0.28, 1.1, 0, 0.03, 0.8);
  bBody.addCylinder(-0.25, 0.78, 0, 0.42, 0.40, 1.05, 16, 2, true);
  bPipe.addCylinder(0.40, 0.95, 0, 0.22, 0.22, 1.35, 14, 1, true);
  bPipe.addCylinder(0.08, 1.12, 0, 0.12, 0.12, 0.75, 10, 1, true, Math.PI * 0.5, Math.PI * 0.5);
  return registerMesh('Shared_CisternPump_Mesh', [
    { builder: bBody, mat: MAT.rustyMetal },
    { builder: bPipe, mat: MAT.bunkerUtilityPipes }
  ]);
}
const sharedCisternPumpMesh = createCisternPumpMesh();

// Shared procedural Card Pedestal (placed at all 18 CARD_POINTS, 0.72m tall armored keycard locker)
function createCardPedestalMesh() {
  const bBase = new MeshBuilder();
  const bTop = new MeshBuilder();
  bBase.addBeveledBox(0, 0.34, 0, 0.76, 0.68, 0.76, 0, 0.04, 1.0);
  bTop.addBeveledBox(0, 0.72, 0, 0.84, 0.08, 0.84, 0, 0.02, 1.2);
  return registerMesh('Shared_CardPedestal_Mesh', [
    { builder: bBase, mat: MAT.heroDarkMetal },
    { builder: bTop, mat: MAT.brushedSteel }
  ]);
}
const sharedCardPedestalMesh = createCardPedestalMesh();

for (let i = 0; i < CARD_POINTS.length; i++) {
  const c = CARD_POINTS[i];
  addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, sharedCardPedestalMesh, [c[0], 0.0, c[2]]);
}

// --- NW Quadrant Props: Armory & Munitions Vault (Crates, Sandbags, Ammo Racks) ---
const nwCrates = [
  [-23.5, -24.5, 0.2], [-34.5, -24.5, -0.3], [-42.5, -20.5, 0.0],
  [-42.5, -24.0, 0.5], [-31.0, -31.5, 0.1], [-17.5, -31.0, 0.4],
  [-51.5, -23.0, 0.0], [-56.0, -17.5, 0.2], [-23.0, -12.0, 0.0], [-14.5, -23.5, -0.2]
];
nwCrates.forEach((p, i) => {
  addGeometryNode(`Armory_Crate_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [p[0], 0.0, p[1]], p[2], [1.1, 1.1, 1.1]);
});

const nwAmmoRacks = [
  [-21.5, -26.0, 0.0], [-37.5, -25.0, Math.PI * 0.5], [-46.2, -16.5, Math.PI * 0.5],
  [-59.2, -24.0, Math.PI * 0.5], [-35.5, -36.5, 0.0], [-11.5, -21.5, 0.0]
];
nwAmmoRacks.forEach((p, i) => {
  addGeometryNode(`AmmoRack_NW_${String(i + 1).padStart(2, '0')}`, sharedCC0.shelves, [p[0], 0.0, p[1]], p[2], [1.0, 1.0, 1.0]);
});

const nwSandbags = [
  [-23.0, -20.5, Math.PI * 0.5], [-37.0, -30.5, 0.0],
  [-53.5, -14.0, 0.0], [-15.0, -25.5, 0.0]
];
nwSandbags.forEach((p, i) => {
  addGeometryNode(`Sandbag_NW_${String(i + 1).padStart(2, '0')}`, sharedSandbagMesh, [p[0], 0.0, p[1]], p[2]);
});

// --- NE Quadrant Props: Power & Diesel Generator Catacombs ---
const neGenerators = [
  [23.5, -24.5, 0.0], [34.5, -24.5, Math.PI], [43.0, -21.5, Math.PI * 0.5],
  [52.5, -22.5, 0.0], [31.5, -31.5, Math.PI], [16.5, -24.0, 0.0]
];
neGenerators.forEach((p, i) => {
  addGeometryNode(`Generator_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [p[0], 0.0, p[1]], p[2], [1.15, 1.15, 1.15]);
});

const nePowerBoxes = [
  [21.0, -14.0, Math.PI * 0.5], [28.0, -14.5, 0.0], [38.0, -18.0, Math.PI * 0.5],
  [46.5, -12.5, Math.PI * 0.5], [29.0, -37.0, Math.PI * 0.5], [10.0, -22.0, 0.0]
];
nePowerBoxes.forEach((p, i) => {
  addGeometryNode(`PowerBox_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [p[0], 0.0, p[1]], p[2], [1.1, 1.1, 1.1]);
});

const neBarrels = [
  [24.5, -19.5, 0.0], [36.5, -25.0, 0.3], [44.5, -17.0, 0.7],
  [56.5, -18.0, 0.2], [53.5, -14.0, 0.5], [17.5, -31.0, 0.1]
];
neBarrels.forEach((p, i) => {
  addGeometryNode(`Barrel_NE_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [p[0], 0.0, p[1]], p[2], [1.05, 1.05, 1.05]);
});

// --- SW Quadrant Props: Old Brick Cistern & Drainage Tunnels ---
const swPumps = [
  [-24.0, 24.5, 0.0], [-36.5, 24.5, Math.PI * 0.5],
  [-43.5, 21.5, 0.0], [-53.5, 21.5, Math.PI * 0.5]
];
swPumps.forEach((p, i) => {
  addGeometryNode(`CisternPump_SW_${String(i + 1).padStart(2, '0')}`, sharedCisternPumpMesh, [p[0], 0.0, p[1]], p[2]);
});

const swBarriers = [
  [-23.0, 12.0, Math.PI * 0.5], [-53.5, 14.0, 0.0],
  [-31.5, 31.5, 0.0], [-15.0, 25.5, 0.0]
];
swBarriers.forEach((p, i) => {
  addGeometryNode(`Barrier_SW_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [p[0], 0.0, p[1]], p[2], [1.0, 1.0, 1.0]);
});

const swSandbags = [
  [-37.0, 30.5, 0.0], [-17.5, 31.0, Math.PI * 0.5]
];
swSandbags.forEach((p, i) => {
  addGeometryNode(`Sandbag_SW_${String(i + 1).padStart(2, '0')}`, sharedSandbagMesh, [p[0], 0.0, p[1]], p[2]);
});

// --- SE Quadrant Props: Blast-Door Communications & Archive Maze ---
const seServerRacks = [
  [22.0, 25.5, 0.0], [34.5, 25.5, 0.0], [37.5, 20.5, Math.PI * 0.5],
  [46.0, 16.5, Math.PI * 0.5], [59.0, 22.0, Math.PI * 0.5], [35.5, 36.5, 0.0],
  [11.5, 21.5, 0.0], [29.0, 37.5, Math.PI * 0.5]
];
seServerRacks.forEach((p, i) => {
  addGeometryNode(`Server_Rack_${String(i + 1).padStart(2, '0')}`, sharedCC0.shelves, [p[0], 0.0, p[1]], p[2], [1.0, 1.0, 1.0]);
});

const seSandbags = [
  [23.0, 20.5, Math.PI * 0.5], [37.0, 30.5, 0.0],
  [53.5, 14.0, 0.0], [15.0, 25.5, 0.0]
];
seSandbags.forEach((p, i) => {
  addGeometryNode(`Sandbag_SE_${String(i + 1).padStart(2, '0')}`, sharedSandbagMesh, [p[0], 0.0, p[1]], p[2]);
});

// --- Outer Perimeter Subterranean Rock Formations (`Cliff_Perimeter_01..12` & `Rock_Rubble_01..08`) ---
// Placed cleanly inside outer corners & perimeter recesses (>= 4.5m clear of all spawns/cards/doors!)
const cliffSpots = [
  [-59.2, -43.2, 0.4, 0.55], [ 59.2, -43.2, 2.1, 0.55],
  [-59.2,  43.2, 1.2, 0.55], [ 59.2,  43.2, 2.8, 0.55],
  [-32.0, -43.5, 0.0, 0.50], [ 32.0, -43.5, 3.1, 0.50],
  [-32.0,  43.5, 0.2, 0.50], [ 32.0,  43.5, 2.9, 0.50],
  [-59.4, -14.5, 1.5, 0.48], [ 59.4, -14.5, 4.6, 0.48],
  [-59.4,  14.5, 1.7, 0.48], [ 59.4,  14.5, 4.8, 0.48]
];
cliffSpots.forEach((c, i) => {
  addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [c[0], -0.1, c[1]], c[2], [c[3], c[3], c[3]]);
});

const rubbleSpots = [
  [-58.5, -28.0, 0.3, 0.55], [ 58.5, -28.0, 1.4, 0.55],
  [-58.5,  28.0, 2.2, 0.55], [ 58.5,  28.0, 0.8, 0.55],
  [-41.0, -43.0, 1.1, 0.50], [ 41.0, -43.0, 2.6, 0.50],
  [-41.0,  43.0, 0.5, 0.50], [ 41.0,  43.0, 1.9, 0.50]
];
rubbleSpots.forEach((r, i) => {
  addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [r[0], 0.0, r[1]], r[2], [r[3], r[3], r[3]]);
});

// ============================================================================
// 6. 165 FLOOR DECALS (`Maze_Decal_001..165`) & 12 BLOOD/CASING TRAILS (`Maze_BloodTrail_01..12`)
// ============================================================================
function buildDecalQuad(name, cx, cz, sx, sz, yaw, y, matIdx) {
  const b = new MeshBuilder();
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const grid = 2;
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
  addGeometryNode(name, registerMesh(`${name}_Mesh`, [{ builder: b, mat: matIdx }]));
}

function buildMazeDecals() {
  // 12 Blood & Brass Shell Casing Trails (`Maze_BloodTrail_01..12`) in high-traffic combat intersections
  const bloodTrails = [
    [-11.5,   0.0, 0.0], [ 11.5,   0.0, Math.PI],
    [  0.0, -12.0, Math.PI * 0.5], [  0.0,  12.0, -Math.PI * 0.5],
    [-23.0,  -6.0, 0.4], [ 23.0,  -6.0, -0.4],
    [-23.0,   6.0, -0.3], [ 23.0,   6.0, 0.3],
    [-31.0, -21.0, 0.8], [ 31.0, -21.0, -0.8],
    [-31.0,  21.0, 1.2], [ 31.0,  21.0, -1.2]
  ];
  bloodTrails.forEach((bt, i) => {
    const mat = (i % 2 === 0) ? MAT.decalBloodCasings : MAT.decalBlood;
    buildDecalQuad(`Maze_BloodTrail_${String(i + 1).padStart(2, '0')}`, bt[0], bt[1], 3.2, 2.2, bt[2], 0.022 + (i % 4) * 0.0005, mat);
  });

  // 165 Contextual Bunker Floor Decals (`Maze_Decal_001..165`)
  // Sector-aware material selection so SW Cistern has drains/puddles/moss, NE has oil/drains, NW/SE have arrows/casings/cracks!
  let placed = 0;
  let attempts = 0;
  while (placed < 165 && attempts < 1800) {
    attempts++;
    const cx = randRange(-58.0, 58.0);
    const cz = randRange(-42.0, 42.0);
    if (Math.hypot(cx, cz) < 3.8) continue; // Clear of central octagonal Command Nexus
    if (isNearAnyWall(cx, cz, 1.3)) continue;

    let matIdx;
    const r = rand();
    if (cx < -12 && cz > 10) {
      // SW Brick Cistern: drains, puddles, moss, cracks
      if (r < 0.32) matIdx = MAT.decalFloorDrain;
      else if (r < 0.62) matIdx = MAT.decalPuddle;
      else if (r < 0.84) matIdx = MAT.decalMoss;
      else matIdx = MAT.decalRubbleCracks;
    } else if (cx > 12 && cz < -10) {
      // NE Generator Catacombs: oil spills, floor drains, scorch, arrows
      if (r < 0.30) matIdx = MAT.decalOil;
      else if (r < 0.55) matIdx = MAT.decalFloorDrain;
      else if (r < 0.78) matIdx = MAT.decalScorch;
      else matIdx = MAT.decalSectorArrows;
    } else if (cx < -12 && cz < -10) {
      // NW Armory Vault: sector arrows, blood/shell casings, rubble cracks, tracks
      if (r < 0.30) matIdx = MAT.decalSectorArrows;
      else if (r < 0.56) matIdx = MAT.decalBloodCasings;
      else if (r < 0.80) matIdx = MAT.decalRubbleCracks;
      else matIdx = MAT.decalTracks;
    } else if (cx > 12 && cz > 10) {
      // SE Blast-Door Comms: sector arrows, blood/casings, scorch, oil
      if (r < 0.32) matIdx = MAT.decalSectorArrows;
      else if (r < 0.58) matIdx = MAT.decalBloodCasings;
      else if (r < 0.80) matIdx = MAT.decalScorch;
      else matIdx = MAT.decalOil;
    } else {
      // Center Nexus & Main Cardinal Corridors: sector arrows, blood/casings, drains, cracks
      if (r < 0.35) matIdx = MAT.decalSectorArrows;
      else if (r < 0.62) matIdx = MAT.decalBloodCasings;
      else if (r < 0.82) matIdx = MAT.decalFloorDrain;
      else matIdx = MAT.decalRubbleCracks;
    }

    const sx = (matIdx === MAT.decalFloorDrain) ? randRange(1.4, 2.0) : randRange(2.0, 3.4);
    const sz = (matIdx === MAT.decalFloorDrain) ? sx : randRange(1.8, 3.0);
    const yaw = (matIdx === MAT.decalSectorArrows || matIdx === MAT.decalFloorDrain)
      ? Math.floor(rand() * 4) * (Math.PI * 0.5)
      : randRange(0, Math.PI * 2);

    placed++;
    const y = 0.019 + (placed % 7) * 0.0004;
    buildDecalQuad(`Maze_Decal_${String(placed).padStart(3, '0')}`, cx, cz, sx, sz, yaw, y, matIdx);
  }
}
buildMazeDecals();

// ============================================================================
// 7. 32 LOW-PROFILE SCATTER DEBRIS GROUPS (`Maze_Scatter_01..32`, Y < 0.26m)
// ============================================================================
function buildMazeScatter() {
  for (let s = 1; s <= 32; s++) {
    const bConcrete = new MeshBuilder();
    const bBrick = new MeshBuilder();
    const bMetal = new MeshBuilder();

    const gx = ((s - 1) % 8) - 3.5;
    const gz = Math.floor((s - 1) / 8) - 1.5;
    const baseCx = gx * 14.0;
    const baseCz = gz * 20.5;

    let added = 0;
    let attempts = 0;
    while (added < 14 && attempts < 90) {
      attempts++;
      const px = Math.max(-58.0, Math.min(58.0, baseCx + randRange(-5.8, 5.8)));
      const pz = Math.max(-42.0, Math.min(42.0, baseCz + randRange(-7.2, 7.2)));
      if (Math.hypot(px, pz) < 4.5) continue;
      if (isNearAnyWall(px, pz, 0.85)) continue;
      if (!isClearOfGameplayPoints(px, pz, -0.2)) continue; // Ensures >= 2.0m clear of spawns/cards/doors

      const yaw = randRange(0, Math.PI * 2);
      const kind = added % 3;
      if (kind === 0) {
        // Concrete rubble chunk (Y < 0.20m)
        const w = randRange(0.18, 0.38);
        const h = randRange(0.05, 0.13);
        const d = randRange(0.16, 0.34);
        bConcrete.addBeveledBox(px, 0.015 + h * 0.5, pz, w, h, d, yaw, 0.02, 2.0);
      } else if (kind === 1) {
        // Broken brick / ammo tin (Y < 0.20m)
        const w = randRange(0.16, 0.30);
        const h = randRange(0.06, 0.14);
        const d = randRange(0.12, 0.24);
        bBrick.addBeveledBox(px, 0.015 + h * 0.5, pz, w, h, d, yaw, 0.015, 2.0);
      } else {
        // Severed utility pipe segment / steel debris (Y < 0.20m)
        const r = randRange(0.035, 0.065);
        const len = randRange(0.22, 0.45);
        bMetal.addCylinder(px, 0.015 + r, pz, r, r, len, 10, 1, true, yaw, Math.PI * 0.5);
      }
      added++;
    }

    const sName = `Maze_Scatter_${String(s).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bConcrete, mat: MAT.chippedConcrete },
      { builder: bBrick, mat: MAT.bunkerBrickCatacomb },
      { builder: bMetal, mat: MAT.bunkerUtilityPipes }
    ]));
  }
}
buildMazeScatter();

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
  name: 'Classic_Bunker_Maze_Map',
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
    generator: 'TacticalDark Classic Bunker Maze v3 Node.js Procedural Builder',
    version: '2.0'
  },
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

const gltfResPath = `res://asset model/haritalar/Map0_Labirent_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dlabirent5v5v3m0"
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
// 9. MATHEMATICAL & LEVEL DESIGN VALIDATION REPORT (FULL AABB CLEARANCE AUDIT)
// ============================================================================
function pointToNodeDistXZ(px, pz, n) {
  const m = meshes[n.mesh];
  const tx = n.translation ? n.translation[0] : 0;
  const tz = n.translation ? n.translation[2] : 0;
  let cosY = 1, sinY = 0;
  if (n.rotation) {
    const qy = n.rotation[1], qw = n.rotation[3];
    const yaw = 2 * Math.atan2(qy, qw);
    cosY = Math.cos(yaw);
    sinY = Math.sin(yaw);
  }
  const sx = n.scale ? n.scale[0] : 1;
  const sz = n.scale ? n.scale[2] : 1;
  const dx = px - tx;
  const dz = pz - tz;
  const localX =  dx * cosY + dz * sinY;
  const localZ = -dx * sinY + dz * cosY;
  let best = Infinity;
  for (const p of m.primitives) {
    const acc = accessors[p.attributes.POSITION];
    const cx = Math.max(acc.min[0] * sx, Math.min(localX, acc.max[0] * sx));
    const cz = Math.max(acc.min[2] * sz, Math.min(localZ, acc.max[2] * sz));
    const dist = Math.hypot(localX - cx, localZ - cz);
    if (dist < best) best = dist;
  }
  return best;
}

function validatePackage() {
  let errors = 0;

  // 1. World AABB check (124x92m footprint)
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
  if (wMinX < -62.25 || wMaxX > 62.25 || wMinZ < -46.25 || wMaxZ > 46.25) {
    console.error(`ERROR: World AABB exceeds 124x92m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
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
      console.error(`ERROR: CardPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m < 18.0m`);
      errors++;
    }
    minCardToSpawn = Math.min(minCardToSpawn, dMin);
  }

  // 3. DoorPoint -> Spawn min distance check (>= 26.5m required)
  let minDoorToSpawn = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const d = DOOR_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(d[0] - s[0], d[2] - s[2]));
    }
    if (dMin < 26.5) {
      console.error(`ERROR: DoorPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m < 26.5m`);
      errors++;
    }
    minDoorToSpawn = Math.min(minDoorToSpawn, dMin);
  }

  // 4. Verify ZERO materials use emissiveFactor, and all Decal materials use alphaMode: "MASK"
  for (const m of materials) {
    if (m.emissiveFactor) {
      console.error(`ERROR: Material ${m.name} uses emissiveFactor! ZERO emission is strictly required.`);
      errors++;
    }
    if (m.name.includes('Decal')) {
      if (m.alphaMode !== 'MASK') {
        console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
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

  // 6. Full AABB Wall & Solid Prop Clearance Audit for 20 Spawns, 18 Cards, and 16 Doors
  const noCollideWords = ['Terrain', 'Floor', 'Canopy', 'Decal', 'Scatter', 'BloodTrail'];

  // 6a. 20 SpawnPoints (>= 2.0m clear from every solid collider)
  let minSpawnClearance = Infinity;
  for (let i = 0; i < ALL_SPAWNS.length; i++) {
    const sp = ALL_SPAWNS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollideWords.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(sp[0], sp[2], n);
      minSpawnClearance = Math.min(minSpawnClearance, dist);
      if (dist < 2.0) {
        console.error(`ERROR: Spawn_${i + 1} (${sp[0]}, ${sp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 2.0m)`);
        errors++;
      }
    }
  }

  // 6b. 18 CardPoints (>= 1.8m clear from every solid collider except its own Prop_CardPedestal)
  let minCardClearance = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollideWords.some(w => n.name.includes(w)) || n.name.includes('Prop_CardPedestal')) continue;
      const dist = pointToNodeDistXZ(cp[0], cp[2], n);
      minCardClearance = Math.min(minCardClearance, dist);
      if (dist < 1.8) {
        console.error(`ERROR: CardPoint_${i + 1} (${cp[0]}, ${cp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 1.8m)`);
        errors++;
      }
    }
  }

  // 6c. 16 DoorPoints (>= 3.6m clear from every solid collider)
  let minDoorClearance = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const dp = DOOR_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollideWords.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(dp[0], dp[2], n);
      minDoorClearance = Math.min(minDoorClearance, dist);
      if (dist < 3.6) {
        console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 3.6m)`);
        errors++;
      }
    }
  }

  console.log('================================================================');
  console.log(' KLASIK LABIRENT v3 (Map0_Labirent_v3) VALIDATION REPORT');
  console.log('================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 untextured, 0 emissive!)`);
  console.log(`Total Textures    : ${images.length} referenced`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Walkable Levels   : Strictly single-level Y in [-0.02m, +0.015m]`);
  console.log(`Spawn Points      : 4 teams x 5 spawns = ${ALL_SPAWNS.length} points (min solid clearance: ${minSpawnClearance.toFixed(2)}m >= 2.0m)`);
  console.log(`Card Candidates   : ${CARD_POINTS.length} points + 18 Prop_CardPedestal_NN (min spawn dist: ${minCardToSpawn.toFixed(2)}m >= 18.0m, min solid clearance: ${minCardClearance.toFixed(2)}m >= 1.8m)`);
  console.log(`Door Candidates   : ${DOOR_POINTS.length} points (min spawn dist: ${minDoorToSpawn.toFixed(2)}m >= 26.5m, min solid clearance: ${minDoorClearance.toFixed(2)}m >= 3.6m)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
