## ImpactFx.gd — mermi duvar/engel çarpma kıvılcımı (statik, class_name YOK — kullananlar preload eder).
## Tamamen YEREL görsel (Bullet._physics_process duvar isabetinde çağırır; ağ yok). Headless'ta no-op.
## Duvar normalinden seken 6–8 parlak sıcak kıvılcım + 0.06 sn sıcak çarpma parlaması.
## Gölgesiz, ışıksız (additive), küçük havuz sınırı → 20 oyuncu tam otomatikte iGPU dostu.
##   spawn(tree, pos, normal)  — çarpma noktası + yüzey normali
##   prewarm(rig)              — yükleme perdesi arkasında shader derlemesi

extends RefCounted

const MAX_ACTIVE := 14
const SPARK_LIFE := 0.24
const FLASH_LIFE := 0.065
const HOLDER_LIFE := 0.34
const MAX_CAMERA_DIST := 75.0

const SPARK_COLOR := Color(1.0, 0.78, 0.38)
const FLASH_COLOR := Color(1.0, 0.9, 0.65)

static var _active: Array = []
static var _spark_mesh: QuadMesh = null
static var _flash_mesh: QuadMesh = null


static func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


static func _ensure_resources() -> void:
	if _spark_mesh != null:
		return
	# İnce parlak kıvılcım noktası (additive, ışıksız)
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 1.0, 1.0, 1.0))
	g.set_color(1, Color(1.0, 0.55, 0.15, 0.0))
	g.set_offset(0, 0.25)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 24
	tex.height = 24

	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	sm.vertex_color_use_as_albedo = true
	sm.albedo_texture = tex
	sm.disable_receive_shadows = true

	_spark_mesh = QuadMesh.new()
	_spark_mesh.size = Vector2(0.09, 0.09)
	_spark_mesh.material = sm

	var fm := StandardMaterial3D.new()
	fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fm.albedo_color = FLASH_COLOR * 1.8
	fm.albedo_texture = tex
	fm.disable_receive_shadows = true

	_flash_mesh = QuadMesh.new()
	_flash_mesh.size = Vector2(0.32, 0.32)
	_flash_mesh.material = fm


static func _make_sparks(count: int) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.mesh = _spark_mesh
	p.amount = count
	p.lifetime = SPARK_LIFE
	p.one_shot = true
	p.explosiveness = 1.0
	p.local_coords = false
	p.direction = Vector3(0.0, 0.15, -1.0)    # holder -Z = duvar normali
	p.spread = 52.0
	p.initial_velocity_min = 3.5
	p.initial_velocity_max = 8.5
	p.gravity = Vector3(0.0, -16.0, 0.0)
	p.damping_min = 2.0
	p.damping_max = 4.5
	p.scale_amount_min = 0.7
	p.scale_amount_max = 1.4
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.95, 0.75, 1.0))
	ramp.set_color(1, Color(1.0, 0.35, 0.05, 0.0))
	ramp.add_point(0.35, Color(SPARK_COLOR, 0.95))
	p.color = Color.WHITE
	p.color_ramp = ramp
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


static func spawn(tree: SceneTree, pos: Vector3, normal: Vector3) -> void:
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

	var nrm := normal.normalized() if normal.length_squared() > 0.0001 else Vector3.UP
	var holder := Node3D.new()
	holder.name = "ImpactFx"
	# Önce konumla, sonra ekle (fizik interpolasyonu açıkken CPUParticles3D kuralı)
	holder.position = pos + nrm * 0.03
	var up := Vector3.UP if absf(nrm.y) < 0.95 else Vector3.RIGHT
	holder.basis = Basis.looking_at(nrm, up)
	scene.add_child(holder)
	holder.reset_physics_interpolation()

	var sparks := _make_sparks(randi_range(6, 9))
	holder.add_child(sparks)
	sparks.emitting = true

	var flash := MeshInstance3D.new()
	flash.mesh = _flash_mesh
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(flash)
	var tw := flash.create_tween()
	tw.tween_property(flash, "scale", Vector3.ZERO, FLASH_LIFE).set_ease(Tween.EASE_OUT)
	tw.tween_callback(flash.hide)

	_active.append(holder)
	tree.create_timer(HOLDER_LIFE, false).timeout.connect(holder.queue_free)


static func prewarm(rig: Node3D) -> void:
	if _headless() or rig == null:
		return
	_ensure_resources()
	var s := _make_sparks(2)
	s.one_shot = false
	s.lifetime = 0.25
	rig.add_child(s)
	s.emitting = true
	var f := MeshInstance3D.new()
	f.mesh = _flash_mesh
	f.scale = Vector3.ONE * 0.1
	f.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	rig.add_child(f)
