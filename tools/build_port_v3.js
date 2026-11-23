#!/usr/bin/env node
/**
 * build_port_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map8_Gece_Konteyner_Limani_5v5v5v5_v3.gltf (inside asset model/haritalar/Map8_Liman_v3/)
 *
 * Implements:
 * - Iconic 124x92m footprint (X in [-62, 62], Z in [-46, 46]), full 5v5v5v5 (20 players)
 * - ZERO emissive surfaces across all materials (including Harbor_Water_Basin and all 193 decals!)
 * - Single-Level Parity Fix (No 0.94m Quay Step!):
 *   * U-Shaped Wet Concrete Quay Deck (Quay_Deck_North, Quay_Deck_WestArm, Quay_Deck_EastArm at Y=0.0m)
 *   * Floorless Harbor Water Basin (X in [-30, 30], Z in [8, 46], Harbor_Water_Basin at Y=-1.40m)
 *   * Moored Cargo Freighter Deck (CargoShip_Deck at Y=+0.16m, X in [-21, 21], Z in [15, 37]) + CargoShip_Hull
 *   * 6 Wide Steel Boarding Gangway Ramps (ShipGangway_Deck_01..06, 4.5m wide, Y=0.0->0.16m smooth slope)
 * - Redesigned Compelling Port Content ("Smuggling Raid — Rain-Slicked Container Port & Freighter"):
 *   * North Container Labyrinth (24+ detailed corrugated shipping containers in 4 weathered colors,
 *     4 two-tier stacked container towers, 4 walkable open-top tunnel containers)
 *   * Center Quay Strip with 2 Giant Red STS Gantry Cranes (8 solid portal legs + overhead
 *     GantryCrane_01..02_Canopy booms & HoistedContainer_01..02_Canopy at Y=4.5-13m)
 *   * Moored Cargo Freighter with open-top stern superstructure, hatch coamings, deck containers,
 *     mooring bollards, and segmented safety rails
 *   * West & East Pier Arms with open-top Customs Inspection Sheds, 4 parked dock forklifts,
 *     CC0 photogrammetry barriers, crates, hazard barrels, generators, shelves, power boxes
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±52.0, 0.25, ±38.0) with (±1.7, ±1.7) spread (NO Pad_Team meshes!)
 * - 18 Card Candidate Points (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction Door Candidate Points (all >= 26.5m from every spawn, >= 3.6m clear of colliders & water)
 * - 165 Floor Decals (Port_Decal_001..165) + 16 Rain Puddles (Port_PuddleDecal_01..16)
 *   + 12 Rust/Blood Drag Trails (Port_BloodDragDecal_01..12) + 32 Scatter Groups (Port_Scatter_01..32)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map8_Liman_v3');
const GLTF_NAME = 'Map8_Gece_Konteyner_Limani_5v5v5v5_v3.gltf';
const BIN_NAME = 'Map8_Gece_Konteyner_Limani_5v5v5v5_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112308;
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

  // Smooth sloped ramp slab along X or Z (solid box with sloped top from yStart to yEnd)
  addSlopedRamp(x0, x1, z0, z1, yBottom, yTopAtStart, yTopAtEnd, slopeAxis = 'z', uvScale = 0.25) {
    const sx = x1 - x0, sz = z1 - z0;
    const y00 = slopeAxis === 'z' ? yTopAtStart : yTopAtStart;
    const y10 = slopeAxis === 'z' ? yTopAtStart : yTopAtEnd;
    const y11 = slopeAxis === 'z' ? yTopAtEnd : yTopAtEnd;
    const y01 = slopeAxis === 'z' ? yTopAtEnd : yTopAtStart;

    // Top sloped face (normal tilted slightly)
    let nx = 0, ny = 1, nz = 0;
    if (slopeAxis === 'z') {
      nz = -(yTopAtEnd - yTopAtStart) / sz;
    } else {
      nx = -(yTopAtEnd - yTopAtStart) / sx;
    }
    const nLen = Math.hypot(nx, ny, nz);
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Top face (CCW when viewed from +Y)
    this.addQuad(
      [x0, y01, z1], [x1, y11, z1], [x1, y10, z0], [x0, y00, z0],
      [nx, ny, nz], 0, 0, sx * uvScale, sz * uvScale
    );
    // Bottom face
    this.addQuad(
      [x0, yBottom, z0], [x1, yBottom, z0], [x1, yBottom, z1], [x0, yBottom, z1],
      [0, -1, 0], 0, 0, sx * uvScale, sz * uvScale
    );
    // +Z side
    this.addQuad(
      [x0, yBottom, z1], [x1, yBottom, z1], [x1, y11, z1], [x0, y01, z1],
      [0, 0, 1], 0, 0, sx * uvScale, 1
    );
    // -Z side
    this.addQuad(
      [x1, yBottom, z0], [x0, yBottom, z0], [x0, y00, z0], [x1, y10, z0],
      [0, 0, -1], 0, 0, sx * uvScale, 1
    );
    // +X side
    this.addQuad(
      [x1, yBottom, z1], [x1, yBottom, z0], [x1, y10, z0], [x1, y11, z1],
      [1, 0, 0], 0, 0, sz * uvScale, 1
    );
    // -X side
    this.addQuad(
      [x0, yBottom, z0], [x0, yBottom, z1], [x0, y01, z1], [x0, y00, z0],
      [-1, 0, 0], 0, 0, sz * uvScale, 1
    );
  }

  // Modular Industrial / Customs / Ship Bulkhead Wall Segment
  addWallSegment(x0, z0, x1, z1, baseY = 0.0, height = 3.0, thick = 0.75) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const segsX = Math.max(2, Math.round(len * 0.6));

    // Main wall body
    this.addBeveledBox(cx, baseY + height * 0.5, cz, len, height, thick, yaw, 0.05, 1.0 / height, segsX, 3, 1);
    // Concrete/steel base plinth
    this.addBeveledBox(cx, baseY + 0.14, cz, len + 0.02, 0.28, thick + 0.08, yaw, 0.025, 0.5, Math.max(2, Math.round(len * 0.4)), 1, 1);
    // Top coping rail
    this.addBeveledBox(cx, baseY + height - 0.08, cz, len + 0.02, 0.16, thick + 0.08, yaw, 0.02, 0.5, Math.max(2, Math.round(len * 0.4)), 1, 1);

    // Structural pilasters every ~3.5m
    const numRibs = Math.max(2, Math.floor(len / 3.5) + 1);
    for (let i = 0; i < numRibs; i++) {
      const t = numRibs === 1 ? 0 : (i / (numRibs - 1) - 0.5) * (len - 0.36);
      const rx = cx + t * cosY;
      const rz = cz + t * sinY;
      this.addBeveledBox(rx, baseY + height * 0.5, rz, 0.28, height - 0.04, thick + 0.10, yaw, 0.025, 0.5, 1, 2, 1);
    }
  }

  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 16, heightSegs = 1, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
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
  // CRITICAL: ZERO emission across ALL materials!
  return registerMaterial(mat);
}

// --- Register All Port v3 PBR Materials (STRICTLY 0 EMISSION!) ---
const MAT = {
  // Custom Port v3 PBR sets
  wetQuayConcrete: makePBRMaterial('Mat_Port_WetQuayConcrete_2K', 'port_wet_quay_concrete_2k_Diffuse.png', 'port_wet_quay_concrete_2k_nor_gl.png', 'port_wet_quay_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  harborWater: makePBRMaterial('Mat_Port_HarborWater_2K', 'port_harbor_water_2k_Diffuse.png', 'port_harbor_water_2k_nor_gl.png', 'port_harbor_water_2k_arm.png', { metallicFactor: 0.08, roughnessFactor: 0.14, normalScale: 1.35 }),
  shipDeckSteel: makePBRMaterial('Mat_Port_ShipDeckSteel_2K', 'port_ship_deck_steel_2k_Diffuse.png', 'port_ship_deck_steel_2k_nor_gl.png', 'port_ship_deck_steel_2k_arm.png', { normalScale: 1.35 }),
  containerRed: makePBRMaterial('Mat_Port_ContainerRed_2K', 'port_container_red_2k_Diffuse.png', 'port_container_red_2k_nor_gl.png', 'port_container_red_2k_arm.png', { normalScale: 1.4 }),
  containerNavy: makePBRMaterial('Mat_Port_ContainerNavy_2K', 'port_container_navy_2k_Diffuse.png', 'port_container_navy_2k_nor_gl.png', 'port_container_navy_2k_arm.png', { normalScale: 1.4 }),
  containerOlive: makePBRMaterial('Mat_Port_ContainerOlive_2K', 'port_container_olive_2k_Diffuse.png', 'port_container_olive_2k_nor_gl.png', 'port_container_olive_2k_arm.png', { normalScale: 1.4 }),
  containerOchre: makePBRMaterial('Mat_Port_ContainerOchre_2K', 'port_container_ochre_2k_Diffuse.png', 'port_container_ochre_2k_nor_gl.png', 'port_container_ochre_2k_arm.png', { normalScale: 1.4 }),
  gantryCraneRed: makePBRMaterial('Mat_Hero_GantryCraneRed_2K', 'hero_gantry_crane_red_2k_Diffuse.png', 'hero_gantry_crane_red_2k_nor_gl.png', 'hero_gantry_crane_red_2k_arm.png', { normalScale: 1.4 }),
  // Shared CC0 PBR sets
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  mossConcrete: makePBRMaterial('Mat_Dock_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  gravelGround: makePBRMaterial('Mat_Port_Gravel_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  brushedSteel: makePBRMaterial('Mat_Port_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_ShipHullSteel_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
  rustyMetal: makePBRMaterial('Mat_Rusty_Metal_2K', 'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg', { normalScale: 1.35 }),
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
  decalDockMarkings: makePBRMaterial('Mat_Decal_DockMarkings_Mask', 'decal_port_dock_markings_Diffuse.png', 'decal_port_dock_markings_nor_gl.png', 'decal_port_dock_markings_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  decalRainPuddle: makePBRMaterial('Mat_Decal_RainPuddle_Mask', 'decal_rain_puddle_slick_Diffuse.png', 'decal_rain_puddle_slick_nor_gl.png', 'decal_rain_puddle_slick_arm.png', { alphaMode: 'MASK', metallicFactor: 0.06, roughnessFactor: 0.08, normalScale: 1.1 }),
  decalRustBloodDrag: makePBRMaterial('Mat_Decal_RustBloodDrag_Mask', 'decal_rust_blood_drag_Diffuse.png', 'decal_rust_blood_drag_nor_gl.png', 'decal_rust_blood_drag_arm.png', { alphaMode: 'MASK', metallicFactor: 0.1, roughnessFactor: 0.28, normalScale: 1.3 }),
  decalCargoDebris: makePBRMaterial('Mat_Decal_CargoDebris_Mask', 'decal_cargo_manifest_debris_Diffuse.png', 'decal_cargo_manifest_debris_nor_gl.png', 'decal_cargo_manifest_debris_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalChemPuddle: makePBRMaterial('Mat_Decal_ChemPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.10, normalScale: 1.15 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTracks: makePBRMaterial('Mat_Decal_Tracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalMoss: makePBRMaterial('Mat_Decal_Moss_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 })
};

const CONTAINER_MATS = [MAT.containerRed, MAT.containerNavy, MAT.containerOlive, MAT.containerOchre];

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
  [-52.0, 0.25, -38.0], // Team0 (NW Customs Yard)
  [ 52.0, 0.25, -38.0], // Team1 (NE Customs Yard)
  [-52.0, 0.25,  38.0], // Team2 (SW Pier Head)
  [ 52.0, 0.25,  38.0]  // Team3 (SE Pier Head)
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

// 18 Card Candidate Points (ALL >= 18.0m from every spawn, strictly on solid quay/ship deck!)
const CARD_POINTS = [
  // 4 on the Moored Cargo Ship Deck (Y = 0.16 + 1.15 = 1.31)
  [  0.0, 1.31,  21.0], // 01: Ship Mid-Fore Deck
  [-13.0, 1.31,  26.0], // 02: Ship Port Deck
  [ 13.0, 1.31,  26.0], // 03: Ship Starboard Deck
  [  0.0, 1.31,  32.0], // 04: Ship Stern Superstructure Interior
  // 4 inside the 4 Walkable Open-Top Container Tunnels in North Yard
  [-24.0, 1.15, -18.0], // 05: NW Tunnel Container
  [ 24.0, 1.15, -18.0], // 06: NE Tunnel Container
  [  0.0, 1.15, -14.0], // 07: Center-South Tunnel Container
  [  0.0, 1.15, -30.0], // 08: Center-North Tunnel Container
  // 4 along the Central STS Gantry Crane Quay Strip
  [-15.0, 1.15,   0.0], // 09: West STS Gantry Crane Portal
  [ 15.0, 1.15,   0.0], // 10: East STS Gantry Crane Portal
  [-36.0, 1.15,   2.0], // 11: West Quay Strip
  [ 36.0, 1.15,   2.0], // 12: East Quay Strip
  // 4 on the West & East Pier Arms
  [-44.0, 1.15,  16.0], // 13: West Pier Arm Customs Shed
  [ 44.0, 1.15,  16.0], // 14: East Pier Arm Customs Shed
  [-35.5, 1.15,  25.0], // 15: West Pier Arm Container Island (>= 18.6m from Team2)
  [ 35.5, 1.15,  25.0], // 16: East Pier Arm Container Island (>= 18.6m from Team3)
  // 2 in the North Outer Customs & Inspection Lanes
  [-24.0, 1.15, -34.0], // 17: NW Outer Inspection Lane
  [ 24.0, 1.15, -34.0]  // 18: NE Outer Inspection Lane
];

// 16 Extraction Door Candidate Points (ALL >= 26.5m from every spawn, >= 3.6m clear of colliders & water!)
const DOOR_POINTS = [
  // 3 North Customs Main Exit Gates
  [  0.0, 0.10, -40.0], // 01: North Central Customs Gate
  [-22.0, 0.10, -40.0], // 02: North-West Customs Gate
  [ 22.0, 0.10, -40.0], // 03: North-East Customs Gate
  // 2 Outer West/East Pier Freight Gates
  [-56.0, 0.10,   0.0], // 04: West Outer Freight Gate
  [ 56.0, 0.10,   0.0], // 05: East Outer Freight Gate
  // 4 Open Quay Strip Extraction Zones
  [-26.0, 0.10,   0.0], // 06: West-Center Quay Strip
  [ 26.0, 0.10,   0.0], // 07: East-Center Quay Strip
  [  0.0, 0.10,  -4.0], // 08: Central Quay North
  [  0.0, 0.10,   4.0], // 09: Central Quay South (4.0m from Z=8 water edge)
  // 4 Container Yard & Pier Arm Breezeways
  [-35.5, 0.10, -13.5], // 10: NW Container Yard Breezeway (>= 27.1m from Team0)
  [ 35.5, 0.10, -13.5], // 11: NE Container Yard Breezeway (>= 27.1m from Team1)
  [-39.5, 0.10,  11.5], // 12: West Pier Arm Entry (>= 27.0m from Team2, 9.5m from water)
  [ 39.5, 0.10,  11.5], // 13: East Pier Arm Entry (>= 27.0m from Team3, 9.5m from water)
  // 3 Cargo Ship Deck Extraction Points (Y = 0.16 + 0.10 = 0.26)
  [ -9.0, 0.26,  20.0], // 14: Ship Fore-Port Deck
  [  9.0, 0.26,  20.0], // 15: Ship Fore-Starboard Deck
  [  0.0, 0.26,  26.5]  // 16: Ship Mid-Hold Deck
];

// Helper: deck surface classification & distance to water basin
function isOnQuay(x, z, margin = 0) {
  if (x < -62 + margin || x > 62 - margin || z < -46 + margin || z > 46 - margin) return false;
  if (z <= 8 - margin) return true;
  if (x <= -30 - margin && z >= 8 - margin) return true;
  if (x >= 30 + margin && z >= 8 - margin) return true;
  return false;
}
function isOnShip(x, z, margin = 0) {
  return x >= -21 + margin && x <= 21 - margin && z >= 15 + margin && z <= 37 - margin;
}
function surfaceYAt(x, z) {
  if (isOnShip(x, z, 0)) return 0.16;
  if (isOnQuay(x, z, 0)) return 0.0;
  return null; // over water or outside
}
function distToWaterEdge(x, z) {
  // Water basin covers X in [-30, 30], Z in [8, 46] MINUS ship X in [-21, 21], Z in [15, 37]
  if (isOnShip(x, z, 0)) {
    return Math.min(x - (-21), 21 - x, z - 15, 37 - z);
  }
  if (isOnQuay(x, z, 0)) {
    // Distance from point on quay to rectangle [-30, 30] x [8, 46]
    const dx = Math.max(-30 - x, 0, x - 30);
    const dz = Math.max(8 - z, 0, z - 46);
    return Math.hypot(dx, dz);
  }
  return -1.0; // over water!
}

// ============================================================================
// 2. U-SHAPED CONCRETE QUAY DECK, HARBOR WATER BASIN, CARGO SHIP & 6 GANGWAYS
// ============================================================================
function buildQuayAndHarbor() {
  // 2a. Quay_Deck_North (X in [-62, 62], Z in [-46, 8], Y in [-2.0, 0.0])
  {
    const bQuay = new MeshBuilder();
    const bCoping = new MeshBuilder();
    const bFender = new MeshBuilder();
    bQuay.addBeveledBox(0, -1.0, -19.0, 124.0, 2.0, 54.0, 0, 0.02, 0.125, 16, 1, 8);
    // Heavy steel-armored concrete coping along water edge Z = 7.7..8.0
    bCoping.addBeveledBox(0, -0.06, 7.82, 60.4, 0.14, 0.36, 0, 0.02, 0.35, 12, 1, 1);
    // Heavy black rubber/steel dock fenders along vertical quay wall Z = 8.08
    for (const fx of [-27, -21, -15, -4, 4, 15, 21, 27]) {
      bFender.addBeveledBox(fx, -0.75, 8.08, 1.4, 1.15, 0.22, 0, 0.04, 0.6);
    }
    addGeometryNode('Quay_Deck_North', registerMesh('Quay_Deck_North_Mesh', [
      { builder: bQuay, mat: MAT.wetQuayConcrete },
      { builder: bCoping, mat: MAT.chippedConcrete },
      { builder: bFender, mat: MAT.heroDarkMetal }
    ]));
  }

  // 2b. Quay_Deck_WestArm (X in [-62, -30], Z in [8, 46], Y in [-2.0, 0.0])
  {
    const bQuay = new MeshBuilder();
    const bCoping = new MeshBuilder();
    const bFender = new MeshBuilder();
    bQuay.addBeveledBox(-46.0, -1.0, 27.0, 32.0, 2.0, 38.0, 0, 0.02, 0.125, 6, 1, 8);
    bCoping.addBeveledBox(-30.18, -0.06, 27.0, 0.36, 0.14, 38.0, 0, 0.02, 0.35, 1, 1, 10);
    for (const fz of [11, 15, 25, 28, 37, 42]) {
      bFender.addBeveledBox(-29.92, -0.75, fz, 0.22, 1.15, 1.4, 0, 0.04, 0.6);
    }
    addGeometryNode('Quay_Deck_WestArm', registerMesh('Quay_Deck_WestArm_Mesh', [
      { builder: bQuay, mat: MAT.wetQuayConcrete },
      { builder: bCoping, mat: MAT.chippedConcrete },
      { builder: bFender, mat: MAT.heroDarkMetal }
    ]));
  }

  // 2c. Quay_Deck_EastArm (X in [30, 62], Z in [8, 46], Y in [-2.0, 0.0])
  {
    const bQuay = new MeshBuilder();
    const bCoping = new MeshBuilder();
    const bFender = new MeshBuilder();
    bQuay.addBeveledBox(46.0, -1.0, 27.0, 32.0, 2.0, 38.0, 0, 0.02, 0.125, 6, 1, 8);
    bCoping.addBeveledBox(30.18, -0.06, 27.0, 0.36, 0.14, 38.0, 0, 0.02, 0.35, 1, 1, 10);
    for (const fz of [11, 15, 25, 28, 37, 42]) {
      bFender.addBeveledBox(29.92, -0.75, fz, 0.22, 1.15, 1.4, 0, 0.04, 0.6);
    }
    addGeometryNode('Quay_Deck_EastArm', registerMesh('Quay_Deck_EastArm_Mesh', [
      { builder: bQuay, mat: MAT.wetQuayConcrete },
      { builder: bCoping, mat: MAT.chippedConcrete },
      { builder: bFender, mat: MAT.heroDarkMetal }
    ]));
  }

  // 2d. Harbor_Water_Basin (X in [-30.3, 30.3], Z in [7.7, 46.0], Y = -1.40m, ZERO emission!)
  {
    const bWater = new MeshBuilder();
    const segX = 24, segZ = 16;
    const xMin = -30.3, xMax = 30.3, zMin = 7.7, zMax = 46.0;
    const baseIdx = bWater.pos.length / 3;
    for (let iz = 0; iz <= segZ; iz++) {
      const fz = iz / segZ;
      const wz = zMin + fz * (zMax - zMin);
      for (let ix = 0; ix <= segX; ix++) {
        const fx = ix / segX;
        const wx = xMin + fx * (xMax - xMin);
        const wave = Math.sin(wx * 0.42 + wz * 0.31) * 0.045 + Math.cos(wx * 0.78 - wz * 0.55) * 0.025;
        const wy = -1.40 + wave;
        bWater.addVertex(wx, wy, wz, 0, 1, 0, fx * 7.5, fz * 5.0, 1, 0, 0, 1);
      }
    }
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = baseIdx + iz * (segX + 1) + ix;
        const b = a + 1;
        const c = a + (segX + 1);
        const d = c + 1;
        bWater.ind.push(a, c, d, a, d, b);
      }
    }
    addGeometryNode('Harbor_Water_Basin', registerMesh('Harbor_Water_Basin_Mesh', [
      { builder: bWater, mat: MAT.harborWater }
    ]));
  }

  // 2e. Flush Steel Gantry Crane Rails along Quay Strip (Deck in name -> never fades)
  {
    const bRail = new MeshBuilder();
    bRail.addBeveledBox(0, 0.008, -5.2, 56.0, 0.02, 0.24, 0, 0.005, 0.5, 10, 1, 1);
    bRail.addBeveledBox(0, 0.008,  5.2, 56.0, 0.02, 0.24, 0, 0.005, 0.5, 10, 1, 1);
    addGeometryNode('CraneRails_Deck', registerMesh('CraneRails_Deck_Mesh', [
      { builder: bRail, mat: MAT.rustyMetal }
    ]));
  }

  // 2f. Moored Cargo Freighter: CargoShip_Deck (Y = +0.16m) + CargoShip_Hull (Y = -2.0..+0.14m)
  {
    const bDeck = new MeshBuilder();
    bDeck.addBeveledBox(0, 0.03, 26.0, 42.0, 0.26, 22.0, 0, 0.015, 0.16, 10, 1, 6);
    addGeometryNode('CargoShip_Deck', registerMesh('CargoShip_Deck_Mesh', [
      { builder: bDeck, mat: MAT.shipDeckSteel }
    ]));

    // Tapered freighter hull with dark steel freeboard, rusted waterline boot-top, bow & stern
    const bUpperHull = new MeshBuilder();
    const bWaterline = new MeshBuilder();
    const bTrim = new MeshBuilder();
    // Upper hull freeboard (Y = -0.85 .. +0.14)
    bUpperHull.addBeveledBox(0, -0.36, 26.0, 42.4, 1.0, 22.4, 0, 0.06, 0.15, 8, 2, 4);
    // Bow taper (west end X = -21.2 .. -23.0) & Stern transom flare (east end X = +21.2 .. +22.4)
    bUpperHull.addBeveledBox(-21.6, -0.36, 26.0, 1.6, 0.96, 16.0, 0, 0.08, 0.2);
    bUpperHull.addBeveledBox( 21.6, -0.36, 26.0, 1.4, 0.96, 18.0, 0, 0.08, 0.2);
    // Anti-fouling red-rust waterline belt (Y = -2.0 .. -0.85)
    bWaterline.addBeveledBox(0, -1.42, 26.0, 41.8, 1.15, 21.8, 0, 0.06, 0.15, 8, 1, 4);
    // Rubbing strakes & anchor bolsters
    bTrim.addBeveledBox(0, -0.02, 14.76, 42.2, 0.16, 0.18, 0, 0.02, 0.4, 8, 1, 1);
    bTrim.addBeveledBox(0, -0.02, 37.24, 42.2, 0.16, 0.18, 0, 0.02, 0.4, 8, 1, 1);
    bTrim.addBeveledBox(-21.24, -0.02, 26.0, 0.18, 0.16, 22.2, 0, 0.02, 0.4, 1, 1, 4);
    bTrim.addBeveledBox( 21.24, -0.02, 26.0, 0.18, 0.16, 22.2, 0, 0.02, 0.4, 1, 1, 4);

    addGeometryNode('CargoShip_Hull', registerMesh('CargoShip_Hull_Mesh', [
      { builder: bUpperHull, mat: MAT.heroDarkMetal },
      { builder: bWaterline, mat: MAT.containerRed },
      { builder: bTrim, mat: MAT.rustyMetal }
    ]));
  }

  // 2g. 6 Wide Steel Boarding Gangway Ramps (ShipGangway_Deck_01..06, 4.5m wide, Y=0.0->+0.16m)
  const gangways = [
    // 2 North Ramps (Quay Z=8 -> Ship Z=15)
    { name: 'ShipGangway_Deck_01', x0: -12.75, x1: -8.25, z0: 7.7, z1: 15.3, yStart: 0.0, yEnd: 0.16, axis: 'z' },
    { name: 'ShipGangway_Deck_02', x0:   8.25, x1: 12.75, z0: 7.7, z1: 15.3, yStart: 0.0, yEnd: 0.16, axis: 'z' },
    // 2 West Ramps (Quay X=-30 -> Ship X=-21)
    { name: 'ShipGangway_Deck_03', x0: -30.3, x1: -20.7, z0: 17.75, z1: 22.25, yStart: 0.0, yEnd: 0.16, axis: 'x' },
    { name: 'ShipGangway_Deck_04', x0: -30.3, x1: -20.7, z0: 29.75, z1: 34.25, yStart: 0.0, yEnd: 0.16, axis: 'x' },
    // 2 East Ramps (Ship X=21 -> Quay X=30)
    { name: 'ShipGangway_Deck_05', x0:  20.7, x1:  30.3, z0: 17.75, z1: 22.25, yStart: 0.16, yEnd: 0.0, axis: 'x' },
    { name: 'ShipGangway_Deck_06', x0:  20.7, x1:  30.3, z0: 29.75, z1: 34.25, yStart: 0.16, yEnd: 0.0, axis: 'x' }
  ];
  for (const gw of gangways) {
    const bSlab = new MeshBuilder();
    const bGirder = new MeshBuilder();
    bSlab.addSlopedRamp(gw.x0, gw.x1, gw.z0, gw.z1, -0.35, gw.yStart, gw.yEnd, gw.axis, 0.25);
    // Low edge toe-curbs (0.09m above deck, flush on outer edges so players walk cleanly)
    const cx = (gw.x0 + gw.x1) * 0.5;
    const cz = (gw.z0 + gw.z1) * 0.5;
    const len = gw.axis === 'z' ? (gw.z1 - gw.z0) : (gw.x1 - gw.x0);
    if (gw.axis === 'z') {
      bGirder.addBeveledBox(gw.x0 + 0.08, 0.10, cz, 0.16, 0.14, len - 0.4, 0, 0.015, 0.4);
      bGirder.addBeveledBox(gw.x1 - 0.08, 0.10, cz, 0.16, 0.14, len - 0.4, 0, 0.015, 0.4);
    } else {
      bGirder.addBeveledBox(cx, 0.10, gw.z0 + 0.08, len - 0.4, 0.14, 0.16, 0, 0.015, 0.4);
      bGirder.addBeveledBox(cx, 0.10, gw.z1 - 0.08, len - 0.4, 0.14, 0.16, 0, 0.015, 0.4);
    }
    addGeometryNode(gw.name, registerMesh(`${gw.name}_Mesh`, [
      { builder: bSlab, mat: MAT.shipDeckSteel },
      { builder: bGirder, mat: MAT.containerOchre }
    ]));
  }
}
buildQuayAndHarbor();

// ============================================================================
// 3. DETAILED CORRUGATED SHIPPING CONTAINERS, TUNNELS & PERIMETER SEA-WALLS
// ============================================================================
function buildContainerMesh(meshName, len, width, height, colorMat) {
  const bBody = new MeshBuilder();
  const bTrim = new MeshBuilder();

  // Main recessed corrugated steel box
  bBody.addBeveledBox(0, height * 0.5, 0, len - 0.08, height - 0.06, width - 0.08, 0, 0.03, 0.35, Math.max(4, Math.round(len)), 2, 2);

  // Rhythmic vertical corrugated side ribs (relief on +Z and -Z faces)
  const ribStep = 0.65;
  const numRibs = Math.floor((len - 0.8) / ribStep);
  for (let i = 0; i <= numRibs; i++) {
    const rx = -((numRibs * ribStep) * 0.5) + i * ribStep;
    bBody.addBeveledBox(rx, height * 0.5,  (width * 0.5 - 0.02), 0.14, height - 0.28, 0.06, 0, 0.01, 0.5);
    bBody.addBeveledBox(rx, height * 0.5, -(width * 0.5 - 0.02), 0.14, height - 0.28, 0.06, 0, 0.01, 0.5);
  }

  // Heavy ISO top & bottom longitudinal rails
  bTrim.addBeveledBox(0, 0.09,  width * 0.5 - 0.06, len, 0.18, 0.12, 0, 0.015, 0.4);
  bTrim.addBeveledBox(0, 0.09, -width * 0.5 + 0.06, len, 0.18, 0.12, 0, 0.015, 0.4);
  bTrim.addBeveledBox(0, height - 0.09,  width * 0.5 - 0.06, len, 0.18, 0.12, 0, 0.015, 0.4);
  bTrim.addBeveledBox(0, height - 0.09, -width * 0.5 + 0.06, len, 0.18, 0.12, 0, 0.015, 0.4);

  // 4 Vertical corner posts & ISO corner castings
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bTrim.addBeveledBox(sx * (len * 0.5 - 0.09), height * 0.5, sz * (width * 0.5 - 0.09), 0.18, height, 0.18, 0, 0.015, 0.5);
    }
  }

  // Rear cargo door vertical locking bars (+X end)
  for (const lz of [-0.55, -0.22, 0.22, 0.55]) {
    bTrim.addCylinder(len * 0.5 + 0.01, height * 0.5, lz, 0.025, 0.025, height - 0.32, 8, 1, true);
  }

  return registerMesh(meshName, [
    { builder: bBody, mat: colorMat },
    { builder: bTrim, mat: MAT.rustyMetal }
  ]);
}

// Reusable standard container mesh library (4 colors x 2 lengths)
const stdContainer10m = CONTAINER_MATS.map((m, i) => buildContainerMesh(`StdContainer10m_C${i}`, 10.0, 2.5, 2.6, m));
const stdContainer8m  = CONTAINER_MATS.map((m, i) => buildContainerMesh(`StdContainer8m_C${i}`,   8.0, 2.5, 2.6, m));
const stdContainer6m  = CONTAINER_MATS.map((m, i) => buildContainerMesh(`StdContainer6m_C${i}`,   5.8, 2.4, 2.5, m));

function buildContainerLabyrinthAndTunnels() {
  // 3a. 4 Walkable Open-Top Tunnel Containers (modular side walls, 4.2m interior clearance -> >= 2.05m from CardPoint!)
  const tunnels = [
    { id: '01', cx: -24.0, cz: -18.0, len: 10.0, colorIdx: 0 },
    { id: '02', cx:  24.0, cz: -18.0, len: 10.0, colorIdx: 1 },
    { id: '03', cx:   0.0, cz: -14.0, len: 10.0, colorIdx: 2 },
    { id: '04', cx:   0.0, cz: -30.0, len: 10.0, colorIdx: 3 }
  ];
  for (const tun of tunnels) {
    const mat = CONTAINER_MATS[tun.colorIdx];
    const halfSpan = 2.32; // inner face at +-2.10m, wall thickness 0.44m -> >= 2.10m clear from center CardPoint!
    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? -halfSpan : halfSpan;
      const bWall = new MeshBuilder();
      const bTrim = new MeshBuilder();
      bWall.addBeveledBox(tun.cx, 1.30, tun.cz + sz, tun.len, 2.60, 0.44, 0, 0.03, 0.35, 6, 2, 1);
      // Ribbed exterior & interior frame posts
      for (let rx = -tun.len * 0.5 + 0.5; rx <= tun.len * 0.5 - 0.5; rx += 1.2) {
        bTrim.addBeveledBox(tun.cx + rx, 1.30, tun.cz + sz, 0.14, 2.56, 0.50, 0, 0.015, 0.5);
      }
      // Open-ended cargo door leaf folded outward at entrance ends
      bTrim.addBeveledBox(tun.cx - tun.len * 0.5 - 0.06, 1.30, tun.cz + sz, 0.16, 2.62, 0.54, 0, 0.02, 0.5);
      bTrim.addBeveledBox(tun.cx + tun.len * 0.5 + 0.06, 1.30, tun.cz + sz, 0.16, 2.62, 0.54, 0, 0.02, 0.5);
      const name = `ContainerTunnel_${tun.id}_Wall_0${side + 1}`;
      addGeometryNode(name, registerMesh(`${name}_Mesh`, [
        { builder: bWall, mat },
        { builder: bTrim, mat: MAT.rustyMetal }
      ]));
    }
  }

  // 3b. North Container Labyrinth (24 Ground Containers + 4 2-Tier Stacked Towers)
  // Carefully spaced for >= 3.8m alleys, zero overlap with Tunnels/Spawns/Cards/Doors
  const yardContainers = [
    // Row 1 (North Outer Yard Z = -34..-36, flanking CardPoint_17/18 at (±24,-34) and DoorPoint_01..03 at (0/±22,-40))
    { x: -37.0, z: -34.0, len: 10, yaw: 0.0,  c: 1 },
    { x:  37.0, z: -34.0, len: 10, yaw: 0.0,  c: 0 },
    { x: -12.0, z: -34.5, len: 8,  yaw: 0.0,  c: 3 },
    { x:  12.0, z: -34.5, len: 8,  yaw: 0.0,  c: 2 },

    // Row 2 (Mid-North Container Blocks Z = -25..-27, includes 4 2-tier towers!)
    { x: -38.0, z: -26.0, len: 10, yaw: 0.0,  c: 0, stack: true }, // Tower NW
    { x:  38.0, z: -26.0, len: 10, yaw: 0.0,  c: 1, stack: true }, // Tower NE
    { x: -13.0, z: -24.0, len: 8,  yaw: 0.0,  c: 2, stack: true }, // Tower CW
    { x:  13.0, z: -24.0, len: 8,  yaw: 0.0,  c: 3, stack: true }, // Tower CE
    { x: -51.0, z: -24.0, len: 8,  yaw: Math.PI * 0.5, c: 2 },
    { x:  51.0, z: -24.0, len: 8,  yaw: Math.PI * 0.5, c: 3 },

    // Row 3 (Mid-South Container Blocks Z = -18..-10, clear of DoorPoint_10/11 at (±35.5,-13.5))
    { x: -49.0, z: -12.0, len: 10, yaw: 0.0,  c: 1 },
    { x:  49.0, z: -12.0, len: 10, yaw: 0.0,  c: 0 },
    { x: -13.0, z: -12.0, len: 8,  yaw: 0.0,  c: 0 },
    { x:  13.0, z: -12.0, len: 8,  yaw: 0.0,  c: 1 },
    { x: -24.0, z: -10.0, len: 8,  yaw: 0.0,  c: 3 },
    { x:  24.0, z: -10.0, len: 8,  yaw: 0.0,  c: 2 },

    // Outer West/East Yard Flankers (Z = -6..-26, clear of DoorPoint_04/05 at (±56,0))
    { x: -46.0, z:  -4.5, len: 8,  yaw: 0.0,  c: 3 },
    { x:  46.0, z:  -4.5, len: 8,  yaw: 0.0,  c: 2 },
    { x: -46.0, z:   3.5, len: 8,  yaw: 0.0,  c: 0 },
    { x:  46.0, z:   3.5, len: 8,  yaw: 0.0,  c: 1 },

    // Pier Arm Container Islands (West & East Arms, framing CardPoint_15/16 at (±35.5, 25.0))
    { x: -43.5, z:  26.5, len: 8,  yaw: Math.PI * 0.5, c: 0 },
    { x:  43.5, z:  26.5, len: 8,  yaw: Math.PI * 0.5, c: 1 },
    { x: -53.5, z:  24.5, len: 8,  yaw: Math.PI * 0.5, c: 2 },
    { x:  53.5, z:  24.5, len: 8,  yaw: Math.PI * 0.5, c: 3 },
    { x: -37.5, z:  38.0, len: 8,  yaw: Math.PI * 0.5, c: 1 },
    { x:  37.5, z:  38.0, len: 8,  yaw: Math.PI * 0.5, c: 0 }
  ];

  let cIdx = 1;
  for (const c of yardContainers) {
    const mesh = c.len === 10 ? stdContainer10m[c.c] : stdContainer8m[c.c];
    addGeometryNode(`Container_${String(cIdx++).padStart(2, '0')}`, mesh, [c.x, 0.0, c.z], c.yaw);
    if (c.stack) {
      // 2-tier upper container slightly rotated for gritty realism
      const upperColor = (c.c + 2) % 4;
      const upperMesh = c.len === 10 ? stdContainer10m[upperColor] : stdContainer8m[upperColor];
      addGeometryNode(`Container_Stack_${String(cIdx++).padStart(2, '0')}`, upperMesh, [c.x, 2.60, c.z], c.yaw + 0.04);
    }
  }

  // 3c. Perimeter Security Sea-Walls & Coastal Rocks (X=±61.4, Z=-45.4, Z=+45.4 on pier heads)
  const perimWalls = [
    // North customs boundary wall (segmented for clean occlusion)
    [-61.2, -45.4, -36.0, -45.4],
    [-36.0, -45.4, -10.0, -45.4],
    [-10.0, -45.4,  10.0, -45.4],
    [ 10.0, -45.4,  36.0, -45.4],
    [ 36.0, -45.4,  61.2, -45.4],
    // West outer perimeter wall
    [-61.4, -45.0, -61.4, -15.0],
    [-61.4, -15.0, -61.4,  15.0],
    [-61.4,  15.0, -61.4,  45.0],
    // East outer perimeter wall
    [ 61.4, -45.0,  61.4, -15.0],
    [ 61.4, -15.0,  61.4,  15.0],
    [ 61.4,  15.0,  61.4,  45.0],
    // South pier-head seawall caps (leaving harbor mouth X in [-30, 30] open!)
    [-61.0,  45.4, -31.0,  45.4],
    [ 31.0,  45.4,  61.0,  45.4]
  ];
  for (let i = 0; i < perimWalls.length; i++) {
    const [x0, z0, x1, z1] = perimWalls[i];
    const bW = new MeshBuilder();
    bW.addWallSegment(x0, z0, x1, z1, 0.0, 2.8, 0.7);
    addGeometryNode(`Wall_PortPerimeter_${String(i + 1).padStart(2, '0')}`, registerMesh(`Wall_PortPerimeter_${i + 1}_Mesh`, [
      { builder: bW, mat: i % 2 === 0 ? MAT.chippedConcrete : MAT.corrugatedIron }
    ]));
  }
}
buildContainerLabyrinthAndTunnels();

// ============================================================================
// 4. TWO GIANT RED STS GANTRY CRANES (CENTER QUAY STRIP Z in [-7, 7])
// ============================================================================
function buildSTSGantryCranes() {
  const craneXs = [-15.0, 15.0];
  let legIdx = 1;

  for (let ci = 0; ci < craneXs.length; ci++) {
    const cx = craneXs[ci];
    const num = `0${ci + 1}`;

    // 4 heavy solid steel portal legs with rail bogie trucks (solid cover at Y=0..6.2m)
    const legOffsets = [
      [-4.5, -5.2], [4.5, -5.2],
      [-4.5,  5.2], [4.5,  5.2]
    ];
    for (const [lx, lz] of legOffsets) {
      const bLeg = new MeshBuilder();
      const bBogie = new MeshBuilder();
      // Rail bogie base truck (1.35m x 0.9m x 1.2m)
      bBogie.addBeveledBox(cx + lx, 0.45, lz, 1.35, 0.90, 1.15, 0, 0.05, 0.5);
      // Bogie steel wheels
      bBogie.addCylinder(cx + lx - 0.42, 0.25, lz, 0.25, 0.25, 0.35, 12, 1, true, 0, Math.PI * 0.5);
      bBogie.addCylinder(cx + lx + 0.42, 0.25, lz, 0.25, 0.25, 0.35, 12, 1, true, 0, Math.PI * 0.5);
      // Vertical heavy red steel crane leg column (Y=0.85..6.4m)
      bLeg.addBeveledBox(cx + lx, 3.60, lz, 0.95, 5.60, 0.95, 0, 0.05, 0.35, 1, 4, 1);
      // Reinforcing gusset collar at Y=1.2m
      bLeg.addBeveledBox(cx + lx, 1.25, lz, 1.18, 0.45, 1.18, 0, 0.03, 0.4);

      const legName = `Crane_Leg_${String(legIdx++).padStart(2, '0')}`;
      addGeometryNode(legName, registerMesh(`${legName}_Mesh`, [
        { builder: bLeg, mat: MAT.gantryCraneRed },
        { builder: bBogie, mat: MAT.heroDarkMetal }
      ]));
    }

    // Overhead STS Gantry Crane Boom & A-Frame Superstructure (Canopy -> NO collision, fades smoothly!)
    const bRed = new MeshBuilder();
    const bSteel = new MeshBuilder();
    const bCab = new MeshBuilder();

    // Portal cross-girders connecting the 4 legs at Y = 6.2m
    bRed.addBeveledBox(cx, 6.2, -5.2, 10.2, 0.85, 0.85, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx, 6.2,  5.2, 10.2, 0.85, 0.85, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx - 4.5, 6.2, 0.0, 0.85, 0.85, 11.4, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx + 4.5, 6.2, 0.0, 0.85, 0.85, 11.4, 0, 0.04, 0.3);

    // Upper A-frame tower columns (Y = 6.5 .. 13.0m)
    bRed.addBeveledBox(cx - 4.2, 9.8, -4.6, 0.75, 6.6, 0.75, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx + 4.2, 9.8, -4.6, 0.75, 6.6, 0.75, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx - 4.2, 9.8,  4.6, 0.75, 6.6, 0.75, 0, 0.04, 0.3);
    bRed.addBeveledBox(cx + 4.2, 9.8,  4.6, 0.75, 6.6, 0.75, 0, 0.04, 0.3);
    // Apex bridge & machinery house at Y = 12.8m
    bRed.addBeveledBox(cx, 12.8, 0.0, 9.6, 1.2, 10.2, 0, 0.05, 0.25);

    // Massive cantilevered STS boom stretching over the quay and moored ship (Z = -9.5 .. +27.0m at Y = 8.4m)
    bRed.addBeveledBox(cx - 1.6, 8.4, 8.75, 0.70, 1.10, 36.5, 0, 0.04, 0.25, 1, 1, 8);
    bRed.addBeveledBox(cx + 1.6, 8.4, 8.75, 0.70, 1.10, 36.5, 0, 0.04, 0.25, 1, 1, 8);
    // Cross-ties along boom
    for (let bz = -8.0; bz <= 26.0; bz += 4.25) {
      bSteel.addBeveledBox(cx, 8.85, bz, 3.8, 0.32, 0.32, 0, 0.02, 0.4);
    }
    // Diagonal forestay/backstay tension cables from apex to boom tip
    bSteel.addCylinder(cx - 1.6, 10.8, 16.0, 0.09, 0.09, 17.5, 8, 1, true, 0, 1.28);
    bSteel.addCylinder(cx + 1.6, 10.8, 16.0, 0.09, 0.09, 17.5, 8, 1, true, 0, 1.28);
    // Trolley carriage & suspended operator cab over Z = 11.5m
    bCab.addBeveledBox(cx, 7.65, 11.5, 3.6, 0.9, 2.8, 0, 0.04, 0.4);
    bCab.addBeveledBox(cx, 6.75, 11.5, 1.6, 1.1, 1.8, 0, 0.04, 0.5);

    addGeometryNode(`GantryCrane_${num}_Canopy`, registerMesh(`GantryCrane_${num}_Canopy_Mesh`, [
      { builder: bRed, mat: MAT.gantryCraneRed },
      { builder: bSteel, mat: MAT.heroDarkMetal },
      { builder: bCab, mat: MAT.brushedSteel }
    ]));

    // Suspended Hoisted Container hanging from trolley at Y = 4.5m over the water channel (Z = 11.5m)
    const bHoistBox = new MeshBuilder();
    const bSpreader = new MeshBuilder();
    const bCables = new MeshBuilder();
    bHoistBox.addBeveledBox(cx, 4.5, 11.5, 8.2, 2.5, 2.45, 0, 0.04, 0.35, 4, 2, 1);
    bSpreader.addBeveledBox(cx, 5.95, 11.5, 8.4, 0.38, 2.55, 0, 0.03, 0.4);
    for (const sx of [-3.6, 3.6]) {
      for (const sz of [-1.0, 1.0]) {
        bCables.addCylinder(cx + sx * 0.75, 6.85, 11.5 + sz, 0.04, 0.04, 1.9, 6, 1, false);
      }
    }
    addGeometryNode(`HoistedContainer_${num}_Canopy`, registerMesh(`HoistedContainer_${num}_Canopy_Mesh`, [
      { builder: bHoistBox, mat: ci === 0 ? MAT.containerOchre : MAT.containerNavy },
      { builder: bSpreader, mat: MAT.gantryCraneRed },
      { builder: bCables, mat: MAT.heroDarkMetal }
    ]));
  }
}
buildSTSGantryCranes();

// ============================================================================
// 5. MOORED CARGO SHIP SUPERSTRUCTURE, DECK CONTAINERS, HATCHES & CUSTOMS SHEDS
// ============================================================================
function buildShipAndCustomsStructures() {
  const shipY = 0.16;

  // 5a. Open-Top Ship Stern Superstructure framing CardPoint_04 (0, 1.31, 32.0)
  // Named ShipSuperstructure_Wall_NN (NO "Bridge" in name so occlusion fading works!)
  const superWalls = [
    // South stern bulkhead wall (Z = 36.0)
    [-8.5, 36.0,  8.5, 36.0],
    // North bulkhead left & right wings (wide 4.4m central doorway X in [-2.2, 2.2])
    [-8.5, 30.0, -2.2, 30.0],
    [ 2.2, 30.0,  8.5, 30.0],
    // West & East wings with wide 3.0m doorways
    [-8.5, 30.0, -8.5, 31.8],
    [-8.5, 34.4, -8.5, 36.0],
    [ 8.5, 30.0,  8.5, 31.8],
    [ 8.5, 34.4,  8.5, 36.0]
  ];
  for (let i = 0; i < superWalls.length; i++) {
    const [x0, z0, x1, z1] = superWalls[i];
    const bW = new MeshBuilder();
    bW.addWallSegment(x0, z0, x1, z1, shipY, 3.0, 0.55);
    addGeometryNode(`ShipSuperstructure_Wall_0${i + 1}`, registerMesh(`ShipSuperstructure_Wall_0${i + 1}_Mesh`, [
      { builder: bW, mat: MAT.brushedSteel }
    ]));
  }

  // Maritime radar & comms mast atop stern edge (Canopy -> no collision, fades)
  {
    const bMast = new MeshBuilder();
    bMast.addCylinder(0.0, shipY + 6.2, 36.0, 0.28, 0.14, 6.2, 12, 2, true);
    bMast.addBeveledBox(0.0, shipY + 7.4, 36.0, 3.8, 0.16, 0.18, 0, 0.02, 0.5);
    bMast.addBeveledBox(0.0, shipY + 8.6, 36.0, 2.2, 0.14, 0.24, 0, 0.02, 0.5);
    addGeometryNode('ShipRadarMast_Canopy', registerMesh('ShipRadarMast_Canopy_Mesh', [
      { builder: bMast, mat: MAT.gantryCraneRed }
    ]));
  }

  // 5b. 4 Deck Containers on Cargo Ship (clear of all 6 gangways, 4 ship CardPoints, 3 ship DoorPoints)
  addGeometryNode('Container_Ship_01', stdContainer6m[0], [-16.6, shipY, 26.0], Math.PI * 0.5);
  addGeometryNode('Container_Ship_02', stdContainer6m[1], [ 16.6, shipY, 26.0], Math.PI * 0.5);
  addGeometryNode('Container_Ship_03', stdContainer6m[3], [-14.5, shipY, 34.8], 0.0);
  addGeometryNode('Container_Ship_04', stdContainer6m[2], [ 14.5, shipY, 34.8], 0.0);

  // 5c. Cargo Hatch Coamings (0.85m crouch/jump cover on ship deck)
  const hatches = [
    [-6.0, 25.5, 4.2, 2.2],
    [ 6.0, 25.5, 4.2, 2.2],
    [-3.4, 17.2, 3.0, 1.6],
    [ 3.4, 17.2, 3.0, 1.6]
  ];
  for (let i = 0; i < hatches.length; i++) {
    const [hx, hz, sx, sz] = hatches[i];
    const bH = new MeshBuilder();
    const bTop = new MeshBuilder();
    bH.addBeveledBox(hx, shipY + 0.42, hz, sx, 0.84, sz, 0, 0.04, 0.4);
    bTop.addBeveledBox(hx, shipY + 0.86, hz, sx + 0.12, 0.10, sz + 0.12, 0, 0.02, 0.4);
    addGeometryNode(`ShipHatch_0${i + 1}`, registerMesh(`ShipHatch_0${i + 1}_Mesh`, [
      { builder: bH, mat: MAT.heroDarkMetal },
      { builder: bTop, mat: MAT.rustyMetal }
    ]));
  }

  // 5d. Segmented Ship Perimeter Safety Rails (0.88m tall, leaving wide 5.2m gaps at all 6 gangways!)
  const shipRails = [
    // North edge (Z = 15.15), gaps around X=-10.5 ([-13.1,-7.9]) and X=+10.5 ([7.9,13.1])
    [-20.6, 15.15, -13.2, 15.15],
    [ -7.8, 15.15,   7.8, 15.15],
    [ 13.2, 15.15,  20.6, 15.15],
    // South edge (Z = 36.85)
    [-20.6, 36.85, -9.0, 36.85],
    [  9.0, 36.85, 20.6, 36.85],
    // West edge (X = -20.85), gaps around Z=20.0 ([17.4,22.6]) and Z=32.0 ([29.4,34.6])
    [-20.85, 15.3, -20.85, 17.3],
    [-20.85, 22.7, -20.85, 29.3],
    [-20.85, 34.7, -20.85, 36.7],
    // East edge (X = +20.85)
    [ 20.85, 15.3,  20.85, 17.3],
    [ 20.85, 22.7,  20.85, 29.3],
    [ 20.85, 34.7,  20.85, 36.7]
  ];
  for (let i = 0; i < shipRails.length; i++) {
    const [x0, z0, x1, z1] = shipRails[i];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const bR = new MeshBuilder();
    // Low solid bulwark + top pipe rail (0.88m tall)
    bR.addBeveledBox(cx, shipY + 0.44, cz, len, 0.88, 0.22, yaw, 0.02, 0.5);
    addGeometryNode(`ShipRail_${String(i + 1).padStart(2, '0')}`, registerMesh(`ShipRail_${i + 1}_Mesh`, [
      { builder: bR, mat: MAT.brushedSteel }
    ]));
  }

  // 5e. West & East Pier Arm Open-Top Customs Inspection Sheds
  // Framing CardPoint_13 (-44, 1.15, 16) and CardPoint_14 (44, 1.15, 16), >= 4.0m clear of DoorPoint_12/13 (±39.5, 11.5)
  const customsWalls = [
    // West Customs Shed (open-top U-frame with wide flanking lanes)
    [-50.5, 13.0, -50.5, 20.0], // West wall
    [-50.5, 20.0, -45.8, 20.0], // SW return
    [-42.0, 20.0, -39.0, 20.0], // SE return (leaves 3.8m south doorway)
    [-50.5, 13.0, -45.5, 13.0], // NW return (>= 5.2m from DoorPoint_12 at (-39.5, 11.5)!)
    // East Customs Shed (symmetric)
    [ 50.5, 13.0,  50.5, 20.0],
    [ 50.5, 20.0,  45.8, 20.0],
    [ 42.0, 20.0,  39.0, 20.0],
    [ 50.5, 13.0,  45.5, 13.0]
  ];
  for (let i = 0; i < customsWalls.length; i++) {
    const [x0, z0, x1, z1] = customsWalls[i];
    const bW = new MeshBuilder();
    bW.addWallSegment(x0, z0, x1, z1, 0.0, 3.0, 0.65);
    addGeometryNode(`Wall_Customs_${String(i + 1).padStart(2, '0')}`, registerMesh(`Wall_Customs_${i + 1}_Mesh`, [
      { builder: bW, mat: MAT.corrugatedIron }
    ]));
  }
}
buildShipAndCustomsStructures();

// ============================================================================
// 6. FORKLIFTS, CARD PEDESTALS, MOORING BOLLARDS & CC0 TACTICAL PROPS
// ============================================================================
function buildForkliftMesh() {
  const bBody = new MeshBuilder();
  const bDark = new MeshBuilder();
  const bSteel = new MeshBuilder();
  // Counterweight chassis
  bBody.addBeveledBox(0, 0.68, -0.25, 1.38, 0.82, 2.15, 0, 0.06, 0.5);
  // Operator roll cage posts & roof bar
  for (const sx of [-0.58, 0.58]) {
    bDark.addBeveledBox(sx, 1.52, -0.95, 0.09, 1.05, 0.09, 0, 0.01, 0.5);
    bDark.addBeveledBox(sx, 1.52,  0.40, 0.09, 1.05, 0.09, 0, 0.01, 0.5);
  }
  bDark.addBeveledBox(0, 2.04, -0.28, 1.26, 0.09, 1.48, 0, 0.02, 0.5);
  // Vertical hydraulic lift mast (+Z front)
  bDark.addBeveledBox(-0.42, 1.38, 0.96, 0.14, 2.25, 0.18, 0, 0.02, 0.5);
  bDark.addBeveledBox( 0.42, 1.38, 0.96, 0.14, 2.25, 0.18, 0, 0.02, 0.5);
  // Dual steel forks
  bSteel.addBeveledBox(-0.34, 0.18, 1.62, 0.14, 0.07, 1.25, 0, 0.01, 0.5);
  bSteel.addBeveledBox( 0.34, 0.18, 1.62, 0.14, 0.07, 1.25, 0, 0.01, 0.5);
  // 4 Heavy solid rubber tires
  for (const sx of [-0.72, 0.72]) {
    bDark.addCylinder(sx, 0.34,  0.55, 0.34, 0.34, 0.24, 14, 1, true, Math.PI * 0.5, Math.PI * 0.5);
    bDark.addCylinder(sx, 0.28, -0.85, 0.28, 0.28, 0.22, 14, 1, true, Math.PI * 0.5, Math.PI * 0.5);
  }
  return registerMesh('DockForklift_Mesh', [
    { builder: bBody, mat: MAT.containerOchre },
    { builder: bDark, mat: MAT.heroDarkMetal },
    { builder: bSteel, mat: MAT.brushedSteel }
  ]);
}

function buildCardPedestalMesh() {
  const bBase = new MeshBuilder();
  const bTop = new MeshBuilder();
  bBase.addBeveledBox(0, 0.46, 0, 0.86, 0.92, 0.86, 0, 0.04, 0.6);
  bTop.addBeveledBox(0, 0.98, 0, 0.98, 0.12, 0.98, 0, 0.025, 0.6);
  return registerMesh('Port_CardPedestal_Mesh', [
    { builder: bBase, mat: MAT.heroDarkMetal },
    { builder: bTop, mat: MAT.containerOchre }
  ]);
}

function buildBollardMesh() {
  const bBol = new MeshBuilder();
  bBol.addBeveledBox(0, 0.08, 0, 0.66, 0.16, 0.66, 0, 0.02, 0.6);
  bBol.addCylinder(0, 0.36, 0, 0.18, 0.15, 0.44, 12, 1, true);
  bBol.addCylinder(0, 0.60, 0, 0.24, 0.22, 0.12, 12, 1, true);
  return registerMesh('DockMooringBollard_Mesh', [
    { builder: bBol, mat: MAT.heroDarkMetal }
  ]);
}

function buildSandbagWallMesh() {
  const bBag = new MeshBuilder();
  for (let row = 0; row < 3; row++) {
    const count = row === 2 ? 3 : 4;
    const y = 0.16 + row * 0.26;
    const xStart = -(count - 1) * 0.34;
    for (let i = 0; i < count; i++) {
      bBag.addBeveledBox(xStart + i * 0.68, y, (row % 2) * 0.05, 0.64, 0.26, 0.46, 0, 0.07, 1.2);
    }
  }
  return registerMesh('Port_SandbagWall_Mesh', [
    { builder: bBag, mat: MAT.sandbagBurlap }
  ]);
}

function buildTacticalProps() {
  // 6a. 18 Prop_CardPedestal_01..18 (strictly under every CardPoint!)
  const pedestalMesh = buildCardPedestalMesh();
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    const baseY = isOnShip(cp[0], cp[2], 0) ? 0.16 : 0.0;
    addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, pedestalMesh, [cp[0], baseY, cp[2]]);
  }

  // 6b. 4 Parked Dock Forklifts (Humvee_Forklift_01..04 -> convex collision!)
  const forkliftMesh = buildForkliftMesh();
  const forklifts = [
    [-46.5, 0.0,  29.5,  0.45],
    [ 46.5, 0.0,  29.5, -0.45],
    [-29.5, 0.0, -29.0,  1.25],
    [ 29.5, 0.0, -29.0, -1.25]
  ];
  for (let i = 0; i < forklifts.length; i++) {
    const [fx, fy, fz, yaw] = forklifts[i];
    addGeometryNode(`Humvee_Forklift_0${i + 1}`, forkliftMesh, [fx, fy, fz], yaw);
  }

  // 6c. Heavy Maritime Mooring Bollards along Quay Edges (strictly clear of gangways & doors)
  const bollardMesh = buildBollardMesh();
  const bollards = [
    [-25.5, 7.2], [-16.0, 7.2], [-5.2, 7.2], [5.2, 7.2], [16.0, 7.2], [25.5, 7.2],
    [-30.8, 12.0], [-30.8, 16.0], [-30.8, 25.5], [-30.8, 37.5], [-30.8, 42.5],
    [ 30.8, 12.0], [ 30.8, 16.0], [ 30.8, 25.5], [ 30.8, 37.5], [ 30.8, 42.5]
  ];
  for (let i = 0; i < bollards.length; i++) {
    addGeometryNode(`DockBollard_${String(i + 1).padStart(2, '0')}`, bollardMesh, [bollards[i][0], 0.0, bollards[i][1]]);
  }

  // 6d. CC0 Concrete Road Barriers (Barrier_01..16)
  const barriers = [
    [-44.0, 0.0, -34.0,  0.3], [ 44.0, 0.0, -34.0, -0.3],
    [-44.0, 0.0,  34.0, -0.3], [ 44.0, 0.0,  34.0,  0.3],
    [-11.0, 0.0, -40.0,  0.0], [ 11.0, 0.0, -40.0,  0.0],
    [ -6.5, 0.0,  -4.5,  0.0], [  6.5, 0.0,  -4.5,  0.0],
    [-31.5, 0.0,  -4.5,  0.5], [ 31.5, 0.0,  -4.5, -0.5],
    [-55.0, 0.0, -16.0,  1.57],[ 55.0, 0.0, -16.0,  1.57],
    [-55.0, 0.0,  15.0,  1.57],[ 55.0, 0.0,  15.0,  1.57],
    [ -6.5, 0.16, 16.2,  0.0], [  6.5, 0.16, 16.2,  0.0]
  ];
  for (let i = 0; i < barriers.length; i++) {
    const [bx, by, bz, yaw] = barriers[i];
    addGeometryNode(`Barrier_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [bx, by, bz], yaw, [1.05, 1.05, 1.05]);
  }

  // 6e. CC0 Military Cargo Crates (Crate_01..14)
  const crates = [
    [-43.5, 0.0, -19.5, 0.2], [ 43.5, 0.0, -19.5, -0.2],
    [-18.0, 0.0, -29.0, 0.1], [ 18.0, 0.0, -29.0, -0.1],
    [ -7.0, 0.0, -22.0, 0.4], [  7.0, 0.0, -22.0, -0.4],
    [-31.5, 0.0,   4.2, 0.0], [ 31.5, 0.0,   4.2,  0.0],
    [-47.5, 0.0,  17.5, 0.3], [ 47.5, 0.0,  17.5, -0.3],
    [-48.0, 0.0,  42.0, 0.0], [ 48.0, 0.0,  42.0,  0.0],
    [-14.2, 0.16, 23.0, 0.2], [ 14.2, 0.16, 23.0, -0.2]
  ];
  for (let i = 0; i < crates.length; i++) {
    const [cx, cy, cz, yaw] = crates[i];
    addGeometryNode(`Crate_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [cx, cy, cz], yaw, [1.25, 1.25, 1.25]);
  }

  // 6f. CC0 Explosive Hazard Barrels (Barrel_01..12)
  const barrels = [
    [-21.5, 0.0,  -5.0], [ 21.5, 0.0,  -5.0],
    [-41.5, 0.0,  -7.5], [ 41.5, 0.0,  -7.5],
    [ -7.5, 0.0, -34.5], [  7.5, 0.0, -34.5],
    [-33.0, 0.0,  16.0], [ 33.0, 0.0,  16.0],
    [-47.0, 0.0,  22.5], [ 47.0, 0.0,  22.5],
    [ -4.5, 0.16, 23.0], [  4.5, 0.16, 23.0]
  ];
  for (let i = 0; i < barrels.length; i++) {
    addGeometryNode(`Barrel_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, barrels[i], randRange(0, Math.PI * 2), [1.15, 1.15, 1.15]);
  }

  // 6g. CC0 Portable Dock Generators (Generator_01..06)
  const generators = [
    [-56.5, 0.0, -28.0,  1.57], [ 56.5, 0.0, -28.0, -1.57],
    [-56.5, 0.0,  28.0,  1.57], [ 56.5, 0.0,  28.0, -1.57],
    [ -9.0, 0.0,  -8.0,  0.0],  [  9.0, 0.0,  -8.0,  0.0]
  ];
  for (let i = 0; i < generators.length; i++) {
    const [gx, gy, gz, yaw] = generators[i];
    addGeometryNode(`Generator_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [gx, gy, gz], yaw, [1.15, 1.15, 1.15]);
  }

  // 6h. CC0 Steel Cargo Shelves & Electrical Power Boxes (Server_Rack_01..04, PowerBox_01..06)
  const shelvesList = [
    [-48.8, 0.0, 15.2, 1.57], [48.8, 0.0, 15.2, -1.57],
    [-42.0, 0.0, -43.2, 0.0], [42.0, 0.0, -43.2,  0.0]
  ];
  for (let i = 0; i < shelvesList.length; i++) {
    const [sx, sy, sz, yaw] = shelvesList[i];
    addGeometryNode(`Server_Rack_0${i + 1}`, sharedCC0.shelves, [sx, sy, sz], yaw, [1.05, 1.05, 1.05]);
  }

  const powerBoxes = [
    [-29.5, 0.0, -43.5, 0.0], [ 29.5, 0.0, -43.5, 0.0],
    [-59.2, 0.0, -10.0, 1.57],[ 59.2, 0.0, -10.0, -1.57],
    [ -6.2, 0.16, 34.8, 0.0], [  6.2, 0.16, 34.8,  0.0]
  ];
  for (let i = 0; i < powerBoxes.length; i++) {
    const [px, py, pz, yaw] = powerBoxes[i];
    addGeometryNode(`PowerBox_0${i + 1}`, sharedCC0.powerBox, [px, py, pz], yaw, [1.1, 1.1, 1.1]);
  }

  // 6i. Sandbag Fighting Positions (Sandbag_01..06)
  const sandbagMesh = buildSandbagWallMesh();
  const sandbags = [
    [-20.5, 0.0,   4.5, 0.0], [ 20.5, 0.0,   4.5, 0.0],
    [-33.5, 0.0,  -8.0, 0.4], [ 33.5, 0.0,  -8.0, -0.4],
    [ -5.0, 0.16, 29.0, 0.0], [  5.0, 0.16, 29.0, 0.0]
  ];
  for (let i = 0; i < sandbags.length; i++) {
    const [sx, sy, sz, yaw] = sandbags[i];
    addGeometryNode(`Sandbag_0${i + 1}`, sandbagMesh, [sx, sy, sz], yaw);
  }
}
buildTacticalProps();

// ============================================================================
// 7. 165 FLOOR DECALS + 16 RAIN PUDDLES + 12 RUST/BLOOD DRAG TRAILS + 32 SCATTER
// ============================================================================
function buildDecalsAndScatter() {
  function makeFlatQuadMesh(name, sx, sz, matIdx) {
    const b = new MeshBuilder();
    const hx = sx * 0.5, hz = sz * 0.5;
    b.addQuad([-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], [-hx, 0, -hz], [0, 1, 0], 0, 0, 1, 1);
    return registerMesh(name, [{ builder: b, mat: matIdx }]);
  }

  // Shared decal quad meshes (reused across instances to keep .bin compact & fast!)
  const decalPool = [
    { mat: MAT.decalDockMarkings, sx: 3.6, sz: 3.6 },
    { mat: MAT.decalRainPuddle,   sx: 3.4, sz: 2.8 },
    { mat: MAT.decalRustBloodDrag,sx: 2.8, sz: 1.6 },
    { mat: MAT.decalCargoDebris,  sx: 2.4, sz: 2.4 },
    { mat: MAT.decalTracks,       sx: 4.2, sz: 2.2 },
    { mat: MAT.decalOil,          sx: 2.4, sz: 2.0 },
    { mat: MAT.decalScorch,       sx: 2.6, sz: 2.6 },
    { mat: MAT.decalBlood,        sx: 2.2, sz: 1.8 },
    { mat: MAT.decalChemPuddle,   sx: 2.6, sz: 2.2 },
    { mat: MAT.decalMoss,         sx: 2.5, sz: 2.5 }
  ];
  const decalMeshes = decalPool.map((d, i) => makeFlatQuadMesh(`PortDecalQuad_${i}`, d.sx, d.sz, d.mat));

  // 7a. 165 Floor Decals (Port_Decal_001..165) strictly on solid quay or ship deck
  let placed = 0;
  let attempts = 0;
  while (placed < 165 && attempts < 2000) {
    attempts++;
    const x = randRange(-59.0, 59.0);
    const z = randRange(-43.0, 43.0);
    const sy = surfaceYAt(x, z);
    if (sy === null) continue;
    if (distToWaterEdge(x, z) < 2.2) continue;

    // Prefer dock markings & tire tracks along quay/yard, rust/oil/blood on ship & alleys
    let kind;
    if (sy > 0.1) {
      const shipKinds = [1, 2, 3, 5, 6, 7];
      kind = shipKinds[Math.floor(rand() * shipKinds.length)];
    } else {
      kind = Math.floor(rand() * decalMeshes.length);
    }
    const sc = randRange(0.75, 1.35);
    const yaw = kind === 0 || kind === 4 ? (Math.floor(rand() * 4) * Math.PI * 0.5) : randRange(0, Math.PI * 2);
    placed++;
    addGeometryNode(
      `Port_Decal_${String(placed).padStart(3, '0')}`,
      decalMeshes[kind],
      [x, sy + 0.012 + (placed % 7) * 0.001, z],
      yaw,
      [sc, 1.0, sc]
    );
  }

  // 7b. 16 Large Reflective Rain Puddles (Port_PuddleDecal_01..16, ZERO emission!)
  const puddleMesh = makeFlatQuadMesh('PortLargeRainPuddle_Mesh', 5.2, 4.2, MAT.decalRainPuddle);
  const puddleCoords = [
    [-46.0, -30.0], [ 46.0, -30.0], [-28.0, -28.0], [ 28.0, -28.0],
    [-16.0,  -6.0], [ 16.0,  -6.0], [  0.0,   1.0], [-36.0,  -4.0],
    [ 36.0,  -4.0], [-44.0,  10.0], [ 44.0,  10.0], [-36.0,  31.0],
    [ 36.0,  31.0], [ -6.0,  21.0], [  6.0,  21.0], [  0.0,  29.0]
  ];
  for (let i = 0; i < puddleCoords.length; i++) {
    const [px, pz] = puddleCoords[i];
    const sy = surfaceYAt(px, pz) || 0.0;
    addGeometryNode(
      `Port_PuddleDecal_${String(i + 1).padStart(2, '0')}`,
      puddleMesh,
      [px, sy + 0.014, pz],
      randRange(0, Math.PI * 2),
      [randRange(0.85, 1.2), 1.0, randRange(0.85, 1.2)]
    );
  }

  // 7c. 12 Rust & Blood Drag Trails (Port_BloodDragDecal_01..12)
  const dragMesh = makeFlatQuadMesh('PortBloodDrag_Mesh', 3.4, 1.8, MAT.decalRustBloodDrag);
  const dragCoords = [
    [-24.0, -18.0], [ 24.0, -18.0], [  0.0, -14.0], [  0.0, -30.0],
    [-15.0,   2.5], [ 15.0,   2.5], [-44.0,  16.0], [ 44.0,  16.0],
    [-10.5,  17.5], [ 10.5,  17.5], [  0.0,  31.5], [  0.0,  24.0]
  ];
  for (let i = 0; i < dragCoords.length; i++) {
    const [dx, dz] = dragCoords[i];
    const sy = surfaceYAt(dx, dz) || 0.0;
    addGeometryNode(
      `Port_BloodDragDecal_${String(i + 1).padStart(2, '0')}`,
      dragMesh,
      [dx, sy + 0.016, dz],
      randRange(0, Math.PI * 2)
    );
  }

  // 7d. 32 Low-Profile Scatter Debris Groups (Port_Scatter_01..32, Y < 0.26m, >= 2.0m clear of spawns/cards/doors & water!)
  function isClearForScatter(x, z) {
    const sy = surfaceYAt(x, z);
    if (sy === null || distToWaterEdge(x, z) < 2.2) return false;
    for (const s of ALL_SPAWNS) if (Math.hypot(x - s[0], z - s[2]) < 2.4) return false;
    for (const c of CARD_POINTS) if (Math.hypot(x - c[0], z - c[2]) < 2.4) return false;
    for (const d of DOOR_POINTS) if (Math.hypot(x - d[0], z - d[2]) < 2.4) return false;
    return true;
  }

  let sPlaced = 0;
  let sAttempts = 0;
  while (sPlaced < 32 && sAttempts < 1000) {
    sAttempts++;
    const sx = randRange(-58.0, 58.0);
    const sz = randRange(-42.0, 42.0);
    if (!isClearForScatter(sx, sz)) continue;
    const sy = surfaceYAt(sx, sz);

    const bWood = new MeshBuilder();
    const bMetal = new MeshBuilder();
    const bRope = new MeshBuilder();
    const items = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < items; k++) {
      const px = sx + randRange(-0.9, 0.9);
      const pz = sz + randRange(-0.9, 0.9);
      const yaw = randRange(0, Math.PI * 2);
      const kind = k % 3;
      if (kind === 0) {
        // Broken wooden pallet plank (Y < 0.14m)
        bWood.addBeveledBox(px, sy + 0.035, pz, randRange(0.55, 0.95), 0.06, randRange(0.12, 0.18), yaw, 0.01, 1.5);
      } else if (kind === 1) {
        // Heavy steel chain / pipe / shackle piece (Y < 0.16m)
        const r = randRange(0.035, 0.06);
        bMetal.addCylinder(px, sy + r + 0.01, pz, r, r, randRange(0.25, 0.50), 8, 1, true, yaw, Math.PI * 0.5);
      } else {
        // Coiled mooring rope / burlap sack (Y < 0.22m)
        bRope.addCylinder(px, sy + 0.08, pz, randRange(0.20, 0.30), randRange(0.18, 0.28), 0.14, 10, 1, true);
      }
    }
    sPlaced++;
    const sName = `Port_Scatter_${String(sPlaced).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bWood, mat: MAT.darkWood },
      { builder: bMetal, mat: MAT.rustyMetal },
      { builder: bRope, mat: MAT.sandbagBurlap }
    ]));
  }
}
buildDecalsAndScatter();

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
  name: 'Night_Container_Port_Map',
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
    generator: 'TacticalDark Night Container Port v3 Node.js Procedural Builder',
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

const gltfResPath = `res://asset model/haritalar/Map8_Liman_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dliman5v5v3m8pt"
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
// 9. MATHEMATICAL, WATER-CLEARANCE & SOLID-COLLIDER AABB VALIDATION REPORT
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

  // 2. CardPoint -> Spawn min distance (>= 18.0m) & water clearance (>= 2.0m)
  let minCardToSpawn = Infinity;
  let minCardWaterDist = Infinity;
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

    const wd = distToWaterEdge(c[0], c[2]);
    minCardWaterDist = Math.min(minCardWaterDist, wd);
    if (wd < 2.0) {
      console.error(`ERROR: CardPoint_${i + 1} (${c[0]}, ${c[2]}) too close to water edge: ${wd.toFixed(2)}m < 2.0m`);
      errors++;
    }
  }

  // 3. DoorPoint -> Spawn min distance (>= 26.5m) & water clearance (>= 3.6m)
  let minDoorToSpawn = Infinity;
  let minDoorWaterDist = Infinity;
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

    const wd = distToWaterEdge(d[0], d[2]);
    minDoorWaterDist = Math.min(minDoorWaterDist, wd);
    if (wd < 3.6) {
      console.error(`ERROR: DoorPoint_${i + 1} (${d[0]}, ${d[2]}) too close to water edge: ${wd.toFixed(2)}m < 3.6m`);
      errors++;
    }
  }

  // 4. Verify ZERO materials use emissiveFactor, and all Decal materials use alphaMode: "MASK"
  for (const m of materials) {
    if (m.emissiveFactor) {
      console.error(`ERROR: Material ${m.name} uses emissiveFactor! ZERO emission is strictly required.`);
      errors++;
    }
    if (m.name.includes('Decal') && m.alphaMode !== 'MASK') {
      console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
      errors++;
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

  // 6. Full AABB Solid Collider Clearance Audit for 20 Spawns, 18 Cards, and 16 Doors
  const floorAndNoCollide = ['Deck', 'Hull', 'Water', 'Basin', 'Canopy', 'Decal', 'Scatter'];

  let minSpawnClearance = Infinity;
  let minSpawnWaterDist = Infinity;
  for (let i = 0; i < ALL_SPAWNS.length; i++) {
    const sp = ALL_SPAWNS[i];
    const wd = distToWaterEdge(sp[0], sp[2]);
    minSpawnWaterDist = Math.min(minSpawnWaterDist, wd);
    if (wd < 2.0) {
      console.error(`ERROR: Spawn_${i + 1} too close to water: ${wd.toFixed(2)}m < 2.0m`);
      errors++;
    }
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (floorAndNoCollide.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(sp[0], sp[2], n);
      minSpawnClearance = Math.min(minSpawnClearance, dist);
      if (dist < 2.0) {
        console.error(`ERROR: Spawn_${i + 1} (${sp[0]}, ${sp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 2.0m)`);
        errors++;
      }
    }
  }

  let minCardClearance = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (floorAndNoCollide.some(w => n.name.includes(w)) || n.name.includes('Prop_CardPedestal')) continue;
      const dist = pointToNodeDistXZ(cp[0], cp[2], n);
      minCardClearance = Math.min(minCardClearance, dist);
      if (dist < 1.8) {
        console.error(`ERROR: CardPoint_${i + 1} (${cp[0]}, ${cp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 1.8m)`);
        errors++;
      }
    }
  }

  let minDoorClearance = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const dp = DOOR_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (floorAndNoCollide.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(dp[0], dp[2], n);
      minDoorClearance = Math.min(minDoorClearance, dist);
      if (dist < 3.6) {
        console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) is only ${dist.toFixed(2)}m from solid node ${n.name} (< 3.6m)`);
        errors++;
      }
    }
  }

  console.log('================================================================');
  console.log(' GECE KONTEYNER LIMANI v3 (Map8_Liman_v3) VALIDATION REPORT');
  console.log('================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 untextured, 0 emissive!)`);
  console.log(`Total Textures    : ${images.length} referenced`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Walkable Levels   : Quay Y=0.00m, CargoShip_Deck Y=+0.16m, 6 x 4.5m Gangways`);
  console.log(`Spawn Points      : 4 teams x 5 = ${ALL_SPAWNS.length} (solid clear: ${minSpawnClearance.toFixed(2)}m >= 2.0m, water clear: ${minSpawnWaterDist.toFixed(2)}m >= 2.0m)`);
  console.log(`Card Candidates   : ${CARD_POINTS.length} + 18 Pedestals (spawn dist: ${minCardToSpawn.toFixed(2)}m >= 18.0m, solid clear: ${minCardClearance.toFixed(2)}m >= 1.8m, water clear: ${minCardWaterDist.toFixed(2)}m >= 2.0m)`);
  console.log(`Door Candidates   : ${DOOR_POINTS.length} (spawn dist: ${minDoorToSpawn.toFixed(2)}m >= 26.5m, solid clear: ${minDoorClearance.toFixed(2)}m >= 3.6m, water clear: ${minDoorWaterDist.toFixed(2)}m >= 3.6m)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
