#!/usr/bin/env node
/**
 * build_desert_v3_1.js
 * Procedurally constructs the complete AAA realistic v3.1 glTF 2.0 + .bin + .import package for:
 * Map3_Col_Ileri_Karakolu_5v5v5v5_v3_1.gltf (inside asset model/haritalar/Map3_Col_v3_1/)
 *
 * Design & Technical Contract:
 * - Footprint: 100x100m (X in [-50, +50], Z in [-50, +50]), completely flat walkable ground (Y = 0.0)
 * - Performance target (Intel Iris Xe friendly): 110K - 160K total triangles, 0 glTF lights, 0 emission!
 * - 4 corner outpost/town team spawns: Spawn_Team0_0..4 .. Spawn_Team3_0..4 (Y = 0.05, >= 2.2m from walls/props)
 * - 18 CardPoints (CardPoint_01..18) + 18 Prop_CardPedestal_01..18
 * - 16 Extraction DoorPoints (DoorPoint_01..16) along outer perimeter walls
 * - All walkable corridors >= 3.5m wide (player capsule 0.8m, zero snagging)
 * - Rich layered desert ground: ground_desert_sand + ground_packed_earth + ground_helipad_concrete
 *   + 160+ ground decals (Decal_*, Y = 0.015..0.025, alphaMode: "MASK", 0 emission)
 * - Exact 21 PBR texture sets referenced as textures/<name>_{albedo,normal,orm}.png
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'asset model', 'haritalar', 'Map3_Col_v3_1');
const GLTF_NAME = 'Map3_Col_Ileri_Karakolu_5v5v5v5_v3_1.gltf';
const BIN_NAME = 'Map3_Col_Ileri_Karakolu_5v5v5v5_v3_1.bin';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ============================================================================
// 0. DETERMINISTIC PRNG
// ============================================================================
let rngState = 2026112431;
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

// ============================================================================
// 1. MESH BUILDER (Positions, Normals, UVs, Tangents, Indices)
// ============================================================================
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

  addFlatQuadXZ(cx, y, cz, sx, sz, yaw = 0, uScale = 1, vScale = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = sx * 0.5, hz = sz * 0.5;
    const xf = (lx, lz) => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
    // CCW when viewed from +Y
    this.addQuad(
      xf(-hx,  hz), xf( hx,  hz), xf( hx, -hz), xf(-hx, -hz),
      [0, 1, 0], 0, 0, uScale, vScale
    );
  }

  addBeveledBox(cx, cy, cz, sx, sy, sz, yaw = 0, bevel = 0.03, uvScale = 0.5, segsX = 1, segsY = 1, segsZ = 1) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const xform = (x, y, z) => [cx + x * cosY - z * sinY, cy + y, cz + x * sinY + z * cosY];
    const xformN = (nx, ny, nz) => [nx * cosY - nz * sinY, ny, nx * sinY + nz * cosY];

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

    addGridFace([-hx + b, -hy + b,  hz], [ sx - 2 * b, 0, 0], [0, sy - 2 * b, 0], [ 0,  0,  1], segsX, segsY, sx, sy);
    addGridFace([ hx - b, -hy + b, -hz], [-(sx - 2 * b), 0, 0], [0, sy - 2 * b, 0], [ 0,  0, -1], segsX, segsY, sx, sy);
    addGridFace([ hx, -hy + b,  hz - b], [0, 0, -(sz - 2 * b)], [0, sy - 2 * b, 0], [ 1,  0,  0], segsZ, segsY, sz, sy);
    addGridFace([-hx, -hy + b, -hz + b], [0, 0,  (sz - 2 * b)], [0, sy - 2 * b, 0], [-1,  0,  0], segsZ, segsY, sz, sy);
    addGridFace([-hx + b,  hy,  hz - b], [ sx - 2 * b, 0, 0], [0, 0, -(sz - 2 * b)], [ 0,  1,  0], segsX, segsZ, sx, sz);
    addGridFace([-hx + b, -hy, -hz + b], [ sx - 2 * b, 0, 0], [0, 0,  (sz - 2 * b)], [ 0, -1,  0], segsX, segsZ, sx, sz);

    if (b > 0.001) {
      const s2 = Math.SQRT1_2;
      addGridFace([ hx - b, -hy + b,  hz], [ b, 0, -b], [0, sy - 2 * b, 0], [ s2, 0,  s2], 1, segsY, b * 1.4, sy);
      addGridFace([ hx, -hy + b, -hz + b], [-b, 0, -b], [0, sy - 2 * b, 0], [ s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx + b, -hy + b, -hz], [-b, 0,  b], [0, sy - 2 * b, 0], [-s2, 0, -s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx, -hy + b,  hz - b], [ b, 0,  b], [0, sy - 2 * b, 0], [-s2, 0,  s2], 1, segsY, b * 1.4, sy);
      addGridFace([-hx + b,  hy - b,  hz], [ sx - 2 * b, 0, 0], [0, b, -b], [0, s2,  s2], segsX, 1, sx, b * 1.4);
      addGridFace([ hx - b,  hy - b, -hz], [-(sx - 2 * b), 0, 0], [0, b,  b], [0, s2, -s2], segsX, 1, sx, b * 1.4);
      addGridFace([ hx,  hy - b,  hz - b], [0, 0, -(sz - 2 * b)], [-b, b, 0], [ s2, s2, 0], segsZ, 1, sz, b * 1.4);
      addGridFace([-hx,  hy - b, -hz + b], [0, 0,  (sz - 2 * b)], [ b, b, 0], [-s2, s2, 0], segsZ, 1, sz, b * 1.4);
    }
  }

  addSimpleBox(cx, cy, cz, sx, sy, sz, yaw = 0, uvScale = 0.5) {
    this.addBeveledBox(cx, cy, cz, sx, sy, sz, yaw, 0.0, uvScale, 1, 1, 1);
  }

  addWallSegment(x0, z0, x1, z1, height = 3.1, thick = 0.52, addParapet = true) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const yaw = -Math.atan2(dz, dx);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const segsX = Math.max(2, Math.min(8, Math.round(len * 0.55)));

    // Main wall body
    this.addBeveledBox(cx, height * 0.5, cz, len, height, thick, yaw, 0.04, 1.0 / 3.0, segsX, 2, 1);
    // Base plinth (protrudes 3cm)
    this.addBeveledBox(cx, 0.14, cz, len + 0.02, 0.28, thick + 0.06, yaw, 0.02, 0.4, Math.max(1, Math.round(len * 0.3)), 1, 1);
    // Top coping / adobe parapet lip
    if (addParapet) {
      this.addBeveledBox(cx, height - 0.09, cz, len + 0.04, 0.18, thick + 0.06, yaw, 0.025, 0.4, Math.max(1, Math.round(len * 0.3)), 1, 1);
    }
    // Buttress pilasters every ~4.2m
    const numRibs = Math.max(2, Math.floor(len / 4.2) + 1);
    for (let i = 0; i < numRibs; i++) {
      const t = numRibs === 1 ? 0 : (i / (numRibs - 1) - 0.5) * (len - 0.34);
      const rx = cx + t * cosY;
      const rz = cz + t * sinY;
      this.addBeveledBox(rx, height * 0.5, rz, 0.30, height - 0.04, thick + 0.08, yaw, 0.025, 0.4, 1, 1, 1);
    }
  }

  addCylinder(cx, cy, cz, rBottom, rTop, height, radialSegs = 14, heightSegs = 1, cap = true, yaw = 0, pitch = 0, uvScale = 1.0) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const xform = (lx, ly, lz) => {
      const py = ly * cosP - lz * sinP;
      const pz = ly * sinP + lz * cosP;
      return [cx + lx * cosY - pz * sinY, cy + py, cz + lx * sinY + pz * cosY];
    };
    const xformN = (nx, ny, nz) => {
      const py = ny * cosP - nz * sinP;
      const pz = ny * sinP + nz * cosP;
      return [nx * cosY - pz * sinY, py, nx * sinY + pz * cosY];
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
        const wn = xformN(c, (rBottom - rTop) / (height || 1), s);
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

  // Organic faceted sandstone rock / boulder (perturbed UV sphere, flat-bottomed)
  addRock(cx, cy, cz, rx, ry, rz, yaw = 0, seed = 1, latSegs = 10, lonSegs = 14) {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const baseIdx = this.pos.length / 3;
    const verts = [];
    for (let il = 0; il <= latSegs; il++) {
      const v = il / latSegs;
      const phi = v * Math.PI; // 0 (top) to PI (bottom)
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let io = 0; io <= lonSegs; io++) {
        const u = io / lonSegs;
        const theta = u * Math.PI * 2;
        const ct = Math.cos(theta), st = Math.sin(theta);
        const nx0 = sp * ct, ny0 = cp, nz0 = sp * st;
        // Layered desert sandstone strata displacement
        const strata = 1.0 + 0.14 * Math.sin(ny0 * 7.5 + seed) + 0.12 * Math.cos(theta * 3.0 + seed * 1.7) * sp + 0.08 * Math.sin(theta * 5.0 - ny0 * 4.0 + seed * 2.3);
        let lx = nx0 * rx * strata;
        let ly = ny0 * ry * strata;
        let lz = nz0 * rz * strata;
        // Flatten bottom cleanly at y = -0.15
        if (ly < -ry * 0.35) ly = -ry * 0.35;
        const wx = cx + lx * cosY - lz * sinY;
        const wy = cy + ly + ry * 0.30;
        const wz = cz + lx * sinY + lz * cosY;
        verts.push([wx, wy, wz, u * 2.0, v * 2.0]);
      }
    }
    for (const vt of verts) {
      const dx = vt[0] - cx, dy = vt[1] - (cy + ry * 0.3), dz = vt[2] - cz;
      this.addVertex(vt[0], vt[1], vt[2], dx, dy, dz, vt[3], vt[4], -dz, 0, dx, 1);
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

  // Soft pillowy sandbag shape (squashed beveled pillow with smooth curvature)
  addSandbag(cx, cy, cz, len = 0.72, h = 0.24, w = 0.38, yaw = 0) {
    this.addBeveledBox(cx, cy, cz, len, h, w, yaw, 0.08, 1.4, 3, 2, 2);
  }
}

// ============================================================================
// 2. GLTF 2.0 ASSEMBLER & EXACT 21 PBR MATERIALS (ZERO EMISSION!)
// ============================================================================
const materials = [];
const textures = [];
const images = [];
const meshes = [];
const nodes = [];
const accessors = [];
const bufferViews = [];
const binChunks = [];
let binByteLength = 0;
let totalTriangles = 0;

const imageIndexByUri = new Map();
function getTextureIndex(relUri) {
  if (imageIndexByUri.has(relUri)) return imageIndexByUri.get(relUri);
  const name = path.basename(relUri, '.png');
  const imgIdx = images.length;
  images.push({ mimeType: 'image/png', name, uri: relUri });
  const texIdx = textures.length;
  textures.push({ sampler: 0, source: imgIdx });
  imageIndexByUri.set(relUri, texIdx);
  return texIdx;
}

function makeDesertMaterial(texBaseName, opts = {}) {
  const albedoTex = getTextureIndex(`textures/${texBaseName}_albedo.png`);
  const normalTex = getTextureIndex(`textures/${texBaseName}_normal.png`);
  const ormTex = getTextureIndex(`textures/${texBaseName}_orm.png`);
  const mat = {
    name: `Mat_${texBaseName}`,
    doubleSided: opts.doubleSided !== undefined ? opts.doubleSided : true,
    normalTexture: {
      index: normalTex,
      scale: opts.normalScale !== undefined ? opts.normalScale : 1.2
    },
    occlusionTexture: {
      index: ormTex,
      strength: 1.0
    },
    pbrMetallicRoughness: {
      baseColorTexture: { index: albedoTex },
      metallicRoughnessTexture: { index: ormTex },
      metallicFactor: opts.metallicFactor !== undefined ? opts.metallicFactor : 0.0,
      roughnessFactor: opts.roughnessFactor !== undefined ? opts.roughnessFactor : 1.0
    }
  };
  if (opts.alphaMode) {
    mat.alphaMode = opts.alphaMode;
    if (opts.alphaMode === 'MASK') mat.alphaCutoff = opts.alphaCutoff !== undefined ? opts.alphaCutoff : 0.45;
  }
  // STRICTLY ZERO EMISSION: never set emissiveFactor or emissiveTexture
  const idx = materials.length;
  materials.push(mat);
  return idx;
}

// Register all 21 required texture sets
const MAT = {
  ground_desert_sand:      makeDesertMaterial('ground_desert_sand',      { metallicFactor: 0.0, normalScale: 1.35 }),
  ground_packed_earth:     makeDesertMaterial('ground_packed_earth',     { metallicFactor: 0.0, normalScale: 1.3 }),
  ground_helipad_concrete: makeDesertMaterial('ground_helipad_concrete', { metallicFactor: 0.0, normalScale: 1.25 }),
  wall_adobe_plaster:      makeDesertMaterial('wall_adobe_plaster',      { metallicFactor: 0.0, normalScale: 1.35 }),
  wall_concrete_weathered: makeDesertMaterial('wall_concrete_weathered', { metallicFactor: 0.0, normalScale: 1.3 }),
  wood_dry_planks:         makeDesertMaterial('wood_dry_planks',         { metallicFactor: 0.0, normalScale: 1.25 }),
  metal_rusty_corrugated:  makeDesertMaterial('metal_rusty_corrugated',  { metallicFactor: 0.85, normalScale: 1.35 }),
  metal_military_tan:      makeDesertMaterial('metal_military_tan',      { metallicFactor: 0.75, normalScale: 1.25 }),
  fabric_sandbag:          makeDesertMaterial('fabric_sandbag',          { metallicFactor: 0.0, normalScale: 1.35 }),
  fabric_tarp_tan:         makeDesertMaterial('fabric_tarp_tan',         { metallicFactor: 0.0, normalScale: 1.25 }),
  rock_sandstone:          makeDesertMaterial('rock_sandstone',          { metallicFactor: 0.0, normalScale: 1.4 }),
  foliage_palm_bark:       makeDesertMaterial('foliage_palm_bark',       { metallicFactor: 0.0, normalScale: 1.35 }),
  foliage_desert_scrub:    makeDesertMaterial('foliage_desert_scrub',    { metallicFactor: 0.0, normalScale: 1.15, alphaMode: 'MASK', alphaCutoff: 0.42 }),
  prop_crate_military:     makeDesertMaterial('prop_crate_military',     { metallicFactor: 0.15, normalScale: 1.25 }),
  prop_barrel_rust:        makeDesertMaterial('prop_barrel_rust',        { metallicFactor: 0.8, normalScale: 1.3 }),
  decal_sand_drift:        makeDesertMaterial('decal_sand_drift',        { metallicFactor: 0.0, normalScale: 1.2, alphaMode: 'MASK', alphaCutoff: 0.35 }),
  decal_cracked_mud:       makeDesertMaterial('decal_cracked_mud',       { metallicFactor: 0.0, normalScale: 1.3, alphaMode: 'MASK', alphaCutoff: 0.35 }),
  decal_tire_tracks:       makeDesertMaterial('decal_tire_tracks',       { metallicFactor: 0.0, normalScale: 1.25, alphaMode: 'MASK', alphaCutoff: 0.35 }),
  decal_helipad_mark:      makeDesertMaterial('decal_helipad_mark',      { metallicFactor: 0.0, normalScale: 1.0, alphaMode: 'MASK', alphaCutoff: 0.35 }),
  decal_rubble_gravel:     makeDesertMaterial('decal_rubble_gravel',     { metallicFactor: 0.0, normalScale: 1.35, alphaMode: 'MASK', alphaCutoff: 0.38 }),
  decal_oil_scorch:        makeDesertMaterial('decal_oil_scorch',        { metallicFactor: 0.0, normalScale: 1.15, alphaMode: 'MASK', alphaCutoff: 0.35 })
};

function appendBuffer(buf, target) {
  const pad = (4 - (binByteLength % 4)) % 4;
  if (pad > 0) {
    binChunks.push(Buffer.alloc(pad));
    binByteLength += pad;
  }
  const bvIdx = bufferViews.length;
  bufferViews.push({ buffer: 0, byteLength: buf.length, byteOffset: binByteLength, target });
  binChunks.push(buf);
  binByteLength += buf.length;
  return bvIdx;
}

function createPrimitive(builder, matIdx) {
  const posArr = builder.pos;
  const vCount = posArr.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < posArr.length; i += 3) {
    const x = posArr[i], y = posArr[i + 1], z = posArr[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const posBv  = appendBuffer(Buffer.from(new Float32Array(posArr).buffer), 34962);
  const normBv = appendBuffer(Buffer.from(new Float32Array(builder.norm).buffer), 34962);
  const uvBv   = appendBuffer(Buffer.from(new Float32Array(builder.uv).buffer), 34962);
  const tanBv  = appendBuffer(Buffer.from(new Float32Array(builder.tan).buffer), 34962);

  const posAcc  = accessors.length; accessors.push({ bufferView: posBv,  componentType: 5126, count: vCount, min: [minX, minY, minZ], max: [maxX, maxY, maxZ], type: 'VEC3' });
  const normAcc = accessors.length; accessors.push({ bufferView: normBv, componentType: 5126, count: vCount, type: 'VEC3' });
  const uvAcc   = accessors.length; accessors.push({ bufferView: uvBv,   componentType: 5126, count: vCount, type: 'VEC2' });
  const tanAcc  = accessors.length; accessors.push({ bufferView: tanBv,  componentType: 5126, count: vCount, type: 'VEC4' });

  const useU32 = vCount > 65535;
  const indTyped = useU32 ? new Uint32Array(builder.ind) : new Uint16Array(builder.ind);
  const indBv = appendBuffer(Buffer.from(indTyped.buffer), 34963);
  const indAcc = accessors.length;
  accessors.push({ bufferView: indBv, componentType: useU32 ? 5125 : 5123, count: builder.ind.length, type: 'SCALAR' });

  return {
    attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc, TANGENT: tanAcc },
    indices: indAcc,
    material: matIdx,
    _tris: builder.ind.length / 3
  };
}

function registerMesh(meshName, parts) {
  const primitives = [];
  let meshTris = 0;
  for (const item of parts) {
    if (!item.builder || item.builder.pos.length === 0) continue;
    const prim = createPrimitive(item.builder, item.mat);
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
// 3. GAMEPLAY COORDINATES: 20 SPAWNS, 18 CARD POINTS, 16 DOOR POINTS
// ============================================================================
const TEAM_CENTERS = [
  [-41.5, 0.05, -41.5], // Team 0 (NW Outpost)
  [ 41.5, 0.05, -41.5], // Team 1 (NE Outpost)
  [-41.5, 0.05,  41.5], // Team 2 (SW Outpost)
  [ 41.5, 0.05,  41.5]  // Team 3 (SE Outpost)
];
const SPAWN_OFFSETS = [
  [ 0.0,  0.0],
  [-1.8, -1.8],
  [ 1.8, -1.8],
  [-1.8,  1.8],
  [ 1.8,  1.8]
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

// 18 Card Candidate Points (Y = 1.08 atop 0.96m Prop_CardPedestal_01..18)
// Balanced across center helipad, 4 town/outpost quadrants, interiors & side alleys
const CARD_POINTS = [
  // 2 Center Helipad Perimeter
  [ -6.8, 1.08,  -6.8], // 01: Helipad NW Corner
  [  6.8, 1.08,   6.8], // 02: Helipad SE Corner
  // 4 Inside Quadrant Buildings (open-top adobe/concrete interiors)
  [-24.0, 1.08, -28.0], // 03: NW Adobe House A Interior
  [ 24.0, 1.08, -28.0], // 04: NE Concrete Outpost Interior
  [-24.0, 1.08,  28.0], // 05: SW Market House Interior
  [ 24.0, 1.08,  28.0], // 06: SE Command Building Interior
  // 4 Quadrant Courtyards / Secondary Alleys
  [-18.0, 1.08, -15.5], // 07: NW Inner Town Alley
  [ 18.0, 1.08, -15.5], // 08: NE Logistics Courtyard
  [-18.0, 1.08,  15.5], // 09: SW Bazaar Courtyard
  [ 18.0, 1.08,  15.5], // 10: SE Rock Outpost Yard
  // 4 Cardinal Pockets (N, S, W, E)
  [  0.0, 1.08, -28.0], // 11: North Oasis Pass
  [  0.0, 1.08,  28.0], // 12: South Convoy Checkpoint
  [-28.0, 1.08,   0.0], // 13: West Corrugated Yard
  [ 28.0, 1.08,   0.0], // 14: East Supply Depot
  // 4 Outer Mid-Flank Streets (all >= 18m from spawns)
  [-14.0, 1.08, -39.0], // 15: North-West Perimeter Street
  [ 14.0, 1.08, -39.0], // 16: North-East Perimeter Street
  [-14.0, 1.08,  39.0], // 17: South-West Perimeter Street
  [ 14.0, 1.08,  39.0]  // 18: South-East Perimeter Street
];

// 16 Extraction Door Candidate Points (flush near outer perimeter walls at ±49.5, clear radius >= 2.2m)
const DOOR_POINTS = [
  // North Perimeter Wall (Z = -46.8)
  [-19.0, 0.10, -46.8], // 01
  [ -6.5, 0.10, -46.8], // 02
  [  6.5, 0.10, -46.8], // 03
  [ 19.0, 0.10, -46.8], // 04
  // South Perimeter Wall (Z = +46.8)
  [-19.0, 0.10,  46.8], // 05
  [ -6.5, 0.10,  46.8], // 06
  [  6.5, 0.10,  46.8], // 07
  [ 19.0, 0.10,  46.8], // 08
  // West Perimeter Wall (X = -46.8)
  [-46.8, 0.10, -19.0], // 09
  [-46.8, 0.10,  -6.5], // 10
  [-46.8, 0.10,   6.5], // 11
  [-46.8, 0.10,  19.0], // 12
  // East Perimeter Wall (X = +46.8)
  [ 46.8, 0.10, -19.0], // 13
  [ 46.8, 0.10,  -6.5], // 14
  [ 46.8, 0.10,   6.5], // 15
  [ 46.8, 0.10,  19.0]  // 16
];

// ============================================================================
// 4. REUSABLE SHARED PROP MESHES (Instanced for Iris Xe friendliness!)
// ============================================================================
function createSharedPropMeshes() {
  // 4a. Military Crate (~480 tris)
  const crateMesh = (() => {
    const bBody = new MeshBuilder();
    const bTrim = new MeshBuilder();
    bBody.addBeveledBox(0, 0.45, 0, 1.35, 0.90, 0.85, 0, 0.03, 0.9, 2, 1, 1);
    // Wooden/metal reinforcing ribs & lid rim
    bTrim.addBeveledBox(0, 0.90, 0, 1.40, 0.07, 0.90, 0, 0.015, 1.0, 1, 1, 1);
    bTrim.addBeveledBox(0, 0.05, 0, 1.38, 0.08, 0.88, 0, 0.015, 1.0, 1, 1, 1);
    for (const sx of [-0.48, 0, 0.48]) {
      bTrim.addBeveledBox(sx, 0.46, 0, 0.08, 0.82, 0.89, 0, 0.01, 1.2, 1, 1, 1);
    }
    return registerMesh('Shared_MilitaryCrate_Mesh', [
      { builder: bBody, mat: MAT.prop_crate_military },
      { builder: bTrim, mat: MAT.metal_military_tan }
    ]);
  })();

  // 4b. Rusty Fuel Barrel (high-detail hoops & rim)
  const barrelMesh = (() => {
    const b = new MeshBuilder();
    b.addCylinder(0, 0.48, 0, 0.30, 0.30, 0.96, 22, 3, true, 0, 0, 1.0);
    // Rolling hoops & top/bottom chimes
    b.addCylinder(0, 0.32, 0, 0.318, 0.318, 0.045, 22, 1, false, 0, 0, 1.0);
    b.addCylinder(0, 0.64, 0, 0.318, 0.318, 0.045, 22, 1, false, 0, 0, 1.0);
    b.addCylinder(0, 0.95, 0, 0.312, 0.312, 0.03, 22, 1, false, 0, 0, 1.0);
    // Bung caps
    b.addCylinder(0.14, 0.98, 0.08, 0.035, 0.035, 0.05, 10, 1, true);
    b.addCylinder(-0.12, 0.975, -0.06, 0.022, 0.022, 0.04, 8, 1, true);
    return registerMesh('Shared_RustBarrel_Mesh', [{ builder: b, mat: MAT.prop_barrel_rust }]);
  })();

  // 4c. Sandbag Emplacement Straight (3.2m wide, 3 stacked staggered courses, ~920 tris)
  const sandbagWallMesh = (() => {
    const b = new MeshBuilder();
    const courses = [
      { y: 0.13, count: 4, zOff: 0.0 },
      { y: 0.37, count: 4, zOff: 0.02 },
      { y: 0.61, count: 3, zOff: -0.02 },
      { y: 0.85, count: 3, zOff: 0.01 }
    ];
    for (let c = 0; c < courses.length; c++) {
      const row = courses[c];
      const spacing = 0.74;
      const startX = -((row.count - 1) * spacing) * 0.5;
      for (let i = 0; i < row.count; i++) {
        const bx = startX + i * spacing + (c % 2 === 0 ? 0.04 : -0.04);
        const yaw = ((i + c) % 3 - 1) * 0.04;
        b.addSandbag(bx, row.y, row.zOff + ((i % 2) * 0.03 - 0.015), 0.70, 0.25, 0.44, yaw);
        // Back reinforcing course on bottom two rows
        if (c < 2) {
          b.addSandbag(bx, row.y, row.zOff - 0.36, 0.68, 0.24, 0.38, -yaw);
        }
      }
    }
    return registerMesh('Shared_SandbagWall_Mesh', [{ builder: b, mat: MAT.fabric_sandbag }]);
  })();

  // 4d. Sandbag Corner L-Bunker (~1,150 tris)
  const sandbagCornerMesh = (() => {
    const b = new MeshBuilder();
    for (let c = 0; c < 4; c++) {
      const y = 0.13 + c * 0.24;
      const n = c < 2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        b.addSandbag(-1.2 + i * 0.72, y, -0.15, 0.70, 0.25, 0.44, (i % 2 ? 0.03 : -0.03));
        if (i > 0) {
          b.addSandbag(-1.2, y, -0.15 + i * 0.72, 0.70, 0.25, 0.44, Math.PI * 0.5 + (i % 2 ? 0.03 : -0.03));
        }
      }
    }
    return registerMesh('Shared_SandbagCorner_Mesh', [{ builder: b, mat: MAT.fabric_sandbag }]);
  })();

  // 4e. Military Portable Generator (~640 tris)
  const generatorMesh = (() => {
    const bTan = new MeshBuilder();
    const bDark = new MeshBuilder();
    bTan.addBeveledBox(0, 0.68, 0, 2.2, 1.15, 1.05, 0, 0.04, 0.6, 2, 1, 1);
    bDark.addBeveledBox(0, 0.08, 0, 2.35, 0.16, 1.15, 0, 0.02, 0.8, 1, 1, 1); // skid frame
    // Exhaust pipe & muffler
    bDark.addCylinder(0.85, 1.48, 0.28, 0.06, 0.06, 0.55, 10, 1, true);
    bDark.addCylinder(0.85, 1.32, 0.28, 0.12, 0.12, 0.28, 12, 1, true);
    // Side radiator louvers
    bDark.addBeveledBox(-0.3, 0.72, 0.54, 0.85, 0.55, 0.05, 0, 0.01, 1.0);
    bDark.addBeveledBox(-0.3, 0.72, -0.54, 0.85, 0.55, 0.05, 0, 0.01, 1.0);
    return registerMesh('Shared_Generator_Mesh', [
      { builder: bTan, mat: MAT.metal_military_tan },
      { builder: bDark, mat: MAT.prop_barrel_rust }
    ]);
  })();

  // 4f. Military Water Tank on Concrete Cradle (with steel hoops & maintenance ladder)
  const waterTankMesh = (() => {
    const bTank = new MeshBuilder();
    const bCradle = new MeshBuilder();
    const bPipe = new MeshBuilder();
    // Horizontal cylindrical tank
    bTank.addCylinder(0, 1.55, 0, 0.92, 0.92, 3.2, 24, 3, true, Math.PI * 0.5, Math.PI * 0.5, 0.8);
    // Top inspection hatch & collar
    bTank.addCylinder(0, 2.52, 0, 0.28, 0.26, 0.20, 16, 1, true);
    // Concrete support cradles
    bCradle.addBeveledBox(-1.0, 0.45, 0, 0.42, 0.90, 1.65, 0, 0.03, 0.5, 1, 2, 2);
    bCradle.addBeveledBox( 1.0, 0.45, 0, 0.42, 0.90, 1.65, 0, 0.03, 0.5, 1, 2, 2);
    // Metal straps, valve pipe & side ladder
    bPipe.addCylinder(1.62, 1.15, 0, 0.07, 0.07, 0.65, 12, 1, true, 0, 0);
    bPipe.addCylinder(1.62, 1.48, 0, 0.14, 0.14, 0.05, 12, 1, true, 0, Math.PI * 0.5);
    bPipe.addBeveledBox(0, 0.95, 0, 2.4, 0.12, 1.5, 0, 0.02, 0.6);
    // Side ladder rails + 5 rungs
    bPipe.addCylinder(-0.22, 1.25, 0.96, 0.025, 0.025, 2.45, 8, 1, true);
    bPipe.addCylinder( 0.22, 1.25, 0.96, 0.025, 0.025, 2.45, 8, 1, true);
    for (let r = 0; r < 5; r++) {
      bPipe.addBeveledBox(0, 0.35 + r * 0.45, 0.96, 0.44, 0.035, 0.035, 0, 0.005, 1.0);
    }
    return registerMesh('Shared_WaterTank_Mesh', [
      { builder: bTank, mat: MAT.metal_military_tan },
      { builder: bCradle, mat: MAT.wall_concrete_weathered },
      { builder: bPipe, mat: MAT.prop_barrel_rust }
    ]);
  })();

  // 4g. Military Card Pedestal (0.96m tall, clean top at Y=0.96, ~340 tris)
  const pedestalMesh = (() => {
    const bBase = new MeshBuilder();
    const bTop = new MeshBuilder();
    bBase.addBeveledBox(0, 0.10, 0, 0.82, 0.20, 0.82, 0, 0.02, 0.8);
    bBase.addBeveledBox(0, 0.54, 0, 0.58, 0.68, 0.58, 0, 0.025, 0.8);
    bTop.addBeveledBox(0, 0.92, 0, 0.72, 0.08, 0.72, 0, 0.015, 0.9);
    return registerMesh('Shared_CardPedestal_Mesh', [
      { builder: bBase, mat: MAT.metal_military_tan },
      { builder: bTop, mat: MAT.prop_crate_military }
    ]);
  })();

  // 4h. Sandstone Cliff Rock Cluster (stratified desert sandstone, feeds ImportedMap outer_world!)
  const cliffRockMesh = (() => {
    const b = new MeshBuilder();
    b.addRock(0.0, 0.0, 0.0, 2.1, 2.35, 1.75, 0.2, 1.1, 14, 20);
    b.addRock(1.4, 0.0, 0.6, 1.25, 1.45, 1.15, 1.1, 2.7, 12, 16);
    b.addRock(-1.3, 0.0, -0.5, 1.15, 1.20, 1.05, -0.8, 4.3, 12, 16);
    return registerMesh('Shared_SandstoneCliff_Mesh', [{ builder: b, mat: MAT.rock_sandstone }]);
  })();

  // 4i. Medium Sandstone Boulder
  const boulderMesh = (() => {
    const b = new MeshBuilder();
    b.addRock(0.0, 0.0, 0.0, 1.15, 0.95, 0.95, 0.4, 5.2, 12, 16);
    b.addRock(0.75, 0.0, -0.4, 0.55, 0.48, 0.50, 1.8, 7.1, 10, 12);
    return registerMesh('Shared_SandstoneBoulder_Mesh', [{ builder: b, mat: MAT.rock_sandstone }]);
  })();

  // 4j. Palm Tree Trunk (ringed curved bark trunk)
  const palmTrunkMesh = (() => {
    const b = new MeshBuilder();
    const segs = 11;
    const totalH = 5.4;
    const segH = totalH / segs;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const bendX0 = Math.sin(t0 * 1.4) * 0.42;
      const bendX1 = Math.sin(t1 * 1.4) * 0.42;
      const cx = (bendX0 + bendX1) * 0.5;
      const cy = (i + 0.5) * segH;
      const r0 = 0.29 - t0 * 0.11;
      const r1 = 0.27 - t1 * 0.11;
      b.addCylinder(cx, cy, 0, r0, r1, segH + 0.05, 12, 1, i === segs - 1, 0, 0, 1.0);
    }
    return registerMesh('Shared_PalmTrunk_Mesh', [{ builder: b, mat: MAT.foliage_palm_bark }]);
  })();

  // 4k. Palm Tree Fronds Canopy (12 arching 5-segment fronds at Y=5.3m, NO collision!)
  const palmFrondMesh = (() => {
    const b = new MeshBuilder();
    const crownX = Math.sin(1.4) * 0.42;
    const crownY = 5.35;
    const frondCount = 12;
    for (let i = 0; i < frondCount; i++) {
      const ang = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.14;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const len = i % 2 === 0 ? 2.55 : 2.05;
      const droop = i % 2 === 0 ? 0.88 : 0.48;
      const w = 0.60;
      const pts = [];
      for (let s = 0; s <= 5; s++) {
        const f = s / 5;
        const r = f * len;
        const y = crownY + Math.sin(f * Math.PI * 0.72) * 0.58 - f * f * droop;
        const halfW = w * Math.sin(Math.min(1, f * 1.15 + 0.12) * Math.PI * 0.85);
        pts.push({
          l: [crownX + ca * r - sa * halfW, y, sa * r + ca * halfW],
          r: [crownX + ca * r + sa * halfW, y, sa * r - ca * halfW],
          v: f
        });
      }
      for (let s = 0; s < 5; s++) {
        b.addQuad(pts[s].l, pts[s].r, pts[s + 1].r, pts[s + 1].l, [0, 1, 0], 0, pts[s].v, 1, pts[s + 1].v);
      }
    }
    return registerMesh('Shared_PalmFrond_Mesh', [{ builder: b, mat: MAT.foliage_desert_scrub }]);
  })();

  // 4l. Dry Desert Tree (twisted trunk + dead branches, ~440 tris)
  const dryTreeMesh = (() => {
    const b = new MeshBuilder();
    b.addCylinder(0, 1.15, 0, 0.24, 0.15, 2.3, 10, 2, true, 0, 0.08, 1.0);
    b.addCylinder(0.35, 2.45, 0.15, 0.12, 0.05, 1.5, 8, 1, true, 0.4, 0.65, 1.0);
    b.addCylinder(-0.38, 2.35, -0.20, 0.11, 0.05, 1.35, 8, 1, true, 2.4, 0.72, 1.0);
    b.addCylinder(0.08, 2.65, -0.35, 0.09, 0.04, 1.2, 8, 1, true, -1.3, 0.55, 1.0);
    return registerMesh('Shared_DryTree_Mesh', [{ builder: b, mat: MAT.foliage_palm_bark }]);
  })();

  // 4m. Desert Scrub Bush (3 crossed alpha-masked quads, 6 tris, NO collision/shadow!)
  const scrubMesh = (() => {
    const b = new MeshBuilder();
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI;
      const c = Math.cos(ang), s = Math.sin(ang);
      const hw = 0.62, h = 0.78;
      b.addQuad(
        [-c * hw, 0.0, -s * hw],
        [ c * hw, 0.0,  s * hw],
        [ c * hw, h,    s * hw],
        [-c * hw, h,   -s * hw],
        [-s, 0.3, c], 0, 1, 1, 0
      );
    }
    return registerMesh('Shared_DesertScrub_Mesh', [{ builder: b, mat: MAT.foliage_desert_scrub }]);
  })();

  // 4n. Wooden Market Stall / Bench (~220 tris)
  const marketStallMesh = (() => {
    const b = new MeshBuilder();
    b.addBeveledBox(0, 0.86, 0, 2.4, 0.09, 0.95, 0, 0.015, 0.8);
    for (const lx of [-1.05, 1.05]) {
      for (const lz of [-0.38, 0.38]) {
        b.addBeveledBox(lx, 0.43, lz, 0.10, 0.86, 0.10, 0, 0.01, 1.0);
      }
    }
    b.addBeveledBox(0, 0.30, 0, 2.2, 0.06, 0.80, 0, 0.01, 0.8);
    return registerMesh('Shared_MarketStall_Mesh', [{ builder: b, mat: MAT.wood_dry_planks }]);
  })();

  // 4o. Radio / Antenna Communications Tower (~1,450 tris, 9.2m tall, base 1.8x1.8m)
  const radioTowerMesh = (() => {
    const bTower = new MeshBuilder();
    const bBase = new MeshBuilder();
    // Concrete pad
    bBase.addBeveledBox(0, 0.14, 0, 2.2, 0.28, 2.2, 0, 0.03, 0.5);
    // 4 tapered corner legs
    const levels = [
      { y: 0.28, r: 0.82 },
      { y: 2.50, r: 0.64 },
      { y: 4.80, r: 0.46 },
      { y: 7.10, r: 0.28 },
      { y: 9.00, r: 0.16 }
    ];
    for (let lv = 0; lv < levels.length - 1; lv++) {
      const a = levels[lv], c = levels[lv + 1];
      const h = c.y - a.y;
      const my = (a.y + c.y) * 0.5;
      const mr = (a.r + c.r) * 0.5;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          bTower.addCylinder(sx * mr, my, sz * mr, 0.055, 0.048, h + 0.08, 6, 1, false);
        }
      }
      // Horizontal & X-bracing bars
      const span = c.r * 2.0;
      bTower.addSimpleBox(0, c.y,  c.r, span, 0.05, 0.05, 0, 1.0);
      bTower.addSimpleBox(0, c.y, -c.r, span, 0.05, 0.05, 0, 1.0);
      bTower.addSimpleBox( c.r, c.y, 0, 0.05, 0.05, span, 0, 1.0);
      bTower.addSimpleBox(-c.r, c.y, 0, 0.05, 0.05, span, 0, 1.0);
    }
    // Top antenna mast + dish
    bTower.addCylinder(0, 9.8, 0, 0.035, 0.02, 1.8, 8, 1, true);
    bTower.addCylinder(0.45, 7.6, 0, 0.55, 0.12, 0.22, 12, 1, true, 0, Math.PI * 0.45);
    return registerMesh('Shared_RadioTower_Mesh', [
      { builder: bTower, mat: MAT.metal_military_tan },
      { builder: bBase, mat: MAT.wall_concrete_weathered }
    ]);
  })();

  // 4p. Military Tarp Canopy (5.4x4.2m sagging fabric roof at Y=3.2m, NO collision) + 4 Corner Posts
  const tarpCanopyMesh = (() => {
    const b = new MeshBuilder();
    const sx = 5.4, sz = 4.2, segX = 12, segZ = 10;
    const baseIdx = b.pos.length / 3;
    for (let iz = 0; iz <= segZ; iz++) {
      const fz = iz / segZ;
      const lz = (fz - 0.5) * sz;
      for (let ix = 0; ix <= segX; ix++) {
        const fx = ix / segX;
        const lx = (fx - 0.5) * sx;
        const sag = -0.26 * Math.sin(fx * Math.PI) * Math.sin(fz * Math.PI);
        const ridge = 0.22 * (1.0 - Math.abs(fz - 0.5) * 2.0);
        b.addVertex(lx, 3.15 + ridge + sag, lz, 0, 1, 0, fx * 2.0, fz * 2.0, 1, 0, 0, 1);
      }
    }
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = baseIdx + iz * (segX + 1) + ix;
        const b1 = a + 1, c = a + (segX + 1), d = c + 1;
        b.ind.push(a, c, d, a, d, b1);
      }
    }
    return registerMesh('Shared_TarpCanopy_Mesh', [{ builder: b, mat: MAT.fabric_tarp_tan }]);
  })();

  const tarpPostsMesh = (() => {
    const b = new MeshBuilder();
    for (const px of [-2.55, 2.55]) {
      for (const pz of [-1.95, 1.95]) {
        b.addCylinder(px, 1.58, pz, 0.065, 0.055, 3.16, 8, 1, true);
      }
    }
    return registerMesh('Shared_TarpPosts_Mesh', [{ builder: b, mat: MAT.wood_dry_planks }]);
  })();

  // 4q. Decal Quad Meshes (1 per decal material, instanced with position/yaw/scale)
  function makeDecalMesh(name, matIdx) {
    const b = new MeshBuilder();
    b.addFlatQuadXZ(0, 0, 0, 1.0, 1.0, 0, 1, 1);
    return registerMesh(name, [{ builder: b, mat: matIdx }]);
  }

  return {
    crate: crateMesh,
    barrel: barrelMesh,
    sandbagWall: sandbagWallMesh,
    sandbagCorner: sandbagCornerMesh,
    generator: generatorMesh,
    waterTank: waterTankMesh,
    pedestal: pedestalMesh,
    cliffRock: cliffRockMesh,
    boulder: boulderMesh,
    palmTrunk: palmTrunkMesh,
    palmFrond: palmFrondMesh,
    dryTree: dryTreeMesh,
    scrub: scrubMesh,
    marketStall: marketStallMesh,
    radioTower: radioTowerMesh,
    tarpCanopy: tarpCanopyMesh,
    tarpPosts: tarpPostsMesh,
    decalSandDrift:    makeDecalMesh('Shared_Decal_SandDrift_Mesh',    MAT.decal_sand_drift),
    decalCrackedMud:   makeDecalMesh('Shared_Decal_CrackedMud_Mesh',   MAT.decal_cracked_mud),
    decalTireTracks:   makeDecalMesh('Shared_Decal_TireTracks_Mesh',   MAT.decal_tire_tracks),
    decalHelipadMark:  makeDecalMesh('Shared_Decal_HelipadMark_Mesh',  MAT.decal_helipad_mark),
    decalRubbleGravel: makeDecalMesh('Shared_Decal_RubbleGravel_Mesh', MAT.decal_rubble_gravel),
    decalOilScorch:    makeDecalMesh('Shared_Decal_OilScorch_Mesh',    MAT.decal_oil_scorch)
  };
}

const SHARED = createSharedPropMeshes();

// ============================================================================
// 5. GROUND LAYERS: DESERT SAND, PACKED EARTH STREETS, CENTRAL HELIPAD
// ============================================================================
function buildGroundLayers() {
  // 5a. Main Desert Sand Floor: Terrain_DesertFloor (100x100m, Y = 0.0, flat walkable!)
  // "Terrain" keyword enables ImportedMap.gd _build_outer_world infinite desert extension!
  {
    const b = new MeshBuilder();
    const segs = 36;
    const min = -50.0, max = 50.0;
    const baseIdx = b.pos.length / 3;
    for (let iz = 0; iz <= segs; iz++) {
      const fz = iz / segs;
      const z = min + fz * (max - min);
      for (let ix = 0; ix <= segs; ix++) {
        const fx = ix / segs;
        const x = min + fx * (max - min);
        // UV density: 1 tile per 4.0m (25 repeats across 100m)
        b.addVertex(x, 0.0, z, 0, 1, 0, fx * 25.0, fz * 25.0, 1, 0, 0, 1);
      }
    }
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = baseIdx + iz * (segs + 1) + ix;
        const b1 = a + 1, c = a + (segs + 1), d = c + 1;
        b.ind.push(a, c, d, a, d, b1);
      }
    }
    addGeometryNode('Terrain_DesertFloor', registerMesh('Terrain_DesertFloor_Mesh', [
      { builder: b, mat: MAT.ground_desert_sand }
    ]));
  }

  // 5b. Packed Earth Main Roads, Town Alleys & Outpost Courtyards (Y = 0.006, completely flat)
  {
    const b = new MeshBuilder();
    // Main E-W & N-S Convoy Roads (7.2m wide)
    b.addFlatQuadXZ(0, 0.006, 0, 94.0, 7.2, 0, 23.5, 1.8);
    b.addFlatQuadXZ(0, 0.007, 0, 7.2, 94.0, 0, 1.8, 23.5);
    // Inner Ring Road connecting the 4 tactical districts
    b.addFlatQuadXZ(0, 0.006, -20.5, 62.0, 4.6, 0, 15.5, 1.15);
    b.addFlatQuadXZ(0, 0.006,  20.5, 62.0, 4.6, 0, 15.5, 1.15);
    b.addFlatQuadXZ(-20.5, 0.006, 0, 4.6, 62.0, 0, 1.15, 15.5);
    b.addFlatQuadXZ( 20.5, 0.006, 0, 4.6, 62.0, 0, 1.15, 15.5);
    // 4 Corner Outpost Courtyards (14x14m)
    for (const [cx, , cz] of TEAM_CENTERS) {
      b.addFlatQuadXZ(cx, 0.006, cz, 14.0, 14.0, 0, 3.5, 3.5);
    }
    // 4 Town/Outpost Quadrant Plazas
    for (const qx of [-24, 24]) {
      for (const qz of [-24, 24]) {
        b.addFlatQuadXZ(qx, 0.006, qz, 18.0, 18.0, 0, 4.5, 4.5);
      }
    }
    addGeometryNode('Floor_PackedEarth_Roads', registerMesh('Floor_PackedEarth_Roads_Mesh', [
      { builder: b, mat: MAT.ground_packed_earth }
    ]));
  }

  // 5c. Central Military Helipad Concrete Pad (18x18m, flush at Y = 0.010)
  {
    const bPad = new MeshBuilder();
    const bCurb = new MeshBuilder();
    bPad.addFlatQuadXZ(0, 0.010, 0, 18.0, 18.0, 0, 4.5, 4.5);
    // Flush bevel perimeter concrete apron strips (no step, Y <= 0.014)
    bCurb.addFlatQuadXZ(0, 0.012, -9.2, 18.8, 0.45, 0, 4.7, 0.15);
    bCurb.addFlatQuadXZ(0, 0.012,  9.2, 18.8, 0.45, 0, 4.7, 0.15);
    bCurb.addFlatQuadXZ(-9.2, 0.012, 0, 0.45, 18.0, 0, 0.15, 4.5);
    bCurb.addFlatQuadXZ( 9.2, 0.012, 0, 0.45, 18.0, 0, 0.15, 4.5);
    addGeometryNode('Floor_Helipad_Center', registerMesh('Floor_Helipad_Center_Mesh', [
      { builder: bPad, mat: MAT.ground_helipad_concrete },
      { builder: bCurb, mat: MAT.wall_concrete_weathered }
    ]));

    // Helipad H marking decal (Y = 0.022, Decal_* -> no collision, no shadow, 0 emission)
    addGeometryNode('Decal_HelipadMark_01', SHARED.decalHelipadMark, [0, 0.022, 0], 0, [14.5, 1.0, 14.5]);
  }
}
buildGroundLayers();

// ============================================================================
// 6. OUTER PERIMETER WALLS & 16 EXTRACTION DOOR FRAMES
// ============================================================================
function buildPerimeterWalls() {
  const bAdobe = new MeshBuilder();
  const bConc = new MeshBuilder();
  const bDoorFrame = new MeshBuilder();
  const bDoorMetal = new MeshBuilder();

  const P = 49.5;
  // Build each of the 4 sides in alternating adobe & concrete defensive segments
  // North (Z = -49.5) & South (Z = +49.5)
  for (const sideZ of [-P, P]) {
    bConc.addWallSegment(-49.5, sideZ, -30.0, sideZ, 3.4, 0.85, true);
    bAdobe.addWallSegment(-30.0, sideZ, -12.0, sideZ, 3.2, 0.80, true);
    bConc.addWallSegment(-12.0, sideZ,  12.0, sideZ, 3.5, 0.85, true);
    bAdobe.addWallSegment( 12.0, sideZ,  30.0, sideZ, 3.2, 0.80, true);
    bConc.addWallSegment( 30.0, sideZ,  49.5, sideZ, 3.4, 0.85, true);
  }
  // West (X = -49.5) & East (X = +49.5)
  for (const sideX of [-P, P]) {
    bConc.addWallSegment(sideX, -49.5, sideX, -30.0, 3.4, 0.85, true);
    bAdobe.addWallSegment(sideX, -30.0, sideX, -12.0, 3.2, 0.80, true);
    bConc.addWallSegment(sideX, -12.0, sideX,  12.0, 3.5, 0.85, true);
    bAdobe.addWallSegment(sideX,  12.0, sideX,  30.0, 3.2, 0.80, true);
    bConc.addWallSegment(sideX,  30.0, sideX,  49.5, 3.4, 0.85, true);
  }

  // 4 Corner Bastion Watchtowers (at ±48.6, ±48.6 — >= 6.8m from spawn centers)
  for (const cx of [-48.5, 48.5]) {
    for (const cz of [-48.5, 48.5]) {
      bConc.addBeveledBox(cx, 2.3, cz, 2.6, 4.6, 2.6, 0, 0.06, 0.35, 2, 2, 2);
      bAdobe.addBeveledBox(cx, 4.7, cz, 2.9, 0.35, 2.9, 0, 0.03, 0.4, 2, 1, 2);
    }
  }

  // 16 Heavy Extraction Door Frames mounted flush against the inner face of the perimeter walls
  for (let i = 0; i < DOOR_POINTS.length; i++) {
    const [dx, , dz] = DOOR_POINTS[i];
    const isNS = Math.abs(dz) > Math.abs(dx);
    const wx = isNS ? dx : (dx < 0 ? -48.95 : 48.95);
    const wz = isNS ? (dz < 0 ? -48.95 : 48.95) : dz;
    const yaw = isNS ? 0 : Math.PI * 0.5;
    // Concrete frame lintel + side jambs (recessed against perimeter wall, >= 2.0m from DoorPoint)
    bDoorFrame.addBeveledBox(wx, 1.50, wz, 2.6, 3.0, 0.42, yaw, 0.03, 0.5, 1, 2, 1);
    // Corrugated steel blast door leaf inset
    bDoorMetal.addBeveledBox(wx, 1.38, wz, 2.05, 2.65, 0.48, yaw, 0.02, 0.6, 2, 2, 1);
  }

  addGeometryNode('Wall_Perimeter_Main', registerMesh('Wall_Perimeter_Main_Mesh', [
    { builder: bAdobe, mat: MAT.wall_adobe_plaster },
    { builder: bConc, mat: MAT.wall_concrete_weathered },
    { builder: bDoorFrame, mat: MAT.wall_concrete_weathered },
    { builder: bDoorMetal, mat: MAT.metal_rusty_corrugated }
  ]));
}
buildPerimeterWalls();

// ============================================================================
// 7. MODULAR OPEN-TOP DESERT BUILDINGS (Adobe Houses, Concrete Outposts, Sheds)
// ============================================================================
/**
 * Builds an open-top rectangular building with wide doorways (>= 3.6m) on multiple sides,
 * low window cutouts, and overhead wooden roof beams (RoofBeam_Canopy_*, no collision).
 */
function buildOpenTopBuilding(name, cx, cz, w, d, wallMat, doors = ['N', 'S', 'E', 'W'], opts = {}) {
  const bWall = new MeshBuilder();
  const bWood = new MeshBuilder();
  const bBeams = new MeshBuilder();
  const h = opts.height || 3.1;
  const t = opts.thick || 0.50;
  const doorW = opts.doorWidth || 3.8; // >= 3.5m wide!

  const x0 = cx - w * 0.5, x1 = cx + w * 0.5;
  const z0 = cz - d * 0.5, z1 = cz + d * 0.5;

  const addSide = (ax, az, bx, bz, hasDoor) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (!hasDoor || len < doorW + 1.4) {
      bWall.addWallSegment(ax, az, bx, bz, h, t, true);
      return;
    }
    const segLen = (len - doorW) * 0.5;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const p1x = ax + ux * segLen, p1z = az + uz * segLen;
    const p2x = bx - ux * segLen, p2z = bz - uz * segLen;
    bWall.addWallSegment(ax, az, p1x, p1z, h, t, true);
    bWall.addWallSegment(p2x, p2z, bx, bz, h, t, true);
    // Wooden doorway lintel beam above Y=2.85m (high enough for clear top-down view)
    const mx = (p1x + p2x) * 0.5, mz = (p1z + p2z) * 0.5;
    const yaw = -Math.atan2(bz - az, bx - ax);
    bWood.addBeveledBox(mx, h - 0.14, mz, doorW + 0.35, 0.22, t + 0.06, yaw, 0.02, 0.6);
  };

  addSide(x0, z0, x1, z0, doors.includes('N'));
  addSide(x0, z1, x1, z1, doors.includes('S'));
  addSide(x0, z0, x0, z1, doors.includes('W'));
  addSide(x1, z0, x1, z1, doors.includes('E'));

  // Optional open-top roof edge eaves & sparse wooden beams (Canopy -> no collision, fades on camera occlusion)
  if (opts.beams !== false) {
    const beamCount = Math.max(2, Math.floor(d / 3.4));
    for (let i = 0; i < beamCount; i++) {
      const bz = z0 + 1.4 + (i / Math.max(1, beamCount - 1)) * (d - 2.8);
      bBeams.addBeveledBox(cx, h - 0.06, bz, w + 0.55, 0.16, 0.18, 0, 0.015, 0.8);
    }
    // Narrow perimeter eave overhang strips (leaves center 75% wide open for top-down visibility)
    bBeams.addBeveledBox(cx, h + 0.05, z0, w + 0.4, 0.09, 0.75, 0, 0.01, 0.7);
    bBeams.addBeveledBox(cx, h + 0.05, z1, w + 0.4, 0.09, 0.75, 0, 0.01, 0.7);
  }

  addGeometryNode(`Wall_${name}`, registerMesh(`Wall_${name}_Mesh`, [
    { builder: bWall, mat: wallMat },
    { builder: bWood, mat: MAT.wood_dry_planks }
  ]));

  if (bBeams.pos.length > 0) {
    addGeometryNode(`RoofBeam_Canopy_${name}`, registerMesh(`RoofBeam_Canopy_${name}_Mesh`, [
      { builder: bBeams, mat: opts.beamMat || MAT.wood_dry_planks }
    ]));
  }
}

function buildDistrictArchitecture() {
  // --- 4 Corner Outpost Protective Entry Walls (wide >= 5m exits, >= 5.5m from spawn centers) ---
  const bOutpost = new MeshBuilder();
  // NW Outpost (Team0 at -41.5, -41.5)
  bOutpost.addWallSegment(-34.5, -48.5, -34.5, -41.0, 2.9, 0.55, true);
  bOutpost.addWallSegment(-48.5, -34.5, -41.0, -34.5, 2.9, 0.55, true);
  // NE Outpost (Team1 at +41.5, -41.5)
  bOutpost.addWallSegment( 34.5, -48.5,  34.5, -41.0, 2.9, 0.55, true);
  bOutpost.addWallSegment( 48.5, -34.5,  41.0, -34.5, 2.9, 0.55, true);
  // SW Outpost (Team2 at -41.5, +41.5)
  bOutpost.addWallSegment(-34.5,  48.5, -34.5,  41.0, 2.9, 0.55, true);
  bOutpost.addWallSegment(-48.5,  34.5, -41.0,  34.5, 2.9, 0.55, true);
  // SE Outpost (Team3 at +41.5, +41.5)
  bOutpost.addWallSegment( 34.5,  48.5,  34.5,  41.0, 2.9, 0.55, true);
  bOutpost.addWallSegment( 48.5,  34.5,  41.0,  34.5, 2.9, 0.55, true);
  addGeometryNode('Wall_CornerOutposts', registerMesh('Wall_CornerOutposts_Mesh', [
    { builder: bOutpost, mat: MAT.wall_concrete_weathered }
  ]));

  // --- District 1: NW Adobe Desert Town Houses ---
  // House A around CardPoint_03 (-24, -28)
  buildOpenTopBuilding('Adobe_NW_HouseA', -24.0, -28.0, 10.0, 8.6, MAT.wall_adobe_plaster, ['N', 'S', 'E', 'W'], { doorWidth: 3.8 });
  // House B (smaller flank house along west street)
  buildOpenTopBuilding('Adobe_NW_HouseB', -29.0, -14.0, 7.8, 7.2, MAT.wall_adobe_plaster, ['N', 'S', 'E'], { doorWidth: 3.6 });

  // --- District 2: NE Military Logistics Outpost & Corrugated Shed ---
  // Concrete Outpost around CardPoint_04 (+24, -28)
  buildOpenTopBuilding('Concrete_NE_Outpost', 24.0, -28.0, 10.2, 8.6, MAT.wall_concrete_weathered, ['N', 'S', 'E', 'W'], { doorWidth: 3.8, beamMat: MAT.metal_rusty_corrugated });
  // Corrugated Metal Depot Shed
  buildOpenTopBuilding('Corrugated_NE_Shed', 29.0, -14.0, 7.6, 7.0, MAT.metal_rusty_corrugated, ['N', 'S', 'W'], { doorWidth: 3.6, height: 2.8, thick: 0.36, beamMat: MAT.metal_military_tan });

  // --- District 3: SW Bazaar & Adobe Courtyard Houses ---
  // Market House around CardPoint_05 (-24, +28)
  buildOpenTopBuilding('Adobe_SW_MarketHouse', -24.0, 28.0, 10.0, 8.6, MAT.wall_adobe_plaster, ['N', 'S', 'E', 'W'], { doorWidth: 3.8 });
  // Courtyard House B
  buildOpenTopBuilding('Adobe_SW_HouseB', -29.0, 14.0, 7.8, 7.2, MAT.wall_adobe_plaster, ['N', 'S', 'E'], { doorWidth: 3.6 });

  // --- District 4: SE Command Outpost & Adobe Residence ---
  // Concrete Command Building around CardPoint_06 (+24, +28)
  buildOpenTopBuilding('Concrete_SE_Command', 24.0, 28.0, 10.2, 8.6, MAT.wall_concrete_weathered, ['N', 'S', 'E', 'W'], { doorWidth: 3.8, beamMat: MAT.metal_rusty_corrugated });
  // SE Adobe Guardhouse
  buildOpenTopBuilding('Adobe_SE_Guardhouse', 29.0, 14.0, 7.6, 7.0, MAT.wall_adobe_plaster, ['N', 'S', 'W'], { doorWidth: 3.6 });

  // --- Low Courtyard & Street Sightline Cover Walls (generous >= 4.0m gaps everywhere) ---
  const bAlleyAdobe = new MeshBuilder();
  const bAlleyConc = new MeshBuilder();
  // North & South road chicanes (far from CardPoints 11 & 12 at (0, ±28))
  bAlleyAdobe.addWallSegment(-9.5, -34.0, -4.5, -34.0, 2.2, 0.48, true);
  bAlleyAdobe.addWallSegment( 4.5, -34.0,  9.5, -34.0, 2.2, 0.48, true);
  bAlleyConc.addWallSegment(-9.5,   34.0, -4.5,  34.0, 2.2, 0.48, true);
  bAlleyConc.addWallSegment( 4.5,   34.0,  9.5,  34.0, 2.2, 0.48, true);
  // West & East road chicanes (far from CardPoints 13 & 14 at (±28, 0))
  bAlleyAdobe.addWallSegment(-34.0, -9.5, -34.0, -4.5, 2.2, 0.48, true);
  bAlleyAdobe.addWallSegment(-34.0,  4.5, -34.0,  9.5, 2.2, 0.48, true);
  bAlleyConc.addWallSegment(  34.0, -9.5,  34.0, -4.5, 2.2, 0.48, true);
  bAlleyConc.addWallSegment(  34.0,  4.5,  34.0,  9.5, 2.2, 0.48, true);

  // Inner town courtyard partitions (creating tactical L-corners around central plaza)
  bAlleyAdobe.addWallSegment(-13.5, -24.5, -13.5, -19.5, 2.4, 0.46, true);
  bAlleyConc.addWallSegment(  13.5, -24.5,  13.5, -19.5, 2.4, 0.46, true);
  bAlleyAdobe.addWallSegment(-13.5,  19.5, -13.5,  24.5, 2.4, 0.46, true);
  bAlleyConc.addWallSegment(  13.5,  19.5,  13.5,  24.5, 2.4, 0.46, true);

  addGeometryNode('Wall_TownCourtyards', registerMesh('Wall_TownCourtyards_Mesh', [
    { builder: bAlleyAdobe, mat: MAT.wall_adobe_plaster },
    { builder: bAlleyConc, mat: MAT.wall_concrete_weathered }
  ]));
}
buildDistrictArchitecture();

// ============================================================================
// 8. TACTICAL PROPS, HELIPAD COVER, TENTS, ROCKS, PALMS, SCRUB & CARD PEDESTALS
// ============================================================================
function buildPropsAndFoliage() {
  // 8a. 18 Card Pedestals (Prop_CardPedestal_01..18)
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const [cx, , cz] = CARD_POINTS[i];
    addGeometryNode(`Prop_CardPedestal_${String(i + 1).padStart(2, '0')}`, SHARED.pedestal, [cx, 0, cz], (i % 4) * Math.PI * 0.25);
  }

  // 8b. Central Helipad Defense Ring (Sandbags, Radio Tower, Generator, Crates, Barrels)
  const helipadSandbags = [
    [-11.5, -11.5,  Math.PI * 0.25, true],
    [ 11.5, -11.5, -Math.PI * 0.25, true],
    [-11.5,  11.5,  Math.PI * 0.75, true],
    [ 11.5,  11.5, -Math.PI * 0.75, true],
    [  0.0, -12.5,  0.0, false],
    [  0.0,  12.5,  Math.PI, false],
    [-12.5,   0.0,  Math.PI * 0.5, false],
    [ 12.5,   0.0, -Math.PI * 0.5, false]
  ];
  let sbIdx = 0;
  for (const [x, z, yaw, isCorner] of helipadSandbags) {
    sbIdx++;
    addGeometryNode(
      `Prop_Sandbag_${String(sbIdx).padStart(2, '0')}`,
      isCorner ? SHARED.sandbagCorner : SHARED.sandbagWall,
      [x, 0, z], yaw
    );
  }

  // Outpost & Street Sandbag Emplacements
  const extraSandbags = [
    [-34.5, -35.0,  Math.PI * 0.25],
    [ 34.5, -35.0, -Math.PI * 0.25],
    [-34.5,  35.0,  Math.PI * 0.75],
    [ 34.5,  35.0, -Math.PI * 0.75],
    [ -5.5, -22.5,  0.0],
    [  5.5, -22.5,  0.0],
    [ -5.5,  22.5,  Math.PI],
    [  5.5,  22.5,  Math.PI],
    [-22.5,  -5.5,  Math.PI * 0.5],
    [-22.5,   5.5,  Math.PI * 0.5],
    [ 22.5,  -5.5, -Math.PI * 0.5],
    [ 22.5,   5.5, -Math.PI * 0.5]
  ];
  for (const [x, z, yaw] of extraSandbags) {
    sbIdx++;
    addGeometryNode(`Prop_Sandbag_${String(sbIdx).padStart(2, '0')}`, SHARED.sandbagWall, [x, 0, z], yaw);
  }

  // Radio / Antenna Tower near Helipad NW
  addGeometryNode('Prop_RadarMast_01', SHARED.radioTower, [-15.2, 0, -6.2], 0.35);

  // Military Generators (Helipad SE + NE Logistics + E Supply Depot + SW Outpost)
  const generators = [
    [ 15.2,   6.2,  0.4],
    [ 15.0, -28.0,  Math.PI * 0.5],
    [ 36.5,   5.5,  0.0],
    [-15.0,  28.0, -Math.PI * 0.5]
  ];
  generators.forEach(([x, z, yaw], i) => {
    addGeometryNode(`Prop_Generator_${String(i + 1).padStart(2, '0')}`, SHARED.generator, [x, 0, z], yaw);
  });

  // Military Water Tanks (NE Logistics, North Oasis, East Depot, SW Outpost)
  const waterTanks = [
    [ 36.5, -25.0,  Math.PI * 0.5],
    [  7.5, -40.5,  0.0],
    [ 38.0,  -6.0,  Math.PI * 0.5],
    [-37.0,  25.0,  Math.PI * 0.5]
  ];
  waterTanks.forEach(([x, z, yaw], i) => {
    addGeometryNode(`Prop_FuelTank_Water_${String(i + 1).padStart(2, '0')}`, SHARED.waterTank, [x, 0, z], yaw);
  });

  // Military Tarp Canopies (Tarp_Canopy_* + Prop_TarpPost_*) — 10 shaded plazas/checkpoints
  const tarps = [
    [-18.0, -15.5, 0.0],   // NW Alley Shade
    [ 18.0, -15.5, 0.0],   // NE Logistics Shade
    [-18.0,  15.5, 0.0],   // SW Bazaar Shade
    [ 18.0,  15.5, 0.0],   // SE Yard Shade
    [  0.0,  28.0, 0.0],   // South Checkpoint Canopy
    [ 28.0,   0.0, Math.PI * 0.5], // East Supply Canopy
    [-39.0, -32.0, 0.0],   // NW Outpost Entry Canopy
    [ 39.0, -32.0, 0.0],   // NE Outpost Entry Canopy
    [-39.0,  32.0, 0.0],   // SW Outpost Entry Canopy
    [ 39.0,  32.0, 0.0]    // SE Outpost Entry Canopy
  ];
  tarps.forEach(([x, z, yaw], i) => {
    const id = String(i + 1).padStart(2, '0');
    addGeometryNode(`Tarp_Canopy_${id}`, SHARED.tarpCanopy, [x, 0, z], yaw);
    addGeometryNode(`Prop_TarpPost_${id}`, SHARED.tarpPosts, [x, 0, z], yaw);
  });

  // Wooden Market Stalls in SW Bazaar & NW Town Alley
  const stalls = [
    [-22.0,  15.5, Math.PI * 0.5],
    [-14.5,  12.0, 0.0],
    [-22.0, -15.5, Math.PI * 0.5],
    [-14.5, -12.0, 0.0]
  ];
  stalls.forEach(([x, z, yaw], i) => {
    addGeometryNode(`Prop_Crate_Stall_${String(i + 1).padStart(2, '0')}`, SHARED.marketStall, [x, 0, z], yaw);
  });

  // Military Crates (tactical cover stacks across map, clear of spawns/cards/doors)
  const crates = [
    [ -9.8,  -8.2, 0.25], [ -9.8,  -9.3, -0.1],
    [  9.8,   8.2, 0.40], [  9.8,   9.3, 0.15],
    [ 11.2,  -7.8, 0.10], [-11.2,   7.8, -0.2],
    [ 16.5, -20.5, 0.0],  [ 21.5, -19.5, 0.3],
    [-16.5, -20.5, 0.2],  [-21.5,  19.5, -0.15],
    [ 16.5,  20.5, 0.1],  [ 21.5,  19.5, 0.4],
    [ 25.5,  -4.2, 0.0],  [ 25.5,   4.2, 0.25],
    [-25.5,  -4.2, -0.2], [-25.5,   4.2, 0.1],
    [ -5.5, -40.5, 0.15], [  5.5,  40.5, -0.2],
    [-36.5, -45.5, 0.0],  [ 36.5, -45.5, 0.0],
    [-36.5,  45.5, 0.0],  [ 36.5,  45.5, 0.0]
  ];
  crates.forEach(([x, z, yaw], i) => {
    addGeometryNode(`Prop_Crate_${String(i + 1).padStart(2, '0')}`, SHARED.crate, [x, 0, z], yaw);
  });

  // Rusty Fuel Barrels (clustered near generators, helipad, checkpoints & depots)
  const barrels = [
    [ 14.0,   7.5], [ 14.8,   7.9], [ 16.2,   7.2],
    [-14.2,  -7.8], [-15.0,  -8.2],
    [ 10.6,  -9.5], [ 11.3,  -9.9],
    [-10.6,   9.5], [-11.3,   9.9],
    [ 27.5,  -5.8], [ 28.3,  -6.2],
    [-27.5,   5.8], [-28.3,   6.2],
    [ -4.8,  26.5], [  4.8,  26.5],
    [ -4.8, -26.5], [  4.8, -26.5],
    [ 35.0, -18.5], [ 35.8, -19.0],
    [-35.0,  18.5], [-35.8,  19.0],
    [ 15.8,  27.2], [ 16.5,  27.8],
    [-15.8, -27.2], [-16.5, -27.8]
  ];
  barrels.forEach(([x, z], i) => {
    addGeometryNode(`Prop_Barrel_${String(i + 1).padStart(2, '0')}`, SHARED.barrel, [x, 0, z], randRange(0, Math.PI * 2));
  });

  // Sandstone Cliff Rock Clusters (Prop_Cliff_Rock_* — "Cliff" keyword feeds ImportedMap outer_world!)
  const cliffs = [
    [ -8.2, -39.5, 0.4,  1.05],
    [  8.8,  40.0, 2.1,  1.0],
    [-40.0,  -8.5, 1.3,  1.05],
    [ 40.5,   9.0, 0.8,  1.0],
    [ 38.0,  25.0, 1.7,  1.1],
    [-38.5, -24.5, 2.6,  1.05],
    [ 10.2, -34.6, 0.2,  0.92],
    [-10.2,  34.6, 1.9,  0.92],
    [ 36.5, -35.5, 0.6,  0.9],
    [-36.5,  35.5, 2.4,  0.9]
  ];
  cliffs.forEach(([x, z, yaw, sc], i) => {
    addGeometryNode(`Prop_Cliff_Rock_${String(i + 1).padStart(2, '0')}`, SHARED.cliffRock, [x, 0, z], yaw, [sc, sc, sc]);
  });

  // Smaller Sandstone Boulders
  const boulders = [
    [-10.5, -29.0, 0.5, 0.95],
    [ 10.5, -29.0, 1.4, 0.90],
    [-10.5,  29.0, 2.2, 0.95],
    [ 10.5,  29.0, 0.9, 0.90],
    [-36.0,  -2.5, 1.8, 0.95],
    [ 36.0,   2.5, 0.3, 0.95],
    [-26.5, -38.5, 2.5, 1.0],
    [ 26.5, -38.5, 0.7, 1.0],
    [-26.5,  38.5, 1.1, 1.0],
    [ 26.5,  38.5, 2.9, 1.0],
    [-44.0, -14.0, 0.4, 0.85],
    [ 44.0,  14.0, 1.6, 0.85]
  ];
  boulders.forEach(([x, z, yaw, sc], i) => {
    addGeometryNode(`Prop_Boulder_${String(i + 1).padStart(2, '0')}`, SHARED.boulder, [x, 0, z], yaw, [sc, sc, sc]);
  });

  // Palm Trees (Trunk = solid collider, Fronds = Palm_Frond_* canopy with NO collision)
  const palms = [
    [ -5.8, -31.5], [  6.2, -31.5], [ -2.5, -39.5],
    [ -5.8,  31.5], [  6.2,  31.5], [  2.5,  39.5],
    [-31.5,  -6.2], [-31.5,   6.2],
    [ 31.5,  -6.2], [ 31.5,   6.2],
    [-13.5, -13.5], [ 13.5, -13.5],
    [-13.5,  13.5], [ 13.5,  13.5],
    [-35.0, -18.0], [ 35.0,  18.0],
    [-18.0,  35.5], [ 18.0, -35.5]
  ];
  palms.forEach(([x, z], i) => {
    const id = String(i + 1).padStart(2, '0');
    const yaw = randRange(0, Math.PI * 2);
    const sc = randRange(0.92, 1.12);
    addGeometryNode(`Prop_PalmTrunk_${id}`, SHARED.palmTrunk, [x, 0, z], yaw, [sc, sc, sc]);
    addGeometryNode(`Palm_Frond_${id}`, SHARED.palmFrond, [x, 0, z], yaw, [sc, sc, sc]);
  });

  // Dry Desert Trees
  const dryTrees = [
    [-42.0, -25.0], [ 42.0, -25.0],
    [-42.0,  25.0], [ 42.0,  25.0],
    [-25.0, -43.0], [ 25.0, -43.0],
    [-25.0,  43.0], [ 25.0,  43.0]
  ];
  dryTrees.forEach(([x, z], i) => {
    const sc = randRange(0.9, 1.15);
    addGeometryNode(`Prop_DryTreeTrunk_${String(i + 1).padStart(2, '0')}`, SHARED.dryTree, [x, 0, z], randRange(0, Math.PI * 2), [sc, sc, sc]);
  });

  // Abundant Desert Scrub Bushes (Prop_Scrub_Grass_* -> NO collision, NO shadow, distance-culled!)
  let scrubIdx = 0;
  for (let attempt = 0; attempt < 180 && scrubIdx < 80; attempt++) {
    const sx = randRange(-47.0, 47.0);
    const sz = randRange(-47.0, 47.0);
    // Avoid helipad center
    if (Math.abs(sx) < 10.5 && Math.abs(sz) < 10.5) continue;
    // Avoid center of main roads
    if (Math.abs(sx) < 3.2 || Math.abs(sz) < 3.2) continue;
    scrubIdx++;
    const sc = randRange(0.75, 1.35);
    addGeometryNode(
      `Prop_Scrub_Grass_${String(scrubIdx).padStart(2, '0')}`,
      SHARED.scrub,
      [sx, 0, sz],
      randRange(0, Math.PI * 2),
      [sc, randRange(0.75, 1.2), sc]
    );
  }
}
buildPropsAndFoliage();

// ============================================================================
// 9. GROUND DECALS (160+ Decal_* at Y = 0.015..0.025) & SCATTER DEBRIS
// ============================================================================
function buildDecalsAndScatter() {
  let dCount = 0;
  function placeDecal(prefix, meshIdx, x, z, sx, sz, yaw = 0, yOff = 0.018) {
    dCount++;
    addGeometryNode(`Decal_${prefix}_${String(dCount).padStart(3, '0')}`, meshIdx, [x, yOff, z], yaw, [sx, 1.0, sz]);
  }

  // 9a. Tire Tracks along Main Convoy Roads & Outpost Approaches (36 decals)
  for (let x = -42; x <= 42; x += 6.0) {
    if (Math.abs(x) < 9.5) continue;
    placeDecal('TireTracks', SHARED.decalTireTracks, x, randRange(-1.4, 1.4), 5.6, 2.8, randRange(-0.06, 0.06), 0.017);
  }
  for (let z = -42; z <= 42; z += 6.0) {
    if (Math.abs(z) < 9.5) continue;
    placeDecal('TireTracks', SHARED.decalTireTracks, randRange(-1.4, 1.4), z, 5.6, 2.8, Math.PI * 0.5 + randRange(-0.06, 0.06), 0.017);
  }
  // Ring road tracks
  for (const rPos of [-20.5, 20.5]) {
    for (const s of [-28, -14, 14, 28]) {
      placeDecal('TireTracks', SHARED.decalTireTracks, s, rPos, 5.0, 2.4, 0.0, 0.016);
      placeDecal('TireTracks', SHARED.decalTireTracks, rPos, s, 5.0, 2.4, Math.PI * 0.5, 0.016);
    }
  }

  // 9b. Wind-Blown Sand Drifts along walls, corners & dunes (46 decals)
  for (let i = 0; i < 46; i++) {
    const x = randRange(-46.5, 46.5);
    const z = randRange(-46.5, 46.5);
    if (Math.abs(x) < 8.5 && Math.abs(z) < 8.5) continue;
    placeDecal('SandDrift', SHARED.decalSandDrift, x, z, randRange(3.2, 6.8), randRange(2.4, 5.2), randRange(0, Math.PI * 2), 0.015 + (i % 4) * 0.002);
  }

  // 9c. Cracked Desert Mud Patches in courtyards, oases & alleys (34 decals)
  for (let i = 0; i < 34; i++) {
    const x = randRange(-44.0, 44.0);
    const z = randRange(-44.0, 44.0);
    if (Math.abs(x) < 9.2 && Math.abs(z) < 9.2) continue;
    placeDecal('CrackedMud', SHARED.decalCrackedMud, x, z, randRange(2.8, 5.5), randRange(2.8, 5.5), randRange(0, Math.PI * 2), 0.016 + (i % 3) * 0.002);
  }

  // 9d. Rubble & Gravel Patches near adobe walls, rocks & sandbags (34 decals)
  for (let i = 0; i < 34; i++) {
    const x = randRange(-45.5, 45.5);
    const z = randRange(-45.5, 45.5);
    if (Math.abs(x) < 8.5 && Math.abs(z) < 8.5) continue;
    placeDecal('RubbleGravel', SHARED.decalRubbleGravel, x, z, randRange(2.2, 4.4), randRange(2.2, 4.4), randRange(0, Math.PI * 2), 0.019 + (i % 3) * 0.002);
  }

  // 9e. Oil Spills & Scorch Marks under generators, barrels & helipad edge (18 decals)
  const oilSpots = [
    [ 15.2,   6.2], [ 15.0, -28.0], [ 36.5,   5.5], [-15.0,  28.0],
    [ -6.0,   4.5], [  5.5,  -5.0], [  0.0,   0.0],
    [ 14.5,   7.6], [-14.6,  -8.0], [ 27.8,  -6.0], [-27.8,   6.0],
    [  0.0,  26.5], [  0.0, -26.5], [ 35.5, -18.8], [-35.5,  18.8],
    [ 16.0,  27.5], [-16.0, -27.5], [ 11.0,  -9.7]
  ];
  for (const [x, z] of oilSpots) {
    placeDecal('OilScorch', SHARED.decalOilScorch, x, z, randRange(2.0, 3.6), randRange(2.0, 3.6), randRange(0, Math.PI * 2), 0.024);
  }

  // 9f. Low Scatter Debris Groups (Desert_Scatter_01..28, Y < 0.16m, NO collision/shadow!)
  for (let s = 1; s <= 28; s++) {
    const sx = randRange(-44.0, 44.0);
    const sz = randRange(-44.0, 44.0);
    const bWood = new MeshBuilder();
    const bRock = new MeshBuilder();
    for (let k = 0; k < 4; k++) {
      const px = sx + randRange(-1.1, 1.1);
      const pz = sz + randRange(-1.1, 1.1);
      if (k % 2 === 0) {
        bWood.addSimpleBox(px, 0.03, pz, randRange(0.45, 0.85), 0.05, randRange(0.10, 0.16), randRange(0, Math.PI * 2), 1.4);
      } else {
        bRock.addSimpleBox(px, 0.06, pz, randRange(0.16, 0.30), randRange(0.09, 0.15), randRange(0.16, 0.28), randRange(0, Math.PI * 2), 1.2);
      }
    }
    const sName = `Desert_Scatter_${String(s).padStart(2, '0')}`;
    addGeometryNode(sName, registerMesh(`${sName}_Mesh`, [
      { builder: bWood, mat: MAT.wood_dry_planks },
      { builder: bRock, mat: MAT.rock_sandstone }
    ]));
  }
}
buildDecalsAndScatter();

// ============================================================================
// 10. ASSEMBLE GLTF 2.0 SCENE HIERARCHY (Exact ImportedMap.gd Contract)
// ============================================================================
const cardChildIndices = [];
for (let i = 0; i < CARD_POINTS.length; i++) {
  const nIdx = nodes.length;
  nodes.push({ name: `CardPoint_${String(i + 1).padStart(2, '0')}`, translation: CARD_POINTS[i] });
  cardChildIndices.push(nIdx);
}
const cardPointsRootIdx = nodes.length;
nodes.push({ name: 'CardPoints', children: cardChildIndices });

const doorChildIndices = [];
for (let i = 0; i < DOOR_POINTS.length; i++) {
  const nIdx = nodes.length;
  nodes.push({ name: `DoorPoint_${String(i + 1).padStart(2, '0')}`, translation: DOOR_POINTS[i] });
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
  nodes.push({ name: `Team${t}_Spawn`, children: slotIndices });
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
  name: 'Desert_Outpost_Town_v3_1',
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
    generator: 'TacticalDark Desert Outpost & Town v3.1 Node.js Procedural Builder',
    version: '2.0'
  },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [rootNodeIdx] }],
  nodes,
  materials,
  meshes,
  textures,
  images,
  accessors,
  bufferViews,
  samplers: [{ magFilter: 9729, minFilter: 9987 }],
  buffers: [{ byteLength: binByteLength, uri: BIN_NAME }]
};

const fullBin = Buffer.concat(binChunks);
fs.writeFileSync(path.join(OUT_DIR, BIN_NAME), fullBin);
fs.writeFileSync(path.join(OUT_DIR, GLTF_NAME), JSON.stringify(gltfJson, null, '\t'), 'utf8');

const gltfResPath = `res://asset model/haritalar/Map3_Col_v3_1/${GLTF_NAME}`;
const gltfMd5 = crypto.createHash('md5').update(gltfResPath).digest('hex');
const gltfImportContent = `[remap]

importer="scene"
importer_version=1
type="PackedScene"
uid="uid://dcol31outpost5v5"
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
// 11. MATHEMATICAL & CONTRACT VALIDATION SUITE
// ============================================================================
function pointToNodeDistXZ(px, pz, n) {
  const m = meshes[n.mesh];
  const tx = n.translation ? n.translation[0] : 0;
  const tz = n.translation ? n.translation[2] : 0;
  let cosY = 1, sinY = 0;
  if (n.rotation) {
    const yaw = 2 * Math.atan2(n.rotation[1], n.rotation[3]);
    cosY = Math.cos(yaw);
    sinY = Math.sin(yaw);
  }
  const sx = n.scale ? n.scale[0] : 1;
  const sz = n.scale ? n.scale[2] : 1;
  const dx = px - tx, dz = pz - tz;
  const localX =  dx * cosY + dz * sinY;
  const localZ = -dx * sinY + dz * cosY;

  let best = Infinity;
  for (const p of m.primitives) {
    const posAcc = accessors[p.attributes.POSITION];
    // For multi-part compound wall meshes (Perimeter, CornerOutposts, TownCourtyards, OpenTop buildings),
    // compute exact triangle-AABB distance so open interiors & corridors aren't falsely flagged!
    const isCompound = n.name.startsWith('Wall_');
    if (isCompound) {
      const bv = bufferViews[posAcc.bufferView];
      const off = bv.byteOffset || 0;
      const indAcc = accessors[p.indices];
      const indBv = bufferViews[indAcc.bufferView];
      const indOff = indBv.byteOffset || 0;
      const isU32 = indAcc.componentType === 5125;
      for (let t = 0; t < indAcc.count; t += 3) {
        let tMinX = Infinity, tMaxX = -Infinity, tMinZ = Infinity, tMaxZ = -Infinity;
        let tMaxY = -Infinity;
        for (let k = 0; k < 3; k++) {
          const vi = isU32 ? fullBin.readUInt32LE(indOff + (t + k) * 4) : fullBin.readUInt16LE(indOff + (t + k) * 2);
          const vx = fullBin.readFloatLE(off + vi * 12) * sx;
          const vy = fullBin.readFloatLE(off + vi * 12 + 4);
          const vz = fullBin.readFloatLE(off + vi * 12 + 8) * sz;
          if (vx < tMinX) tMinX = vx; if (vx > tMaxX) tMaxX = vx;
          if (vz < tMinZ) tMinZ = vz; if (vz > tMaxZ) tMaxZ = vz;
          if (vy > tMaxY) tMaxY = vy;
        }
        // Ignore doorway lintels overhead (all vertices above Y = 2.4m)
        if (tMaxY < 0.05) continue;
        const cx = Math.max(tMinX, Math.min(localX, tMaxX));
        const cz = Math.max(tMinZ, Math.min(localZ, tMaxZ));
        const dist = Math.hypot(localX - cx, localZ - cz);
        if (dist < best) best = dist;
      }
    } else {
      const cx = Math.max(posAcc.min[0] * sx, Math.min(localX, posAcc.max[0] * sx));
      const cz = Math.max(posAcc.min[2] * sz, Math.min(localZ, posAcc.max[2] * sz));
      const dist = Math.hypot(localX - cx, localZ - cz);
      if (dist < best) best = dist;
    }
  }
  return best;
}

function validatePackage() {
  let errors = 0;

  // 1. Triangle budget check (110K - 160K)
  if (totalTriangles < 110000 || totalTriangles > 160000) {
    console.error(`ERROR: Total triangles ${totalTriangles} outside target [110,000 .. 160,000]!`);
    errors++;
  }

  // 2. Zero lights & zero emission check
  if (gltfJson.extensions && gltfJson.extensions.KHR_lights_punctual) {
    console.error('ERROR: KHR_lights_punctual found! Must be 0 lights.');
    errors++;
  }
  for (const m of materials) {
    if (m.emissiveFactor || m.emissiveTexture) {
      console.error(`ERROR: Material ${m.name} has emission! 0 emission strictly required.`);
      errors++;
    }
    if (m.name.includes('decal_') && m.alphaMode !== 'MASK') {
      console.error(`ERROR: Decal material ${m.name} must use alphaMode: MASK.`);
      errors++;
    }
  }

  // 3. World AABB check (~100x100m footprint)
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
      const yaw = 2 * Math.atan2(n.rotation[1], n.rotation[3]);
      cosY = Math.cos(yaw); sinY = Math.sin(yaw);
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
    console.error(`ERROR: World AABB exceeds 100x100m bounds: X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
    errors++;
  }

  // 4. Solid collider clearance checks
  const noCollide = ['Terrain_', 'Floor_', 'Decal_', 'Canopy', 'Frond', 'Grass', 'Scatter'];

  let minSpawnClear = Infinity;
  for (let i = 0; i < ALL_SPAWNS.length; i++) {
    const sp = ALL_SPAWNS[i];
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollide.some(w => n.name.includes(w))) continue;
      const d = pointToNodeDistXZ(sp[0], sp[2], n);
      if (d < minSpawnClear) minSpawnClear = d;
      if (d < 2.2) {
        console.error(`ERROR: Spawn #${i} (${sp[0]}, ${sp[2]}) too close to ${n.name}: ${d.toFixed(2)}m < 2.2m`);
        errors++;
      }
    }
  }

  let minCardClear = Infinity, minCardToSpawn = Infinity;
  for (let i = 0; i < CARD_POINTS.length; i++) {
    const cp = CARD_POINTS[i];
    for (const sp of ALL_SPAWNS) {
      minCardToSpawn = Math.min(minCardToSpawn, Math.hypot(cp[0] - sp[0], cp[2] - sp[2]));
    }
    for (const nIdx of geometryChildIndices) {
      const n = nodes[nIdx];
      if (noCollide.some(w => n.name.includes(w)) || n.name.includes('Prop_CardPedestal') || n.name.includes('Prop_TarpPost')) continue;
      const d = pointToNodeDistXZ(cp[0], cp[2], n);
      if (d < minCardClear) minCardClear = d;
      if (d < 1.5) {
        console.error(`ERROR: CardPoint_${i + 1} (${cp[0]}, ${cp[2]}) too close to ${n.name}: ${d.toFixed(2)}m < 1.5m`);
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
      const d = pointToNodeDistXZ(dp[0], dp[2], n);
      if (d < minDoorClear) minDoorClear = d;
      if (d < 1.8) {
        console.error(`ERROR: DoorPoint_${i + 1} (${dp[0]}, ${dp[2]}) too close to ${n.name}: ${d.toFixed(2)}m < 1.8m`);
        errors++;
      }
    }
  }

  const decalCount = geometryChildIndices.filter(idx => nodes[idx].name.startsWith('Decal_')).length;
  const scrubCount = geometryChildIndices.filter(idx => nodes[idx].name.startsWith('Prop_Scrub_')).length;
  const pedestalCount = geometryChildIndices.filter(idx => nodes[idx].name.startsWith('Prop_CardPedestal_')).length;

  console.log('==================================================================');
  console.log(' COL ILERI KARAKOLU & KASABA v3.1 (Map3_Col_v3_1) VALIDATION');
  console.log('==================================================================');
  console.log(`Output GLTF       : ${path.join(OUT_DIR, GLTF_NAME)}`);
  console.log(`Output BIN        : ${path.join(OUT_DIR, BIN_NAME)} (${(fullBin.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Total Triangles   : ${totalTriangles.toLocaleString()} tris (target: 110,000 - 160,000)`);
  console.log(`Total Meshes/Prims: ${meshes.length} meshes, ${totalPrimitives} primitives`);
  console.log(`Total Nodes       : ${nodes.length} (Geometry children: ${geometryChildIndices.length})`);
  console.log(`Total Materials   : ${materials.length} PBR sets (${images.length} texture URIs, 0 emissive, 0 lights)`);
  console.log(`World AABB        : X[${wMinX.toFixed(2)}, ${wMaxX.toFixed(2)}] Y[${wMinY.toFixed(2)}, ${wMaxY.toFixed(2)}] Z[${wMinZ.toFixed(2)}, ${wMaxZ.toFixed(2)}]`);
  console.log(`Spawns            : ${ALL_SPAWNS.length} (4x5, min solid clearance: ${minSpawnClear.toFixed(2)}m >= 2.2m)`);
  console.log(`Cards / Pedestals : ${CARD_POINTS.length} / ${pedestalCount} (min spawn dist: ${minCardToSpawn.toFixed(2)}m, min solid clear: ${minCardClear.toFixed(2)}m)`);
  console.log(`Extraction Doors  : ${DOOR_POINTS.length} (min wall/prop clearance: ${minDoorClear.toFixed(2)}m >= 1.8m)`);
  console.log(`Ground Decals     : ${decalCount} (Decal_*, alphaMode: MASK, Y=0.015..0.025)`);
  console.log(`Desert Scrubs     : ${scrubCount} (Prop_Scrub_Grass_*)`);
  console.log(`Validation Errors : ${errors}`);
  console.log('==================================================================');
  if (errors > 0) process.exit(1);
}
validatePackage();
