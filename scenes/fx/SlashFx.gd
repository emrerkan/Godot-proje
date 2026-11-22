## SlashFx.gd — bıçak savurma kesme yayı (statik, class_name YOK — kullananlar preload eder).
## Tamamen YEREL görsel (Player.play_action(Action.STAB) çağırır; ağ yok). Headless'ta no-op.
## Karakterin önünde göğüs hizasında eğik bir hilal yayı ~0.16 sn'de soldan sağa süpürerek parlayıp söner.
## Tek QuadMesh + özel additive shader (gölgesiz, doku yok, iGPU'da neredeyse 0 maliyet).
##   spawn(tree, origin, forward)  — origin = oyuncu ayağı, forward = dünya XZ nişan yönü
##   prewarm(rig)                  — yükleme perdesi arkasında shader derlemesi

extends RefCounted

const MAX_ACTIVE := 8
const DURATION := 0.17
const ARC_SIZE := 2.35       # yay çapı (m) — 39 m kameradan net okunur
const HEIGHT := 1.25         # göğüs hizası
const FORWARD_OFFSET := 0.72 # gövdenin önü

const SLASH_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

instance uniform float progress = 0.0;   // 0..1 yaşam ilerlemesi
instance uniform float flip_x = 1.0;     // +1 veya -1 (ardışık vuruşlarda ters yön)

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	p.x *= flip_x;
	float r = length(p);
	// Hilal: dış sınır keskin (0.94), iç sınır merkeze göre kayık → ortası kalın, uçları sivri
	float outer = 1.0 - smoothstep(0.86, 0.96, r);
	float inner = smoothstep(0.56, 0.74, length(p - vec2(0.0, 0.20)));
	float crescent = outer * inner;

	// Açı: -Z ön = p.y < 0; sağdan sola süpürme (-PI/2 merkez)
	float ang = atan(p.x, -p.y);                 // -PI..PI, 0 = tam ön
	float half_arc = 1.18;                       // ~±68° yay
	float u = (ang + half_arc) / (2.0 * half_arc); // 0 sol uç → 1 sağ uç
	float in_arc = step(0.0, u) * step(u, 1.0);

	// Süpürme başı 0 → 1.25 ilerler, arkasında kısa keskin kuyruk bırakır
	float head = progress * 1.35;
	float tail_len = 0.58;
	float sweep = smoothstep(head - tail_len, head - 0.06, u) * (1.0 - smoothstep(head - 0.03, head + 0.06, u));
	float tip_fade = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.86, 1.0, u));
	float env = (1.0 - smoothstep(0.55, 1.0, progress));

	// Dış kesici kenar parlak beyaz-çelik, iç gölge soğuk gümüş-mavi
	float edge_hot = smoothstep(0.76, 0.93, r);
	vec3 col = mix(vec3(0.55, 0.72, 0.88), vec3(1.0, 0.98, 0.96), edge_hot);
	float alpha = crescent * in_arc * sweep * tip_fade * env;
	ALBEDO = col * alpha * 1.85;
}
"""

static var _mesh: QuadMesh = null
static var _mat: ShaderMaterial = null
static var _active: Array = []
static var _flip := 1.0


static func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


static func _ensure_resources() -> void:
	if _mesh != null:
		return
	var sh := Shader.new()
	sh.code = SLASH_SHADER
	_mat = ShaderMaterial.new()
	_mat.shader = sh
	_mesh = QuadMesh.new()
	_mesh.size = Vector2(ARC_SIZE, ARC_SIZE)
	_mesh.material = _mat


static func spawn(tree: SceneTree, origin: Vector3, forward: Vector3) -> void:
	if _headless() or tree == null:
		return
	var scene := tree.current_scene
	if scene == null:
		return
	_ensure_resources()

	_active = _active.filter(func(n) -> bool: return is_instance_valid(n))
	while _active.size() >= MAX_ACTIVE:
		(_active.pop_front() as Node).queue_free()

	var fwd := Vector3(forward.x, 0.0, forward.z)
	if fwd.length_squared() < 0.0001:
		fwd = Vector3.FORWARD
	fwd = fwd.normalized()

	var holder := Node3D.new()
	holder.name = "SlashFx"
	holder.position = origin + Vector3(0.0, HEIGHT, 0.0) + fwd * FORWARD_OFFSET
	holder.basis = Basis.looking_at(fwd, Vector3.UP)
	scene.add_child(holder)
	holder.reset_physics_interpolation()

	var mi := MeshInstance3D.new()
	mi.mesh = _mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Yatay düzleme yatır + hafif diyagonal kesme eğimi (yukarıdan kamerada net hilal görünür)
	_flip *= -1.0
	mi.rotation = Vector3(-PI * 0.5, 0.0, 0.22 * _flip)
	mi.set_instance_shader_parameter(&"progress", 0.0)
	mi.set_instance_shader_parameter(&"flip_x", _flip)
	holder.add_child(mi)
	_active.append(holder)

	var tw := holder.create_tween()
	tw.tween_method(func(v: float) -> void:
		if is_instance_valid(mi):
			mi.set_instance_shader_parameter(&"progress", v),
		0.0, 1.0, DURATION).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_callback(holder.queue_free)


static func prewarm(rig: Node3D) -> void:
	if _headless() or rig == null:
		return
	_ensure_resources()
	var mi := MeshInstance3D.new()
	mi.mesh = _mesh
	mi.scale = Vector3.ONE * 0.1
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.set_instance_shader_parameter(&"progress", 0.4)
	mi.set_instance_shader_parameter(&"flip_x", 1.0)
	rig.add_child(mi)
