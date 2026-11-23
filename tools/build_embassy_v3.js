#!/usr/bin/env node
/**
 * build_embassy_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map1_Elcilik_Kompleksi_4v4v4v4_v3.gltf (inside asset model/haritalar/Map1_Elcilik_v3/)
 *
 * Implements:
 * - 108x80m footprint (X in [-54, 54], Z in [-40, 40]), upgraded for 4v4v4v4 (`max_team: 4`)
 * - Single-level walkable floor heights Y in [-0.05, +0.04] so horizontal bullets and BotNav work at 100% precision
 * - ZERO glowing/neon floor lines or crosses! All floor decals, red carpet runners, blood trails, crystal shards,
 *   and tactical markings have ZERO emission (no emissiveFactor).
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±45, 0.25, ±32) with (±1.7, ±1.7) spread
 * - 18 Card Candidate Points at Y=1.15 (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.0m from every spawn, >= 3.5m clear radius)
 * - H-Plan Neoclassical Palace Modular Walls (6-12m segments, height 3.0m, thickness 0.48m, carved limestone plinth,
 *   cornice molding, and fluted pilasters) with wide 3.2m-4.0m arched/framed doorways
 * - Center — Grand Ballroom (X in [-16, 16], Z in [-13, 13]):
 *   * Concert Grand Piano & Overturned Diplomatic Banquet Barricade (`Console_GrandPiano_01`, height 2.05m with raised lid)
 *   * 8 Fluted Corinthian Marble Columns (`Wall_CorinthianCol_01..08`, r=0.48m, h=3.0m with ornate brass bases/capitals)
 *   * 4 Overhead ornate brass chandelier rings (`Ballroom_Chandelier_01..04_Canopy` at Y=4.2m)
 * - North Courtyard — 3-Tiered Marble Şadırvan Fountain (X in [-16, 16], Z in [-32, -13]):
 *   * 3-Tiered Sculpted Marble Fountain (`Console_MarbleFountain_01`, outer basin r=2.6m, central tier height 2.45m)
 *   * Dark reflective water basin (`Fountain_Water_Basin`, 0 emission) + curved marble balustrades (`Barrier_Balustrade_01..04`)
 * - South Courtyard — VIP Portico & 2 Armored Diplomatic Limousines (X in [-16, 16], Z in [13, 32]):
 *   * 2 Armored Diplomatic Limousines (`Humvee_Limousine_01..02`, length 6.2m, width 2.1m, height 1.95m, angled defensively)
 * - 4 Distinct Asymmetric Palace Wings:
 *   * NW Wing — Diplomatic Library & Treaty Room (`Server_Rack_Bookshelf_01..06`, `Console_TreatyTable_01`, dossiers)
 *   * NE Wing — Ambassador's Consul Suite & Situation Room (`Console_ConsulDesk_01`, comms racks, safe boxes, red carpets)
 *   * SW Wing — Embassy Security & Armory Bunker (`Console_SecurityBank_01..02`, blast partitions, weapon crates, sandbags)
 *   * SE Wing — Bullion & Classified Vault Wing (`Console_VaultDoor_01` 2.3m circular steel vault door, `Console_VaultLockers_01..03`)
 * - East & West Gardens — Baroque Boxwood Hedge Labyrinths (`Wall_BoxwoodHedge_01..16`, 2.15m tall + `GardenTree_01..08_Canopy`)
 * - 165 Alpha-Masked Decals (`Embassy_Decal_001..165`) + `Embassy_RedCarpet_01..12` (all 0 emission!)
 * - 32 Scatter Debris Groups (`Embassy_Scatter_01..32`, Y < 0.28m) + 48 Ornamental Garden Fern/Grass Clusters (`Embassy_Grass_01..48`)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map1_Elcilik_v3');
const GLTF_NAME = 'Map1_Elcilik_Kompleksi_4v4v4v4_v3.gltf';
const BIN_NAME = 'Map1_Elcilik_Kompleksi_4v4v4v4_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112301;
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

  // Subdivided Beveled Box
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

  // Detailed Neoclassical Palace Wall Segment (height=3.0m, thickness=0.48m, carved limestone plinth, chair rail molding, entablature cornice, fluted end pilasters)
  addNeoclassicalWallSegment(x0, z0, x1, z1, height = 3.0, thick = 0.48) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const segsX = Math.max(4, Math.round(len * 1.5));

    // Main wall body (V maps 0..1 over height)
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.025, 1.0 / height, segsX, 6, 2);

    // Carved limestone base plinth at Y = 0.14m (protrudes <= 3.5cm per side)
    this.addBeveledBox(cx, 0.14, cz, len + 0.03, 0.28, thick + 0.06, yaw, 0.02, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Neoclassical wainscoting / dado rail molding at Y = 1.05m (protrudes 2.5cm per side)
    this.addBeveledBox(cx, 1.05, cz, len + 0.02, 0.12, thick + 0.05, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Upper entablature frieze & cornice molding at Y = height - 0.10m
    this.addBeveledBox(cx, height - 0.10, cz, len + 0.04, 0.20, thick + 0.07, yaw, 0.02, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Fluted decorative pilasters at ends (protruding only 3.5cm so capsules never snag)
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    for (const endSign of [-1, 1]) {
      const lx = endSign * Math.max(0.0, len * 0.5 - 0.22);
      const px = cx + lx * cosY;
      const pz = cz + lx * sinY;
      this.addBeveledBox(px, height * 0.5, pz, 0.38, height - 0.08, thick + 0.07, yaw, 0.02, 0.5, 2, 4, 1);
    }
  }

  // Cylinder / Tube
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

  // Torus
  addTorus(cx, cy, cz, majorR, minorR, majorSegs = 32, minorSegs = 16, yaw = 0, pitch = 0) {
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

const matIndexByName = new Map();
function registerMaterial(def) {
  const idx = materials.length;
  materials.push(def);
  matIndexByName.set(def.name, idx);
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

// --- Register All Embassy v3 PBR Materials (Strictly 0 emission on all floor decals, carpets, water!) ---
const MAT = {
  checkerMarble: makePBRMaterial('Mat_Embassy_CheckerMarble_2K', 'embassy_checker_marble_2k_Diffuse.png', 'embassy_checker_marble_2k_nor_gl.png', 'embassy_checker_marble_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  herringboneParquet: makePBRMaterial('Mat_Embassy_HerringboneParquet_2K', 'embassy_herringbone_parquet_2k_Diffuse.png', 'embassy_herringbone_parquet_2k_nor_gl.png', 'embassy_herringbone_parquet_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  courtyardCobble: makePBRMaterial('Mat_Embassy_CourtyardCobble_2K', 'embassy_courtyard_cobble_2k_Diffuse.png', 'embassy_courtyard_cobble_2k_nor_gl.png', 'embassy_courtyard_cobble_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  neoclassicalStone: makePBRMaterial('Mat_Embassy_NeoclassicalStone_2K', 'embassy_neoclassical_stone_2k_Diffuse.png', 'embassy_neoclassical_stone_2k_nor_gl.png', 'embassy_neoclassical_stone_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  boxwoodHedge: makePBRMaterial('Mat_Embassy_BoxwoodHedge_2K', 'embassy_boxwood_hedge_2k_Diffuse.png', 'embassy_boxwood_hedge_2k_nor_gl.png', 'embassy_boxwood_hedge_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  heroLimoArmored: makePBRMaterial('Mat_Hero_LimoArmored_2K', 'hero_limo_armored_2k_Diffuse.png', 'hero_limo_armored_2k_nor_gl.png', 'hero_limo_armored_2k_arm.png', { normalScale: 1.35 }),
  ornateBrass: makePBRMaterial('Mat_Embassy_BrassOrnate_1K', 'embassy_brass_ornate_1k_Diffuse.png', 'embassy_brass_ornate_1k_nor_gl.png', 'embassy_brass_ornate_1k_arm.png', { normalScale: 1.35 }),
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Perimeter_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  brushedSteel: makePBRMaterial('Mat_Embassy_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_DarkMetal_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
  rustyMetal: makePBRMaterial('Mat_Rusty_Metal_2K', 'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg', { normalScale: 1.3 }),
  darkWood: makePBRMaterial('Mat_Dark_Mahogany_2K', 'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  gravelGround: makePBRMaterial('Mat_Gravel_Ground_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  sandbagBurlap: makePBRMaterial('Mat_Sandbag_Burlap_2K', 'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  barrier: makePBRMaterial('concrete_road_barrier', 'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg', { metallicFactor: 0 }),
  crate: makePBRMaterial('wooden_military_crate', 'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg'),
  generator: makePBRMaterial('portable_generator', 'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg'),
  barrel: makePBRMaterial('Barrel_01', 'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg'),
  powerBox: makePBRMaterial('power_box_01', 'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg'),
  shelves: makePBRMaterial('steel_frame_shelves_01', 'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg'),
  cliffRock: makePBRMaterial('rock_face_01', 'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg', { metallicFactor: 0 }),
  boulderRock: makePBRMaterial('boulder_01', 'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg', { metallicFactor: 0 }),
  // Dark Reflective Fountain Water Basin (Strictly 0 emission!)
  fountainWater: makePBRMaterial('Mat_Fountain_Water_Dark', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', {
    baseColorFactor: [0.06, 0.14, 0.18, 1.0],
    metallicFactor: 0.08,
    roughnessFactor: 0.06,
    normalScale: 1.15
  }),
  // Warm Chandelier Candle Lens (only used overhead at Y=4.2m on Chandelier_Canopy)
  chandelierLight: makePBRMaterial('Mat_Chandelier_WarmCandle', 'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png', {
    baseColorFactor: [1.0, 0.84, 0.56, 1.0],
    emissiveFactor: [0.75, 0.55, 0.25],
    emissiveStrength: 0.55
  }),
  // Alpha-Masked Floor Decals & Foliage (ALL strictly ZERO emission — no emissiveFactor!)
  decalRedCarpet: makePBRMaterial('Mat_Decal_RedCarpetRunner_Mask', 'decal_red_carpet_runner_Diffuse.png', 'decal_red_carpet_runner_nor_gl.png', 'decal_red_carpet_runner_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.4 }),
  decalChandelier: makePBRMaterial('Mat_Decal_ShatteredChandelier_Mask', 'decal_shattered_chandelier_Diffuse.png', 'decal_shattered_chandelier_nor_gl.png', 'decal_shattered_chandelier_arm.png', { alphaMode: 'MASK', normalScale: 1.4 }),
  decalDocuments: makePBRMaterial('Mat_Decal_ClassifiedDocuments_Mask', 'decal_classified_documents_Diffuse.png', 'decal_classified_documents_nor_gl.png', 'decal_classified_documents_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalPuddle: makePBRMaterial('Mat_Decal_WaterPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.08, normalScale: 1.15 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTracks: makePBRMaterial('Mat_Decal_TireTracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalMoss: makePBRMaterial('Mat_Decal_MossPatch_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalLeaves: makePBRMaterial('Mat_Decal_LeafLitter_Mask', 'decal_leaf_litter_Diffuse.png', 'decal_leaf_litter_nor_gl.png', 'decal_leaf_litter_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  grassFern: makePBRMaterial('Mat_Grass_GardenFern_Mask', 'grass_forest_fern_Diffuse.png', 'grass_forest_fern_nor_gl.png', 'grass_forest_fern_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.2 })
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
  [-45.0, 0.25, -32.0], // Team0 (NW Garden Gate Plaza)
  [ 45.0, 0.25, -32.0], // Team1 (NE Garden Gate Plaza)
  [-45.0, 0.25,  32.0], // Team2 (SW Garden Gate Plaza)
  [ 45.0, 0.25,  32.0]  // Team3 (SE Garden Gate Plaza)
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

// 18 Card Candidate Points at Y = 1.15 (All >= 18.0m from every spawn point; actual min is 22.49m!)
const CARD_POINTS = [
  // 4 in Grand Ballroom & Concert Piano Arena
  [ -8.0, 1.15,   0.0],
  [  8.0, 1.15,   0.0],
  [  0.0, 1.15,  -8.0],
  [  0.0, 1.15,   8.0],
  // 2 in North Tiered Marble Fountain Courtyard
  [ -9.0, 1.15, -22.0],
  [  9.0, 1.15, -22.0],
  // 2 in South VIP Limousine Portico & Driveway
  [ -9.0, 1.15,  22.0],
  [  9.0, 1.15,  22.0],
  // 2 in West Art Gallery & East Diplomatic Archive Corridors
  [-26.0, 1.15,   0.0],
  [ 26.0, 1.15,   0.0],
  // 4 inside the 4 Palace Wings (NW Library, NE Consul Suite, SW Security Bunker, SE Treasury Vault)
  [-24.0, 1.15, -16.0],
  [ 24.0, 1.15, -16.0],
  [-24.0, 1.15,  16.0],
  [ 24.0, 1.15,  16.0],
  // 4 in the East & West Baroque Boxwood Hedge Labyrinths & Outer Pavilions
  [-41.0, 1.15,  -8.0],
  [ 41.0, 1.15,  -8.0],
  [-41.0, 1.15,   8.0],
  [ 41.0, 1.15,   8.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.0m from every spawn point, >= 3.5m clear radius!)
const DOOR_POINTS = [
  // 4 Outer North/South/West/East Main Wrought-Iron Courtyard Gates
  [  0.0, 0.10, -34.0],
  [  0.0, 0.10,  34.0],
  [-46.0, 0.10,   0.0],
  [ 46.0, 0.10,   0.0],
  // 4 North Fountain Plaza & South VIP Portico Flanking Exits
  [-15.0, 0.10, -32.0],
  [ 15.0, 0.10, -32.0],
  [-15.0, 0.10,  32.0],
  [ 15.0, 0.10,  32.0],
  // 4 Grand Ballroom Diagonal Corner Doors
  [-11.5, 0.10,  -9.5],
  [ 11.5, 0.10,  -9.5],
  [-11.5, 0.10,   9.5],
  [ 11.5, 0.10,   9.5],
  // 4 Wing Courtyard Breezeways
  [-20.0, 0.10,  -8.0],
  [ 20.0, 0.10,  -8.0],
  [-20.0, 0.10,   8.0],
  [ 20.0, 0.10,   8.0]
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
// 2. SINGLE-LEVEL WALKABLE FLOORS & TERRAIN (Y in [-0.05, +0.04])
// ============================================================================
function buildFloors() {
  // (A) Base Terrain_Embassy_Ground: 108x80m subdivided 0.75m grid (144x106 = 30,528 tris) at Y = -0.02m
  const bTerrain = new MeshBuilder();
  const nx = 144, nz = 106;
  const xMin = -54.0, xMax = 54.0, zMin = -40.0, zMax = 40.0;
  for (let iz = 0; iz <= nz; iz++) {
    const fz = iz / nz;
    const z = zMin + fz * (zMax - zMin);
    for (let ix = 0; ix <= nx; ix++) {
      const fx = ix / nx;
      const x = xMin + fx * (xMax - xMin);
      const inOuterGarden = Math.abs(x) > 36.2 || Math.abs(z) > 28.2;
      const y = inOuterGarden ? (-0.02 + Math.sin(x * 0.35) * Math.cos(z * 0.35) * 0.015) : -0.02;
      bTerrain.addVertex(x, y, z, 0, 1, 0, (x - xMin) * 0.35, (z - zMin) * 0.35, 1, 0, 0, 1);
    }
  }
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix;
      const b = a + 1;
      const c = a + (nx + 1);
      const d = c + 1;
      bTerrain.ind.push(a, c, d, a, d, b);
    }
  }
  const terrainMesh = registerMesh('Terrain_Embassy_Ground_Mesh', [{ builder: bTerrain, mat: MAT.courtyardCobble }]);
  addGeometryNode('Terrain_Embassy_Ground', terrainMesh);

  function addFloorZone(nodeName, x0, z0, x1, z1, baseY, matIdx, step = 0.8) {
    const b = new MeshBuilder();
    const sx = Math.max(2, Math.round((x1 - x0) / step));
    const sz = Math.max(2, Math.round((z1 - z0) / step));
    for (let iz = 0; iz <= sz; iz++) {
      const z = z0 + (iz / sz) * (z1 - z0);
      for (let ix = 0; ix <= sx; ix++) {
        const x = x0 + (ix / sx) * (x1 - x0);
        const microY = baseY + Math.sin(x * 0.7 + z * 0.7) * 0.002;
        b.addVertex(x, microY, z, 0, 1, 0, x * 0.4, z * 0.4, 1, 0, 0, 1);
      }
    }
    for (let iz = 0; iz < sz; iz++) {
      for (let ix = 0; ix < sx; ix++) {
        const a = iz * (sx + 1) + ix;
        const b1 = a + 1;
        const c = a + (sx + 1);
        const d = c + 1;
        b.ind.push(a, c, d, a, d, b1);
      }
    }
    const mIdx = registerMesh(`${nodeName}_Mesh`, [{ builder: b, mat: matIdx }]);
    addGeometryNode(nodeName, mIdx);
  }

  // Exact required floor slabs (all strictly in Y = 0.01..0.015m)
  addFloorZone('Floor_Grand_Ballroom',  -16.0, -13.0,  16.0,  13.0, 0.015, MAT.checkerMarble, 0.75);
  addFloorZone('Floor_North_Colonnade', -16.0, -28.0,  16.0, -13.0, 0.010, MAT.checkerMarble, 0.75);
  addFloorZone('Floor_South_Portico',   -16.0,  13.0,  16.0,  28.0, 0.010, MAT.courtyardCobble, 0.75);
  addFloorZone('Floor_NW_Library_Wing', -36.0, -28.0, -16.0,  -4.0, 0.015, MAT.herringboneParquet, 0.75);
  addFloorZone('Floor_NE_Consul_Wing',   16.0, -28.0,  36.0,  -4.0, 0.015, MAT.herringboneParquet, 0.75);
  addFloorZone('Floor_SW_Security_Wing',-36.0,   4.0, -16.0,  28.0, 0.015, MAT.chippedConcrete, 0.75);
  addFloorZone('Floor_SE_Vault_Wing',    16.0,   4.0,  36.0,  28.0, 0.015, MAT.checkerMarble, 0.75);
  addFloorZone('Floor_West_Gallery',    -36.0,  -4.0, -16.0,   4.0, 0.015, MAT.herringboneParquet, 0.75);
  addFloorZone('Floor_East_Archive',     16.0,  -4.0,  36.0,   4.0, 0.015, MAT.herringboneParquet, 0.75);
}
buildFloors();

// ============================================================================
// 3. H-PLAN NEOCLASSICAL PALACE MODULAR WALLS (6-12m segments, h=3.0m, thick=0.48m)
// ============================================================================
let wallCounter = 1;
function addPalaceWall(prefix, x0, z0, x1, z1, matIdx = MAT.neoclassicalStone, h = 3.0, thick = 0.48) {
  const b = new MeshBuilder();
  b.addNeoclassicalWallSegment(x0, z0, x1, z1, h, thick);
  const name = `${prefix}_${String(wallCounter++).padStart(3, '0')}`;
  const mIdx = registerMesh(`${name}_Mesh`, [{ builder: b, mat: matIdx }]);
  addGeometryNode(name, mIdx);
}

function buildPalaceArchitecture() {
  // --- (A) Center Grand Ballroom Perimeter Walls (X in [-16, 16], Z in [-13, 13]) ---
  // Note: Diagonal Ballroom DoorPoints are at (±11.5, ±9.5), and Wing Breezeways at (±20, ±8).
  // So we place central 7.5m wall segments and wide 4.0m arched openings at the centers and corners!
  // North Ballroom Wall (Z = -13.0): segments at X in [-8.0, -2.2] and [2.2, 8.0] (4.4m central arch + wide corner openings for (±11.5, -9.5))
  addPalaceWall('Ballroom_Wall_North', -7.8, -13.0, -2.2, -13.0);
  addPalaceWall('Ballroom_Wall_North',  2.2, -13.0,  7.8, -13.0);
  // South Ballroom Wall (Z = +13.0): segments at X in [-7.8, -2.2] and [2.2, 7.8]
  addPalaceWall('Ballroom_Wall_South', -7.8,  13.0, -2.2,  13.0);
  addPalaceWall('Ballroom_Wall_South',  2.2,  13.0,  7.8,  13.0);
  // West Ballroom Wall (X = -16.0): segment at Z in [-5.2, -2.0] and [2.0, 5.2] (4.0m central gallery arch, leaving Z = ±9.5 > 4.3m clear!)
  addPalaceWall('Ballroom_Wall_West', -16.0, -5.2, -16.0, -2.0);
  addPalaceWall('Ballroom_Wall_West', -16.0,  2.0, -16.0,  5.2);
  // East Ballroom Wall (X = +16.0): segment at Z in [-5.2, -2.0] and [2.0, 5.2]
  addPalaceWall('Ballroom_Wall_East',  16.0, -5.2,  16.0, -2.0);
  addPalaceWall('Ballroom_Wall_East',  16.0,  2.0,  16.0,  5.2);

  // --- (B) 4 Palace Wings Outer & Internal Modular Walls ---
  // Notice: DoorPoints are at (±15, ±32) and (±20, ±8). All walls below stay >= 4.0m away from every DoorPoint!

  // 1. NW Wing — Diplomatic Library & Treaty Room (X in [-36, -16], Z in [-28, -4])
  // North facade (Z = -28.0) with 4.0m courtyard doorway at X in [-27.0, -23.0]
  addPalaceWall('NW_Library_Wall', -36.0, -28.0, -27.0, -28.0);
  addPalaceWall('NW_Library_Wall', -23.0, -28.0, -17.0, -28.0);
  // West facade (X = -36.0) with 4.0m garden doorway at Z in [-18.0, -14.0]
  addPalaceWall('NW_Library_Wall', -36.0, -28.0, -36.0, -18.0);
  addPalaceWall('NW_Library_Wall', -36.0, -14.0, -36.0,  -4.0);
  // East Colonnade Wall of NW Wing (X = -16.0, Z in [-26.5, -15.5], keeping DoorPoint (-11.5, -9.5) and (-20, -8) > 4.5m clear!)
  addPalaceWall('NW_Library_Wall', -16.0, -26.5, -16.0, -15.5);
  // South partition to West Gallery (Z = -4.0, X in [-36.0, -28.5], keeping CardPoint (-26, 0) & DoorPoint (-20, -8) clear)
  addPalaceWall('NW_Library_Wall', -36.0,  -4.0, -28.5,  -4.0);

  // 2. NE Wing — Ambassador's Consul Suite & Situation Room (X in [16, 36], Z in [-28, -4])
  addPalaceWall('NE_Consul_Wall',  17.0, -28.0,  23.0, -28.0);
  addPalaceWall('NE_Consul_Wall',  27.0, -28.0,  36.0, -28.0);
  addPalaceWall('NE_Consul_Wall',  36.0, -28.0,  36.0, -18.0);
  addPalaceWall('NE_Consul_Wall',  36.0, -14.0,  36.0,  -4.0);
  addPalaceWall('NE_Consul_Wall',  16.0, -26.5,  16.0, -15.5);
  addPalaceWall('NE_Consul_Wall',  28.5,  -4.0,  36.0,  -4.0);

  // 3. SW Wing — Embassy Security & Armory Bunker (X in [-36, -16], Z in [4, 28])
  addPalaceWall('SW_Security_Wall', -36.0,  28.0, -27.0,  28.0, MAT.chippedConcrete);
  addPalaceWall('SW_Security_Wall', -23.0,  28.0, -17.0,  28.0, MAT.chippedConcrete);
  addPalaceWall('SW_Security_Wall', -36.0,   4.0, -36.0,  14.0, MAT.chippedConcrete);
  addPalaceWall('SW_Security_Wall', -36.0,  18.0, -36.0,  28.0, MAT.chippedConcrete);
  addPalaceWall('SW_Security_Wall', -16.0,  15.5, -16.0,  26.5, MAT.chippedConcrete);
  addPalaceWall('SW_Security_Wall', -36.0,   4.0, -28.5,   4.0, MAT.chippedConcrete);

  // 4. SE Wing — Bullion & Classified Vault Wing (X in [16, 36], Z in [4, 28])
  addPalaceWall('SE_Vault_Wall',  17.0,  28.0,  23.0,  28.0);
  addPalaceWall('SE_Vault_Wall',  27.0,  28.0,  36.0,  28.0);
  addPalaceWall('SE_Vault_Wall',  36.0,   4.0,  36.0,  14.0);
  addPalaceWall('SE_Vault_Wall',  36.0,  18.0,  36.0,  28.0);
  addPalaceWall('SE_Vault_Wall',  16.0,  15.5,  16.0,  26.5);
  addPalaceWall('SE_Vault_Wall',  28.5,   4.0,  36.0,   4.0);

  // --- (C) Outer Compound Perimeter Walls (X = ±53.4, Z = ±39.4, height 3.6m, modular 12m segments) ---
  for (let x = -53.0; x < 53.0; x += 11.75) {
    const xNext = Math.min(53.0, x + 11.75);
    addPalaceWall('Wall_Perimeter_North', x, -39.4, xNext, -39.4, MAT.mossConcrete, 3.6, 0.6);
    addPalaceWall('Wall_Perimeter_South', x,  39.4, xNext,  39.4, MAT.mossConcrete, 3.6, 0.6);
  }
  for (let z = -39.0; z < 39.0; z += 11.14) {
    const zNext = Math.min(39.0, z + 11.14);
    addPalaceWall('Wall_Perimeter_West', -53.4, z, -53.4, zNext, MAT.mossConcrete, 3.6, 0.6);
    addPalaceWall('Wall_Perimeter_East',  53.4, z,  53.4, zNext, MAT.mossConcrete, 3.6, 0.6);
  }
}
buildPalaceArchitecture();

// ============================================================================
// 4. GRAND BALLROOM HERO CONTENT (Concert Grand Piano, 8 Corinthian Columns, 4 Chandeliers)
// ============================================================================
function buildGrandBallroom() {
  // (A) Center (0, 0): Concert Grand Piano & Overturned Diplomatic Banquet Barricade (`Console_GrandPiano_01`)
  // Height 2.05m with raised lid for full tactical cover!
  const bPianoWood = new MeshBuilder();
  const bPianoBrass = new MeshBuilder();
  const bPianoMarble = new MeshBuilder();

  // Raised marble concerts dais plinth (radius 2.4m, height 0.16m)
  bPianoMarble.addCylinder(0, 0.08, 0, 2.45, 2.35, 0.16, 24, 1, true);

  // Grand Piano curved rim body (length 2.5m, width 1.65m, bed height 0.95m)
  bPianoWood.addBeveledBox(0, 0.78, 0.25, 1.68, 0.42, 1.55, 0, 0.05, 0.8, 3, 2, 3);
  bPianoWood.addCylinder(0.15, 0.78, -0.55, 0.78, 0.78, 0.42, 24, 2, true);
  // Keyboard fallboard & white/black key bed
  bPianoWood.addBeveledBox(0, 0.72, 1.15, 1.58, 0.22, 0.42, 0, 0.03, 1.0, 3, 1, 1);
  bPianoMarble.addBeveledBox(0, 0.83, 1.18, 1.44, 0.06, 0.26, 0, 0.01, 2.0, 4, 1, 1);
  // 3 turned mahogany legs + brass casters & foot pedals
  for (const [lx, lz] of [[-0.68, 0.92], [0.68, 0.92], [0.15, -1.12]]) {
    bPianoWood.addCylinder(lx, 0.38, lz, 0.08, 0.11, 0.56, 16, 2, true);
    bPianoBrass.addCylinder(lx, 0.14, lz, 0.10, 0.10, 0.08, 16, 1, true);
  }
  bPianoBrass.addBeveledBox(0, 0.38, 0.88, 0.34, 0.48, 0.12, 0, 0.02, 1.0);
  // Interior cast-iron harp plate (ornate gold brass)
  bPianoBrass.addBeveledBox(0.05, 0.98, 0.05, 1.42, 0.06, 1.85, 0, 0.02, 1.0, 2, 1, 3);
  // Raised Concert Wing Lid (angled up to Y = 2.08m for full standing cover!) + brass prop stick
  bPianoWood.addBeveledBox(-0.42, 1.52, 0.0, 0.12, 1.25, 2.25, 0.12, 0.03, 0.8, 1, 3, 4);
  bPianoBrass.addCylinder(0.45, 1.45, 0.45, 0.035, 0.035, 1.15, 12, 1, true, 0, 0.35);

  // Flanking Overturned Diplomatic Banquet Tables forming a 360-degree fortification around the piano (radius <= 2.4m)
  bPianoWood.addBeveledBox( 1.75, 0.98,  0.0, 0.22, 1.92, 2.20,  0.15, 0.03, 0.8, 1, 3, 3);
  bPianoWood.addBeveledBox(-1.75, 0.96,  0.0, 0.22, 1.88, 2.20, -0.15, 0.03, 0.8, 1, 3, 3);
  bPianoBrass.addBeveledBox(0.0,  0.96, -1.85, 2.10, 1.88, 0.24,  0.05, 0.03, 0.8, 3, 3, 1);

  const pianoMesh = registerMesh('Console_GrandPiano_HeroMesh', [
    { builder: bPianoWood, mat: MAT.darkWood },
    { builder: bPianoBrass, mat: MAT.ornateBrass },
    { builder: bPianoMarble, mat: MAT.checkerMarble }
  ]);
  addGeometryNode('Console_GrandPiano_01', pianoMesh, [0.0, 0.0, 0.0]);

  // (B) 8 Fluted Corinthian Marble Columns (`Wall_CorinthianCol_01..08`, r=0.48m, h=3.0m with ornate brass bases/capitals)
  // Carefully positioned around the ballroom perimeter so every column is >= 4.2m clear of all CardPoints and DoorPoints!
  const bColMarble = new MeshBuilder();
  const bColBrass = new MeshBuilder();
  // Square plinth & ornate brass torus base
  bColMarble.addBeveledBox(0, 0.14, 0, 1.12, 0.28, 1.12, 0, 0.03, 1.0, 2, 1, 2);
  bColBrass.addTorus(0, 0.32, 0, 0.46, 0.08, 24, 12);
  bColBrass.addCylinder(0, 0.40, 0, 0.50, 0.46, 0.14, 24, 1, true);
  // Fluted marble shaft (24 radial segments for crisp normal highlight)
  bColMarble.addCylinder(0, 1.55, 0, 0.46, 0.42, 2.20, 24, 4, true, 0, 0, 2.0);
  // Ornate Corinthian gilded brass capital with acanthus volute rings & abacus slab
  bColBrass.addCylinder(0, 2.74, 0, 0.42, 0.58, 0.26, 24, 2, true);
  bColBrass.addTorus(0, 2.84, 0, 0.52, 0.07, 24, 12);
  bColMarble.addBeveledBox(0, 2.94, 0, 1.14, 0.12, 1.14, 0, 0.02, 1.0, 2, 1, 2);

  const corinthianColMesh = registerMesh('Wall_CorinthianCol_SharedMesh', [
    { builder: bColMarble, mat: MAT.neoclassicalStone },
    { builder: bColBrass, mat: MAT.ornateBrass }
  ]);

  // Verify distances of these 8 column coordinates:
  // Cards at (±8, 0) and (0, ±8); Doors at (±11.5, ±9.5).
  // At (±5.2, ±5.2): dist to (±8, 0) is sqrt(2.8^2 + 5.2^2) = 5.90m! Dist to (±11.5, ±9.5) is sqrt(6.3^2 + 4.3^2) = 7.63m!
  // At (±13.5, ±4.2): dist to (±8, 0) is sqrt(5.5^2 + 4.2^2) = 6.92m! Dist to (±11.5, ±9.5) is sqrt(2.0^2 + 5.3^2) = 5.66m!
  const colPositions = [
    [-5.2, -5.2], [ 5.2, -5.2], [-5.2,  5.2], [ 5.2,  5.2],
    [-13.5, -4.2], [13.5, -4.2], [-13.5,  4.2], [13.5,  4.2]
  ];
  colPositions.forEach((p, idx) => {
    addGeometryNode(`Wall_CorinthianCol_${String(idx + 1).padStart(2, '0')}`, corinthianColMesh, [p[0], 0.0, p[1]]);
  });

  // (C) 4 Overhead Ornate Brass Chandelier Rings (`Ballroom_Chandelier_01..04_Canopy` at Y = 4.2m)
  const bChanBrass = new MeshBuilder();
  const bChanCandle = new MeshBuilder();
  // Double-tiered brass chandelier ring suspended at Y = 4.2m
  bChanBrass.addTorus(0, 4.15, 0, 1.65, 0.09, 32, 14);
  bChanBrass.addTorus(0, 4.48, 0, 1.05, 0.07, 28, 12);
  bChanBrass.addCylinder(0, 4.55, 0, 0.18, 0.28, 0.65, 16, 1, true);
  // 8 radial support spokes & 12 warm candle crowns
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    bChanBrass.addBeveledBox(Math.cos(ang) * 0.82, 4.18, Math.sin(ang) * 0.82, 1.60, 0.06, 0.06, -ang, 0.01, 1.0);
  }
  for (let c = 0; c < 12; c++) {
    const ang = (c / 12) * Math.PI * 2;
    const cx = Math.cos(ang) * 1.65;
    const cz = Math.sin(ang) * 1.65;
    bChanBrass.addCylinder(cx, 4.28, cz, 0.06, 0.08, 0.14, 12, 1, true);
    bChanCandle.addCylinder(cx, 4.40, cz, 0.035, 0.035, 0.16, 10, 1, true);
  }
  const chandelierMesh = registerMesh('Ballroom_Chandelier_Canopy_Mesh', [
    { builder: bChanBrass, mat: MAT.ornateBrass },
    { builder: bChanCandle, mat: MAT.chandelierLight }
  ]);
  const chanCoords = [
    [-6.0, 0.0, -5.0],
    [ 6.0, 0.0, -5.0],
    [-6.0, 0.0,  5.0],
    [ 6.0, 0.0,  5.0]
  ];
  chanCoords.forEach((p, idx) => {
    addGeometryNode(`Ballroom_Chandelier_0${idx + 1}_Canopy`, chandelierMesh, p);
  });
}
buildGrandBallroom();

// ============================================================================
// 5. NORTH COURTYARD — 3-TIERED MARBLE ŞADIRVAN FOUNTAIN & BALUSTRADES
// ============================================================================
function buildNorthFountainCourtyard() {
  // Centerpiece at (0, -22): 3-Tiered Sculpted Marble Fountain (`Console_MarbleFountain_01`, outer basin r=2.6m, central tier h=2.45m)
  // Note: North Courtyard CardPoints are at (-9, -22) and (9, -22) -> 9.0m away from (0, -22)!
  const bFountMarble = new MeshBuilder();
  const bFountBrass = new MeshBuilder();

  // Outer octagonal/circular carved marble basin rim (radius 2.6m, height 0.78m)
  bFountMarble.addCylinder(0, 0.39, 0, 2.62, 2.55, 0.78, 32, 2, true, 0, 0, 3.0);
  bFountMarble.addTorus(0, 0.78, 0, 2.52, 0.14, 32, 14);
  // Tier 1 sculpted pedestal & middle bowl (radius 1.45m, height 1.48m)
  bFountMarble.addCylinder(0, 1.05, 0, 0.72, 0.58, 0.90, 24, 2, true);
  bFountBrass.addTorus(0, 1.15, 0, 0.66, 0.08, 24, 12);
  bFountMarble.addCylinder(0, 1.46, 0, 0.65, 1.48, 0.28, 28, 2, true);
  bFountMarble.addTorus(0, 1.58, 0, 1.44, 0.09, 28, 12);
  // Tier 2 central column & upper crown bowl (height 2.15m) + brass finial spire to Y = 2.48m (full cover!)
  bFountMarble.addCylinder(0, 1.85, 0, 0.42, 0.34, 0.65, 20, 2, true);
  bFountMarble.addCylinder(0, 2.15, 0, 0.35, 0.85, 0.22, 24, 1, true);
  bFountBrass.addCylinder(0, 2.36, 0, 0.22, 0.04, 0.32, 16, 2, true);
  bFountBrass.addTorus(0, 2.24, 0, 0.82, 0.05, 24, 10);

  const fountainMesh = registerMesh('Console_MarbleFountain_HeroMesh', [
    { builder: bFountMarble, mat: MAT.neoclassicalStone },
    { builder: bFountBrass, mat: MAT.ornateBrass }
  ]);
  addGeometryNode('Console_MarbleFountain_01', fountainMesh, [0.0, 0.0, -22.0]);

  // Dark Reflective Water Basin (`Fountain_Water_Basin` -> matches NO_COLLISION_KEYWORDS "Water" & "Basin", 0 emission!)
  const bWater = new MeshBuilder();
  bWater.addCylinder(0, 0.72, -22.0, 2.38, 2.38, 0.06, 32, 1, true);
  const waterMesh = registerMesh('Fountain_Water_Basin_Mesh', [{ builder: bWater, mat: MAT.fountainWater }]);
  addGeometryNode('Fountain_Water_Basin', waterMesh);

  // 4 Surrounding Carved Marble Balustrades (`Barrier_Balustrade_01..04`, height 0.88m jumpable cover)
  // Placed at (±4.8, -18.0) and (±4.8, -26.0) -> >= 4.5m clear of Cards (±9, -22) and Doors (±15, -32) & (0, -34)!
  const bBalMarble = new MeshBuilder();
  const bBalBrass = new MeshBuilder();
  bBalMarble.addBeveledBox(0, 0.12, 0, 2.85, 0.22, 0.52, 0, 0.02, 1.0, 3, 1, 1);
  bBalMarble.addBeveledBox(0, 0.80, 0, 2.92, 0.16, 0.56, 0, 0.02, 1.0, 3, 1, 1);
  bBalMarble.addBeveledBox(-1.32, 0.46, 0, 0.36, 0.56, 0.54, 0, 0.02, 1.0);
  bBalMarble.addBeveledBox( 1.32, 0.46, 0, 0.36, 0.56, 0.54, 0, 0.02, 1.0);
  for (let k = -3; k <= 3; k++) {
    bBalMarble.addCylinder(k * 0.34, 0.46, 0, 0.10, 0.08, 0.52, 14, 2, true);
    bBalBrass.addTorus(k * 0.34, 0.46, 0, 0.09, 0.025, 14, 8);
  }
  const balustradeMesh = registerMesh('Barrier_Balustrade_SharedMesh', [
    { builder: bBalMarble, mat: MAT.neoclassicalStone },
    { builder: bBalBrass, mat: MAT.ornateBrass }
  ]);
  const balPlacements = [
    { pos: [-4.8, 0.0, -17.8], yaw:  0.45 },
    { pos: [ 4.8, 0.0, -17.8], yaw: -0.45 },
    { pos: [-4.8, 0.0, -26.2], yaw: -0.45 },
    { pos: [ 4.8, 0.0, -26.2], yaw:  0.45 }
  ];
  balPlacements.forEach((bp, idx) => {
    addGeometryNode(`Barrier_Balustrade_0${idx + 1}`, balustradeMesh, bp.pos, bp.yaw);
  });
}
buildNorthFountainCourtyard();

// ============================================================================
// 6. SOUTH COURTYARD — VIP PORTICO & 2 ARMORED DIPLOMATIC LIMOUSINES
// ============================================================================
function buildSouthVIPLimousines() {
  // 2 High-Detail Armored Diplomatic Limousines (`Humvee_Limousine_01..02`, length 6.2m, width 2.1m, height 1.95m full cover)
  // Named `Humvee_Limousine_01..02` so ImportedMap.gd's CONVEX_KEYWORDS ("Humvee") gives them solid convex collision!
  const bLimoBody = new MeshBuilder();
  const bLimoChrome = new MeshBuilder();
  const bLimoBrass = new MeshBuilder();

  // Lower armored body tub (length 6.2m, width 2.1m, height 1.12m)
  bLimoBody.addBeveledBox(0.0, 0.68, 0.0, 6.20, 0.86, 2.10, 0, 0.06, 0.45, 8, 2, 4);
  // Stretched armored VIP cabin greenhouse (length 3.55m, width 1.88m, top at Y = 1.95m for full standing cover!)
  bLimoBody.addBeveledBox(-0.15, 1.50, 0.0, 3.55, 0.86, 1.88, 0, 0.07, 0.5, 6, 2, 3);
  // Armored ballistic roof command communication module (top at Y = 1.98m)
  bLimoChrome.addBeveledBox(-0.20, 1.94, 0.0, 2.40, 0.08, 1.35, 0, 0.02, 1.0, 3, 1, 2);
  // Open armored ballistic VIP doors on left & right acting as side cover wings
  bLimoBody.addBeveledBox( 0.35, 1.08,  1.42, 1.25, 1.48, 0.14,  0.55, 0.03, 0.6, 2, 2, 1);
  bLimoBody.addBeveledBox(-0.85, 1.08, -1.42, 1.25, 1.48, 0.14, -0.55, 0.03, 0.6, 2, 2, 1);
  // Vertical chrome radiator grille, bumpers & diplomatic flagstaffs on front fenders
  bLimoChrome.addBeveledBox( 3.12, 0.66, 0.0, 0.12, 0.68, 1.42, 0, 0.02, 1.5, 1, 2, 3);
  bLimoChrome.addBeveledBox( 3.16, 0.38, 0.0, 0.22, 0.26, 2.14, 0, 0.03, 1.0);
  bLimoChrome.addBeveledBox(-3.16, 0.38, 0.0, 0.22, 0.26, 2.14, 0, 0.03, 1.0);
  bLimoBrass.addCylinder(2.95, 1.22, -0.96, 0.025, 0.02, 0.55, 10, 1, true);
  bLimoBrass.addCylinder(2.95, 1.22,  0.96, 0.025, 0.02, 0.55, 10, 1, true);
  // 4 Heavy run-flat armored tires & chrome rims
  for (const [wx, wz] of [[-2.05, -1.04], [-2.05, 1.04], [2.05, -1.04], [2.05, 1.04]]) {
    bLimoBody.addCylinder(wx, 0.42, wz, 0.42, 0.42, 0.34, 28, 2, true, 0, Math.PI * 0.5);
    bLimoChrome.addTorus(wx, 0.42, wz > 0 ? wz + 0.15 : wz - 0.15, 0.26, 0.10, 24, 12, 0, Math.PI * 0.5);
  }

  const limoMesh = registerMesh('Humvee_Limousine_HeroMesh', [
    { builder: bLimoBody, mat: MAT.heroLimoArmored },
    { builder: bLimoChrome, mat: MAT.brushedSteel },
    { builder: bLimoBrass, mat: MAT.ornateBrass }
  ]);

  // Verify clearance from South CardPoints (-9, 22), (9, 22) and South DoorPoints (0, 34), (±15, 32):
  // Limousine 1 at (-2.6, 0.0, 20.5) angled at +0.28 rad -> > 6.4m from (-9, 22), > 11.6m from (9, 22), > 13.5m from (0, 34)!
  // Limousine 2 at ( 3.2, 0.0, 25.2) angled at -0.32 rad -> > 6.6m from (9, 22), > 9.3m from (0, 34), > 13.6m from (15, 32)!
  addGeometryNode('Humvee_Limousine_01', limoMesh, [-2.6, 0.0, 20.5],  0.28);
  addGeometryNode('Humvee_Limousine_02', limoMesh, [ 3.2, 0.0, 25.2], -0.32);
}
buildSouthVIPLimousines();

// ============================================================================
// 7. 4 DISTINCT ASYMMETRIC PALACE WINGS & BAROQUE BOXWOOD HEDGE LABYRINTHS
// ============================================================================
function buildPalaceWingsAndGardens() {
  // --- (A) 18 Prop_CardPedestal_01..18 beneath every CardPoint_01..18 ---
  const bPedStone = new MeshBuilder();
  const bPedBrass = new MeshBuilder();
  bPedStone.addCylinder(0, 0.07, 0, 0.36, 0.33, 0.14, 16, 1, true);
  bPedStone.addCylinder(0, 0.25, 0, 0.24, 0.22, 0.24, 16, 2, true);
  bPedBrass.addCylinder(0, 0.41, 0, 0.30, 0.34, 0.08, 16, 1, true);
  bPedBrass.addTorus(0, 0.43, 0, 0.27, 0.025, 24, 10);
  const pedMesh = registerMesh('Prop_CardPedestal_SharedMesh', [
    { builder: bPedStone, mat: MAT.neoclassicalStone },
    { builder: bPedBrass, mat: MAT.ornateBrass }
  ]);
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, pedMesh, [cp[0], 0.0, cp[2]]);
  }

  // --- (B) NW Wing — Diplomatic Library & Treaty Room ---
  // Tall Mahogany Bookshelves (`Server_Rack_Bookshelf_01..06`, height 2.35m full cover)
  const bBookWood = new MeshBuilder();
  const bBookBrass = new MeshBuilder();
  bBookWood.addBeveledBox(0, 1.18, 0, 2.40, 2.36, 0.72, 0, 0.03, 0.6, 4, 4, 2);
  // Carved crown cornice & 5 shelf ledges with book row blocks
  bBookWood.addBeveledBox(0, 2.32, 0, 2.52, 0.14, 0.80, 0, 0.02, 0.8, 3, 1, 1);
  for (let row = 0; row < 4; row++) {
    const sy = 0.52 + row * 0.46;
    bBookBrass.addBeveledBox(0, sy, 0.36, 2.28, 0.05, 0.06, 0, 0.01, 1.0);
    bBookWood.addBeveledBox(-0.45, sy + 0.16, 0.32, 1.10, 0.26, 0.14, 0, 0.02, 1.5, 3, 1, 1);
    bBookBrass.addBeveledBox( 0.55, sy + 0.15, 0.32, 0.75, 0.24, 0.14, 0, 0.02, 1.5, 2, 1, 1);
  }
  const bookshelfMesh = registerMesh('Server_Rack_Bookshelf_SharedMesh', [
    { builder: bBookWood, mat: MAT.darkWood },
    { builder: bBookBrass, mat: MAT.ornateBrass }
  ]);
  // Place 6 bookshelves in NW Wing (X in [-36, -16], Z in [-28, -4]), keeping CardPoint (-24, -16) and DoorPoint (-20, -8) >= 4.2m clear!
  const bookshelfCoords = [
    { pos: [-34.2, 0.0, -23.5], yaw:  1.57 },
    { pos: [-34.2, 0.0,  -9.5], yaw:  1.57 },
    { pos: [-30.0, 0.0, -20.5], yaw:  0.0  },
    { pos: [-30.0, 0.0, -11.5], yaw:  0.0  },
    { pos: [-19.5, 0.0, -24.5], yaw:  0.0  },
    { pos: [-18.2, 0.0, -19.0], yaw: -1.57 }
  ];
  bookshelfCoords.forEach((bs, idx) => {
    addGeometryNode(`Server_Rack_Bookshelf_0${idx + 1}`, bookshelfMesh, bs.pos, bs.yaw);
  });

  // Diplomatic Treaty Conference Table (`Console_TreatyTable_01`, height 0.86m jumpable cover) at (-28.5, -16.0)
  const bTreatyWood = new MeshBuilder();
  const bTreatyBrass = new MeshBuilder();
  bTreatyWood.addBeveledBox(0, 0.80, 0, 1.65, 0.14, 3.80, 0, 0.03, 0.6, 3, 1, 5);
  bTreatyWood.addBeveledBox(0, 0.40, -1.15, 1.05, 0.72, 0.45, 0, 0.03, 0.8);
  bTreatyWood.addBeveledBox(0, 0.40,  1.15, 1.05, 0.72, 0.45, 0, 0.03, 0.8);
  bTreatyBrass.addBeveledBox(0, 0.88, 0, 0.55, 0.04, 2.60, 0, 0.01, 1.0);
  const treatyTableMesh = registerMesh('Console_TreatyTable_Mesh', [
    { builder: bTreatyWood, mat: MAT.darkWood },
    { builder: bTreatyBrass, mat: MAT.ornateBrass }
  ]);
  addGeometryNode('Console_TreatyTable_01', treatyTableMesh, [-28.5, 0.0, -16.0], 0.0);

  // --- (C) NE Wing — Ambassador's Consul Suite & Situation Room ---
  // Ornate Executive Desk Barricade (`Console_ConsulDesk_01..02`, height 1.98m with armored partition screen)
  // Keeping CardPoint (24, -16) and DoorPoint (20, -8) >= 4.2m clear!
  const bDeskWood = new MeshBuilder();
  const bDeskBrass = new MeshBuilder();
  const bDeskSteel = new MeshBuilder();
  bDeskWood.addBeveledBox(0, 0.48, 0, 2.65, 0.96, 1.15, 0, 0.04, 0.7, 4, 2, 2);
  bDeskBrass.addBeveledBox(0, 0.98, 0, 2.75, 0.06, 1.22, 0, 0.02, 1.0);
  // Situation room armored tactical privacy/monitor Hutch (height 1.98m full cover)
  bDeskSteel.addBeveledBox(0, 1.48, -0.38, 2.35, 1.02, 0.32, 0, 0.03, 0.8, 3, 2, 1);
  bDeskBrass.addBeveledBox(0, 1.98, -0.38, 2.45, 0.08, 0.38, 0, 0.02, 1.0);
  const consulDeskMesh = registerMesh('Console_ConsulDesk_Mesh', [
    { builder: bDeskWood, mat: MAT.darkWood },
    { builder: bDeskBrass, mat: MAT.ornateBrass },
    { builder: bDeskSteel, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Console_ConsulDesk_01', consulDeskMesh, [29.5, 0.0, -21.5], -0.45);
  addGeometryNode('Console_ConsulDesk_02', consulDeskMesh, [29.5, 0.0, -10.5],  0.35);

  // Encrypted Satellite Comms Racks & Diplomatic Safe Boxes in NE Wing
  addGeometryNode('Server_Rack_Comms_01', sharedCC0.shelves, [34.2, 0.0, -23.0], -1.57);
  addGeometryNode('Server_Rack_Comms_02', sharedCC0.shelves, [34.2, 0.0,  -9.5], -1.57);
  addGeometryNode('Server_Rack_Comms_03', sharedCC0.shelves, [19.5, 0.0, -24.5],  0.0);

  // --- (D) SW Wing — Embassy Security & Armory Bunker ---
  // Tactical Monitor Banks (`Console_SecurityBank_01..02`, height 2.05m full cover)
  // Keeping CardPoint (-24, 16) and DoorPoint (-20, 8) >= 4.2m clear!
  const bSecDark = new MeshBuilder();
  const bSecSteel = new MeshBuilder();
  bSecDark.addBeveledBox(0, 1.02, 0, 2.95, 2.04, 1.05, 0, 0.04, 0.6, 4, 3, 2);
  bSecSteel.addBeveledBox(0, 0.92, 0.58, 2.85, 0.14, 0.45, 0, 0.02, 1.0, 3, 1, 1);
  for (let m = -1; m <= 1; m++) {
    bSecSteel.addBeveledBox(m * 0.92, 1.52, 0.54, 0.82, 0.56, 0.08, 0, 0.02, 1.0);
  }
  const secBankMesh = registerMesh('Console_SecurityBank_Mesh', [
    { builder: bSecDark, mat: MAT.heroDarkMetal },
    { builder: bSecSteel, mat: MAT.brushedSteel }
  ]);
  addGeometryNode('Console_SecurityBank_01', secBankMesh, [-30.0, 0.0, 21.5],  0.35);
  addGeometryNode('Console_SecurityBank_02', secBankMesh, [-30.0, 0.0, 10.5], -0.35);

  // --- (E) SE Wing — Bullion & Classified Vault Wing ---
  // Hero Prop: Walk-in Circular Heavy Steel Vault Door (`Console_VaultDoor_01`, 2.35m tall brushed steel & brass locking wheel)
  // Placed at (29.5, 0.0, 16.0) -> 5.5m away from CardPoint (24, 16) and > 12m from DoorPoint (20, 8)!
  const bVaultSteel = new MeshBuilder();
  const bVaultBrass = new MeshBuilder();
  // Massive armored vault frame housing
  bVaultSteel.addBeveledBox(0, 1.20, 0, 2.75, 2.40, 0.85, 0, 0.05, 0.6, 4, 4, 2);
  // Swung-open circular 1.95m diameter brushed-steel vault door leaf (thickness 0.42m)
  bVaultSteel.addCylinder(0.95, 1.18, 0.95, 0.98, 0.98, 0.42, 32, 2, true, -0.55, Math.PI * 0.5, 1.5);
  bVaultBrass.addTorus(0.95, 1.18, 0.95, 0.92, 0.07, 32, 12, -0.55, Math.PI * 0.5);
  // Central brass 6-spoke locking wheel & radial locking bolts
  bVaultBrass.addTorus(1.12, 1.18, 1.18, 0.36, 0.045, 24, 10, -0.55, Math.PI * 0.5);
  bVaultBrass.addCylinder(1.08, 1.18, 1.12, 0.14, 0.14, 0.25, 16, 1, true, -0.55, Math.PI * 0.5);

  const vaultDoorMesh = registerMesh('Console_VaultDoor_HeroMesh', [
    { builder: bVaultSteel, mat: MAT.brushedSteel },
    { builder: bVaultBrass, mat: MAT.ornateBrass }
  ]);
  addGeometryNode('Console_VaultDoor_01', vaultDoorMesh, [29.8, 0.0, 16.0], -1.57);

  // Safety Deposit Locker Banks (`Console_VaultLockers_01..03`, height 2.2m)
  const bLockSteel = new MeshBuilder();
  const bLockBrass = new MeshBuilder();
  bLockSteel.addBeveledBox(0, 1.10, 0, 2.80, 2.20, 0.85, 0, 0.04, 0.6, 4, 3, 2);
  for (let r = 0; r < 4; r++) {
    for (let c = -2; c <= 2; c++) {
      bLockBrass.addBeveledBox(c * 0.52, 0.35 + r * 0.48, 0.44, 0.44, 0.40, 0.05, 0, 0.01, 1.0);
    }
  }
  const vaultLockersMesh = registerMesh('Console_VaultLockers_Mesh', [
    { builder: bLockSteel, mat: MAT.brushedSteel },
    { builder: bLockBrass, mat: MAT.ornateBrass }
  ]);
  addGeometryNode('Console_VaultLockers_01', vaultLockersMesh, [34.2, 0.0, 22.5], -1.57);
  addGeometryNode('Console_VaultLockers_02', vaultLockersMesh, [34.2, 0.0,  9.5], -1.57);
  addGeometryNode('Console_VaultLockers_03', vaultLockersMesh, [21.5, 0.0, 26.2],  3.14159);

  // --- (F) West Art Gallery & East Diplomatic Archive Corridors (X in [-36, -16] & [16, 36], Z in [-4, 4]) ---
  // CardPoints are at (-26, 0) and (26, 0). We place flanking marble display pedestals/archive cabinets at X = ±31.5, Z = ±2.2
  const bGalStone = new MeshBuilder();
  const bGalBrass = new MeshBuilder();
  bGalStone.addBeveledBox(0, 0.55, 0, 1.10, 1.10, 0.90, 0, 0.03, 1.0, 2, 2, 2);
  bGalBrass.addCylinder(0, 1.48, 0, 0.28, 0.22, 0.76, 18, 2, true);
  bGalBrass.addTorus(0, 1.12, 0, 0.32, 0.04, 18, 8);
  const galleryBustMesh = registerMesh('Console_GalleryPedestal_Mesh', [
    { builder: bGalStone, mat: MAT.neoclassicalStone },
    { builder: bGalBrass, mat: MAT.ornateBrass }
  ]);
  addGeometryNode('Console_GalleryPedestal_01', galleryBustMesh, [-31.5, 0.0, -2.2], 0.0);
  addGeometryNode('Console_GalleryPedestal_02', galleryBustMesh, [-31.5, 0.0,  2.2], 0.0);
  addGeometryNode('Console_GalleryPedestal_03', galleryBustMesh, [ 31.5, 0.0, -2.2], 0.0);
  addGeometryNode('Console_GalleryPedestal_04', galleryBustMesh, [ 31.5, 0.0,  2.2], 0.0);

  // --- (G) East & West Gardens — Baroque Boxwood Hedge Labyrinths (`Wall_BoxwoodHedge_01..16` + `GardenTree_01..08_Canopy`) ---
  // Note: Garden CardPoints are at (±41, ±8); Outer Gate DoorPoints at (±46, 0); Spawns at (±45, ±32).
  // All 16 sculpted 2.15m tall manicured boxwood hedge walls are placed >= 3.8m clear of all Cards, Doors, and Spawns!
  function addBoxwoodHedge(idx, cx, cz, sx, sz, yaw = 0) {
    const bHedge = new MeshBuilder();
    const bCurb = new MeshBuilder();
    // Carved limestone garden curb base (height 0.18m)
    bCurb.addBeveledBox(0, 0.09, 0, sx + 0.12, 0.18, sz + 0.12, 0, 0.02, 0.8, Math.max(2, Math.round(sx)), 1, 1);
    // Manicured 2.15m tall boxwood hedge wall with beveled topiary crown
    bHedge.addBeveledBox(0, 1.12, 0, sx, 2.06, sz, 0, 0.08, 0.65, Math.max(3, Math.round(sx * 1.5)), 3, 2);
    const hName = `Wall_BoxwoodHedge_${String(idx).padStart(2, '0')}`;
    const mIdx = registerMesh(`${hName}_Mesh`, [
      { builder: bHedge, mat: MAT.boxwoodHedge },
      { builder: bCurb, mat: MAT.neoclassicalStone }
    ]);
    addGeometryNode(hName, mIdx, [cx, 0.0, cz], yaw);
  }

  // 8 West Labyrinth Hedges + 8 East Labyrinth Hedges (symmetric CQB flanking lanes)
  const hedgeSpecs = [
    // West Garden Labyrinth (X in [-49, -38], Z in [-24, 24])
    [-40.2,  0.0, 3.6, 0.95, 0.0],   // 01: Between (-41,-8) and (-41,8), >= 3.9m clear of (-46,0) door!
    [-41.0, -15.5, 4.4, 0.95, 0.0],  // 02: North of (-41,-8) card
    [-41.0,  15.5, 4.4, 0.95, 0.0],  // 03: South of (-41,8) card
    [-47.5, -13.5, 0.95, 5.2, 0.0],  // 04: Outer West NW lane
    [-47.5,  13.5, 0.95, 5.2, 0.0],  // 05: Outer West SW lane
    [-44.5, -21.5, 4.2, 0.95, 0.25], // 06: NW Garden approach baffle (dist to (-45,-32) is 10.5m)
    [-44.5,  21.5, 4.2, 0.95, -0.25],// 07: SW Garden approach baffle
    [-38.5,   0.0, 0.95, 4.6, 0.0],  // 08: Inner West Palace flank hedge
    // East Garden Labyrinth (X in [38, 49], Z in [-24, 24])
    [ 40.2,  0.0, 3.6, 0.95, 0.0],   // 09: >= 3.9m clear of (46,0) door!
    [ 41.0, -15.5, 4.4, 0.95, 0.0],  // 10
    [ 41.0,  15.5, 4.4, 0.95, 0.0],  // 11
    [ 47.5, -13.5, 0.95, 5.2, 0.0],  // 12
    [ 47.5,  13.5, 0.95, 5.2, 0.0],  // 13
    [ 44.5, -21.5, 4.2, 0.95, -0.25],// 14
    [ 44.5,  21.5, 4.2, 0.95, 0.25], // 15
    [ 38.5,   0.0, 0.95, 4.6, 0.0]   // 16
  ];
  hedgeSpecs.forEach((h, i) => {
    addBoxwoodHedge(i + 1, h[0], h[1], h[2], h[3], h[4]);
  });

  // 8 Overhead Ornamental Topiary Tree Crowns (`GardenTree_01..08_Canopy` at Y = 3.5..4.8m, no collision, fades when occluding!)
  const bTreeCanopy = new MeshBuilder();
  bTreeCanopy.addCylinder(0, 3.85, 0, 2.35, 1.85, 0.95, 20, 2, true);
  bTreeCanopy.addCylinder(0, 4.55, 0, 1.65, 0.45, 0.75, 18, 2, true);
  const treeCanopyMesh = registerMesh('GardenTree_Canopy_SharedMesh', [{ builder: bTreeCanopy, mat: MAT.boxwoodHedge }]);
  const treeCoords = [
    [-44.0, 0.0, -17.5], [-44.0, 0.0, -4.5], [-44.0, 0.0,  4.5], [-44.0, 0.0, 17.5],
    [ 44.0, 0.0, -17.5], [ 44.0, 0.0, -4.5], [ 44.0, 0.0,  4.5], [ 44.0, 0.0, 17.5]
  ];
  treeCoords.forEach((tc, idx) => {
    addGeometryNode(`GardenTree_0${idx + 1}_Canopy`, treeCanopyMesh, tc, idx * 0.4);
  });
}
buildPalaceWingsAndGardens();

// ============================================================================
// 8. CC0 PHOTOGRAMMETRY COVER PROPS & OUTER PERIMETER CLIFFS/BOULDERS
// ============================================================================
function buildPhotogrammetryProps() {
  // 16 Concrete Diplomatic Security Barriers (`Barrier_01..16`)
  const barriers = [
    [-37.5, -29.5,  0.45], [ 37.5, -29.5, -0.45], [-37.5,  29.5, -0.45], [ 37.5,  29.5,  0.45],
    [-48.5, -23.0,  1.57], [ 48.5, -23.0,  1.57], [-48.5,  23.0,  1.57], [ 48.5,  23.0,  1.57],
    [-25.0, -33.5,  0.15], [ 25.0, -33.5, -0.15], [-25.0,  33.5, -0.15], [ 25.0,  33.5,  0.15],
    [ -6.8,  29.5,  0.20], [  6.8,  29.5, -0.20], [ -7.5, -31.0, -0.15], [  7.5, -31.0,  0.15]
  ];
  barriers.forEach((b, i) => {
    addGeometryNode(`Barrier_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [b[0], 0.0, b[1]], b[2]);
  });

  // 12 High-Poly Sculpted Sandbag Firing Positions (`Sandbag_Position_01..12`, height 0.88m)
  function createSandbagPositionMesh() {
    const b = new MeshBuilder();
    for (let row = 0; row < 3; row++) {
      const y = 0.14 + row * 0.26;
      const offset = (row % 2) * 0.28;
      for (let col = -1; col <= 1; col++) {
        const x = col * 0.82 + offset * 0.5;
        b.addBeveledBox(x, y, (row % 2) * 0.04, 0.84, 0.27, 0.48, (row * 0.07 - col * 0.05), 0.08, 1.2, 4, 2, 2);
      }
    }
    return registerMesh('Sandbag_Position_SharedMesh', [{ builder: b, mat: MAT.sandbagBurlap }]);
  }
  const sandbagMesh = createSandbagPositionMesh();
  const sandbags = [
    [-39.5, -25.0,  0.78], [ 39.5, -25.0, -0.78], [-39.5,  25.0, -0.78], [ 39.5,  25.0,  0.78],
    [-25.0,  11.0,  0.0],  [ 25.0,  11.0,  0.0],  [-25.0, -11.0,  0.0],  [ 25.0, -11.0,  0.0],
    [-12.5, -18.0,  0.55], [ 12.5, -18.0, -0.55], [-12.5,  18.0, -0.55], [ 12.5,  18.0,  0.55]
  ];
  sandbags.forEach((s, i) => {
    addGeometryNode(`Sandbag_Position_${String(i + 1).padStart(2, '0')}`, sandbagMesh, [s[0], 0.0, s[1]], s[2]);
  });

  // 12 Military/Diplomatic Supply Crates (`Crate_01..12`)
  const crates = [
    [-33.5,  16.0, 0.3], [-33.5,  23.5, -0.2], [-21.0,  24.5, 0.4], [-18.5,  19.0, -0.5],
    [ 25.0,  -9.5, 0.8], [-25.0,  -9.5, -0.4], [ 25.0,   9.5, 0.2], [-33.5,   8.5, -0.7],
    [-49.5, -17.5, 0.1], [ 49.5, -17.5, -0.1], [-49.5,  17.5, 0.5], [ 49.5,  17.5, -0.3]
  ];
  crates.forEach((c, i) => {
    addGeometryNode(`Crate_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [c[0], 0.0, c[1]], c[2]);
  });

  // 8 Explosive / Fuel Barrels (`Barrel_01..08`)
  const barrels = [
    [-34.2,  13.5], [-26.0,  25.5], [ 26.0,  25.5], [ 18.5,  20.0],
    [-50.2,  -7.5], [ 50.2,  -7.5], [-50.2,   7.5], [ 50.2,   7.5]
  ];
  barrels.forEach((b, i) => {
    addGeometryNode(`Barrel_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [b[0], 0.0, b[1]], i * 0.7);
  });

  // 6 Portable Field Generators (`Generator_Field_01..06`)
  const gens = [
    [-50.0, -20.5,  1.57], [ 50.0, -20.5, -1.57], [-50.0,  20.5,  1.57], [ 50.0,  20.5, -1.57],
    [-25.5,  26.0,  0.0],  [ 25.5, -26.0,  3.14]
  ];
  gens.forEach((g, i) => {
    addGeometryNode(`Generator_Field_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [g[0], 0.0, g[1]], g[2]);
  });

  // 8 Electrical PowerBoxes (`PowerBox_01..08`)
  const pboxes = [
    [-35.3, -21.0,  1.57], [-35.3,  21.0,  1.57],
    [ 35.3, -21.0, -1.57], [ 35.3,  21.0, -1.57],
    [-20.5, -27.3,  0.0],  [ 20.5, -27.3,  0.0],
    [-20.5,  27.3,  3.14], [ 20.5,  27.3,  3.14]
  ];
  pboxes.forEach((p, i) => {
    addGeometryNode(`PowerBox_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [p[0], 0.0, p[1]], p[2]);
  });

  // Outer Perimeter Cliff_Perimeter_01..10 & Rock_Rubble_01..08 (Strictly inside [-54, 54] x [-40, 40] so World AABB is exact 108x80m,
  // and `ImportedMap._build_outer_world` clones them automatically!)
  const cliffs = [
    [-31.0, -38.4,  0.0],  [ 31.0, -38.4,  0.0],  [-52.2,  -7.5,  1.57],
    [-31.0,  38.4,  3.14], [ 31.0,  38.4,  3.14], [ 52.2,   7.5, -1.57],
    [-52.2, -18.5,  1.57], [-52.2,  18.5,  1.57],
    [ 52.2, -18.5, -1.57], [ 52.2,  18.5, -1.57]
  ];
  cliffs.forEach((c, i) => {
    addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [c[0], -0.05, c[1]], c[2]);
  });

  const boulders = [
    [-50.5, -11.5, 0.2], [ 50.5, -11.5, 1.1], [-50.5,  11.5, 2.3], [ 50.5,  11.5, 0.8],
    [-34.0, -36.8, 0.5], [ 34.0, -36.8, 1.9], [-34.0,  36.8, 2.7], [ 34.0,  36.8, 0.4]
  ];
  boulders.forEach((b, i) => {
    addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [b[0], -0.05, b[1]], b[2]);
  });
}
buildPhotogrammetryProps();

// ============================================================================
// 9. 12 TORN BURGUNDY VELVET CARPET RUNNERS (`Embassy_RedCarpet_01..12`) & 165 FLOOR DECALS (`Embassy_Decal_001..165`)
// ALL STRICTLY ZERO EMISSION!
// ============================================================================
function buildCarpetsAndDecals() {
  function addFloorDecalPatch(builder, cx, y, cz, sx, sz, yaw = 0, gridX = 4, gridZ = 4) {
    const baseIdx = builder.pos.length / 3;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    for (let iz = 0; iz <= gridZ; iz++) {
      const fz = iz / gridZ;
      const lz = (fz - 0.5) * sz;
      for (let ix = 0; ix <= gridX; ix++) {
        const fx = ix / gridX;
        const lx = (fx - 0.5) * sx;
        const wx = cx + lx * cosY - lz * sinY;
        const wz = cz + lx * sinY + lz * cosY;
        builder.addVertex(wx, y, wz, 0, 1, 0, fx, fz, cosY, 0, sinY, 1);
      }
    }
    for (let iz = 0; iz < gridZ; iz++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = iz * (gridX + 1) + ix;
        const b1 = a + 1;
        const c = a + (gridX + 1);
        const d = c + 1;
        builder.ind.push(a, c, d, a, d, b1);
      }
    }
  }

  // Note: Ensure `Embassy_RedCarpet_01..12` is non-colliding by including `Decal` or keeping it paper-thin at Y=0.018m;
  // wait — in ImportedMap.gd, `NO_COLLISION_KEYWORDS` has `"Decal"`. What if we also check whether `Embassy_RedCarpet` collides?
  // Even if `Embassy_RedCarpet_01..12` gets trimesh at Y = 0.0165m (1.5mm above Y=0.015m floor), a flat horizontal quad at Y=0.0165m
  // is a normal walkable floor surface! Better yet, let's place `Embassy_RedCarpet_01..12` at Y = 0.0175m (strictly flat horizontal)
  // so whether walked on or raycasted, it is 100% flush with the 0.015m floor!
  const carpetSpecs = [
    // 1-4: Grand Ballroom North/South/West/East ceremonial axes leading toward the Grand Piano dais
    { cx:   0.0, cz: -10.5, len: 7.2, wid: 2.1, yaw: Math.PI * 0.5, blood: [ 0.4, -9.2, 2.2, 1.8, 0.5] },
    { cx:   0.0, cz:  10.5, len: 7.2, wid: 2.1, yaw: Math.PI * 0.5, blood: [-0.4,  9.2, 2.2, 1.8, 1.9] },
    { cx: -11.5, cz:   0.0, len: 7.5, wid: 2.1, yaw: 0.0,           blood: [-9.8,  0.3, 2.1, 1.7, 1.1] },
    { cx:  11.5, cz:   0.0, len: 7.5, wid: 2.1, yaw: 0.0,           blood: [ 9.8, -0.3, 2.1, 1.7, 2.4] },
    // 5-6: West Art Gallery & East Diplomatic Archive Corridors
    { cx: -21.5, cz:   0.0, len: 7.2, wid: 2.0, yaw: 0.0,           blood: [-20.2, -0.4, 2.0, 1.6, 0.7] },
    { cx:  21.5, cz:   0.0, len: 7.2, wid: 2.0, yaw: 0.0,           blood: [ 20.2,  0.4, 2.0, 1.6, 2.1] },
    // 7-8: North Colonnade & South VIP Portico Reception Runners
    { cx:   0.0, cz: -16.2, len: 5.5, wid: 2.2, yaw: Math.PI * 0.5, blood: [ 0.3, -15.5, 2.1, 1.7, 1.4] },
    { cx:   0.0, cz:  16.2, len: 5.5, wid: 2.2, yaw: Math.PI * 0.5, blood: [-0.3,  15.5, 2.1, 1.7, 2.8] },
    // 9-12: Inside the 4 Palace Wings (NW Library, NE Consul Suite, SW Security Entry, SE Vault Hall)
    { cx: -24.0, cz: -21.5, len: 6.4, wid: 1.95, yaw: Math.PI * 0.5, blood: [-23.6, -20.5, 1.9, 1.6, 0.3] },
    { cx:  24.0, cz: -21.5, len: 6.4, wid: 1.95, yaw: Math.PI * 0.5, blood: [ 23.6, -20.5, 1.9, 1.6, 1.7] },
    { cx: -24.0, cz:  21.5, len: 6.4, wid: 1.95, yaw: Math.PI * 0.5, blood: [-23.6,  20.5, 1.9, 1.6, 2.5] },
    { cx:  24.0, cz:  21.5, len: 6.4, wid: 1.95, yaw: Math.PI * 0.5, blood: [ 23.6,  20.5, 1.9, 1.6, 0.9] }
  ];

  carpetSpecs.forEach((cfg, idx) => {
    const bCarp = new MeshBuilder();
    const bBlood = new MeshBuilder();
    addFloorDecalPatch(bCarp, cfg.cx, 0.0175, cfg.cz, cfg.len, cfg.wid, cfg.yaw, 6, 3);
    addFloorDecalPatch(bBlood, cfg.blood[0], 0.0182, cfg.blood[1], cfg.blood[2], cfg.blood[3], cfg.blood[4], 3, 3);
    const cName = `Embassy_RedCarpet_${String(idx + 1).padStart(2, '0')}`;
    const mIdx = registerMesh(`${cName}_Mesh`, [
      { builder: bCarp, mat: MAT.decalRedCarpet },
      { builder: bBlood, mat: MAT.decalBlood }
    ]);
    addGeometryNode(cName, mIdx);
  });

  // 165 Alpha-Masked Floor Decals (`Embassy_Decal_001..165`, alphaMode: MASK, 0 emission!)
  const decalMats = [
    MAT.decalChandelier,
    MAT.decalDocuments,
    MAT.decalRedCarpet,
    MAT.decalBlood,
    MAT.decalPuddle,
    MAT.decalTracks,
    MAT.decalScorch,
    MAT.decalOil,
    MAT.decalMoss,
    MAT.decalLeaves
  ];

  for (let i = 1; i <= 165; i++) {
    const b = new MeshBuilder();
    let cx, cz, matIdx;
    if (i <= 36) {
      // Grand Ballroom: shattered crystal chandelier debris, blood trails, classified papers, scorch craters
      const ang = (i / 36) * Math.PI * 2 + randRange(-0.1, 0.1);
      const r = randRange(2.8, 14.2);
      cx = Math.cos(ang) * r;
      cz = Math.sin(ang) * r;
      matIdx = (i % 3 === 0) ? MAT.decalChandelier : ((i % 3 === 1) ? MAT.decalBlood : MAT.decalDocuments);
    } else if (i <= 76) {
      // North Fountain Courtyard & South VIP Limousine Driveway (tire tracks, puddles, scorch marks, leaves)
      const isSouth = (i % 2) === 0;
      cx = randRange(-14.5, 14.5);
      cz = isSouth ? randRange(14.0, 35.0) : randRange(-35.0, -14.0);
      matIdx = isSouth
        ? ((i % 4 === 0) ? MAT.decalTracks : ((i % 4 === 2) ? MAT.decalOil : MAT.decalScorch))
        : ((i % 4 === 1) ? MAT.decalPuddle : ((i % 4 === 3) ? MAT.decalMoss : MAT.decalLeaves));
    } else if (i <= 136) {
      // 4 Palace Wings & Galleries (classified documents, blood trails, scorch craters, torn carpet remnants)
      const q = i % 4;
      const sx = (q % 2 === 0) ? -1 : 1;
      const sz = (q < 2) ? -1 : 1;
      cx = sx * randRange(17.5, 34.2);
      cz = sz * randRange(2.0, 26.2);
      matIdx = (i % 4 === 0) ? MAT.decalDocuments : ((i % 4 === 1) ? MAT.decalBlood : ((i % 4 === 2) ? MAT.decalChandelier : MAT.decalScorch));
    } else {
      // East & West Baroque Boxwood Hedge Gardens & Corner Plazas
      const sx = (i % 2 === 0) ? -1 : 1;
      cx = sx * randRange(37.0, 50.0);
      cz = randRange(-34.0, 34.0);
      matIdx = decalMats[i % decalMats.length];
    }

    const sx = randRange(1.8, 3.8);
    const sz = randRange(1.8, 3.8);
    const yaw = randRange(0, Math.PI * 2);
    const y = 0.018 + (i % 7) * 0.0008;
    addFloorDecalPatch(b, cx, y, cz, sx, sz, yaw, 3, 3);

    const dName = `Embassy_Decal_${String(i).padStart(3, '0')}`;
    const mIdx = registerMesh(`${dName}_Mesh`, [{ builder: b, mat: matIdx }]);
    addGeometryNode(dName, mIdx);
  }
}
buildCarpetsAndDecals();

// ============================================================================
// 10. 32 SCATTER DEBRIS GROUPS (`Embassy_Scatter_01..32`, Y < 0.28m) & 48 GARDEN FERN CLUSTERS (`Embassy_Grass_01..48`)
// ============================================================================
function buildScatterAndGrass() {
  // 32 Scatter groups: broken marble chunks, ornate brass candlesticks, dossier binders, shell casings (Y < 0.28m)
  for (let s = 1; s <= 32; s++) {
    const bMarble = new MeshBuilder();
    const bBrass = new MeshBuilder();

    const gx = ((s - 1) % 8) - 3.5;
    const gz = Math.floor((s - 1) / 8) - 1.5;
    const baseCx = gx * 12.0;
    const baseCz = gz * 18.5;

    let added = 0;
    let attempts = 0;
    while (added < 22 && attempts < 80) {
      attempts++;
      const px = Math.max(-50.5, Math.min(50.5, baseCx + randRange(-5.2, 5.2)));
      const pz = Math.max(-36.5, Math.min(36.5, baseCz + randRange(-7.5, 7.5)));
      if (!isClearOfGameplayPoints(px, pz, -1.5)) continue; // keep >= 2.2m from spawns/cards/doors

      const yaw = randRange(0, Math.PI * 2);
      if (added % 2 === 0) {
        // Broken carved marble cornice fragment / dossier binder (height 0.04..0.11m < 0.28m)
        const w = randRange(0.18, 0.42);
        const h = randRange(0.04, 0.11);
        const d = randRange(0.16, 0.36);
        bMarble.addBeveledBox(px, h * 0.5, pz, w, h, d, yaw, 0.01, 2.0, 2, 1, 2);
      } else {
        // Fallen ornate brass candlestick / shell casing / silver banquet tray (height <= 0.16m < 0.28m)
        const r = randRange(0.03, 0.055);
        const len = randRange(0.14, 0.26);
        bBrass.addCylinder(px, r, pz, r, r * 0.7, len, 12, 1, true, yaw, Math.PI * 0.5);
        bBrass.addBeveledBox(px + 0.14, 0.035, pz - 0.12, 0.30, 0.05, 0.22, yaw + 0.5, 0.01, 2.0);
      }
      added++;
    }

    const sName = `Embassy_Scatter_${String(s).padStart(2, '0')}`;
    const mIdx = registerMesh(`${sName}_Mesh`, [
      { builder: bMarble, mat: MAT.neoclassicalStone },
      { builder: bBrass, mat: MAT.ornateBrass }
    ]);
    addGeometryNode(sName, mIdx);
  }

  // 48 Ornamental Garden Fern & Boxwood Ground Clusters (`Embassy_Grass_01..48`, alphaMode: MASK)
  const bSharedGrass = new MeshBuilder();
  for (let p = 0; p < 3; p++) {
    const ang = (p / 3) * Math.PI;
    const c = Math.cos(ang) * 0.45;
    const s = Math.sin(ang) * 0.45;
    bSharedGrass.addQuad([-c, 0.0, -s], [c, 0.0, s], [c, 0.50, s], [-c, 0.50, -s], [-s, 0.2, c], 0, 1, 1, 0);
  }
  const grassMesh = registerMesh('Embassy_Grass_SharedMesh', [{ builder: bSharedGrass, mat: MAT.grassFern }]);

  for (let g = 1; g <= 48; g++) {
    const sx = (g % 2 === 0) ? -1 : 1;
    const sz = (g % 4 < 2) ? -1 : 1;
    let gx, gz;
    if (g <= 32) {
      // East & West Baroque Gardens
      gx = sx * randRange(37.2, 51.5);
      gz = sz * randRange(2.5, 36.5);
    } else {
      // North Fountain Courtyard & South Portico Garden Beds
      gx = sx * randRange(5.5, 15.0);
      gz = sz * randRange(28.5, 37.2);
    }
    addGeometryNode(`Embassy_Grass_${String(g).padStart(2, '0')}`, grassMesh, [gx, 0.0, gz], randRange(0, Math.PI * 2));
  }
}
buildScatterAndGrass();

// ============================================================================
// 11. ASSEMBLE GLTF SCENE HIERARCHY (Exact Contract with ImportedMap.gd & GameManager.gd)
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
  name: 'Embassy_Compound_Map',
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
    generator: 'TacticalDark Embassy v3 Node.js Procedural Builder',
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

// Write Map1_Elcilik_Kompleksi_4v4v4v4_v3.gltf.import
const gltfResPath = `res://asset model/haritalar/Map1_Elcilik_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dembassy4v4v3map1"
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
// 12. MATHEMATICAL & LEVEL DESIGN VALIDATION REPORT
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
    for (const p of m.primitives) {
      const acc = accessors[p.attributes.POSITION];
      for (const lx of [acc.min[0], acc.max[0]]) {
        for (const lz of [acc.min[2], acc.max[2]]) {
          const wx = tx + lx * cosY - lz * sinY;
          const wz = tz + lx * sinY + lz * cosY;
          wMinX = Math.min(wMinX, wx); wMaxX = Math.max(wMaxX, wx);
          wMinZ = Math.min(wMinZ, wz); wMaxZ = Math.max(wMaxZ, wz);
        }
      }
      wMinY = Math.min(wMinY, ty + acc.min[1]); wMaxY = Math.max(wMaxY, ty + acc.max[1]);
    }
  }
  if (wMinX < -54.05 || wMaxX > 54.05 || wMinZ < -40.05 || wMaxZ > 40.05) {
    console.error(`ERROR: World AABB exceeds 108x80m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
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

  // 3. DoorPoint -> Spawn min distance check (>= 26.0m required)
  let minDoorToSpawn = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const d = DOOR_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(d[0] - s[0], d[2] - s[2]));
    }
    if (dMin < 26.0) {
      console.error(`ERROR: DoorPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m < 26.0m`);
      errors++;
    }
    minDoorToSpawn = Math.min(minDoorToSpawn, dMin);
  }

  // 4. Verify all Decal & Grass materials have alphaMode: "MASK" and ZERO emissiveFactor!
  for (const m of materials) {
    if (m.name.includes('Decal') || m.name.includes('Grass') || m.name.includes('Water')) {
      if ((m.name.includes('Decal') || m.name.includes('Grass')) && m.alphaMode !== 'MASK') {
        console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
        errors++;
      }
      if (m.emissiveFactor) {
        console.error(`ERROR: Material ${m.name} has emissiveFactor (forbidden on floor decals/water!)`);
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

  // 6. Verify all 16 DoorPoints have >= 3.5m clear horizontal radius from every solid collider (walls, columns, hedges, props)
  const noCollideWords = ['Terrain', 'Floor', 'Canopy', 'Water', 'Basin', 'Decal', 'Scatter', 'Grass', 'RedCarpet'];
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
      // Transform door point into node's local space for exact OBB distance check
      const dx = dp[0] - tx;
      const dz = dp[2] - tz;
      const localX =  dx * cosY + dz * sinY;
      const localZ = -dx * sinY + dz * cosY;
      for (const p of m.primitives) {
        const acc = accessors[p.attributes.POSITION];
        const cx = Math.max(acc.min[0], Math.min(localX, acc.max[0]));
        const cz = Math.max(acc.min[2], Math.min(localZ, acc.max[2]));
        const dist = Math.hypot(localX - cx, localZ - cz);
        minDoorClearance = Math.min(minDoorClearance, dist);
        if (dist < 3.5) {
          console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 3.5m required)`);
          errors++;
        }
      }
    }
  }

  console.log('================================================================');
  console.log(' ELCILIK KOMPLEKSI v3 (Map1_Elcilik_v3) VALIDATION SUMMARY');
  console.log('================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 untextured, 0 glowing floor decals)`);
  console.log(`Total Textures    : ${images.length} referenced`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Spawn Points      : 4 teams x 5 spawns = ${ALL_SPAWNS.length} points (Y=0.25)`);
  console.log(`Card Candidates   : ${CARD_POINTS.length} points + 18 Prop_CardPedestal_NN (min spawn dist: ${minCardToSpawn.toFixed(2)}m >= 18.0m)`);
  console.log(`Door Candidates   : ${DOOR_POINTS.length} points (min spawn dist: ${minDoorToSpawn.toFixed(2)}m >= 26.0m, min solid clearance: ${minDoorClearance.toFixed(2)}m >= 3.5m)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
