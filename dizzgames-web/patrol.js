/* ==========================================================================
   TacticalDark — Live MenuBackground3D Patrol Simulation (Real 3D Sprites)
   Uses real multi-angle 3D renders of Tank, Visioner, Runner, Sniper & Medic
   captured directly from Godot 4.7 (16 rotation angles × Idle + 4 Walk frames).
   ========================================================================== */

(() => {
  const canvas = document.getElementById('patrolCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Exact constants from MenuBackground3D.gd
  const BOUNDS = { x: 8.0, z: 4.2 };
  const SEPARATION = 2.4;
  const TURN_RATE = 1.65;
  const TAU = Math.PI * 2;

  // Sprite sheet layout (matches tools/_render_patrol_sprites.gd)
  const SPRITE_ANGLES = 16;
  const WALK_FRAMES = 4;
  const CELL = 160;

  const CHARACTERS = [
    { id: 'tank', name: 'TANK', patch: '#3399FF', speed: 0.9, scaleMul: 1.06 },
    { id: 'visioner', name: 'VISIONER', patch: '#4DE64D', speed: 1.12, scaleMul: 1.0 },
    { id: 'runner', name: 'RUNNER', patch: '#FFD91A', speed: 1.32, scaleMul: 0.96 },
    { id: 'sniper', name: 'SNIPER', patch: '#FF4D4D', speed: 0.96, scaleMul: 1.0 },
    { id: 'medic', name: 'MEDIC', patch: '#3399FF', speed: 1.08, scaleMul: 1.0 },
  ];

  // Preload real 3D character sprite sheets
  const sprites = {};
  for (const c of CHARACTERS) {
    const img = new Image();
    img.src = `assets/sprites/${c.id}.png`;
    sprites[c.id] = img;
  }

  // Camera matching MenuBackground3D.gd: pos (0, 11, 8) looking at (0, 0, 0.3)
  const CAM = { y: 11.2, z: 8.6, lookZ: 0.2, fov: 0.92 };

  // Spotlight state (mouse-following, color can switch like Lobby team color)
  let lightRgb = [255, 189, 82];
  const mouseWorld = { x: 0, z: 0 };
  const targetMouseWorld = { x: 0, z: 0 };
  let pointerInside = false;

  const rand = (min, max) => min + Math.random() * (max - min);
  const randomTarget = () => ({
    x: rand(-BOUNDS.x, BOUNDS.x),
    z: rand(-BOUNDS.z, BOUNDS.z),
  });

  function rotateToward(current, target, maxDelta) {
    let diff = ((target - current + Math.PI) % TAU) - Math.PI;
    if (diff < -Math.PI) diff += TAU;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }

  // Spawn 5 patrolling operatives
  const walkers = CHARACTERS.map((cfg, i) => {
    const angle = (i / CHARACTERS.length) * TAU + rand(-0.25, 0.25);
    const radius = rand(2.2, 4.4);
    return {
      cfg,
      x: Math.cos(angle) * radius * 1.4,
      z: Math.sin(angle) * radius * 0.72,
      yaw: rand(-Math.PI, Math.PI),
      speed: cfg.speed * rand(0.92, 1.08),
      target: randomTarget(),
      pause: i % 2 === 0 ? rand(0.5, 1.8) : 0,
      scan: rand(0, 6),
      walkPhase: rand(0, WALK_FRAMES),
    };
  });

  let width = 800;
  let height = 500;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(wx, wy, wz) {
    const dz = CAM.z - wz;
    const dy = CAM.y - wy;
    const pitch = Math.atan2(CAM.y, CAM.z - CAM.lookZ);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const camY = -dy * cosP + dz * sinP;
    const camZ = dy * sinP + dz * cosP;
    const depth = Math.max(camZ, 1.0);
    const scale = (height * CAM.fov) / depth;

    return {
      x: width * 0.5 + wx * scale,
      y: height * 0.5 - camY * scale,
      scale,
      depth,
    };
  }

  function screenToGround(sx, sy) {
    const nx = (sx - width * 0.5) / (height * CAM.fov);
    const ny = -(sy - height * 0.5) / (height * CAM.fov);
    const pitch = Math.atan2(CAM.y, CAM.z - CAM.lookZ);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    // Exact inverse of project(wx, 0, wz)
    const denom = Math.max(0.12, sinP - ny * cosP);
    const dz = (CAM.y * (cosP + ny * sinP)) / denom;
    const camZ = CAM.y * sinP + dz * cosP;
    const wx = nx * camZ;
    const wz = CAM.z - dz;
    return {
      x: Math.max(-12, Math.min(12, wx)),
      z: Math.max(-8, Math.min(6.5, wz)),
    };
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const g = screenToGround(e.clientX - rect.left, e.clientY - rect.top);
    targetMouseWorld.x = g.x;
    targetMouseWorld.z = g.z;
    pointerInside = true;
  });

  canvas.addEventListener('pointerleave', () => {
    pointerInside = false;
  });

  const teamButtons = document.querySelectorAll('[data-spotlight-color]');
  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  teamButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.spotlightColor;
      if (!col) return;
      lightRgb = hexToRgb(col);
      teamButtons.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
    });
  });

  function updateWalkers(dt) {
    for (const w of walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
        w.scan += dt;
        w.yaw += Math.sin(w.scan * 1.3) * 0.6 * dt;
      } else {
        const dx = w.target.x - w.x;
        const dz = w.target.z - w.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.75) {
          w.target = randomTarget();
          if (Math.random() < 0.45) {
            w.pause = rand(1.2, 3.2);
            w.scan = 0;
          }
        }

        let desX = dist > 0.01 ? dx / dist : 0;
        let desZ = dist > 0.01 ? dz / dist : 0;

        for (const o of walkers) {
          if (o === w) continue;
          const ax = w.x - o.x;
          const az = w.z - o.z;
          const d = Math.hypot(ax, az);
          if (d > 0.01 && d < SEPARATION) {
            const push = (SEPARATION - d) * 0.85;
            desX += (ax / d) * push;
            desZ += (az / d) * push;
          }
        }

        const desLen = Math.hypot(desX, desZ);
        if (desLen > 0.01) {
          const wantYaw = Math.atan2(-desX, -desZ);
          w.yaw = rotateToward(w.yaw, wantYaw, TURN_RATE * dt);
        }

        const fwdX = -Math.sin(w.yaw);
        const fwdZ = -Math.cos(w.yaw);
        w.x = Math.max(-BOUNDS.x - 1, Math.min(BOUNDS.x + 1, w.x + fwdX * w.speed * dt));
        w.z = Math.max(-BOUNDS.z - 0.8, Math.min(BOUNDS.z + 0.8, w.z + fwdZ * w.speed * dt));
        // Advance walk animation frames smoothly synced to walk speed
        w.walkPhase = (w.walkPhase + dt * w.speed * 3.8) % WALK_FRAMES;
      }
    }
  }

  function lightAt(wx, wz) {
    const md = Math.hypot(wx - mouseWorld.x, wz - mouseWorld.z);
    let intensity = Math.max(0, 1 - md / 5.2);
    intensity = intensity * intensity * 0.95;

    for (const w of walkers) {
      const vx = wx - w.x;
      const vz = wz - w.z;
      const d = Math.hypot(vx, vz);
      if (d > 7.5) continue;
      if (d < 1.3) {
        intensity = Math.max(intensity, (1 - d / 1.3) * 0.28);
      }
      const fwdX = -Math.sin(w.yaw);
      const fwdZ = -Math.cos(w.yaw);
      const dot = (vx * fwdX + vz * fwdZ) / (d || 1);
      if (dot > 0.78) {
        const cone = (dot - 0.78) / 0.22;
        const falloff = Math.max(0, 1 - d / 7.5);
        intensity = Math.max(intensity, cone * falloff * 0.85);
      }
    }
    return Math.min(1, intensity);
  }

  function drawFloorGrid() {
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.55,
      20,
      width * 0.5,
      height * 0.5,
      width * 0.75
    );
    bgGrad.addColorStop(0, '#0c0f17');
    bgGrad.addColorStop(1, '#05060a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const minX = -16;
    const maxX = 16;
    const minZ = -10;
    const maxZ = 8;
    const step = 2;

    for (let x = minX; x <= maxX; x += step) {
      const isMajor = x % 8 === 0;
      const p1 = project(x, 0, minZ);
      const p2 = project(x, 0, maxZ);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isMajor ? 'rgba(143, 156, 171, 0.14)' : 'rgba(143, 156, 171, 0.055)';
      ctx.lineWidth = isMajor ? 1.35 : 0.85;
      ctx.stroke();
    }

    for (let z = minZ; z <= maxZ; z += step) {
      const isMajor = z % 8 === 0;
      const p1 = project(minX, 0, z);
      const p2 = project(maxX, 0, z);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isMajor ? 'rgba(143, 156, 171, 0.14)' : 'rgba(143, 156, 171, 0.055)';
      ctx.lineWidth = isMajor ? 1.35 : 0.85;
      ctx.stroke();
    }

    for (let x = -12; x <= 12; x += step) {
      for (let z = -8; z <= 6; z += step) {
        const lit = lightAt(x, z);
        if (lit < 0.08) continue;
        const p = project(x, 0, z);
        const pRight = project(x + step, 0, z);
        const pDown = project(x, 0, z + step);
        ctx.strokeStyle = `rgba(${lightRgb[0]}, ${lightRgb[1]}, ${lightRgb[2]}, ${(lit * 0.28).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pRight.x, pRight.y);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pDown.x, pDown.y);
        ctx.stroke();
      }
    }
  }

  function drawMouseSpotlight() {
    const p = project(mouseWorld.x, 0, mouseWorld.z);
    const r = p.scale * 4.5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r);
    grad.addColorStop(0, `rgba(${lightRgb[0]}, ${lightRgb[1]}, ${lightRgb[2]}, 0.34)`);
    grad.addColorStop(0.45, `rgba(${lightRgb[0]}, ${lightRgb[1]}, ${lightRgb[2]}, 0.12)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawFlashlightCone(w) {
    const fwdX = -Math.sin(w.yaw);
    const fwdZ = -Math.cos(w.yaw);
    const rightX = Math.cos(w.yaw);
    const rightZ = -Math.sin(w.yaw);

    const ox = w.x + fwdX * 0.6 + rightX * 0.22;
    const oz = w.z + fwdZ * 0.6 + rightZ * 0.22;

    const range = 7.4;
    const spread = Math.tan(0.42) * range;

    const p0 = project(ox, 0.9, oz);
    const pL = project(ox + fwdX * range - rightX * spread, 0, oz + fwdZ * range - rightZ * spread);
    const pR = project(ox + fwdX * range + rightX * spread, 0, oz + fwdZ * range + rightZ * spread);
    const pMid = project(ox + fwdX * range, 0, oz + fwdZ * range);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(p0.x, p0.y, pMid.x, pMid.y);
    grad.addColorStop(0, 'rgba(255, 240, 208, 0.44)');
    grad.addColorStop(0.45, 'rgba(255, 214, 148, 0.16)');
    grad.addColorStop(1, 'rgba(255, 189, 82, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(pL.x, pL.y);
    ctx.quadraticCurveTo(pMid.x, pMid.y, pR.x, pR.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSoldier(w) {
    const base = project(w.x, 0, w.z);
    const center = project(w.x, 0.92, w.z);
    const drawSize = base.scale * 2.55 * w.cfg.scaleMul;

    const mouseDist = Math.hypot(w.x - mouseWorld.x, w.z - mouseWorld.z);
    const litByCursor = Math.max(0, 1 - mouseDist / 4.8);

    // 1. Subtle BodyLight ground aura (matching MenuBackground3D OmniLight3D)
    const auraR = base.scale * 1.15;
    const aura = ctx.createRadialGradient(base.x, base.y, 2, base.x, base.y, auraR);
    aura.addColorStop(0, `rgba(216, 224, 255, ${(0.2 + litByCursor * 0.2).toFixed(3)})`);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, auraR, auraR * 0.62, 0, 0, TAU);
    ctx.fill();

    // 2. Soft ground shadow under feet
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + base.scale * 0.06, base.scale * 0.42, base.scale * 0.24, 0, 0, TAU);
    ctx.fill();

    // 3. Real 3D Godot Character Sprite
    const img = sprites[w.cfg.id];
    if (img && img.complete && img.naturalWidth > 0) {
      const normYaw = ((w.yaw % TAU) + TAU) % TAU;
      const col = Math.round((normYaw / TAU) * SPRITE_ANGLES) % SPRITE_ANGLES;
      const row = w.pause > 0 ? 0 : 1 + (Math.floor(w.walkPhase) % WALK_FRAMES);

      const sx = col * CELL;
      const sy = row * CELL;

      ctx.save();
      // Slightly dimmer in shadow, crisp & bright when illuminated by the cursor spotlight
      const brightness = 0.62 + litByCursor * 0.55;
      ctx.filter = `brightness(${brightness.toFixed(2)})`;
      ctx.drawImage(
        img,
        sx,
        sy,
        CELL,
        CELL,
        center.x - drawSize * 0.5,
        center.y - drawSize * 0.5,
        drawSize,
        drawSize
      );
      ctx.restore();
    }

    // 4. Subtle callsign label when lit by cursor spotlight
    if (litByCursor > 0.22) {
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 189, 82, ${(litByCursor * 0.95).toFixed(2)})`;
      ctx.fillText(w.cfg.name, center.x, center.y - drawSize * 0.44);
      ctx.restore();
    }
  }

  function drawVignette() {
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      height * 0.25,
      width * 0.5,
      height * 0.5,
      width * 0.72
    );
    vig.addColorStop(0, 'rgba(8, 9, 13, 0)');
    vig.addColorStop(1, 'rgba(5, 6, 10, 0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }

  let lastTime = performance.now();
  let autoSweep = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (!pointerInside) {
      autoSweep += dt * 0.45;
      targetMouseWorld.x = Math.sin(autoSweep) * 4.2;
      targetMouseWorld.z = Math.cos(autoSweep * 0.7) * 2.0;
    }

    const lerp = 1 - Math.exp(-6.0 * dt);
    mouseWorld.x += (targetMouseWorld.x - mouseWorld.x) * lerp;
    mouseWorld.z += (targetMouseWorld.z - mouseWorld.z) * lerp;

    updateWalkers(dt);

    drawFloorGrid();
    drawMouseSpotlight();

    for (const w of walkers) {
      drawFlashlightCone(w);
    }
    const sorted = [...walkers].sort((a, b) => a.z - b.z);
    for (const w of sorted) {
      drawSoldier(w);
    }

    drawVignette();
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
