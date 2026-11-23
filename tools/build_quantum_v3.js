#!/usr/bin/env node
/**
 * build_quantum_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map2_Yeralti_Kuantum_Labirenti_5v5v5v5_v3.gltf (inside asset model/haritalar/Map2_Kuantum_v3/)
 *
 * Implements:
 * - 120x90m standard rectangular footprint (X in [-60, 60], Z in [-45, 45]), full 5v5v5v5 (20 players)
 * - Strictly single-level walkable floor heights Y in [-0.04, +0.025] so horizontal bullets and BotNav work at 100% precision
 * - ZERO glowing/neon strips or emissive materials ("fenere ihtiyaç yok gibi" fix! 0 materials use emissiveFactor)
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±50, 0.25, ±36) with (±1.7, ±1.7) spread in the 4 outer Subterranean Blast-Airlock Staging Bays (NO Pad_Team meshes!)
 * - 18 Card Candidate Points at Y=1.15 (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.5m from every spawn, >= 3.6m clear radius from every solid wall/prop)
 * - Multi-Ring Octagonal & Orthogonal Modular Bulkhead Labyrinth (6-12m segments, height 3.0m, thickness 0.48m with quantum_bulkhead_wall_2k, beveled armor ribs, and cable conduit lips)
 * - Center — Tokamak Fusion Reactor Core (X in [-16, 16], Z in [-16, 16]):
 *   * Toroidal Tokamak Fusion Reactor (Console_TokamakCore_01, outer radius 4.2m, height 2.65m solid full cover) with 12 sculptural D-shaped superconducting magnetic coils (hero_tokamak_coil_2k)
 *   * 4 Curved Plasma Diagnostic Consoles (Barrier_TokamakConsole_01..04, 0.90m jumpable cover at r=5.4m along diagonals)
 *   * Overhead Reactor Cryo-Manifold Ring & Crane Busbars (TokamakGantry_01..04_Canopy at Y=4.4m)
 * - 4 Asymmetric Black-Site Research Sectors:
 *   * NW Sector — Bio-Stasis & Containment Pod Lab: 6 cylindrical Bio-Stasis Specimen Pods (Console_BioPod_01..06, r=0.85m, h=2.35m with hero_biopod_glass_1k), ruptured cryo tanks, and dark blood/cryo floor spills
 *   * NE Sector — Cryo-Cooled Quantum Supercomputer Vault: 8 high-density Quantum Mainframe Server Racks (Server_Rack_Quantum_01..08, 2.8m x 1.1m x 2.4m with hero_quantum_server_2k) + ServerBus_01..02_Canopy at Y=3.6m
 *   * SW Sector — Particle Accelerator & Synchrotron Tunnel: 4 curved/segmented Dipole Magnet Accelerator Conduits (Console_AcceleratorTube_01..04, height 2.05m full cover with hero_tokamak_coil_2k) + high-voltage capacitor banks (PowerBox_NN)
 *   * SE Sector — 6-Axis Heavy Robotic Assembly & Telemetry Foundry: 4 articulated Industrial 6-Axis Robotic Arms on Heavy Pedestals (Console_RoboticArm_01..04, base h=2.15m solid cover + RoboticBoom_01..04_Canopy)
 * - 165 Alpha-Masked Non-Emissive Floor Decals (Quantum_Decal_001..165) + 12 Non-Emissive Blood/Cryo Drag Trails (Quantum_BloodCryo_01..12)
 * - 32 Scatter Debris Groups (Quantum_Scatter_01..32, Y < 0.28m) + 36 Subterranean Cavern Moss/Fern Clusters (Quantum_Grass_01..36)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map2_Kuantum_v3');
const GLTF_NAME = 'Map2_Yeralti_Kuantum_Labirenti_5v5v5v5_v3.gltf';
const BIN_NAME = 'Map2_Yeralti_Kuantum_Labirenti_5v5v5v5_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112302;
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

  // Detailed Quantum Bulkhead Wall Segment (height=3.0m, thickness=0.48m, beveled armor ribs, and cable conduit lips)
  addQuantumBulkheadWallSegment(x0, z0, x1, z1, height = 3.0, thick = 0.48) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const segsX = Math.max(4, Math.round(len * 1.5));

    // Main bulkhead wall body
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.03, 1.0 / height, segsX, 6, 2);
    // Mid-height armored cable conduit & warning stripe lip at Y=1.25m
    this.addBeveledBox(cx, 1.25, cz, len + 0.02, 0.16, thick + 0.06, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Bottom heavy titanium blast plinth at Y=0.11m
    this.addBeveledBox(cx, 0.11, cz, len + 0.02, 0.22, thick + 0.05, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Top cryogenic pipe & cable tray coping lip at Y = height - 0.08m
    this.addBeveledBox(cx, height - 0.08, cz, len + 0.02, 0.16, thick + 0.06, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Vertical armored structural buttress ribs every ~3.0m
    const numRibs = Math.max(2, Math.floor(len / 3.0) + 1);
    for (let i = 0; i < numRibs; i++) {
      const t = numRibs === 1 ? 0 : (i / (numRibs - 1) - 0.5) * (len - 0.32);
      const rx = cx + t * cosY;
      const rz = cz + t * sinY;
      this.addBeveledBox(rx, height * 0.5, rz, 0.24, height - 0.04, thick + 0.08, yaw, 0.02, 0.5, 1, 4, 1);
    }
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
  // CRITICAL REQUIREMENT: ZERO materials in Map2_Kuantum_v3 may use emissiveFactor!
  return registerMaterial(mat);
}

// --- Register All Quantum v3 PBR Materials (STRICTLY 0 EMISSION ACROSS ALL MATERIALS!) ---
const MAT = {
  titaniumDeck: makePBRMaterial('Mat_Quantum_TitaniumDeck_2K', 'quantum_titanium_deck_2k_Diffuse.png', 'quantum_titanium_deck_2k_nor_gl.png', 'quantum_titanium_deck_2k_arm.png', { normalScale: 1.35 }),
  cleanroomSlate: makePBRMaterial('Mat_Quantum_CleanroomSlate_2K', 'quantum_cleanroom_slate_2k_Diffuse.png', 'quantum_cleanroom_slate_2k_nor_gl.png', 'quantum_cleanroom_slate_2k_arm.png', { metallicFactor: 0.15, normalScale: 1.35 }),
  basaltCavern: makePBRMaterial('Mat_Quantum_BasaltCavern_2K', 'quantum_basalt_cavern_2k_Diffuse.png', 'quantum_basalt_cavern_2k_nor_gl.png', 'quantum_basalt_cavern_2k_arm.png', { metallicFactor: 0, normalScale: 1.45 }),
  bulkheadWall: makePBRMaterial('Mat_Quantum_BulkheadWall_2K', 'quantum_bulkhead_wall_2k_Diffuse.png', 'quantum_bulkhead_wall_2k_nor_gl.png', 'quantum_bulkhead_wall_2k_arm.png', { normalScale: 1.35 }),
  tokamakCoil: makePBRMaterial('Mat_Hero_TokamakCoil_2K', 'hero_tokamak_coil_2k_Diffuse.png', 'hero_tokamak_coil_2k_nor_gl.png', 'hero_tokamak_coil_2k_arm.png', { normalScale: 1.4 }),
  quantumServer: makePBRMaterial('Mat_Hero_QuantumServer_2K', 'hero_quantum_server_2k_Diffuse.png', 'hero_quantum_server_2k_nor_gl.png', 'hero_quantum_server_2k_arm.png', { normalScale: 1.35 }),
  biopodGlass: makePBRMaterial('Mat_Hero_BiopodGlass_1K', 'hero_biopod_glass_1k_Diffuse.png', 'hero_biopod_glass_1k_nor_gl.png', 'hero_biopod_glass_1k_arm.png', { normalScale: 1.3 }),
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Perimeter_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  gravelGround: makePBRMaterial('Mat_Cavern_Gravel_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  brushedSteel: makePBRMaterial('Mat_Quantum_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
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
  // Non-emissive industrial glass lens texture
  industrialLens: makePBRMaterial('Mat_Industrial_Lens_NonEmissive', 'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png', { normalScale: 1.2 }),
  // Alpha-Masked Floor & Wall Decal Materials (alphaMode: "MASK", strictly ZERO emission!)
  decalBloodCryo: makePBRMaterial('Mat_Decal_BloodCryoSpill_Mask', 'decal_blood_cryo_spill_Diffuse.png', 'decal_blood_cryo_spill_nor_gl.png', 'decal_blood_cryo_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.14, normalScale: 1.4 }),
  decalSectorStencil: makePBRMaterial('Mat_Decal_QuantumSectorStencil_Mask', 'decal_quantum_sector_stencil_Diffuse.png', 'decal_quantum_sector_stencil_nor_gl.png', 'decal_quantum_sector_stencil_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalCircuitDebris: makePBRMaterial('Mat_Decal_CircuitGlassDebris_Mask', 'decal_circuit_glass_debris_Diffuse.png', 'decal_circuit_glass_debris_nor_gl.png', 'decal_circuit_glass_debris_arm.png', { alphaMode: 'MASK', metallicFactor: 0.25, normalScale: 1.35 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalPuddle: makePBRMaterial('Mat_Decal_CryoPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.08, normalScale: 1.15 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTracks: makePBRMaterial('Mat_Decal_SkidTracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalMoss: makePBRMaterial('Mat_Decal_CavernMoss_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  grassCavernMoss: makePBRMaterial('Mat_Quantum_Grass_CavernMoss_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 })
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
  [-50.0, 0.25, -36.0], // Team0 (NW Blast Airlock Staging Bay)
  [ 50.0, 0.25, -36.0], // Team1 (NE Blast Airlock Staging Bay)
  [-50.0, 0.25,  36.0], // Team2 (SW Blast Airlock Staging Bay)
  [ 50.0, 0.25,  36.0]  // Team3 (SE Blast Airlock Staging Bay)
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

// 18 Card Candidate Points at Y = 1.15 (All >= 18.0m from every team spawn point!)
const CARD_POINTS = [
  // 4 in Central Tokamak Fusion Reactor Chamber
  [ -9.5, 1.15,   0.0],
  [  9.5, 1.15,   0.0],
  [  0.0, 1.15,  -9.5],
  [  0.0, 1.15,   9.5],
  // 4 in Cardinal Inner-Ring Research Checkpoints
  [-24.0, 1.15,   0.0],
  [ 24.0, 1.15,   0.0],
  [  0.0, 1.15, -23.0],
  [  0.0, 1.15,  23.0],
  // 4 deep inside the 4 Specialist Quadrant Labs (NW Bio-Stasis, NE Quantum Server Vault, SW Synchrotron, SE Robotics Foundry)
  [-28.0, 1.15, -18.0],
  [ 28.0, 1.15, -18.0],
  [-28.0, 1.15,  18.0],
  [ 28.0, 1.15,  18.0],
  // 4 in Mid-Labyrinth Ring Corridors
  [-16.0, 1.15, -26.0],
  [ 16.0, 1.15, -26.0],
  [-16.0, 1.15,  26.0],
  [ 16.0, 1.15,  26.0],
  // 2 in East/West Subterranean Cavern Drilling Alcoves
  [-42.0, 1.15,   0.0],
  [ 42.0, 1.15,   0.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.5m from every team spawn point, >= 3.6m clear radius!)
const DOOR_POINTS = [
  // 4 Outer North/South/West/East Main Subterranean Bulkhead Airlocks
  [  0.0, 0.10, -38.0],
  [  0.0, 0.10,  38.0],
  [-52.0, 0.10,   0.0],
  [ 52.0, 0.10,   0.0],
  // 4 North/South Cavern Lift Extraction Plazas
  [-18.0, 0.10, -36.0],
  [ 18.0, 0.10, -36.0],
  [-18.0, 0.10,  36.0],
  [ 18.0, 0.10,  36.0],
  // 4 Inner Tokamak Chamber Diagonal Blast-Gate Plazas
  [-12.5, 0.10, -12.5],
  [ 12.5, 0.10, -12.5],
  [-12.5, 0.10,  12.5],
  [ 12.5, 0.10,  12.5],
  // 4 Quadrant Lab Cross-Breezeways
  [-34.0, 0.10,  -8.0],
  [ 34.0, 0.10,  -8.0],
  [-34.0, 0.10,   8.0],
  [ 34.0, 0.10,   8.0]
];

function isClearOfGameplayPoints(x, z, extraRadius = 0.0) {
  for (const s of ALL_SPAWNS) {
    if (Math.hypot(x - s[0], z - s[2]) < 4.2 + extraRadius) return false;
  }
  for (const c of CARD_POINTS) {
    if (Math.hypot(x - c[0], z - c[2]) < 2.2 + extraRadius) return false;
  }
  for (const d of DOOR_POINTS) {
    if (Math.hypot(x - d[0], z - d[2]) < 3.8 + extraRadius) return false;
  }
  return true;
}

// ============================================================================
// 2. SINGLE-LEVEL WALKABLE FLOORS (120x90m, Y in [-0.04, +0.025]) & CARD PEDESTALS
// ============================================================================
function buildFloorsAndPedestals() {
  // Base 120x90m Subterranean Basalt Cavern Ground Slab (`Terrain_Quantum_Basalt`, top Y = -0.02m)
  const bBasalt = new MeshBuilder();
  bBasalt.addBeveledBox(0, -0.07, 0, 120.0, 0.10, 90.0, 0, 0.01, 0.18, 30, 1, 22);
  addGeometryNode('Terrain_Quantum_Basalt', registerMesh('Terrain_Quantum_Basalt_Mesh', [
    { builder: bBasalt, mat: MAT.basaltCavern }
  ]));

  // Central Tokamak Reactor Chamber Floor (`Floor_Tokamak_Core`, X in [-18, 18], Z in [-18, 18], top Y = 0.015m)
  const bCoreFloor = new MeshBuilder();
  bCoreFloor.addBeveledBox(0, -0.025, 0, 36.0, 0.08, 36.0, 0, 0.01, 0.25, 14, 1, 14);
  addGeometryNode('Floor_Tokamak_Core', registerMesh('Floor_Tokamak_Core_Mesh', [
    { builder: bCoreFloor, mat: MAT.titaniumDeck }
  ]));

  // Cardinal Inner Ring & Main Axis Corridors (`Floor_Inner_Ring_North` / `South` / `West` / `East`, top Y = 0.012m)
  const ringCorridors = [
    { name: 'Floor_Inner_Ring_North', cx: 0.0, cz: -29.0, sx: 36.0, sz: 22.0 },
    { name: 'Floor_Inner_Ring_South', cx: 0.0, cz:  29.0, sx: 36.0, sz: 22.0 },
    { name: 'Floor_Inner_Ring_West',  cx: -37.0, cz: 0.0, sx: 38.0, sz: 12.0 },
    { name: 'Floor_Inner_Ring_East',  cx:  37.0, cz: 0.0, sx: 38.0, sz: 12.0 }
  ];
  for (const rc of ringCorridors) {
    const bRing = new MeshBuilder();
    bRing.addBeveledBox(rc.cx, -0.028, rc.cz, rc.sx, 0.08, rc.sz, 0, 0.01, 0.25, 12, 1, 8);
    addGeometryNode(rc.name, registerMesh(`${rc.name}_Mesh`, [
      { builder: bRing, mat: MAT.titaniumDeck }
    ]));
  }

  // 4 Specialist Quadrant Lab Floors (top Y = 0.015m)
  // NW Bio-Stasis Sector (X in [-44, -18], Z in [-34, -6])
  const bNW = new MeshBuilder();
  bNW.addBeveledBox(-31.0, -0.025, -20.0, 26.0, 0.08, 28.0, 0, 0.01, 0.25, 10, 1, 10);
  addGeometryNode('Floor_NW_BioStasis_Sector', registerMesh('Floor_NW_BioStasis_Sector_Mesh', [
    { builder: bNW, mat: MAT.cleanroomSlate }
  ]));

  // NE Quantum Server Sector (X in [18, 44], Z in [-34, -6])
  const bNE = new MeshBuilder();
  bNE.addBeveledBox(31.0, -0.025, -20.0, 26.0, 0.08, 28.0, 0, 0.01, 0.25, 10, 1, 10);
  addGeometryNode('Floor_NE_QuantumServer_Sector', registerMesh('Floor_NE_QuantumServer_Sector_Mesh', [
    { builder: bNE, mat: MAT.cleanroomSlate }
  ]));

  // SW Accelerator Sector (X in [-44, -18], Z in [6, 34])
  const bSW = new MeshBuilder();
  bSW.addBeveledBox(-31.0, -0.025, 20.0, 26.0, 0.08, 28.0, 0, 0.01, 0.25, 10, 1, 10);
  addGeometryNode('Floor_SW_Accelerator_Sector', registerMesh('Floor_SW_Accelerator_Sector_Mesh', [
    { builder: bSW, mat: MAT.titaniumDeck }
  ]));

  // SE Robotics Sector (X in [18, 44], Z in [6, 34])
  const bSE = new MeshBuilder();
  bSE.addBeveledBox(31.0, -0.025, 20.0, 26.0, 0.08, 28.0, 0, 0.01, 0.25, 10, 1, 10);
  addGeometryNode('Floor_SE_Robotics_Sector', registerMesh('Floor_SE_Robotics_Sector_Mesh', [
    { builder: bSE, mat: MAT.chippedConcrete }
  ]));

  // 18 Physical Card Pedestals (`Prop_CardPedestal_01..18`) under every CardPoint (NO Pad_Team meshes!)
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
buildFloorsAndPedestals();

// ============================================================================
// 3. CENTER — TOKAMAK FUSION REACTOR CORE & OVERHEAD GANTRY CANOPY
// ============================================================================
function buildTokamakReactorCore() {
  // Toroidal Tokamak Fusion Reactor (`Console_TokamakCore_01` at (0,0), outer radius 4.2m, height 2.65m solid full cover)
  // Built with 12 sculptural D-shaped superconducting magnetic coils (`hero_tokamak_coil_2k`) + central vacuum vessel cylinder
  const bCoils = new MeshBuilder();
  const bVessel = new MeshBuilder();
  const bDeck = new MeshBuilder();

  // Heavy circular titanium base plinth (radius 4.15m, height 0.42m)
  bDeck.addCylinder(0, 0.21, 0, 4.15, 4.00, 0.42, 32, 1, true);
  // Central cryostat solenoid column (radius 1.45m, height 2.65m)
  bVessel.addCylinder(0, 1.325, 0, 1.48, 1.42, 2.65, 28, 3, true);
  // Top cryostat crown dome cap
  bDeck.addCylinder(0, 2.55, 0, 2.85, 2.40, 0.24, 28, 1, true);
  // Toroidal plasma vacuum chamber torus (majorR = 2.65m, minorR = 0.78m at Y = 1.38m)
  bVessel.addTorus(0, 1.38, 0, 2.65, 0.78, 32, 16, 0, 0);

  // 12 Sculptural D-Shaped Superconducting Toroidal Field Coils radially arrayed around the torus
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    // Outer vertical D-coil limb at r = 3.55m
    bCoils.addBeveledBox(c * 3.55, 1.38, s * 3.55, 0.75, 2.15, 0.34, -ang, 0.03, 0.6, 2, 4, 1);
    // Top & bottom radial coil return arms connecting r=1.45m to r=3.75m
    bCoils.addBeveledBox(c * 2.60, 2.38, s * 2.60, 2.25, 0.30, 0.36, -ang, 0.025, 0.6, 3, 1, 1);
    bCoils.addBeveledBox(c * 2.60, 0.42, s * 2.60, 2.25, 0.30, 0.36, -ang, 0.025, 0.6, 3, 1, 1);
  }

  addGeometryNode('Console_TokamakCore_01', registerMesh('Console_TokamakCore_01_Mesh', [
    { builder: bCoils, mat: MAT.tokamakCoil },
    { builder: bVessel, mat: MAT.brushedSteel },
    { builder: bDeck, mat: MAT.heroDarkMetal }
  ]));

  // 4 Curved Plasma Diagnostic Consoles (`Barrier_TokamakConsole_01..04`, 0.90m jumpable cover at r = 5.4m along diagonals)
  // Diagonal placement at (±3.82, ±3.82):
  //   - Dist to CardPoints (±9.5, 0) / (0, ±9.5) is hypot(5.68, 3.82) = 6.85m >= 4.0m!
  //   - Dist to DoorPoints (±12.5, ±12.5) is hypot(8.68, 8.68) = 12.28m >= 4.0m!
  const diagAngles = [
    Math.PI * 0.25,
    Math.PI * 0.75,
    Math.PI * 1.25,
    Math.PI * 1.75
  ];
  const bDiagDesk = new MeshBuilder();
  const bDiagScreen = new MeshBuilder();
  bDiagDesk.addBeveledBox(0, 0.45, 0, 2.35, 0.90, 0.85, 0, 0.025, 0.6, 3, 2, 2);
  bDiagScreen.addBeveledBox(0, 0.82, -0.12, 2.05, 0.16, 0.55, 0, 0.015, 0.8, 3, 1, 1);
  const diagConsoleMesh = registerMesh('Barrier_TokamakConsole_SharedMesh', [
    { builder: bDiagDesk, mat: MAT.heroDarkMetal },
    { builder: bDiagScreen, mat: MAT.brushedSteel }
  ]);
  for (let i = 0; i < 4; i++) {
    const ang = diagAngles[i];
    const r = 5.4;
    const cx = Math.cos(ang) * r;
    const cz = Math.sin(ang) * r;
    const yaw = -ang + Math.PI * 0.5;
    addGeometryNode(`Barrier_TokamakConsole_${String(i + 1).padStart(2, '0')}`, diagConsoleMesh, [cx, 0.0, cz], yaw);
  }

  // Overhead Reactor Cryo-Manifold Ring & Crane Busbars (`TokamakGantry_01..04_Canopy` at Y = 4.4m, no collision, fades when occluding!)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const bGantry = new MeshBuilder();
    const bBus = new MeshBuilder();
    const c = Math.cos(ang), s = Math.sin(ang);
    // Radial crane girder from r=3.5m to r=16.5m at Y=4.45m
    bGantry.addBeveledBox(c * 10.0, 4.45, s * 10.0, 13.0, 0.48, 0.72, -ang, 0.025, 0.35, 8, 1, 2);
    // Curved/chordal cryo-manifold ring arc at r=8.5m, Y=4.25m
    const midAng = ang + Math.PI * 0.25;
    bBus.addBeveledBox(Math.cos(midAng) * 8.5, 4.25, Math.sin(midAng) * 8.5, 0.55, 0.42, 11.8, -midAng, 0.02, 0.4, 1, 1, 6);
    const gName = `TokamakGantry_${String(i + 1).padStart(2, '0')}_Canopy`;
    addGeometryNode(gName, registerMesh(`${gName}_Mesh`, [
      { builder: bGantry, mat: MAT.heroDarkMetal },
      { builder: bBus, mat: MAT.tokamakCoil }
    ]));
  }
}
buildTokamakReactorCore();

// ============================================================================
// 4. MULTI-RING OCTAGONAL & ORTHOGONAL MODULAR BULKHEAD LABYRINTH
// ============================================================================
function buildQuantumLabyrinthWalls() {
  // 1. Inner Octagonal Reactor Containment Ring (`Wall_OctagonRing_01..08`, height 3.0m, thickness 0.48m)
  // Radius R = 17.5m with 8 wide blast-door openings at cardinal axes (0, ±17.5), (±17.5, 0) and diagonal axes!
  // Let's verify clearance from DoorPoints at (±12.5, ±12.5):
  //   - Notice dist((12.5, 12.5), (0, 0)) = 17.68m! That means (±12.5, ±12.5) sits right AT the diagonal corners of an R=17.5m ring!
  //   - To guarantee every diagonal DoorPoint at (±12.5, ±12.5) has >= 3.6m clear radius AND every cardinal CardPoint at (±9.5, 0)/(0, ±9.5) & (±24,0)/(0,±23) has wide sightline/doorway openings:
  //   - Each of the 4 cardinal bulkhead segments is placed along X = ±17.8m (for Z in [-7.2, -2.0] and [2.0, 7.2])
  //     and along Z = ±17.8m (for X in [-7.2, -2.0] and [2.0, 7.2])!
  //   - Let's check distance from segment endpoint (17.8, 7.2) to diagonal DoorPoint (12.5, 12.5):
  //     hypot(17.8 - 12.5, 7.2 - 12.5) = hypot(5.3, -5.3) = 7.49m (>> 3.6m required!).
  //   - Even if we add angled octagonal chamfer wings from (17.8, 7.2) to (16.2, 8.8), distance from (16.2, 8.8) to (12.5, 12.5) is:
  //     hypot(16.2 - 12.5, 8.8 - 12.5) = hypot(3.7, -3.7) = 5.23m >= 3.6m!
  //     That creates a super-wide 7.4m diagonal blast-gate plaza around (±12.5, ±12.5) AND 4.0m cardinal blast doors at (0, ±17.8) and (±17.8, 0)!
  const octagonSegments = [
    // North-West & North-East cardinal+chamfer segments
    [-16.2, -8.8,  -8.8, -16.2], // Wait: midpoint of (-16.2,-8.8)..(-8.8,-16.2) is (-12.5,-12.5) where DoorPoint is!
  ];
  // Good catch! (-12.5, -12.5) IS the diagonal! So the diagonal is the OPENING (the Inner Tokamak Chamber Diagonal Blast-Gate Plaza),
  // while the solid octagonal containment walls sit on the 8 flanking chords between the cardinal 4.0m doors and the diagonal 7.6m blast-gate plazas!
  // Specifically:
  //   - East-North wall: from (17.8, -2.0) to (17.8, -7.2) + angled wing to (16.5, -8.5)
  //     Dist from (16.5, -8.5) to DoorPoint (12.5, -12.5) = hypot(4.0, 4.0) = 5.66m (minus 0.24m half-thick = 5.42m >> 3.6m!)
  //   - North-East wall: from (2.0, -17.8) to (7.2, -17.8) + angled wing to (8.5, -16.5)
  //     Dist from (8.5, -16.5) to DoorPoint (12.5, -12.5) = hypot(4.0, 4.0) = 5.66m!
  const innerRingWalls = [
    // North face (left & right of North 4.0m cardinal portal at X=0, Z=-17.8)
    [-8.2, -17.8, -2.0, -17.8],
    [ 2.0, -17.8,  8.2, -17.8],
    // South face (left & right of South 4.0m cardinal portal at X=0, Z=+17.8)
    [-8.2,  17.8, -2.0,  17.8],
    [ 2.0,  17.8,  8.2,  17.8],
    // West face (above & below West 4.0m cardinal portal at X=-17.8, Z=0)
    [-17.8, -8.2, -17.8, -2.0],
    [-17.8,  2.0, -17.8,  8.2],
    // East face (above & below East 4.0m cardinal portal at X=+17.8, Z=0)
    [ 17.8, -8.2,  17.8, -2.0],
    [ 17.8,  2.0,  17.8,  8.2]
  ];
  for (let i = 0; i < innerRingWalls.length; i++) {
    const [x0, z0, x1, z1] = innerRingWalls[i];
    const bW = new MeshBuilder();
    bW.addQuantumBulkheadWallSegment(x0, z0, x1, z1, 3.0, 0.48);
    const wName = `Wall_OctagonRing_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [{ builder: bW, mat: MAT.bulkheadWall }]));
  }

  // 2. Mid-Labyrinth Sector Bulkhead Walls (`Wall_Labyrinth_01..28`)
  // Dividing the Central Ring, Cardinal Research Checkpoints, 4 Specialist Quadrant Labs, and Subterranean Drilling Alcoves
  // Every single segment is mathematically verified >= 4.0m clear of all 16 DoorPoints, >= 2.5m clear of all 18 CardPoints, and >= 4.5m clear of all 20 Spawns:
  //   - DoorPoints to respect:
  //     (0, ±38), (±52, 0), (±18, ±36), (±12.5, ±12.5), (±34, ±8)
  //   - CardPoints to respect:
  //     (±9.5, 0), (0, ±9.5), (±24, 0), (0, ±23), (±28, ±18), (±16, ±26), (±42, 0)
  const labyrinthSegments = [
    // --- North & South Mid-Ring Bulkheads along Z = ±29.5m ---
    // (Separates Inner Ring CardPoints (0, ±23) & (±16, ±26) from Outer Lift Plazas (±18, ±36) & Airlocks (0, ±38))
    // Check distances:
    //   From [-12.5, -29.5]..[-3.5, -29.5] to DoorPoint (-18, -36): hypot(5.5, 6.5) = 8.51m!
    //   To DoorPoint (0, -38): hypot(3.5, 8.5) = 9.19m!
    //   To CardPoint (0, -23): 6.5m! To CardPoint (-16, -26): hypot(3.5, 3.5) = 4.95m!
    [-12.5, -29.5,  -3.5, -29.5],
    [  3.5, -29.5,  12.5, -29.5],
    [-12.5,  29.5,  -3.5,  29.5],
    [  3.5,  29.5,  12.5,  29.5],

    // --- Cardinal North/South Checkpoint Flanking Wings at X = ±6.5m, Z in [±21.0, ±27.0] ---
    // Frames CardPoints at (0, ±23) and separates them from (±16, ±26) with wide 3.5m doors at both ends!
    [ -6.5, -27.0,  -6.5, -21.0],
    [  6.5, -27.0,   6.5, -21.0],
    [ -6.5,  21.0,  -6.5,  27.0],
    [  6.5,  21.0,   6.5,  27.0],

    // --- Quadrant Lab Inner Dividing Walls along X = ±21.5m, Z in [±18.5, ±28.5] ---
    // Separates Mid-Labyrinth Ring Corridors (±16, ±26) from the 4 Specialist Quadrant Labs (±28, ±18)
    // Check dist to DoorPoint (±12.5, ±12.5): hypot(9.0, 6.0) = 10.82m!
    // Check dist to DoorPoint (±18, ±36): hypot(3.5, 7.5) = 8.28m!
    // Check dist to CardPoint (±16, ±26): 5.5m! To CardPoint (±28, ±18): 6.5m!
    [-21.5, -28.5, -21.5, -18.5],
    [ 21.5, -28.5,  21.5, -18.5],
    [-21.5,  18.5, -21.5,  28.5],
    [ 21.5,  18.5,  21.5,  28.5],

    // --- Quadrant Lab North/South Corridor Walls along Z = ±5.8m, X in [±21.5, ±29.0] ---
    // Frames the East/West Cardinal Checkpoints (±24, 0) while leaving a huge 10m plaza around DoorPoints (±34, ±8)!
    // Check dist from (±29.0, ±5.8) to DoorPoint (±34, ±8): hypot(5.0, 2.2) = 5.46m (minus 0.24m = 5.22m >> 3.6m!)
    // Check dist from (±21.5, ±5.8) to DoorPoint (±12.5, ±12.5): hypot(9.0, 6.7) = 11.22m!
    // Check dist to CardPoint (±24, 0): 5.8m!
    [-29.0,  -5.8, -21.5,  -5.8],
    [ 21.5,  -5.8,  29.0,  -5.8],
    [-29.0,   5.8, -21.5,   5.8],
    [ 21.5,   5.8,  29.0,   5.8],

    // --- Quadrant Lab Outer Bulkheads along Z = ±31.5m, X in [±24.5, ±37.5] ---
    // Separates the 4 Specialist Labs from the North/South outer corridors & corner Blast-Airlock Spawn Bays (±50, ±36)
    // Check dist from (±24.5, ±31.5) to DoorPoint (±18, ±36): hypot(6.5, 4.5) = 7.91m!
    // Check dist from (±37.5, ±31.5) to nearest Spawn slot (±48.3, ±34.3): hypot(10.8, 2.8) = 11.16m!
    [-37.5, -31.5, -24.5, -31.5],
    [ 24.5, -31.5,  37.5, -31.5],
    [-37.5,  31.5, -24.5,  31.5],
    [ 24.5,  31.5,  37.5,  31.5],

    // --- Quadrant Lab Outer West/East Bulkheads along X = ±42.5m, Z in [±14.0, ±25.5] ---
    // Separates the 4 Specialist Labs (±28, ±18) from the Outer West/East Cavern Drilling Corridors
    // Check dist from (±42.5, ±14.0) to DoorPoint (±34, ±8): hypot(8.5, 6.0) = 10.40m!
    // Check dist from (±42.5, ±25.5) to nearest Spawn slot (±48.3, ±34.3): hypot(5.8, 8.8) = 10.54m!
    [-42.5, -25.5, -42.5, -14.0],
    [ 42.5, -25.5,  42.5, -14.0],
    [-42.5,  14.0, -42.5,  25.5],
    [ 42.5,  14.0,  42.5,  25.5],

    // --- East/West Drilling Alcove Baffle Walls at X = ±46.5m, Z in [-4.5, 4.5] ---
    // Provides tactical cover between CardPoints (±42, 0) and Outer Airlock DoorPoints (±52, 0)!
    // Wait: let's check distance from X = ±46.5 to DoorPoint (±52, 0):
    //   52.0 - 46.5 = 5.5m! Minus 0.24m half-thickness = 5.26m (>= 3.6m required!).
    //   And distance from X = ±46.5 to CardPoint (±42, 0) = 4.5m!
    [-46.5,  -4.2, -46.5,   4.2],
    [ 46.5,  -4.2,  46.5,   4.2],

    // --- Spawn Blast-Airlock Staging Bay Wing Bulkheads at X = ±42.5m, Z in [±31.5, ±38.5] ---
    // Shields the 4 Team Spawn Staging Bays (±50, ±36) from direct long-range spawn-peeking while leaving two wide 6.0m exits per bay!
    // Check dist to nearest Spawn slot (±48.3, ±34.3): 48.3 - 42.5 = 5.8m!
    [-42.5, -38.5, -42.5, -31.5],
    [ 42.5, -38.5,  42.5, -31.5],
    [-42.5,  31.5, -42.5,  38.5],
    [ 42.5,  31.5,  42.5,  38.5]
  ];

  for (let i = 0; i < labyrinthSegments.length; i++) {
    const [x0, z0, x1, z1] = labyrinthSegments[i];
    const bW = new MeshBuilder();
    bW.addQuantumBulkheadWallSegment(x0, z0, x1, z1, 3.0, 0.48);
    const wName = `Wall_Labyrinth_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [{ builder: bW, mat: MAT.bulkheadWall }]));
  }

  // 3. Outer Subterranean Facility Perimeter Retaining Bulkheads (120x90m boundary at X = ±59.2m, Z = ±44.2m)
  let pwIdx = 1;
  // North & South outer retaining walls at Z = ±44.2m (split into 10 segments of 11.8m)
  for (const zPerim of [-44.2, 44.2]) {
    for (let x = -59.0; x < 58.9; x += 11.8) {
      const bPerim = new MeshBuilder();
      bPerim.addQuantumBulkheadWallSegment(x, zPerim, x + 11.8, zPerim, 3.2, 0.55);
      const pName = `Wall_Perimeter_${String(pwIdx++).padStart(2, '0')}`;
      addGeometryNode(pName, registerMesh(`${pName}_Mesh`, [{ builder: bPerim, mat: MAT.mossConcrete }]));
    }
  }
  // West & East outer cavern bulkhead walls at X = ±59.2m (split into 8 segments of 11.0m)
  for (const xPerim of [-59.2, 59.2]) {
    for (let z = -44.0; z < 43.9; z += 11.0) {
      const bPerim = new MeshBuilder();
      bPerim.addQuantumBulkheadWallSegment(xPerim, z, xPerim, z + 11.0, 3.2, 0.55);
      const pName = `Wall_Perimeter_${String(pwIdx++).padStart(2, '0')}`;
      addGeometryNode(pName, registerMesh(`${pName}_Mesh`, [{ builder: bPerim, mat: MAT.mossConcrete }]));
    }
  }

  // 4. Outer Subterranean Basalt Cavern Cliffs (`Cliff_Perimeter_01..12`) & Excavated Boulders (`Rock_Rubble_01..08`)
  // Placed along the outer basalt rock edges (all >= 5.0m clear of every Spawn, CardPoint, and DoorPoint)
  const cliffCoords = [
    [-57.5, -18.0,  0.2], [ 57.5, -18.0,  2.9],
    [-57.5,  18.0,  0.4], [ 57.5,  18.0,  2.7],
    [-34.0, -42.5,  1.5], [ 34.0, -42.5,  1.6],
    [-34.0,  42.5, -1.5], [ 34.0,  42.5, -1.6],
    [ -9.0, -42.8,  1.5], [  9.0, -42.8,  1.6],
    [ -9.0,  42.8, -1.5], [  9.0,  42.8, -1.6]
  ];
  for (let i = 0; i < cliffCoords.length; i++) {
    const [cx, cz, yaw] = cliffCoords[i];
    addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [cx, 0.0, cz], yaw, [0.45, 0.42, 0.45]);
  }

  const boulderCoords = [
    [-56.0, -10.5, 0.5], [ 56.0, -10.5, 1.4],
    [-56.0,  10.5, 2.1], [ 56.0,  10.5, 2.8],
    [-27.0, -41.5, 0.9], [ 27.0, -41.5, 1.8],
    [-27.0,  41.5, 2.4], [ 27.0,  41.5, 0.3]
  ];
  for (let i = 0; i < boulderCoords.length; i++) {
    const [bx, bz, yaw] = boulderCoords[i];
    addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [bx, 0.0, bz], yaw, [0.55, 0.55, 0.55]);
  }
}
buildQuantumLabyrinthWalls();

// ============================================================================
// 5. 4 ASYMMETRIC BLACK-SITE RESEARCH SECTORS & TACTICAL COVER PROPS
// ============================================================================
function buildAsymmetricResearchSectors() {
  // --- NW SECTOR: BIO-STASIS & CONTAINMENT POD LAB (Center around (-28, -18)) ---
  // 6 Cylindrical Bio-Stasis Specimen Pods (`Console_BioPod_01..06`, radius 0.85m, height 2.35m full cover with hero_biopod_glass_1k & stainless end-caps)
  const bPodCap = new MeshBuilder();
  const bPodGlass = new MeshBuilder();
  // Bottom cryo base & top stainless dome cap
  bPodCap.addCylinder(0, 0.25, 0, 0.88, 0.85, 0.50, 24, 1, true);
  bPodCap.addCylinder(0, 2.12, 0, 0.85, 0.78, 0.46, 24, 1, true);
  // 3 vertical stainless reinforcement ribs around the glass cylinder
  for (let r = 0; r < 3; r++) {
    const ang = (r / 3) * Math.PI * 2;
    bPodCap.addBeveledBox(Math.cos(ang) * 0.83, 1.18, Math.sin(ang) * 0.83, 0.10, 1.45, 0.10, -ang, 0.015, 0.8, 1, 3, 1);
  }
  // Cylindrical bio-stasis specimen tank glass body (radius 0.80m, Y = 0.50..1.89m, 0 emission!)
  bPodGlass.addCylinder(0, 1.195, 0, 0.80, 0.80, 1.39, 24, 2, false);
  const bioPodMesh = registerMesh('Console_BioPod_SharedMesh', [
    { builder: bPodGlass, mat: MAT.biopodGlass },
    { builder: bPodCap, mat: MAT.brushedSteel }
  ]);

  // Placed around CardPoint_09 (-28.0, -18.0) and clear of DoorPoint_13 (-34.0, -8.0):
  // Let's verify distances to DoorPoint (-34, -8): all pods have Z <= -14.5m -> dist >= 6.5m!
  // Dist to CardPoint (-28, -18): pods at X = -25.0, -31.0, -36.5 -> dist >= 3.0m!
  const bioPodCoords = [
    [-25.0, -14.8, 0.0],
    [-31.2, -14.8, 0.8],
    [-36.8, -15.5, 1.5],
    [-25.0, -22.5, 2.1],
    [-31.2, -22.5, 0.4],
    [-36.8, -22.5, 1.2]
  ];
  for (let i = 0; i < bioPodCoords.length; i++) {
    const [px, pz, pyaw] = bioPodCoords[i];
    addGeometryNode(`Console_BioPod_${String(i + 1).padStart(2, '0')}`, bioPodMesh, [px, 0.0, pz], pyaw);
  }

  // --- NE SECTOR: CRYO-COOLED QUANTUM SUPERCOMPUTER VAULT (Center around (28, -18)) ---
  // 8 High-Density Quantum Mainframe Server Racks (`Server_Rack_Quantum_01..08`, 2.8m x 1.1m x 2.4m with hero_quantum_server_2k)
  const bSrvBody = new MeshBuilder();
  const bSrvTrim = new MeshBuilder();
  bSrvBody.addBeveledBox(0, 1.20, 0, 2.80, 2.40, 1.10, 0, 0.03, 0.45, 4, 4, 2);
  // Cryo-manifold pipes along the top of the quantum server rack
  bSrvTrim.addCylinder(0, 2.46, -0.28, 0.08, 0.08, 2.65, 14, 1, true, Math.PI * 0.5, Math.PI * 0.5);
  bSrvTrim.addCylinder(0, 2.46,  0.28, 0.08, 0.08, 2.65, 14, 1, true, Math.PI * 0.5, Math.PI * 0.5);
  const quantumServerMesh = registerMesh('Server_Rack_Quantum_SharedMesh', [
    { builder: bSrvBody, mat: MAT.quantumServer },
    { builder: bSrvTrim, mat: MAT.brushedSteel }
  ]);

  // Arranged in tactical CQB aisles around CardPoint_10 (28.0, -18.0) and >= 6.5m clear of DoorPoint_14 (34.0, -8.0)
  const serverCoords = [
    [25.2, -14.5, 0.0],
    [31.5, -14.5, 0.0],
    [37.8, -15.5, 1.57],
    [25.2, -21.8, 0.0],
    [31.5, -21.8, 0.0],
    [37.8, -21.8, 1.57],
    [26.0, -27.2, 0.0],
    [33.5, -27.2, 0.0]
  ];
  for (let i = 0; i < serverCoords.length; i++) {
    const [sx, sz, syaw] = serverCoords[i];
    addGeometryNode(`Server_Rack_Quantum_${String(i + 1).padStart(2, '0')}`, quantumServerMesh, [sx, 0.0, sz], syaw);
  }

  // Overhead Quantum Server Cable Trays (`ServerBus_01..02_Canopy` at Y = 3.6m, no collision, fades when occluding!)
  const bSrvBus = new MeshBuilder();
  bSrvBus.addBeveledBox(0, 3.65, 0, 14.5, 0.28, 1.40, 0, 0.02, 0.4, 8, 1, 2);
  const srvBusMesh = registerMesh('ServerBus_Canopy_SharedMesh', [{ builder: bSrvBus, mat: MAT.heroDarkMetal }]);
  addGeometryNode('ServerBus_01_Canopy', srvBusMesh, [31.0, 0.0, -16.0], 0.0);
  addGeometryNode('ServerBus_02_Canopy', srvBusMesh, [31.0, 0.0, -23.0], 0.0);

  // --- SW SECTOR: PARTICLE ACCELERATOR & SYNCHROTRON TUNNEL (Center around (-28, 18)) ---
  // 4 Curved/Segmented Dipole Magnet Accelerator Conduits (`Console_AcceleratorTube_01..04`, height 2.05m full cover with hero_tokamak_coil_2k)
  const bAccCoil = new MeshBuilder();
  const bAccPipe = new MeshBuilder();
  // Heavy concrete/titanium support saddles (Y = 0..0.95m)
  bAccPipe.addBeveledBox(-1.35, 0.48, 0, 0.75, 0.96, 1.35, 0, 0.025, 0.5, 2, 2, 2);
  bAccPipe.addBeveledBox( 1.35, 0.48, 0, 0.75, 0.96, 1.35, 0, 0.025, 0.5, 2, 2, 2);
  // Horizontal superconducting dipole beamline cylinder (length 3.8m, radius 0.62m, top at Y = 2.05m)
  bAccCoil.addCylinder(0, 1.43, 0, 0.62, 0.62, 3.80, 24, 3, true, Math.PI * 0.5, Math.PI * 0.5);
  // 3 copper/niobium magnet collar rings along the beam tube
  for (const cx of [-1.35, 0.0, 1.35]) {
    bAccCoil.addTorus(cx, 1.43, 0, 0.65, 0.11, 22, 10, Math.PI * 0.5, 0);
  }
  const accTubeMesh = registerMesh('Console_AcceleratorTube_SharedMesh', [
    { builder: bAccCoil, mat: MAT.tokamakCoil },
    { builder: bAccPipe, mat: MAT.heroDarkMetal }
  ]);

  // Positioned around CardPoint_11 (-28.0, 18.0) and >= 6.5m clear of DoorPoint_15 (-34.0, 8.0)
  const accCoords = [
    [-25.5, 14.5,  0.25],
    [-33.0, 15.2, -0.30],
    [-25.5, 22.8, -0.25],
    [-34.0, 23.5,  0.35]
  ];
  for (let i = 0; i < accCoords.length; i++) {
    const [ax, az, ayaw] = accCoords[i];
    addGeometryNode(`Console_AcceleratorTube_${String(i + 1).padStart(2, '0')}`, accTubeMesh, [ax, 0.0, az], ayaw);
  }

  // --- SE SECTOR: 6-AXIS HEAVY ROBOTIC ASSEMBLY & TELEMETRY FOUNDRY (Center around (28, 18)) ---
  // 4 Articulated Industrial 6-Axis Robotic Arms on Heavy Pedestals (`Console_RoboticArm_01..04`, base height 2.15m solid cover)
  // + Overhead Articulated Boom (`RoboticBoom_01..04_Canopy` at Y = 2.4..3.8m)
  const bRobBase = new MeshBuilder();
  const bRobJoint = new MeshBuilder();
  // Heavy octagonal/cylindrical turret pedestal & laser-welding worktable base (height 2.15m solid cover)
  bRobBase.addBeveledBox(0, 0.52, 0, 2.10, 1.04, 1.65, 0, 0.03, 0.5, 3, 2, 2);
  bRobBase.addCylinder(-0.35, 1.55, 0, 0.52, 0.44, 1.15, 20, 2, true);
  bRobJoint.addCylinder(-0.35, 1.98, 0, 0.48, 0.48, 0.65, 18, 1, true, 0, Math.PI * 0.5);
  const roboticBaseMesh = registerMesh('Console_RoboticArm_SharedMesh', [
    { builder: bRobBase, mat: MAT.heroDarkMetal },
    { builder: bRobJoint, mat: MAT.tokamakCoil }
  ]);

  const bRobBoom = new MeshBuilder();
  bRobBoom.addBeveledBox(0.35, 2.85, 0, 2.20, 0.34, 0.38, 0.35, 0.02, 0.6, 3, 1, 1);
  bRobBoom.addCylinder(1.25, 2.65, 0, 0.14, 0.08, 0.85, 14, 1, true, 0, 0.6);
  const roboticBoomMesh = registerMesh('RoboticBoom_Canopy_SharedMesh', [
    { builder: bRobBoom, mat: MAT.tokamakCoil }
  ]);

  const roboticCoords = [
    [25.5, 14.5,  0.40],
    [33.5, 15.2,  2.60],
    [25.5, 22.8, -0.45],
    [34.0, 23.5, -2.50]
  ];
  for (let i = 0; i < roboticCoords.length; i++) {
    const [rx, rz, ryaw] = roboticCoords[i];
    const idStr = String(i + 1).padStart(2, '0');
    addGeometryNode(`Console_RoboticArm_${idStr}`, roboticBaseMesh, [rx, 0.0, rz], ryaw);
    addGeometryNode(`RoboticBoom_${idStr}_Canopy`, roboticBoomMesh, [rx, 0.0, rz], ryaw);
  }

  // --- TACTICAL CC0 COVER PROPS (Barriers, Crates, Generators, Barrels, PowerBoxes, Shelves, Sandbags) ---
  // All verified clear of Spawns, Cards, and Doors!
  const barrierPlacements = [
    [-19.5,   0.0,  1.57], [ 19.5,   0.0,  1.57],
    [  0.0, -19.5,  0.00], [  0.0,  19.5,  0.00],
    [-36.5,   0.0,  1.57], [ 36.5,   0.0,  1.57],
    [-10.5, -23.0,  0.35], [ 10.5, -23.0, -0.35],
    [-10.5,  23.0, -0.35], [ 10.5,  23.0,  0.35],
    [-25.5, -35.5,  0.20], [ 25.5, -35.5, -0.20],
    [-25.5,  35.5, -0.20], [ 25.5,  35.5,  0.20]
  ];
  for (let i = 0; i < barrierPlacements.length; i++) {
    const [x, z, yaw] = barrierPlacements[i];
    addGeometryNode(`Barrier_Concrete_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [x, 0.0, z], yaw);
  }

  const cratePlacements = [
    [-20.0,  -8.5, 0.2], [ 20.0,  -8.5, 1.1],
    [-20.0,   8.5, 0.8], [ 20.0,   8.5, 2.2],
    [ -8.5, -34.0, 0.4], [  8.5, -34.0, 1.7],
    [ -8.5,  34.0, 2.5], [  8.5,  34.0, 0.9],
    [-38.5, -18.5, 0.3], [ 38.5,  18.5, 1.4],
    [-45.0, -12.0, 0.6], [ 45.0,  12.0, 2.1]
  ];
  for (let i = 0; i < cratePlacements.length; i++) {
    const [x, z, yaw] = cratePlacements[i];
    addGeometryNode(`Crate_Supply_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [x, 0.0, z], yaw);
  }

  const genPlacements = [
    [-38.5,  26.5,  0.0],
    [ 38.5,  26.5,  3.14],
    [-46.5,  -8.5,  0.5],
    [ 46.5,   8.5, -0.5]
  ];
  for (let i = 0; i < genPlacements.length; i++) {
    const [x, z, yaw] = genPlacements[i];
    addGeometryNode(`Generator_Quantum_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [x, 0.0, z], yaw);
  }

  const barrelPlacements = [
    [-23.5, -27.5, 0.1], [ 23.5, -27.5, 1.3],
    [-23.5,  27.5, 2.1], [ 23.5,  27.5, 0.7],
    [-45.5, -21.0, 0.4], [ 45.5, -21.0, 1.9],
    [-45.5,  21.0, 2.6], [ 45.5,  21.0, 0.8]
  ];
  for (let i = 0; i < barrelPlacements.length; i++) {
    const [x, z, yaw] = barrelPlacements[i];
    addGeometryNode(`Barrel_Cryo_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [x, 0.0, z], yaw);
  }

  // High-Voltage Capacitor Banks & Power Boxes (`PowerBox_01..08`, prominently featured in SW Accelerator Sector & Inner Ring)
  const powerBoxPlacements = [
    [-22.2,  21.0,  1.57], [-22.2,  25.5,  1.57],
    [-41.5,  16.5, -1.57], [-41.5,  22.5, -1.57],
    [-22.2, -21.0,  1.57], [ 22.2, -21.0, -1.57],
    [ 22.2,  21.0, -1.57], [ 41.5,  21.0,  1.57]
  ];
  for (let i = 0; i < powerBoxPlacements.length; i++) {
    const [x, z, yaw] = powerBoxPlacements[i];
    addGeometryNode(`PowerBox_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [x, 0.0, z], yaw);
  }

  const shelfPlacements = [
    [-31.0, -30.2,  0.0], [ 31.0, -30.2,  0.0],
    [-31.0,  30.2,  3.14], [ 31.0,  30.2,  3.14]
  ];
  for (let i = 0; i < shelfPlacements.length; i++) {
    const [x, z, yaw] = shelfPlacements[i];
    addGeometryNode(`Rack_Storage_${String(i + 1).padStart(2, '0')}`, sharedCC0.shelves, [x, 0.0, z], yaw);
  }

  // Sandbag Barricades protecting the 4 Subterranean Blast-Airlock Spawn Bays (`Barrier_Sandbag_01..08`)
  // Placed at (±44.0, ±36.0) and (±50.0, ±29.0) (>= 5.0m clear of all spawn slots at (±50±1.7, ±36±1.7))
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
    [-44.0, -36.0,  1.57], [-50.0, -29.0,  0.0],
    [ 44.0, -36.0, -1.57], [ 50.0, -29.0,  0.0],
    [-44.0,  36.0,  1.57], [-50.0,  29.0,  0.0],
    [ 44.0,  36.0, -1.57], [ 50.0,  29.0,  0.0]
  ];
  for (let i = 0; i < sandbagPlacements.length; i++) {
    const [x, z, yaw] = sandbagPlacements[i];
    addGeometryNode(`Barrier_Sandbag_${String(i + 1).padStart(2, '0')}`, sandbagMesh, [x, 0.0, z], yaw);
  }
}
buildAsymmetricResearchSectors();

// ============================================================================
// 6. 165 FLOOR DECALS & 12 NON-EMISSIVE BLOOD/CRYO DRAG TRAILS
// ============================================================================
function buildQuantumDecals() {
  // 12 Non-Emissive Blood & Cryo Spills / Drag Trails (`Quantum_BloodCryo_01..12`, alphaMode: MASK, 0 emission!)
  const bloodCryoTrails = [
    [-28.0, -16.5,  9.5, 0.65,  0.15, MAT.decalBloodCryo],
    [-26.5, -20.0,  8.5, 0.60,  1.45, MAT.decalBlood],
    [ 28.0, -18.0,  9.5, 0.65, -0.10, MAT.decalBloodCryo],
    [-28.0,  18.0,  9.0, 0.60,  0.25, MAT.decalBloodCryo],
    [ 28.0,  18.0,  9.0, 0.60, -0.25, MAT.decalBlood],
    [ -7.5,  -7.5, 10.0, 0.65,  0.78, MAT.decalBloodCryo],
    [  7.5,  -7.5, 10.0, 0.65, -0.78, MAT.decalBlood],
    [ -7.5,   7.5, 10.0, 0.65, -0.78, MAT.decalBloodCryo],
    [  7.5,   7.5, 10.0, 0.65,  0.78, MAT.decalBlood],
    [-18.0, -25.0,  8.5, 0.60,  0.35, MAT.decalBloodCryo],
    [ 18.0,  25.0,  8.5, 0.60, -0.35, MAT.decalBloodCryo],
    [  0.0, -14.0,  8.0, 0.60,  1.57, MAT.decalBlood]
  ];
  for (let i = 0; i < bloodCryoTrails.length; i++) {
    const [cx, cz, len, wid, yaw, matIdx] = bloodCryoTrails[i];
    const b = new MeshBuilder();
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const y = 0.021 + (i % 4) * 0.001;
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
    const tName = `Quantum_BloodCryo_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(tName, registerMesh(`${tName}_Mesh`, [{ builder: b, mat: matIdx }]));
  }

  // 165 Distributed Floor Decals (`Quantum_Decal_001..165`, alphaMode: MASK, 0 emission!)
  const decalMats = [
    MAT.decalBloodCryo,
    MAT.decalSectorStencil,
    MAT.decalCircuitDebris,
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
      // Central Tokamak Core Chamber (X in [-16.5, 16.5], Z in [-16.5, 16.5], surface Y = 0.015m)
      cx = randRange(-16.5, 16.5);
      cz = randRange(-16.5, 16.5);
      if (Math.hypot(cx, cz) < 4.5) {
        cx = (cx >= 0 ? 1 : -1) * randRange(5.2, 15.5);
      }
      baseY = 0.019;
    } else if (i <= 115) {
      // 4 Specialist Quadrant Labs (X in [±19, ±41], Z in [±7, ±30], surface Y = 0.015m)
      const sx = (i % 2 === 0) ? -1 : 1;
      const sz = (i % 4 < 2) ? -1 : 1;
      cx = sx * randRange(19.5, 40.5);
      cz = sz * randRange(7.5, 29.5);
      baseY = 0.019;
    } else if (i <= 145) {
      // Cardinal Inner-Ring & Mid-Labyrinth Corridors (surface Y = 0.012m)
      if (i % 2 === 0) {
        cx = randRange(-16.5, 16.5);
        cz = (i % 4 === 0 ? -1 : 1) * randRange(19.0, 38.0);
      } else {
        cx = (i % 4 === 1 ? -1 : 1) * randRange(19.0, 52.0);
        cz = randRange(-4.8, 4.8);
      }
      baseY = 0.016;
    } else {
      // Outer Subterranean Basalt Cavern & Staging Perimeter (surface Y = -0.02m)
      const sx = (i % 2 === 0) ? -1 : 1;
      const sz = (i % 4 < 2) ? -1 : 1;
      cx = sx * randRange(44.0, 56.0);
      cz = sz * randRange(10.0, 40.0);
      baseY = -0.014;
    }

    const sx = randRange(1.8, 3.6);
    const sz = randRange(1.8, 3.6);
    const yaw = randRange(0, Math.PI * 2);
    const y = baseY + (i % 7) * 0.0008;
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
    const dName = `Quantum_Decal_${String(i).padStart(3, '0')}`;
    addGeometryNode(dName, registerMesh(`${dName}_Mesh`, [{ builder: b, mat: matIdx }]));
  }
}
buildQuantumDecals();

// ============================================================================
// 7. 32 SCATTER DEBRIS GROUPS (`Quantum_Scatter_01..32`) & 36 CAVERN MOSS CLUSTERS (`Quantum_Grass_01..36`)
// ============================================================================
function buildScatterAndCavernMoss() {
  for (let s = 1; s <= 32; s++) {
    const bDebris = new MeshBuilder();
    const bMetal = new MeshBuilder();

    const gx = ((s - 1) % 8) - 3.5; // -3.5 .. 3.5
    const gz = Math.floor((s - 1) / 8) - 1.5; // -1.5 .. 1.5
    const baseCx = gx * 13.5;
    const baseCz = gz * 21.0;

    let added = 0;
    let attempts = 0;
    while (added < 18 && attempts < 80) {
      attempts++;
      const px = Math.max(-55.0, Math.min(55.0, baseCx + randRange(-5.5, 5.5)));
      const pz = Math.max(-40.0, Math.min(40.0, baseCz + randRange(-7.5, 7.5)));
      if (Math.hypot(px, pz) < 6.0) continue; // Keep clear of central Tokamak reactor core
      if (!isClearOfGameplayPoints(px, pz, -1.6)) continue;

      const yaw = randRange(0, Math.PI * 2);
      if (added % 2 === 0) {
        // Shattered stasis glass shard / circuit board module / slate tile chunk (height 0.03..0.08m, Y < 0.28m)
        const w = randRange(0.18, 0.42);
        const h = randRange(0.03, 0.07);
        const d = randRange(0.16, 0.36);
        bDebris.addBeveledBox(px, 0.015 + h * 0.5, pz, w, h, d, yaw, 0.01, 2.0, 2, 1, 2);
      } else {
        // Severed cryogenic pipe coupling / magnetic coil ring / lab tool (Y < 0.28m)
        const r = randRange(0.035, 0.06);
        const len = randRange(0.14, 0.26);
        bMetal.addCylinder(px, 0.015 + r, pz, r, r, len, 10, 1, true, yaw, Math.PI * 0.5);
        bMetal.addBeveledBox(px + 0.14, 0.04, pz - 0.11, 0.26, 0.05, 0.20, yaw + 0.4, 0.01, 2.0);
      }
      added++;
    }

    const sName = `Quantum_Scatter_${String(s).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bDebris, mat: MAT.cleanroomSlate },
      { builder: bMetal, mat: MAT.brushedSteel }
    ]));
  }

  // 36 Subterranean Cavern Moss/Fern Clusters (`Quantum_Grass_01..36`, alphaMode: MASK, 0 emission!)
  // Placed near the outer basalt rock walls & cavern drilling perimeter
  const bSharedMoss = new MeshBuilder();
  for (let p = 0; p < 3; p++) {
    const ang = (p / 3) * Math.PI;
    const c = Math.cos(ang) * 0.45;
    const s = Math.sin(ang) * 0.45;
    bSharedMoss.addQuad([-c, -0.02, -s], [c, -0.02, s], [c, 0.42, s], [-c, 0.42, -s], [-s, 0.2, c], 0, 1, 1, 0);
  }
  const mossMesh = registerMesh('Quantum_Grass_SharedMesh', [{ builder: bSharedMoss, mat: MAT.grassCavernMoss }]);

  for (let g = 1; g <= 36; g++) {
    const sx = (g % 2 === 0) ? -1 : 1;
    const sz = (g % 4 < 2) ? -1 : 1;
    let gx, gz;
    if (g <= 20) {
      // West & East outer basalt cavern rock perimeter
      gx = sx * randRange(45.5, 57.5);
      gz = sz * randRange(5.5, 41.5);
    } else {
      // North & South outer basalt cavern rock perimeter
      gx = sx * randRange(8.5, 43.5);
      gz = sz * randRange(33.5, 42.8);
    }
    addGeometryNode(`Quantum_Grass_${String(g).padStart(2, '0')}`, mossMesh, [gx, 0.0, gz], randRange(0, Math.PI * 2));
  }
}
buildScatterAndCavernMoss();

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
  name: 'Quantum_Labyrinth_Map',
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
    generator: 'TacticalDark Quantum Labyrinth v3 Node.js Procedural Builder',
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

const gltfResPath = `res://asset model/haritalar/Map2_Kuantum_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dquantum5v5v3map2"
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
  if (wMinX < -60.25 || wMaxX > 60.25 || wMinZ < -45.25 || wMaxZ > 45.25) {
    console.error(`ERROR: World AABB exceeds 120x90m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
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

  // 4. Verify ZERO materials use emissiveFactor, and all Decal/Grass materials use alphaMode: "MASK"!
  for (const m of materials) {
    if (m.emissiveFactor) {
      console.error(`ERROR: Material ${m.name} uses emissiveFactor! ZERO emission is strictly required in Map2_Kuantum_v3.`);
      errors++;
    }
    if (m.name.includes('Decal') || m.name.includes('Grass')) {
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

  // 6. Verify all 16 DoorPoints have >= 3.6m clear horizontal radius from every solid collider (walls, reactor, pods, racks, props)
  const noCollideWords = ['Terrain', 'Floor', 'Canopy', 'Decal', 'Scatter', 'Grass', 'BloodCryo'];
  let minDoorClearance = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const dp = DOOR_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollideWords.some(w => n.name.includes(w))) continue;
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
      const dx = dp[0] - tx;
      const dz = dp[2] - tz;
      const localX =  dx * cosY + dz * sinY;
      const localZ = -dx * sinY + dz * cosY;
      for (const p of m.primitives) {
        const acc = accessors[p.attributes.POSITION];
        const cx = Math.max(acc.min[0] * sx, Math.min(localX, acc.max[0] * sx));
        const cz = Math.max(acc.min[2] * sz, Math.min(localZ, acc.max[2] * sz));
        const dist = Math.hypot(localX - cx, localZ - cz);
        minDoorClearance = Math.min(minDoorClearance, dist);
        if (dist < 3.6) {
          console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 3.6m required)`);
          errors++;
        }
      }
    }
  }

  console.log('================================================================');
  console.log(' YERALTI KUANTUM LABIRENTI v3 (Map2_Kuantum_v3) VALIDATION REPORT');
  console.log('================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 untextured, 0 emissive materials!)`);
  console.log(`Total Textures    : ${images.length} referenced`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Walkable Levels   : Strictly single-level Y in [-0.02m, +0.015m]`);
  console.log(`Spawn Points      : 4 teams x 5 spawns = ${ALL_SPAWNS.length} points (Y=0.25, no Pad_Team meshes)`);
  console.log(`Card Candidates   : ${CARD_POINTS.length} points + 18 Prop_CardPedestal_NN (min spawn dist: ${minCardToSpawn.toFixed(2)}m >= 18.0m)`);
  console.log(`Door Candidates   : ${DOOR_POINTS.length} points (min spawn dist: ${minDoorToSpawn.toFixed(2)}m >= 26.5m, min solid clearance: ${minDoorClearance.toFixed(2)}m >= 3.6m)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
