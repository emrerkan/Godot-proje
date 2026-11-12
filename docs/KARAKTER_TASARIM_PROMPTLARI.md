# TacticalDark — Karakter Tasarım Promptları

Kullanım (bu bölüm sana, yapay zekaya yapıştırılmaz):

1. Yeni bir sohbet aç, **3 referans ekran görüntüsünü ekle** ve **BÖLÜM A**'yı yapıştır.
2. Aynı sohbete sırayla **BÖLÜM B**'deki karakter promptlarını yapıştır (her mesajda TEK karakter — beşini birden istersen kalite düşer).
3. Her karakterin çizimini onayla ya da düzeltme iste. Beşi de onaylanınca **BÖLÜM C**'yi (kadro karşılaştırması) yapıştır.
4. Kadro da onaylandıktan sonra **BÖLÜM D**'yi (3D aşaması) yapıştır.

Promptlar İngilizce: görsel üreten modeller İngilizce tarifi daha isabetli uyguluyor. Yapay zekadan Türkçe cevap istersen BÖLÜM A'nın sonuna "Reply to me in Turkish." ekle.

---

## BÖLÜM A — Ana brif (ilk mesaj, referans görsellerle birlikte)

```text
You are the character concept artist for "TacticalDark", a 3D top-down tactical
shooter (4 teams, dark maps lit only by the players' flashlights). I need original
designs for the game's 5 playable characters.

WORKFLOW — follow it strictly
Phase 1 (now): flat 2D VECTOR concept sheets only. No 3D renders, no 3D-looking
  shading, no photorealism. One character per message, when I ask for it.
Phase 2 (later): 3D modelling. Do NOT start, describe or preview Phase 2 until I
  explicitly write "APPROVED — START 3D". After each sheet, stop and wait for my
  feedback.

STYLE REFERENCE (attached screenshots)
The attached images show a character style I like. Use them ONLY for the general
style direction — do not copy that character, its exact outfit, colours or gear:
- Chunky, stylized low-poly soldier: about 4.5–5 heads tall, oversized helmet/head,
  big gloves and boots, thick limbs, short torso.
- Simple faceted shapes, few large forms, no small fiddly details.
- Flat colours with a slightly coarse, low-resolution texture feel; camouflage made
  of big blocky patches.
- Face mostly hidden (helmet, goggles, mask, balaclava) — characters are anonymous
  operators.
- Reads clearly when seen small and from above.

GAME CONSTRAINTS (these decide whether a design works)
- Camera: top-down, about 50° downward, far away. The character is roughly 60–90
  pixels tall on screen. The player mostly sees HEAD, SHOULDERS, BACK and the WEAPON.
  Put the identifying features there: headgear shape, shoulder shape, backpack/back
  gear, weapon length.
- Each of the 5 characters must be recognisable from its top-down silhouette alone,
  filled in solid black.
- Maps are very dark. Use mid-to-light values on helmet tops and shoulders, never a
  fully black character. Keep clear value contrast between body, vest and gear.
- All 5 characters are used by all 4 teams (blue, red, green, yellow). Character
  palettes must stay neutral/desaturated so they are not mistaken for a team colour.
  Reserve ONE small, identical spot on every character for the team colour: a left
  shoulder armband plus a helmet-top stripe. Draw it in plain mid-grey and label it
  "TEAM COLOUR".
- Every character carries a flashlight (weapon-mounted or chest-mounted) and a combat
  knife — show where each is stowed.
- All five share the same humanoid skeleton and the same body proportions (same
  height, same limb lengths) because they share one animation set. Differences come
  from clothing, armour, headgear, back gear and weapon — not from body shape.
  Gear must not block these moves: running, crouching, jumping, front/back flips,
  two-handed rifle aiming, knife stab, grenade throw.
- No real-world flags, unit insignia, brand logos or text on the characters.

DELIVERABLE FOR EACH CHARACTER (one vector sheet, landscape, plain neutral-grey
background, clean outlines, flat fills, at most two shading tones)
1. Front, side and back orthographic views in a relaxed A-pose, same scale, feet on
   a common baseline.
2. A top-down view exactly as the game camera sees it (50° downward, from behind and
   from the front), holding the weapon in a two-handed aiming pose.
3. The same top-down view as a solid black silhouette, drawn small (about 80 px).
4. Weapon drawn separately, side view.
5. Headgear close-up and a callout of the 3–4 key gear pieces with short labels.
6. Colour palette: 5–6 swatches with hex codes, plus the grey "TEAM COLOUR" swatch.
7. Three bullet points: what makes this character recognisable from above.

If you can output real vector graphics (SVG), do that. If you can only generate
raster images, generate them in a flat vector-illustration style and say so.

Confirm that you understand the workflow and constraints in a few lines, then wait
for the first character brief.
```

---

## BÖLÜM B — Karakter promptları (her biri ayrı mesaj)

### B1 — Tank

```text
CHARACTER 1 — "TANK" (frontline / heavy)
Role in game: highest health, slowest movement. Pushes corridors first and absorbs
fire. Starts each match with a frag grenade.
Weapon: AK-pattern assault rifle, wooden or dark polymer furniture, curved 30-round
magazine, weapon-mounted flashlight.

Design direction
- The widest and bulkiest silhouette of the five — bulk from ARMOUR, not from a
  bigger body.
- Heavy full-coverage ballistic helmet with a raised visor or face shield, thick
  neck/collar guard.
- Large plate carrier with oversized shoulder pauldrons, groin/thigh plates, big
  knee pads, heavy boots.
- Square, boxy back plate with grenade pouches on the chest and belt.
- Palette: charcoal and gunmetal greys with a lighter steel-grey helmet top and
  pauldrons (so the shape reads in the dark), small dull-orange hazard accents.
- Mood: immovable, calm, riot-breacher.
From above he must read as: a big square block with wide shoulders and a round
heavy helmet.

Produce the full concept sheet as defined in the brief, then stop and wait.
```

### B2 — Visioner

```text
CHARACTER 2 — "VISIONER" (recon / all-rounder)
Role in game: balanced health and speed, the intel specialist. Starts each match
with a satellite scan that reveals players on the minimap.
Weapon: AR-15-pattern carbine with a short optic, straight magazine, weapon-mounted
flashlight.

Design direction
- Medium, athletic silhouette. The "tech" character.
- Lightweight bump helmet with a headset and a flipped-up multi-lens vision device
  (an original design, e.g. three or four lens tubes in an asymmetric cluster) — this
  is the signature feature and must be clearly visible from above.
- Slim plate carrier, a small radio pack on the back with ONE tall antenna, a
  forearm-mounted tablet/screen on the left arm.
- Palette: muted olive-drab and grey-green (desaturated, must not read as "green
  team"), dark grey gear, faint cyan glow on lenses and the forearm screen.
- Mood: observant, precise, always scanning.
From above he must read as: a slim figure with a lens cluster on the helmet and an
antenna sticking up from the back.

Produce the full concept sheet as defined in the brief, then stop and wait.
```

### B3 — Runner

```text
CHARACTER 3 — "RUNNER" (fast infiltrator)
Role in game: lowest health, fastest movement, very high fire rate at short range.
Flanks, steals the objective card and escapes. Starts each match with a frag grenade.
Weapon: compact submachine gun with a long straight magazine and folded stock,
small flashlight under the barrel.

Design direction
- The slimmest and lightest silhouette of the five. NO helmet, NO plate carrier,
  NO backpack.
- Head: balaclava or half-mask with a backwards cap or a tight hood, slim sport
  goggles pushed up on the forehead.
- Light soft-shell jacket with sleeves pushed up, bare forearms or fingerless
  gloves, a single diagonal chest sling/bandolier with spare magazines, a thigh
  holster rig, cargo trousers taped at the ankle, light trail shoes instead of boots.
- Palette: slate grey and washed-out off-white with dark navy-black trousers, and one
  thin team-neutral accent such as pale teal stitching.
- Mood: restless, agile, street-smart.
From above he must read as: a narrow figure with a small bare/hooded head, a
diagonal strap across the back and a short weapon.

Produce the full concept sheet as defined in the brief, then stop and wait.
```

### B4 — Sniper

```text
CHARACTER 4 — "SNIPER" (long range)
Role in game: low health, medium speed, one very powerful slow shot that pierces
walls. Holds long sightlines. Starts each match with a flashbang.
Weapon: long bolt-action rifle with a wooden stock and a large scope (Mosin-style
silhouette, original design). It must be clearly the LONGEST weapon of the five.
Flashlight is chest-mounted, not on the rifle.

Design direction
- Tall-looking, narrow silhouette with a broken-up outline.
- Head: boonie hat or deep hood with a shemagh/scarf covering the lower face.
- A short ragged camouflage cape or half-ghillie over the shoulders and upper back
  only (must stay above the waist so it does not interfere with legs or flips).
- Light chest rig, a rolled shooting mat or rifle drag bag across the lower back,
  a rangefinder pouch, knee pads on one knee only.
- Palette: desert sand, tan and pale khaki with dark brown straps — the lightest
  palette of the five.
- Mood: patient, still, solitary.
From above he must read as: a ragged-edged cape shape with a wide soft hat brim and
a very long rifle extending far past the body.

Produce the full concept sheet as defined in the brief, then stop and wait.
```

### B5 — Medic

```text
CHARACTER 5 — "MEDIC" (support)
Role in game: above-average health, medium speed. Carries a medkit and can heal
wounded teammates at short range as well as himself. Shoots a slow, accurate
semi-automatic rifle.
Weapon: SKS-style semi-automatic rifle with a wooden stock and a fixed short
magazine, weapon-mounted flashlight.

Design direction
- Medium build, the most "practical" looking of the five.
- Standard mid-cut helmet with a clear band around it and clear goggles on the
  helmet.
- Medium vest with rows of small pouches, a large rectangular medical backpack
  (the signature feature, the biggest back item of the five), trauma shears and a
  tourniquet on the chest, light-coloured nitrile-style gloves, a rolled stretcher
  strap or splint on the side of the pack.
- Medical marking: an ORIGINAL simple symbol (for example a plain white ring or a
  white chevron) on the backpack top and helmet — do NOT use a red cross, red
  crescent or any real protected emblem.
- Palette: cool mid-grey uniform, olive-grey vest, off-white medical markings and
  gloves.
- Mood: steady, reassuring, focused.
From above he must read as: a big rectangular backpack with a white symbol on top
and a banded helmet.

Produce the full concept sheet as defined in the brief, then stop and wait.
```

---

## BÖLÜM C — Kadro karşılaştırması (beşi de onaylanınca)

```text
All five designs are approved individually. Now produce ONE vector line-up sheet:
1. The five characters side by side, front view, same scale, in the order
   Tank, Visioner, Runner, Sniper, Medic.
2. The same five in the top-down game view (50° downward), aiming their weapons.
3. The same top-down row as solid black silhouettes at about 80 px height.
4. The top-down row again on a near-black background, lit only by a narrow cone of
   light from the front, to test readability in the dark.
5. One character shown four times with the "TEAM COLOUR" armband and helmet stripe
   filled in blue, red, green and yellow.

Then list any two characters that could be confused with each other from above and
propose a concrete fix for each case. Do not start 3D yet.
```

---

## BÖLÜM D — 3D aşaması (sadece kadro onayından sonra)

```text
APPROVED — START 3D.

Build the five approved characters as game-ready 3D models, exactly matching the
approved vector sheets. Do one character first (Visioner) and wait for my approval
before doing the other four.

Technical requirements
- Engine: Godot 4.6, Forward+ renderer. Deliver each character as a .glb (glTF 2.0)
  file, metre units, +Y up, character facing the forward axis, feet at the origin.
- Height: 1.89 m in A-pose for all five (identical proportions and joint positions,
  so one skeleton and one animation set fit all of them).
- Skeleton: standard Unreal Engine mannequin humanoid hierarchy and bone names
  (root, pelvis, spine_01, spine_02, spine_03, neck_01, head, clavicle_l/r,
  upperarm_l/r, lowerarm_l/r, hand_l/r with fingers, thigh_l/r, calf_l/r, foot_l/r,
  ball_l/r). My existing animations target this skeleton. No extra bones for capes
  or straps — weight them to the nearest body bones.
- Polygon budget: 6,000–10,000 triangles per character including gear. Stylized
  low-poly with clean faceted forms; no sculpted micro detail.
- Weapon as a SEPARATE mesh file (it is attached to the hand in code), 800–1,500
  triangles, with the muzzle pointing along the forward axis.
- Textures: one 1024×1024 material per character (base colour, plus roughness and
  normal only if needed). Flat colours and big blocky camouflage patches, as in the
  concept. The team-colour armband and helmet stripe must be a separate material
  slot named "TeamColor" so the game can tint it.
- Gear must not intersect the body in these poses: two-handed rifle aim, crouch,
  full sprint stride, tucked flip. Check and report.
- The model is seen from far above: keep helmet, shoulders, back gear and weapon
  slightly exaggerated in size, as drawn.

For each model deliver: the .glb, the texture files, a turnaround render (front,
side, back, and the 50° top-down game view), the triangle count, and a list of any
deviations from the approved concept sheet.
```
