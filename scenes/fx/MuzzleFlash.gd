extends RefCounted
## Namlu alevi (statik, preload): atışta ~0.05 sn çapraz alev dörtgenleri (namlu boyunca -Z, additive,
## ışıksız) + ön yıldız (kameraya dönük) + kısa turuncu OmniLight (gölgesiz). Tamamen YEREL görsel.
## Performans: düğümler namlu marker'ının altında BİR KEZ kurulur, her atışta yeniden tetiklenir;
## aynı anda yanan ışık sayısı MAX_LIGHTS ile sınırlı (fazlası sadece dörtgen), kamera > LIGHT_MAX_DIST ise ışık yok.

const FX_NAME := "MuzzleFlashFx"
const FLASH_TIME := 0.05
const LIGHT_TIME := 0.06
const MAX_LIGHTS := 6
const LIGHT_MAX_DIST := 60.0
const LIGHT_COLOR := Color(1.0, 0.62, 0.28)
const LIGHT_ENERGY := 2.5
const LIGHT_RANGE := 5.0
const FLAME_LEN := 0.45     # 1.0 ölçekte alev boyu (m)
const FLAME_WIDTH := 0.22
const STAR_SIZE := 0.34

## Karakter → boy çarpanı
const SCALES := {"Sniper": 1.4, "Tank": 1.3, "Medic": 1.1, "Visioner": 1.0, "Runner": 0.7}

static var _flame_mat: ShaderMaterial = null
static var _star_mat: ShaderMaterial = null
static var _flame_mesh: QuadMesh = null
static var _star_mesh: QuadMesh = null
static var _lights: Array[OmniLight3D] = []   # şu an yanan ışıklar (sınır için)

const FLAME_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;
instance uniform float seed = 0.0;
uniform bool star = false;

float h(float x) { return fract(sin(x * 127.1 + seed * 311.7) * 43758.5453); }

void vertex() {
	if (star) {
		// Kameraya dönük (ölçek korunur)
		vec3 sc = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
		MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0] * sc.x, INV_VIEW_MATRIX[1] * sc.y, INV_VIEW_MATRIX[2] * sc.z, MODEL_MATRIX[3]);
	}
}

void fragment() {
	float a;
	vec3 core = vec3(1.0, 0.92, 0.65);
	vec3 outer = vec3(1.0, 0.45, 0.12);
	if (star) {
		vec2 p = UV - 0.5;
		float d = length(p) * 2.0;
		float ang = atan(p.y, p.x);
		float spikes = pow(abs(cos(ang * 2.5 + seed * 6.28)), 10.0) * (1.0 - d);
		a = clamp(pow(max(1.0 - d, 0.0), 2.5) * 1.4 + spikes * 1.2, 0.0, 1.0);
		ALBEDO = mix(outer, core, clamp(1.2 - d * 1.5, 0.0, 1.0)) * 2.0;
	} else {
		// UV.y: 0 = alev ucu (ileri), 1 = namlu ağzı
		float t = UV.y;
		float w = mix(0.08, 0.75, pow(t, 0.6)) * mix(0.8, 1.15, h(floor(t * 6.0)));
		float d = abs(UV.x - 0.5) * 2.0;
		a = (1.0 - smoothstep(w * 0.4, w, d)) * smoothstep(0.0, 0.35, t) * (1.0 - smoothstep(0.92, 1.0, t) * 0.4);
		ALBEDO = mix(outer, core, clamp((t - 0.4) * 1.8 - d, 0.0, 1.0)) * 2.0;
	}
	ALPHA = a;
}
"""


## Namlu marker'ında alevi tetikler (her peer, her atış)
static func flash(muzzle: Node3D, character: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if muzzle == null or not is_instance_valid(muzzle) or not muzzle.is_visible_in_tree():
		return
	var fx := muzzle.get_node_or_null(FX_NAME) as Node3D
	if fx == null:
		fx = _build_fx()
		muzzle.add_child(fx)
	var s: float = SCALES.get(character, 1.0)
	var flames := fx.get_node("Flames") as Node3D
	flames.rotation.z = randf() * TAU
	flames.scale = Vector3.ONE * s * randf_range(0.85, 1.15)
	var star := fx.get_node("Star") as GeometryInstance3D
	star.scale = Vector3.ONE * s * randf_range(0.8, 1.2)
	var sd := randf() * 100.0
	star.set_instance_shader_parameter("seed", sd)
	for q in flames.get_children():
		(q as GeometryInstance3D).set_instance_shader_parameter("seed", sd)
	fx.visible = true
	var old: Tween = fx.get_meta("tween") if fx.has_meta("tween") else null   # varsayılan null → Godot hata basar
	if old != null and old.is_valid():
		old.kill()
	var tw := fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(flames, "scale", flames.scale * 0.55, FLASH_TIME)
	tw.tween_property(star, "scale", star.scale * 0.4, FLASH_TIME)
	tw.tween_callback(flames.hide).set_delay(FLASH_TIME)
	tw.tween_callback(star.hide).set_delay(FLASH_TIME)
	flames.show()
	star.show()
	# Işık: sınır + mesafe
	var light := fx.get_node("Light") as OmniLight3D
	var cam := muzzle.get_viewport().get_camera_3d()
	var near := cam == null or cam.global_position.distance_to(muzzle.global_position) <= LIGHT_MAX_DIST
	if near and (light.visible or _lit_count() < MAX_LIGHTS):
		light.visible = true
		light.light_energy = LIGHT_ENERGY * clampf(s, 0.8, 1.3)
		if not _lights.has(light):
			_lights.append(light)
		tw.tween_property(light, "light_energy", 0.0, LIGHT_TIME)
		tw.tween_callback(_light_off.bind(light)).set_delay(LIGHT_TIME)
	else:
		_light_off(light)
	fx.set_meta("tween", tw)


## Shader/pipeline ısınması: rig altına bir alev örneği (görünür, ışık dahil)
static func prewarm(rig: Node3D) -> void:
	if DisplayServer.get_name() == "headless" or rig == null:
		return
	var fx := _build_fx()
	fx.visible = true
	(fx.get_node("Light") as OmniLight3D).visible = true
	rig.add_child(fx)


static func _lit_count() -> int:
	for i in range(_lights.size() - 1, -1, -1):
		var l := _lights[i]
		if not is_instance_valid(l) or not l.visible or not l.is_inside_tree():
			_lights.remove_at(i)
	return _lights.size()


static func _light_off(light: OmniLight3D) -> void:
	if not is_instance_valid(light):
		return
	light.visible = false
	_lights.erase(light)


static func _ensure_resources() -> void:
	if _flame_mat != null:
		return
	var sh := Shader.new()
	sh.code = FLAME_SHADER
	_flame_mat = ShaderMaterial.new()
	_flame_mat.shader = sh
	_star_mat = ShaderMaterial.new()
	_star_mat.shader = sh
	_star_mat.set_shader_parameter("star", true)
	_flame_mesh = QuadMesh.new()
	_flame_mesh.size = Vector2(FLAME_WIDTH, FLAME_LEN)
	_star_mesh = QuadMesh.new()
	_star_mesh.size = Vector2(STAR_SIZE, STAR_SIZE)


## Namlu altına kurulan düğüm: Flames (iki çapraz dörtgen, -Z boyunca) + Star + Light
static func _build_fx() -> Node3D:
	_ensure_resources()
	var fx := Node3D.new()
	fx.name = FX_NAME
	fx.visible = false
	var flames := Node3D.new()
	flames.name = "Flames"
	fx.add_child(flames)
	# QuadMesh XY düzleminde; X etrafında -90° → +Y (UV.y=0 ucu) -Z'ye bakar
	var lay := Basis(Vector3.RIGHT, -PI / 2.0)
	for i in 2:
		var q := MeshInstance3D.new()
		q.mesh = _flame_mesh
		q.material_override = _flame_mat
		q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		q.transform = Transform3D(Basis(Vector3.BACK, PI / 2.0 * i) * lay, Vector3(0, 0, -FLAME_LEN * 0.5))
		flames.add_child(q)
	var star := MeshInstance3D.new()
	star.name = "Star"
	star.mesh = _star_mesh
	star.material_override = _star_mat
	star.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	star.position = Vector3(0, 0, -0.04)
	fx.add_child(star)
	var light := OmniLight3D.new()
	light.name = "Light"
	light.light_color = LIGHT_COLOR
	light.omni_range = LIGHT_RANGE
	light.shadow_enabled = false
	light.position = Vector3(0, 0, -0.15)
	light.visible = false
	fx.add_child(light)
	return fx
