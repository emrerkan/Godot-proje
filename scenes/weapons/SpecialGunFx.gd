## SpecialGunFx.gd — Özel silah görselleri (statik, class_name YOK; kullananlar preload eder):
##   const SPECIAL_FX := preload("res://scenes/weapons/SpecialGunFx.gd")
##   muzzle.add_child(SPECIAL_FX.build_laser())      # Player.set_special_armed(true)
##   bullet.add_child(SPECIAL_FX.build_tracer())     # Bullet.make_special()
## İkisi de ışıksız + gölgesiz + additive; materyaller statik önbellekte paylaşılır (parametre örnek başına değişmez).
## UX/sanat: docs/ux/new-powers.md §11.3. Rakipten gizleme (görünmez atan) çağıranın işi: dönen Node3D'nin `visible`ı.
## Yön sözleşmesi: lazer Muzzle'ın -Z'sine uzanır; iz Bullet'in +Z'sine (arkasına) uzanır, baş = z 0.

extends RefCounted

const LASER_SHADER := preload("res://scenes/weapons/special_laser.gdshader")
const TRACER_SHADER := preload("res://scenes/weapons/special_tracer.gdshader")

## Renkler (PowerupManager.INFO[SPECIAL_GUN].color ile aynı ana ton)
const COLOR_MAIN := Color(1.0, 0.22, 0.55)
const COLOR_LASER_CORE := Color(1.0, 0.75, 0.85)
const COLOR_LASER_TIP := Color(1.0, 0.45, 0.65, 0.9)
const COLOR_TRACER_CORE := Color(1.0, 0.93, 0.95)

## Ölçüler (metre)
const LASER_LENGTH := 30.0
const LASER_RADIUS := 0.022        # çap 0.044 m ≈ 1080p'de ~2 px (3 px'i geçmez)
const LASER_TIP_RADIUS := 0.08
const TRACER_LENGTH := 3.0
const TRACER_CORE_RADIUS := 0.055  # çap ~0.11 m
const TRACER_HALO_RADIUS := 0.125  # çap ~0.25 m
const HALO_STRENGTH := 0.45
const HALO_EDGE_POWER := 0.8       # hale kenarı yumuşak

static var _laser_mat: ShaderMaterial
static var _laser_mesh: CylinderMesh
static var _tip_mat: StandardMaterial3D
static var _tip_mesh: SphereMesh
static var _core_mat: ShaderMaterial
static var _halo_mat: ShaderMaterial
static var _core_mesh: CylinderMesh
static var _halo_mesh: CylinderMesh


## Muzzle'dan -Z'ye ~30 m ince lazer + uçta küçük nokta. Dönen kök: "SpecialLaser" (Node3D).
static func build_laser() -> Node3D:
	if _laser_mat == null:
		_laser_mat = ShaderMaterial.new()
		_laser_mat.shader = LASER_SHADER
		_laser_mat.set_shader_parameter("beam_color", COLOR_MAIN)
		_laser_mat.set_shader_parameter("core_color", COLOR_LASER_CORE)
		_laser_mat.set_shader_parameter("mesh_length", LASER_LENGTH)
		_laser_mesh = _make_tube(LASER_RADIUS, LASER_LENGTH, 8)
	if _tip_mat == null:
		_tip_mat = StandardMaterial3D.new()
		_tip_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_tip_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_tip_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_tip_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
		_tip_mat.albedo_color = COLOR_LASER_TIP
		_tip_mesh = SphereMesh.new()
		_tip_mesh.radius = LASER_TIP_RADIUS
		_tip_mesh.height = LASER_TIP_RADIUS * 2.0
		_tip_mesh.radial_segments = 8
		_tip_mesh.rings = 4

	var root := Node3D.new()
	root.name = "SpecialLaser"

	var beam := MeshInstance3D.new()
	beam.name = "Beam"
	beam.mesh = _laser_mesh
	beam.material_override = _laser_mat
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Silindirin +Y'si -Z'ye döner; merkez -L/2 → ışın z=0..-L arasında
	beam.rotation_degrees.x = -90.0
	beam.position.z = -LASER_LENGTH * 0.5
	root.add_child(beam)

	var tip := MeshInstance3D.new()
	tip.name = "Tip"
	tip.mesh = _tip_mesh
	tip.material_override = _tip_mat
	tip.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	tip.position.z = -LASER_LENGTH
	root.add_child(tip)
	return root


## Bullet'in -Z (hareket) yönünün ARKASINA ~3 m parlak kırmızı-beyaz iz. Dönen kök: "SpecialTracer" (Node3D).
static func build_tracer() -> Node3D:
	if _core_mat == null:
		_core_mat = ShaderMaterial.new()
		_core_mat.shader = TRACER_SHADER
		_core_mat.set_shader_parameter("tracer_color", COLOR_TRACER_CORE)
		_core_mat.set_shader_parameter("strength", 1.0)
		_core_mat.set_shader_parameter("mesh_length", TRACER_LENGTH)
		_halo_mat = ShaderMaterial.new()
		_halo_mat.shader = TRACER_SHADER
		_halo_mat.set_shader_parameter("tracer_color", COLOR_MAIN)
		_halo_mat.set_shader_parameter("strength", HALO_STRENGTH)
		_halo_mat.set_shader_parameter("edge_power", HALO_EDGE_POWER)
		_halo_mat.set_shader_parameter("mesh_length", TRACER_LENGTH)
		_core_mesh = _make_tube(TRACER_CORE_RADIUS, TRACER_LENGTH, 8)
		_halo_mesh = _make_tube(TRACER_HALO_RADIUS, TRACER_LENGTH, 8)

	var root := Node3D.new()
	root.name = "SpecialTracer"
	for pair in [[_halo_mesh, _halo_mat, "Halo"], [_core_mesh, _core_mat, "Core"]]:
		var mi := MeshInstance3D.new()
		mi.name = pair[2]
		mi.mesh = pair[0]
		mi.material_override = pair[1]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# Başı (yerel +Y ucu) -Z'de, z=0'da; kuyruk +Z'ye uzanır
		mi.rotation_degrees.x = -90.0
		mi.position.z = TRACER_LENGTH * 0.5
		root.add_child(mi)
	return root


## Açık uçlu ince silindir (kapaksız; shader UV yerine yerel Y'ye bakar).
static func _make_tube(radius: float, length: float, segments: int) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = radius
	m.bottom_radius = radius
	m.height = length
	m.radial_segments = segments
	m.rings = 1
	m.cap_top = false
	m.cap_bottom = false
	return m
