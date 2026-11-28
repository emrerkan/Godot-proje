## Card.gd (3D)
## Haritada duran kart objesi (modda 1-3 adet). Üzerine giren yerel oyuncu pickup isteği gönderir.
## Bir oyuncu birden fazla kart taşıyabilir; her kart kendi card_id'siyle istenir.

extends Area3D

## Görünür olmaya başladığı / tam belirdiği mesafe (m) — kullanıcı: "biraz daha yaklaşınca belirginleşsin" (eski 12 → 5)
const REVEAL_FAR := 8.0
const REVEAL_NEAR := 3.0

const RECHECK_INTERVAL := 0.25   # görünürken alan içindeki yerel oyuncuyu yoklama aralığı
const REQUEST_COOLDOWN := 0.5    # aynı kart için istekler arası en az süre

# Kafa üstü kart (OverheadCards3D) ile birebir aynı pahlı füme cam + sodyum kehribarı tasarım
const CARD_W := 0.56
const CARD_H := 0.80
const CARD_THICK := 0.036
const CHAMFER := 0.056
const CHAMFER_TR := 0.15
const RIM_W := 0.032
const HOVER_BASE_Y := 0.64

const CARD_GLASS_SHADER := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_always, cull_back, shadows_disabled;

uniform vec4 glass_color : source_color = vec4(0.055, 0.068, 0.085, 0.82);
uniform vec3 amber_color : source_color = vec3(1.0, 0.68, 0.24);

void fragment() {
	float diag = exp(-pow((UV.x * 0.9 + UV.y * 0.65 - 0.62) * 5.2, 2.0)) * 0.18;
	float edge_x = abs(UV.x - 0.5) * 2.0;
	float edge_y = abs(UV.y - 0.5) * 2.0;
	float rim_glow = pow(max(edge_x, edge_y), 3.0) * 0.34;
	ALBEDO = glass_color.rgb + vec3(diag) + amber_color * rim_glow;
	ALPHA = clamp(glass_color.a + rim_glow * 0.16, 0.0, 0.94);
}
"""

static var _shared_mesh: ArrayMesh = null
static var _shared_glass_mat: ShaderMaterial = null
static var _shared_rim_mat: StandardMaterial3D = null

## GameManager atar
var card_id := -1
var carrier_peer := -1

var _recheck_t := 0.0
var _request_cd := 0.0
var _mesh_node: MeshInstance3D = null
var _bob_phase := 0.0


func _ready() -> void:
	add_to_group("cards")
	_bob_phase = randf() * TAU
	_setup_card_visual()
	var pr := get_node_or_null("ProximityReveal")
	if pr:
		pr.reveal_far = REVEAL_FAR
		pr.reveal_near = REVEAL_NEAR


func _setup_card_visual() -> void:
	_ensure_shared_visual()
	# Mevcut MeshInstance3D'yi kullan (ProximityReveal._ready() zaten onu _meshes listesine aldı)
	_mesh_node = get_node_or_null("MeshInstance3D") as MeshInstance3D
	if _mesh_node:
		_mesh_node.mesh = _shared_mesh
		_mesh_node.set_surface_override_material(0, _shared_glass_mat)
		_mesh_node.set_surface_override_material(1, _shared_rim_mat)
		_mesh_node.position = Vector3(0.0, HOVER_BASE_Y, 0.0)
		_mesh_node.rotation = Vector3(deg_to_rad(-16.0), 0.0, 0.0)
		_mesh_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var light := get_node_or_null("OmniLight3D") as OmniLight3D
	if light:
		light.light_color = Color(1.0, 0.68, 0.25)
	var lbl := get_node_or_null("Label3D") as Label3D
	if lbl:
		lbl.modulate = Color(1.0, 0.76, 0.32)
		lbl.position.y = 1.55


static func _ensure_shared_visual() -> void:
	if _shared_mesh != null:
		return
	var sh := Shader.new()
	sh.code = CARD_GLASS_SHADER
	_shared_glass_mat = ShaderMaterial.new()
	_shared_glass_mat.shader = sh

	_shared_rim_mat = StandardMaterial3D.new()
	_shared_rim_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shared_rim_mat.albedo_color = Color(1.0, 0.74, 0.30, 1.0)

	_shared_mesh = _build_card_mesh()


static func _build_card_mesh() -> ArrayMesh:
	var hw := CARD_W * 0.5
	var hh := CARD_H * 0.5
	var hz := CARD_THICK * 0.5
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
	var ich := maxf(CHAMFER - RIM_W * 0.4, 0.015)
	var ich_tr := maxf(CHAMFER_TR - RIM_W * 0.4, 0.03)
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

	# Yüzey 0: Ön (+Z) ve Arka (-Z) füme cam yüzler
	var st0 := SurfaceTool.new()
	st0.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in n:
		var p0 := inner[i]
		var p1 := inner[(i + 1) % n]
		# Ön yüz
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(0.5, 0.5))
		st0.add_vertex(Vector3(0.0, 0.0, hz))
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(p0.x / CARD_W + 0.5, 0.5 - p0.y / CARD_H))
		st0.add_vertex(Vector3(p0.x, p0.y, hz))
		st0.set_normal(Vector3.BACK)
		st0.set_uv(Vector2(p1.x / CARD_W + 0.5, 0.5 - p1.y / CARD_H))
		st0.add_vertex(Vector3(p1.x, p1.y, hz))
		# Arka yüz
		st0.set_normal(Vector3.FORWARD)
		st0.set_uv(Vector2(0.5, 0.5))
		st0.add_vertex(Vector3(0.0, 0.0, -hz))
		st0.set_normal(Vector3.FORWARD)
		st0.set_uv(Vector2(p1.x / CARD_W + 0.5, 0.5 - p1.y / CARD_H))
		st0.add_vertex(Vector3(p1.x, p1.y, -hz))
		st0.set_normal(Vector3.FORWARD)
		st0.set_uv(Vector2(p0.x / CARD_W + 0.5, 0.5 - p0.y / CARD_H))
		st0.add_vertex(Vector3(p0.x, p0.y, -hz))
	st0.commit(mesh)

	# Yüzey 1: Ön/Arka kehribar dış çerçeve + 3D yan kenarlar + ön/arka üst şerit
	var st1 := SurfaceTool.new()
	st1.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in n:
		var o0 := outer[i]
		var o1 := outer[(i + 1) % n]
		var i0 := inner[i]
		var i1 := inner[(i + 1) % n]
		# Ön çerçeve
		st1.set_normal(Vector3.BACK)
		st1.add_vertex(Vector3(o0.x, o0.y, hz))
		st1.add_vertex(Vector3(o1.x, o1.y, hz))
		st1.add_vertex(Vector3(i1.x, i1.y, hz))
		st1.add_vertex(Vector3(o0.x, o0.y, hz))
		st1.add_vertex(Vector3(i1.x, i1.y, hz))
		st1.add_vertex(Vector3(i0.x, i0.y, hz))
		# Arka çerçeve
		st1.set_normal(Vector3.FORWARD)
		st1.add_vertex(Vector3(o0.x, o0.y, -hz))
		st1.add_vertex(Vector3(i1.x, i1.y, -hz))
		st1.add_vertex(Vector3(o1.x, o1.y, -hz))
		st1.add_vertex(Vector3(o0.x, o0.y, -hz))
		st1.add_vertex(Vector3(i0.x, i0.y, -hz))
		st1.add_vertex(Vector3(i1.x, i1.y, -hz))
		# 3D yan kenar
		var edge := o1 - o0
		var n2 := Vector2(edge.y, -edge.x).normalized()
		var n3 := Vector3(n2.x, n2.y, 0.0)
		st1.set_normal(n3)
		st1.add_vertex(Vector3(o0.x, o0.y, hz))
		st1.add_vertex(Vector3(o0.x, o0.y, -hz))
		st1.add_vertex(Vector3(o1.x, o1.y, -hz))
		st1.add_vertex(Vector3(o0.x, o0.y, hz))
		st1.add_vertex(Vector3(o1.x, o1.y, -hz))
		st1.add_vertex(Vector3(o1.x, o1.y, hz))

	# Üstteki kısa yatay kehribar erişim şeridi (ön ve arka yüzde)
	var bw := 0.09
	var bh := 0.018
	var by := hh - 0.125
	var bx := -0.025
	var fz := hz + 0.002
	st1.set_normal(Vector3.BACK)
	st1.add_vertex(Vector3(bx - bw, by - bh, fz))
	st1.add_vertex(Vector3(bx + bw, by - bh, fz))
	st1.add_vertex(Vector3(bx + bw, by + bh, fz))
	st1.add_vertex(Vector3(bx - bw, by - bh, fz))
	st1.add_vertex(Vector3(bx + bw, by + bh, fz))
	st1.add_vertex(Vector3(bx - bw, by + bh, fz))
	st1.set_normal(Vector3.FORWARD)
	st1.add_vertex(Vector3(bx - bw, by - bh, -fz))
	st1.add_vertex(Vector3(bx + bw, by + bh, -fz))
	st1.add_vertex(Vector3(bx + bw, by - bh, -fz))
	st1.add_vertex(Vector3(bx - bw, by - bh, -fz))
	st1.add_vertex(Vector3(bx - bw, by + bh, -fz))
	st1.add_vertex(Vector3(bx + bw, by + bh, -fz))
	st1.commit(mesh)

	return mesh


func _process(delta: float) -> void:
	_request_cd = maxf(0.0, _request_cd - delta)
	if not visible:
		return
	if _mesh_node and _mesh_node.visible:
		_mesh_node.rotation.y += delta * 1.45
		_mesh_node.position.y = HOVER_BASE_Y + sin(Time.get_ticks_msec() / 1000.0 * 2.4 + _bob_phase) * 0.08
	_recheck_t -= delta
	if _recheck_t > 0.0:
		return
	_recheck_t = RECHECK_INTERVAL
	# Kart yeniden belirdiğinde (düşünce) oyuncu zaten içindeyse body_entered tetiklenmez → yokla
	for body in get_overlapping_bodies():
		_try_pickup(body)


func _on_body_entered(body: Node) -> void:
	_try_pickup(body)


func _try_pickup(body: Node) -> void:
	if not visible:
		return
	if not (body is CharacterBody3D):
		return
	# Bot: SADECE host simüle eder → ağ isteği yok, doğrudan host fonksiyonu (ortak bekleme süresine dokunmaz,
	# aynı anda giren insan oyuncunun isteğini geciktirmesin). Diğer şartları handle_card_pickup da doğrular.
	if body.get("is_bot") == true:
		if NetworkManager.is_host() and not body.get("is_dead"):
			var _bot_blocked = body.get("_card_pickup_blocked")
			if _bot_blocked == null or (_bot_blocked as float) <= 0.0:
				GameManager.handle_card_pickup(int(body.get("peer_id")), card_id)
		return
	if _request_cd > 0.0:
		return
	if body.get("peer_id") != NetworkManager.get_local_id():
		return
	if body.get("is_dead"):
		return
	var _blocked = body.get("_card_pickup_blocked")
	if _blocked != null and (_blocked as float) > 0.0:
		return

	_request_cd = REQUEST_COOLDOWN
	var my_id := NetworkManager.get_local_id()
	if NetworkManager.is_host():
		GameManager.handle_card_pickup(my_id, card_id)
	else:
		GameManager.request_card_pickup.rpc_id(1, my_id, card_id)
