## ExplosionFx.gd — çok katmanlı taktik el bombası patlaması (statik, class_name YOK — Bomb.gd preload eder).
## Tamamen YEREL görsel (ağ yok, oyun mantığına dokunmaz). Headless'ta no-op.
## Katmanlar:
##   1) Ani parlak çekirdek parlaması + yoğun OmniLight3D flaşı (karanlık koridoru anlık aydınlatır)
##   2) Yerde hızla genişleyen şok dalgası halkası
##   3) Kıvrılan fBM gürültü shader'lı alev topu (GPUParticles3D, spatial_fx_explosion.gdshader)
##   4) Yoğun yükselen koyu patlama dumanı + zemini süpüren toz eteği (derinlik yumuşatmalı, fenerle aydınlanır)
##   5) Etraftan sıçrayan yüksek hızlı sıcak kıvılcımlar / şarapnel
##   6) Zeminde birkaç saniye kalıp solan yanık/is izi
##   spawn(tree, pos, radius)  — patlama merkezi + yarıçap
##   prewarm(rig)              — yükleme perdesi arkasında kaynak/shader derlemesi

extends RefCounted

const SHADER := preload("res://scenes/fx/spatial_fx_explosion.gdshader")
const MAX_ACTIVE := 6
const MAX_CAMERA_DIST := 95.0
const HOLDER_LIFE := 7.6
const AABB_BOX := AABB(Vector3(-9, -2, -9), Vector3(18, 12, 18))

static var _active: Array = []
static var _noise_tex: ImageTexture = null
static var _ring_tex: ImageTexture = null
static var _scorch_tex: ImageTexture = null
static var _spark_tex: GradientTexture2D = null

static var _fire_mesh: QuadMesh = null
static var _smoke_mesh: QuadMesh = null
static var _dust_mesh: QuadMesh = null
static var _spark_mesh: QuadMesh = null

static var _proc_fire: ParticleProcessMaterial = null
static var _proc_smoke: ParticleProcessMaterial = null
static var _proc_dust: ParticleProcessMaterial = null

static var _flash_base_mat: StandardMaterial3D = null
static var _ring_base_mat: StandardMaterial3D = null
static var _scorch_base_mat: StandardMaterial3D = null


static func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


static func _ensure_resources() -> void:
	if _fire_mesh != null:
		return
	_noise_tex = _make_noise_tex()
	_ring_tex = _make_ring_tex()
	_scorch_tex = _make_scorch_tex()
	_spark_tex = _make_spark_tex()

	# 1) Alev topu çizim ağı (fBM gürültü shader, is_fire = 1.0)
	var fm := ShaderMaterial.new()
	fm.shader = SHADER
	fm.render_priority = 2
	fm.set_shader_parameter(&"noise_tex", _noise_tex)
	fm.set_shader_parameter(&"is_fire", 1.0)
	fm.set_shader_parameter(&"density", 1.05)
	fm.set_shader_parameter(&"soft_dist", 0.45)
	fm.set_shader_parameter(&"camera_pull", 0.28)
	_fire_mesh = QuadMesh.new()
	_fire_mesh.size = Vector2(2.6, 2.6)
	_fire_mesh.material = fm

	# 2) Yoğun yükselen koyu patlama dumanı (fBM gürültü shader, is_fire = 0.0, fener + patlama ışığıyla aydınlanır)
	var sm := ShaderMaterial.new()
	sm.shader = SHADER
	sm.render_priority = 1
	sm.set_shader_parameter(&"noise_tex", _noise_tex)
	sm.set_shader_parameter(&"is_fire", 0.0)
	sm.set_shader_parameter(&"density", 0.72)
	sm.set_shader_parameter(&"emission_floor", 0.24)
	sm.set_shader_parameter(&"light_gain", 1.25)
	sm.set_shader_parameter(&"soft_dist", 0.75)
	sm.set_shader_parameter(&"camera_pull", 0.22)
	_smoke_mesh = QuadMesh.new()
	_smoke_mesh.size = Vector2(3.6, 3.6)
	_smoke_mesh.material = sm

	# 3) Zeminden dışa süpüren patlama tozu eteği
	var dm := ShaderMaterial.new()
	dm.shader = SHADER
	dm.render_priority = 0
	dm.set_shader_parameter(&"noise_tex", _noise_tex)
	dm.set_shader_parameter(&"is_fire", 0.0)
	dm.set_shader_parameter(&"density", 0.62)
	dm.set_shader_parameter(&"emission_floor", 0.16)
	dm.set_shader_parameter(&"light_gain", 1.15)
	dm.set_shader_parameter(&"soft_dist", 0.55)
	dm.set_shader_parameter(&"camera_pull", 0.20)
	_dust_mesh = QuadMesh.new()
	_dust_mesh.size = Vector2(2.5, 2.5)
	_dust_mesh.material = dm

	# 4) Kıvılcım/şarapnel
	var spm := StandardMaterial3D.new()
	spm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	spm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	spm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	spm.vertex_color_use_as_albedo = true
	spm.albedo_texture = _spark_tex
	spm.disable_receive_shadows = true
	spm.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	spm.render_priority = 3
	_spark_mesh = QuadMesh.new()
	_spark_mesh.size = Vector2(0.16, 0.16)
	_spark_mesh.material = spm

	# GPUParticles3D süreç malzemeleri (statik paylaşım)
	_proc_fire = _build_proc_fire()
	_proc_smoke = _build_proc_smoke()
	_proc_dust = _build_proc_dust()

	# Çekirdek flaş taban malzemesi
	_flash_base_mat = StandardMaterial3D.new()
	_flash_base_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_flash_base_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_flash_base_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash_base_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_flash_base_mat.albedo_color = Color(1.0, 0.88, 0.56, 0.92)
	_flash_base_mat.albedo_texture = _spark_tex
	_flash_base_mat.disable_receive_shadows = true
	_flash_base_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_flash_base_mat.render_priority = 4

	# Şok dalgası halkası taban malzemesi
	_ring_base_mat = StandardMaterial3D.new()
	_ring_base_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_base_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_ring_base_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_base_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_ring_base_mat.albedo_color = Color(1.0, 0.78, 0.44, 0.86)
	_ring_base_mat.albedo_texture = _ring_tex
	_ring_base_mat.disable_receive_shadows = true
	_ring_base_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_ring_base_mat.render_priority = 3

	# Zemin yanık/is izi taban malzemesi
	_scorch_base_mat = StandardMaterial3D.new()
	_scorch_base_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_scorch_base_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_scorch_base_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_scorch_base_mat.albedo_color = Color(0.035, 0.03, 0.025, 0.82)
	_scorch_base_mat.albedo_texture = _scorch_tex
	_scorch_base_mat.disable_receive_shadows = true
	_scorch_base_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_scorch_base_mat.render_priority = -2


static func _make_noise_tex() -> ImageTexture:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.035
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 3
	n.seed = 4271
	var img := n.get_seamless_image(128, 128)
	return ImageTexture.create_from_image(img)


static func _make_ring_tex() -> ImageTexture:
	const SZ := 96
	var img := Image.create(SZ, SZ, false, Image.FORMAT_RGBA8)
	for y in SZ:
		var fy := (float(y) + 0.5) / float(SZ) * 2.0 - 1.0
		for x in SZ:
			var fx := (float(x) + 0.5) / float(SZ) * 2.0 - 1.0
			var r := sqrt(fx * fx + fy * fy)
			var outer := 1.0 - smoothstep(0.84, 0.96, r)
			var inner := smoothstep(0.54, 0.84, r)
			var a := clampf(outer * inner, 0.0, 1.0)
			img.set_pixel(x, y, Color(1.0, 1.0, 1.0, a * a))
	return ImageTexture.create_from_image(img)


static func _make_scorch_tex() -> ImageTexture:
	const SZ := 96
	var img := Image.create(SZ, SZ, false, Image.FORMAT_RGBA8)
	for y in SZ:
		var fy := (float(y) + 0.5) / float(SZ) * 2.0 - 1.0
		for x in SZ:
			var fx := (float(x) + 0.5) / float(SZ) * 2.0 - 1.0
			var r := sqrt(fx * fx + fy * fy)
			if r >= 1.0:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
				continue
			var ang := atan2(fy, fx)
			var rays := 0.85 + 0.15 * sin(ang * 7.0 + 0.6) * cos(ang * 5.0 - 1.1)
			var a := pow(clampf(1.0 - r / rays, 0.0, 1.0), 1.6)
			img.set_pixel(x, y, Color(1.0, 1.0, 1.0, a))
	return ImageTexture.create_from_image(img)


static func _make_spark_tex() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 1.0, 1.0, 1.0))
	g.set_color(1, Color(1.0, 0.62, 0.18, 0.0))
	g.set_offset(0, 0.22)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 32
	tex.height = 32
	return tex


static func _curve_tex(start_v: float, mid_t: float, mid_v: float, end_v: float) -> CurveTexture:
	var c := Curve.new()
	c.max_value = maxf(maxf(start_v, mid_v), end_v)
	c.add_point(Vector2(0.0, start_v))
	c.add_point(Vector2(mid_t, mid_v))
	c.add_point(Vector2(1.0, end_v))
	var ct := CurveTexture.new()
	ct.curve = c
	return ct


static func _grad_tex(stops: Array) -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array()
	g.colors = PackedColorArray()
	for s: Array in stops:
		g.add_point(float(s[0]), s[1] as Color)
	var gt := GradientTexture1D.new()
	gt.gradient = g
	return gt


static func _build_proc_fire() -> ParticleProcessMaterial:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.75
	pm.direction = Vector3(0.0, 0.85, 0.0)
	pm.spread = 82.0
	pm.initial_velocity_min = 2.2
	pm.initial_velocity_max = 6.2
	pm.damping_min = 6.5
	pm.damping_max = 9.5
	pm.gravity = Vector3(0.0, 2.8, 0.0)
	pm.angle_min = -180.0
	pm.angle_max = 180.0
	pm.angular_velocity_min = -110.0
	pm.angular_velocity_max = 110.0
	pm.scale_min = 0.65
	pm.scale_max = 1.25
	pm.scale_curve = _curve_tex(0.35, 0.28, 1.30, 0.85)
	pm.color_ramp = _grad_tex([
		[0.00, Color(1.0, 0.96, 0.76, 1.0)],
		[0.24, Color(1.0, 0.50, 0.12, 0.96)],
		[0.60, Color(0.76, 0.16, 0.03, 0.65)],
		[1.00, Color(0.16, 0.02, 0.01, 0.0)],
	])
	return pm


static func _build_proc_smoke() -> ParticleProcessMaterial:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 1.15
	pm.direction = Vector3(0.0, 0.92, 0.0)
	pm.spread = 86.0
	# Sıkı ve birbirine geçen yoğun duman bulutu (ayrı toplar gibi dağılmaz)
	pm.initial_velocity_min = 1.2
	pm.initial_velocity_max = 3.8
	pm.damping_min = 2.8
	pm.damping_max = 4.4
	pm.gravity = Vector3(0.0, 1.05, 0.0)
	pm.angle_min = -180.0
	pm.angle_max = 180.0
	pm.angular_velocity_min = -42.0
	pm.angular_velocity_max = 42.0
	pm.scale_min = 0.75
	pm.scale_max = 1.35
	pm.scale_curve = _curve_tex(0.45, 0.35, 1.35, 2.05)
	pm.color_ramp = _grad_tex([
		[0.00, Color(0.55, 0.32, 0.16, 0.0)],
		[0.08, Color(0.42, 0.26, 0.15, 0.88)],   # alevin ısıttığı sıcak koyu is
		[0.24, Color(0.20, 0.19, 0.18, 0.84)],   # yoğun koyu barut dumanı
		[0.65, Color(0.24, 0.23, 0.22, 0.52)],   # yükselen kül bulutu
		[1.00, Color(0.26, 0.25, 0.24, 0.0)],
	])
	return pm


static func _build_proc_dust() -> ParticleProcessMaterial:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	pm.emission_ring_axis = Vector3.UP
	pm.emission_ring_radius = 0.95
	pm.emission_ring_inner_radius = 0.25
	pm.emission_ring_height = 0.12
	pm.direction = Vector3(1.0, 0.08, 0.0)
	pm.spread = 180.0
	pm.flatness = 0.92
	pm.initial_velocity_min = 4.2
	pm.initial_velocity_max = 8.4
	pm.damping_min = 5.0
	pm.damping_max = 7.2
	pm.gravity = Vector3(0.0, 0.22, 0.0)
	pm.angle_min = -180.0
	pm.angle_max = 180.0
	pm.angular_velocity_min = -55.0
	pm.angular_velocity_max = 55.0
	pm.scale_min = 0.7
	pm.scale_max = 1.2
	pm.scale_curve = _curve_tex(0.5, 0.4, 1.3, 1.7)
	pm.color_ramp = _grad_tex([
		[0.00, Color(0.44, 0.38, 0.32, 0.72)],
		[0.45, Color(0.30, 0.28, 0.25, 0.45)],
		[1.00, Color(0.24, 0.23, 0.22, 0.0)],
	])
	return pm


static func _make_gpu_emitter(pm: ParticleProcessMaterial, mesh: QuadMesh, count: int, life: float, scale_mult: float) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = count
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 0.94
	p.fixed_fps = 0
	p.local_coords = false
	p.process_material = pm
	p.draw_pass_1 = mesh
	p.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB_BOX
	p.scale = Vector3.ONE * scale_mult
	return p


static func _make_sparks(radius: float, count: int) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.mesh = _spark_mesh
	p.amount = count
	p.lifetime = 0.85
	p.one_shot = true
	p.explosiveness = 1.0
	p.local_coords = false
	p.direction = Vector3(0.0, 0.65, 0.0)
	p.spread = 85.0
	p.initial_velocity_min = radius * 1.85
	p.initial_velocity_max = radius * 3.95
	p.gravity = Vector3(0.0, -21.0, 0.0)
	p.damping_min = 1.8
	p.damping_max = 3.8
	p.scale_amount_min = 0.65
	p.scale_amount_max = 1.55
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.96, 0.78, 1.0))
	ramp.set_color(1, Color(0.85, 0.22, 0.02, 0.0))
	ramp.add_point(0.35, Color(1.0, 0.62, 0.16, 0.95))
	p.color = Color.WHITE
	p.color_ramp = ramp
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


static func spawn(tree: SceneTree, pos: Vector3, radius: float = 4.0) -> void:
	if _headless() or tree == null:
		return
	var scene := tree.current_scene
	if scene == null:
		return
	var cam := tree.root.get_camera_3d()
	if cam != null and cam.global_position.distance_to(pos) > MAX_CAMERA_DIST:
		return
	_ensure_resources()

	_active = _active.filter(func(n) -> bool: return is_instance_valid(n))
	while _active.size() >= MAX_ACTIVE:
		(_active.pop_front() as Node).queue_free()

	var holder := Node3D.new()
	holder.name = "ExplosionFx"
	holder.position = Vector3(pos.x, maxf(pos.y, 0.0), pos.z)
	scene.add_child(holder)
	holder.reset_physics_interpolation()

	var rad_scale := clampf(radius / 4.0, 0.8, 1.45)

	# 1) Patlama ışığı: ani parlak beyaz-amber flaş + sıcak köz sönümü
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.72, 0.36)
	light.light_energy = 18.0
	light.omni_range = radius * 3.2
	light.omni_attenuation = 1.4
	light.shadow_enabled = false
	light.position = Vector3(0.0, 1.4, 0.0)
	holder.add_child(light)
	var ltw := light.create_tween()
	ltw.tween_property(light, "light_energy", 5.2, 0.14).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	ltw.parallel().tween_property(light, "light_color", Color(1.0, 0.42, 0.14), 0.20)
	ltw.tween_property(light, "light_energy", 0.0, 0.70).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	ltw.tween_callback(light.queue_free)

	# 2) Ani çekirdek flaş parlaması
	var flash := MeshInstance3D.new()
	var fq := QuadMesh.new()
	fq.size = Vector2(1.0, 1.0)
	var fmat := _flash_base_mat.duplicate() as StandardMaterial3D
	fq.material = fmat
	flash.mesh = fq
	flash.position = Vector3(0.0, 0.65, 0.0)
	flash.scale = Vector3.ONE * 0.45
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(flash)
	var ftw := flash.create_tween().set_parallel(true)
	ftw.tween_property(flash, "scale", Vector3.ONE * (radius * 1.15), 0.10).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
	ftw.tween_property(fmat, "albedo_color:a", 0.0, 0.22).set_ease(Tween.EASE_OUT)
	ftw.chain().tween_callback(flash.queue_free)

	# 3) Yerde genişleyen şok dalgası halkası
	var ring := MeshInstance3D.new()
	var rq := QuadMesh.new()
	rq.size = Vector2(1.0, 1.0)
	var rmat := _ring_base_mat.duplicate() as StandardMaterial3D
	rq.material = rmat
	ring.mesh = rq
	ring.position = Vector3(0.0, 0.10, 0.0)
	ring.rotation.x = -PI * 0.5
	ring.scale = Vector3.ONE * 0.35
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(ring)
	var rtw := ring.create_tween().set_parallel(true)
	rtw.tween_property(ring, "scale", Vector3.ONE * (radius * 2.35), 0.34).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
	rtw.tween_property(rmat, "albedo_color:a", 0.0, 0.34).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	rtw.chain().tween_callback(ring.queue_free)

	# 4) Kıvrılan fBM alev topu
	var fire := _make_gpu_emitter(_proc_fire, _fire_mesh, 22, 0.52, rad_scale)
	fire.position = Vector3(0.0, 0.38, 0.0)
	holder.add_child(fire)
	fire.emitting = true

	# 5) Yoğun yükselen koyu patlama dumanı + zemini süpüren toz eteği
	var smoke := _make_gpu_emitter(_proc_smoke, _smoke_mesh, 30, 2.85, rad_scale)
	smoke.position = Vector3(0.0, 0.48, 0.0)
	holder.add_child(smoke)
	smoke.emitting = true

	var dust := _make_gpu_emitter(_proc_dust, _dust_mesh, 18, 1.45, rad_scale)
	dust.position = Vector3(0.0, 0.18, 0.0)
	holder.add_child(dust)
	dust.emitting = true

	# 6) Yüksek hızlı sıcak kıvılcımlar / şarapnel
	var sparks := _make_sparks(radius, 34)
	sparks.position = Vector3(0.0, 0.38, 0.0)
	holder.add_child(sparks)
	sparks.emitting = true

	# 7) Zeminde kalıp yavaşça solan yanık/is izi
	var scorch := MeshInstance3D.new()
	var sq := QuadMesh.new()
	var sd := radius * 1.45
	sq.size = Vector2(sd, sd)
	var smat := _scorch_base_mat.duplicate() as StandardMaterial3D
	sq.material = smat
	scorch.mesh = sq
	scorch.position = Vector3(0.0, 0.025, 0.0)
	scorch.rotation = Vector3(-PI * 0.5, randf() * TAU, 0.0)
	scorch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(scorch)
	var stw := scorch.create_tween()
	stw.tween_interval(5.2)
	stw.tween_property(smat, "albedo_color:a", 0.0, 2.0).set_ease(Tween.EASE_IN)

	_active.append(holder)
	tree.create_timer(HOLDER_LIFE, false).timeout.connect(holder.queue_free)


static func prewarm(rig: Node3D) -> void:
	if _headless() or rig == null:
		return
	_ensure_resources()
	for pair: Array in [[_proc_fire, _fire_mesh], [_proc_smoke, _smoke_mesh], [_proc_dust, _dust_mesh]]:
		var p := _make_gpu_emitter(pair[0], pair[1], 2, 0.3, 0.2)
		p.one_shot = false
		p.local_coords = true
		rig.add_child(p)
		p.emitting = true
	var sp := _make_sparks(4.0, 2)
	sp.one_shot = false
	sp.lifetime = 0.25
	rig.add_child(sp)
	sp.emitting = true
	for mat: StandardMaterial3D in [_flash_base_mat, _ring_base_mat, _scorch_base_mat]:
		var m := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(0.1, 0.1)
		q.material = mat
		m.mesh = q
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		rig.add_child(m)
