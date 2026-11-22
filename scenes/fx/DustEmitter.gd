## DustEmitter.gd — hareket tozu (zıplama başı, iniş, bıçak hamlesi, takla başı/sonu)
## class_name YOK — kullanan preload eder. Her Player'a ayak hizasında bir tane eklenir:
##   var d = preload("res://scenes/fx/DustEmitter.gd").new(); add_child(d); d.position.y = 0.05
##   d.burst(&"land", Vector3.ZERO, 1.0)
## Tamamen YEREL görsel: ağ yok, oyun mantığına dokunmaz. Headless'ta hiçbir şey yaratmaz.
##
## Yapı: _ready'de bir kez 4 GPUParticles3D (halka ×2, yönlü ×2 — sırayla kullanılır, zıplama→iniş art arda gelince
## ilki kesilmez). One Shot, Explosiveness 1, local_coords=false (toz dünyada kalır), top_level (yayıcı patlama anında
## ayağa taşınır, sonra yerinde durur → visibility_aabb parçacıklarla aynı yerde kalır). ParticleProcessMaterial,
## QuadMesh ve ShaderMaterial (spatial_fx_dust.gdshader) STATİK önbellek: tüm oyuncular paylaşır.
## Patlama başına güç: amount_ratio (parçacık sayısı) + instance uniform `size_mult` (boy) — malzeme kopyalanmaz.
extends Node3D

const SHADER := preload("res://scenes/fx/spatial_fx_dust.gdshader")

const MAX_CAMERA_DIST := 70.0     # kameradan uzaksa patlama atlanır
const AMOUNT := 9                 # ince taneli, küçük ayak tozu (eskiden 2.5 m dev bulutlar vardı)
const RING_LIFETIME := 0.55       # hızlı açılıp sönen kuru toz (havada duman gibi asılı kalmaz)
const DIR_LIFETIME := 0.48
const DUST_COLOR := Color(0.64, 0.59, 0.52)    # kirli açık gri-kahve
const AABB_BOX := AABB(Vector3(-4, -1, -4), Vector3(8, 3, 8))

static var _mesh: QuadMesh = null
static var _proc_ring: ParticleProcessMaterial = null
static var _proc_dir: ParticleProcessMaterial = null

var _rings: Array[GPUParticles3D] = []
var _dirs: Array[GPUParticles3D] = []
var _ring_i := 0
var _dir_i := 0
var _enabled := false


func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		return
	_ensure_resources()
	for i in 2:
		_rings.append(_make_emitter(_proc_ring, RING_LIFETIME, "DustRing%d" % i))
		_dirs.append(_make_emitter(_proc_dir, DIR_LIFETIME, "DustDir%d" % i))
	_enabled = true


## kind: &"jump" / &"land" / &"lunge" / &"flip_start" / &"flip_end". dir = dünya XZ yönü (hamle/takla). strength ~0.5..1.6.
func burst(kind: StringName, dir: Vector3 = Vector3.ZERO, strength: float = 1.0) -> void:
	if not _enabled or not is_inside_tree():
		return
	var foot := global_position
	var cam := get_viewport().get_camera_3d()
	if cam != null and cam.global_position.distance_to(foot) > MAX_CAMERA_DIST:
		return
	var s := clampf(strength, 0.5, 1.6)
	var flat := Vector3(dir.x, 0.0, dir.z)
	flat = flat.normalized() if flat.length_squared() > 0.0001 else Vector3.ZERO
	match kind:
		&"jump":
			_fire_ring(foot, 0.45, 0.72 * lerpf(0.9, 1.1, s - 0.5))
		&"land":
			_fire_ring(foot, clampf(0.65 + 0.25 * s, 0.65, 1.0), lerpf(0.85, 1.15, (s - 0.5) / 1.1))
		&"lunge":
			# Bıçak hamlesinde asıl görsel SlashFx kesme yayı; ayakta sadece hafif sürtünme tozu
			if flat == Vector3.ZERO:
				_fire_ring(foot, 0.35, 0.55)
			else:
				_fire_dir(foot, -flat, 0.45, 0.65)
		&"flip_start":
			if flat == Vector3.ZERO:
				_fire_ring(foot, 0.38, 0.65)
			else:
				_fire_dir(foot, -flat, 0.50, 0.75 * lerpf(0.9, 1.1, s - 0.5))
		&"flip_end":
			_fire_ring(foot, 0.75, 0.95 * lerpf(0.9, 1.1, (s - 0.5) / 1.1))
		_:
			_fire_ring(foot, 0.55, 0.8)


## Harita perde açıkken (ImportedMap._prewarm_render) süreç + çizim shader'ları derlensin diye rig altına sürekli yayan
## küçük bir örnek ekler (rig silinince o da gider).
static func prewarm(rig: Node3D) -> void:
	if rig == null or DisplayServer.get_name() == "headless":
		return
	_ensure_resources()
	for pm: ParticleProcessMaterial in [_proc_ring, _proc_dir]:
		var p := GPUParticles3D.new()
		p.name = "DustPrewarm"
		p.amount = 2
		p.lifetime = 0.5
		p.one_shot = false
		p.local_coords = true
		p.process_material = pm
		p.draw_pass_1 = _mesh
		p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		p.visibility_aabb = AABB_BOX
		p.scale = Vector3.ONE * 0.2
		rig.add_child(p)
		p.set_instance_shader_parameter(&"size_mult", 0.3)
		p.emitting = true


# ─────────────────────────────────────────────

func _make_emitter(pm: ParticleProcessMaterial, life: float, n: String) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = n
	p.top_level = true                       # ayağı takip ETMEZ: patlama anında taşınır, toz yerinde kalır
	p.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	p.amount = AMOUNT
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 1.0
	p.randomness = 0.0
	p.fixed_fps = 0                         # her karede süreç: restart sonrası ilk karede görünür
	p.local_coords = false
	p.emitting = false
	p.process_material = pm
	p.draw_pass_1 = _mesh
	p.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB_BOX
	add_child(p)
	return p


func _fire_ring(foot: Vector3, ratio: float, size: float) -> void:
	var p := _rings[_ring_i]
	_ring_i = (_ring_i + 1) % _rings.size()
	_fire(p, Transform3D(Basis.IDENTITY, foot), ratio, size)


func _fire_dir(foot: Vector3, dir: Vector3, ratio: float, size: float) -> void:
	var p := _dirs[_dir_i]
	_dir_i = (_dir_i + 1) % _dirs.size()
	# Süreç malzemesinin yönü yerel -Z (+ biraz yukarı) → yayıcının -Z'si istenen dünya yönüne çevrilir
	_fire(p, Transform3D(Basis.looking_at(dir, Vector3.UP), foot), ratio, size)


func _fire(p: GPUParticles3D, xf: Transform3D, ratio: float, size: float) -> void:
	p.global_transform = xf
	p.amount_ratio = ratio
	p.set_instance_shader_parameter(&"size_mult", size)
	p.set_instance_shader_parameter(&"seed", randf() * 100.0)
	p.restart()


static func _ensure_resources() -> void:
	if _mesh != null:
		return
	# Gürültü (seamless, bir kez; NoiseTexture2D iş parçacığında üretir)
	var fnl := FastNoiseLite.new()
	fnl.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	fnl.frequency = 0.012
	fnl.fractal_type = FastNoiseLite.FRACTAL_FBM
	fnl.fractal_octaves = 4
	fnl.fractal_gain = 0.55
	var noise := NoiseTexture2D.new()
	noise.width = 128
	noise.height = 128
	noise.seamless = true
	noise.generate_mipmaps = true
	noise.normalize = true
	noise.noise = fnl

	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter(&"noise_tex", noise)
	mat.set_shader_parameter(&"dust_color", Vector3(DUST_COLOR.r, DUST_COLOR.g, DUST_COLOR.b))

	_mesh = QuadMesh.new()
	_mesh.size = Vector2(1, 1)
	_mesh.material = mat

	# Renk/alfa: hızlı belirir, çabuk söner (havada duman bulutu birikmesin)
	var ramp := Gradient.new()
	ramp.set_offset(0, 0.0)
	ramp.set_color(0, Color(1, 1, 1, 0.0))
	ramp.set_offset(1, 1.0)
	ramp.set_color(1, Color(0.88, 0.85, 0.80, 0.0))
	ramp.add_point(0.08, Color(1, 1, 1, 0.42))
	ramp.add_point(0.40, Color(0.94, 0.92, 0.88, 0.24))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp

	# Boy: ayak dibinde küçük başlar, yatay yayılırken hafif açılır, dağılır
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 0.42))
	curve.add_point(Vector2(0.28, 0.88))
	curve.add_point(Vector2(0.7, 1.0))
	curve.add_point(Vector2(1.0, 0.78))
	var curve_tex := CurveTexture.new()
	curve_tex.curve = curve

	# Halka: yere yapışık küçük ayak tozu, hızla dışa saçılır ve çöker
	_proc_ring = _base_process(ramp_tex, curve_tex)
	_proc_ring.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	_proc_ring.emission_ring_axis = Vector3.UP
	_proc_ring.emission_ring_radius = 0.28
	_proc_ring.emission_ring_inner_radius = 0.08
	_proc_ring.emission_ring_height = 0.03
	_proc_ring.direction = Vector3.UP
	_proc_ring.spread = 82.0
	_proc_ring.initial_velocity_min = 0.25
	_proc_ring.initial_velocity_max = 0.55
	_proc_ring.radial_velocity_min = 1.8
	_proc_ring.radial_velocity_max = 3.2
	var rad := Curve.new()
	rad.add_point(Vector2(0.0, 1.0))
	rad.add_point(Vector2(0.3, 0.2))
	rad.add_point(Vector2(1.0, 0.0))
	var rad_tex := CurveTexture.new()
	rad_tex.curve = rad
	_proc_ring.radial_velocity_curve = rad_tex
	_proc_ring.scale_min = 0.50
	_proc_ring.scale_max = 0.88

	# Yönlü: ayaktan geriye kısa ve alçak toz serpintisi
	_proc_dir = _base_process(ramp_tex, curve_tex)
	_proc_dir.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_proc_dir.emission_sphere_radius = 0.14
	_proc_dir.direction = Vector3(0.0, 0.14, -1.0).normalized()
	_proc_dir.spread = 22.0
	_proc_dir.initial_velocity_min = 1.6
	_proc_dir.initial_velocity_max = 3.4
	_proc_dir.scale_min = 0.42
	_proc_dir.scale_max = 0.74


static func _base_process(ramp_tex: Texture2D, curve_tex: Texture2D) -> ParticleProcessMaterial:
	var pm := ParticleProcessMaterial.new()
	pm.gravity = Vector3(0.0, -1.8, 0.0)       # duman gibi yukarı yükselmez, yere çöker
	pm.damping_min = 5.0                        # hızlı sürtünme → kısa ve keskin hareket
	pm.damping_max = 7.0
	pm.angle_min = 0.0
	pm.angle_max = 360.0
	pm.angular_velocity_min = -45.0
	pm.angular_velocity_max = 45.0
	pm.scale_curve = curve_tex
	pm.color_ramp = ramp_tex
	pm.lifetime_randomness = 0.22
	return pm
