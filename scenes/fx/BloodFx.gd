## BloodFx.gd — vuruş geri bildirimi: kan püskürmesi + yer lekesi (statik, class_name YOK — kullananlar preload eder)
## Tamamen YEREL görsel (mermi her peer'da simüle edilir → ağ yok). Headless'ta hiçbir şey yapmaz.
## Kamera ~39 m uzakta (FOV 40, 1080p'de 1 m ≈ 38 px) → damlalar gerçek boyutun ~2 katı (0.1-0.2 m) çizilir ki
## karanlık sahnede okunsun. Gölgesiz, ışıksız (unshaded koyu kırmızı — neon değil), az parçacık (iGPU, 20 oyuncu tam otomatik).
##   spawn(tree, pos, dir, strength, owner)  — isabet noktasında püskürme (dir = mermi yönü: çıkış püskürmesi + küçük geri tozu + kısa sis)
##   recent(owner, within_ms)                — owner son within_ms içinde kan aldı mı (mermi + can senkronu çift kan olmasın)
##   splat(tree, pos, size)                  — yere kan lekesi (Decal), ~8 sn'de söner; en fazla MAX_SPLATS
##   prewarm(rig)                            — her parçacık/malzemeden birer örnek (yükleme perdesi arkasında shader derlemesi)

extends RefCounted

const MAX_SPAWNS := 12            # aynı anda en fazla püskürme (her biri 2 keskin damla yayıcı; duman/sis yok)
const MAX_SPLATS := 24            # aynı anda en fazla yer lekesi
const SPRAY_LIFETIME := 0.45
const PUFF_LIFETIME := 0.28
const HOLDER_LIFE := 0.65         # püskürme düğümü bu süre sonra silinir
const SPLAT_HOLD := 5.5           # leke tam görünür kalma süresi
const SPLAT_FADE := 2.5           # sonra sönme (toplam ~8 sn)

const DROP_COLOR := Color(0.56, 0.03, 0.03)
const SPLAT_COLOR := Color(0.34, 0.015, 0.015, 0.92)

static var _active_spawns: Array = []   # tipsiz: silinmiş düğümler de durabilir (is_instance_valid ile ayıklanır)
static var _active_splats: Array = []
static var _drop_mesh: QuadMesh = null
static var _splat_tex: ImageTexture = null


static func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


# ─────────────────────────────────────────────
#  Paylaşılan kaynaklar (bir kez kurulur)
# ─────────────────────────────────────────────

static func _soft_dot(soft: float) -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.set_offset(0, soft)
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 32
	t.height = 32
	return t


static func _particle_material(tex: Texture2D) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = tex
	m.disable_receive_shadows = true
	return m


static func _ensure_resources() -> void:
	if _drop_mesh != null:
		return
	_drop_mesh = QuadMesh.new()
	_drop_mesh.size = Vector2(0.11, 0.11)
	_drop_mesh.material = _particle_material(_soft_dot(0.72))   # keskin kenarlı kan damlası (sis/duman görünümü yok)
	_splat_tex = _make_splat_texture()


## Düzensiz leke dokusu: merkez lekesi + etrafa saçılmış damlalar (tohumlu → her peer'da aynı görünüm)
static func _make_splat_texture() -> ImageTexture:
	var n := 64
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7331
	var blobs: Array = [[Vector2(32, 32), 13.0]]
	for _i in 9:
		var a := rng.randf() * TAU
		var d := rng.randf_range(8.0, 24.0)
		blobs.append([Vector2(32, 32) + Vector2(cos(a), sin(a)) * d, rng.randf_range(2.0, 6.5)])
	for y in n:
		for x in n:
			var p := Vector2(x + 0.5, y + 0.5)
			var a_max := 0.0
			for b in blobs:
				var r: float = b[1]
				var dist := p.distance_to(b[0])
				a_max = maxf(a_max, clampf((r - dist) / 1.5 + 0.5, 0.0, 1.0))
			if a_max > 0.0:
				img.set_pixel(x, y, Color(SPLAT_COLOR, SPLAT_COLOR.a * a_max))
	return ImageTexture.create_from_image(img)


static func _fade_ramp(col: Color) -> Gradient:
	var g := Gradient.new()
	g.set_color(0, col)
	g.set_color(1, Color(col, 0.0))
	g.set_offset(0, 0.55)
	return g


# ─────────────────────────────────────────────
#  Emitter'lar
# ─────────────────────────────────────────────

static func _make_spray(count: int, strength: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.mesh = _drop_mesh
	p.amount = count
	p.lifetime = SPRAY_LIFETIME
	p.one_shot = true
	p.explosiveness = 1.0
	p.local_coords = false
	p.direction = Vector3(0, 0.3, -1)          # düğüm -Z'si = mermi yönü; hafif yukarı → kavis çizip düşer
	p.spread = 28.0
	p.initial_velocity_min = 2.5 * sqrt(strength)
	p.initial_velocity_max = 6.5 * sqrt(strength)
	p.gravity = Vector3(0, -14.0, 0)
	p.damping_min = 1.0
	p.damping_max = 3.0
	p.scale_amount_min = 0.6 * sqrt(strength)
	p.scale_amount_max = 1.4 * sqrt(strength)
	p.color = DROP_COLOR
	p.color_ramp = _fade_ramp(DROP_COLOR)
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


static func _make_puff(count: int, strength: float) -> CPUParticles3D:
	var p := _make_spray(count, strength)
	p.lifetime = PUFF_LIFETIME
	p.direction = Vector3(0, 0.2, 1)           # giriş deliğinden geri tozu (atana doğru)
	p.spread = 40.0
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 2.5 * sqrt(strength)
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.0 * sqrt(strength)
	return p


# ─────────────────────────────────────────────
#  Genel API
# ─────────────────────────────────────────────

static func spawn(tree: SceneTree, pos: Vector3, dir: Vector3, strength: float = 1.0, owner: Node = null) -> void:
	if _headless() or tree == null:
		return
	if owner != null and is_instance_valid(owner):
		owner.set_meta("blood_ms", Time.get_ticks_msec())
	var scene := tree.current_scene
	if scene == null:
		return
	_ensure_resources()
	strength = clampf(strength, 0.3, 2.5)

	# Sınır: en eski püskürmeyi sil
	_active_spawns = _active_spawns.filter(func(n) -> bool: return is_instance_valid(n))
	while _active_spawns.size() >= MAX_SPAWNS:
		(_active_spawns.pop_front() as Node).queue_free()

	var holder := Node3D.new()
	holder.name = "BloodFx"
	scene.add_child(holder)
	holder.global_position = pos
	var d := dir
	if d.length_squared() < 0.0001:
		d = Vector3.FORWARD
	d = d.normalized()
	var up := Vector3.UP if absf(d.y) < 0.98 else Vector3.RIGHT
	holder.global_basis = Basis.looking_at(d, up)

	var spray_n := clampi(int(round(16.0 * strength)), 8, 26)
	var puff_n := clampi(int(round(6.0 * strength)), 3, 10)
	for e: CPUParticles3D in [_make_spray(spray_n, strength), _make_puff(puff_n, strength)]:
		holder.add_child(e)
		e.emitting = true
	_active_spawns.append(holder)
	var tw := holder.create_tween()
	tw.tween_interval(HOLDER_LIFE)
	tw.tween_callback(holder.queue_free)


static func recent(owner: Node, within_ms: int) -> bool:
	if _headless() or owner == null or not is_instance_valid(owner) or not owner.has_meta("blood_ms"):
		return false
	return Time.get_ticks_msec() - int(owner.get_meta("blood_ms")) <= within_ms


static func splat(tree: SceneTree, pos: Vector3, size: float = 1.0) -> void:
	if _headless() or tree == null:
		return
	var scene := tree.current_scene
	if scene == null:
		return
	_ensure_resources()

	# Zemine oturt (çarpışma maskesi 1 — duvar/zemin)
	var ground := pos
	var space := tree.root.get_world_3d().direct_space_state
	if space != null:
		var q := PhysicsRayQueryParameters3D.create(pos + Vector3.UP * 0.3, pos + Vector3.DOWN * 4.0, 1)
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			return   # altında zemin yok (boşluk/su) → leke yok
		ground = hit["position"]

	_active_splats = _active_splats.filter(func(n) -> bool: return is_instance_valid(n))
	while _active_splats.size() >= MAX_SPLATS:
		(_active_splats.pop_front() as Node).queue_free()

	var dec := _make_decal(size)
	scene.add_child(dec)
	dec.global_position = ground
	dec.rotation.y = randf() * TAU
	_active_splats.append(dec)
	var tw := dec.create_tween()
	tw.tween_interval(SPLAT_HOLD)
	tw.tween_property(dec, "modulate:a", 0.0, SPLAT_FADE)
	tw.tween_callback(dec.queue_free)


static func _make_decal(size: float) -> Decal:
	var dec := Decal.new()
	dec.name = "BloodSplat"
	var s := clampf(size, 0.2, 4.0) * 0.9
	dec.size = Vector3(s, 0.8, s)
	dec.texture_albedo = _splat_tex
	dec.texture_emission = _splat_tex   # karanlıkta tamamen kaybolmasın (çok hafif)
	dec.emission_energy = 0.35
	dec.albedo_mix = 1.0
	dec.normal_fade = 0.5               # duvarlara yan yansıma yapmasın
	dec.upper_fade = 0.2
	dec.lower_fade = 0.2
	return dec


static func prewarm(rig: Node3D) -> void:
	if _headless() or rig == null:
		return
	_ensure_resources()
	for e: CPUParticles3D in [_make_spray(4, 1.0), _make_puff(2, 1.0)]:
		e.one_shot = false   # rig yaşadığı sürece çizilsin
		e.lifetime = 0.3
		rig.add_child(e)
		e.emitting = true
	var dec := _make_decal(1.0)
	rig.add_child(dec)
	dec.position = Vector3(0, -0.3, 0)
