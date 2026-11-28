## OverheadCards3D.gd — Kart taşıyan operatörün kafasının üstünde 1 / 2 / 3 adet süzülen
## taktik erişim kartı göstergesi ("♦ KART / ×2 / ×3" yazısının yerini alır).
## TacticalDark "Sis & Cam" + Sodyum Kehribarı kimliği: pahlı füme cam kart gövdesi,
## parlayan kehribar kenar çizgisi, üst çubuk, yumuşak kehribar hale ve 3 kartta kıvılcımlar.
## Kameraya dönük (billboard), karanlıkta ve duvar arkasında dostlara net okunur (unshaded + no_depth_test).

extends Node3D

const CARD_W := 0.42
const CARD_H := 0.60
const CHAMFER := 0.042
const CHAMFER_TR := 0.115
const RIM_W := 0.024
const HEAD_Y := 2.25             # karakter kafasının dünya yüksekliği
const SCREEN_UP_OFFSET := 0.95   # kameranın ekran-yukarı ekseninde sabit ofset (köşelerde kayma olmaz)

const GLASS_SHADER_CODE := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, depth_test_disabled, cull_disabled, shadows_disabled;

uniform vec4 glass_color : source_color = vec4(0.055, 0.068, 0.085, 0.78);
uniform vec3 amber_color : source_color = vec3(1.0, 0.68, 0.24);
uniform float glow_boost = 0.0;

void fragment() {
	// Çapraz cam yansıma bandı (füme taktik cam hissi)
	float diag = exp(-pow((UV.x * 0.9 + UV.y * 0.65 - 0.62) * 5.2, 2.0)) * 0.16;
	// Kenarlara ve üste doğru sıcak kehribar iç sızıntısı
	float edge_x = abs(UV.x - 0.5) * 2.0;
	float edge_y = abs(UV.y - 0.5) * 2.0;
	float rim_glow = pow(max(edge_x, edge_y), 3.0) * (0.28 + glow_boost * 0.22);
	float bottom_warm = smoothstep(0.35, 1.0, UV.y) * glow_boost * 0.16;
	vec3 col = glass_color.rgb + vec3(diag) + amber_color * (rim_glow + bottom_warm);
	ALBEDO = col;
	ALPHA = clamp(glass_color.a + rim_glow * 0.2, 0.0, 0.92);
}
"""

# Tüm Player örnekleri arasında ortak paylaşılan mesh ve malzemeler (tek sefer oluşturulur)
static var _shared_mesh: ArrayMesh = null
static var _shared_glass_shader: Shader = null
static var _shared_rim_mat: StandardMaterial3D = null
static var _shared_halo_tex: GradientTexture2D = null
static var _shared_spark_mesh: QuadMesh = null

var _pivot: Node3D
var _cards: Array[MeshInstance3D] = []
var _glass_mat: ShaderMaterial
var _halo: MeshInstance3D
var _halo_mat: StandardMaterial3D
var _sparks: CPUParticles3D
var _count: int = 0
var _pop_scale: float = 1.0
var _phase: float = 0.0


func _ready() -> void:
	_ensure_shared_resources()
	_phase = randf() * TAU

	_pivot = Node3D.new()
	add_child(_pivot)

	# Yumuşak sıcak kehribar arka plan halesi
	_halo = MeshInstance3D.new()
	var hmesh := QuadMesh.new()
	hmesh.size = Vector2(1.25, 1.15)
	_halo.mesh = hmesh
	_halo.position = Vector3(0.0, 0.0, -0.04)
	_halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_halo_mat = StandardMaterial3D.new()
	_halo_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_halo_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_halo_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_halo_mat.no_depth_test = true
	_halo_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_halo_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_halo_mat.render_priority = 9
	_halo_mat.albedo_texture = _shared_halo_tex
	_halo_mat.albedo_color = Color(1.0, 0.65, 0.20, 0.28)
	_halo.material_override = _halo_mat
	_pivot.add_child(_halo)

	# Kart başına cam shader (3 kartta kehribar sıcaklığı hafifçe artar)
	_glass_mat = ShaderMaterial.new()
	_glass_mat.shader = _shared_glass_shader
	_glass_mat.render_priority = 10

	# En fazla 3 adet kart düğümü önceden kurulur; sayıya göre açılıp konumlanır
	for i in 3:
		var mi := MeshInstance3D.new()
		mi.mesh = _shared_mesh
		mi.set_surface_override_material(0, _glass_mat)
		mi.set_surface_override_material(1, _shared_rim_mat)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visible = false
		_pivot.add_child(mi)
		_cards.append(mi)

	# 3 kart taşırken etrafta süzülen ince kehribar kıvılcımları
	_sparks = CPUParticles3D.new()
	_sparks.amount = 22
	_sparks.lifetime = 1.8
	_sparks.preprocess = 0.6
	_sparks.local_coords = true
	_sparks.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	_sparks.emission_box_extents = Vector3(0.58, 0.38, 0.08)
	_sparks.direction = Vector3(0.0, 1.0, 0.0)
	_sparks.spread = 180.0
	_sparks.gravity = Vector3(0.0, 0.12, 0.0)
	_sparks.initial_velocity_min = 0.06
	_sparks.initial_velocity_max = 0.18
	_sparks.scale_amount_min = 0.55
	_sparks.scale_amount_max = 1.25
	var sgrad := Gradient.new()
	sgrad.set_color(0, Color(1.0, 0.78, 0.35, 0.0))
	sgrad.set_color(1, Color(1.0, 0.65, 0.20, 0.0))
	sgrad.add_point(0.25, Color(1.0, 0.85, 0.45, 0.95))
	sgrad.add_point(0.75, Color(1.0, 0.68, 0.25, 0.7))
	_sparks.color_ramp = sgrad
	_sparks.mesh = _shared_spark_mesh
	_sparks.emitting = false
	_sparks.visible = false
	_pivot.add_child(_sparks)

	set_card_count(_count)


func set_card_count(count: int) -> void:
	var clamped := clampi(count, 0, 3)
	var grew := clamped > _count
	_count = clamped
	if _cards.is_empty():
		return

	for i in 3:
		_cards[i].visible = i < clamped

	match clamped:
		1:
			_cards[0].position = Vector3(0.0, 0.0, 0.0)
			_cards[0].rotation = Vector3.ZERO
			_halo.scale = Vector3(0.85, 0.95, 1.0)
			_halo_mat.albedo_color = Color(1.0, 0.66, 0.22, 0.26)
			_glass_mat.set_shader_parameter("glow_boost", 0.0)
		2:
			_cards[0].position = Vector3(-0.21, -0.02, -0.01)
			_cards[0].rotation = Vector3(0.0, 0.0, deg_to_rad(19.0))
			_cards[1].position = Vector3(0.21, -0.02, 0.01)
			_cards[1].rotation = Vector3(0.0, 0.0, deg_to_rad(-19.0))
			_halo.scale = Vector3(1.15, 1.05, 1.0)
			_halo_mat.albedo_color = Color(1.0, 0.66, 0.22, 0.36)
			_glass_mat.set_shader_parameter("glow_boost", 0.3)
		3:
			_cards[0].position = Vector3(-0.37, -0.06, -0.015)
			_cards[0].rotation = Vector3(0.0, 0.0, deg_to_rad(26.0))
			_cards[1].position = Vector3(0.0, 0.05, 0.015)
			_cards[1].rotation = Vector3.ZERO
			_cards[2].position = Vector3(0.37, -0.06, -0.005)
			_cards[2].rotation = Vector3(0.0, 0.0, deg_to_rad(-26.0))
			_halo.scale = Vector3(1.48, 1.18, 1.0)
			_halo_mat.albedo_color = Color(1.0, 0.65, 0.20, 0.52)
			_glass_mat.set_shader_parameter("glow_boost", 0.75)

	var show_sparks := clamped >= 3
	_sparks.visible = show_sparks
	_sparks.emitting = show_sparks

	if grew:
		_pop_scale = 0.68


func _process(delta: float) -> void:
	if not visible or _count <= 0:
		return

	# Tam kameraya dönük (billboard) + kamera ekran-yukarı (cam.global_basis.y) yönünde konumla:
	# Dünya +Y yerine kamera-yukarı ekseni kullanıldığı için ekranın sol/sağ köşelerinde perspektif kayması olmaz.
	var cam := get_viewport().get_camera_3d()
	if cam != null:
		var cam_basis := cam.get_global_transform_interpolated().basis
		var parent := get_parent() as Node3D
		if parent != null:
			var head_world := parent.get_global_transform_interpolated().origin + Vector3(0.0, HEAD_Y, 0.0)
			global_position = head_world + cam_basis.y * SCREEN_UP_OFFSET
		global_basis = cam_basis

	var t := Time.get_ticks_msec() / 1000.0
	_pivot.position.y = sin(t * 2.5 + _phase) * 0.045
	if _pop_scale < 0.999:
		_pop_scale = lerpf(_pop_scale, 1.0, 1.0 - exp(-14.0 * delta))
		_pivot.scale = Vector3.ONE * _pop_scale
	elif _pivot.scale != Vector3.ONE:
		_pivot.scale = Vector3.ONE


static func _ensure_shared_resources() -> void:
	if _shared_mesh != null:
		return

	_shared_glass_shader = Shader.new()
	_shared_glass_shader.code = GLASS_SHADER_CODE

	_shared_rim_mat = StandardMaterial3D.new()
	_shared_rim_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shared_rim_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shared_rim_mat.no_depth_test = true
	_shared_rim_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_shared_rim_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_shared_rim_mat.render_priority = 11
	_shared_rim_mat.albedo_color = Color(1.0, 0.74, 0.30, 0.98)

	_shared_halo_tex = GradientTexture2D.new()
	var hg := Gradient.new()
	hg.set_color(0, Color(1.0, 1.0, 1.0, 1.0))
	hg.set_color(1, Color(1.0, 1.0, 1.0, 0.0))
	hg.add_point(0.45, Color(1.0, 1.0, 1.0, 0.38))
	_shared_halo_tex.gradient = hg
	_shared_halo_tex.fill = GradientTexture2D.FILL_RADIAL
	_shared_halo_tex.fill_from = Vector2(0.5, 0.5)
	_shared_halo_tex.fill_to = Vector2(1.0, 0.5)
	_shared_halo_tex.width = 48
	_shared_halo_tex.height = 48

	var smat := StandardMaterial3D.new()
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	smat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	smat.no_depth_test = true
	smat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	smat.vertex_color_use_as_albedo = true
	smat.render_priority = 12
	smat.albedo_texture = _shared_halo_tex
	_shared_spark_mesh = QuadMesh.new()
	_shared_spark_mesh.size = Vector2(0.048, 0.048)
	_shared_spark_mesh.material = smat

	_shared_mesh = _build_card_mesh()


## Pahlı taktik kart mesh'i:
## Yüzey 0 = füme cam gövde, Yüzey 1 = parlayan sodyum kehribarı dış çerçeve + üst şerit
static func _build_card_mesh() -> ArrayMesh:
	var hw := CARD_W * 0.5
	var hh := CARD_H * 0.5
	var outer: Array[Vector2] = [
		Vector2(hw, hh - CHAMFER_TR),
		Vector2(hw - CHAMFER_TR, hh),
		Vector2(-hw + CHAMFER, hh),
		Vector2(-hw, hh - CHAMFER),
		Vector2(-hw, -hh + CHAMFER),
		Vector2(-hw + CHAMFER, -hh),
		Vector2(hw - CHAMFER, -hh),
		Vector2(hw, -hh + CHAMFER),
	]
	var ihw := hw - RIM_W
	var ihh := hh - RIM_W
	var ich := maxf(CHAMFER - RIM_W * 0.4, 0.01)
	var ich_tr := maxf(CHAMFER_TR - RIM_W * 0.4, 0.02)
	var inner: Array[Vector2] = [
		Vector2(ihw, ihh - ich_tr),
		Vector2(ihw - ich_tr, ihh),
		Vector2(-ihw + ich, ihh),
		Vector2(-ihw, ihh - ich),
		Vector2(-ihw, -ihh + ich),
		Vector2(-ihw + ich, -ihh),
		Vector2(ihw - ich, -ihh),
		Vector2(ihw, -ihh + ich),
	]
	var n := outer.size()
	var mesh := ArrayMesh.new()

	# Yüzey 0: Füme cam iç yüzey
	var st0 := SurfaceTool.new()
	st0.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in n:
		var p0 := inner[i]
		var p1 := inner[(i + 1) % n]
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(0.5, 0.5))
		st0.add_vertex(Vector3.ZERO)
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(p0.x / CARD_W + 0.5, 0.5 - p0.y / CARD_H))
		st0.add_vertex(Vector3(p0.x, p0.y, 0.0))
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(p1.x / CARD_W + 0.5, 0.5 - p1.y / CARD_H))
		st0.add_vertex(Vector3(p1.x, p1.y, 0.0))
	st0.commit(mesh)

	# Yüzey 1: Parlayan kehribar dış çerçeve şeridi + üstteki kısa yatay erişim çubuğu
	var st1 := SurfaceTool.new()
	st1.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in n:
		var o0 := outer[i]
		var o1 := outer[(i + 1) % n]
		var i0 := inner[i]
		var i1 := inner[(i + 1) % n]
		st1.set_normal(Vector3.BACK)
		st1.add_vertex(Vector3(o0.x, o0.y, 0.001))
		st1.add_vertex(Vector3(o1.x, o1.y, 0.001))
		st1.add_vertex(Vector3(i1.x, i1.y, 0.001))
		st1.add_vertex(Vector3(o0.x, o0.y, 0.001))
		st1.add_vertex(Vector3(i1.x, i1.y, 0.001))
		st1.add_vertex(Vector3(i0.x, i0.y, 0.001))

	# Üstte sade kehribar yatay şerit (konseptteki gibi)
	var bw := 0.068
	var bh := 0.014
	var by := hh - 0.095
	var bx := -0.02
	st1.set_normal(Vector3.BACK)
	st1.add_vertex(Vector3(bx - bw, by - bh, 0.002))
	st1.add_vertex(Vector3(bx + bw, by - bh, 0.002))
	st1.add_vertex(Vector3(bx + bw, by + bh, 0.002))
	st1.add_vertex(Vector3(bx - bw, by - bh, 0.002))
	st1.add_vertex(Vector3(bx + bw, by + bh, 0.002))
	st1.add_vertex(Vector3(bx - bw, by + bh, 0.002))
	st1.commit(mesh)

	return mesh
