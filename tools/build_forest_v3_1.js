#!/usr/bin/env node
/**
 * build_forest_v3_1.js
 * Procedurally constructs the complete Night Forest Military Camp & Sawmill v3.1 glTF + .bin + .import package:
 *   asset model/haritalar/Map4_Orman_v3_1/Map4_Orman_Kereste_Kampi_5v5v5v5_v3_1.gltf
 *
 * Design & Performance Contract:
 * - ~100x100m playable footprint (X in [-50, 50], Z in [-50, 50]), flat walkable ground Y = 0.0m
 * - Intel Iris Xe friendly: 120K-165K total triangles, 0 glTF lights, 0 emission across all materials
 * - Rich dense forest & nature:
 *   * 84+ perimeter pine/fir trees + 44+ interior tactical cover pine/fir trees (128+ total!)
 *     - Solid convex trunks (`Prop_TreeTrunk_*`, wood_log_bark)
 *     - 3-tier layered non-colliding auto-fading canopies (`Prop_TreeCanopy_*`, foliage_pine_needles, alphaMode: MASK)
 *   * 28+ cut tree stumps (`Prop_Stump_*`) + 18+ fallen tree logs (`Prop_FallenLog_*`) as natural cover
 *   * 108+ low-poly crossed-card ferns & forest bushes (`Prop_Fern_Grass_*`, foliage_fern_bush, no collision/shadows)
 *   * 204+ ground decals (`Decal_*`, alphaMode: MASK, 0 emission): creeping vines/ivy, moss patches,
 *     fallen leaves, radiating tree roots, and wet mud puddles
 * - Military Camp & Sawmill Architecture:
 *   * Winding shallow forest creek (`Floor_Terrain_ForestGround` dips to Y=-0.14m + `Water_CreekSurface` at Y=-0.05m)
 *   * 4 wide (4.6m) flush wooden plank bridges (`Floor_Bridge_01..04`) at Y=0.0m for snag-free crossing
 *   * West Sawmill Hall & NW Lumber Shed (`Wall_Sawmill_*`, `Wall_LumberShed_*`), open-top with narrow eaves
 *   * East Military Barracks & SE Armory/Generator Yard (`Wall_Barracks_*`, `Wall_Armory_*`)
 *   * 4 Corner/Mid Wooden Watchtowers (solid corner legs + overhead `Prop_WatchtowerCanopy_*`)
 *   * 12 stacked log piles (`Prop_LogPile_*`), 16 muddy sandbag bunkers (`Prop_Sandbag_*`),
 *     36+ mossy granite boulders (`Prop_Rock_Boulder_*`, `Prop_Cliff_*`), olive crates, generators, containers
 * - Exact ImportedMap.gd & GameManager.gd Contract:
 *   * 20 Team Spawns: `Spawn_Team0_0..4` .. `Spawn_Team3_0..4` inside `SpawnPoints/Team0_Spawn..Team3_Spawn` (Y=0.05)
 *   * 18 Card Candidate Points: `CardPoint_01..18` + `Prop_CardPedestal_01..18` (all >= 18.0m from every spawn)
 *   * 16 Extraction Door Points: `DoorPoint_01..16` along outer perimeter (all >= 26.5m from every spawn, >= 3.6m clear)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map4_Orman_v3_1');
const GLTF_NAME = 'Map4_Orman_Kereste_Kampi_5v5v5v5_v3_1.gltf';
const BIN_NAME = 'Map4_Orman_Kereste_Kampi_5v5v5v5_v3_1.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Deterministic PRNG ---
let rngState = 2026112404;
function rand() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296.0;
}
function randRange(a, b) {
  return a + (b - a) * rand();
}
function randInt(a, b) {
  return Math.floor(randRange(a, b + 1));
}

// --- Creek Geometry Math ---
// Winding north-south shallow creek near center
function creekCenterX(z) {
  return 3.0 * Math.sin(z * 0.055) + 0.8 * Math.cos(z * 0.03);
}
const CREEK_HALF_WIDTH = 3.0;      // Water surface half-width
const CREEK_BANK_WIDTH = 1.6;      // Smooth slope bank width outside water
const CREEK_DEPTH = -0.14;         // Shallow walkable bed depth
const BRIDGE_ZS = [-30.0, -10.0, 10.0, 30.0];
const BRIDGE_HALF_LEN_Z = 2.3;     // 4.6m wide bridges

function isOnBridge(x, z, padX = 0, padZ = 0) {
  for (const bz of BRIDGE_ZS) {
    const cx = creekCenterX(bz);
    if (Math.abs(z - bz) <= BRIDGE_HALF_LEN_Z + padZ && Math.abs(x - cx) <= 4.9 + padX) {
      return true;
    }
  }
  return false;
}

function groundHeightAt(x, z) {
  const cx = creekCenterX(z);
  const d = Math.abs(x - cx);
  if (d >= CREEK_HALF_WIDTH + CREEK_BANK_WIDTH) return 0.0;
  if (d <= CREEK_HALF_WIDTH) return CREEK_DEPTH;
  const t = (d - CREEK_HALF_WIDTH) / CREEK_BANK_WIDTH;
  // Smoothstep from CREEK_DEPTH to 0.0
  const s = t * t * (3 - 2 * t);
  return CREEK_DEPTH * (1 - s);
}

function distToCreekCenter(x, z) {
  return Math.abs(x - creekCenterX(z));
}

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

  addBox(cx, cy, cz, sx, sy, sz, yaw = 0, uvScale = 0.5, segsX = 1, segsY = 1, segsZ = 1) {
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
    const addGridFace = (origin, uVec, vVec, nVec, uSteps, vSteps, uLen, vLen) => {
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
          this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], fu * uLen * uvScale, fv * vLen * uvScale, wt[0], wt[1], wt[2], 1);
        }
      }
      for (let iv = 0; iv < vSteps; iv++) {
        for (let iu = 0; iu < uSteps; iu++) {
          const a = baseIdx + iv * (uSteps + 1) + iu;
          const b = a + 1;
          const c = a + (uSteps + 1);
          const d = c + 1;
          this.ind.push(a, b, d, a, d, c);
        }
      }
    };
    addGridFace([-hx, -hy, hz], [sx, 0, 0], [0, sy, 0], [0, 0, 1], segsX, segsY, sx, sy);
    addGridFace([hx, -hy, -hz], [-sx, 0, 0], [0, sy, 0], [0, 0, -1], segsX, segsY, sx, sy);
    addGridFace([hx, -hy, hz], [0, 0, -sz], [0, sy, 0], [1, 0, 0], segsZ, segsY, sz, sy);
    addGridFace([-hx, -hy, -hz], [0, 0, sz], [0, sy, 0], [-1, 0, 0], segsZ, segsY, sz, sy);
    addGridFace([-hx, hy, hz], [sx, 0, 0], [0, 0, -sz], [0, 1, 0], segsX, segsZ, sx, sz);
    addGridFace([-hx, -hy, -hz], [sx, 0, 0], [0, 0, sz], [0, -1, 0], segsX, segsZ, sx, sz);
  }

  addBeveledBox(cx, cy, cz, sx, sy, sz, yaw = 0, bevel = 0.035, uvScale = 0.5, segsX = 1, segsY = 1, segsZ = 1) {
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

    const addGridFace = (origin, uVec, vVec, nVec, uSteps, vSteps, uLen, vLen) => {
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
          this.addVertex(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], fu * uLen * uvScale, fv * vLen * uvScale, wt[0], wt[1], wt[2], 1);
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

  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 10, heightSegs = 1, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
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
        const wn = xformN(c, (rBottom - rTop) / Math.max(0.01, height), s);
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

  // Organic displaced rock / boulder mesh
  addBoulder(cx, cy, cz, rx, ry, rz, latSegs = 6, lonSegs = 9, seed = 1) {
    const baseIdx = this.pos.length / 3;
    const verts = [];
    for (let il = 0; il <= latSegs; il++) {
      const v = il / latSegs;
      const phi = v * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let io = 0; io <= lonSegs; io++) {
        const u = io / lonSegs;
        const theta = u * Math.PI * 2;
        const st = Math.sin(theta), ct = Math.cos(theta);
        const nx = sp * ct, ny = cp, nz = sp * st;
        // Deterministic organic rock facets
        const n1 = Math.sin(nx * 3.1 + seed * 1.7) * Math.cos(ny * 2.7 - seed) * Math.sin(nz * 3.5 + seed * 0.9);
        const n2 = Math.cos((nx + nz) * 5.2 + seed * 2.3) * 0.08;
        const disp = 1.0 + n1 * 0.22 + n2;
        let ly = ny * ry * disp;
        if (ly < -ry * 0.55) ly = -ry * 0.55; // Flatten bottom to sit solidly in soil
        const px = cx + nx * rx * disp;
        const py = cy + ly;
        const pz = cz + nz * rz * disp;
        verts.push([px, py, pz, nx, ny, nz, u * 2.0, v * 1.5]);
      }
    }
    for (const v of verts) {
      this.addVertex(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], -v[5], 0, v[3], 1);
    }
    for (let il = 0; il < latSegs; il++) {
      for (let io = 0; io < lonSegs; io++) {
        const a = baseIdx + il * (lonSegs + 1) + io;
        const b = a + 1;
        const c = a + (lonSegs + 1);
        const d = c + 1;
        this.ind.push(a, c, d, a, d, b);
      }
    }
  }

  // Scalloped pine bough cone tier (for lush low-poly pine/fir trees)
  addPineTier(cx, cy, cz, rBottom, rTop, height, radialSegs = 9, droop = 0.22, yawOffset = 0, uvScale = 1.4) {
    const baseIdx = this.pos.length / 3;
    const rings = 2;
    for (let ir = 0; ir <= rings; ir++) {
      const fh = ir / rings;
      for (let ia = 0; ia <= radialSegs; ia++) {
        const fa = ia / radialSegs;
        const ang = fa * Math.PI * 2 + yawOffset;
        const scallop = (ia % 2 === 0) ? 1.08 : 0.88;
        const r = (rBottom + (rTop - rBottom) * fh) * (fh < 0.95 ? scallop : 1.0);
        const yDroop = (1 - fh) * (ia % 2 === 0 ? -droop : droop * 0.25);
        const lx = Math.cos(ang) * r;
        const lz = Math.sin(ang) * r;
        const ly = fh * height + yDroop;
        const nx = Math.cos(ang) * 0.78;
        const ny = 0.62;
        const nz = Math.sin(ang) * 0.78;
        this.addVertex(cx + lx, cy + ly, cz + lz, nx, ny, nz, fa * uvScale * 2.5, (1 - fh) * uvScale, -Math.sin(ang), 0, Math.cos(ang), 1);
      }
    }
    for (let ir = 0; ir < rings; ir++) {
      for (let ia = 0; ia < radialSegs; ia++) {
        const a = baseIdx + ir * (radialSegs + 1) + ia;
        const b = a + 1;
        const c = a + (radialSegs + 1);
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

function makePBRMaterial(texBaseName, matName, opts = {}) {
  const albedoTex = getTextureIndex(`textures/${texBaseName}_albedo.png`);
  const normalTex = getTextureIndex(`textures/${texBaseName}_normal.png`);
  const ormTex = getTextureIndex(`textures/${texBaseName}_orm.png`);
  const mat = {
    doubleSided: opts.doubleSided !== undefined ? opts.doubleSided : false,
    name: matName,
    normalTexture: {
      index: normalTex,
      scale: opts.normalScale !== undefined ? opts.normalScale : 1.2
    },
    occlusionTexture: {
      index: ormTex,
      strength: opts.aoStrength !== undefined ? opts.aoStrength : 1.0
    },
    pbrMetallicRoughness: {
      baseColorTexture: { index: albedoTex },
      metallicRoughnessTexture: { index: ormTex }
    }
  };
  if (opts.metallicFactor !== undefined) mat.pbrMetallicRoughness.metallicFactor = opts.metallicFactor;
  if (opts.roughnessFactor !== undefined) mat.pbrMetallicRoughness.roughnessFactor = opts.roughnessFactor;
  if (opts.alphaMode) {
    mat.alphaMode = opts.alphaMode;
    if (opts.alphaMode === 'MASK') mat.alphaCutoff = opts.alphaCutoff !== undefined ? opts.alphaCutoff : 0.45;
  }
  // STRICTLY ZERO EMISSION!
  return registerMaterial(mat);
}

// --- Register Exact 19 Approved Forest v3.1 PBR Materials (0 EMISSION) ---
const MAT = {
  forestSoil:    makePBRMaterial('ground_forest_soil',   'Mat_Ground_ForestSoil',   { metallicFactor: 0.0, roughnessFactor: 0.92, normalScale: 1.35 }),
  mudPath:       makePBRMaterial('ground_mud_path',      'Mat_Ground_MudPath',      { metallicFactor: 0.0, roughnessFactor: 0.72, normalScale: 1.30 }),
  mossFloor:     makePBRMaterial('ground_moss_floor',    'Mat_Ground_MossFloor',    { metallicFactor: 0.0, roughnessFactor: 0.95, normalScale: 1.35 }),
  creekWater:    makePBRMaterial('water_creek_bed',      'Mat_Water_CreekBed',      { metallicFactor: 0.05, roughnessFactor: 0.16, normalScale: 1.25 }),
  logBark:       makePBRMaterial('wood_log_bark',        'Mat_Wood_LogBark',        { metallicFactor: 0.0, roughnessFactor: 0.90, normalScale: 1.40 }),
  logCut:        makePBRMaterial('wood_log_cut',         'Mat_Wood_LogCut',         { metallicFactor: 0.0, roughnessFactor: 0.85, normalScale: 1.25 }),
  cabinPlanks:   makePBRMaterial('wood_cabin_planks',    'Mat_Wood_CabinPlanks',    { metallicFactor: 0.0, roughnessFactor: 0.86, normalScale: 1.30 }),
  rustyShed:     makePBRMaterial('metal_rusty_shed',     'Mat_Metal_RustyShed',     { metallicFactor: 0.65, roughnessFactor: 0.72, normalScale: 1.35, doubleSided: true }),
  milOlive:      makePBRMaterial('metal_military_olive', 'Mat_Metal_MilitaryOlive', { metallicFactor: 0.55, roughnessFactor: 0.62, normalScale: 1.25 }),
  mossyRock:     makePBRMaterial('rock_mossy_granite',   'Mat_Rock_MossyGranite',   { metallicFactor: 0.0, roughnessFactor: 0.88, normalScale: 1.45 }),
  pineNeedles:   makePBRMaterial('foliage_pine_needles', 'Mat_Foliage_PineNeedles', { metallicFactor: 0.0, roughnessFactor: 0.82, normalScale: 1.15, alphaMode: 'MASK', alphaCutoff: 0.42, doubleSided: true }),
  fernBush:      makePBRMaterial('foliage_fern_bush',    'Mat_Foliage_FernBush',    { metallicFactor: 0.0, roughnessFactor: 0.80, normalScale: 1.15, alphaMode: 'MASK', alphaCutoff: 0.42, doubleSided: true }),
  sandbagMud:    makePBRMaterial('fabric_sandbag_mud',   'Mat_Fabric_SandbagMud',   { metallicFactor: 0.0, roughnessFactor: 0.92, normalScale: 1.35 }),
  crateOlive:    makePBRMaterial('prop_crate_olive',     'Mat_Prop_CrateOlive',     { metallicFactor: 0.12, roughnessFactor: 0.78, normalScale: 1.30 }),
  decalVines:    makePBRMaterial('decal_vines_ivy',      'Mat_Decal_VinesIvy',      { metallicFactor: 0.0, roughnessFactor: 0.82, normalScale: 1.25, alphaMode: 'MASK', alphaCutoff: 0.42 }),
  decalMoss:     makePBRMaterial('decal_moss_patch',     'Mat_Decal_MossPatch',     { metallicFactor: 0.0, roughnessFactor: 0.90, normalScale: 1.30, alphaMode: 'MASK', alphaCutoff: 0.42 }),
  decalLeaves:   makePBRMaterial('decal_fallen_leaves',  'Mat_Decal_FallenLeaves',  { metallicFactor: 0.0, roughnessFactor: 0.85, normalScale: 1.25, alphaMode: 'MASK', alphaCutoff: 0.42 }),
  decalMud:      makePBRMaterial('decal_mud_puddle',     'Mat_Decal_MudPuddle',     { metallicFactor: 0.04, roughnessFactor: 0.14, normalScale: 1.15, alphaMode: 'MASK', alphaCutoff: 0.42 }),
  decalRoots:    makePBRMaterial('decal_tree_roots',     'Mat_Decal_TreeRoots',     { metallicFactor: 0.0, roughnessFactor: 0.88, normalScale: 1.35, alphaMode: 'MASK', alphaCutoff: 0.42 })
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

  const posBv = appendBuffer(Buffer.from(new Float32Array(posArr).buffer), 34962);
  const normBv = appendBuffer(Buffer.from(new Float32Array(normArr).buffer), 34962);
  const uvBv = appendBuffer(Buffer.from(new Float32Array(uvArr).buffer), 34962);
  const tanBv = appendBuffer(Buffer.from(new Float32Array(tanArr).buffer), 34962);

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
  const indBv = appendBuffer(Buffer.from(indTyped.buffer), 34963);
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
    if (!item.builder || item.builder.pos.length === 0) continue;
    const prim = createPrimitiveFromData(item.builder.pos, item.builder.norm, item.builder.uv, item.builder.tan, item.builder.ind, item.mat);
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

// ============================================================================
// 1. SPAWN, CARD, AND DOOR SPECIFICATION (Exact Gameplay Rules)
// ============================================================================
const TEAM_CENTERS = [
  [-41.0, 0.05, -41.0], // Team0 (NW Logging Camp)
  [ 41.0, 0.05, -41.0], // Team1 (NE Military Outpost)
  [-41.0, 0.05,  41.0], // Team2 (SW Timber Yard)
  [ 41.0, 0.05,  41.0]  // Team3 (SE Armory Camp)
];
const SPAWN_OFFSETS = [
  [ 0.0,  0.0],
  [-1.5, -1.5],
  [ 1.5, -1.5],
  [-1.5,  1.5],
  [ 1.5,  1.5]
];
const ALL_SPAWNS = [];
for (let t = 0; t < 4; t++) {
  for (let p = 0; p < 5; p++) {
    ALL_SPAWNS.push([
      TEAM_CENTERS[t][0] + SPAWN_OFFSETS[p][0],
      0.05,
      TEAM_CENTERS[t][2] + SPAWN_OFFSETS[p][1]
    ]);
  }
}

// 18 Card Candidate Points (ALL >= 18.0m from every spawn, on dry flat ground Y=1.15)
const CARD_POINTS = [
  // Sawmill & West Sector (6)
  [-22.0, 1.15,   0.0], // 01: Sawmill Hall Center
  [-22.0, 1.15, -18.0], // 02: North Log Yard Clearing
  [-22.0, 1.15,  18.0], // 03: South Log Yard Clearing
  [-36.0, 1.15,   0.0], // 04: West Timber Loading Bay
  [-22.5, 1.15, -31.0], // 05: NW Lumber Shed Interior
  [-22.0, 1.15,  29.0], // 06: SW Pine Clearing
  // Central Creek & Watchtower Crossroads (6)
  [ -8.5, 1.15, -10.0], // 07: West Approach to North-Mid Bridge
  [  8.5, 1.15, -10.0], // 08: East Approach to North-Mid Bridge
  [ -8.5, 1.15,  10.0], // 09: West Approach to South-Mid Bridge
  [  8.5, 1.15,  10.0], // 10: East Approach to South-Mid Bridge
  [ -9.0, 1.15, -30.0], // 11: North Bridge West Bank
  [  9.0, 1.15,  30.0], // 12: South Bridge East Bank
  // East Military Camp & Barracks Sector (6)
  [ 22.0, 1.15,  -4.0], // 13: East Command Barracks Interior
  [ 24.0, 1.15,  22.0], // 14: SE Armory Shed Interior
  [ 36.0, 1.15,   0.0], // 15: East Motor Pool Yard
  [ 24.0, 1.15, -26.0], // 16: NE Military Drill Clearing
  [ 12.0, 1.15, -34.0], // 17: North-East Forest Trail
  [ 35.0, 1.15, -16.0]  // 18: East Bunker Clearing
];

// 16 Extraction Door Candidate Points along outer perimeter (ALL >= 26.5m from every spawn, >= 3.6m clear)
const DOOR_POINTS = [
  // North Perimeter (4)
  [-12.5, 0.10, -45.2], // 01
  [ -6.0, 0.10, -45.2], // 02
  [  6.5, 0.10, -45.2], // 03
  [ 12.5, 0.10, -45.2], // 04
  // South Perimeter (4)
  [-12.5, 0.10,  45.2], // 05
  [ -6.5, 0.10,  45.2], // 06
  [  6.0, 0.10,  45.2], // 07
  [ 12.5, 0.10,  45.2], // 08
  // West Perimeter (4)
  [-45.2, 0.10, -12.5], // 09
  [-45.2, 0.10,  -4.2], // 10
  [-45.2, 0.10,   4.2], // 11
  [-45.2, 0.10,  12.5], // 12
  // East Perimeter (4)
  [ 45.2, 0.10, -12.5], // 13
  [ 45.2, 0.10,  -4.2], // 14
  [ 45.2, 0.10,   4.2], // 15
  [ 45.2, 0.10,  12.5]  // 16
];

// Clearance helpers for procedural placement (trees, rocks, stumps, decals, ferns)
const reservedZones = []; // { x, z, r }
function reserveZone(x, z, r) {
  reservedZones.push({ x, z, r });
}
// Reserve spawns, cards, doors, bridges, and main building footprints
for (const s of ALL_SPAWNS) reserveZone(s[0], s[2], 3.2);
for (const tc of TEAM_CENTERS) reserveZone(tc[0], tc[2], 6.0);
for (const c of CARD_POINTS) reserveZone(c[0], c[2], 2.8);
for (const d of DOOR_POINTS) reserveZone(d[0], d[2], 4.8);
for (const bz of BRIDGE_ZS) reserveZone(creekCenterX(bz), bz, 5.8);

function isClearOfPoints(x, z, spawnPad = 2.6, cardPad = 2.4, doorPad = 4.3) {
  for (const s of ALL_SPAWNS) {
    if (Math.hypot(x - s[0], z - s[2]) < spawnPad) return false;
  }
  for (const c of CARD_POINTS) {
    if (Math.hypot(x - c[0], z - c[2]) < cardPad) return false;
  }
  for (const d of DOOR_POINTS) {
    if (Math.hypot(x - d[0], z - d[2]) < doorPad) return false;
  }
  return true;
}

// Track placed solid obstacles so procedural trees/rocks/stumps don't overlap buildings or each other
const solidFootprints = []; // { x, z, r }
function registerSolidFootprint(x, z, r) {
  solidFootprints.push({ x, z, r });
}
function registerSolidRect(x0, z0, x1, z1, pad = 0.0) {
  const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
  const r = Math.hypot(x1 - x0, z1 - z0) * 0.5 + pad;
  solidFootprints.push({ rect: [x0 - pad, z0 - pad, x1 + pad, z1 + pad], x: cx, z: cz, r });
}
function isClearOfSolids(x, z, radius = 1.0) {
  for (const f of solidFootprints) {
    if (f.rect) {
      const [x0, z0, x1, z1] = f.rect;
      if (x >= x0 - radius && x <= x1 + radius && z >= z0 - radius && z <= z1 + radius) return false;
    } else {
      if (Math.hypot(x - f.x, z - f.z) < f.r + radius) return false;
    }
  }
  return true;
}

// ============================================================================
// 2. TERRAIN GROUND, SHALLOW CREEK, MUD TRAILS, MOSS CLEARINGS & 4 BRIDGES
// ============================================================================
function buildGroundAndCreek() {
  // 2A. Main Forest Ground (100x100m, 80x80 grid, smooth dip to Y=-0.14m in creek)
  const bTerrain = new MeshBuilder();
  const gridN = 80;
  const minC = -50.0, maxC = 50.0, size = maxC - minC;
  const uvScale = 0.14;
  for (let iz = 0; iz <= gridN; iz++) {
    const fz = iz / gridN;
    const z = minC + fz * size;
    for (let ix = 0; ix <= gridN; ix++) {
      const fx = ix / gridN;
      const x = minC + fx * size;
      const y = groundHeightAt(x, z);
      // Approximate normal from finite difference
      const hL = groundHeightAt(x - 0.5, z);
      const hR = groundHeightAt(x + 0.5, z);
      const hD = groundHeightAt(x, z - 0.5);
      const hU = groundHeightAt(x, z + 0.5);
      bTerrain.addVertex(x, y, z, hL - hR, 1.0, hD - hU, x * uvScale, z * uvScale, 1, 0, 0, 1);
    }
  }
  for (let iz = 0; iz < gridN; iz++) {
    for (let ix = 0; ix < gridN; ix++) {
      const a = iz * (gridN + 1) + ix;
      const b = a + 1;
      const c = a + (gridN + 1);
      const d = c + 1;
      // CCW looking from +Y -> (a, c, d) and (a, d, b)
      bTerrain.ind.push(a, c, d, a, d, b);
    }
  }
  addGeometryNode('Floor_Terrain_ForestGround', registerMesh('Floor_Terrain_ForestGround_Mesh', [
    { builder: bTerrain, mat: MAT.forestSoil }
  ]));

  // 2B. Winding Creek Water Surface (Y = -0.05m, NO collision via "Water" keyword)
  const bWater = new MeshBuilder();
  const wSegsZ = 48;
  const wSegsX = 4;
  for (let iz = 0; iz <= wSegsZ; iz++) {
    const fz = iz / wSegsZ;
    const z = -49.5 + fz * 99.0;
    const cx = creekCenterX(z);
    for (let ix = 0; ix <= wSegsX; ix++) {
      const fx = ix / wSegsX;
      const x = cx - (CREEK_HALF_WIDTH + 0.35) + fx * (CREEK_HALF_WIDTH + 0.35) * 2;
      bWater.addVertex(x, -0.05, z, 0, 1, 0, fx * 2.0, fz * 28.0, 1, 0, 0, 1);
    }
  }
  for (let iz = 0; iz < wSegsZ; iz++) {
    for (let ix = 0; ix < wSegsX; ix++) {
      const a = iz * (wSegsX + 1) + ix;
      const b = a + 1;
      const c = a + (wSegsX + 1);
      const d = c + 1;
      bWater.ind.push(a, c, d, a, d, b);
    }
  }
  addGeometryNode('Water_CreekSurface', registerMesh('Water_CreekSurface_Mesh', [
    { builder: bWater, mat: MAT.creekWater }
  ]));

  // 2C. Muddy Road & Camp Trail Patches (`Floor_MudPath_Network` at Y = 0.005m, no collision via Decal/flat)
  const bMud = new MeshBuilder();
  function addTrailStrip(x0, z0, x1, z1, width = 3.6) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const nx = -dz / len, nz = dx / len;
    const hw = width * 0.5;
    const steps = Math.max(2, Math.round(len / 3.0));
    const baseIdx = bMud.pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const mx = x0 + dx * f;
      const mz = z0 + dz * f;
      const yL = Math.max(0.004, groundHeightAt(mx - nx * hw, mz - nz * hw) + 0.005);
      const yR = Math.max(0.004, groundHeightAt(mx + nx * hw, mz + nz * hw) + 0.005);
      bMud.addVertex(mx - nx * hw, yL, mz - nz * hw, 0, 1, 0, 0, f * len * 0.25, 1, 0, 0, 1);
      bMud.addVertex(mx + nx * hw, yR, mz + nz * hw, 0, 1, 0, 1.0, f * len * 0.25, 1, 0, 0, 1);
    }
    for (let i = 0; i < steps; i++) {
      const a = baseIdx + i * 2;
      bMud.ind.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }
  // Connect camps to sawmill, barracks, and all 4 bridge approaches
  addTrailStrip(-40, -40, -22, -30, 3.8);
  addTrailStrip(-22, -30,  -6, -30, 3.8);
  addTrailStrip(  7, -30,  40, -40, 3.8);
  addTrailStrip(-40,  40, -22,  30, 3.8);
  addTrailStrip(-22,  30,  -6,  30, 3.8);
  addTrailStrip(  7,  30,  40,  40, 3.8);
  addTrailStrip(-22, -30, -22,  30, 4.2); // West Sawmill main logging road
  addTrailStrip( 22, -34,  22,  34, 4.2); // East Military camp road
  addTrailStrip(-36, -10,  -5, -10, 3.4); // West-to-Mid-North bridge
  addTrailStrip(  6, -10,  36, -10, 3.4); // East-to-Mid-North bridge
  addTrailStrip(-36,  10,  -5,  10, 3.4); // West-to-Mid-South bridge
  addTrailStrip(  6,  10,  36,  10, 3.4); // East-to-Mid-South bridge
  addGeometryNode('Decal_Floor_MudPaths', registerMesh('Decal_Floor_MudPaths_Mesh', [
    { builder: bMud, mat: MAT.mudPath }
  ]));

  // 2D. Large Mossy Forest Floor Clearings (`Decal_Floor_MossClearings` at Y = 0.007m)
  const bMoss = new MeshBuilder();
  const mossZones = [
    [-34, -22, 9, 7], [-34, 20, 9, 8], [34, -22, 8, 8], [34, 24, 9, 7],
    [-12, -20, 6, 7], [12, -20, 6, 7], [-12, 20, 6, 7], [12, 20, 6, 7],
    [-14, 0, 5, 7],   [14, 0, 5, 7],   [-36, 0, 6, 9],  [36, 0, 6, 9]
  ];
  for (const [mx, mz, sx, sz] of mossZones) {
    const hw = sx * 0.5, hd = sz * 0.5;
    bMoss.addQuad(
      [mx - hw, 0.007, mz + hd], [mx + hw, 0.007, mz + hd],
      [mx + hw, 0.007, mz - hd], [mx - hw, 0.007, mz - hd],
      [0, 1, 0], 0, 0, sx * 0.3, sz * 0.3
    );
  }
  addGeometryNode('Decal_Floor_MossClearings', registerMesh('Decal_Floor_MossClearings_Mesh', [
    { builder: bMoss, mat: MAT.mossFloor }
  ]));

  // 2E. 4 Wide Sturdy Wooden Bridges across the Creek (4.6m wide, Y = 0.0m flush!)
  for (let i = 0; i < BRIDGE_ZS.length; i++) {
    const bz = BRIDGE_ZS[i];
    const cx = creekCenterX(bz);
    const spanX = 9.8;
    const widthZ = 4.6;
    const bPlanks = new MeshBuilder();
    const bLogs = new MeshBuilder();

    // Main flush walkable bridge deck (top surface strictly at Y = 0.006m so zero step snag!)
    bPlanks.addBox(cx, -0.054, bz, spanX, 0.12, widthZ, 0, 0.45, 6, 1, 2);

    // Subtle visual deck plank slats along span (flush at Y=0.008m, 14 planks)
    const plankCount = 14;
    const plankW = (spanX - 0.6) / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const px = cx - (spanX - 0.6) * 0.5 + (p + 0.5) * plankW;
      bPlanks.addBox(px, -0.03, bz, plankW * 0.88, 0.072, widthZ - 0.12, 0, 0.6, 1, 1, 1);
    }

    // Heavy log stringer beams underneath (at Y = -0.14m)
    for (const zOff of [-1.85, 0.0, 1.85]) {
      bLogs.addCylinder(cx, -0.15, bz + zOff, 0.16, 0.16, spanX - 0.4, 8, 1, true, Math.PI * 0.5, Math.PI * 0.5, 1.2);
    }
    // Bridge bank support pilings & low side guard logs (leaving 4.1m clear walkable width!)
    for (const zSign of [-1, 1]) {
      const rz = bz + zSign * (widthZ * 0.5 - 0.12);
      // Low curb timber rail
      bPlanks.addBeveledBox(cx, 0.11, rz, spanX - 0.4, 0.18, 0.20, 0, 0.02, 0.5, 3, 1, 1);
      // 4 sturdy handrail posts + top rail on each side
      for (const xOff of [-4.2, -1.4, 1.4, 4.2]) {
        bLogs.addCylinder(cx + xOff, 0.48, rz, 0.11, 0.10, 0.96, 8, 1, true, 0, 0, 0.8);
      }
      bPlanks.addBeveledBox(cx, 0.88, rz, 8.6, 0.10, 0.12, 0, 0.015, 0.5, 2, 1, 1);
    }

    const idxStr = String(i + 1).padStart(2, '0');
    addGeometryNode(`Floor_Bridge_${idxStr}`, registerMesh(`Floor_Bridge_${idxStr}_Mesh`, [
      { builder: bPlanks, mat: MAT.cabinPlanks },
      { builder: bLogs, mat: MAT.logBark }
    ]));
  }
}
buildGroundAndCreek();

// ============================================================================
// 3. ARCHITECTURAL STRUCTURES: SAWMILL, BARRACKS, SHEDS, WATCHTOWERS & PERIMETER
// ============================================================================
function addCabinWallSegment(bPlanks, bLogs, bMetal, x0, z0, x1, z1, height = 2.9, thick = 0.46, useMetalSiding = false) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.25) return;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const yaw = -Math.atan2(dz, dx);
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const segsX = Math.max(2, Math.round(len * 0.7));

  // Main wall panel
  const targetB = useMetalSiding ? bMetal : bPlanks;
  targetB.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.03, 0.4, segsX, 2, 1);

  // Heavy timber base sill & top beam
  bPlanks.addBeveledBox(cx, 0.12, cz, len + 0.04, 0.24, thick + 0.08, yaw, 0.02, 0.4, Math.max(1, Math.round(len * 0.4)), 1, 1);
  bPlanks.addBeveledBox(cx, height - 0.10, cz, len + 0.06, 0.20, thick + 0.12, yaw, 0.02, 0.4, Math.max(1, Math.round(len * 0.4)), 1, 1);

  // Vertical log structural posts every ~3.2m
  const posts = Math.max(2, Math.floor(len / 3.2) + 1);
  for (let i = 0; i < posts; i++) {
    const t = posts === 1 ? 0 : (i / (posts - 1) - 0.5) * (len - 0.28);
    const px = cx + t * cosY;
    const pz = cz + t * sinY;
    bLogs.addCylinder(px, height * 0.5, pz, 0.16, 0.15, height + 0.08, 8, 1, true, 0, 0, 1.0);
  }
}

function buildBuildingsAndPerimeter() {
  // --- 3A. West Main Sawmill Hall (centered at (-22, 0), 14m x 18m -> X[-29, -15], Z[-9, 9]) ---
  // Open-top with 4 wide 4.2m doorways (North, South, East, West)
  {
    const bPlanks = new MeshBuilder();
    const bLogs = new MeshBuilder();
    const bMetal = new MeshBuilder();
    // North wall (Z=-9): X[-29, -24.2] & X[-19.8, -15] (4.4m center doorway)
    addCabinWallSegment(bPlanks, bLogs, bMetal, -29.0, -9.0, -24.2, -9.0, 3.0, 0.48, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -19.8, -9.0, -15.0, -9.0, 3.0, 0.48, false);
    // South wall (Z=+9)
    addCabinWallSegment(bPlanks, bLogs, bMetal, -29.0,  9.0, -24.2,  9.0, 3.0, 0.48, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -19.8,  9.0, -15.0,  9.0, 3.0, 0.48, false);
    // West wall (X=-29): Z[-9, -2.2] & Z[2.2, 9] (4.4m doorway)
    addCabinWallSegment(bPlanks, bLogs, bMetal, -29.0, -9.0, -29.0, -2.2, 3.0, 0.48, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -29.0,  2.2, -29.0,  9.0, 3.0, 0.48, true);
    // East wall (X=-15): Z[-9, -2.2] & Z[2.2, 9] (4.4m doorway)
    addCabinWallSegment(bPlanks, bLogs, bMetal, -15.0, -9.0, -15.0, -2.2, 3.0, 0.48, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -15.0,  2.2, -15.0,  9.0, 3.0, 0.48, true);
    // Narrow interior timber workbench along NW interior corner (clear of center CardPoint_01 at (-22, 0))
    bPlanks.addBeveledBox(-26.5, 0.55, -5.5, 3.2, 1.1, 1.4, 0, 0.03, 0.5, 2, 1, 1);
    bPlanks.addBeveledBox(-17.5, 0.55,  5.5, 3.2, 1.1, 1.4, 0, 0.03, 0.5, 2, 1, 1);

    addGeometryNode('Wall_Sawmill_MainHall', registerMesh('Wall_Sawmill_MainHall_Mesh', [
      { builder: bPlanks, mat: MAT.cabinPlanks },
      { builder: bLogs, mat: MAT.logBark },
      { builder: bMetal, mat: MAT.rustyShed }
    ]));
    // Narrow top eaves canopy (no collision, fades out if player behind it)
    const bEave = new MeshBuilder();
    bEave.addBox(-22.0, 3.12, -9.0, 14.8, 0.14, 1.2, 0, 0.4, 3, 1, 1);
    bEave.addBox(-22.0, 3.12,  9.0, 14.8, 0.14, 1.2, 0, 0.4, 3, 1, 1);
    bEave.addBox(-29.0, 3.12,  0.0, 1.2, 0.14, 18.8, 0, 0.4, 1, 1, 3);
    bEave.addBox(-15.0, 3.12,  0.0, 1.2, 0.14, 18.8, 0, 0.4, 1, 1, 3);
    addGeometryNode('Prop_Sawmill_CanopyEaves', registerMesh('Prop_Sawmill_CanopyEaves_Mesh', [
      { builder: bEave, mat: MAT.rustyShed }
    ]));
    registerSolidRect(-30.0, -10.0, -14.0, 10.0, 1.2);
  }

  // --- 3B. NW Lumber Shed (centered at (-22.5, -31), 11m x 9m -> X[-28.0, -17.0], Z[-35.5, -26.5]) ---
  {
    const bPlanks = new MeshBuilder();
    const bLogs = new MeshBuilder();
    const bMetal = new MeshBuilder();
    addCabinWallSegment(bPlanks, bLogs, bMetal, -28.0, -35.5, -17.0, -35.5, 2.8, 0.44, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -28.0, -35.5, -28.0, -26.5, 2.8, 0.44, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -17.0, -35.5, -17.0, -31.8, 2.8, 0.44, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, -28.0, -26.5, -23.7, -26.5, 2.8, 0.44, false);
    addGeometryNode('Wall_LumberShed_NW', registerMesh('Wall_LumberShed_NW_Mesh', [
      { builder: bPlanks, mat: MAT.cabinPlanks },
      { builder: bLogs, mat: MAT.logBark },
      { builder: bMetal, mat: MAT.rustyShed }
    ]));
    registerSolidRect(-28.7, -36.2, -16.3, -25.8, 1.0);
  }

  // --- 3C. East Military Command Barracks (centered at (+22, -4), 12m x 16m -> X[16, 28], Z[-12, 4]) ---
  {
    const bPlanks = new MeshBuilder();
    const bLogs = new MeshBuilder();
    const bMetal = new MeshBuilder();
    // North wall (Z=-12) with 4.2m center gap
    addCabinWallSegment(bPlanks, bLogs, bMetal, 16.0, -12.0, 19.9, -12.0, 3.0, 0.48, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 24.1, -12.0, 28.0, -12.0, 3.0, 0.48, true);
    // South wall (Z=+4) with 4.2m center gap
    addCabinWallSegment(bPlanks, bLogs, bMetal, 16.0,  4.0, 19.9,  4.0, 3.0, 0.48, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 24.1,  4.0, 28.0,  4.0, 3.0, 0.48, true);
    // West wall (X=16) with 4.2m gap at Z[-6.1, -1.9]
    addCabinWallSegment(bPlanks, bLogs, bMetal, 16.0, -12.0, 16.0, -6.1, 3.0, 0.48, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 16.0, -1.9, 16.0,  4.0, 3.0, 0.48, true);
    // East wall (X=28) with 4.2m gap
    addCabinWallSegment(bPlanks, bLogs, bMetal, 28.0, -12.0, 28.0, -6.1, 3.0, 0.48, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 28.0, -1.9, 28.0,  4.0, 3.0, 0.48, false);
    // Military olive roof trim fascia
    const bOlive = new MeshBuilder();
    bOlive.addBox(22.0, 3.08, -12.0, 12.6, 0.16, 0.9, 0, 0.4, 2, 1, 1);
    bOlive.addBox(22.0, 3.08,   4.0, 12.6, 0.16, 0.9, 0, 0.4, 2, 1, 1);
    addGeometryNode('Wall_Barracks_Main', registerMesh('Wall_Barracks_Main_Mesh', [
      { builder: bPlanks, mat: MAT.cabinPlanks },
      { builder: bLogs, mat: MAT.logBark },
      { builder: bMetal, mat: MAT.rustyShed },
      { builder: bOlive, mat: MAT.milOlive }
    ]));
    registerSolidRect(15.0, -13.0, 29.0, 5.0, 1.2);
  }

  // --- 3D. SE Military Armory & Generator Shed (centered at (+24, +22), 11m x 10m -> X[18.5, 29.5], Z[17, 27]) ---
  {
    const bPlanks = new MeshBuilder();
    const bLogs = new MeshBuilder();
    const bMetal = new MeshBuilder();
    addCabinWallSegment(bPlanks, bLogs, bMetal, 18.5, 17.0, 21.8, 17.0, 2.85, 0.46, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 26.2, 17.0, 29.5, 17.0, 2.85, 0.46, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 18.5, 27.0, 21.8, 27.0, 2.85, 0.46, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 26.2, 27.0, 29.5, 27.0, 2.85, 0.46, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 29.5, 17.0, 29.5, 27.0, 2.85, 0.46, true);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 18.5, 17.0, 18.5, 20.0, 2.85, 0.46, false);
    addCabinWallSegment(bPlanks, bLogs, bMetal, 18.5, 24.0, 18.5, 27.0, 2.85, 0.46, false);
    addGeometryNode('Wall_ArmoryShed_SE', registerMesh('Wall_ArmoryShed_SE_Mesh', [
      { builder: bPlanks, mat: MAT.cabinPlanks },
      { builder: bLogs, mat: MAT.logBark },
      { builder: bMetal, mat: MAT.rustyShed }
    ]));
    registerSolidRect(17.5, 16.0, 30.5, 28.0, 1.2);
  }

  // --- 3E. 4 Wooden Military Watchtowers ---
  const watchtowerCoords = [
    [-12.5, -21.0],
    [ 12.5, -21.0],
    [-12.5,  21.0],
    [ 12.5,  21.0]
  ];
  // Shared watchtower leg + overhead canopy meshes
  const bWtLegs = new MeshBuilder();
  const bWtCanopyPlank = new MeshBuilder();
  const bWtCanopyLog = new MeshBuilder();
  const legOff = 1.25;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bWtLegs.addCylinder(sx * legOff, 2.1, sz * legOff, 0.17, 0.14, 4.2, 8, 1, true, 0, 0, 1.0);
    }
  }
  // Low protective timber knee-wall on one side only (or open legs so player moves smoothly around)
  bWtLegs.addBeveledBox(0, 0.65, 0, 1.2, 1.3, 1.2, 0, 0.04, 0.5, 1, 1, 1); // Central ladder column
  // Overhead lookout platform + railings (Y = 3.8..5.2m, named Canopy -> auto-transparent + no collision)
  bWtCanopyPlank.addBeveledBox(0, 3.85, 0, 3.4, 0.22, 3.4, 0, 0.03, 0.45, 2, 1, 2);
  for (const s of [-1, 1]) {
    bWtCanopyPlank.addBeveledBox(0, 4.45, s * 1.6, 3.4, 0.95, 0.14, 0, 0.02, 0.45, 2, 1, 1);
    bWtCanopyPlank.addBeveledBox(s * 1.6, 4.45, 0, 0.14, 0.95, 3.2, 0, 0.02, 0.45, 1, 1, 2);
    // Corner roof posts
    for (const s2 of [-1, 1]) {
      bWtCanopyLog.addCylinder(s * 1.55, 4.9, s2 * 1.55, 0.10, 0.09, 2.1, 6, 1, true);
    }
  }
  const wtLegsMesh = registerMesh('Watchtower_Legs_Shared', [{ builder: bWtLegs, mat: MAT.logBark }]);
  const wtCanopyMesh = registerMesh('Watchtower_Canopy_Shared', [
    { builder: bWtCanopyPlank, mat: MAT.cabinPlanks },
    { builder: bWtCanopyLog, mat: MAT.logBark }
  ]);
  for (let i = 0; i < watchtowerCoords.length; i++) {
    const [wx, wz] = watchtowerCoords[i];
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_WatchtowerBase_${id}`, wtLegsMesh, [wx, 0, wz], i * Math.PI * 0.5);
    addGeometryNode(`Prop_WatchtowerCanopy_${id}`, wtCanopyMesh, [wx, 0, wz], i * Math.PI * 0.5);
    registerSolidFootprint(wx, wz, 2.4);
  }

  // --- 3F. Perimeter Timber Palisade & Military Fence (4 separate side nodes at X = ±49.2, Z = ±49.2) ---
  const P = 49.2;
  function buildPerimeterSide(sideName, segs) {
    const bP = new MeshBuilder(), bL = new MeshBuilder(), bM = new MeshBuilder();
    for (const [x0, z0, x1, z1, isMetal] of segs) {
      addCabinWallSegment(bP, bL, bM, x0, z0, x1, z1, 2.8, 0.5, isMetal);
    }
    addGeometryNode(`Wall_Perimeter_${sideName}`, registerMesh(`Wall_Perimeter_${sideName}_Mesh`, [
      { builder: bP, mat: MAT.cabinPlanks },
      { builder: bL, mat: MAT.logBark },
      { builder: bM, mat: MAT.rustyShed }
    ]));
  }
  buildPerimeterSide('North', [
    [-P, -P, -16.5, -P, false], [-16.5, -P, -4.5, -P, true],
    [4.5, -P, 16.5, -P, true],  [16.5, -P, P, -P, false]
  ]);
  buildPerimeterSide('South', [
    [-P, P, -16.5, P, false], [-16.5, P, -4.5, P, true],
    [4.5, P, 16.5, P, true],  [16.5, P, P, P, false]
  ]);
  buildPerimeterSide('West', [
    [-P, -P, -P, -16.5, false], [-P, -16.5, -P, 16.5, true], [-P, 16.5, -P, P, false]
  ]);
  buildPerimeterSide('East', [
    [P, -P, P, -16.5, false], [P, -16.5, P, 16.5, true], [P, 16.5, P, P, false]
  ]);
}
buildBuildingsAndPerimeter();

// ============================================================================
// 4. RICH THEME PROPS: LOG PILES, SANDBAG BUNKERS, CONTAINERS, CRATES, GENERATORS, PEDESTALS
// ============================================================================
function buildThemeProps() {
  // --- 4A. Shared Stacked Log Pile Mesh (10 cylindrical logs: bark + cut wood ends!) ---
  function createLogPileMesh(name, logLen = 4.2, rows = [4, 3, 2]) {
    const bBark = new MeshBuilder();
    const bCut = new MeshBuilder();
    const r = 0.27;
    let y = r;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const count = rows[rowIdx];
      for (let i = 0; i < count; i++) {
        const xOff = (i - (count - 1) * 0.5) * (r * 2.02);
        const lenVar = logLen * (0.94 + ((i + rowIdx) % 3) * 0.04);
        // Log bark body (no end caps)
        bBark.addCylinder(xOff, y, 0, r, r * 0.96, lenVar, 12, 1, false, 0, Math.PI * 0.5, 1.2);
        // Fresh-cut wood end caps at +Z and -Z
        bCut.addCylinder(xOff, y, lenVar * 0.5, r * 0.96, r * 0.96, 0.02, 12, 1, true, 0, Math.PI * 0.5, 1.0);
        bCut.addCylinder(xOff, y, -lenVar * 0.5, r, r, 0.02, 12, 1, true, 0, Math.PI * 0.5, 1.0);
      }
      y += r * 1.72;
    }
    return registerMesh(name, [
      { builder: bBark, mat: MAT.logBark },
      { builder: bCut, mat: MAT.logCut }
    ]);
  }
  const logPileLarge = createLogPileMesh('Prop_LogPile_Large_Shared', 4.4, [4, 3, 2]);
  const logPileMed   = createLogPileMesh('Prop_LogPile_Med_Shared',   3.4, [3, 2, 1]);

  const logPilePlacements = [
    [-28.0, -16.0, 0.15, true],
    [-16.0, -16.5, -0.2, false],
    [-34.0,  -8.0, 1.55, true],
    [-34.0,   8.0, 1.48, true],
    [-28.5,  15.5, 0.12, true],
    [-16.0,  16.5, -0.18, false],
    [-33.0,  26.0, 0.65, false],
    [-18.0, -35.0, 1.57, false],
    [-18.0,  34.0, 1.45, true],
    [ -9.0,   0.0, 1.57, false],
    [ 10.5,  -3.5, 1.50, false],
    [ 16.5, -31.0, 0.25, false]
  ];
  for (let i = 0; i < logPilePlacements.length; i++) {
    const [lx, lz, yaw, isLarge] = logPilePlacements[i];
    if (!isClearOfPoints(lx, lz, 2.8, 2.4, 4.2)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_LogPile_${id}`, isLarge ? logPileLarge : logPileMed, [lx, 0, lz], yaw);
    registerSolidFootprint(lx, lz, isLarge ? 2.6 : 2.1);
  }

  // --- 4B. Shared Muddy Sandbag Bunker Mesh (stacked curved sandbag wall) ---
  const bSand = new MeshBuilder();
  // 3 staggered courses of rounded sandbag pillows along a 3.4m arc
  for (let layer = 0; layer < 3; layer++) {
    const y = 0.17 + layer * 0.30;
    const bags = 5 - (layer % 2);
    for (let b = 0; b < bags; b++) {
      const f = (b / Math.max(1, bags - 1)) - 0.5;
      const ang = f * 0.55;
      const bx = Math.sin(ang) * 2.8;
      const bz = (1 - Math.cos(ang)) * 1.4;
      bSand.addBeveledBox(bx, y, bz, 0.72, 0.30, 0.44, -ang, 0.08, 1.1, 1, 1, 1);
    }
  }
  const sandbagMesh = registerMesh('Prop_Sandbag_Bunker_Shared', [{ builder: bSand, mat: MAT.sandbagMud }]);

  const sandbagPlacements = [
    // Guarding the 4 bridge approaches
    [ -7.2, -25.0,  0.35], [  8.2, -25.0, -0.35],
    [ -8.2, -14.8, -0.25], [  8.2, -14.8,  0.25],
    [ -8.2,  14.8,  2.85], [  8.2,  14.8, -2.85],
    [ -7.2,  25.0, -2.75], [  8.2,  25.0,  2.75],
    // Military camp & corner camp defensive positions
    [-33.5, -34.0,  0.78], [ 33.5, -34.0, -0.78],
    [-33.5,  34.0,  2.35], [ 33.5,  34.0, -2.35],
    [ 15.0, -20.0,  1.57], [ 34.0,  -9.0, -1.57],
    [ 34.0,  12.0, -1.57], [ 14.0,  28.0,  0.0]
  ];
  for (let i = 0; i < sandbagPlacements.length; i++) {
    const [sx, sz, yaw] = sandbagPlacements[i];
    if (!isClearOfPoints(sx, sz, 2.8, 2.2, 4.2)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_Sandbag_${id}`, sandbagMesh, [sx, 0, sz], yaw);
    registerSolidFootprint(sx, sz, 1.8);
  }

  // --- 4C. Olive Military Containers (4 tactical cover containers in East Military Camp) ---
  const bCont = new MeshBuilder();
  bCont.addBeveledBox(0, 1.25, 0, 5.4, 2.5, 2.35, 0, 0.05, 0.35, 4, 2, 2);
  // Corner frame ribs
  for (const xOff of [-2.6, 0, 2.6]) {
    bCont.addBeveledBox(xOff, 1.25, 0, 0.16, 2.54, 2.42, 0, 0.02, 0.5, 1, 1, 1);
  }
  const containerMesh = registerMesh('Prop_MilContainer_Shared', [{ builder: bCont, mat: MAT.milOlive }]);
  const containerPlacements = [
    [35.5, -26.0, 0.12],
    [36.5,  14.5, 1.52],
    [15.5,  10.5, 0.05],
    [32.5, -34.5, 0.0]
  ];
  for (let i = 0; i < containerPlacements.length; i++) {
    const [cx, cz, yaw] = containerPlacements[i];
    if (!isClearOfPoints(cx, cz, 3.5, 2.8, 4.4)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_MilContainer_${id}`, containerMesh, [cx, 0, cz], yaw);
    registerSolidFootprint(cx, cz, 3.0);
  }

  // --- 4D. Olive Military Generators (6) ---
  const bGenOlive = new MeshBuilder();
  const bGenRust = new MeshBuilder();
  bGenOlive.addBeveledBox(0, 0.62, 0, 1.85, 1.12, 1.05, 0, 0.04, 0.6, 2, 1, 1);
  bGenRust.addBeveledBox(0, 0.08, 0, 1.98, 0.16, 1.18, 0, 0.02, 0.6, 1, 1, 1); // Base skid
  bGenRust.addCylinder(0.65, 1.32, 0.25, 0.07, 0.06, 0.45, 8, 1, true); // Exhaust muffler
  bGenRust.addBeveledBox(-0.65, 0.65, 0.54, 0.48, 0.55, 0.06, 0, 0.01, 0.8, 1, 1, 1); // Control panel
  const generatorMesh = registerMesh('Prop_Generator_Shared', [
    { builder: bGenOlive, mat: MAT.milOlive },
    { builder: bGenRust, mat: MAT.rustyShed }
  ]);
  const generatorPlacements = [
    [ 31.5,  -4.0, 0.2],
    [ 31.5,  22.0, -0.4],
    [ 16.5, -26.0, 1.2],
    [-31.5,  -4.0, 1.57],
    [-16.0, -27.0, 0.0],
    [ 22.0,  32.5, 0.3]
  ];
  for (let i = 0; i < generatorPlacements.length; i++) {
    const [gx, gz, yaw] = generatorPlacements[i];
    if (!isClearOfPoints(gx, gz, 2.5, 2.2, 4.0)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_Generator_${id}`, generatorMesh, [gx, 0, gz], yaw);
    registerSolidFootprint(gx, gz, 1.3);
  }

  // --- 4E. Olive Military Ammo Crate Stacks (22) ---
  const bCrateA = new MeshBuilder();
  bCrateA.addBeveledBox(-0.42, 0.42,  0.0, 0.96, 0.84, 0.82, 0.08, 0.03, 0.9, 1, 1, 1);
  bCrateA.addBeveledBox( 0.50, 0.36, -0.12, 0.84, 0.72, 0.76, -0.12, 0.03, 0.9, 1, 1, 1);
  bCrateA.addBeveledBox(-0.08, 1.12, -0.04, 0.78, 0.60, 0.72, 0.22, 0.03, 0.9, 1, 1, 1);
  const crateStackMesh = registerMesh('Prop_CrateStack_Shared', [{ builder: bCrateA, mat: MAT.crateOlive }]);

  const cratePlacements = [
    [-36.5, -35.5, 0.4],  [ 36.5, -35.5, -0.3], [-36.5, 35.5, 1.1],  [ 36.5, 35.5, 2.0],
    [-26.0,  -5.0, 0.2],  [-18.0,  -5.5, -0.5], [-26.0,  5.5, 0.8],  [-18.5, 24.0, 0.1],
    [ 19.0,  -9.0, 0.0],  [ 25.5,   1.5, 0.6],  [ 20.5, 19.5, 0.3],  [ 26.5, 24.5, -0.4],
    [ 31.0,   6.0, 1.2],  [ 32.0, -18.0, 0.9],  [-34.0, -24.0, 0.5], [-34.0, 16.0, -0.6],
    [-11.5,  -4.5, 0.2],  [ 11.5,   4.5, 0.7],  [ -8.5, -36.5, 0.0], [  9.5, -36.5, 0.4],
    [ -9.5,  36.5, -0.3], [  8.5,  36.5, 0.8]
  ];
  for (let i = 0; i < cratePlacements.length; i++) {
    const [cx, cz, yaw] = cratePlacements[i];
    if (!isClearOfPoints(cx, cz, 2.5, 2.2, 4.0) || !isClearOfSolids(cx, cz, 1.1)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_Crate_${id}`, crateStackMesh, [cx, 0, cz], yaw);
    registerSolidFootprint(cx, cz, 1.2);
  }

  // --- 4F. 18 Card Pedestals (`Prop_CardPedestal_01..18`) ---
  const bPedWood = new MeshBuilder();
  const bPedMetal = new MeshBuilder();
  bPedWood.addBeveledBox(0, 0.48, 0, 0.82, 0.96, 0.82, 0, 0.03, 0.8, 1, 1, 1);
  bPedMetal.addBeveledBox(0, 1.00, 0, 0.90, 0.10, 0.90, 0, 0.02, 0.8, 1, 1, 1);
  const pedestalMesh = registerMesh('Prop_CardPedestal_Shared', [
    { builder: bPedWood, mat: MAT.crateOlive },
    { builder: bPedMetal, mat: MAT.milOlive }
  ]);
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_CardPedestal_${id}`, pedestalMesh, [cp[0], 0.0, cp[2]], (i % 4) * 0.4);
  }
}
buildThemeProps();

// ============================================================================
// 5. DENSE FOREST NATURE: 128+ LAYERED PINE TREES, 28+ STUMPS, 18+ FALLEN LOGS, 36+ ROCKS, 108+ FERNS
// ============================================================================
function buildForestNature() {
  // --- 5A. Shared Pine/Fir Tree Variants (4 Trunk + 4 3-Tier Canopy meshes) ---
  const trunkMeshes = [];
  const canopyMeshes = [];
  for (let v = 0; v < 4; v++) {
    const h = 7.2 + v * 0.75;
    const rBase = 0.30 + (v % 2) * 0.05;
    const bTrunk = new MeshBuilder();
    // Flared root base + tapered trunk
    bTrunk.addCylinder(0, 0.45, 0, rBase * 1.45, rBase * 1.05, 0.9, 10, 1, true, 0, 0, 1.0);
    bTrunk.addCylinder(0, h * 0.5 + 0.2, 0, rBase, rBase * 0.22, h, 10, 3, true, 0, 0, 1.8);
    trunkMeshes.push(registerMesh(`Pine_Trunk_Var${v}`, [{ builder: bTrunk, mat: MAT.logBark }]));

    // 4-Tier Layered Pine Foliage Canopy (starts at Y = 2.6m so players see cleanly underneath)
    const bCanopy = new MeshBuilder();
    const tier1Y = 2.55 + v * 0.14;
    const tier2Y = tier1Y + 1.45;
    const tier3Y = tier2Y + 1.35;
    const tier4Y = tier3Y + 1.25;
    bCanopy.addPineTier(0, tier1Y, 0, 2.15 + (v % 2) * 0.20, 0.55, 2.05, 12, 0.26, v * 0.4, 1.5);
    bCanopy.addPineTier(0, tier2Y, 0, 1.80 + (v % 2) * 0.16, 0.42, 1.95, 12, 0.22, v * 0.4 + 0.30, 1.4);
    bCanopy.addPineTier(0, tier3Y, 0, 1.38 + (v % 2) * 0.12, 0.25, 1.85, 10, 0.18, v * 0.4 + 0.60, 1.3);
    bCanopy.addPineTier(0, tier4Y, 0, 0.92 + (v % 2) * 0.08, 0.04, 1.75, 10, 0.12, v * 0.4 + 0.90, 1.1);
    // Extra angled pine branch bough cards for lush silhouette
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + v * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const bx0 = ca * 0.22, bz0 = sa * 0.22;
      const bx1 = ca * 1.95, bz1 = sa * 1.95;
      const px = -sa * 0.62, pz = ca * 0.62;
      const yBase = tier1Y + 0.6 + (k % 3) * 0.75;
      bCanopy.addQuad(
        [bx0 - px, yBase + 0.35, bz0 - pz], [bx0 + px, yBase + 0.35, bz0 + pz],
        [bx1 + px, yBase - 0.30, bz1 + pz], [bx1 - px, yBase - 0.30, bz1 - pz],
        [ca * 0.3, 0.95, sa * 0.3], 0, 0, 1, 1
      );
    }
    canopyMeshes.push(registerMesh(`Pine_Canopy_Var${v}`, [{ builder: bCanopy, mat: MAT.pineNeedles }]));
  }

  let treeCount = 0;
  const placedTreePositions = [];
  function placePineTree(x, z, scale = 1.0, isPerimeter = false) {
    if (Math.abs(x) > 48.2 || Math.abs(z) > 48.2) return false;
    if (distToCreekCenter(x, z) < CREEK_HALF_WIDTH + 1.4) return false;
    if (!isClearOfPoints(x, z, 2.8, 2.4, 4.3)) return false;
    if (!isPerimeter && !isClearOfSolids(x, z, 1.5)) return false;
    // Keep minimum spacing from other trees
    for (const tp of placedTreePositions) {
      if (Math.hypot(x - tp[0], z - tp[1]) < (isPerimeter ? 2.4 : 3.2)) return false;
    }
    treeCount++;
    const id = String(treeCount).padStart(3, '0');
    const v = treeCount % 4;
    const yaw = randRange(0, Math.PI * 2);
    const s = [scale, scale * randRange(0.92, 1.12), scale];
    addGeometryNode(`Prop_TreeTrunk_${id}`, trunkMeshes[v], [x, 0, z], yaw, s);
    addGeometryNode(`Prop_TreeCanopy_${id}`, canopyMeshes[v], [x, 0, z], yaw, s);
    placedTreePositions.push([x, z]);
    registerSolidFootprint(x, z, 0.75 * scale);
    return true;
  }

  // 5A-1. Dense Perimeter Pine Ring (88+ trees around all 4 edges, clamped inside ±46.8 so canopies stay within ±50.5m!)
  const perimStep = 3.7;
  for (let c = -45.5; c <= 45.5; c += perimStep) {
    // North edge (2 staggered rows)
    placePineTree(c + randRange(-0.4, 0.4), -46.6 + randRange(-0.3, 0.4), randRange(0.92, 1.12), true);
    if (Math.abs(c) > 16.5) placePineTree(c + 1.6, -43.8 + randRange(-0.4, 0.4), randRange(0.86, 1.06), true);
    // South edge
    placePineTree(c + randRange(-0.4, 0.4),  46.6 + randRange(-0.4, 0.3), randRange(0.92, 1.12), true);
    if (Math.abs(c) > 16.5) placePineTree(c + 1.6,  43.8 + randRange(-0.4, 0.4), randRange(0.86, 1.06), true);
    // West edge
    placePineTree(-46.6 + randRange(-0.3, 0.4), c + randRange(-0.4, 0.4), randRange(0.92, 1.12), true);
    if (Math.abs(c) > 16.5) placePineTree(-43.8 + randRange(-0.4, 0.4), c + 1.6, randRange(0.86, 1.06), true);
    // East edge
    placePineTree( 46.6 + randRange(-0.4, 0.3), c + randRange(-0.4, 0.4), randRange(0.92, 1.12), true);
    if (Math.abs(c) > 16.5) placePineTree( 43.8 + randRange(-0.4, 0.4), c + 1.6, randRange(0.86, 1.06), true);
  }
  const perimeterTreeCount = treeCount;

  // 5A-2. Interior Tactical Cover Island Pines (44+ trees distributed across forest islands)
  const interiorTreeSeeds = [
    // NW Forest Cover Island
    [-38, -28], [-35, -22], [-39, -18], [-34, -15], [-31, -24], [-14, -27], [-12, -36],
    [-35, -31], [-28, -39], [-20, -40],
    // NE Forest Cover Island
    [ 38, -29], [ 34, -22], [ 40, -18], [ 36, -12], [ 27, -21], [ 17, -22], [ 16, -37], [ 29, -37],
    [ 22, -39], [ 33, -30],
    // SW Forest Cover Island
    [-38,  28], [-35,  21], [-39,  16], [-34,  13], [-28,  23], [-16,  27], [-14,  37], [-30,  37],
    [-25,  39], [-36,  33],
    // SE Forest Cover Island
    [ 38,  29], [ 35,  22], [ 40,  17], [ 35,   9], [ 28,  32], [ 17,  34], [ 14,  38], [ 31,  38],
    [ 22,  39], [ 33,  29],
    // Central Creek Bank Pines (framing the winding creek without blocking bridges!)
    [ -6.8, -38.0], [  8.2, -38.0], [ -7.5, -19.5], [  8.0, -19.5],
    [ -8.2,  -2.5], [  8.8,  -1.5], [ -8.2,   4.5], [  8.5,   5.0],
    [ -7.5,  19.5], [  8.0,  19.5], [ -6.8,  38.5], [  8.2,  38.5],
    // Mid-Flank Cover Trees
    [-40,  -6], [-40,   6], [ 40,  -6], [ 40,   6],
    [-16, -13], [-16,  13], [ 13, -14], [ 13,  14],
    [-32,   0], [ 32,   0], [-12, -28], [ 12,  28]
  ];
  for (const [tx, tz] of interiorTreeSeeds) {
    placePineTree(tx + randRange(-0.8, 0.8), tz + randRange(-0.8, 0.8), randRange(0.85, 1.12), false);
  }
  const interiorTreeCount = treeCount - perimeterTreeCount;

  // --- 5B. Cut Tree Stumps (`Prop_Stump_*`, 28+) ---
  const bStumpBark = new MeshBuilder();
  const bStumpCut = new MeshBuilder();
  bStumpBark.addCylinder(0, 0.34, 0, 0.56, 0.42, 0.68, 10, 1, false, 0, 0, 1.0);
  // 4 radiating root buttresses
  for (let r = 0; r < 4; r++) {
    const ang = (r / 4) * Math.PI * 2 + 0.3;
    bStumpBark.addCylinder(Math.cos(ang) * 0.44, 0.14, Math.sin(ang) * 0.44, 0.18, 0.08, 0.46, 6, 1, true, -ang, 0.65);
  }
  bStumpCut.addCylinder(0, 0.68, 0, 0.42, 0.42, 0.02, 10, 1, true, 0, 0, 1.0);
  const stumpMesh = registerMesh('Prop_Stump_Shared', [
    { builder: bStumpBark, mat: MAT.logBark },
    { builder: bStumpCut, mat: MAT.logCut }
  ]);

  let stumpCount = 0;
  const stumpPositions = [];
  for (let attempt = 0; attempt < 260 && stumpCount < 30; attempt++) {
    const sx = randRange(-42, 42);
    const sz = randRange(-42, 42);
    if (distToCreekCenter(sx, sz) < CREEK_HALF_WIDTH + 1.8) continue;
    if (!isClearOfPoints(sx, sz, 3.0, 2.5, 4.3)) continue;
    if (!isClearOfSolids(sx, sz, 1.6)) continue;
    stumpCount++;
    const id = String(stumpCount).padStart(2, '0');
    const sc = randRange(0.82, 1.25);
    addGeometryNode(`Prop_Stump_${id}`, stumpMesh, [sx, 0, sz], randRange(0, Math.PI * 2), [sc, sc, sc]);
    registerSolidFootprint(sx, sz, 0.85 * sc);
    stumpPositions.push([sx, sz]);
  }

  // --- 5C. Fallen Tree Logs as Natural Waist-High Cover (`Prop_FallenLog_*`, 18+) ---
  const bFallenBark = new MeshBuilder();
  const bFallenCut = new MeshBuilder();
  bFallenBark.addCylinder(0, 0.38, 0, 0.42, 0.34, 3.8, 10, 2, false, 0, Math.PI * 0.5, 1.6);
  bFallenCut.addCylinder(0, 0.38,  1.9, 0.34, 0.34, 0.02, 10, 1, true, 0, Math.PI * 0.5, 1.0);
  bFallenCut.addCylinder(0, 0.38, -1.9, 0.42, 0.42, 0.02, 10, 1, true, 0, Math.PI * 0.5, 1.0);
  const fallenLogMesh = registerMesh('Prop_FallenLog_Shared', [
    { builder: bFallenBark, mat: MAT.logBark },
    { builder: bFallenCut, mat: MAT.logCut }
  ]);

  let fallenCount = 0;
  for (let attempt = 0; attempt < 240 && fallenCount < 18; attempt++) {
    const fx = randRange(-40, 40);
    const fz = randRange(-40, 40);
    if (distToCreekCenter(fx, fz) < CREEK_HALF_WIDTH + 2.6) continue;
    if (!isClearOfPoints(fx, fz, 4.5, 4.5, 5.8)) continue;
    if (!isClearOfSolids(fx, fz, 2.4)) continue;
    fallenCount++;
    const id = String(fallenCount).padStart(2, '0');
    const sc = randRange(0.85, 1.15);
    addGeometryNode(`Prop_FallenLog_${id}`, fallenLogMesh, [fx, 0, fz], randRange(0, Math.PI * 2), [sc, sc, sc]);
    registerSolidFootprint(fx, fz, 2.2 * sc);
  }

  // --- 5D. Mossy Granite Rocks & Boulders (`Prop_Rock_Boulder_*` & `Prop_Cliff_*`, 38+) ---
  const rockMeshes = [];
  for (let v = 0; v < 4; v++) {
    const bRock = new MeshBuilder();
    const rx = 1.15 + v * 0.25;
    const ry = 0.85 + (v % 2) * 0.35;
    const rz = 1.05 + ((v + 1) % 3) * 0.22;
    bRock.addBoulder(0, ry * 0.42, 0, rx, ry, rz, 8, 12, v * 3.7 + 1.1);
    if (v >= 2) {
      // Secondary companion rock fused into cluster
      bRock.addBoulder(rx * 0.72, ry * 0.26, rz * 0.35, rx * 0.55, ry * 0.52, rz * 0.58, 6, 10, v * 5.1 + 2.4);
    }
    rockMeshes.push(registerMesh(`Rock_MossyGranite_Var${v}`, [{ builder: bRock, mat: MAT.mossyRock }]));
  }
  let rockCount = 0;
  // Place creek-bank boulders + interior cover boulders + 4 corner cliffs
  const rockSeeds = [
    [-5.8, -36.0], [ 6.8, -35.5], [-6.2, -22.0], [ 6.5, -23.0],
    [-6.5,  -3.0], [ 7.2,  -4.0], [-6.8,   3.5], [ 7.0,   3.5],
    [-6.2,  22.0], [ 6.5,  22.5], [-5.8,  36.0], [ 6.8,  36.5],
    [-46.5, -46.5], [46.5, -46.5], [-46.5, 46.5], [46.5, 46.5]
  ];
  for (const [rx, rz] of rockSeeds) {
    if (!isClearOfPoints(rx, rz, 2.8, 2.3, 4.3)) continue;
    rockCount++;
    const isCorner = Math.abs(rx) > 43 && Math.abs(rz) > 43;
    const id = String(rockCount).padStart(2, '0');
    const sc = isCorner ? randRange(1.3, 1.6) : randRange(0.75, 1.15);
    const nodeName = isCorner ? `Prop_Cliff_Corner_${id}` : `Prop_Rock_Boulder_${id}`;
    addGeometryNode(nodeName, rockMeshes[rockCount % 4], [rx, 0, rz], randRange(0, Math.PI * 2), [sc, sc, sc]);
    registerSolidFootprint(rx, rz, 1.45 * sc);
  }
  for (let attempt = 0; attempt < 240 && rockCount < 38; attempt++) {
    const rx = randRange(-43, 43);
    const rz = randRange(-43, 43);
    if (distToCreekCenter(rx, rz) < CREEK_HALF_WIDTH + 1.5) continue;
    if (!isClearOfPoints(rx, rz, 4.0, 3.6, 5.8)) continue;
    if (!isClearOfSolids(rx, rz, 1.9)) continue;
    rockCount++;
    const id = String(rockCount).padStart(2, '0');
    const sc = randRange(0.75, 1.25);
    addGeometryNode(`Prop_Rock_Boulder_${id}`, rockMeshes[rockCount % 4], [rx, 0, rz], randRange(0, Math.PI * 2), [sc, sc, sc]);
    registerSolidFootprint(rx, rz, 1.45 * sc);
  }

  // --- 5E. 112+ Fern & Forest Bush Clusters (`Prop_Fern_Grass_*`, crossed cards -> NO collision/shadows!) ---
  const fernMeshes = [];
  for (let v = 0; v < 3; v++) {
    const bFern = new MeshBuilder();
    const fronds = 5 + v; // 5 to 7 crossed & splayed botanical cards
    const rad = 0.72 + v * 0.14;
    const h = 0.72 + v * 0.14;
    for (let f = 0; f < fronds; f++) {
      const ang = (f / fronds) * Math.PI * 2 + v * 0.4;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const px = -sa * rad * 0.55, pz = ca * rad * 0.55;
      // Splayed outward fern frond (2 quads bent outward for natural arch)
      const midX = ca * rad * 0.62, midZ = sa * rad * 0.62, midY = h * 0.78;
      const tipX = ca * rad * 1.18, tipZ = sa * rad * 1.18, tipY = h * 0.42;
      bFern.addQuad(
        [-px * 0.45, 0.0, -pz * 0.45], [px * 0.45, 0.0, pz * 0.45],
        [midX + px, midY, midZ + pz], [midX - px, midY, midZ - pz],
        [ca * 0.25, 0.96, sa * 0.25], 0, 0, 1, 0.55
      );
      bFern.addQuad(
        [midX - px, midY, midZ - pz], [midX + px, midY, midZ + pz],
        [tipX + px * 0.5, tipY, tipZ + pz * 0.5], [tipX - px * 0.5, tipY, tipZ - pz * 0.5],
        [ca * 0.45, 0.89, sa * 0.45], 0, 0.55, 1, 1.0
      );
    }
    fernMeshes.push(registerMesh(`Fern_Bush_Var${v}`, [{ builder: bFern, mat: MAT.fernBush }]));
  }

  let fernCount = 0;
  // Place ferns around trees, stumps, rocks, creek banks, and building edges
  for (let i = 0; i < placedTreePositions.length && fernCount < 76; i++) {
    if (i % 2 === 0 || fernCount < 50) {
      const [tx, tz] = placedTreePositions[i];
      const ang = randRange(0, Math.PI * 2);
      const d = randRange(0.9, 1.9);
      const fx = tx + Math.cos(ang) * d;
      const fz = tz + Math.sin(ang) * d;
      if (Math.abs(fx) > 48.0 || Math.abs(fz) > 48.0) continue;
      if (distToCreekCenter(fx, fz) < CREEK_HALF_WIDTH + 0.3 || isOnBridge(fx, fz, 0.5, 0.5)) continue;
      fernCount++;
      const id = String(fernCount).padStart(3, '0');
      const sc = randRange(0.75, 1.30);
      addGeometryNode(`Prop_Fern_Grass_${id}`, fernMeshes[fernCount % 3], [fx, groundHeightAt(fx, fz), fz], randRange(0, Math.PI * 2), [sc, sc, sc]);
    }
  }
  for (let attempt = 0; attempt < 220 && fernCount < 114; attempt++) {
    const fx = randRange(-45, 45);
    const fz = randRange(-45, 45);
    if (distToCreekCenter(fx, fz) < CREEK_HALF_WIDTH + 0.4 || isOnBridge(fx, fz, 0.5, 0.5)) continue;
    // Don't put bushes inside buildings
    if (fx > -29.5 && fx < -14.5 && fz > -9.5 && fz < 9.5) continue;
    if (fx > 15.5 && fx < 28.5 && fz > -12.5 && fz < 4.5) continue;
    fernCount++;
    const id = String(fernCount).padStart(3, '0');
    const sc = randRange(0.70, 1.35);
    addGeometryNode(`Prop_Fern_Grass_${id}`, fernMeshes[fernCount % 3], [fx, groundHeightAt(fx, fz), fz], randRange(0, Math.PI * 2), [sc, sc, sc]);
  }

  return { treeCount, perimeterTreeCount, interiorTreeCount, stumpCount, fallenCount, rockCount, fernCount, placedTreePositions, stumpPositions };
}
const natureStats = buildForestNature();

// ============================================================================
// 6. 204+ GROUND DECALS (VINES/IVY, MOSS, FALLEN LEAVES, TREE ROOTS, MUD PUDDLES) + SCATTER
// ============================================================================
function buildDecalsAndScatter() {
  // Shared unit decal quad meshes (1 per decal material -> tiny .bin, instant instancing)
  function makeDecalMesh(name, matIdx) {
    const b = new MeshBuilder();
    b.addQuad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, 0], 0, 0, 1, 1);
    return registerMesh(name, [{ builder: b, mat: matIdx }]);
  }
  const decalMeshVines  = makeDecalMesh('Decal_Vines_Shared',  MAT.decalVines);
  const decalMeshMoss   = makeDecalMesh('Decal_Moss_Shared',   MAT.decalMoss);
  const decalMeshLeaves = makeDecalMesh('Decal_Leaves_Shared', MAT.decalLeaves);
  const decalMeshRoots  = makeDecalMesh('Decal_Roots_Shared',  MAT.decalRoots);
  const decalMeshMud    = makeDecalMesh('Decal_Mud_Shared',    MAT.decalMud);

  let decalCount = 0;
  const counts = { vines: 0, moss: 0, leaves: 0, roots: 0, mud: 0 };

  function addGroundDecal(prefix, meshIdx, x, z, sx, sz, yOffset, yaw) {
    if (Math.abs(x) > 47.5 || Math.abs(z) > 47.5) return false;
    if (distToCreekCenter(x, z) < CREEK_HALF_WIDTH + 0.6) return false;
    if (isOnBridge(x, z, 0.2, 0.2)) return false;
    decalCount++;
    const y = groundHeightAt(x, z) + yOffset;
    const id = String(decalCount).padStart(3, '0');
    addGeometryNode(`Decal_${prefix}_${id}`, meshIdx, [x, y, z], yaw, [sx, 1, sz]);
    return true;
  }

  // 6A. 86 Creeping Ground Vines & Ivy (`decal_vines_ivy`) — explicitly requested by user!
  // Dense near trees, building perimeters, rocks, and forest floor trails
  for (let i = 0; i < 86; i++) {
    let x, z;
    if (i < 34 && i < natureStats.placedTreePositions.length) {
      const tp = natureStats.placedTreePositions[(i * 3) % natureStats.placedTreePositions.length];
      const ang = randRange(0, Math.PI * 2);
      x = tp[0] + Math.cos(ang) * randRange(1.0, 2.8);
      z = tp[1] + Math.sin(ang) * randRange(1.0, 2.8);
    } else {
      x = randRange(-44, 44);
      z = randRange(-44, 44);
    }
    const sx = randRange(2.4, 4.8);
    const sz = randRange(1.8, 3.8);
    if (addGroundDecal('Vines', decalMeshVines, x, z, sx, sz, 0.018 + (i % 5) * 0.001, randRange(0, Math.PI * 2))) {
      counts.vines++;
    }
  }

  // 6B. 46 Moss Patches (`decal_moss_patch`)
  for (let i = 0; i < 46; i++) {
    const x = randRange(-45, 45);
    const z = randRange(-45, 45);
    const s = randRange(2.2, 4.5);
    if (addGroundDecal('Moss', decalMeshMoss, x, z, s, s * randRange(0.8, 1.2), 0.014 + (i % 4) * 0.001, randRange(0, Math.PI * 2))) {
      counts.moss++;
    }
  }

  // 6C. 44 Fallen Leaves & Pine Needles (`decal_fallen_leaves`)
  for (let i = 0; i < 44; i++) {
    const x = randRange(-45, 45);
    const z = randRange(-45, 45);
    const s = randRange(2.4, 4.6);
    if (addGroundDecal('Leaves', decalMeshLeaves, x, z, s, s * randRange(0.85, 1.15), 0.016 + (i % 4) * 0.001, randRange(0, Math.PI * 2))) {
      counts.leaves++;
    }
  }

  // 6D. 34 Tree Roots (`decal_tree_roots`) radiating around interior trees & stumps
  for (let i = 0; i < natureStats.placedTreePositions.length && counts.roots < 24; i++) {
    const [tx, tz] = natureStats.placedTreePositions[i];
    if (Math.abs(tx) < 42 && Math.abs(tz) < 42) {
      const s = randRange(2.6, 3.8);
      if (addGroundDecal('Roots', decalMeshRoots, tx, tz, s, s, 0.022, randRange(0, Math.PI * 2))) {
        counts.roots++;
      }
    }
  }
  for (let i = 0; i < natureStats.stumpPositions.length && counts.roots < 34; i++) {
    const [sx, sz] = natureStats.stumpPositions[i];
    const s = randRange(2.2, 3.2);
    if (addGroundDecal('Roots', decalMeshRoots, sx, sz, s, s, 0.022, randRange(0, Math.PI * 2))) {
      counts.roots++;
    }
  }

  // 6E. 26 Wet Mud Puddles (`decal_mud_puddle`) along roads, yards, and creek banks
  for (let i = 0; i < 26; i++) {
    const x = randRange(-42, 42);
    const z = randRange(-42, 42);
    const sx = randRange(2.0, 3.8);
    const sz = randRange(1.6, 3.2);
    if (addGroundDecal('Mud', decalMeshMud, x, z, sx, sz, 0.020 + (i % 3) * 0.001, randRange(0, Math.PI * 2))) {
      counts.mud++;
    }
  }

  // 6F. 28 Forest Floor Scatter Debris Groups (`Prop_Scatter_*`, Y < 0.18m, no collision/shadows!)
  const bScatWood = new MeshBuilder();
  const bScatRock = new MeshBuilder();
  bScatWood.addBeveledBox(-0.35, 0.04,  0.22, 0.72, 0.07, 0.14, 0.4, 0.01, 1.2);
  bScatWood.addCylinder(0.28, 0.06, -0.25, 0.06, 0.05, 0.68, 6, 1, true, 1.1, Math.PI * 0.5);
  bScatRock.addBoulder(0.05, 0.06, 0.12, 0.22, 0.11, 0.18, 4, 5, 2.1);
  bScatRock.addBoulder(-0.28, 0.05, -0.22, 0.16, 0.09, 0.15, 4, 5, 4.3);
  const scatterMesh = registerMesh('Forest_Scatter_Shared', [
    { builder: bScatWood, mat: MAT.cabinPlanks },
    { builder: bScatRock, mat: MAT.mossyRock }
  ]);
  for (let i = 0; i < 28; i++) {
    const sx = randRange(-43, 43);
    const sz = randRange(-43, 43);
    if (distToCreekCenter(sx, sz) < CREEK_HALF_WIDTH + 0.8 || isOnBridge(sx, sz, 0.3, 0.3)) continue;
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Prop_Forest_Scatter_${id}`, scatterMesh, [sx, groundHeightAt(sx, sz), sz], randRange(0, Math.PI * 2));
  }

  return { decalCount, counts };
}
const decalStats = buildDecalsAndScatter();

// ============================================================================
// 7. ASSEMBLE GLTF SCENE HIERARCHY (Exact Contract with ImportedMap.gd & GameManager.gd)
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
      name: `Spawn_Team${t}_${p}`,
      translation: [
        TEAM_CENTERS[t][0] + SPAWN_OFFSETS[p][0],
        0.05,
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
  name: 'Night_Forest_Sawmill_Camp_Map_v3_1',
  children: [
    cardPointsRootIdx,
    doorPointsRootIdx,
    geometryRootIdx,
    spawnPointsRootIdx,
    wallLampsRootIdx
  ]
});

let totalPrimitives = 0;
for (const m of meshes) {
  totalPrimitives += m.primitives.length;
  delete m._tris;
}

const gltfJson = {
  asset: {
    generator: 'TacticalDark Night Forest Military Camp & Sawmill v3.1 Node.js Procedural Builder',
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

const gltfResPath = `res://asset model/haritalar/Map4_Orman_v3_1/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dorman5v5v31m4f"
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
// 8. FULL MATHEMATICAL, BUDGET & COLLIDER CLEARANCE VALIDATION REPORT
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

  // 1. Triangle budget check (120K - 165K tris)
  if (totalTriangles < 120000 || totalTriangles > 165000) {
    console.error(`ERROR: Total triangles ${totalTriangles} outside target [120000, 165000]`);
    errors++;
  }

  // 2. World AABB check (~100x100m footprint)
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
  if (wMinX < -51.5 || wMaxX > 51.5 || wMinZ < -51.5 || wMaxZ > 51.5) {
    console.error(`ERROR: World AABB exceeds ~100x100m footprint: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
    errors++;
  }

  // 3. Zero glTF lights & Zero emissive materials
  if (gltfJson.extensions && gltfJson.extensions.KHR_lights_punctual) {
    console.error('ERROR: glTF contains lights! 0 lights required.');
    errors++;
  }
  for (const m of materials) {
    if (m.emissiveFactor || m.emissiveTexture) {
      console.error(`ERROR: Material ${m.name} uses emission! ZERO emission required.`);
      errors++;
    }
    if ((m.name.includes('Decal') || m.name.includes('Foliage')) && m.alphaMode !== 'MASK') {
      console.error(`ERROR: Material ${m.name} does not use alphaMode: MASK`);
      errors++;
    }
  }

  // 4. CardPoint -> Spawn min distance (>= 18.0m)
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

  // 5. DoorPoint -> Spawn min distance (>= 26.5m)
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

  // 6. Full Solid Collider Clearance Audit (ignoring Floor, Water, Canopy, Decal, Grass, Scatter)
  const noCollide = ['Floor_', 'Water_', 'Canopy', 'Decal', 'Grass', 'Scatter'];
  let minSpawnClear = Infinity;
  for (let i = 0; i < ALL_SPAWNS.length; i++) {
    const sp = ALL_SPAWNS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollide.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(sp[0], sp[2], n);
      minSpawnClear = Math.min(minSpawnClear, dist);
      if (dist < 1.8) {
        console.error(`ERROR: Spawn_${i + 1} (${sp[0]}, ${sp[2]}) only ${dist.toFixed(2)}m from ${n.name}`);
        errors++;
      }
    }
  }

  let minCardClear = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollide.some(w => n.name.includes(w)) || n.name.includes('Prop_CardPedestal') || n.name.includes('Wall_Sawmill') || n.name.includes('Wall_Barracks') || n.name.includes('Wall_LumberShed') || n.name.includes('Wall_ArmoryShed')) continue;
      const dist = pointToNodeDistXZ(cp[0], cp[2], n);
      minCardClear = Math.min(minCardClear, dist);
      if (dist < 1.6) {
        console.error(`ERROR: CardPoint_${i + 1} (${cp[0]}, ${cp[2]}) only ${dist.toFixed(2)}m from ${n.name}`);
        errors++;
      }
    }
  }

  let minDoorClear = Infinity;
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const dp = DOOR_POINTS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollide.some(w => n.name.includes(w))) continue;
      const dist = pointToNodeDistXZ(dp[0], dp[2], n);
      minDoorClear = Math.min(minDoorClear, dist);
      if (dist < 3.4) {
        console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) only ${dist.toFixed(2)}m from ${n.name}`);
        errors++;
      }
    }
  }

  // Check how many referenced textures currently exist on disk (informational since parallel agent builds textures)
  let texFound = 0;
  for (const img of images) {
    if (fs.existsSync(path.join(OUT_DIR, img.uri))) texFound++;
  }

  console.log('======================================================================');
  console.log(' GECE ORMAN ASKERI KAMPI & KERESTE TESISI v3.1 VALIDATION REPORT');
  console.log('======================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris (target: 120,000 - 165,000)`);
  console.log(`Unique Meshes     : ${meshes.length} (${totalPrimitives} primitives)`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR materials (0 emission, 0 glTF lights)`);
  console.log(`Textures Ref'd    : ${images.length} URIs (19 sets x 3 maps; ${texFound}/${images.length} present on disk)`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Forest & Nature   : ${natureStats.treeCount} Pine Trees (${natureStats.perimeterTreeCount} perimeter + ${natureStats.interiorTreeCount} interior), ${natureStats.stumpCount} Stumps, ${natureStats.fallenCount} Fallen Logs, ${natureStats.rockCount} Rocks, ${natureStats.fernCount} Ferns`);
  console.log(`Ground Decals     : ${decalStats.decalCount} total (Vines: ${decalStats.counts.vines}, Moss: ${decalStats.counts.moss}, Leaves: ${decalStats.counts.leaves}, Roots: ${decalStats.counts.roots}, Mud: ${decalStats.counts.mud})`);
  console.log(`Spawn Points      : ${ALL_SPAWNS.length} (Spawn_Team0_0..4 .. Spawn_Team3_0..4, solid clear: ${minSpawnClear.toFixed(2)}m)`);
  console.log(`Card Points       : ${CARD_POINTS.length} + 18 Pedestals (spawn dist: ${minCardToSpawn.toFixed(2)}m >= 18.0m, solid clear: ${minCardClear.toFixed(2)}m)`);
  console.log(`Door Points       : ${DOOR_POINTS.length} (spawn dist: ${minDoorToSpawn.toFixed(2)}m >= 26.5m, solid clear: ${minDoorClear.toFixed(2)}m)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('======================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
