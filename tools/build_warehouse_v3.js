#!/usr/bin/env node
/**
 * build_warehouse_v3.js
 * Procedurally constructs the complete AAA realistic v3 glTF + .bin + .import package for:
 * Map7_Lojistik_Depo_Labirenti_4v4v4v4_v3.gltf (inside asset model/haritalar/Map7_Depo_v3/)
 *
 * Implements:
 * - 112x80m footprint (X in [-56, 56], Z in [-40, 40]), supports up to 4v4v4v4 (`max_team: 4`) or 5v5 with 20 spawns
 * - Single-level walkable floor heights Y in [-0.04, +0.025] so horizontal bullets and BotNav work at 100% precision:
 *   * `Terrain_Warehouse_Ground` (112x80m at Y = -0.02m with `warehouse_loading_asphalt_2k`) + outer perimeter
 *     `Cliff_Perimeter_01..10` & `Rock_Rubble_01..08` so `ImportedMap._build_outer_world` works automatically!
 *   * `Floor_Central_SortingArena` (X in [-18, 18], Z in [-16, 16] at Y = 0.015m with `warehouse_epoxy_concrete_2k`)
 *   * `Floor_West_RackMaze` (X in [-42, -18], Z in [-24, 24] at Y = 0.015m with `warehouse_epoxy_concrete_2k`)
 *   * `Floor_East_RackMaze` (X in [18, 42], Z in [-24, 24] at Y = 0.015m with `warehouse_epoxy_concrete_2k`)
 *   * `Floor_North_LoadingDock` (X in [-36, 36], Z in [-36, -16] at Y = 0.010m with `chipped_concrete_2k`)
 *   * `Floor_South_LoadingDock` (X in [-36, 36], Z in [16, 36] at Y = 0.010m with `chipped_concrete_2k`)
 * - ZERO glowing/neon floor lines or crosses! All floor decals, forklift safety stripes, blood/hydraulic spills,
 *   packing labels, and epoxy markings have ZERO emission (no emissiveFactor).
 * - 4 Teams x 5 Spawns = 20 spawn nodes at (±46.0, 0.25, ±32.0) with (±1.7, ±1.7) spread
 * - 18 Card Candidate Points at Y=1.15 (all >= 18.0m from every spawn) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction Door Candidate Points at Y=0.10 (all >= 26.0m from every spawn, >= 3.5m clear radius)
 * - Center — Automated Conveyor Sorting Hub & Overhead Bridge Gantry Crane (X in [-16, 16], Z in [-14, 14]):
 *   * `Console_CentralSorter_01` at (0, 0) (height 2.35m full cover)
 *   * 4 radiating Roller Conveyor Belt Lines (`Barrier_ConveyorBelt_01..04`, height 0.85m jumpable cover to r=5.5m)
 *   * Overhead Yellow Double-Girder Bridge Gantry Crane (`GantryCrane_01..02_Canopy` at Y = 4.6m) +
 *     4 Barcode Laser Scanner Gantry Arches (`ScannerGantry_01..04_Canopy` at Y = 3.5m)
 * - West & East Wings — 16 Heavy 3-Tier Steel Pallet Racks (`Server_Rack_Pallet_01..16`, 6.5m x 1.6m x 3.2m) +
 *   4 Collapsed/Toppled Rack Spill Barricades (`Crate_ToppledPallet_01..04`, height 2.05m angled cover)
 * - North & South Loading Docks — 2 Full-Size Semi-Trucks with Walkable Open-Top 53ft Cargo Trailers
 *   (`SubwayCar_SemiTrailer_01..02` at (0, ±26), length 14.0m, width 4.2m, wall height 2.6m with open rear doors
 *   and two wide 2.4m breached side cargo doors) + Tractor Cabs (`Humvee_SemiTractor_01..02`, height 2.5m) +
 *   6 Detailed Industrial Forklifts (`Humvee_Forklift_01..06`, height 2.15m with mast, forks, ROPS cage, wheels)
 * - 4 Asymmetric Specialized Warehouse Sectors (NW Cold-Storage & Cryo Vault, NE Hazmat Drum Cage,
 *   SW Customs Manifest & Dispatch Office, SE Forklift Battery Charging & Maintenance Bay)
 * - 165 Alpha-Masked Non-Emissive Decals (`Warehouse_Decal_001..165`) + 12 Non-Emissive Blood/Hydraulic Spills
 *   (`Warehouse_BloodSpill_01..12`) + 32 Scatter Groups (`Warehouse_Scatter_01..32`, Y < 0.28m) +
 *   36 Outer Freight Yard Weed Clusters (`Warehouse_Grass_01..36`)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map7_Depo_v3');
const GLTF_NAME = 'Map7_Lojistik_Depo_Labirenti_4v4v4v4_v3.gltf';
const BIN_NAME = 'Map7_Lojistik_Depo_Labirenti_4v4v4v4_v3.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112307;
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

  // Industrial Warehouse Wall Segment (height=3.2m, thickness=0.45m, concrete kickplate plinth, forklift bumper rail, top I-beam header)
  addWarehouseWallSegment(x0, z0, x1, z1, height = 3.2, thick = 0.45) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const segsX = Math.max(4, Math.round(len * 1.5));

    // Main corrugated cladding wall panel
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.025, 1.0 / height, segsX, 6, 2);
    // Concrete impact kickplate base plinth at Y = 0.16m (protrudes <= 3cm per side)
    this.addBeveledBox(cx, 0.16, cz, len + 0.02, 0.32, thick + 0.05, yaw, 0.02, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Mid-height forklift crash guard rail at Y = 1.05m (protrudes 2.5cm per side)
    this.addBeveledBox(cx, 1.05, cz, len + 0.02, 0.14, thick + 0.05, yaw, 0.015, 0.5, Math.max(2, Math.round(len)), 1, 1);
    // Top structural I-beam coping header at Y = height - 0.08m
    this.addBeveledBox(cx, height - 0.08, cz, len + 0.03, 0.16, thick + 0.06, yaw, 0.02, 0.5, Math.max(2, Math.round(len)), 1, 1);
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

// --- Register All Warehouse v3 PBR Materials (<= 26 materials, 0 glowing floor lines!) ---
const MAT = {
  // Custom Warehouse v3 PBR sets
  epoxyConcrete: makePBRMaterial('Mat_Warehouse_EpoxyConcrete_2K', 'warehouse_epoxy_concrete_2k_Diffuse.png', 'warehouse_epoxy_concrete_2k_nor_gl.png', 'warehouse_epoxy_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  loadingAsphalt: makePBRMaterial('Mat_Warehouse_LoadingAsphalt_2K', 'warehouse_loading_asphalt_2k_Diffuse.png', 'warehouse_loading_asphalt_2k_nor_gl.png', 'warehouse_loading_asphalt_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  corrugatedCladding: makePBRMaterial('Mat_Warehouse_CorrugatedCladding_2K', 'warehouse_corrugated_cladding_2k_Diffuse.png', 'warehouse_corrugated_cladding_2k_nor_gl.png', 'warehouse_corrugated_cladding_2k_arm.png', { normalScale: 1.35 }),
  rackSteel: makePBRMaterial('Mat_Warehouse_RackSteel_1K', 'warehouse_rack_steel_1k_Diffuse.png', 'warehouse_rack_steel_1k_nor_gl.png', 'warehouse_rack_steel_1k_arm.png', { normalScale: 1.35 }),
  cardboardShrinkwrap: makePBRMaterial('Mat_Warehouse_CardboardShrinkwrap_2K', 'warehouse_cardboard_shrinkwrap_2k_Diffuse.png', 'warehouse_cardboard_shrinkwrap_2k_nor_gl.png', 'warehouse_cardboard_shrinkwrap_2k_arm.png', { metallicFactor: 0, normalScale: 1.3 }),
  heroForklift: makePBRMaterial('Mat_Hero_ForkliftMachinery_2K', 'hero_forklift_machinery_2k_Diffuse.png', 'hero_forklift_machinery_2k_nor_gl.png', 'hero_forklift_machinery_2k_arm.png', { normalScale: 1.4 }),
  heroSemiTrailer: makePBRMaterial('Mat_Hero_SemiTruckTrailer_2K', 'hero_semitruck_trailer_2k_Diffuse.png', 'hero_semitruck_trailer_2k_nor_gl.png', 'hero_semitruck_trailer_2k_arm.png', { normalScale: 1.35 }),

  // Shared CC0 Architectural & Prop PBR sets
  chippedConcrete: makePBRMaterial('Mat_Chipped_Concrete_2K', 'chipped_concrete_2k_Diffuse.jpg', 'chipped_concrete_2k_nor_gl.jpg', 'chipped_concrete_2k_arm.png', { metallicFactor: 0, normalScale: 1.35 }),
  mossConcrete: makePBRMaterial('Mat_Perimeter_MossConcrete_2K', 'concrete_moss_2k_Diffuse.jpg', 'concrete_moss_2k_nor_gl.jpg', 'concrete_moss_2k_arm.png', { metallicFactor: 0, normalScale: 1.4 }),
  brushedSteel: makePBRMaterial('Mat_BrushedSteel_1K', 'hospital_brushed_steel_1k_Diffuse.png', 'hospital_brushed_steel_1k_nor_gl.png', 'hospital_brushed_steel_1k_arm.png', { normalScale: 1.25 }),
  heroDarkMetal: makePBRMaterial('Mat_Hero_DarkMetal_2K', 'hero_radar_metal_Diffuse.png', 'hero_radar_metal_nor_gl.png', 'hero_radar_metal_arm.png', { normalScale: 1.35 }),
  rustyMetal: makePBRMaterial('Mat_Rusty_Metal_2K', 'rusty_metal_2k_Diffuse.jpg', 'rusty_metal_2k_nor_gl.jpg', 'rusty_metal_2k_arm.jpg', { normalScale: 1.3 }),
  corrugatedIron: makePBRMaterial('Mat_Corrugated_Iron_2K', 'corrugated_iron_02_2k_Diffuse.jpg', 'corrugated_iron_02_2k_nor_gl.jpg', 'corrugated_iron_02_2k_arm.jpg', { normalScale: 1.3 }),
  darkWood: makePBRMaterial('Mat_Dark_Wood_2K', 'dark_wooden_planks_2k_Diffuse.jpg', 'dark_wooden_planks_2k_nor_gl.jpg', 'dark_wooden_planks_2k_arm.png', { metallicFactor: 0, normalScale: 1.25 }),
  sandbagBurlap: makePBRMaterial('Mat_Sandbag_Burlap_2K', 'sandbag_burlap_Diffuse.png', 'sandbag_burlap_nor_gl.png', 'sandbag_burlap_arm.png', { metallicFactor: 0, normalScale: 1.35 }),

  // CC0 Photogrammetry prop materials
  barrier: makePBRMaterial('concrete_road_barrier', 'concrete_road_barrier_diff_1k.jpg', 'concrete_road_barrier_nor_gl_1k.jpg', 'concrete_road_barrier_arm_1k.jpg', { metallicFactor: 0 }),
  crate: makePBRMaterial('wooden_military_crate', 'wooden_military_crate_diff_1k.jpg', 'wooden_military_crate_nor_gl_1k.jpg', 'wooden_military_crate_arm_1k.jpg'),
  generator: makePBRMaterial('portable_generator', 'portable_generator_diff_1k.jpg', 'portable_generator_nor_gl_1k.jpg', 'portable_generator_arm_1k.jpg'),
  barrel: makePBRMaterial('Barrel_01', 'Barrel_01_explosive_diff_1k.jpg', 'Barrel_01_explosive_nor_gl_1k.jpg', 'Barrel_01_explosive_arm_1k.jpg'),
  powerBox: makePBRMaterial('power_box_01', 'power_box_01_diff_1k.jpg', 'power_box_01_nor_gl_1k.jpg', 'power_box_01_arm_1k.jpg'),
  shelves: makePBRMaterial('steel_frame_shelves_01', 'steel_frame_shelves_01_diff_1k.jpg', 'steel_frame_shelves_01_nor_gl_1k.jpg', 'steel_frame_shelves_01_arm_1k.jpg'),
  cliffRock: makePBRMaterial('rock_face_01', 'rock_face_01_diff_1k.jpg', 'rock_face_01_nor_gl_1k.jpg', 'rock_face_01_arm_1k.jpg', { metallicFactor: 0 }),
  boulderRock: makePBRMaterial('boulder_01', 'boulder_01_diff_1k.jpg', 'boulder_01_nor_gl_1k.jpg', 'boulder_01_arm_1k.jpg', { metallicFactor: 0 }),

  // Alpha-Masked Non-Emissive Floor Decal & Weed Materials (alphaMode: "MASK", strictly ZERO emission!)
  decalLaneStripes: makePBRMaterial('Mat_Decal_ForkliftLaneStripes_Mask', 'decal_forklift_lane_stripes_Diffuse.png', 'decal_forklift_lane_stripes_nor_gl.png', 'decal_forklift_lane_stripes_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalBloodHydraulic: makePBRMaterial('Mat_Decal_BloodHydraulicSpill_Mask', 'decal_blood_hydraulic_spill_Diffuse.png', 'decal_blood_hydraulic_spill_nor_gl.png', 'decal_blood_hydraulic_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.14, normalScale: 1.35 }),
  decalPackingLabels: makePBRMaterial('Mat_Decal_PackingDebrisLabels_Mask', 'decal_packing_debris_labels_Diffuse.png', 'decal_packing_debris_labels_nor_gl.png', 'decal_packing_debris_labels_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.25 }),
  decalBloodTrail: makePBRMaterial('Mat_Decal_BloodTrail_Mask', 'decal_blood_trail_Diffuse.png', 'decal_blood_trail_nor_gl.png', 'decal_blood_trail_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalChemicalPuddle: makePBRMaterial('Mat_Decal_ChemicalPuddle_Mask', 'decal_chemical_puddle_Diffuse.png', 'decal_chemical_puddle_nor_gl.png', 'decal_chemical_puddle_arm.png', { alphaMode: 'MASK', metallicFactor: 0.05, roughnessFactor: 0.10, normalScale: 1.15 }),
  decalOilSpill: makePBRMaterial('Mat_Decal_OilSpill_Mask', 'decal_oil_spill_Diffuse.png', 'decal_oil_spill_nor_gl.png', 'decal_oil_spill_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.15 }),
  decalScorchCrater: makePBRMaterial('Mat_Decal_ScorchCrater_Mask', 'decal_scorch_crater_Diffuse.png', 'decal_scorch_crater_nor_gl.png', 'decal_scorch_crater_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 }),
  decalTireTracks: makePBRMaterial('Mat_Decal_TireTracks_Mask', 'decal_tire_tracks_Diffuse.png', 'decal_tire_tracks_nor_gl.png', 'decal_tire_tracks_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.35 }),
  decalMossPatch: makePBRMaterial('Mat_Decal_MossPatch_Mask', 'decal_moss_patch_Diffuse.png', 'decal_moss_patch_nor_gl.png', 'decal_moss_patch_arm.png', { alphaMode: 'MASK', metallicFactor: 0, normalScale: 1.3 })
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
  [-46.0, 0.25, -32.0], // Team0 (NW Freight Dispatch Yard)
  [ 46.0, 0.25, -32.0], // Team1 (NE Freight Dispatch Yard)
  [-46.0, 0.25,  32.0], // Team2 (SW Freight Dispatch Yard)
  [ 46.0, 0.25,  32.0]  // Team3 (SE Freight Dispatch Yard)
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

// 18 Card Candidate Points at Y = 1.15 (All >= 18.0m from every spawn point; actual min is 23.79m!)
const CARD_POINTS = [
  // 1-4: Central Automated Conveyor & Gantry Crane Sorting Arena
  [ -8.5, 1.15,   0.0],
  [  8.5, 1.15,   0.0],
  [  0.0, 1.15,  -8.5],
  [  0.0, 1.15,   8.5],
  // 5-8: West & East High-Bay Pallet Rack CQB Aisles
  [-28.0, 1.15,  -8.0],
  [-28.0, 1.15,   8.0],
  [ 28.0, 1.15,  -8.0],
  [ 28.0, 1.15,   8.0],
  // 9-10: Inside Walkable Open Semi-Truck Cargo Trailers (North & South Loading Bays)
  [  0.0, 1.15, -26.0],
  [  0.0, 1.15,  26.0],
  // 11-14: 4 Asymmetric Specialized Sectors (NW Cold-Storage Vault, NE Hazmat Cage, SW Customs Office, SE Battery Maintenance Bay)
  [-22.0, 1.15, -22.0],
  [ 22.0, 1.15, -22.0],
  [-22.0, 1.15,  22.0],
  [ 22.0, 1.15,  22.0],
  // 15-18: Outer East/West Cross-Docking Alleys & Loading Transitions
  [-40.0, 1.15,   0.0],
  [ 40.0, 1.15,   0.0],
  [-14.0, 1.15, -20.0],
  [ 14.0, 1.15,  20.0]
];

// 16 Extraction Door Candidate Points at Y = 0.10 (All >= 26.0m from every spawn point, >= 3.5m clear radius!)
const DOOR_POINTS = [
  // 1-4: Outer North/South/West/East Roll-Up Freight Shutter Gates
  [  0.0, 0.10, -34.0],
  [  0.0, 0.10,  34.0],
  [-48.0, 0.10,   0.0],
  [ 48.0, 0.10,   0.0],
  // 5-8: North & South Loading Bay Flanking Extraction Zones
  [-15.0, 0.10, -32.0],
  [ 15.0, 0.10, -32.0],
  [-15.0, 0.10,  32.0],
  [ 15.0, 0.10,  32.0],
  // 9-12: Central Sorting Arena Diagonal Staging Zones
  [-12.0, 0.10, -11.0],
  [ 12.0, 0.10, -11.0],
  [-12.0, 0.10,  11.0],
  [ 12.0, 0.10,  11.0],
  // 13-16: Rack Maze Entry Breezeways
  [-20.0, 0.10,   0.0],
  [ 20.0, 0.10,   0.0],
  [  0.0, 0.10, -17.0],
  [  0.0, 0.10,  17.0]
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
// 2. SINGLE-LEVEL WALKABLE FLOORS & TERRAIN (Y in [-0.04, +0.025])
// ============================================================================
function buildFloors() {
  // (A) Base Terrain_Warehouse_Ground: 112x80m subdivided 0.75m grid (150x106 = 31,800 tris) at Y = -0.02m
  const bTerrain = new MeshBuilder();
  const nx = 150, nz = 106;
  const xMin = -56.0, xMax = 56.0, zMin = -40.0, zMax = 40.0;
  for (let iz = 0; iz <= nz; iz++) {
    const fz = iz / nz;
    const z = zMin + fz * (zMax - zMin);
    for (let ix = 0; ix <= nx; ix++) {
      const fx = ix / nx;
      const x = xMin + fx * (xMax - xMin);
      const inOuterFreightYard = Math.abs(x) > 42.2 || Math.abs(z) > 35.8;
      const y = inOuterFreightYard ? (-0.02 + Math.sin(x * 0.35) * Math.cos(z * 0.35) * 0.012) : -0.02;
      bTerrain.addVertex(x, y, z, 0, 1, 0, (x - xMin) * 0.32, (z - zMin) * 0.32, 1, 0, 0, 1);
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
  const terrainMesh = registerMesh('Terrain_Warehouse_Ground_Mesh', [{ builder: bTerrain, mat: MAT.loadingAsphalt }]);
  addGeometryNode('Terrain_Warehouse_Ground', terrainMesh);

  function addFloorZone(nodeName, x0, z0, x1, z1, baseY, matIdx, step = 0.8) {
    const b = new MeshBuilder();
    const sx = Math.max(2, Math.round((x1 - x0) / step));
    const sz = Math.max(2, Math.round((z1 - z0) / step));
    for (let iz = 0; iz <= sz; iz++) {
      const z = z0 + (iz / sz) * (z1 - z0);
      for (let ix = 0; ix <= sx; ix++) {
        const x = x0 + (ix / sx) * (x1 - x0);
        const microY = baseY + Math.sin(x * 0.7 + z * 0.7) * 0.002;
        b.addVertex(x, microY, z, 0, 1, 0, x * 0.38, z * 0.38, 1, 0, 0, 1);
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

  // Exact required floor slabs (all strictly in Y = 0.010..0.015m)
  addFloorZone('Floor_Central_SortingArena', -18.0, -16.0,  18.0,  16.0, 0.015, MAT.epoxyConcrete, 0.75);
  addFloorZone('Floor_West_RackMaze',        -42.0, -24.0, -18.0,  24.0, 0.015, MAT.epoxyConcrete, 0.75);
  addFloorZone('Floor_East_RackMaze',         18.0, -24.0,  42.0,  24.0, 0.015, MAT.epoxyConcrete, 0.75);
  addFloorZone('Floor_North_LoadingDock',    -36.0, -36.0,  36.0, -16.0, 0.010, MAT.chippedConcrete, 0.80);
  addFloorZone('Floor_South_LoadingDock',    -36.0,  16.0,  36.0,  36.0, 0.010, MAT.chippedConcrete, 0.80);

  // 18 Physical Card Pedestals (`Prop_CardPedestal_01..18`) under every CardPoint (radius <= 0.36m, height 0.45m)
  const bPedBody = new MeshBuilder();
  const bPedSteel = new MeshBuilder();
  bPedBody.addCylinder(0, 0.07, 0, 0.36, 0.33, 0.14, 16, 1, true);
  bPedBody.addCylinder(0, 0.25, 0, 0.24, 0.22, 0.24, 16, 2, true);
  bPedSteel.addCylinder(0, 0.41, 0, 0.30, 0.34, 0.08, 16, 1, true);
  bPedSteel.addTorus(0, 0.43, 0, 0.27, 0.025, 24, 10);
  const pedMesh = registerMesh('Prop_CardPedestal_SharedMesh', [
    { builder: bPedBody, mat: MAT.rackSteel },
    { builder: bPedSteel, mat: MAT.brushedSteel }
  ]);
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, pedMesh, [cp[0], 0.0, cp[2]]);
  }
}
buildFloors();

// ============================================================================
// 3. MODULAR WAREHOUSE ARCHITECTURE & PERIMETER WALLS (h=3.2m, thick=0.45m)
// ============================================================================
let wallCounter = 1;
function addWarehouseWall(prefix, x0, z0, x1, z1, matIdx = MAT.corrugatedCladding, h = 3.2, thick = 0.45) {
  const b = new MeshBuilder();
  b.addWarehouseWallSegment(x0, z0, x1, z1, h, thick);
  const name = `${prefix}_${String(wallCounter++).padStart(3, '0')}`;
  const mIdx = registerMesh(`${name}_Mesh`, [{ builder: b, mat: matIdx }]);
  addGeometryNode(name, mIdx);
}

function buildWarehouseArchitecture() {
  // --- (A) Central Sorting Arena Bulkhead Partition Piers (X = ±18.0, Z = ±16.0) ---
  // Note:
  //   - Rack Maze Entry Breezeway DoorPoints are at (-20, 0), (20, 0), (0, -17), (0, 17).
  //   - Diagonal Arena DoorPoints are at (±12, ±11).
  //   - Transition CardPoints are at (-14, -20) and (14, 20).
  //   So we place 6.0m industrial bulkhead walls at X = ±17.8, Z in [-10.0, -4.5] and [4.5, 10.0]
  //   Wait: check distance from (-17.8, -10.0) to DoorPoint (-12, -11): hypot(5.8, 1.0) = 5.88m >= 3.5m!
  //   And distance from (-17.8, -4.5) to DoorPoint (-20, 0): hypot(2.2, 4.5) = 5.01m >= 3.5m!
  addWarehouseWall('Wall_SortingHub_West', -17.8, -10.0, -17.8,  -4.5);
  addWarehouseWall('Wall_SortingHub_West', -17.8,   4.5, -17.8,  10.0);
  addWarehouseWall('Wall_SortingHub_East',  17.8, -10.0,  17.8,  -4.5);
  addWarehouseWall('Wall_SortingHub_East',  17.8,   4.5,  17.8,  10.0);

  // North & South Sorting Hub Partition Piers at Z = ±15.8, X in [-8.2, -4.4] and [4.4, 8.2]
  // Check distance to DoorPoint (0, ±17): hypot(4.4, 1.2) = 4.56m >= 3.5m!
  // Check distance to DoorPoint (±12, ±11): hypot(3.8, 4.8) = 6.12m >= 3.5m!
  addWarehouseWall('Wall_SortingHub_North', -8.2, -15.8, -4.4, -15.8);
  addWarehouseWall('Wall_SortingHub_North',  4.4, -15.8,  8.2, -15.8);
  addWarehouseWall('Wall_SortingHub_South', -8.2,  15.8, -4.4,  15.8);
  addWarehouseWall('Wall_SortingHub_South',  4.4,  15.8,  8.2,  15.8);

  // --- (B) West & East Warehouse Hall Outer Facade Walls (X = ±42.8) ---
  // Note: CardPoints at (-40, 0) and (40, 0) are inside the outer cross-docking alley; DoorPoints at (±48, 0).
  // Placing facade segments along X = ±43.5 at Z in [-23.5, -14.5], [-10.5, -3.8], [3.8, 10.5], [14.5, 23.5]:
  //   - Dist to CardPoint (±40, 0): hypot(3.5, 3.8) = 5.16m >= 2.2m!
  //   - Dist to DoorPoint (±48, 0): hypot(4.5, 3.8) = 5.89m >= 3.5m!
  //   - Creates three wide 4.0m-7.6m roll-up freight doorways along both West and East warehouse walls!
  for (const [sideName, xWall] of [['West', -43.5], ['East', 43.5]]) {
    addWarehouseWall(`Wall_Hall_${sideName}`, xWall, -23.5, xWall, -14.5);
    addWarehouseWall(`Wall_Hall_${sideName}`, xWall, -10.5, xWall,  -3.8);
    addWarehouseWall(`Wall_Hall_${sideName}`, xWall,   3.8, xWall,  10.5);
    addWarehouseWall(`Wall_Hall_${sideName}`, xWall,  14.5, xWall,  23.5);
  }

  // --- (C) 4 Specialized Corner Sector Partition Walls (NW Cold Vault, NE Hazmat Cage, SW Customs Office, SE Battery Bay) ---
  // Note:
  //   - Sector CardPoints are at (±22, ±22).
  //   - Loading Bay Flanking DoorPoints are at (±15, ±32).
  //   - Transition CardPoints are at (-14, -20) and (14, 20).
  //   Let's place outer sector walls at Z = ±27.5 for X in [-35.5, -26.0] and [-19.5, -16.5] (and symmetric on +X):
  //   - Dist from (-16.5, -27.5) to DoorPoint (-15, -32): hypot(1.5, 4.5) = 4.74m >= 3.5m!
  //   - Dist from (-19.5, -27.5) to CardPoint (-22, -22): hypot(2.5, 5.5) = 6.04m >= 2.2m!
  //   - Wide 6.5m doorway between X = -26.0 and -19.5 directly into the sector!
  addWarehouseWall('Wall_NW_ColdVault',   -35.5, -27.5, -26.0, -27.5, MAT.brushedSteel);
  addWarehouseWall('Wall_NW_ColdVault',   -35.5, -27.5, -35.5, -19.0, MAT.brushedSteel);

  addWarehouseWall('Wall_NE_HazmatCage',   26.0, -27.5,  35.5, -27.5, MAT.corrugatedIron);
  addWarehouseWall('Wall_NE_HazmatCage',   35.5, -27.5,  35.5, -19.0, MAT.corrugatedIron);

  addWarehouseWall('Wall_Office_SW_01',   -35.5,  27.5, -26.0,  27.5, MAT.chippedConcrete);
  addWarehouseWall('Wall_Office_SW_02',   -35.5,  19.0, -35.5,  27.5, MAT.chippedConcrete);
  addWarehouseWall('Wall_Office_SW_03',   -27.5,  18.5, -27.5,  24.0, MAT.chippedConcrete);

  addWarehouseWall('Wall_SE_BatteryBay',   26.0,  27.5,  35.5,  27.5, MAT.corrugatedCladding);
  addWarehouseWall('Wall_SE_BatteryBay',   35.5,  19.0,  35.5,  27.5, MAT.corrugatedCladding);

  // --- (D) Outer Logistics Compound Perimeter Walls (112x80m boundary at X = ±55.4, Z = ±39.4, height 3.6m) ---
  // Note:
  //   - Outer DoorPoints are at (0, -34), (0, 34), (-48, 0), (48, 0).
  //   - Distance from (0, ±34) to Z = ±39.4 is 5.4m (minus 0.3m half-thickness = 5.1m >= 3.5m!).
  //   - Distance from (±48, 0) to X = ±55.4 is 7.4m (minus 0.3m half-thickness = 7.1m >= 3.5m!).
  for (let x = -55.0; x < 55.0; x += 11.0) {
    const xNext = Math.min(55.0, x + 11.0);
    addWarehouseWall('Wall_Perimeter_North', x, -39.4, xNext, -39.4, MAT.mossConcrete, 3.6, 0.6);
    addWarehouseWall('Wall_Perimeter_South', x,  39.4, xNext,  39.4, MAT.mossConcrete, 3.6, 0.6);
  }
  for (let z = -39.0; z < 39.0; z += 11.14) {
    const zNext = Math.min(39.0, z + 11.14);
    addWarehouseWall('Wall_Perimeter_West', -55.4, z, -55.4, zNext, MAT.mossConcrete, 3.6, 0.6);
    addWarehouseWall('Wall_Perimeter_East',  55.4, z,  55.4, zNext, MAT.mossConcrete, 3.6, 0.6);
  }
}
buildWarehouseArchitecture();

// ============================================================================
// 4. CENTER — AUTOMATED CONVEYOR SORTING HUB & OVERHEAD BRIDGE GANTRY CRANE
// ============================================================================
function buildCentralSortingArena() {
  // (A) At exact center (0, 0): Central Automated Sorter Control Tower & Scanner Arch (`Console_CentralSorter_01`, height 2.35m full cover)
  const bTowerSteel = new MeshBuilder();
  const bTowerRack = new MeshBuilder();
  const bTowerDark = new MeshBuilder();

  // Octagonal heavy steel base & 2.35m control column (radius 1.45m)
  bTowerDark.addCylinder(0, 0.14, 0, 1.65, 1.58, 0.28, 16, 1, true);
  bTowerRack.addCylinder(0, 1.22, 0, 1.42, 1.36, 2.08, 16, 3, true, 0, 0, 2.0);
  bTowerSteel.addTorus(0, 0.32, 0, 1.44, 0.08, 24, 12);
  bTowerSteel.addTorus(0, 2.24, 0, 1.38, 0.09, 24, 12);
  bTowerDark.addCylinder(0, 2.32, 0, 1.52, 1.42, 0.12, 16, 1, true);

  // 4 Angled PLC Logistics Terminal Hoods & Barcode Scanner Wings around the central tower
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI * 0.5 + Math.PI * 0.25;
    const cx = Math.cos(ang) * 1.52;
    const cz = Math.sin(ang) * 1.52;
    bTowerDark.addBeveledBox(cx, 1.05, cz, 0.92, 1.98, 0.55, -ang + Math.PI * 0.5, 0.03, 0.7, 2, 3, 1);
    bTowerSteel.addBeveledBox(cx, 1.45, cz, 0.78, 0.52, 0.62, -ang + Math.PI * 0.5, 0.02, 1.0, 2, 1, 1);
  }

  const centralSorterMesh = registerMesh('Console_CentralSorter_HeroMesh', [
    { builder: bTowerSteel, mat: MAT.brushedSteel },
    { builder: bTowerRack, mat: MAT.rackSteel },
    { builder: bTowerDark, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Console_CentralSorter_01', centralSorterMesh, [0.0, 0.0, 0.0]);

  // (B) 4 Radiating Roller Conveyor Belt Lines (`Barrier_ConveyorBelt_01..04`, height 0.85m jumpable/shoot-over cover)
  // Extending from r = 1.8m to r = 5.5m along the 4 cardinal axes (length 3.7m, center at r = 3.65m).
  // Verify clearance:
  //   - CardPoints at (±8.5, 0) and (0, ±8.5) are 3.0m beyond the r=5.5m conveyor tip!
  //   - Diagonal Arena DoorPoints at (±12, ±11) are > 12.0m away!
  const bConvFrame = new MeshBuilder();
  const bConvRollers = new MeshBuilder();
  const bConvBoxes = new MeshBuilder();

  // Conveyor side C-channel rails (length 3.7m along local X, width 1.25m along local Z, height 0.78m)
  bConvFrame.addBeveledBox(0, 0.68, -0.58, 3.70, 0.18, 0.10, 0, 0.02, 0.8, 4, 1, 1);
  bConvFrame.addBeveledBox(0, 0.68,  0.58, 3.70, 0.18, 0.10, 0, 0.02, 0.8, 4, 1, 1);
  // Support legs
  for (const lx of [-1.55, 0.0, 1.55]) {
    bConvFrame.addBeveledBox(lx, 0.32, -0.54, 0.14, 0.64, 0.12, 0, 0.015, 1.0);
    bConvFrame.addBeveledBox(lx, 0.32,  0.54, 0.14, 0.64, 0.12, 0, 0.015, 1.0);
    bConvFrame.addBeveledBox(lx, 0.16,  0.0,  0.10, 0.08, 1.08, 0, 0.01,  1.0);
  }
  // 14 galvanized steel conveyor rollers across the belt bed
  for (let r = -6; r <= 6; r++) {
    bConvRollers.addCylinder(r * 0.27, 0.72, 0, 0.048, 0.048, 1.06, 12, 1, true, 0, Math.PI * 0.5);
  }
  // Shrink-wrapped cardboard parcel boxes on top of conveyor (total height 0.85m..0.88m jumpable cover)
  bConvBoxes.addBeveledBox(-0.95, 0.84,  0.05, 0.72, 0.18, 0.68,  0.12, 0.02, 1.0, 2, 1, 2);
  bConvBoxes.addBeveledBox( 0.25, 0.85, -0.06, 0.84, 0.20, 0.74, -0.08, 0.02, 1.0, 2, 1, 2);
  bConvBoxes.addBeveledBox( 1.22, 0.83,  0.04, 0.62, 0.16, 0.60,  0.22, 0.02, 1.0, 2, 1, 2);

  const conveyorMesh = registerMesh('Barrier_ConveyorBelt_SharedMesh', [
    { builder: bConvFrame, mat: MAT.rackSteel },
    { builder: bConvRollers, mat: MAT.brushedSteel },
    { builder: bConvBoxes, mat: MAT.cardboardShrinkwrap }
  ]);

  const convPlacements = [
    { pos: [-3.65, 0.0,  0.0 ], yaw: 0.0 },
    { pos: [ 3.65, 0.0,  0.0 ], yaw: Math.PI },
    { pos: [ 0.0,  0.0, -3.65], yaw: Math.PI * 0.5 },
    { pos: [ 0.0,  0.0,  3.65], yaw: -Math.PI * 0.5 }
  ];
  convPlacements.forEach((cp, idx) => {
    addGeometryNode(`Barrier_ConveyorBelt_0${idx + 1}`, conveyorMesh, cp.pos, cp.yaw);
  });

  // (C) Overhead Yellow Double-Girder Bridge Gantry Crane (`GantryCrane_01..02_Canopy` at Y = 4.6m, no collision, fades when occluding!)
  for (let i = 0; i < 2; i++) {
    const gz = i === 0 ? -5.5 : 5.5;
    const bCraneYellow = new MeshBuilder();
    const bCraneSteel = new MeshBuilder();
    // Double box girders spanning X in [-16.5, 16.5] at Y = 4.65m
    bCraneYellow.addBeveledBox(0, 4.65, gz - 0.65, 33.0, 0.55, 0.38, 0, 0.03, 0.3, 14, 1, 1);
    bCraneYellow.addBeveledBox(0, 4.65, gz + 0.65, 33.0, 0.55, 0.38, 0, 0.03, 0.3, 14, 1, 1);
    // End carriage trucks at X = ±16.2m
    bCraneYellow.addBeveledBox(-16.2, 4.65, gz, 0.85, 0.62, 2.40, 0, 0.03, 0.5, 1, 1, 2);
    bCraneYellow.addBeveledBox( 16.2, 4.65, gz, 0.85, 0.62, 2.40, 0, 0.03, 0.5, 1, 1, 2);
    // Hoist trolley carriage & suspended cargo hook block (all strictly at Y >= 3.55m so it is 100% overhead canopy!)
    const tx = i === 0 ? -4.5 : 4.5;
    bCraneSteel.addBeveledBox(tx, 4.88, gz, 1.85, 0.42, 1.75, 0, 0.03, 0.6, 2, 1, 2);
    bCraneSteel.addCylinder(tx, 4.20, gz, 0.06, 0.06, 1.10, 12, 1, true);
    bCraneYellow.addBeveledBox(tx, 3.68, gz, 0.55, 0.42, 0.38, 0, 0.02, 1.0);
    bCraneSteel.addTorus(tx, 3.45, gz, 0.16, 0.045, 16, 10, 0, Math.PI * 0.5);

    const cName = `GantryCrane_0${i + 1}_Canopy`;
    addGeometryNode(cName, registerMesh(`${cName}_Mesh`, [
      { builder: bCraneYellow, mat: MAT.heroForklift },
      { builder: bCraneSteel, mat: MAT.heroDarkMetal }
    ]));
  }

  // (D) 4 Overhead Barcode Laser Scanner Gantry Arches (`ScannerGantry_01..04_Canopy` at Y = 3.5m)
  const bScanArch = new MeshBuilder();
  const bScanSteel = new MeshBuilder();
  bScanArch.addBeveledBox(0, 3.65, 0, 3.20, 0.36, 0.52, 0, 0.02, 0.6, 4, 1, 1);
  bScanSteel.addBeveledBox(-1.25, 3.42, 0, 0.38, 0.22, 0.58, 0, 0.015, 1.0);
  bScanSteel.addBeveledBox( 0.0,  3.42, 0, 0.48, 0.24, 0.58, 0, 0.015, 1.0);
  bScanSteel.addBeveledBox( 1.25, 3.42, 0, 0.38, 0.22, 0.58, 0, 0.015, 1.0);
  const scannerGantryMesh = registerMesh('ScannerGantry_Canopy_SharedMesh', [
    { builder: bScanArch, mat: MAT.rackSteel },
    { builder: bScanSteel, mat: MAT.brushedSteel }
  ]);
  const scanPlacements = [
    { pos: [-4.2, 0.0,  0.0], yaw: Math.PI * 0.5 },
    { pos: [ 4.2, 0.0,  0.0], yaw: Math.PI * 0.5 },
    { pos: [ 0.0, 0.0, -4.2], yaw: 0.0 },
    { pos: [ 0.0, 0.0,  4.2], yaw: 0.0 }
  ];
  scanPlacements.forEach((sp, idx) => {
    addGeometryNode(`ScannerGantry_0${idx + 1}_Canopy`, scannerGantryMesh, sp.pos, sp.yaw);
  });
}
buildCentralSortingArena();

// ============================================================================
// 5. WEST & EAST WINGS — 16 HEAVY 3-TIER STEEL PALLET RACKS & 4 TOPPLED PALLET BARRICADES
// ============================================================================
function buildHighBayPalletRackMaze() {
  // Build Shared High-Detail 3-Tier Steel Pallet Rack Mesh (`Server_Rack_Pallet_01..16`)
  // Dimensions: length = 6.5m (along local Z), width = 1.6m (along local X), height = 3.2m
  // Wait: let's orient length = 6.5m along local Z and width = 1.6m along local X so north-south rows have 1.6m width and 6.5m length!
  const bRackFrame = new MeshBuilder();
  const bRackPallets = new MeshBuilder();
  const bRackWood = new MeshBuilder();

  // 4 pairs of upright blue/orange steel columns along Z at local Z = -3.1, -1.03, +1.03, +3.1 (X = ±0.74m, height 3.2m)
  const postZs = [-3.10, -1.03, 1.03, 3.10];
  for (const pz of postZs) {
    for (const px of [-0.74, 0.74]) {
      bRackFrame.addBeveledBox(px, 1.60, pz, 0.12, 3.20, 0.12, 0, 0.015, 0.8, 1, 4, 1);
    }
    // Horizontal & diagonal X-bracing between front/back upright posts
    bRackFrame.addBeveledBox(0, 0.95, pz, 1.40, 0.07, 0.07, 0, 0.01, 1.0);
    bRackFrame.addBeveledBox(0, 2.05, pz, 1.40, 0.07, 0.07, 0, 0.01, 1.0);
    bRackFrame.addBeveledBox(0, 3.08, pz, 1.40, 0.08, 0.08, 0, 0.01, 1.0);
  }

  // 3 tiers of horizontal orange load beams at Y = 0.22m, 1.38m, 2.48m spanning length 6.5m
  const tierYs = [0.22, 1.38, 2.48];
  for (const ty of tierYs) {
    bRackFrame.addBeveledBox(-0.74, ty, 0, 0.10, 0.14, 6.46, 0, 0.015, 0.5, 1, 1, 6);
    bRackFrame.addBeveledBox( 0.74, ty, 0, 0.10, 0.14, 6.46, 0, 0.015, 0.5, 1, 1, 6);
  }

  // Multi-height shrink-wrapped cardboard pallet loads & wooden military crates across the 3 bays & 3 tiers
  // Notice: Bottom & middle tiers form solid 2.2m+ cover so players use the racks as tactical CQB corridors!
  const bayZs = [-2.06, 0.0, 2.06];
  for (let bIdx = 0; bIdx < bayZs.length; bIdx++) {
    const bz = bayZs[bIdx];
    // Tier 1 (floor/lower beam Y = 0.28..1.30m): wooden pallet deck + tall shrink-wrapped cardboard cargo block
    bRackWood.addBeveledBox(0, 0.34, bz, 1.48, 0.12, 1.82, 0, 0.015, 0.8, 2, 1, 2);
    bRackPallets.addBeveledBox(0, 0.84, bz, 1.42, 0.88, 1.74, 0, 0.03, 0.5, 2, 2, 2);

    // Tier 2 (middle beam Y = 1.44..2.38m): wooden pallet deck + shrink-wrapped cartons
    bRackWood.addBeveledBox(0, 1.50, bz, 1.48, 0.12, 1.82, 0, 0.015, 0.8, 2, 1, 2);
    const h2 = (bIdx === 1) ? 0.82 : 0.74;
    bRackPallets.addBeveledBox(0, 1.56 + h2 * 0.5, bz, 1.38, h2, 1.68, 0, 0.03, 0.5, 2, 2, 2);

    // Tier 3 (top beam Y = 2.54..3.18m): high-bay reserve pallet boxes
    bRackWood.addBeveledBox(0, 2.60, bz, 1.46, 0.10, 1.78, 0, 0.015, 0.8, 2, 1, 2);
    bRackPallets.addBeveledBox(0, 2.92, bz, 1.34, 0.54, 1.62, 0, 0.03, 0.5, 2, 1, 2);
  }

  const palletRackMesh = registerMesh('Server_Rack_Pallet_SharedMesh', [
    { builder: bRackFrame, mat: MAT.rackSteel },
    { builder: bRackPallets, mat: MAT.cardboardShrinkwrap },
    { builder: bRackWood, mat: MAT.darkWood }
  ]);

  // Place 16 Heavy 3-Tier Steel Pallet Racks (`Server_Rack_Pallet_01..16`):
  // 8 in West Rack Maze (X in [-39, -22]) and 8 in East Rack Maze (X in [22, 39])
  // Verify exact coordinates for CQB aisle widths and clearance from CardPoints & DoorPoints:
  //   - West Rack Columns at X = -34.5, -24.5 (center aisle at X = -28.0 has width 10.0 - 1.6 = 8.4m!)
  //   - Let's place 3 parallel rack rows per wing at X = ±24.2, ±31.8, ±37.8:
  //     Wait: check CardPoints at (±28.0, ±8.0) and (±40.0, 0.0), and DoorPoints at (±20.0, 0.0)!
  //     Let's check X = ±24.2, ±31.8, ±36.8:
  //     - Between X = -24.2 (half-width 0.8 -> -25.0) and X = -31.8 (half-width 0.8 -> -31.0):
  //       Clear aisle width is 6.0m, and CardPoints (-28.0, -8.0) & (-28.0, 8.0) sit right down the center with 3.0m clearance on both sides!
  //     - Between X = -31.8 (-32.6) and X = -36.8 (-36.0): clear aisle width is 3.4m, and X = -36.8 (-37.6) leaves 2.4m clear to CardPoint (-40.0, 0.0)!
  //     - What about Z positions of the racks?
  //       If racks at X = ±24.2 and ±31.8 are placed at Z = -12.0 (spanning [-15.25, -8.75]) and Z = +12.0 (spanning [8.75, 15.25]),
  //       then:
  //       * Central East-West cross-aisle at Z in [-8.75, +8.75] is wide open at DoorPoint (±20, 0)!
  //       * Distance from rack at (±24.2, ±12.0) (Z closest edge = ±8.75, X closest edge = ±23.4) to DoorPoint (±20.0, 0.0):
  //         hypot(23.4 - 20.0, 8.75 - 0.0) = hypot(3.4, 8.75) = 9.38m >= 3.5m!
  //       * Distance from rack at (±24.2, ±12.0) to CardPoint (±28.0, ±8.0):
  //         hypot(28.0 - 25.0, 8.75 - 8.0) = hypot(3.0, 0.75) = 3.09m >= 2.2m!
  //       * Distance from rack at (±24.2, ±12.0) (Z outer edge = ±15.25) to Sector CardPoint (±22.0, ±22.0):
  //         hypot(23.4 - 22.0, 22.0 - 15.25) = 6.89m >= 2.2m!
  //       * And for the 4 inner/outer racks, let's place them at:
  //         - (±31.8, 0.0) (spanning Z in [-3.25, 3.25]):
  //           * Dist to CardPoint (±28.0, ±8.0): hypot(31.0 - 28.0, 8.0 - 3.25) = hypot(3.0, 4.75) = 5.61m!
  //           * Dist to CardPoint (±40.0, 0.0): 40.0 - 32.6 = 7.40m!
  //           * Breaks long north-south sightline along X = ±31.8 while keeping 5.5m cross-aisles at Z = ±6.0!
  //         - (±38.2, ±11.5) (spanning Z in [8.25, 14.75] and [-14.75, -8.25]):
  //           * Dist to CardPoint (±40.0, 0.0): hypot(40.0 - 39.0, 8.25 - 0.0) = 8.31m!
  //           * Dist to DoorPoint (±48.0, 0.0): hypot(48.0 - 39.0, 8.25 - 0.0) = 12.21m!
  const rackPlacements = [
    // West Wing (8 Racks: 01..08)
    { pos: [-24.2, 0.0, -12.0], yaw: 0.0 },
    { pos: [-24.2, 0.0,  12.0], yaw: 0.0 },
    { pos: [-31.8, 0.0, -12.5], yaw: 0.0 },
    { pos: [-31.8, 0.0,   0.0], yaw: 0.0 },
    { pos: [-31.8, 0.0,  12.5], yaw: 0.0 },
    { pos: [-38.2, 0.0, -12.0], yaw: 0.0 },
    { pos: [-38.2, 0.0,  12.0], yaw: 0.0 },
    { pos: [-27.8, 0.0,   0.0], yaw: Math.PI * 0.5 }, // Transverse center CQB divider between (-28,-8) and (-28,8) cards!
    // East Wing (8 Racks: 09..16)
    { pos: [ 24.2, 0.0, -12.0], yaw: 0.0 },
    { pos: [ 24.2, 0.0,  12.0], yaw: 0.0 },
    { pos: [ 31.8, 0.0, -12.5], yaw: 0.0 },
    { pos: [ 31.8, 0.0,   0.0], yaw: 0.0 },
    { pos: [ 31.8, 0.0,  12.5], yaw: 0.0 },
    { pos: [ 38.2, 0.0, -12.0], yaw: 0.0 },
    { pos: [ 38.2, 0.0,  12.0], yaw: 0.0 },
    { pos: [ 27.8, 0.0,   0.0], yaw: Math.PI * 0.5 }  // Transverse center CQB divider between (28,-8) and (28,8) cards!
  ];
  // Wait: verify rack #8 at (-27.8, 0.0, 0.0) rotated 90 deg (length 6.5m along X in [-31.05, -24.55], width 1.6m along Z in [-0.8, 0.8]):
  //Wait — if rack #4 is at (-31.8, 0.0, 0.0) (X in [-32.6, -31.0]), they would touch at X = -31.0!
  // Let's instead place Racks #4 and #8 at (-24.2, 0.0, 0.0)? No, DoorPoint is at (-20.0, 0.0) and needs >= 3.5m clear radius (so X in [-23.5, -16.5] must be clear at Z=0)!
  // At X = -27.8, Z = 0.0 with yaw = 0.0 (length 6.5m along Z in [-3.25, 3.25], width 1.6m along X in [-28.6, -27.0]):
  //   - Dist to DoorPoint (-20.0, 0.0) is 27.0 - 20.0 = 7.0m >= 3.5m!
  //   - Dist to CardPoints (-28.0, ±8.0) is 8.0 - 3.25 = 4.75m >= 2.2m!
  //   - And what if rack #4 is at (-35.0, 0.0, 0.0) (width 1.6m along X in [-35.8, -34.2], length 6.5m along Z in [-3.25, 3.25])?
  //     * Aisle between X = -28.6 and X = -34.2 is 5.6m wide!
  //     * Dist from X = -35.8 to CardPoint (-40.0, 0.0) is 4.2m >= 2.2m!
  rackPlacements[3]  = { pos: [-35.0, 0.0, 0.0], yaw: 0.0 };
  rackPlacements[7]  = { pos: [-27.8, 0.0, 0.0], yaw: 0.0 };
  rackPlacements[11] = { pos: [ 35.0, 0.0, 0.0], yaw: 0.0 };
  rackPlacements[15] = { pos: [ 27.8, 0.0, 0.0], yaw: 0.0 };

  rackPlacements.forEach((rp, idx) => {
    addGeometryNode(`Server_Rack_Pallet_${String(idx + 1).padStart(2, '0')}`, palletRackMesh, rp.pos, rp.yaw);
  });

  // (B) 4 Collapsed/Toppled Rack Spill Barricades (`Crate_ToppledPallet_01..04`, height 2.05m angled cover)
  // Breaking straight aisle lines naturally!
  const bToppledCargo = new MeshBuilder();
  const bToppledWood = new MeshBuilder();
  const bToppledSteel = new MeshBuilder();

  // Tilted/bent orange rack beam + spilled stack of shrink-wrapped pallet loads reaching Y = 2.05m
  bToppledCargo.addBeveledBox(0.0, 1.02, 0.0, 1.95, 2.04, 1.35, 0.15, 0.04, 0.6, 3, 3, 2);
  bToppledCargo.addBeveledBox(0.85, 0.58, 0.45, 1.15, 1.16, 1.05, -0.35, 0.03, 0.6, 2, 2, 2);
  bToppledWood.addBeveledBox(-0.65, 0.85, 0.72, 1.35, 1.65, 0.16, 0.25, 0.02, 0.8, 2, 2, 1);
  bToppledSteel.addBeveledBox(0.15, 1.45, -0.68, 2.40, 0.16, 0.16, -0.18, 0.02, 0.8, 3, 1, 1);

  const toppledPalletMesh = registerMesh('Crate_ToppledPallet_SharedMesh', [
    { builder: bToppledCargo, mat: MAT.cardboardShrinkwrap },
    { builder: bToppledWood, mat: MAT.darkWood },
    { builder: bToppledSteel, mat: MAT.rackSteel }
  ]);

  const toppledPlacements = [
    { pos: [-28.0, 0.0, -15.5], yaw:  0.42 },
    { pos: [-28.0, 0.0,  15.5], yaw: -0.38 },
    { pos: [ 28.0, 0.0, -15.5], yaw: -0.42 },
    { pos: [ 28.0, 0.0,  15.5], yaw:  0.38 }
  ];
  toppledPlacements.forEach((tp, idx) => {
    addGeometryNode(`Crate_ToppledPallet_0${idx + 1}`, toppledPalletMesh, tp.pos, tp.yaw);
  });
}
buildHighBayPalletRackMaze();

// ============================================================================
// 6. NORTH & SOUTH LOADING DOCKS — 2 WALKABLE SEMI-TRUCK TRAILERS, 2 TRACTOR CABS & 6 FORKLIFTS
// ============================================================================
function buildLoadingDocksAndVehicles() {
  // (A) 2 Full-Size Semi-Trucks with Walkable Open-Top 53ft Cargo Trailers (`SubwayCar_SemiTrailer_01..02`)
  // Positioned at North Loading Bay (0.0, -26.0) and South Loading Bay (0.0, 26.0), oriented along the X axis:
  //   - Length = 14.0m (X in [-7.0, +7.0]), Width = 4.2m (Z in [cz - 2.1, cz + 2.1]), Wall height = 2.6m
  //   - Walkable interior floor deck at Y = 0.02m (flush with loading dock so players run straight in!)
  //   - Open rear loading dock doors at X = -7.0m (for North trailer) / X = +7.0m (for South trailer)
  //     AND open front bulkhead gangway + TWO wide 2.4m breached side cargo doors on BOTH sides (at local X = -2.8m and +2.8m)
  //     so players can fight inside the truck trailers to grab `CardPoint_09` (0, 1.15, -26) & `CardPoint_10` (0, 1.15, 26)!
  //   - Verify clearance from DoorPoints (0, -34), (0, -17), (±15, -32):
  //     * Trailer Z is in [-28.1, -23.9]. Dist to (0, -34) is 34.0 - 28.1 = 5.9m >= 3.5m!
  //     * Dist to (0, -17) is 23.9 - 17.0 = 6.9m >= 3.5m!
  //     * Dist to (±15, -32) is hypot(15.0 - 7.0, 32.0 - 28.1) = 8.91m >= 3.5m!
  const trailerSpecs = [
    { id: '01', cx: 0.0, cz: -26.0, tractorX:  9.4, tractorYaw: 0.0 },      // North Loading Bay Semi-Trailer + Tractor Cab at East end
    { id: '02', cx: 0.0, cz:  26.0, tractorX: -9.4, tractorYaw: Math.PI }   // South Loading Bay Semi-Trailer + Tractor Cab at West end
  ];

  for (const tr of trailerSpecs) {
    // 1. Walkable Trailer Bed Floor & Tandem Rear Bogie Wheels (`Floor_SemiTrailer_NN`)
    const bFloor = new MeshBuilder();
    const bUndercarriage = new MeshBuilder();
    // Walkable hardwood/steel floor slab from Y = -0.04m to Y = +0.022m
    bFloor.addBeveledBox(tr.cx, -0.01, tr.cz, 14.0, 0.064, 4.2, 0, 0.01, 0.4, 10, 1, 4);
    // Decorative recessed wheel wells & landing gear struts along outer bottom edge
    for (const wx of [-4.8, -3.6, 3.6, 4.8]) {
      for (const wz of [tr.cz - 2.08, tr.cz + 2.08]) {
        bUndercarriage.addCylinder(tr.cx + wx, 0.24, wz, 0.24, 0.24, 0.16, 16, 1, true, 0, Math.PI * 0.5);
      }
    }
    addGeometryNode(`Floor_SemiTrailer_${tr.id}`, registerMesh(`Floor_SemiTrailer_${tr.id}_Mesh`, [
      { builder: bFloor, mat: MAT.darkWood },
      { builder: bUndercarriage, mat: MAT.heroDarkMetal }
    ]));

    // 2. Modular Corrugated Aluminum Side Wall Panels (`SubwayCar_SemiTrailer_NN_Wall_01..06`, height 2.6m, thickness 0.34m)
    // Two wide 2.4m breached side cargo doorways on each side at X in [-4.0, -1.6] and X in [1.6, 4.0]!
    // Solid wall piers along Z = tr.cz ± 1.93m are at:
    //   - Pier A: X in [-7.0, -4.0] (length 3.0m, center X = -5.5)
    //   - Pier B: X in [-1.6,  1.6] (length 3.2m, center X =  0.0)
    //   - Pier C: X in [ 4.0,  7.0] (length 3.0m, center X =  5.5)
    const pierXs = [
      { x: -5.5, len: 3.0 },
      { x:  0.0, len: 3.2 },
      { x:  5.5, len: 3.0 }
    ];
    let wIdx = 1;
    for (const sideZ of [tr.cz - 1.93, tr.cz + 1.93]) {
      for (const pier of pierXs) {
        const bWall = new MeshBuilder();
        const bTrim = new MeshBuilder();
        bWall.addBeveledBox(tr.cx + pier.x, 1.32, sideZ, pier.len, 2.60, 0.34, 0, 0.025, 0.4, 4, 4, 1);
        // Bottom aluminum rub-rail & top roof cant-rail
        bTrim.addBeveledBox(tr.cx + pier.x, 0.18, sideZ, pier.len + 0.02, 0.24, 0.38, 0, 0.015, 0.8, 3, 1, 1);
        bTrim.addBeveledBox(tr.cx + pier.x, 2.52, sideZ, pier.len + 0.02, 0.16, 0.38, 0, 0.015, 0.8, 3, 1, 1);
        const wName = `SubwayCar_SemiTrailer_${tr.id}_Wall_${String(wIdx++).padStart(2, '0')}`;
        addGeometryNode(wName, registerMesh(`${wName}_Mesh`, [
          { builder: bWall, mat: MAT.heroSemiTrailer },
          { builder: bTrim, mat: MAT.brushedSteel }
        ]));
      }
    }

    // 3. Front & Rear Corner Posts with Wide Open Loading Bay Doors (at X = ±6.82m, leaving a 2.6m wide center dock entrance!)
    for (const [endIdx, endX] of [[1, -6.82], [2, 6.82]]) {
      const bEnd = new MeshBuilder();
      for (const sideZ of [tr.cz - 1.65, tr.cz + 1.65]) {
        bEnd.addBeveledBox(tr.cx + endX, 1.32, sideZ, 0.36, 2.60, 0.90, 0, 0.02, 0.5, 1, 4, 1);
      }
      const eName = `SubwayCar_SemiTrailer_${tr.id}_EndFrame_0${endIdx}`;
      addGeometryNode(eName, registerMesh(`${eName}_Mesh`, [{ builder: bEnd, mat: MAT.heroSemiTrailer }]));
    }

    // 4. Overhead Open-Top Trailer Roof Bow Ribs (`SemiTrailer_RoofRibs_NN_Canopy` at Y = 2.65m..2.80m, fades when occluding!)
    const bRibs = new MeshBuilder();
    for (let rx = -6.0; rx <= 6.0; rx += 2.4) {
      bRibs.addBeveledBox(tr.cx + rx, 2.68, tr.cz, 0.18, 0.12, 4.10, 0, 0.015, 0.5, 1, 1, 4);
    }
    addGeometryNode(`SemiTrailer_RoofRibs_${tr.id}_Canopy`, registerMesh(`SemiTrailer_RoofRibs_${tr.id}_Canopy_Mesh`, [
      { builder: bRibs, mat: MAT.brushedSteel }
    ]));
  }

  // (B) 2 Heavy Semi-Truck Tractor Cab Units (`Humvee_SemiTractor_01..02`, height 2.5m solid cover)
  // Named with `Humvee_` so ImportedMap.gd's CONVEX_KEYWORDS builds rock-solid convex collision!
  const bCabBody = new MeshBuilder();
  const bCabChassis = new MeshBuilder();
  const bCabChrome = new MeshBuilder();

  // Heavy chassis frame rails & fifth-wheel coupling deck (length 4.2m, width 2.3m)
  bCabChassis.addBeveledBox(0.0, 0.42, 0.0, 4.20, 0.34, 2.18, 0, 0.03, 0.6, 4, 1, 2);
  // High-roof sleeper cab & aerodynamic wind deflector (top at Y = 2.52m)
  bCabBody.addBeveledBox(-0.25, 1.48, 0.0, 2.15, 1.82, 2.26, 0, 0.06, 0.45, 3, 3, 3);
  bCabBody.addBeveledBox(-0.45, 2.42, 0.0, 1.55, 0.24, 2.16, 0, 0.04, 0.5, 2, 1, 2);
  // Long nose engine hood & chrome radiator grille + heavy front bumper
  bCabBody.addBeveledBox( 1.38, 1.08, 0.0, 1.35, 1.12, 2.04, 0, 0.05, 0.5, 2, 2, 2);
  bCabChrome.addBeveledBox( 2.08, 1.06, 0.0, 0.12, 0.96, 1.42, 0, 0.02, 1.2, 1, 2, 2);
  bCabChrome.addBeveledBox( 2.14, 0.46, 0.0, 0.24, 0.34, 2.34, 0, 0.03, 1.0);
  // Dual vertical chrome exhaust stacks & cylindrical fuel tanks
  for (const sz of [-1.18, 1.18]) {
    bCabChrome.addCylinder(-1.15, 1.65, sz, 0.09, 0.09, 2.15, 14, 2, true);
    bCabChrome.addCylinder( 0.15, 0.52, sz, 0.28, 0.28, 1.25, 18, 1, true, Math.PI * 0.5, Math.PI * 0.5);
  }
  // 6 Heavy semi-truck tires (front steer axle + rear tandem drive axles)
  for (const [wx, wz] of [[-1.45, -1.12], [-1.45, 1.12], [-0.35, -1.12], [-0.35, 1.12], [1.45, -1.10], [1.45, 1.10]]) {
    bCabChassis.addCylinder(wx, 0.48, wz, 0.48, 0.48, 0.36, 24, 2, true, 0, Math.PI * 0.5);
    bCabChrome.addTorus(wx, 0.48, wz > 0 ? wz + 0.15 : wz - 0.15, 0.28, 0.10, 20, 10, 0, Math.PI * 0.5);
  }

  const semiTractorMesh = registerMesh('Humvee_SemiTractor_HeroMesh', [
    { builder: bCabBody, mat: MAT.heroSemiTrailer },
    { builder: bCabChassis, mat: MAT.heroDarkMetal },
    { builder: bCabChrome, mat: MAT.brushedSteel }
  ]);

  // Verify tractor cab positions at (9.4, 0.0, -26.0) and (-9.4, 0.0, 26.0):
  //   - Dist to DoorPoints (±15, ±32): hypot(15.0 - 11.5, 32.0 - 27.2) = 5.94m >= 3.5m!
  //   - Dist to CardPoints (-14, -20) and (14, 20): > 8.5m!
  addGeometryNode('Humvee_SemiTractor_01', semiTractorMesh, [ 9.4, 0.0, -26.0], 0.0);
  addGeometryNode('Humvee_SemiTractor_02', semiTractorMesh, [-9.4, 0.0,  26.0], Math.PI);

  // (C) 6 Detailed Industrial Forklifts (`Humvee_Forklift_01..06`, height 2.15m with mast, forks, ROPS cage, counterweights, wheels)
  // Named `Humvee_Forklift_01..06` so ImportedMap.gd's CONVEX_KEYWORDS ("Humvee") gives them solid convex collision!
  const bForkYellow = new MeshBuilder();
  const bForkDark = new MeshBuilder();
  const bForkSteel = new MeshBuilder();

  // Rear cast-iron counterweight & engine body (length 2.15m, width 1.28m, height 1.22m)
  bForkYellow.addBeveledBox(-0.25, 0.68, 0.0, 2.05, 0.96, 1.28, 0, 0.06, 0.6, 4, 2, 3);
  bForkDark.addBeveledBox(-1.05, 0.64, 0.0, 0.55, 0.88, 1.32, 0, 0.07, 0.6, 2, 2, 2);
  // Operator cab seat, steering column & 4-post ROPS overhead guard cage reaching Y = 2.15m
  bForkDark.addBeveledBox(-0.15, 1.28, 0.0, 0.55, 0.35, 0.55, 0, 0.03, 1.0);
  for (const [px, pz] of [[-0.88, -0.56], [-0.88, 0.56], [0.58, -0.56], [0.58, 0.56]]) {
    bForkDark.addBeveledBox(px, 1.62, pz, 0.09, 0.98, 0.09, 0, 0.015, 1.0);
  }
  bForkYellow.addBeveledBox(-0.15, 2.11, 0.0, 1.56, 0.08, 1.22, 0, 0.02, 0.8, 3, 1, 2);
  // Front dual-stage hydraulic lift mast (height 2.18m) & hydraulic ram cylinder
  bForkDark.addBeveledBox( 0.92, 1.12, -0.42, 0.16, 2.16, 0.14, 0, 0.02, 0.8, 1, 4, 1);
  bForkDark.addBeveledBox( 0.92, 1.12,  0.42, 0.16, 2.16, 0.14, 0, 0.02, 0.8, 1, 4, 1);
  bForkDark.addBeveledBox( 0.92, 1.95,  0.0,  0.14, 0.14, 0.96, 0, 0.015, 1.0);
  bForkDark.addBeveledBox( 0.92, 0.95,  0.0,  0.14, 0.22, 0.96, 0, 0.015, 1.0);
  bForkSteel.addCylinder( 0.88, 1.10,  0.0,  0.07, 0.07, 1.95, 14, 2, true);
  // L-shaped steel forks & elevated wooden pallet load (raised slightly at Y = 0.28m..0.95m for solid front cover!)
  bForkSteel.addBeveledBox( 1.52, 0.22, -0.34, 1.18, 0.06, 0.14, 0, 0.01, 1.0);
  bForkSteel.addBeveledBox( 1.52, 0.22,  0.34, 1.18, 0.06, 0.14, 0, 0.01, 1.0);
  bForkYellow.addBeveledBox(1.52, 0.62,  0.0,  1.05, 0.72, 1.08, 0, 0.03, 0.6, 2, 2, 2);
  // 4 Industrial solid-rubber forklift tires
  for (const [wx, wz, r] of [[-0.88, -0.64, 0.28], [-0.88, 0.64, 0.28], [0.55, -0.66, 0.34], [0.55, 0.66, 0.34]]) {
    bForkDark.addCylinder(wx, r, wz, r, r, 0.24, 20, 1, true, 0, Math.PI * 0.5);
    bForkYellow.addCylinder(wx, r, wz, r * 0.55, r * 0.55, 0.26, 16, 1, true, 0, Math.PI * 0.5);
  }

  const forkliftMesh = registerMesh('Humvee_Forklift_HeroMesh', [
    { builder: bForkYellow, mat: MAT.heroForklift },
    { builder: bForkDark, mat: MAT.heroDarkMetal },
    { builder: bForkSteel, mat: MAT.brushedSteel }
  ]);

  // Place 6 Forklifts in the Sorting Arena, Rack Aisles, and Loading Docks (all >= 4.0m clear of every CardPoint, DoorPoint, and SpawnPoint!)
  const forkliftPlacements = [
    { pos: [ -6.5, 0.0,  -6.2], yaw:  0.65 }, // 01: Central Sorting Arena NW quadrant (dist to (-8.5,0) is 6.5m, dist to (-12,-11) is 7.3m)
    { pos: [  6.5, 0.0,   6.2], yaw: -2.45 }, // 02: Central Sorting Arena SE quadrant (dist to (8.5,0) is 6.5m, dist to (12,11) is 7.3m)
    { pos: [-31.5, 0.0, -21.0], yaw:  1.25 }, // 03: West Rack Maze North aisle transition
    { pos: [ 31.5, 0.0,  21.0], yaw: -1.85 }, // 04: East Rack Maze South aisle transition
    { pos: [-11.5, 0.0, -25.5], yaw:  0.15 }, // 05: North Loading Dock staging bay (loading SemiTrailer_01)
    { pos: [ 11.5, 0.0,  25.5], yaw:  2.95 }  // 06: South Loading Dock staging bay (loading SemiTrailer_02)
  ];
  forkliftPlacements.forEach((fp, idx) => {
    addGeometryNode(`Humvee_Forklift_0${idx + 1}`, forkliftMesh, fp.pos, fp.yaw);
  });
}
buildLoadingDocksAndVehicles();

// ============================================================================
// 7. 4 ASYMMETRIC SPECIALIZED WAREHOUSE SECTORS & PHOTOGRAMMETRY PROPS
// ============================================================================
function buildSpecializedSectorsAndProps() {
  // --- (A) NW Sector — Walk-In Cold Storage & Cryo Logistics Vault (around CardPoint (-22, -22)) ---
  // Stainless Refrigeration Condenser Towers (`Console_ColdVault_01..02`, height 2.25m full cover)
  const bColdSteel = new MeshBuilder();
  const bColdDark = new MeshBuilder();
  bColdSteel.addBeveledBox(0, 1.12, 0, 2.85, 2.24, 1.05, 0, 0.04, 0.6, 4, 3, 2);
  // Dual circular evaporator fan grilles & insulated cryo piping manifold
  for (const fx of [-0.75, 0.75]) {
    bColdDark.addCylinder(fx, 1.55, 0.54, 0.46, 0.46, 0.10, 24, 1, true, 0, Math.PI * 0.5);
    bColdSteel.addTorus(fx, 1.55, 0.56, 0.46, 0.05, 24, 10, 0, Math.PI * 0.5);
  }
  bColdSteel.addCylinder( 1.25, 1.15, 0.58, 0.12, 0.12, 2.10, 16, 2, true);
  bColdSteel.addCylinder(-1.25, 1.15, 0.58, 0.12, 0.12, 2.10, 16, 2, true);

  const coldVaultMesh = registerMesh('Console_ColdVault_Mesh', [
    { builder: bColdSteel, mat: MAT.brushedSteel },
    { builder: bColdDark, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Console_ColdVault_01', coldVaultMesh, [-31.0, 0.0, -25.2], 0.0);
  addGeometryNode('Console_ColdVault_02', coldVaultMesh, [-18.5, 0.0, -25.2], 0.0);

  // --- (B) NE Sector — Hazmat Drum Cage & Chemical Containment (around CardPoint (22, -22)) ---
  // Hazmat Steel Mesh Containment Partition & Spill Pallets (`Console_HazmatCage_01..02`, height 2.15m)
  const bHazFrame = new MeshBuilder();
  const bHazDrums = new MeshBuilder();
  bHazFrame.addBeveledBox(0, 0.14, 0, 2.70, 0.28, 1.35, 0, 0.02, 0.8, 3, 1, 2);
  bHazFrame.addBeveledBox(0, 1.15, -0.58, 2.70, 2.10, 0.16, 0, 0.02, 0.6, 3, 3, 1);
  for (const dx of [-0.85, 0.0, 0.85]) {
    bHazDrums.addCylinder(dx, 0.74, 0.05, 0.34, 0.34, 0.96, 20, 2, true);
    bHazFrame.addTorus(dx, 0.74, 0.05, 0.35, 0.03, 20, 8);
  }
  const hazmatCageMesh = registerMesh('Console_HazmatCage_Mesh', [
    { builder: bHazFrame, mat: MAT.rackSteel },
    { builder: bHazDrums, mat: MAT.heroForklift }
  ]);
  addGeometryNode('Console_HazmatCage_01', hazmatCageMesh, [31.0, 0.0, -25.2], 0.0);
  addGeometryNode('Console_HazmatCage_02', hazmatCageMesh, [18.5, 0.0, -25.2], 0.0);

  // --- (C) SW Sector — Customs Manifest & Dispatch Office (around CardPoint (-22, 22)) ---
  // Overturned Dispatch Desks & Manifest Filing Cabinets (`Console_DispatchDesk_01..02`, height 1.98m full cover)
  const bOffWood = new MeshBuilder();
  const bOffSteel = new MeshBuilder();
  bOffWood.addBeveledBox(0, 0.48, 0, 2.65, 0.96, 1.10, 0, 0.03, 0.7, 3, 2, 2);
  bOffSteel.addBeveledBox(-0.65, 1.48, -0.32, 1.25, 1.02, 0.45, 0, 0.02, 0.8, 2, 2, 1);
  bOffSteel.addBeveledBox( 0.65, 1.48, -0.32, 1.25, 1.02, 0.45, 0, 0.02, 0.8, 2, 2, 1);
  const dispatchDeskMesh = registerMesh('Console_DispatchDesk_Mesh', [
    { builder: bOffWood, mat: MAT.darkWood },
    { builder: bOffSteel, mat: MAT.brushedSteel }
  ]);
  addGeometryNode('Console_DispatchDesk_01', dispatchDeskMesh, [-31.0, 0.0, 25.0], 3.14159);
  addGeometryNode('Console_DispatchDesk_02', dispatchDeskMesh, [-18.5, 0.0, 25.0], 3.14159);

  // --- (D) SE Sector — Forklift Battery Charging & Heavy Maintenance Bay (around CardPoint (22, 22)) ---
  // High-Voltage Industrial Battery Charger Banks (`Console_BatteryCharger_01..02`, height 2.10m)
  const bBatBody = new MeshBuilder();
  const bBatSteel = new MeshBuilder();
  bBatBody.addBeveledBox(0, 1.05, 0, 2.75, 2.10, 1.05, 0, 0.04, 0.6, 3, 3, 2);
  for (const bx of [-0.85, 0.0, 0.85]) {
    bBatSteel.addBeveledBox(bx, 1.25, 0.54, 0.72, 1.15, 0.08, 0, 0.015, 1.0);
    bBatSteel.addCylinder(bx, 0.45, 0.62, 0.14, 0.14, 0.22, 14, 1, true, 0, Math.PI * 0.5);
  }
  const batteryChargerMesh = registerMesh('Console_BatteryCharger_Mesh', [
    { builder: bBatBody, mat: MAT.rackSteel },
    { builder: bBatSteel, mat: MAT.heroDarkMetal }
  ]);
  addGeometryNode('Console_BatteryCharger_01', batteryChargerMesh, [31.0, 0.0, 25.2], 3.14159);
  addGeometryNode('Console_BatteryCharger_02', batteryChargerMesh, [18.5, 0.0, 25.2], 3.14159);

  // --- (E) CC0 Photogrammetry Cover Props Across Freight Yards, Loading Docks & Sectors ---
  // 16 Concrete Road Barriers (`Barrier_01..16`) protecting the 4 corner Team Spawn Freight Yards & Loading Bays
  const barriers = [
    [-39.5, -28.5,  0.55], [ 39.5, -28.5, -0.55], [-39.5,  28.5, -0.55], [ 39.5,  28.5,  0.55],
    [-48.5, -22.5,  1.57], [ 48.5, -22.5,  1.57], [-48.5,  22.5,  1.57], [ 48.5,  22.5,  1.57],
    [-25.5, -33.5,  0.15], [ 25.5, -33.5, -0.15], [-25.5,  33.5, -0.15], [ 25.5,  33.5,  0.15],
    [ -7.5, -31.5, -0.15], [  7.5, -31.5,  0.15], [ -7.5,  31.5,  0.15], [  7.5,  31.5, -0.15]
  ];
  barriers.forEach((b, i) => {
    addGeometryNode(`Barrier_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrier, [b[0], 0.0, b[1]], b[2]);
  });

  // 12 High-Poly Sculpted Sandbag Positions (`Sandbag_Position_01..12`, height 0.88m)
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
    [-41.0, -24.5,  0.78], [ 41.0, -24.5, -0.78], [-41.0,  24.5, -0.78], [ 41.0,  24.5,  0.78],
    [-47.5, -11.5,  0.0],  [ 47.5, -11.5,  0.0],  [-47.5,  11.5,  0.0],  [ 47.5,  11.5,  0.0],
    [-14.0,  20.0 - 4.5, 0.45], [14.0, -20.0 + 4.5, -0.45], [-6.5, -18.5, 0.0], [6.5, 18.5, 0.0]
  ];
  sandbags.forEach((s, i) => {
    addGeometryNode(`Sandbag_Position_${String(i + 1).padStart(2, '0')}`, sandbagMesh, [s[0], 0.0, s[1]], s[2]);
  });

  // 12 Wooden Military Crates (`Crate_01..12`)
  const crates = [
    [-33.5, -21.5, 0.3], [ 33.5, -21.5, -0.2], [-33.5,  21.5, 0.4], [ 33.5,  21.5, -0.5],
    [-49.5, -16.5, 0.1], [ 49.5, -16.5, -0.1], [-49.5,  16.5, 0.5], [ 49.5,  16.5, -0.3],
    [-12.5,  -4.5, 0.7], [ 12.5,   4.5, -0.6], [-12.5,   4.5, 0.2], [ 12.5,  -4.5, -0.4]
  ];
  crates.forEach((c, i) => {
    addGeometryNode(`Crate_${String(i + 1).padStart(2, '0')}`, sharedCC0.crate, [c[0], 0.0, c[1]], c[2]);
  });

  // 12 Explosive / Hazmat Barrels (`Barrel_01..12`)
  const barrels = [
    [ 25.5, -21.5], [ 27.2, -23.5], [ 19.5, -19.0], [ 24.5, -25.0],
    [-25.5, -21.5], [-24.5, -25.0], [ 25.5,  21.5], [ 24.5,  25.0],
    [-51.0,  -8.0], [ 51.0,  -8.0], [-51.0,   8.0], [ 51.0,   8.0]
  ];
  barrels.forEach((b, i) => {
    addGeometryNode(`Barrel_${String(i + 1).padStart(2, '0')}`, sharedCC0.barrel, [b[0], 0.0, b[1]], i * 0.7);
  });

  // 6 Portable Diesel Generators (`Generator_01..06`)
  const gens = [
    [ 26.5,  21.5,  0.0],  [ 33.0,  19.5, -1.57],
    [-51.0, -19.5,  1.57], [ 51.0, -19.5, -1.57],
    [-51.0,  19.5,  1.57], [ 51.0,  19.5, -1.57]
  ];
  gens.forEach((g, i) => {
    addGeometryNode(`Generator_${String(i + 1).padStart(2, '0')}`, sharedCC0.generator, [g[0], 0.0, g[1]], g[2]);
  });

  // 8 High-Voltage Industrial PowerBoxes (`PowerBox_01..08`)
  const pboxes = [
    [ 34.8,  21.5, -1.57], [ 34.8,  24.5, -1.57],
    [-34.8, -21.5,  1.57], [-34.8, -24.5,  1.57],
    [ 34.8, -21.5, -1.57], [-34.8,  21.5,  1.57],
    [-17.1,  -7.5,  1.57], [ 17.1,   7.5, -1.57]
  ];
  pboxes.forEach((p, i) => {
    addGeometryNode(`PowerBox_${String(i + 1).padStart(2, '0')}`, sharedCC0.powerBox, [p[0], 0.0, p[1]], p[2]);
  });

  // 4 Steel Frame Shelving Units in SW Customs Office & SE Maintenance Bay (`Server_Rack_Office_01..04`)
  const officeRacks = [
    [-34.6,  21.0,  1.57], [-28.2,  21.0,  1.57],
    [ 34.6, -24.5, -1.57], [-34.6, -19.5,  1.57]
  ];
  officeRacks.forEach((r, i) => {
    addGeometryNode(`Server_Rack_Office_0${i + 1}`, sharedCC0.shelves, [r[0], 0.0, r[1]], r[2]);
  });

  // Outer Perimeter Cliff_Perimeter_01..10 & Rock_Rubble_01..08 (Strictly inside [-56, 56] x [-40, 40] so World AABB is exact 112x80m,
  // and `ImportedMap._build_outer_world` clones them automatically!)
  const cliffs = [
    [-31.0, -38.4,  0.0],  [ 31.0, -38.4,  0.0],  [-54.2,  -8.5,  1.57],
    [-31.0,  38.4,  3.14], [ 31.0,  38.4,  3.14], [ 54.2,   8.5, -1.57],
    [-54.2, -18.5,  1.57], [-54.2,  18.5,  1.57],
    [ 54.2, -18.5, -1.57], [ 54.2,  18.5, -1.57]
  ];
  cliffs.forEach((c, i) => {
    addGeometryNode(`Cliff_Perimeter_${String(i + 1).padStart(2, '0')}`, sharedCC0.cliff, [c[0], -0.05, c[1]], c[2]);
  });

  const boulders = [
    [-52.5, -12.5, 0.2], [ 52.5, -12.5, 1.1], [-52.5,  12.5, 2.3], [ 52.5,  12.5, 0.8],
    [-34.0, -36.8, 0.5], [ 34.0, -36.8, 1.9], [-34.0,  36.8, 2.7], [ 34.0,  36.8, 0.4]
  ];
  boulders.forEach((b, i) => {
    addGeometryNode(`Rock_Rubble_${String(i + 1).padStart(2, '0')}`, sharedCC0.boulder, [b[0], -0.05, b[1]], b[2]);
  });
}
buildSpecializedSectorsAndProps();

// ============================================================================
// 8. 165 FLOOR DECALS (`Warehouse_Decal_001..165`) & 12 BLOOD/HYDRAULIC SPILLS (`Warehouse_BloodSpill_01..12`)
// ALL STRICTLY ZERO EMISSION (`alphaMode: "MASK"`, `no emissiveFactor`)!
// ============================================================================
function buildWarehouseDecals() {
  function addFloorDecalPatch(builder, cx, y, cz, sx, sz, yaw = 0, gridX = 3, gridZ = 3) {
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

  // (A) 12 Non-Emissive Bloody Drag Trails & Hydraulic Oil Spills (`Warehouse_BloodSpill_01..12`)
  const bloodSpillSpecs = [
    { cx:  -7.2, cz:  -3.5, sx: 3.4, sz: 2.2, yaw: 0.45 },
    { cx:   7.2, cz:   3.5, sx: 3.4, sz: 2.2, yaw: -2.65 },
    { cx:  -3.2, cz:   7.5, sx: 2.8, sz: 2.4, yaw: 1.15 },
    { cx:   3.2, cz:  -7.5, sx: 2.8, sz: 2.4, yaw: -1.95 },
    { cx: -28.0, cz:  -4.2, sx: 3.6, sz: 2.0, yaw: 1.57 },
    { cx: -28.0, cz:   4.2, sx: 3.6, sz: 2.0, yaw: 1.57 },
    { cx:  28.0, cz:  -4.2, sx: 3.6, sz: 2.0, yaw: 1.57 },
    { cx:  28.0, cz:   4.2, sx: 3.6, sz: 2.0, yaw: 1.57 },
    { cx:  -2.5, cz: -21.5, sx: 3.2, sz: 2.2, yaw: 0.85 },
    { cx:   2.5, cz:  21.5, sx: 3.2, sz: 2.2, yaw: -2.25 },
    { cx: -21.5, cz: -19.5, sx: 2.9, sz: 2.3, yaw: 0.35 },
    { cx:  21.5, cz:  19.5, sx: 2.9, sz: 2.3, yaw: -1.45 }
  ];
  bloodSpillSpecs.forEach((sp, idx) => {
    const bSpill = new MeshBuilder();
    const bTrail = new MeshBuilder();
    addFloorDecalPatch(bSpill, sp.cx, 0.0175, sp.cz, sp.sx, sp.sz, sp.yaw, 4, 4);
    addFloorDecalPatch(bTrail, sp.cx + 0.65, 0.0182, sp.cz - 0.45, sp.sx * 0.75, sp.sz * 0.75, sp.yaw + 0.4, 3, 3);
    const sName = `Warehouse_BloodSpill_${String(idx + 1).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bSpill, mat: MAT.decalBloodHydraulic },
      { builder: bTrail, mat: MAT.decalBloodTrail }
    ]));
  });

  // (B) 165 Alpha-Masked Non-Emissive Floor Decals (`Warehouse_Decal_001..165`)
  const decalMats = [
    MAT.decalLaneStripes,
    MAT.decalBloodHydraulic,
    MAT.decalPackingLabels,
    MAT.decalTireTracks,
    MAT.decalOilSpill,
    MAT.decalBloodTrail,
    MAT.decalChemicalPuddle,
    MAT.decalScorchCrater,
    MAT.decalMossPatch
  ];

  for (let i = 1; i <= 165; i++) {
    const b = new MeshBuilder();
    let cx, cz, matIdx, yaw, sx, sz;

    if (i <= 36) {
      // Central Automated Conveyor & Gantry Crane Sorting Arena: worn non-emissive forklift lane stripes, hydraulic spills, packing labels
      const ang = (i / 36) * Math.PI * 2 + randRange(-0.08, 0.08);
      const r = randRange(3.2, 15.2);
      cx = Math.cos(ang) * r;
      cz = Math.sin(ang) * r;
      matIdx = (i % 3 === 0) ? MAT.decalLaneStripes : ((i % 3 === 1) ? MAT.decalPackingLabels : MAT.decalBloodHydraulic);
      yaw = (i % 3 === 0) ? (Math.round(ang / (Math.PI * 0.5)) * Math.PI * 0.5) : randRange(0, Math.PI * 2);
      sx = randRange(2.0, 3.8);
      sz = randRange(1.8, 3.4);
    } else if (i <= 96) {
      // West & East High-Bay Pallet Rack CQB Aisles: forklift safety lane stripes, tire skid marks, scattered barcode shipping labels
      const isEast = (i % 2) === 0;
      const sideSign = isEast ? 1 : -1;
      cx = sideSign * randRange(19.0, 41.0);
      cz = randRange(-22.5, 22.5);
      matIdx = (i % 4 === 0) ? MAT.decalLaneStripes : ((i % 4 === 1) ? MAT.decalTireTracks : ((i % 4 === 2) ? MAT.decalPackingLabels : MAT.decalBloodHydraulic));
      yaw = (i % 2 === 0) ? Math.PI * 0.5 : randRange(0, Math.PI * 2);
      sx = randRange(2.0, 4.0);
      sz = randRange(1.8, 3.2);
    } else if (i <= 136) {
      // North & South Loading Docks & Semi-Truck Approaches: heavy dual tire tracks, diesel oil spills, scorch craters, chemical puddles
      const isSouth = (i % 2) === 0;
      cx = randRange(-34.0, 34.0);
      cz = isSouth ? randRange(17.0, 35.0) : randRange(-35.0, -17.0);
      matIdx = (i % 4 === 0) ? MAT.decalTireTracks : ((i % 4 === 1) ? MAT.decalOilSpill : ((i % 4 === 2) ? MAT.decalChemicalPuddle : MAT.decalScorchCrater));
      yaw = randRange(0, Math.PI * 2);
      sx = randRange(2.2, 4.2);
      sz = randRange(2.0, 3.8);
    } else {
      // Outer East/West Cross-Docking Alleys & Corner Freight Dispatch Yards
      const sideSign = (i % 2 === 0) ? -1 : 1;
      cx = sideSign * randRange(38.0, 52.0);
      cz = randRange(-35.0, 35.0);
      matIdx = decalMats[i % decalMats.length];
      yaw = randRange(0, Math.PI * 2);
      sx = randRange(2.0, 3.8);
      sz = randRange(2.0, 3.8);
    }

    const y = 0.018 + (i % 7) * 0.0008;
    addFloorDecalPatch(b, cx, y, cz, sx, sz, yaw, 3, 3);

    const dName = `Warehouse_Decal_${String(i).padStart(3, '0')}`;
    const mIdx = registerMesh(`${dName}_Mesh`, [{ builder: b, mat: matIdx }]);
    addGeometryNode(dName, mIdx);
  }
}
buildWarehouseDecals();

// ============================================================================
// 9. 32 SCATTER DEBRIS GROUPS (`Warehouse_Scatter_01..32`, Y < 0.28m) & 36 OUTER WEED CLUSTERS (`Warehouse_Grass_01..36`)
// ============================================================================
function buildScatterAndGrass() {
  // 32 Scatter groups: broken wooden pallet slats, crushed cardboard parcels, barcode manifests, tools (Y < 0.28m, >= 2.0m clear of spawns/cards/doors)
  for (let s = 1; s <= 32; s++) {
    const bWood = new MeshBuilder();
    const bCardboard = new MeshBuilder();

    const gx = ((s - 1) % 8) - 3.5;
    const gz = Math.floor((s - 1) / 8) - 1.5;
    const baseCx = gx * 12.5;
    const baseCz = gz * 18.5;

    let added = 0;
    let attempts = 0;
    while (added < 22 && attempts < 80) {
      attempts++;
      const px = Math.max(-52.0, Math.min(52.0, baseCx + randRange(-5.4, 5.4)));
      const pz = Math.max(-36.5, Math.min(36.5, baseCz + randRange(-7.5, 7.5)));
      if (!isClearOfGameplayPoints(px, pz, -1.6)) continue; // keep >= 2.1m clear of all spawns/cards/doors

      const yaw = randRange(0, Math.PI * 2);
      if (added % 2 === 0) {
        // Broken wooden pallet slat / corner block (height 0.04..0.11m < 0.28m)
        const w = randRange(0.22, 0.55);
        const h = randRange(0.035, 0.095);
        const d = randRange(0.10, 0.22);
        bWood.addBeveledBox(px, h * 0.5 + 0.015, pz, w, h, d, yaw, 0.008, 2.0, 2, 1, 1);
      } else {
        // Crushed cardboard shipping carton / tape roll / manifest clipboard (height <= 0.16m < 0.28m)
        const w = randRange(0.24, 0.44);
        const h = randRange(0.04, 0.13);
        const d = randRange(0.20, 0.38);
        bCardboard.addBeveledBox(px, h * 0.5 + 0.015, pz, w, h, d, yaw + 0.4, 0.01, 1.8, 2, 1, 2);
      }
      added++;
    }

    const sName = `Warehouse_Scatter_${String(s).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bWood, mat: MAT.darkWood },
      { builder: bCardboard, mat: MAT.cardboardShrinkwrap }
    ]));
  }

  // 36 Outer Freight Yard Weed / Moss Scrub Clusters along perimeter barriers (`Warehouse_Grass_01..36`, alphaMode: MASK, 0 emission!)
  const bSharedGrass = new MeshBuilder();
  for (let p = 0; p < 3; p++) {
    const ang = (p / 3) * Math.PI;
    const c = Math.cos(ang) * 0.44;
    const s = Math.sin(ang) * 0.44;
    bSharedGrass.addQuad([-c, 0.0, -s], [c, 0.0, s], [c, 0.42, s], [-c, 0.42, -s], [-s, 0.2, c], 0, 1, 1, 0);
  }
  const grassMesh = registerMesh('Warehouse_Grass_SharedMesh', [{ builder: bSharedGrass, mat: MAT.decalMossPatch }]);

  for (let g = 1; g <= 36; g++) {
    const sx = (g % 2 === 0) ? -1 : 1;
    const sz = (g % 4 < 2) ? -1 : 1;
    let gx, gz;
    if (g <= 24) {
      gx = sx * randRange(44.2, 53.5);
      gz = sz * randRange(4.0, 36.8);
    } else {
      gx = sx * randRange(8.0, 38.0);
      gz = sz * randRange(33.5, 37.8);
    }
    addGeometryNode(`Warehouse_Grass_${String(g).padStart(2, '0')}`, grassMesh, [gx, 0.0, gz], randRange(0, Math.PI * 2));
  }
}
buildScatterAndGrass();

// ============================================================================
// 10. ASSEMBLE GLTF SCENE HIERARCHY (Exact Contract with ImportedMap.gd & GameManager.gd)
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
  name: 'Logistics_Warehouse_Map',
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
    generator: 'TacticalDark Warehouse v3 Node.js Procedural Builder',
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

// Write Map7_Lojistik_Depo_Labirenti_4v4v4v4_v3.gltf.import
const gltfResPath = `res://asset model/haritalar/Map7_Depo_v3/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dwarehouse4v4v3map7"
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
// 11. MATHEMATICAL & LEVEL DESIGN VALIDATION REPORT
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
  if (wMinX < -56.05 || wMaxX > 56.05 || wMinZ < -40.05 || wMaxZ > 40.05) {
    console.error(`ERROR: World AABB exceeds 112x80m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
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

  // 4. Verify all Decal & Grass materials have alphaMode: "MASK" and ZERO emissiveFactor anywhere!
  for (const m of materials) {
    if (m.name.includes('Decal') || m.name.includes('Grass')) {
      if (m.alphaMode !== 'MASK') {
        console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
        errors++;
      }
    }
    if (m.emissiveFactor) {
      console.error(`ERROR: Material ${m.name} has emissiveFactor! Must be 0 emission.`);
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

  // 6. Verify all 16 DoorPoints have >= 3.5m clear horizontal radius from every solid collider
  const noCollideWords = ['Terrain', 'Floor', 'Canopy', 'Decal', 'Scatter', 'Grass', 'BloodSpill'];
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
  console.log(' LOJISTIK DEPO LABIRENTI v3 (Map7_Depo_v3) VALIDATION SUMMARY');
  console.log('================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 untextured, 0 glowing floor lines)`);
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
