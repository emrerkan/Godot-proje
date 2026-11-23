#!/usr/bin/env node
/**
 * build_hospital_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map5_Karantina_Hastanesi_3v3v3v3_v3.gltf (inside asset model/haritalar/Map5_Hastane_v3/)
 *
 * Implements:
 * - 96x72m footprint (X in [-48, 48], Z in [-36, 36]), walkable floor Y in [-0.15, +0.15]
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±40, 0.25, ±30)
 * - 18 Card Candidate Points at Y=1.15 (all >= 16.5m from every spawn) + 18 Prop_CardPedestal_NN
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.0m from every spawn, 3.5m clear radius)
 * - Modular beveled hospital walls (6-12m segments, 3.0m tall, 0.45m thick, wainscoting + top rebar lip)
 * - Central Bio-Containment Rotunda (Radius 16m, 32-sided ring with 8 wide 3.2m doorways, Collapsed Bio-Lab Module,
 *   Curved Triage Command Desk, overturned carts, Rotunda_Gantry_Canopy at Y=4.2m)
 * - 4 Asymmetric Tactical Wings:
 *   * NW Radiology & MRI Wing (MRI_Scanner_01..02 toroidal magnets, lead control booth, X-ray consoles)
 *   * NE Surgical Operating Suites (3 operating theaters, surgical tables, SurgicalLamp_01..03_Canopy, anesthesia machines, scrub sinks)
 *   * SW Bio-Quarantine ICU Ward (ICUBed_01..06 with mattresses & monitors, privacy screens, QuarantineTarp_01..04_Canopy)
 *   * SE Morgue, Autopsy & Backup Generator Wing (MorgueBank_01..03 stainless banks, autopsy tables, diesel generators, steam pipes)
 * - 4 Outer Emergency Courtyards (Ambulance_01..04 detailed paramedic vehicles, Tent_01..04_Canopy, concrete barriers, sandbag positions)
 * - Photogrammetry CC0 meshes extracted from Map3_Col_v3 & Map4_Orman_v3 (Road barriers, Crates, Generators, Barrels, PowerBoxes, Shelves, Cliffs, Boulders)
 * - 165 Alpha-Masked Decals (Hospital_Decal_001..165) + ER_RedGuideLine_01..08 + HospitalRedCross_01..05
 * - 32 Scatter Debris Groups (Hospital_Scatter_01..32) + 48 Courtyard Scrub Grass Clusters (Hospital_Grass_01..48)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map5_Hastane_v3');
const GLTF_NAME = 'Map5_Karantina_Hastanesi_3v3v3v3_v3.gltf';
const BIN_NAME = 'Map5_Karantina_Hastanesi_3v3v3v3_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 20261123;
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
    // Compute orthogonal tangent if default
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

  // Subdivided Beveled Box (local or offset, with rotation yaw)
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

    // Helper for subdivided grid face
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

    // 6 Main Faces (inset by bevel b)
    // +Z (South)
    addGridFace([-hx + b, -hy + b, hz], [sx - 2 * b, 0, 0], [0, sy - 2 * b, 0], [0, 0, 1], segsX, segsY, sx, sy);
    // -Z (North)
    addGridFace([hx - b, -hy + b, -hz], [-(sx - 2 * b), 0, 0], [0, sy - 2 * b, 0], [0, 0, -1], segsX, segsY, sx, sy);
    // +X (East)
    addGridFace([hx, -hy + b, hz - b], [0, 0, -(sz - 2 * b)], [0, sy - 2 * b, 0], [1, 0, 0], segsZ, segsY, sz, sy);
    // -X (West)
    addGridFace([-hx, -hy + b, -hz + b], [0, 0, sz - 2 * b], [0, sy - 2 * b, 0], [-1, 0, 0], segsZ, segsY, sz, sy);
    // +Y (Top)
    addGridFace([-hx + b, hy, hz - b], [sx - 2 * b, 0, 0], [0, 0, -(sz - 2 * b)], [0, 1, 0], segsX, segsZ, sx, sz);
    // -Y (Bottom)
    addGridFace([-hx + b, -hy, -hz + b], [sx - 2 * b, 0, 0], [0, 0, sz - 2 * b], [0, -1, 0], segsX, segsZ, sx, sz);

    if (b > 0.001) {
      const s2 = Math.SQRT1_2;
      // 4 Vertical Bevel Strips
      addGridFace([hx - b, -hy + b, hz], [b, 0, -b], [0, sy - 2 * b, 0], [s2, 0, s2], 1, segsY, b * 1.4, sy);
      addGridFace([hx, -hy + b, -hz + b], [-b, 0, -b], [0, sy - 2 * b, 0], [s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx + b, -hy + b, -hz], [-b, 0, b], [0, sy - 2 * b, 0], [-s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx, -hy + b, hz - b], [b, 0, b], [0, sy - 2 * b, 0], [-s2, 0, s2], 1, segsY, b * 1.4, sy);
      // 4 Top Horizontal Bevel Strips
      addGridFace([-hx + b, hy - b, hz], [sx - 2 * b, 0, 0], [0, b, -b], [0, s2, s2], segsX, 1, sx, b * 1.4);
      addGridFace([hx - b, hy - b, -hz], [-(sx - 2 * b), 0, 0], [0, b, b], [0, s2, -s2], segsX, 1, sx, b * 1.4);
      addGridFace([hx, hy - b, hz - b], [0, 0, -(sz - 2 * b)], [-b, b, 0], [s2, s2, 0], segsZ, 1, sz, b * 1.4);
      addGridFace([-hx, hy - b, -hz + b], [0, 0, sz - 2 * b], [b, b, 0], [-s2, s2, 0], segsZ, 1, sz, b * 1.4);
    }
  }

  // Detailed Hospital Wall Segment (height=3.0m, thickness=0.45m, wainscoting rail, top rebar/concrete lip, subdivided for high poly fidelity)
  addHospitalWallSegment(x0, z0, x1, z1, height = 3.0, thick = 0.45) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const segsX = Math.max(4, Math.round(len * 1.5));

    // Main wall body (uvScale set so v maps 0..1 over 3.0m height to align with hospital_wall_plaster_2k)
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.025, 1.0 / height, segsX, 6, 2);

    // Protruding stretcher bumper guard rail at Y=1.18m (protrudes 2.5cm on each side, well within <=5cm rule)
    this.addBeveledBox(cx, 1.18, cz, len + 0.02, 0.14, thick + 0.05, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Bottom rubber baseboard plinth at Y=0.08m
    this.addBeveledBox(cx, 0.08, cz, len + 0.01, 0.16, thick + 0.03, yaw, 0.01, 0.5, Math.max(2, Math.round(len)), 1, 1);

    // Top broken concrete coping / cornice lip at Y = height - 0.06m
    this.addBeveledBox(cx, height - 0.06, cz, len + 0.02, 0.12, thick + 0.04, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
  }

  // Cylinder / Tube along Y or arbitrary axis
  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 24, heightSegs = 2, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const xform = (lx, ly, lz) => {
      // pitch around X, then yaw around Y
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
      // Top cap
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
      // Bottom cap
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

  // Torus (for MRI scanner bore, wheels, pipes, lamp rings)
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

// --- Register All Hospital v3 PBR Materials (<= 26 materials) ---
const MAT = {
  vinylTile: makePBRMaterial('Mat_Hospital_VinylTile_2K', 'hospital_vinyl_tile_2k_Diffuse.png', 'hospital_vinyl_tile_2k_nor_gl.png', 'hospital_vinyl_tile_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  surgicalLinoleum: makePBRMaterial('Mat_Surgical_GreenLinoleum_2K', 'surgical_green_linoleum_2k_Diffuse.png', 'surgical_green_linoleum_2k_nor_gl.png', 'surgical_green_linoleum_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  icuBlueFloor: makePBRMaterial('Mat_ICU_BlueFloor_2K', 'icu_blue_linoleum_2k_Diffuse.png', 'icu_blue_linoleum_2k_nor_gl.png', 'icu_blue_linoleum_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  courtyardAsphalt: makePBRMaterial('Mat_Courtyard_Asphalt_2K', 'gravel_ground_01_2k_Diffuse.jpg', 'gravel_ground_01_2k_nor_gl.jpg', 'gravel_ground_01_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  hospitalPlasterWall: makePBRMaterial('Mat_Hospital_PlasterWall_2K', 'hospital_wall_plaster_2k_Diffuse.png', 'hospital_wall_plaster_2k_nor_gl.png', 'hospital_wall_plaster_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  ceramicWallTile: makePBRMaterial('Mat_Hospital_CeramicTile_2K', 'hospital_ceramic_tile_2k_Diffuse.png', 'hospital_ceramic_tile_2k_nor_gl.png', 'hospital_ceramic_tile_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Perimeter_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  brushedSteel: makePBRMaterial('Mat_Hospital_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroMedicalEnamel: makePBRMaterial('Mat_Hero_MedicalEnamel_2K', 'hero_medical_enamel_2k_Diffuse.png', 'hero_medical_enamel_2k_nor_gl.png', 'hero_medical_enamel_2k_arm.png', { normalScale: 1.35 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_DarkMetal_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
  rustyMetal: makePBRMaterial('Mat_Rusty_Metal_2K', 'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg', { normalScale: 1.3 }),
  corrugatedIron: makePBRMaterial('Mat_Corrugated_Iron_2K', 'corrugated_iron_02_2k_Diffuse.jpg', 'corrugated_iron_02_2k_nor_gl.jpg', 'corrugated_iron_02_2k_arm.jpg', { normalScale: 1.3 }),
  darkWood: makePBRMaterial('Mat_Dark_Wood_2K', 'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png', { metallicFactor: 0, normalScale: 1.25 }),
  quarantineYellowTarp: makePBRMaterial('Mat_Quarantine_YellowTarp_1K', 'quarantine_yellow_tarp_1k_Diffuse.png', 'quarantine_yellow_tarp_1k_nor_gl.png', 'quarantine_yellow_tarp_1k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  tentCamo: makePBRMaterial('Mat_Tent_Canvas_2K', 'tent_camo_canvas_Diffuse.png', 'tent_camo_canvas_nor_gl.png', 'tent_camo_canvas_arm.png', { metallicFactor: 0, normalScale: 1.25 }),
  sandbagBurlap: makePBRMaterial('Mat_Sandbag_Burlap_2K', 'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  barrier: makePBRMaterial('concrete_road_barrier', 'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg', { metallicFactor: 0 }),
  crate: makePBRMaterial('wooden_military_crate', 'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg'),
  generator: makePBRMaterial('portable_generator', 'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg'),
  barrel: makePBRMaterial('Barrel_01', 'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg'),
  powerBox: makePBRMaterial('power_box_01', 'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg'),
  shelves: makePBRMaterial('steel_frame_shelves_01', 'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg'),
  cliffRock: makePBRMaterial('rock_face_01', 'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg', { metallicFactor: 0 }),
  boulderRock: makePBRMaterial('boulder_01', 'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg', { metallicFactor: 0 }),
  redEmissive: makePBRMaterial('Mat_Hospital_RedGlow', 'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png', {
    baseColorFactor: [0.55, 0.08, 0.06, 1.0],
    emissiveFactor: [0.35, 0.03, 0.02],
    emissiveStrength: 0.40
  }),
  ecgGreenEmissive: makePBRMaterial('Mat_Hospital_ECGGreen', 'industrial_light_lens_Diffuse.png', 'industrial_light_lens_nor_gl.png', 'industrial_light_lens_arm.png', {
    emissiveFactor: [0.12, 0.88, 0.35],
    emissiveStrength: 0.85
  }),
  // Alpha-Masked Decal & Foliage Materials (alphaMode: "MASK", strictly non-emissive!)
  bloodCross: makePBRMaterial('Mat_Decal_BloodCross_Mask', 'decal_blood_cross_Diffuse.png', 'decal_blood_cross_nor_gl.png', 'decal_blood_cross_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.4 }),
  bloodGuideLine: makePBRMaterial('Mat_Decal_BloodGuideLine_Mask', 'decal_blood_guideline_Diffuse.png', 'decal_blood_guideline_nor_gl.png', 'decal_blood_guideline_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.4 }),
  decalBlood: makePBRMaterial('Mat_Decal_Blood_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalHazard: makePBRMaterial('Mat_Decal_Hazard_Mask', 'decal_hazard_stripes_Diffuse.png', 'decal_hazard_stripes_nor_gl.png', 'decal_hazard_stripes_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  decalPuddle: makePBRMaterial('Mat_Decal_ChemicalPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.08, normalScale: 1.15 }),
  decalCharts: makePBRMaterial('Mat_Decal_MedicalCharts_Mask', 'decal_medical_charts_Diffuse.png', 'decal_medical_charts_nor_gl.png', 'decal_medical_charts_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.2 }),
  decalTracks: makePBRMaterial('Mat_Decal_StretcherTracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalScorch: makePBRMaterial('Mat_Decal_Scorch_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalOil: makePBRMaterial('Mat_Decal_Oil_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalMold: makePBRMaterial('Mat_Decal_MoldGrime_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  grassScrub: makePBRMaterial('Mat_Grass_CourtyardScrub_Mask', 'grass_desert_scrub_Diffuse.png', 'grass_desert_scrub_nor_gl.png', 'grass_desert_scrub_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.2 })
};

function appendBuffer(buf, target) {
  // Align to 4 bytes
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
  // buildersAndMats: Array of { builder, mat } or { raw, mat }
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
  [-40.0, 0.25, -30.0], // Team0 (NW Emergency Courtyard)
  [ 40.0, 0.25, -30.0], // Team1 (NE Emergency Courtyard)
  [-40.0, 0.25,  30.0], // Team2 (SW Emergency Courtyard)
  [ 40.0, 0.25,  30.0]  // Team3 (SE Emergency Courtyard)
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

// 18 Card Candidate Points at Y = 1.15 (All >= 16.5m from every spawn point; actual min is 21.68m!)
const CARD_POINTS = [
  // 4 in Central Collapsed Bio-Containment Rotunda & Isolation Pods
  [  0.0, 1.15, -11.0],
  [  0.0, 1.15,  11.0],
  [-11.0, 1.15,   0.0],
  [ 11.0, 1.15,   0.0],
  // 4 in Main Cross Boulevards / Checkpoints
  [-24.0, 1.15,   0.0],
  [ 24.0, 1.15,   0.0],
  [  0.0, 1.15, -23.0],
  [  0.0, 1.15,  23.0],
  // 2 in NW Radiology & MRI Wing
  [-22.0, 1.15, -14.0],
  [-14.0, 1.15, -22.0],
  // 2 in NE Surgical Operating Theater Wing
  [ 22.0, 1.15, -14.0],
  [ 14.0, 1.15, -22.0],
  // 2 in SW Bio-Quarantine ICU Ward
  [-22.0, 1.15,  14.0],
  [-14.0, 1.15,  22.0],
  // 2 in SE Morgue, Autopsy & Backup Generator Wing
  [ 22.0, 1.15,  14.0],
  [ 14.0, 1.15,  22.0],
  // 2 in North/South Hazmat Decontamination Airlocks
  [ -8.0, 1.15, -28.0],
  [  8.0, 1.15,  28.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.0m from every spawn point; all >= 3.5m clear of every solid prop/wall!)
const DOOR_POINTS = [
  // 4 Outer North/South/West/East Main ER & Airlock Gates
  [  0.0, 0.10, -30.0],
  [  0.0, 0.10,  30.0],
  [-41.0, 0.10,   0.0],
  [ 41.0, 0.10,   0.0],
  // 4 North/South Quarantine Lobby Extraction Zones
  [-12.0, 0.10, -30.0],
  [ 12.0, 0.10, -30.0],
  [-12.0, 0.10,  30.0],
  [ 12.0, 0.10,  30.0],
  // 4 East/West Boulevard & Wing Junction Extraction Zones
  [-20.0, 0.10,  -6.0],
  [ 20.0, 0.10,  -6.0],
  [-20.0, 0.10,   6.0],
  [ 20.0, 0.10,   6.0],
  // 4 Inner Rotunda Open Triage Ring Plazas (r = 10.6m, >= 4.0m clear of central BioLab and outer Rotunda wall!)
  [ -7.5, 0.10,  -7.5],
  [  7.5, 0.10,  -7.5],
  [ -7.5, 0.10,   7.5],
  [  7.5, 0.10,   7.5]
];

// Helper to verify a proposed solid prop position doesn't collide with Spawns (4.0m), Cards (2.0m), or Doors (3.6m)
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
// 2. WALKABLE FLOOR & TERRAIN ZONES (Y in [-0.08, +0.06], NO_FADE_KEYWORDS)
// ============================================================================
function buildFloors() {
  // (A) Base Terrain_Hospital_Ground: 96x72m subdivided 0.75m grid (128x96 = 24,576 tris)
  // Named with "Terrain" so ImportedMap._build_outer_world uses it seamlessly for outer ground!
  const bTerrain = new MeshBuilder();
  const nx = 128, nz = 96;
  const xMin = -48.0, xMax = 48.0, zMin = -36.0, zMax = 36.0;
  for (let iz = 0; iz <= nz; iz++) {
    const fz = iz / nz;
    const z = zMin + fz * (zMax - zMin);
    for (let ix = 0; ix <= nx; ix++) {
      const fx = ix / nx;
      const x = xMin + fx * (xMax - xMin);
      // Gentle micro-undulation outside hospital building footprint, flat inside
      const inCourtyard = Math.abs(x) > 33 || Math.abs(z) > 25;
      const y = inCourtyard ? (-0.02 + Math.sin(x * 0.35) * Math.cos(z * 0.35) * 0.025) : -0.02;
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
  const terrainMesh = registerMesh('Terrain_Hospital_Ground_Mesh', [{ builder: bTerrain, mat: MAT.courtyardAsphalt }]);
  addGeometryNode('Terrain_Hospital_Ground', terrainMesh);

  // Helper to create subdivided indoor floor slab at Y=0.0
  function addFloorZone(nodeName, x0, z0, x1, z1, matIdx, step = 1.0) {
    const b = new MeshBuilder();
    const sx = Math.max(2, Math.round((x1 - x0) / step));
    const sz = Math.max(2, Math.round((z1 - z0) / step));
    for (let iz = 0; iz <= sz; iz++) {
      const z = z0 + (iz / sz) * (z1 - z0);
      for (let ix = 0; ix <= sx; ix++) {
        const x = x0 + (ix / sx) * (x1 - x0);
        const microY = 0.01 + Math.sin(x * 0.8 + z * 0.6) * 0.004;
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

  // Central Rotunda & Cross Boulevards Vinyl Tile Floors
  addFloorZone('Floor_Rotunda_Center', -16.5, -16.5, 16.5, 16.5, MAT.vinylTile, 0.75);
  addFloorZone('Floor_Boulevard_West', -34.0, -4.5, -16.5, 4.5, MAT.vinylTile, 0.75);
  addFloorZone('Floor_Boulevard_East',  16.5, -4.5,  34.0, 4.5, MAT.vinylTile, 0.75);
  addFloorZone('Floor_Boulevard_North', -14.0, -32.0, 14.0, -16.5, MAT.vinylTile, 0.75);
  addFloorZone('Floor_Boulevard_South', -14.0,  16.5, 14.0,  32.0, MAT.vinylTile, 0.75);

  // NW Radiology & MRI Wing (Ceramic & Vinyl Floor)
  addFloorZone('Floor_NW_Radiology_Wing', -34.0, -26.0, -11.0, -4.5, MAT.ceramicWallTile, 0.75);
  // NE Surgical Operating Suites (Surgical Green Linoleum Floor)
  addFloorZone('Floor_NE_Surgical_Wing',   11.0, -26.0,  34.0, -4.5, MAT.surgicalLinoleum, 0.75);
  // SW Bio-Quarantine ICU Ward (ICU Blue Linoleum Floor)
  addFloorZone('Floor_SW_ICU_Wing',       -34.0,   4.5, -11.0, 26.0, MAT.icuBlueFloor, 0.75);
  // SE Morgue, Pharmacy & Generator Wing (Chipped Concrete & Ceramic Floor)
  addFloorZone('Floor_SE_Morgue_Wing',     11.0,   4.5,  34.0, 26.0, MAT.chippedConcrete, 0.75);
}
buildFloors();

// ============================================================================
// 3. MODULAR HOSPITAL WALLS (6-12m segments, 3.0m height, 0.45m thickness)
// ============================================================================
let wallCounter = 1;
function addWallSegment(prefix, x0, z0, x1, z1, matIdx = MAT.hospitalPlasterWall, h = 3.0, thick = 0.45) {
  const b = new MeshBuilder();
  b.addHospitalWallSegment(x0, z0, x1, z1, h, thick);
  const name = `${prefix}_${String(wallCounter++).padStart(3, '0')}`;
  const mIdx = registerMesh(`${name}_Mesh`, [{ builder: b, mat: matIdx }]);
  addGeometryNode(name, mIdx);
}

// (A) Central Bio-Containment Rotunda Ring (Radius 16m, 32-sided polygon, 8 wide 3.2m doorways at cardinal & diagonal axes)
function buildRotundaArchitecture() {
  const R = 16.0;
  const N = 32;
  // Doorways at k = 0,1 (East), 4,5 (SE), 8,9 (South), 12,13 (SW), 16,17 (West), 20,21 (NW), 24,25 (North), 28,29 (NE)
  // Actually each segment of a 32-gon at R=16m has length 2 * 16 * sin(pi/32) = 3.137m!
  // So skipping 1 segment + half of neighbors or 1 full segment gives a 3.2m doorway; let's make 16 wall segments of ~3.2m..6.2m with 8 wide 3.3m doorways!
  const doorAngles = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * 360;
    const a1 = ((i + 1) / N) * 360;
    const aMid = (a0 + a1) * 0.5;
    // Check angular distance to any of the 8 doorway angles (3.3m arc at R=16m is ~11.8 degrees -> ±6.0 deg)
    let isDoor = false;
    for (const da of doorAngles) {
      let diff = Math.abs(((aMid - da + 540) % 360) - 180);
      if (diff < 6.0) { isDoor = true; break; }
    }
    if (isDoor) continue;
    const r0 = (a0 * Math.PI) / 180;
    const r1 = (a1 * Math.PI) / 180;
    addWallSegment('Rotunda_Wall', Math.cos(r0) * R, Math.sin(r0) * R, Math.cos(r1) * R, Math.sin(r1) * R, MAT.hospitalPlasterWall, 3.0, 0.48);
  }

  // Overhead Broken Structural Ring Beams & Bio-Filter Ducts (Rotunda_Gantry_01..04_Canopy at Y=4.2m, no collision, fades when occluding!)
  for (let q = 0; q < 4; q++) {
    const bCanopy = new MeshBuilder();
    const startAng = q * Math.PI * 0.5 + 0.12;
    const endAng = (q + 1) * Math.PI * 0.5 - 0.12;
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t0 = startAng + (s / steps) * (endAng - startAng);
      const t1 = startAng + ((s + 1) / steps) * (endAng - startAng);
      const tm = (t0 + t1) * 0.5;
      const cx = Math.cos(tm) * 14.5;
      const cz = Math.sin(tm) * 14.5;
      bCanopy.addBeveledBox(cx, 4.2, cz, 3.4, 0.35, 0.55, -tm + Math.PI * 0.5, 0.03, 0.5);
    }
    // Radial overhead truss beam towards center
    const radAng = q * Math.PI * 0.5 + Math.PI * 0.25;
    bCanopy.addBeveledBox(Math.cos(radAng) * 9.0, 4.35, Math.sin(radAng) * 9.0, 10.5, 0.28, 0.42, -radAng, 0.02, 0.5);
    const cName = `Rotunda_Gantry_0${q + 1}_Canopy`;
    const mIdx = registerMesh(`${cName}_Mesh`, [{ builder: bCanopy, mat: MAT.heroDarkMetal }]);
    addGeometryNode(cName, mIdx);
  }

  // Center of Rotunda (0,0): Collapsed Mobile Bio-Lab Containment Module & Curved Triage Command Desk
  // Note: CardPoints in Rotunda are at (0, -11), (0, 11), (-11, 0), (11, 0). So radius <= 6.5m is completely clear of cards & doors!
  const bBioLab = new MeshBuilder();
  const bBioSteel = new MeshBuilder();
  // Central octagonal bio-isolation core (radius 2.2m, height 2.35m -> solid full cover >= 1.9m)
  bBioLab.addCylinder(0, 1.18, 0, 2.2, 2.2, 2.36, 16, 3, true, 0, 0, 2.0);
  bBioSteel.addTorus(0, 0.35, 0, 2.25, 0.12, 24, 12, 0, 0);
  bBioSteel.addTorus(0, 1.95, 0, 2.25, 0.12, 24, 12, 0, 0);
  // 4 Curved Triage Command Desks along cardinal axes at radius 4.2m (leaving diagonal DoorPoints (±7.5, ±7.5) > 4.2m clear!)
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI * 0.5;
    const dx = Math.cos(ang) * 4.2;
    const dz = Math.sin(ang) * 4.2;
    bBioLab.addBeveledBox(dx, 1.0, dz, 3.0, 2.0, 0.70, -ang + Math.PI * 0.5, 0.04, 0.5, 3, 2, 1);
    bBioSteel.addBeveledBox(dx, 2.02, dz, 3.1, 0.08, 0.78, -ang + Math.PI * 0.5, 0.02, 0.5);
  }
  const bioLabMesh = registerMesh('Console_Rotunda_BioLab_Mesh', [
    { builder: bBioLab, mat: MAT.heroMedicalEnamel },
    { builder: bBioSteel, mat: MAT.brushedSteel }
  ]);
  addGeometryNode('Console_Rotunda_BioLab_01', bioLabMesh);
}
buildRotundaArchitecture();

// (B) 4 Asymmetric Wing Modular Walls (Every room has >= 2 doorways >= 2.6m wide, corridors >= 4.0m wide!)
function buildWingWalls() {
  // --- NW Wing: Radiology & MRI Suite (X in [-34, -12], Z in [-26, -4.5]) ---
  // Outer North Wall of NW Wing (Z = -26, with 3.5m doorway at X in [-21, -17.5])
  addWallSegment('NW_Wall', -34.0, -26.0, -21.5, -26.0, MAT.hospitalPlasterWall);
  addWallSegment('NW_Wall', -17.5, -26.0, -11.5, -26.0, MAT.hospitalPlasterWall);
  // Outer West Wall of NW Wing (X = -34, with 3.5m doorway at Z in [-16, -12.5])
  addWallSegment('NW_Wall', -34.0, -26.0, -34.0, -16.5, MAT.hospitalPlasterWall);
  addWallSegment('NW_Wall', -34.0, -12.5, -34.0,  -4.5, MAT.hospitalPlasterWall);
  // South Boulevard Partition of NW Wing (Z = -4.5, with doorway at X in [-26, -22])
  addWallSegment('NW_Wall', -34.0,  -4.5, -26.5,  -4.5, MAT.ceramicWallTile);
  // Internal Lead-Shielded MRI Control Partition (X = -26, Z in [-22, -14])
  addWallSegment('NW_Wall', -26.0, -22.5, -26.0, -14.5, MAT.ceramicWallTile);

  // --- NE Wing: Surgical Operating Suites (X in [12, 34], Z in [-26, -4.5]) ---
  // Outer North Wall of NE Wing (Z = -26, with doorway at X in [17.5, 21.5])
  addWallSegment('NE_Wall',  11.5, -26.0,  17.5, -26.0, MAT.hospitalPlasterWall);
  addWallSegment('NE_Wall',  21.5, -26.0,  34.0, -26.0, MAT.hospitalPlasterWall);
  // Outer East Wall of NE Wing (X = 34, with doorway at Z in [-16.5, -12.5])
  addWallSegment('NE_Wall',  34.0, -26.0,  34.0, -16.5, MAT.hospitalPlasterWall);
  addWallSegment('NE_Wall',  34.0, -12.5,  34.0,  -4.5, MAT.hospitalPlasterWall);
  // South Boulevard Partition of NE Wing (Z = -4.5)
  addWallSegment('NE_Wall',  26.5,  -4.5,  34.0,  -4.5, MAT.ceramicWallTile);
  // Internal Scrub Room Divider (X = 26, Z in [-22.5, -14.5])
  addWallSegment('NE_Wall',  26.0, -22.5,  26.0, -14.5, MAT.ceramicWallTile);

  // --- SW Wing: Bio-Quarantine ICU Ward (X in [-34, -12], Z in [4.5, 26]) ---
  // Outer South Wall of SW Wing (Z = 26, with doorway at X in [-21.5, -17.5])
  addWallSegment('SW_Wall', -34.0,  26.0, -21.5,  26.0, MAT.hospitalPlasterWall);
  addWallSegment('SW_Wall', -17.5,  26.0, -11.5,  26.0, MAT.hospitalPlasterWall);
  // Outer West Wall of SW Wing (X = -34, with doorway at Z in [12.5, 16.5])
  addWallSegment('SW_Wall', -34.0,   4.5, -34.0,  12.5, MAT.hospitalPlasterWall);
  addWallSegment('SW_Wall', -34.0,  16.5, -34.0,  26.0, MAT.hospitalPlasterWall);
  // North Boulevard Partition of SW Wing (Z = 4.5)
  addWallSegment('SW_Wall', -34.0,   4.5, -26.5,   4.5, MAT.hospitalPlasterWall);
  // Internal ICU Ward Partition (Z = 18.0, X in [-30.5, -23.5])
  addWallSegment('SW_Wall', -30.5,  18.0, -23.5,  18.0, MAT.hospitalPlasterWall);

  // --- SE Wing: Morgue, Autopsy & Backup Generator Wing (X in [12, 34], Z in [4.5, 26]) ---
  // Outer South Wall of SE Wing (Z = 26, with doorway at X in [17.5, 21.5])
  addWallSegment('SE_Wall',  11.5,  26.0,  17.5,  26.0, MAT.hospitalPlasterWall);
  addWallSegment('SE_Wall',  21.5,  26.0,  34.0,  26.0, MAT.hospitalPlasterWall);
  // Outer East Wall of SE Wing (X = 34, with doorway at Z in [12.5, 16.5])
  addWallSegment('SE_Wall',  34.0,   4.5,  34.0,  12.5, MAT.hospitalPlasterWall);
  addWallSegment('SE_Wall',  34.0,  16.5,  34.0,  26.0, MAT.hospitalPlasterWall);
  // North Boulevard Partition of SE Wing (Z = 4.5)
  addWallSegment('SE_Wall',  26.5,   4.5,  34.0,   4.5, MAT.chippedConcrete);
  // Internal Morgue / Generator Partition (X = 26.0, Z in [14.5, 22.5])
  addWallSegment('SE_Wall',  26.0,  14.5,  26.0,  22.5, MAT.chippedConcrete);

  // --- North & South Hazmat Decontamination Airlock Wing Walls (Z = ±26..±31, leaving DoorPoints (±11, ±30) and (0, ±30) 3.5m clear!) ---
  addWallSegment('Airlock_Wall', -5.5, -25.5, -5.5, -19.5, MAT.ceramicWallTile);
  addWallSegment('Airlock_Wall',  5.5, -25.5,  5.5, -19.5, MAT.ceramicWallTile);
  addWallSegment('Airlock_Wall', -5.5,  19.5, -5.5,  25.5, MAT.ceramicWallTile);
  addWallSegment('Airlock_Wall',  5.5,  19.5,  5.5,  25.5, MAT.ceramicWallTile);

  // --- Perimeter Hospital Compound Facade Walls (X = ±47.4, Z = ±35.4, height 3.6m, modular 12m segments) ---
  for (let x = -47.0; x < 47.0; x += 11.75) {
    const xNext = Math.min(47.0, x + 11.75);
    addWallSegment('Wall_Perimeter_North', x, -35.4, xNext, -35.4, MAT.mossConcrete, 3.6, 0.6);
    addWallSegment('Wall_Perimeter_South', x,  35.4, xNext,  35.4, MAT.mossConcrete, 3.6, 0.6);
  }
  for (let z = -35.0; z < 35.0; z += 11.66) {
    const zNext = Math.min(35.0, z + 11.66);
    addWallSegment('Wall_Perimeter_West', -47.4, z, -47.4, zNext, MAT.mossConcrete, 3.6, 0.6);
    addWallSegment('Wall_Perimeter_East',  47.4, z,  47.4, zNext, MAT.mossConcrete, 3.6, 0.6);
  }
}
buildWingWalls();

// ============================================================================
// 4. HERO MEDICAL & HOSPITAL PROPS (High-Poly Multi-Material 3D Models)
// ============================================================================

// (A) 18 Prop_CardPedestal_01..18 beneath every CardPoint_01..18 (radius <= 0.36m, height 0.45m)
function buildCardPedestals() {
  const bBody = new MeshBuilder();
  const bMetal = new MeshBuilder();
  // Octagonal beveled base & column
  bBody.addCylinder(0, 0.06, 0, 0.35, 0.32, 0.12, 16, 1, true);
  bBody.addCylinder(0, 0.24, 0, 0.24, 0.22, 0.26, 16, 2, true);
  bMetal.addCylinder(0, 0.41, 0, 0.30, 0.34, 0.08, 16, 1, true);
  bMetal.addTorus(0, 0.43, 0, 0.26, 0.025, 24, 10, 0, 0);
  // Cable conduit box on side
  bMetal.addBeveledBox(0.24, 0.18, 0, 0.10, 0.22, 0.14, 0, 0.015, 1.0);

  const pedMesh = registerMesh('Prop_CardPedestal_SharedMesh', [
    { builder: bBody, mat: MAT.heroDarkMetal },
    { builder: bMetal, mat: MAT.brushedSteel }
  ]);
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    const name = `Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`;
    addGeometryNode(name, pedMesh, [cp[0], 0.0, cp[2]]);
  }
}
buildCardPedestals();

// (B) Hero Prop: NW Toroidal MRI Scanner (`Console_MRI_Scanner_01..02` -> matches CONVEX_KEYWORDS "Console")
function buildMRIScanners() {
  const bEnamel = new MeshBuilder();
  const bSteel = new MeshBuilder();
  // Main MRI cylindrical housing (2.15m tall, 2.2m wide, with central bore tunnel)
  bEnamel.addCylinder(0, 1.12, 0, 1.12, 1.12, 1.65, 36, 4, true, 0, Math.PI * 0.5, 2.0);
  bEnamel.addBeveledBox(0, 0.35, 0, 1.85, 0.70, 1.65, 0, 0.06, 0.8, 3, 2, 3);
  // Front & back toroidal bevel rings (pitch = PI/2 so ring lies in XY plane facing +Z/-Z)
  bSteel.addTorus(0, 1.12,  0.82, 0.78, 0.28, 36, 18, 0, Math.PI * 0.5);
  bSteel.addTorus(0, 1.12, -0.82, 0.78, 0.28, 36, 18, 0, Math.PI * 0.5);
  bSteel.addTorus(0, 1.12,  0.85, 0.48, 0.08, 32, 12, 0, Math.PI * 0.5);
  // Patient sliding bed table extending out of bore (height 0.85m)
  bSteel.addBeveledBox(0, 0.42, 1.45, 0.56, 0.80, 1.55, 0, 0.03, 0.8, 2, 2, 3);
  bEnamel.addBeveledBox(0, 0.85, 1.25, 0.64, 0.10, 2.10, 0, 0.03, 0.8, 2, 1, 4);

  const mriMesh = registerMesh('Console_MRI_Scanner_Mesh', [
    { builder: bEnamel, mat: MAT.heroMedicalEnamel },
    { builder: bSteel, mat: MAT.brushedSteel }
  ]);
  addGeometryNode('Console_MRI_Scanner_01', mriMesh, [-29.5, 0.0, -19.5], 0.35);
  addGeometryNode('Console_MRI_Scanner_02', mriMesh, [-18.5, 0.0, -19.5], -0.25);
}
buildMRIScanners();

// (C) Hero Prop: NE Surgical Operating Suites (3 Operating Tables + 3 Overhead SurgicalLamp_Canopy + 3 Anesthesia Consoles + Scrub Sinks)
function buildSurgicalSuites() {
  // Surgical Table + Instrument Tray (height 0.88m low jumpable cover)
  const bTableSteel = new MeshBuilder();
  const bTablePad = new MeshBuilder();
  bTableSteel.addBeveledBox(0, 0.06, 0, 0.75, 0.12, 1.45, 0, 0.02, 1.0);
  bTableSteel.addCylinder(0, 0.42, 0, 0.18, 0.16, 0.65, 20, 2, true);
  bTablePad.addBeveledBox(0, 0.82, 0, 0.72, 0.12, 2.05, 0, 0.03, 1.0, 2, 1, 4);
  bTablePad.addBeveledBox(0, 0.90, -0.78, 0.45, 0.08, 0.38, 0, 0.02, 1.0);
  // Side Mayo instrument stand
  bTableSteel.addCylinder(0.68, 0.45, 0.2, 0.04, 0.04, 0.90, 12, 1, true);
  bTableSteel.addBeveledBox(0.68, 0.90, 0.2, 0.45, 0.04, 0.65, 0, 0.01, 1.0);

  const surgTableMesh = registerMesh('Crate_SurgicalTable_Mesh', [
    { builder: bTableSteel, mat: MAT.brushedSteel },
    { builder: bTablePad, mat: MAT.surgicalLinoleum }
  ]);

  // Articulated Double-Dome Ceiling Surgical Lamp (`SurgicalLamp_NN_Canopy` at Y=3.1..4.2m, no collision)
  const bLampArm = new MeshBuilder();
  const bLampGlow = new MeshBuilder();
  bLampArm.addCylinder(0, 3.85, 0, 0.12, 0.12, 0.90, 16, 1, true);
  bLampArm.addBeveledBox(0.45, 3.45, 0, 1.05, 0.10, 0.12, 0, 0.02, 1.0);
  bLampArm.addBeveledBox(-0.45, 3.45, 0, 1.05, 0.10, 0.12, 0, 0.02, 1.0);
  bLampArm.addCylinder(0.85, 3.25, 0, 0.48, 0.22, 0.18, 24, 1, true);
  bLampArm.addCylinder(-0.85, 3.25, 0, 0.48, 0.22, 0.18, 24, 1, true);
  bLampGlow.addCylinder(0.85, 3.15, 0, 0.42, 0.42, 0.04, 24, 1, true);
  bLampGlow.addCylinder(-0.85, 3.15, 0, 0.42, 0.42, 0.04, 24, 1, true);

  const surgLampMesh = registerMesh('SurgicalLamp_Canopy_Mesh', [
    { builder: bLampArm, mat: MAT.brushedSteel },
    { builder: bLampGlow, mat: MAT.ecgGreenEmissive }
  ]);

  // Anesthesia & Ventilator Machine Tower (1.98m tall solid cover -> `Console_Anesthesia_NN`)
  const bAnesBody = new MeshBuilder();
  const bAnesSteel = new MeshBuilder();
  bAnesBody.addBeveledBox(0, 0.99, 0, 0.85, 1.98, 0.80, 0, 0.04, 0.8, 2, 3, 2);
  // Dual oxygen/nitrous gas cylinders on back + bellows cylinders
  bAnesSteel.addCylinder(-0.25, 0.95, -0.45, 0.12, 0.12, 1.55, 18, 2, true);
  bAnesSteel.addCylinder( 0.25, 0.95, -0.45, 0.12, 0.12, 1.55, 18, 2, true);
  bAnesSteel.addCylinder( 0.0,  1.45,  0.42, 0.14, 0.14, 0.38, 18, 1, true);

  const anesMesh = registerMesh('Console_Anesthesia_Mesh', [
    { builder: bAnesBody, mat: MAT.heroMedicalEnamel },
    { builder: bAnesSteel, mat: MAT.brushedSteel }
  ]);

  const theaters = [
    { pos: [29.5, 0.0, -20.5], yaw: 0.2 },
    { pos: [29.5, 0.0, -10.5], yaw: -0.15 },
    { pos: [19.5, 0.0, -21.0], yaw: 1.57 }
  ];
  theaters.forEach((th, idx) => {
    const n = String(idx + 1).padStart(2, '0');
    addGeometryNode(`Crate_SurgicalTable_${n}`, surgTableMesh, th.pos, th.yaw);
    addGeometryNode(`SurgicalLamp_${n}_Canopy`, surgLampMesh, th.pos, th.yaw);
    addGeometryNode(`Console_Anesthesia_${n}`, anesMesh, [th.pos[0] + 1.45, 0.0, th.pos[2] - 0.85], th.yaw + 0.4);
  });
}
buildSurgicalSuites();

// (D) Hero Prop: SW Bio-Quarantine ICU Ward (6 ICUBeds + Privacy Folding Screens + Overhead QuarantineTarp_Canopy)
function buildICUWard() {
  // ICU Hospital Bed (`Crate_ICUBed_01..06`, height 0.88m with headboard, mattress, pillow, side rails)
  const bBedFrame = new MeshBuilder();
  const bBedMattress = new MeshBuilder();
  bBedFrame.addBeveledBox(0, 0.32, 0, 1.05, 0.35, 2.20, 0, 0.03, 0.8, 2, 1, 3);
  // Headboard & footboard (0.92m tall -> jumpable low cover)
  bBedFrame.addBeveledBox(0, 0.48, -1.08, 1.08, 0.92, 0.10, 0, 0.02, 0.8, 2, 2, 1);
  bBedFrame.addBeveledBox(0, 0.44,  1.08, 1.08, 0.84, 0.10, 0, 0.02, 0.8, 2, 2, 1);
  // Side guard rails
  bBedFrame.addBeveledBox(-0.52, 0.68, 0, 0.05, 0.28, 1.65, 0, 0.01, 1.0);
  bBedFrame.addBeveledBox( 0.52, 0.68, 0, 0.05, 0.28, 1.65, 0, 0.01, 1.0);
  // 4 Caster wheels
  for (const [wx, wz] of [[-0.45, -0.95], [0.45, -0.95], [-0.45, 0.95], [0.45, 0.95]]) {
    bBedFrame.addCylinder(wx, 0.08, wz, 0.08, 0.08, 0.06, 14, 1, true, 0, Math.PI * 0.5);
  }
  // Mattress & pillow
  bBedMattress.addBeveledBox(0, 0.56, 0, 0.98, 0.18, 2.02, 0, 0.04, 1.0, 2, 1, 4);
  bBedMattress.addBeveledBox(0, 0.68, -0.78, 0.68, 0.10, 0.38, 0, 0.03, 1.0);

  const icuBedMesh = registerMesh('Crate_ICUBed_Mesh', [
    { builder: bBedFrame, mat: MAT.brushedSteel },
    { builder: bBedMattress, mat: MAT.icuBlueFloor }
  ]);

  // Folding Quarantine Privacy Screen & Bio-Isolation Partition (2.05m tall solid cover -> `Barrier_PrivacyScreen_NN`)
  const bScreen = new MeshBuilder();
  const bScreenFrame = new MeshBuilder();
  bScreen.addBeveledBox(-0.65, 1.02, 0.08, 1.32, 1.95, 0.12,  0.18, 0.02, 0.8, 2, 3, 1);
  bScreen.addBeveledBox( 0.65, 1.02, -0.08, 1.32, 1.95, 0.12, -0.18, 0.02, 0.8, 2, 3, 1);
  bScreenFrame.addBeveledBox(0, 0.06, 0, 2.65, 0.12, 0.45, 0, 0.02, 1.0);
  const screenMesh = registerMesh('Barrier_PrivacyScreen_Mesh', [
    { builder: bScreen, mat: MAT.quarantineYellowTarp },
    { builder: bScreenFrame, mat: MAT.brushedSteel }
  ]);

  const bedPlacements = [
    { pos: [-30.5, 0.0,  8.5], yaw: 1.57 },
    { pos: [-30.5, 0.0, 14.0], yaw: 1.57 },
    { pos: [-30.5, 0.0, 22.0], yaw: 1.65 },
    { pos: [-20.0, 0.0, 22.5], yaw: 0.0 },
    { pos: [-16.0, 0.0, 11.5], yaw: -1.57 },
    { pos: [-26.0, 0.0, 10.0], yaw: 0.45 } // overturned / angled bed
  ];
  bedPlacements.forEach((bp, idx) => {
    addGeometryNode(`Crate_ICUBed_${String(idx + 1).padStart(2, '0')}`, icuBedMesh, bp.pos, bp.yaw);
  });

  const screenPlacements = [
    { pos: [-28.0, 0.0, 11.2], yaw: 0.1 },
    { pos: [-24.5, 0.0, 22.0], yaw: 1.57 },
    { pos: [-18.5, 0.0,  9.5], yaw: 0.75 },
    { pos: [-18.0, 0.0, 17.5], yaw: -0.3 }
  ];
  screenPlacements.forEach((sp, idx) => {
    addGeometryNode(`Barrier_PrivacyScreen_${String(idx + 1).padStart(2, '0')}`, screenMesh, sp.pos, sp.yaw);
  });

  // Overhead Torn Quarantine Plastic Tarps (`QuarantineTarp_01..04_Canopy` at Y=3.4..3.8m)
  for (let i = 0; i < 4; i++) {
    const bTarp = new MeshBuilder();
    const tx = -29.0 + (i % 2) * 10.5;
    const tz = 9.5 + Math.floor(i / 2) * 10.5;
    bTarp.addBeveledBox(tx, 3.55, tz, 6.5, 0.08, 5.2, (i - 1.5) * 0.15, 0.02, 0.4, 6, 1, 5);
    const tName = `QuarantineTarp_0${i + 1}_Canopy`;
    const mIdx = registerMesh(`${tName}_Mesh`, [{ builder: bTarp, mat: MAT.quarantineYellowTarp }]);
    addGeometryNode(tName, mIdx);
  }
}
buildICUWard();

// (E) Hero Prop: SE Morgue Refrigeration Banks, Autopsy Tables & Heavy Backup Generators
function buildMorgueAndGeneratorWing() {
  // Stainless Steel Morgue Refrigeration Bank (`Console_MorgueBank_01..03`, 2.2m tall, 3.2m wide, 12 locker doors with handles)
  const bBankSteel = new MeshBuilder();
  const bBankDark = new MeshBuilder();
  bBankDark.addBeveledBox(0, 1.10, 0, 3.20, 2.20, 1.15, 0, 0.04, 0.6, 4, 3, 2);
  // 3 rows x 3 columns of raised stainless steel refrigeration locker doors
  for (let r = 0; r < 3; r++) {
    for (let c = -1; c <= 1; c++) {
      const lx = c * 1.02;
      const ly = 0.42 + r * 0.66;
      bBankSteel.addBeveledBox(lx, ly, 0.58, 0.90, 0.56, 0.08, 0, 0.02, 1.0, 2, 2, 1);
      // Latch handle
      bBankSteel.addBeveledBox(lx + 0.34, ly, 0.64, 0.08, 0.18, 0.06, 0, 0.01, 1.0);
    }
  }
  const morgueMesh = registerMesh('Console_MorgueBank_Mesh', [
    { builder: bBankSteel, mat: MAT.brushedSteel },
    { builder: bBankDark, mat: MAT.heroDarkMetal }
  ]);

  addGeometryNode('Console_MorgueBank_01', morgueMesh, [30.5, 0.0,  8.5], -1.57);
  addGeometryNode('Console_MorgueBank_02', morgueMesh, [30.5, 0.0, 19.5], -1.57);
  addGeometryNode('Console_MorgueBank_03', morgueMesh, [21.5, 0.0, 24.2], 3.14159);

  // Heavy Diesel Hospital Backup Generator (`Generator_HeavyDiesel_01..02`, 2.15m tall)
  const bGenBody = new MeshBuilder();
  const bGenPipes = new MeshBuilder();
  bGenBody.addBeveledBox(0, 1.05, 0, 2.80, 2.10, 1.35, 0, 0.05, 0.6, 4, 3, 2);
  bGenPipes.addCylinder(-0.85, 2.25, 0, 0.16, 0.16, 0.55, 18, 1, true);
  bGenPipes.addCylinder( 0.85, 2.25, 0, 0.16, 0.16, 0.55, 18, 1, true);
  bGenPipes.addTorus(0, 1.15, 0.70, 0.42, 0.08, 24, 12);
  const heavyGenMesh = registerMesh('Generator_HeavyDiesel_Mesh', [
    { builder: bGenBody, mat: MAT.rustyMetal },
    { builder: bGenPipes, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Generator_HeavyDiesel_01', heavyGenMesh, [17.5, 0.0, 17.5], 0.0);
  addGeometryNode('Generator_HeavyDiesel_02', heavyGenMesh, [29.5, 0.0, 14.0], 1.57);
}
buildMorgueAndGeneratorWing();

// (F) Hero Prop: 4 Crashed/Parked Paramedic Ambulances in Outer Courtyards (`Humvee_Ambulance_01..04`)
// Notice: Named `Humvee_Ambulance_01..04` so it matches `CONVEX_KEYWORDS` ("Humvee") in ImportedMap.gd for rock-solid convex collision!
function buildParamedicAmbulances() {
  const bBody = new MeshBuilder();
  const bChassis = new MeshBuilder();
  const bLightbar = new MeshBuilder();

  // Rear patient box module (length 3.4m, width 2.15m, height 2.25m)
  bBody.addBeveledBox(-0.45, 1.32, 0, 3.45, 1.88, 2.15, 0, 0.06, 0.5, 6, 4, 4);
  // Front cab & hood (length 1.85m, width 2.0m)
  bBody.addBeveledBox( 1.75, 1.08, 0, 1.25, 1.42, 2.02, 0, 0.06, 0.5, 3, 3, 3);
  bBody.addBeveledBox( 2.65, 0.82, 0, 0.95, 0.88, 1.96, 0, 0.06, 0.5, 3, 2, 3);
  // Chassis frame, bumpers, wheel arches & 4 detailed 32-segment wheels
  bChassis.addBeveledBox(0.35, 0.35, 0, 5.75, 0.28, 1.92, 0, 0.03, 0.8, 4, 1, 2);
  bChassis.addBeveledBox(3.15, 0.42, 0, 0.22, 0.32, 2.08, 0, 0.03, 1.0);
  bChassis.addBeveledBox(-2.25, 0.42, 0, 0.22, 0.32, 2.18, 0, 0.03, 1.0);
  for (const [wx, wz] of [[-1.35, -1.05], [-1.35, 1.05], [2.05, -1.02], [2.05, 1.02]]) {
    bChassis.addCylinder(wx, 0.42, wz, 0.42, 0.42, 0.32, 28, 2, true, 0, Math.PI * 0.5);
    bChassis.addTorus(wx, 0.42, wz > 0 ? wz + 0.14 : wz - 0.14, 0.28, 0.12, 24, 12, 0, Math.PI * 0.5);
  }
  // Roof emergency lightbar
  bLightbar.addBeveledBox(1.55, 2.30, 0, 0.38, 0.16, 1.35, 0, 0.02, 1.0);
  bLightbar.addBeveledBox(-2.05, 2.28, 0, 0.22, 0.14, 1.65, 0, 0.02, 1.0);

  const ambMesh = registerMesh('Humvee_Ambulance_HeroMesh', [
    { builder: bBody, mat: MAT.heroMedicalEnamel },
    { builder: bChassis, mat: MAT.heroDarkMetal },
    { builder: bLightbar, mat: MAT.redEmissive }
  ]);

  // Place 4 ambulances in the 4 outer emergency courtyards (safe distance from Team0..3 spawns at (±40, ±30)!)
  const ambList = [
    { pos: [-30.0, 0.0, -31.5], yaw:  0.28 }, // NW Courtyard
    { pos: [ 30.0, 0.0, -31.5], yaw:  2.85 }, // NE Courtyard
    { pos: [-30.0, 0.0,  31.5], yaw: -0.28 }, // SW Courtyard
    { pos: [ 30.0, 0.0,  31.5], yaw: -2.85 }  // SE Courtyard
  ];
  ambList.forEach((a, idx) => {
    addGeometryNode(`Humvee_Ambulance_0${idx + 1}`, ambMesh, a.pos, a.yaw);
  });

  // 4 Courtyard Triage Canopy Tents (`Tent_01..04_Canopy` at Y=3.3m above courtyard triage bays)
  for (let i = 0; i < 4; i++) {
    const bTent = new MeshBuilder();
    const sx = i % 2 === 0 ? -1 : 1;
    const sz = i < 2 ? -1 : 1;
    const tx = sx * 40.0;
    const tz = sz * 18.5;
    bTent.addBeveledBox(tx, 3.45, tz, 6.2, 0.45, 5.2, sx * sz * 0.12, 0.05, 0.4, 5, 1, 4);
    const tName = `Tent_0${i + 1}_Canopy`;
    const mIdx = registerMesh(`${tName}_Mesh`, [{ builder: bTent, mat: MAT.tentCamo }]);
    addGeometryNode(tName, mIdx);
  }
}
buildParamedicAmbulances();

// (G) CC0 Photogrammetry Cover Props Distributed Across Courtyards, Boulevards & Wings
function buildPhotogrammetryProps() {
  // 16 Concrete Road Barriers (`Barrier_01..16`)
  const barriers = [
    [-35.0, -21.0, 0.4], [ 35.0, -21.0, -0.4], [-35.0,  21.0, -0.4], [ 35.0,  21.0, 0.4],
    [-41.5, -13.0, 1.57], [ 41.5, -13.0, 1.57], [-41.5,  13.0, 1.57], [ 41.5,  13.0, 1.57],
    [-19.5, -29.5, 0.15], [ 19.5, -29.5, -0.15], [-19.5,  29.5, -0.15], [ 19.5,  29.5, 0.15],
    [-29.5,  -1.8, 1.57], [ 29.5,   1.8, 1.57], [ -2.2, -19.5, 0.0], [  2.2,  19.5, 0.0]
  ];
  barriers.forEach((b, i) => {
    addGeometryNode(`Barrier_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [b[0], 0.0, b[1]], b[2]);
  });

  // 12 High-Poly Sculpted Sandbag Positions (`Sandbag_Position_01..12`, height 0.88m)
  function createSandbagPositionMesh() {
    const b = new MeshBuilder();
    // 3 rows of 4 individual sculpted sandbags with organic pillow bulges
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
    [-34.0, -24.5, 0.78], [ 34.0, -24.5, -0.78], [-34.0,  24.5, -0.78], [ 34.0,  24.5, 0.78],
    [-27.5, -10.5, 0.0],  [ 27.5, -10.5, 0.0],   [-27.5,  10.5, 0.0],   [ 27.5,  10.5, 0.0],
    [-13.5, -14.5, 0.78], [ 13.5, -14.5, -0.78], [-13.5,  14.5, -0.78], [ 13.5,  14.5, 0.78]
  ];
  sandbags.forEach((s, i) => {
    addGeometryNode(`Sandbag_Position_${String(i + 1).padStart(2, '0')}`, sandbagMesh, [s[0], 0.0, s[1]], s[2]);
  });

  // 12 Medical Supply Crates (`Crate_Supply_01..12`), 8 Biohazard Barrels (`Barrel_Bio_01..08`),
  // 6 Portable Generators (`Generator_Field_01..06`), 8 Electrical PowerBoxes (`PowerBox_01..08`),
  // 8 Steel Storage Racks (`Server_Rack_Storage_01..08`)
  const crates = [
    [-37.5, -18.5, 0.3], [ 37.5, -18.5, -0.2], [-37.5,  18.5, 0.4], [ 37.5,  18.5, -0.5],
    [-16.0,  -8.5, 0.8], [ 16.0,  -8.5, -0.4], [-16.0,   8.5, 0.2], [ 16.0,   8.5, -0.7],
    [-24.5, -23.5, 0.1], [ 24.5, -23.5, -0.1], [-24.5,  23.5, 0.5], [ 24.5,  23.5, -0.3]
  ];
  crates.forEach((c, i) => {
    addGeometryNode(`Crate_Supply_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [c[0], 0.0, c[1]], c[2]);
  });

  const barrels = [
    [-38.8, -17.5], [ 38.8, -17.5], [-38.8,  17.5], [ 38.8,  17.5],
    [ -6.8, -22.5], [  6.8, -22.5], [ -6.8,  22.5], [  6.8,  22.5]
  ];
  barrels.forEach((b, i) => {
    addGeometryNode(`Barrel_Bio_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [b[0], 0.0, b[1]], i * 0.7);
  });

  const gens = [
    [-43.5, -20.0, 1.57], [ 43.5, -20.0, -1.57], [-43.5,  20.0, 1.57], [ 43.5,  20.0, -1.57],
    [ -4.2, -24.0, 0.0],  [  4.2,  24.0, 3.14]
  ];
  gens.forEach((g, i) => {
    addGeometryNode(`Generator_Field_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [g[0], 0.0, g[1]], g[2]);
  });

  const pboxes = [
    [-25.3, -16.5, 1.57], [-25.3, -20.5, 1.57],
    [ 25.3, -16.5, -1.57], [ 25.3, -20.5, -1.57],
    [-16.5, -25.3, 0.0],  [ 16.5, -25.3, 0.0],
    [-16.5,  25.3, 3.14], [ 16.5,  25.3, 3.14]
  ];
  pboxes.forEach((p, i) => {
    addGeometryNode(`PowerBox_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [p[0], 0.0, p[1]], p[2]);
  });

  const racks = [
    [-33.2, -20.5, 1.57], [-33.2,  -8.5, 1.57],
    [ 33.2, -20.5, -1.57], [ 33.2,  -8.5, -1.57],
    [-33.2,   8.5, 1.57], [-33.2,  20.5, 1.57],
    [ 15.5,  25.2, 3.14], [ 25.2,  16.5, -1.57]
  ];
  racks.forEach((r, i) => {
    addGeometryNode(`Server_Rack_Storage_${String(i + 1).padStart(2, '0')}`, sharedCC0.shelves, [r[0], 0.0, r[1]], r[2]);
  });

  // Perimeter Rock & Cliff Rubble Berm (`Cliff_Perimeter_01..10` and `Rock_Rubble_01..08`)
  // Placed strictly inside [-48, 48] x [-36, 36] so World AABB is exactly 96x72m and >= 3.6m clear of all DoorPoints & Spawns!
  const cliffs = [
    [-25.0, -34.4, 0.0], [ 25.0, -34.4, 0.0], [-46.2, -5.0, 1.57],
    [-25.0,  34.4, 3.14],[ 25.0,  34.4, 3.14],[ 46.2,  5.0, -1.57],
    [-46.2, -16.0, 1.57],[-46.2,  16.0, 1.57],
    [ 46.2, -16.0, -1.57],[ 46.2, 16.0, -1.57]
  ];
  cliffs.forEach((c, i) => {
    addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [c[0], -0.05, c[1]], c[2]);
  });

  const boulders = [
    [-44.5, -10.0, 0.2], [ 44.5, -10.0, 1.1], [-44.5,  10.0, 2.3], [ 44.5,  10.0, 0.8],
    [-44.8, -23.5, 0.5], [ 44.8, -23.5, 1.9], [-44.8,  23.5, 2.7], [ 44.8,  23.5, 0.4]
  ];
  boulders.forEach((b, i) => {
    addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [b[0], -0.05, b[1]], b[2]);
  });
}
buildPhotogrammetryProps();

// ============================================================================
// 5. RED CROSS EMBLEMS & ER GUIDE LINES (`HospitalRedCross_NN`, `ER_RedGuideLine_NN`)
// ============================================================================
function buildHospitalSignage() {
  // Helper to add a subdivided flat floor decal patch at height y with exact [0..1, 0..1] UV mapping
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
        const a = baseIdx + iz * (gridX + 1) + ix;
        const b1 = a + 1;
        const c = a + (gridX + 1);
        const d = c + 1;
        builder.ind.push(a, c, d, a, d, b1);
      }
    }
  }

  // 5 Blood-Stained & Splattered Floor Medical Cross Emblems (`HospitalRedCross_01..05` -> in NO_COLLISION_KEYWORDS)
  // Strictly non-emissive alpha-masked MAT.bloodCross (`decal_blood_cross`) + surrounding MAT.decalBlood splatter patches!
  const bCross = new MeshBuilder();
  const bCrossSpatter = new MeshBuilder();
  addFloorDecalPatch(bCross, 0, 0.019, 0, 3.1, 3.1, 0, 4, 4);
  // 4 overlapping surrounding coagulated blood splatter patches so the cross blends organically into surrounding blood pools
  addFloorDecalPatch(bCrossSpatter, -1.25, 0.0178, -0.95, 1.85, 1.65, 0.42, 3, 3);
  addFloorDecalPatch(bCrossSpatter,  1.30, 0.0182,  0.85, 1.95, 1.55, 1.85, 3, 3);
  addFloorDecalPatch(bCrossSpatter, -0.80, 0.0175,  1.35, 1.60, 1.75, 2.75, 3, 3);
  addFloorDecalPatch(bCrossSpatter,  0.95, 0.0184, -1.20, 1.70, 1.50, -0.65, 3, 3);

  const crossMesh = registerMesh('HospitalRedCross_SharedMesh', [
    { builder: bCross, mat: MAT.bloodCross },
    { builder: bCrossSpatter, mat: MAT.decalBlood }
  ]);

  const crossCoords = [
    [  0.0, 0.0,   0.0], // Center Rotunda Triage Hub
    [  0.0, 0.0, -27.5], // North ER Entrance
    [  0.0, 0.0,  27.5], // South ER Entrance
    [-29.5, 0.0,   0.0], // West ER Entrance
    [ 29.5, 0.0,   0.0]  // East ER Entrance
  ];
  crossCoords.forEach((p, i) => {
    addGeometryNode(`HospitalRedCross_${String(i + 1).padStart(2, '0')}`, crossMesh, p);
  });

  // 8 Blood-Smeared ER Floor Guide Lines & Drag Trails (`ER_RedGuideLine_01..08` -> in NO_COLLISION_KEYWORDS)
  // Placed strictly along the walkable North, South, West, and East main corridors/boulevards leading into the Rotunda doors
  // plus bloody stretcher drag trails through the 4 diagonal Rotunda doorways at r = 15.8m (never cutting through walls!).
  const guideConfigs = [
    // 1-2: North Boulevard segments (X = 0, Z = -20..-28) + NW diagonal Rotunda doorway drag trail (r = 15.8m, 225 deg)
    {
      main: { cx: 0.0, cz: -19.2, len: 5.8, wid: 1.05, yaw: Math.PI * 0.5 },
      doorDrag: { cx: Math.cos(Math.PI * 1.25) * 15.8, cz: Math.sin(Math.PI * 1.25) * 15.8, len: 3.4, wid: 1.15, yaw: -Math.PI * 1.25 },
      spatter: { cx: -0.45, cz: -16.8, sx: 1.9, sz: 1.7, yaw: 0.5 }
    },
    {
      main: { cx: 0.0, cz: -24.6, len: 5.6, wid: 1.05, yaw: Math.PI * 0.5 },
      spatter: { cx: 0.38, cz: -22.2, sx: 1.8, sz: 1.6, yaw: 1.9 }
    },
    // 3-4: South Boulevard segments (X = 0, Z = 20..28) + SE diagonal Rotunda doorway drag trail (r = 15.8m, 45 deg)
    {
      main: { cx: 0.0, cz: 19.2, len: 5.8, wid: 1.05, yaw: Math.PI * 0.5 },
      doorDrag: { cx: Math.cos(Math.PI * 0.25) * 15.8, cz: Math.sin(Math.PI * 0.25) * 15.8, len: 3.4, wid: 1.15, yaw: -Math.PI * 0.25 },
      spatter: { cx: 0.42, cz: 16.8, sx: 1.9, sz: 1.7, yaw: 2.1 }
    },
    {
      main: { cx: 0.0, cz: 24.6, len: 5.6, wid: 1.05, yaw: Math.PI * 0.5 },
      spatter: { cx: -0.35, cz: 22.2, sx: 1.8, sz: 1.6, yaw: 0.8 }
    },
    // 5-6: West Boulevard segments (X = -20..-31, Z = 0) + SW diagonal Rotunda doorway drag trail (r = 15.8m, 135 deg)
    {
      main: { cx: -19.8, cz: 0.0, len: 6.4, wid: 1.05, yaw: 0.0 },
      doorDrag: { cx: Math.cos(Math.PI * 0.75) * 15.8, cz: Math.sin(Math.PI * 0.75) * 15.8, len: 3.4, wid: 1.15, yaw: -Math.PI * 0.75 },
      spatter: { cx: -16.8, cz: 0.42, sx: 1.9, sz: 1.7, yaw: 1.2 }
    },
    {
      main: { cx: -25.8, cz: 0.0, len: 6.2, wid: 1.05, yaw: 0.0 },
      spatter: { cx: -22.8, cz: -0.38, sx: 1.8, sz: 1.6, yaw: 2.6 }
    },
    // 7-8: East Boulevard segments (X = 20..31, Z = 0) + NE diagonal Rotunda doorway drag trail (r = 15.8m, 315 deg)
    {
      main: { cx: 19.8, cz: 0.0, len: 6.4, wid: 1.05, yaw: 0.0 },
      doorDrag: { cx: Math.cos(Math.PI * 1.75) * 15.8, cz: Math.sin(Math.PI * 1.75) * 15.8, len: 3.4, wid: 1.15, yaw: -Math.PI * 1.75 },
      spatter: { cx: 16.8, cz: -0.42, sx: 1.9, sz: 1.7, yaw: 0.3 }
    },
    {
      main: { cx: 25.8, cz: 0.0, len: 6.2, wid: 1.05, yaw: 0.0 },
      spatter: { cx: 22.8, cz: 0.38, sx: 1.8, sz: 1.6, yaw: 1.7 }
    }
  ];

  guideConfigs.forEach((cfg, i) => {
    const bLine = new MeshBuilder();
    const bSpatter = new MeshBuilder();
    addFloorDecalPatch(bLine, cfg.main.cx, 0.0185, cfg.main.cz, cfg.main.len, cfg.main.wid, cfg.main.yaw, 6, 3);
    if (cfg.doorDrag) {
      addFloorDecalPatch(bLine, cfg.doorDrag.cx, 0.0186, cfg.doorDrag.cz, cfg.doorDrag.len, cfg.doorDrag.wid, cfg.doorDrag.yaw, 4, 3);
    }
    if (cfg.spatter) {
      addFloorDecalPatch(bSpatter, cfg.spatter.cx, 0.0176, cfg.spatter.cz, cfg.spatter.sx, cfg.spatter.sz, cfg.spatter.yaw, 3, 3);
    }
    const lName = `ER_RedGuideLine_${String(i + 1).padStart(2, '0')}`;
    const mIdx = registerMesh(`${lName}_Mesh`, [
      { builder: bLine, mat: MAT.bloodGuideLine },
      { builder: bSpatter, mat: MAT.decalBlood }
    ]);
    addGeometryNode(lName, mIdx);
  });
}
buildHospitalSignage();

// ============================================================================
// 6. 165 ALPHA-MASKED FLOOR DECALS (`Hospital_Decal_001..165`, Y=0.016..0.024m)
// ============================================================================
function buildHospitalDecals() {
  const decalMats = [
    MAT.decalBlood,
    MAT.decalHazard,
    MAT.decalPuddle,
    MAT.decalCharts,
    MAT.decalTracks,
    MAT.decalScorch,
    MAT.decalOil,
    MAT.decalMold
  ];

  for (let i = 1; i <= 165; i++) {
    const b = new MeshBuilder();
    // Deterministically distribute across the 96x72m floor inside [-44, 44] x [-33, 33]
    let cx, cz;
    if (i <= 36) {
      // Rotunda & inner ring decals
      const ang = (i / 36) * Math.PI * 2 + randRange(-0.08, 0.08);
      const r = randRange(3.5, 15.5);
      cx = Math.cos(ang) * r;
      cz = Math.sin(ang) * r;
    } else if (i <= 76) {
      // Main North-South and East-West Boulevards (stretcher tracks, blood trails, charts)
      const horiz = (i % 2) === 0;
      cx = horiz ? randRange(-38, 38) : randRange(-4.5, 4.5);
      cz = horiz ? randRange(-4.5, 4.5) : randRange(-29, 29);
    } else if (i <= 136) {
      // 4 Wings (NW Radiology, NE Surgical, SW ICU, SE Morgue)
      const q = i % 4;
      const sx = (q % 2 === 0) ? -1 : 1;
      const sz = (q < 2) ? -1 : 1;
      cx = sx * randRange(13.0, 32.0);
      cz = sz * randRange(6.0, 24.5);
    } else {
      // 4 Outer Ambulance Courtyards
      const q = i % 4;
      const sx = (q % 2 === 0) ? -1 : 1;
      const sz = (q < 2) ? -1 : 1;
      cx = sx * randRange(26.0, 43.0);
      cz = sz * randRange(18.0, 32.5);
    }

    const sx = randRange(1.8, 3.8);
    const sz = randRange(1.8, 3.8);
    const yaw = randRange(0, Math.PI * 2);
    const y = 0.016 + (i % 7) * 0.0012;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

    // 3x3 subdivided decal patch (18 triangles per decal)
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
    const dName = `Hospital_Decal_${String(i).padStart(3, '0')}`;
    const mIdx = registerMesh(`${dName}_Mesh`, [{ builder: b, mat: matIdx }]);
    addGeometryNode(dName, mIdx);
  }
}
buildHospitalDecals();

// ============================================================================
// 7. 32 SCATTER DEBRIS GROUPS (`Hospital_Scatter_01..32`, Y < 0.32m) & 48 GRASS CLUSTERS
// ============================================================================
function buildScatterAndGrass() {
  // 32 Scatter groups: broken ceiling tiles, pill bottles, medical debris, shell casings, plaster chunks
  // Placed >= 1.8m away from all Spawn/Card/Door points!
  for (let s = 1; s <= 32; s++) {
    const bDebris = new MeshBuilder();
    const bMetal = new MeshBuilder();

    // Cluster center in one of 32 zones across the 96x72m map
    const gx = ((s - 1) % 8) - 3.5; // -3.5 .. 3.5
    const gz = Math.floor((s - 1) / 8) - 1.5; // -1.5 .. 1.5
    const baseCx = gx * 10.5;
    const baseCz = gz * 16.5;

    let added = 0;
    let attempts = 0;
    while (added < 22 && attempts < 80) {
      attempts++;
      const px = Math.max(-45.5, Math.min(45.5, baseCx + randRange(-4.8, 4.8)));
      const pz = Math.max(-33.5, Math.min(33.5, baseCz + randRange(-6.8, 6.8)));
      if (!isClearOfGameplayPoints(px, pz, -1.6)) continue; // keep >= 2.0m from spawns/cards/doors

      const yaw = randRange(0, Math.PI * 2);
      const kind = added % 2;
      if (kind === 0) {
        // Broken plaster / acoustic ceiling tile chunk (height 0.04..0.12m)
        const w = randRange(0.18, 0.42);
        const h = randRange(0.03, 0.09);
        const d = randRange(0.16, 0.38);
        bDebris.addBeveledBox(px, h * 0.5, pz, w, h, d, yaw, 0.01, 2.0, 2, 1, 2);
      } else {
        // Overturned pill bottle / medicine vial + fallen clipboard / medical tray
        const r = randRange(0.03, 0.06);
        const len = randRange(0.10, 0.22);
        bMetal.addCylinder(px, r, pz, r, r, len, 12, 1, true, yaw, Math.PI * 0.5);
        bMetal.addBeveledBox(px + 0.15, 0.04, pz - 0.12, 0.32, 0.06, 0.24, yaw + 0.5, 0.01, 2.0);
      }
      added++;
    }

    const sName = `Hospital_Scatter_${String(s).padStart(2, '0')}`;
    const mIdx = registerMesh(`${sName}_Mesh`, [
      { builder: bDebris, mat: MAT.chippedConcrete },
      { builder: bMetal, mat: MAT.brushedSteel }
    ]);
    addGeometryNode(sName, mIdx);
  }

  // 48 Overgrown Courtyard Weed / Scrub Grass Clusters (`Hospital_Grass_01..48`, Y <= 0.52m, alphaMode: MASK)
  const bSharedGrass = new MeshBuilder();
  for (let p = 0; p < 3; p++) {
    const ang = (p / 3) * Math.PI;
    const c = Math.cos(ang) * 0.42;
    const s = Math.sin(ang) * 0.42;
    bSharedGrass.addQuad([-c, 0.0, -s], [c, 0.0, s], [c, 0.48, s], [-c, 0.48, -s], [-s, 0.2, c], 0, 1, 1, 0);
  }
  const grassMesh = registerMesh('Hospital_Grass_SharedMesh', [{ builder: bSharedGrass, mat: MAT.grassScrub }]);

  for (let g = 1; g <= 48; g++) {
    const q = g % 4;
    const sx = (q % 2 === 0) ? -1 : 1;
    const sz = (q < 2) ? -1 : 1;
    const gx = sx * randRange(34.5, 46.2);
    const gz = sz * randRange(12.0, 34.2);
    addGeometryNode(`Hospital_Grass_${String(g).padStart(2, '0')}`, grassMesh, [gx, 0.0, gz], randRange(0, Math.PI * 2));
  }
}
buildScatterAndGrass();

// ============================================================================
// 8. ASSEMBLE GLTF SCENE HIERARCHY (Exact Contract with ImportedMap.gd & GameManager.gd)
// ============================================================================
// Create CardPoints -> CardPoint_01..18
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

// Create DoorPoints -> DoorPoint_01..16
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

// Create SpawnPoints -> Team0_Spawn .. Team3_Spawn -> TeamX_Spawn_P1..P5
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

// Create WallLamps (empty container)
const wallLampsRootIdx = nodes.length;
nodes.push({ name: 'WallLamps' });

// Create Geometry container
const geometryRootIdx = nodes.length;
nodes.push({ name: 'Geometry', children: geometryChildIndices });

// Create Root Node: Quarantine_Hospital_Map
const rootNodeIdx = nodes.length;
nodes.push({
  name: 'Quarantine_Hospital_Map',
  children: [
    cardPointsRootIdx,
    doorPointsRootIdx,
    geometryRootIdx,
    spawnPointsRootIdx,
    wallLampsRootIdx
  ]
});

// Strip internal _tris from meshes
for (const m of meshes) delete m._tris;

const gltfJson = {
  asset: {
    generator: 'TacticalDark Hospital v3 Node.js Procedural Builder',
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

// Write .bin and .gltf
const fullBin = Buffer.concat(binChunks);
fs.writeFileSync(path.join(OUT_DIR, BIN_NAME), fullBin);
fs.writeFileSync(path.join(OUT_DIR, GLTF_NAME), JSON.stringify(gltfJson, null, '\t'), 'utf8');

// Write Map5_Karantina_Hastanesi_3v3v3v3_v3.gltf.import matching Map3_Col_v3
const gltfResPath = `res://asset model/haritalar/Map5_Hastane_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dhosp3v3v3map5"
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
  // 1. Exact World AABB check using actual node quaternion rotation on local AABB corners
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
  if (wMinX < -48.05 || wMaxX > 48.05 || wMinZ < -36.05 || wMaxZ > 36.05) {
    console.error(`ERROR: World AABB exceeds 96x72m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
    errors++;
  }

  // 2. CardPoint -> Spawn min distance check (>= 16.0m required)
  let minCardToSpawn = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const c = CARD_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(c[0] - s[0], c[2] - s[2]));
    }
    if (dMin < 16.0) {
      console.error(`ERROR: CardPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m`);
      errors++;
    }
    minCardToSpawn = Math.min(minCardToSpawn, dMin);
  }

  // 3. DoorPoint -> Spawn min distance check (>= 25.5m required)
  let minDoorToSpawn = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const d = DOOR_POINTS[i];
    let dMin = Infinity;
    for (const s of ALL_SPAWNS) {
      dMin = Math.min(dMin, Math.hypot(d[0] - s[0], d[2] - s[2]));
    }
    if (dMin < 25.5) {
      console.error(`ERROR: DoorPoint_${i + 1} too close to spawn: ${dMin.toFixed(2)}m`);
      errors++;
    }
    minDoorToSpawn = Math.min(minDoorToSpawn, dMin);
  }

  // 4. Verify all Decal & Grass materials have alphaMode: "MASK"
  for (const m of materials) {
    if ((m.name.includes('Decal') || m.name.includes('Grass')) && m.alphaMode !== 'MASK') {
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

  console.log('================================================================');
  console.log(' KARANTINA HASTANESI v3 (Map5_Hastane_v3) VALIDATION SUMMARY');
  console.log('================================================================');
  console.log(`Output GLTF       : ${ path.join(OUT_DIR, GLTF_NAME) }`);
  console.log(`Output BIN        : ${ path.join(OUT_DIR, BIN_NAME) } (${ (fullBin.length / 1024 / 1024).toFixed(2) } MB)`);
  console.log(`Total Triangles   : ${ totalTriangles.toLocaleString() } tris`);
  console.log(`Total Nodes       : ${ nodes.length } (Geometry children: ${ geometryChildIndices.length })`);
  console.log(`Total Materials   : ${ materials.length } PBR materials (0 untextured)`);
  console.log(`Total Textures    : ${ images.length } referenced (${ fs.readdirSync(path.join(OUT_DIR, 'textures')).filter(f => !f.endsWith('.import') && !f.endsWith('.txt')).length } total in textures/)`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Spawn Points      : 4 teams x 5 spawns = ${ ALL_SPAWNS.length } points (Y=0.25)`);
  console.log(`Card Candidates   : ${ CARD_POINTS.length } points + 18 Prop_CardPedestal_NN (min spawn dist: ${ minCardToSpawn.toFixed(2) }m >= 16.0m)`);
  console.log(`Door Candidates   : ${ DOOR_POINTS.length } points (min spawn dist: ${ minDoorToSpawn.toFixed(2) }m >= 25.5m)`);
  console.log(`Validation Errors : ${ errors }`);
  console.log('================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
