## MenuCards3D.gd — TacticalDark "Sis & Cam" temalı 3D taktik erişim kartları:
## Sağ tarafta dikeyde ortalı, pah kırılmış (kesik köşeli) 2 adet saydam füme cam 3D kart,
## sodyum kehribarı 3D kenar şeridi, tepeden vuran beyaz SpotLight3D, ışık huzmesi ve
## fareyle üzerine gelinen seçeneğin etrafında kraliçe arıya toplanır gibi çoğalıp dönen
## 3D toz/kıvılcım sürüsü (MultiMeshInstance3D).

extends "res://scenes/ui/SharpViewport.gd"

signal item_activated(key: String)

const SFX := preload("res://scenes/audio/Sfx.gd")

# Sol ve sağ 3D kart maddeleri (MainMenu eylemleriyle birebir eşleşir)
const LEFT_ITEMS: Array[Array] = [
	["create", "ODA KUR"],
	["browse", "ODALAR"],
	["code", "KOD İLE KATIL"],
]
const RIGHT_ITEMS: Array[Array] = [
	["profile", "PROFİL"],
	["settings", "AYARLAR"],
	["quit", "OYUNDAN ÇIK"],
]

# 3D taktik erişim kartı ölçüleri ve TacticalDark "Sis & Cam" renk paleti
const CARD_W := 1.52
const CARD_H := 2.30
const CARD_THICK := 0.042
const CHAMFER := 0.095                           # askeri plaka pah kesimi
const CHAMFER_TOP_RIGHT := 0.24                  # üst sağ köşe taktik keycard kesiği

const GLASS_COLOR := Color(0.065, 0.08, 0.098, 0.72)    # saydam füme taktik cam
const EDGE_AMBER := Color(1.0, 0.68, 0.25, 0.92)        # sodyum kehribarı 3D kenar
const TEXT_IDLE := Color(0.68, 0.73, 0.78, 0.95)        # soluk taktik gri (koyu camda net)
const TEXT_DANGER := Color(1.0, 0.34, 0.28, 0.95)       # OYUNDAN ÇIK: kızılötesi kırmızı
const TEXT_HOVER := Color(1.0, 1.0, 1.0, 1.0)           # hover'da parlak beyaz

# Kamera ve sağa yaslı, dikeyde ortalı kart yerleşimi
const CAM_POS := Vector3(0.0, 0.0, 6.4)
const GROUP_POS := Vector3(1.95, -0.08, 0.0)
const SPOT_WORLD_POS := Vector3(1.95, 3.8, 2.2)

# ── Partikül / Kraliçe Arı Sürüsü Ayarları ──
const AMBIENT_COUNT := 100                        # boşta spot ışığında süzülen toz sayısı
const SWARM_TOTAL := 120                         # hover'da çoğalan toplam sürü sayısı
const PARTICLE_SIZE := 0.014                     # temel partikül boyutu (metre)
const PARTICLE_SCALE_RANGE := Vector2(0.55, 1.30)# partikül arası rastgele boyut çarpanı (min, max)
const SWARM_ORBIT_SPEED := Vector2(0.8, 1.8)     # hover'da yazının etrafında dönme hızı (min, max)
const SWARM_PULL_SPEED := 9.5                    # hover'da kraliçe yazıya çekim hızı
const SWARM_DAMPING := 4.8                       # hover'da hareket sönümleme (yüksek = daha sakin)
const IDLE_DRIFT_SPEED := 0.45                   # boşta spot ışığında süzülme hızı
const IDLE_PULL_SPEED := 2.2                     # boşta eski yerine dağılma hızı

# Şeffaf SubViewport üzerinde temiz alfa veren hacimsel spot konisi shader'ı
const SHAFT_SHADER_CODE := """
shader_type spatial;
render_mode unshaded, blend_mix, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec4 color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float intensity = 0.22;

void fragment() {
	float down = 1.0 - UV.y;
	float height_fade = pow(down, 1.75) * smoothstep(0.0, 0.07, UV.y);
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float edge_fade = pow(facing, 1.85);
	float a = clamp(intensity * height_fade * edge_fade, 0.0, 0.82);
	ALBEDO = color.rgb;
	ALPHA = a;
}
"""

var _vp: SubViewport
var _cam: Camera3D
var _cards_root: Node3D
var _left_card: Node3D
var _right_card: Node3D
var _spot: SpotLight3D
var _spot_shaft: MeshInstance3D

# Etkileşimli yazı maddeleri: [{key, card, label, bar, bar_mat, y, half_h, half_w, hover_t}]
var _entries: Array[Dictionary] = []
var _hovered_key: String = ""
var _mouse_norm := Vector2.ZERO
var _active := true
var _input_blocked := false

# 3D sürü partikülleri (MultiMeshInstance3D — tek draw call)
var _swarm_mm: MultiMesh
var _particles: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS
	_rng.randomize()
	_build_3d_scene()


## Görünürlük ve GPU güncellemesini birlikte yönet (gizliyken SubViewport çizmez)
func set_cards_active(enabled: bool) -> void:
	_active = enabled
	visible = enabled
	if _vp:
		_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if enabled else SubViewport.UPDATE_DISABLED
	if not enabled:
		_set_hovered("")
		mouse_default_cursor_shape = Control.CURSOR_ARROW


## Modal (Odalar / Oda Kur / Kod ile Katıl) açıkken arkadaki kartlarda hover/tıklama tetiklenmesin
func set_input_blocked(blocked: bool) -> void:
	_input_blocked = blocked
	if blocked:
		_set_hovered("")
		mouse_default_cursor_shape = Control.CURSOR_ARROW


func _build_3d_scene() -> void:
	_vp = viewport
	_vp.own_world_3d = true
	_vp.transparent_bg = true
	_vp.msaa_3d = Viewport.MSAA_4X
	_vp.scaling_3d_scale = 1.0

	# Ortam: şeffaf arka plan, soğuk taktik ortam ışığı + ACES ton eşleme
	var env_node := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.0, 0.0, 0.0, 0.0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.72, 0.78, 0.88)
	env.ambient_light_energy = 0.28
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env_node.environment = env
	_vp.add_child(env_node)

	# Kamera
	_cam = Camera3D.new()
	_cam.fov = 38.0
	_cam.position = CAM_POS
	_vp.add_child(_cam)
	_cam.look_at(Vector3.ZERO, Vector3.UP)

	# Kart grubu (sağa yaslı, dikeyde ortalı)
	_cards_root = Node3D.new()
	_cards_root.position = GROUP_POS
	_vp.add_child(_cards_root)

	# 2 yüzeyli 3D taktik kart mesh'i: yüzey 0 = saydam füme cam, yüzey 1 = sodyum kehribarı kenar
	var card_mesh := _make_tactical_card_mesh(CARD_W, CARD_H, CARD_THICK, CHAMFER, CHAMFER_TOP_RIGHT)

	var glass_mat := StandardMaterial3D.new()
	glass_mat.albedo_color = GLASS_COLOR
	glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	glass_mat.cull_mode = BaseMaterial3D.CULL_BACK
	glass_mat.roughness = 0.26
	glass_mat.metallic = 0.14
	glass_mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX

	var edge_mat := StandardMaterial3D.new()
	edge_mat.albedo_color = EDGE_AMBER
	edge_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	edge_mat.roughness = 0.28
	edge_mat.metallic = 0.45
	edge_mat.emission_enabled = true
	edge_mat.emission = Color(1.0, 0.65, 0.22)
	edge_mat.emission_energy_multiplier = 0.45

	card_mesh.surface_set_material(0, glass_mat)
	card_mesh.surface_set_material(1, edge_mat)

	# Sol kart: hafif sola eğik, sağ kartın hemen arkasında
	_left_card = _build_card_node(card_mesh, LEFT_ITEMS, Vector3(-0.66, 0.02, -0.06), Vector3(-0.04, 0.15, 0.21))
	_cards_root.add_child(_left_card)

	# Sağ kart: hafif sağa eğik, hafifçe önde
	_right_card = _build_card_node(card_mesh, RIGHT_ITEMS, Vector3(0.66, -0.02, 0.06), Vector3(-0.04, -0.15, -0.21))
	_cards_root.add_child(_right_card)

	# Tepeden vuran gerçek beyaz SpotLight3D (CharacterSelect.gd'deki karakter spot ışığı gibi)
	_spot = SpotLight3D.new()
	_spot.position = SPOT_WORLD_POS
	_spot.light_color = Color(1.0, 0.99, 0.97)
	_spot.light_energy = 34.0
	_spot.spot_range = 10.5
	_spot.spot_angle = 22.0
	_spot.spot_angle_attenuation = 1.6
	_spot.spot_attenuation = 0.75
	_spot.shadow_enabled = false
	_vp.add_child(_spot)
	_spot.look_at(GROUP_POS + Vector3(0.0, -0.1, 0.0), Vector3.UP)

	# Hafif soğuk rim dolgu ışığı (füme cam yüzeyde derinlik versin)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20.0, -14.0, 0.0)
	fill.light_color = Color(0.86, 0.91, 1.0)
	fill.light_energy = 0.45
	fill.shadow_enabled = false
	_vp.add_child(fill)

	# Görünür beyaz ışık huzmesi konisi + kraliçe arı gibi toplanan 3D toz sürüsü
	_build_spotlight_shaft()
	_build_swarm_particles()


func _build_card_node(
	card_mesh: ArrayMesh,
	items: Array[Array],
	pos: Vector3,
	rot: Vector3
) -> Node3D:
	var node := Node3D.new()
	node.position = pos
	node.rotation = rot
	node.set_meta("base_pos", pos)
	node.set_meta("base_rot", rot)

	var mi := MeshInstance3D.new()
	mi.mesh = card_mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.add_child(mi)

	var front_z := CARD_THICK * 0.5 + 0.004

	# Üstte ince sodyum kehribarı taktik erişim şeridi (iç dikdörtgen çerçeve yok, sade ekipman detayı)
	var accent_bar := MeshInstance3D.new()
	var ab_mesh := QuadMesh.new()
	ab_mesh.size = Vector2(0.42, 0.024)
	accent_bar.mesh = ab_mesh
	accent_bar.position = Vector3(-CARD_W * 0.5 + 0.34, CARD_H * 0.5 - 0.16, front_z)
	var ab_mat := StandardMaterial3D.new()
	ab_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ab_mat.albedo_color = Color(1.0, 0.68, 0.25, 0.95)
	accent_bar.material_override = ab_mat
	accent_bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.add_child(accent_bar)

	# Menü yazıları: ön yüzde dikeyde ortalı; hover'da beyaz + altında ince kehribar vurgu çizgisi
	var count := items.size()
	var spacing := 0.54 if count >= 3 else 0.60
	var start_y := spacing * float(count - 1) * 0.5

	for i in count:
		var key: String = items[i][0]
		var text: String = items[i][1]
		var is_danger := (key == "quit")
		var idle_col := TEXT_DANGER if is_danger else TEXT_IDLE
		var bar_col := Color(1.0, 0.34, 0.28, 0.0) if is_danger else Color(1.0, 0.68, 0.25, 0.0)
		var y_pos := start_y - float(i) * spacing

		var lbl := Label3D.new()
		lbl.text = text
		lbl.position = Vector3(0.0, y_pos, front_z + 0.002)
		lbl.font = UITheme.font_bold
		lbl.font_size = 74
		lbl.pixel_size = 0.0028
		lbl.modulate = idle_col
		lbl.outline_size = 0
		lbl.shaded = false
		lbl.no_depth_test = false
		lbl.double_sided = false
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lbl.width = 430.0
		node.add_child(lbl)

		# Hover olunca yazının altında beliren ince odak çizgisi
		var u_bar := MeshInstance3D.new()
		var u_mesh := QuadMesh.new()
		u_mesh.size = Vector2(0.74, 0.016)
		u_bar.mesh = u_mesh
		u_bar.position = Vector3(0.0, y_pos - 0.16, front_z + 0.001)
		u_bar.scale = Vector3(0.01, 1.0, 1.0)
		var u_mat := StandardMaterial3D.new()
		u_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		u_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		u_mat.albedo_color = bar_col
		u_bar.material_override = u_mat
		u_bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(u_bar)

		_entries.append({
			"key": key,
			"card": node,
			"label": lbl,
			"bar": u_bar,
			"bar_mat": u_mat,
			"idle_col": idle_col,
			"is_danger": is_danger,
			"y": y_pos,
			"half_h": spacing * 0.44,
			"half_w": CARD_W * 0.46,
			"hover_t": 0.0,
		})

	return node


func _build_spotlight_shaft() -> void:
	_spot_shaft = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.36
	cyl.bottom_radius = 2.10
	cyl.height = 5.4
	cyl.radial_segments = 36
	cyl.cap_top = false
	cyl.cap_bottom = false
	_spot_shaft.mesh = cyl
	_spot_shaft.position = Vector3(GROUP_POS.x, 1.35, -0.38)
	_spot_shaft.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var sh := Shader.new()
	sh.code = SHAFT_SHADER_CODE
	var smat := ShaderMaterial.new()
	smat.shader = sh
	smat.set_shader_parameter("color", Color(1.0, 1.0, 1.0, 1.0))
	smat.set_shader_parameter("intensity", 0.22)
	_spot_shaft.material_override = smat
	_vp.add_child(_spot_shaft)

	# Tepedeki beyaz spot kaynağı parlaması
	var lamp := MeshInstance3D.new()
	var lamp_mesh := QuadMesh.new()
	lamp_mesh.size = Vector2(1.45, 0.26)
	lamp.mesh = lamp_mesh
	lamp.position = Vector3(GROUP_POS.x, 2.38, -0.22)
	var ltex := GradientTexture2D.new()
	var lg := Gradient.new()
	lg.set_color(0, Color(1.0, 1.0, 1.0, 0.95))
	lg.set_color(1, Color(1.0, 1.0, 1.0, 0.0))
	lg.add_point(0.45, Color(1.0, 1.0, 1.0, 0.55))
	ltex.gradient = lg
	ltex.fill = GradientTexture2D.FILL_RADIAL
	ltex.fill_from = Vector2(0.5, 0.5)
	ltex.fill_to = Vector2(1.0, 0.5)
	ltex.width = 64
	ltex.height = 64
	var lmat := StandardMaterial3D.new()
	lmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	lmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	lmat.albedo_texture = ltex
	lamp.material_override = lmat
	lamp.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_vp.add_child(lamp)


## Kraliçe arı sürüsü: boşta spot konisinde süzülen tozlar; hover'da 2.6 katına çoğalıp
## fareyle gelinen seçeneğin etrafına arı sürüsü gibi akarak dönerler.
func _build_swarm_particles() -> void:
	var dtex := GradientTexture2D.new()
	var dtex_g := Gradient.new()
	dtex_g.set_color(0, Color(1, 1, 1, 1.0))
	dtex_g.set_color(1, Color(1, 1, 1, 0.0))
	dtex_g.add_point(0.35, Color(1, 1, 1, 0.85))
	dtex.gradient = dtex_g
	dtex.fill = GradientTexture2D.FILL_RADIAL
	dtex.fill_from = Vector2(0.5, 0.5)
	dtex.fill_to = Vector2(1.0, 0.5)
	dtex.width = 16
	dtex.height = 16

	var pmat := StandardMaterial3D.new()
	pmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pmat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	pmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	pmat.billboard_keep_scale = true
	pmat.vertex_color_use_as_albedo = true
	pmat.albedo_texture = dtex
	pmat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED

	var qmesh := QuadMesh.new()
	qmesh.size = Vector2(PARTICLE_SIZE, PARTICLE_SIZE)
	qmesh.material = pmat

	_swarm_mm = MultiMesh.new()
	_swarm_mm.transform_format = MultiMesh.TRANSFORM_3D
	_swarm_mm.use_colors = true
	_swarm_mm.mesh = qmesh
	_swarm_mm.instance_count = SWARM_TOTAL

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = _swarm_mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_vp.add_child(mmi)

	_particles.clear()
	for i in SWARM_TOTAL:
		var is_ambient := i < AMBIENT_COUNT
		var home := Vector3(
			GROUP_POS.x + _rng.randf_range(-1.35, 1.35),
			_rng.randf_range(-1.35, 2.15),
			_rng.randf_range(-0.45, 0.45)
		)
		var p := {
			"pos": home,
			"vel": Vector3.ZERO,
			"home": home,
			"ambient": is_ambient,
			"phase": _rng.randf_range(0.0, TAU),
			"orbit_speed": _rng.randf_range(SWARM_ORBIT_SPEED.x, SWARM_ORBIT_SPEED.y) * (-1.0 if _rng.randf() < 0.5 else 1.0),
			"orbit_rx": _rng.randf_range(0.22, 0.62),      # yazı genişliği boyunca eliptik yörünge
			"orbit_ry": _rng.randf_range(0.08, 0.26),      # yazı yüksekliği etrafında
			"orbit_rz": _rng.randf_range(0.06, 0.24),      # kartın önünde hafif 3D derinlik
			"base_scale": _rng.randf_range(PARTICLE_SCALE_RANGE.x, PARTICLE_SCALE_RANGE.y),
			"alpha": 1.0 if is_ambient else 0.0,
			"delay": 0.0 if is_ambient else _rng.randf_range(0.0, 0.35),
			"warmth": _rng.randf_range(0.15, 0.85),        # kehribar-beyaz ton çeşitliliği
		}
		_particles.append(p)
		_swarm_mm.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ONE * 0.001), home))
		_swarm_mm.set_instance_color(i, Color(1, 1, 1, 0.0))


## Pah kırılmış (45° kesik köşeli) 2 yüzeyli 3D taktik kart mesh'i üretir.
## Yüzey 0: ön ve arka füme cam yüzler, Yüzey 1: sodyum kehribarı 3D yan kenarlar.
func _make_tactical_card_mesh(w: float, h: float, thick: float, ch: float, ch_tr: float) -> ArrayMesh:
	var hw := w * 0.5
	var hh := h * 0.5
	var hz := thick * 0.5

	# Saat yönünün tersine 8 köşeli pahlı poligon (üst sağ köşe daha geniş taktik kesik)
	var ring: Array[Vector2] = [
		Vector2(hw, hh - ch_tr),
		Vector2(hw - ch_tr, hh),
		Vector2(-hw + ch, hh),
		Vector2(-hw, hh - ch),
		Vector2(-hw, -hh + ch),
		Vector2(-hw + ch, -hh),
		Vector2(hw - ch, -hh),
		Vector2(hw, -hh + ch),
	]
	var n := ring.size()
	var mesh := ArrayMesh.new()

	# Yüzey 0: Ön (+Z) ve Arka (-Z) cam yüzler
	var st_face := SurfaceTool.new()
	st_face.begin(Mesh.PRIMITIVE_TRIANGLES)
	var f_center := Vector3(0.0, 0.0, hz)
	var b_center := Vector3(0.0, 0.0, -hz)
	for i in n:
		var p0 := ring[i]
		var p1 := ring[(i + 1) % n]
		st_face.set_normal(Vector3.BACK)
		st_face.set_uv(Vector2(0.5, 0.5))
		st_face.add_vertex(f_center)
		st_face.set_normal(Vector3.BACK)
		st_face.set_uv(Vector2(p0.x / w + 0.5, 0.5 - p0.y / h))
		st_face.add_vertex(Vector3(p0.x, p0.y, hz))
		st_face.set_normal(Vector3.BACK)
		st_face.set_uv(Vector2(p1.x / w + 0.5, 0.5 - p1.y / h))
		st_face.add_vertex(Vector3(p1.x, p1.y, hz))

		st_face.set_normal(Vector3.FORWARD)
		st_face.add_vertex(b_center)
		st_face.set_normal(Vector3.FORWARD)
		st_face.add_vertex(Vector3(p1.x, p1.y, -hz))
		st_face.set_normal(Vector3.FORWARD)
		st_face.add_vertex(Vector3(p0.x, p0.y, -hz))
	st_face.commit(mesh)

	# Yüzey 1: 3D yan kenarlar (sodyum kehribarı parıltılı kenar kalınlığı)
	var st_edge := SurfaceTool.new()
	st_edge.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in n:
		var p0 := ring[i]
		var p1 := ring[(i + 1) % n]
		var edge := p1 - p0
		var n2 := Vector2(edge.y, -edge.x).normalized()
		var n3 := Vector3(n2.x, n2.y, 0.0)
		var f0 := Vector3(p0.x, p0.y, hz)
		var f1 := Vector3(p1.x, p1.y, hz)
		var b0 := Vector3(p0.x, p0.y, -hz)
		var b1 := Vector3(p1.x, p1.y, -hz)

		st_edge.set_normal(n3)
		st_edge.add_vertex(f0)
		st_edge.set_normal(n3)
		st_edge.add_vertex(b0)
		st_edge.set_normal(n3)
		st_edge.add_vertex(b1)

		st_edge.set_normal(n3)
		st_edge.add_vertex(f0)
		st_edge.set_normal(n3)
		st_edge.add_vertex(b1)
		st_edge.set_normal(n3)
		st_edge.add_vertex(f1)
	st_edge.commit(mesh)

	return mesh


func _process(delta: float) -> void:
	super(delta)
	if not _active or not visible or _cam == null:
		return

	var t := Time.get_ticks_msec() / 1000.0
	var k := 1.0 - exp(-9.0 * delta)

	# Fare konumu ile hafif 3D paralaks
	var local_mp := get_local_mouse_position()
	var sz := size.max(Vector2.ONE)
	var norm := Vector2((local_mp.x / sz.x) * 2.0 - 1.0, (local_mp.y / sz.y) * 2.0 - 1.0)
	_mouse_norm = _mouse_norm.lerp(norm.clamp(Vector2(-1, -1), Vector2(1, 1)), 1.0 - exp(-5.0 * delta))

	var hovered_entry: Dictionary = {}
	for e: Dictionary in _entries:
		if e["key"] == _hovered_key:
			hovered_entry = e
			break

	var hover_card: Node3D = hovered_entry.get("card")
	_animate_card(_left_card, t, 0.0, hover_card == _left_card, k)
	_animate_card(_right_card, t, 1.35, hover_card == _right_card, k)

	# Yazı renkleri + alt odak çizgisi
	for e: Dictionary in _entries:
		var is_hov: bool = (e["key"] == _hovered_key)
		e["hover_t"] = lerpf(float(e["hover_t"]), 1.0 if is_hov else 0.0, 1.0 - exp(-16.0 * delta))
		var ht: float = e["hover_t"]
		var lbl: Label3D = e["label"]
		var idle_col: Color = e["idle_col"]
		lbl.modulate = idle_col.lerp(TEXT_HOVER, ht)
		var s := lerpf(1.0, 1.06, ht)
		lbl.scale = Vector3(s, s, 1.0)
		var u_bar: MeshInstance3D = e["bar"]
		u_bar.scale = Vector3(maxf(0.01, ht), 1.0, 1.0)
		var u_mat: StandardMaterial3D = e["bar_mat"]
		u_mat.albedo_color.a = ht * 0.9

	# Kraliçe arı toz sürüsünü güncelle
	_update_swarm(delta, t, hovered_entry)

	# Modal açık değilse hover'ı sürekli güncel tut
	if not _input_blocked:
		_update_hover(local_mp)


func _update_swarm(delta: float, t: float, hovered_entry: Dictionary) -> void:
	if _swarm_mm == null:
		return
	var has_queen := not hovered_entry.is_empty()
	var queen_pos := Vector3.ZERO
	var queen_basis := Basis.IDENTITY
	if has_queen:
		var lbl: Label3D = hovered_entry["label"]
		queen_pos = lbl.global_position
		queen_basis = lbl.global_transform.basis.orthonormalized()

	var dt := minf(delta, 0.05)
	for i in _particles.size():
		var p: Dictionary = _particles[i]
		var pos: Vector3 = p["pos"]
		var vel: Vector3 = p["vel"]
		var phase: float = p["phase"]
		var is_ambient: bool = p["ambient"]
		var alpha: float = p["alpha"]

		if has_queen:
			# Hover aktif: tüm sürü uyanır (çoğalır) ve kraliçe seçeneğin etrafına akıp yörüngede döner
			var target_a := 0.92
			alpha = lerpf(alpha, target_a, 1.0 - exp(-5.5 * dt))

			var ang := t * float(p["orbit_speed"]) + phase
			var buzz := sin(t * 7.5 + phase * 3.1) * 0.04
			var local_off := Vector3(
				cos(ang) * float(p["orbit_rx"]),
				sin(ang * 1.3 + phase) * float(p["orbit_ry"]) + buzz,
				0.08 + absf(sin(ang * 0.8)) * float(p["orbit_rz"])
			)
			var target := queen_pos + queen_basis * local_off
			var to_target := target - pos
			var dist := to_target.length()
			# Uzaktakiler hızla kraliçeye süzülür, yakındakiler canlı arı gibi etrafında dolaşır
			var pull := SWARM_PULL_SPEED + clampf(dist * 3.5, 0.0, 14.0)
			vel += to_target * pull * dt
			vel *= exp(-SWARM_DAMPING * dt)
			pos += vel * dt
		else:
			# Boşta: ekstra sürü söner, ambient tozlar spot ışığı içinde yavaşça süzülür
			var target_a := 0.65 if is_ambient else 0.0
			alpha = lerpf(alpha, target_a, 1.0 - exp(-3.5 * dt))

			var home: Vector3 = p["home"]
			var drift := Vector3(
				sin(t * IDLE_DRIFT_SPEED + phase) * 0.24,
				cos(t * (IDLE_DRIFT_SPEED * 0.78) + phase * 1.4) * 0.28,
				sin(t * (IDLE_DRIFT_SPEED * 1.1) + phase * 0.7) * 0.14
			)
			var target := home + drift
			vel += (target - pos) * IDLE_PULL_SPEED * dt
			vel *= exp(-3.2 * dt)
			pos += vel * dt

		p["pos"] = pos
		p["vel"] = vel
		p["alpha"] = alpha

		var sc: float = float(p["base_scale"]) * (0.35 + 0.65 * alpha)
		if alpha < 0.015:
			sc = 0.0001
		_swarm_mm.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ONE * sc), pos))

		# Boşta beyaz toz, kraliçeye toplanınca beyaz + sıcak sodyum kehribarı (OYUNDAN ÇIK'ta kırmızı) parıltı
		var is_danger_queen := has_queen and bool(hovered_entry.get("is_danger", false))
		var accent := Color(1.0, 0.34, 0.28, 1.0) if is_danger_queen else Color(1.0, 0.74, 0.34, 1.0)
		var white := Color(1.0, 1.0, 1.0, 1.0)
		var col := white.lerp(accent, float(p["warmth"]) * (0.72 if has_queen else 0.12))
		col.a = alpha * (0.78 + 0.22 * sin(t * 5.0 + phase))
		_swarm_mm.set_instance_color(i, col)


func _animate_card(card: Node3D, t: float, phase: float, is_hovered: bool, k: float) -> void:
	var base_pos: Vector3 = card.get_meta("base_pos")
	var base_rot: Vector3 = card.get_meta("base_rot")
	var float_y := sin(t * 1.25 + phase) * 0.025
	var lift_z := 0.11 if is_hovered else 0.0
	var target_pos := base_pos + Vector3(0.0, float_y, lift_z)
	var target_rot := base_rot + Vector3(_mouse_norm.y * 0.045, _mouse_norm.x * 0.06, 0.0)
	card.position = card.position.lerp(target_pos, k)
	card.rotation = card.rotation.lerp(target_rot, k)


func _gui_input(event: InputEvent) -> void:
	if not _active or not visible or _input_blocked:
		return
	if event is InputEventMouseMotion:
		_update_hover((event as InputEventMouseMotion).position)
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			var hit := _raycast_item(mb.position)
			if not hit.is_empty():
				SFX.play_ui(get_tree(), "ui_click", -8.0)
				item_activated.emit(hit)
				accept_event()


func _update_hover(local_pos: Vector2) -> void:
	var hit := _raycast_item(local_pos)
	_set_hovered(hit)


func _set_hovered(key: String) -> void:
	if _hovered_key == key:
		return
	_hovered_key = key
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if not key.is_empty() else Control.CURSOR_ARROW
	if not key.is_empty():
		SFX.play_ui(get_tree(), "ui_hover", -24.0)


## 3D ışın-düzlem kesişimi: hangi kart ve hangi menü maddesinin üstünde olunduğunu bulur
func _raycast_item(local_pos: Vector2) -> String:
	if _cam == null or _vp == null or _vp.size.x <= 1 or _vp.size.y <= 1:
		return ""
	var vp_pos := to_viewport(local_pos)
	var ray_origin := _cam.project_ray_origin(vp_pos)
	var ray_dir := _cam.project_ray_normal(vp_pos)

	var best_key := ""
	var best_dist := INF

	for card: Node3D in [_right_card, _left_card]:
		var hit_local: Variant = _intersect_card_plane(card, ray_origin, ray_dir)
		if hit_local == null:
			continue
		var p: Vector3 = hit_local["local"]
		var dist: float = hit_local["dist"]
		if absf(p.x) > CARD_W * 0.5 or absf(p.y) > CARD_H * 0.5:
			continue
		if dist >= best_dist:
			continue
		for e: Dictionary in _entries:
			if e["card"] != card:
				continue
			if absf(p.x) <= float(e["half_w"]) and absf(p.y - float(e["y"])) <= float(e["half_h"]):
				best_dist = dist
				best_key = e["key"]
				break
		if dist < best_dist:
			best_dist = dist
			best_key = ""

	return best_key


func _intersect_card_plane(card: Node3D, ray_origin: Vector3, ray_dir: Vector3) -> Variant:
	var xf := card.global_transform
	var plane_normal := xf.basis.z.normalized()
	var denom := ray_dir.dot(plane_normal)
	if absf(denom) < 0.0001:
		return null
	var plane_point := xf.origin + plane_normal * (CARD_THICK * 0.5)
	var t := (plane_point - ray_origin).dot(plane_normal) / denom
	if t <= 0.0:
		return null
	var world_hit := ray_origin + ray_dir * t
	var local_hit := xf.affine_inverse() * world_hit
	return {"local": local_hit, "dist": t}
