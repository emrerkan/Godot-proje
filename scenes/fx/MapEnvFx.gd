## MapEnvFx.gd — Harita bazlı atmosferik çevre parçacıkları (toz, sis, kıvılcım, kor, spor, buhar).
## class_name YOK — kullanan preload("res://scenes/fx/MapEnvFx.gd") ile yükler.
## Tamamen YEREL görsel efekt: 3D ses yok, ağ senkronu yok, oyun mantığına dokunmaz.
## Headless modda hiçbir düğüm veya GPU kaynağı oluşturmaz.
##
## Mimari & Performans (Iris Xe iGPU 60 FPS hedefi):
## - Tüm GPUParticles3D düğümlerinde gölge kapalı (SHADOW_CASTING_SETTING_OFF).
## - Mesafe uyutması: visibility_range_end = 85.0, visibility_range_end_margin = 5.0.
## - Harita başına 10–16 yayıcı, yayıcı başına 12–24 parçacık, geniş visibility_aabb.
## - Tüm QuadMesh, ShaderMaterial ve ParticleProcessMaterial örnekleri STATİK önbellekten paylaşılır.
extends Node3D

const DUST_SHADER := preload("res://scenes/fx/spatial_fx_dust.gdshader")

const VIS_RANGE_END := 85.0
const VIS_RANGE_MARGIN := 5.0
const PLUME_AABB := AABB(Vector3(-12.0, -3.0, -12.0), Vector3(24.0, 10.0, 24.0))
const MOTE_AABB := AABB(Vector3(-14.0, -3.0, -14.0), Vector3(28.0, 10.0, 28.0))
const SPARK_AABB := AABB(Vector3(-6.0, -5.0, -6.0), Vector3(12.0, 8.0, 12.0))

const MOTE_SHADER_CODE := """
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, specular_disabled, shadows_disabled;

instance uniform float size_mult = 1.0;
instance uniform float emissive_boost = 1.0;
instance uniform float light_react = 1.0;

varying float v_age;

void vertex() {
	v_age = clamp(INSTANCE_CUSTOM.y, 0.0, 1.0);
	float ang = INSTANCE_CUSTOM.x;
	mat4 mat_world = mat4(
		normalize(INV_VIEW_MATRIX[0]),
		normalize(INV_VIEW_MATRIX[1]),
		normalize(INV_VIEW_MATRIX[2]),
		MODEL_MATRIX[3]
	);
	mat_world = mat_world * mat4(
		vec4(cos(ang), -sin(ang), 0.0, 0.0),
		vec4(sin(ang), cos(ang), 0.0, 0.0),
		vec4(0.0, 0.0, 1.0, 0.0),
		vec4(0.0, 0.0, 0.0, 1.0)
	);
	float sc = length(MODEL_MATRIX[0].xyz) * size_mult;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat_world * mat4(
		vec4(sc, 0.0, 0.0, 0.0),
		vec4(0.0, sc, 0.0, 0.0),
		vec4(0.0, 0.0, sc, 0.0),
		vec4(0.0, 0.0, 0.0, 1.0)
	);
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float core = 1.0 - smoothstep(0.0, 0.45, r);
	float halo = 1.0 - smoothstep(0.0, 1.0, r);
	float mask = (core * 0.65 + halo * halo * 0.35) * COLOR.a;
	ALBEDO = COLOR.rgb * mask;
	ALPHA = clamp(mask, 0.0, 1.0);
	EMISSION = COLOR.rgb * mask * emissive_boost;
}

void light() {
	DIFFUSE_LIGHT += ATTENUATION * LIGHT_COLOR * light_react / PI;
}
"""

static var _initialized: bool = false
static var _mesh_plume: QuadMesh = null
static var _mesh_mote: QuadMesh = null

# Paylaşımlı süreç malzemeleri (ParticleProcessMaterial)
static var _pm_desert_sand: ParticleProcessMaterial = null
static var _pm_wreck_smoke: ParticleProcessMaterial = null
static var _pm_wreck_ember: ParticleProcessMaterial = null
static var _pm_forest_mist: ParticleProcessMaterial = null
static var _pm_forest_spores: ParticleProcessMaterial = null
static var _pm_hospital_steam: ParticleProcessMaterial = null
static var _pm_elec_sparks: ParticleProcessMaterial = null
static var _pm_room_motes: ParticleProcessMaterial = null
static var _pm_subway_mist: ParticleProcessMaterial = null
static var _pm_port_spray: ParticleProcessMaterial = null
static var _pm_port_exhaust: ParticleProcessMaterial = null
static var _pm_quantum_vapor: ParticleProcessMaterial = null
static var _pm_quantum_plasma: ParticleProcessMaterial = null
static var _pm_floor_haze: ParticleProcessMaterial = null


## Harita köküne (map_root) map_id temasına uygun GPUParticles3D yayıcıları kurar ve kök düğümü döndürür.
static func setup(map_root: Node3D, map_id: String, bounds: AABB, lamp_nodes: Array = []) -> Node3D:
	if map_root == null or DisplayServer.get_name() == "headless":
		return null
	_ensure_resources()

	var old := map_root.get_node_or_null("MapEnvFx")
	if old != null:
		map_root.remove_child(old)
		old.queue_free()

	var root := new()
	root.name = "MapEnvFx"
	map_root.add_child(root)

	var clean_id := map_id.strip_edges().to_lower()
	var safe_bounds := _sanitize_bounds(bounds)

	match clean_id:
		"desert", "desert_v3":
			_build_desert(root, safe_bounds)
		"forest", "forest_v3":
			_build_forest(root, safe_bounds)
		"hospital", "hospital_v3":
			_build_hospital(root, safe_bounds, lamp_nodes)
		"subway", "subway_v3":
			_build_subway(root, safe_bounds, lamp_nodes)
		"port", "port_v3":
			_build_port(root, safe_bounds)
		"quantum", "quantum_v3":
			_build_quantum(root, safe_bounds)
		_:
			# "maze", "embassy", "warehouse" ve diğer iç/dış mekan haritaları
			_build_default_interior(root, safe_bounds, lamp_nodes)

	return root


## ImportedMap._prewarm_render() sırasında shader derleme takılmasını önlemek için küçük yayıcılar ekler.
static func prewarm(rig: Node3D) -> void:
	if rig == null or DisplayServer.get_name() == "headless":
		return
	_ensure_resources()

	var p_plume := GPUParticles3D.new()
	p_plume.name = "MapEnvPlumePrewarm"
	p_plume.amount = 2
	p_plume.lifetime = 0.6
	p_plume.one_shot = false
	p_plume.local_coords = true
	p_plume.process_material = _pm_desert_sand
	p_plume.draw_pass_1 = _mesh_plume
	p_plume.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p_plume.visibility_aabb = PLUME_AABB
	p_plume.scale = Vector3.ONE * 0.2
	rig.add_child(p_plume)
	p_plume.set_instance_shader_parameter(&"size_mult", 0.35)
	p_plume.set_instance_shader_parameter(&"seed", 1.0)
	p_plume.emitting = true

	var p_mote := GPUParticles3D.new()
	p_mote.name = "MapEnvMotePrewarm"
	p_mote.amount = 2
	p_mote.lifetime = 0.6
	p_mote.one_shot = false
	p_mote.local_coords = true
	p_mote.process_material = _pm_wreck_ember
	p_mote.draw_pass_1 = _mesh_mote
	p_mote.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p_mote.visibility_aabb = MOTE_AABB
	p_mote.scale = Vector3.ONE * 0.2
	rig.add_child(p_mote)
	p_mote.set_instance_shader_parameter(&"size_mult", 0.25)
	p_mote.set_instance_shader_parameter(&"emissive_boost", 1.5)
	p_mote.set_instance_shader_parameter(&"light_react", 1.0)
	p_mote.emitting = true


# ─────────────────────────────────────────────
# TEMA KURUCULARI (8–16 yayıcı / harita)
# ─────────────────────────────────────────────

static func _build_desert(root: Node3D, bounds: AABB) -> void:
	# 11 alçak çöl kumu / toz tutamı bölgesi (Y = 0.25..1.4m, sıcak kum rengi Color(0.76, 0.64, 0.48))
	var sand_zones: Array[Vector3] = [
		Vector3(-46.0, 0.55, -28.0),
		Vector3(-22.0, 0.50, -30.0),
		Vector3(18.0, 0.55, -28.0),
		Vector3(44.0, 0.60, -24.0),
		Vector3(-50.0, 0.50, 2.0),
		Vector3(-30.0, 0.65, 6.0),
		Vector3(30.0, 0.65, -4.0),
		Vector3(50.0, 0.55, 8.0),
		Vector3(-42.0, 0.55, 28.0),
		Vector3(-8.0, 0.50, 30.0),
		Vector3(36.0, 0.60, 28.0),
	]
	for i in sand_zones.size():
		var pos := _clamp_to_bounds(sand_zones[i], bounds, 0.35, 1.2)
		_spawn_plume(root, "DesertSand_%d" % i, pos, _pm_desert_sand, 16, 4.2, 2.35, float(i) * 7.13)

	# Merkez enkaz alanı (X in [-24, 24], Z in [-10, 10]): yükselen kor kıvılcımlar + koyu duman tutamları
	var ember_zones: Array[Vector3] = [
		Vector3(-14.0, 0.45, -3.5),
		Vector3(0.0, 0.55, 2.0),
		Vector3(15.0, 0.45, -2.0),
	]
	for i in ember_zones.size():
		var epos := ember_zones[i]
		_spawn_mote(root, "WreckEmber_%d" % i, epos, _pm_wreck_ember, 18, 2.6, 0.14, 2.6, 0.4, SPARK_AABB)

	var smoke_zones: Array[Vector3] = [
		Vector3(-10.0, 0.75, -2.5),
		Vector3(11.0, 0.75, 1.5),
	]
	for i in smoke_zones.size():
		_spawn_plume(root, "WreckSmoke_%d" % i, smoke_zones[i], _pm_wreck_smoke, 14, 4.5, 2.1, 41.0 + float(i) * 11.3)


static func _build_forest(root: Node3D, bounds: AABB) -> void:
	# İki dere vadisi boyunca alçak sürünen dere sisi (X ≈ -30 ve X ≈ +30, Z in [-34, 34])
	var stream_z: Array[float] = [-27.0, -9.0, 9.0, 27.0]
	var idx := 0
	for x_side: float in [-30.0, 30.0]:
		for z_val: float in stream_z:
			var pos := _clamp_to_bounds(Vector3(x_side, 0.45, z_val), bounds, 0.35, 1.0)
			_spawn_plume(root, "StreamMist_%d" % idx, pos, _pm_forest_mist, 16, 5.2, 2.6, float(idx) * 9.7)
			idx += 1

	# Fener ışığını yakalayan orman sporları / polen zerreleri (6 bölge -> toplam 14 yayıcı)
	var spore_zones: Array[Vector3] = [
		Vector3(-16.0, 1.35, -20.0),
		Vector3(16.0, 1.35, -20.0),
		Vector3(-44.0, 1.40, 0.0),
		Vector3(0.0, 1.30, 0.0),
		Vector3(44.0, 1.40, 0.0),
		Vector3(0.0, 1.35, 22.0),
	]
	for i in spore_zones.size():
		var spos := _clamp_to_bounds(spore_zones[i], bounds, 1.1, 2.0)
		_spawn_mote(root, "ForestSpores_%d" % i, spos, _pm_forest_spores, 20, 5.5, 0.13, 0.38, 2.2, MOTE_AABB)


static func _build_hospital(root: Node3D, bounds: AABB, lamp_nodes: Array) -> void:
	# Karantina havalandırma sisi / kriyo-buhar (soğuk klinik soluk camgöbeği-beyaz Color(0.68, 0.82, 0.86))
	var steam_zones: Array[Vector3] = [
		Vector3(-22.0, 0.45, -18.0),
		Vector3(0.0, 0.45, -20.0),
		Vector3(22.0, 0.45, -18.0),
		Vector3(-24.0, 0.45, 4.0),
		Vector3(24.0, 0.45, 4.0),
		Vector3(-18.0, 0.45, 20.0),
		Vector3(18.0, 0.45, 20.0),
	]
	for i in steam_zones.size():
		var pos := _clamp_to_bounds(steam_zones[i], bounds, 0.3, 1.2)
		_spawn_plume(root, "CryoSteam_%d" % i, pos, _pm_hospital_steam, 14, 4.4, 1.85, float(i) * 6.3)

	# Bozuk ekipman / koridorlardan damlayan elektrik kıvılcımları (yerçekimli parlak kehribar-beyaz mikro kıvılcım)
	var spark_zones: Array[Vector3] = [
		Vector3(-12.0, 2.7, -8.0),
		Vector3(14.0, 2.7, -4.0),
		Vector3(-6.0, 2.7, 12.0),
		Vector3(11.0, 2.7, 15.0),
	]
	for i in spark_zones.size():
		var sp_pos := _pick_lamp_or_fallback(lamp_nodes, i, spark_zones[i], bounds, 2.5)
		_spawn_mote(root, "FaultSparks_%d" % i, sp_pos, _pm_elec_sparks, 12, 1.15, 0.11, 3.2, 0.3, SPARK_AABB)

	# Odalarda asılı kalan havadaki toz zerreleri
	var mote_zones: Array[Vector3] = [
		Vector3(-16.0, 1.4, -4.0),
		Vector3(0.0, 1.4, 0.0),
		Vector3(16.0, 1.4, -4.0),
		Vector3(0.0, 1.4, 16.0),
	]
	for i in mote_zones.size():
		var mpos := _clamp_to_bounds(mote_zones[i], bounds, 1.2, 2.0)
		_spawn_mote(root, "WardMotes_%d" % i, mpos, _pm_room_motes, 18, 6.0, 0.11, 0.16, 2.3, MOTE_AABB)


static func _build_subway(root: Node3D, bounds: AABB, lamp_nodes: Array) -> void:
	# Yeraltı nemli sis & ray yakınında elektrik kıvılcımları + toz zerreleri (toplam 14 yayıcı)
	var mist_zones: Array[Vector3] = [
		Vector3(-28.0, 0.4, -14.0),
		Vector3(0.0, 0.4, -16.0),
		Vector3(28.0, 0.4, -14.0),
		Vector3(-22.0, 0.4, 2.0),
		Vector3(22.0, 0.4, 2.0),
		Vector3(-26.0, 0.4, 16.0),
		Vector3(0.0, 0.4, 16.0),
		Vector3(26.0, 0.4, 16.0),
	]
	for i in mist_zones.size():
		var pos := _clamp_to_bounds(mist_zones[i], bounds, 0.3, 1.0)
		_spawn_plume(root, "SubwayMist_%d" % i, pos, _pm_subway_mist, 15, 4.8, 2.1, float(i) * 8.1)

	var track_sparks: Array[Vector3] = [
		Vector3(-18.0, 1.8, -2.0),
		Vector3(4.0, 2.2, -6.0),
		Vector3(19.0, 1.8, 4.0),
	]
	for i in track_sparks.size():
		var sp_pos := _pick_lamp_or_fallback(lamp_nodes, i, track_sparks[i], bounds, 2.0)
		_spawn_mote(root, "TrackSparks_%d" % i, sp_pos, _pm_elec_sparks, 12, 1.1, 0.11, 3.0, 0.3, SPARK_AABB)

	var mote_zones: Array[Vector3] = [
		Vector3(-14.0, 1.4, 0.0),
		Vector3(0.0, 1.4, 2.0),
		Vector3(14.0, 1.4, 0.0),
	]
	for i in mote_zones.size():
		var mpos := _clamp_to_bounds(mote_zones[i], bounds, 1.1, 2.0)
		_spawn_mote(root, "SubwayMotes_%d" % i, mpos, _pm_room_motes, 18, 5.8, 0.11, 0.18, 2.2, MOTE_AABB)


static func _build_port(root: Node3D, bounds: AABB) -> void:
	# Deniz serpintisi / nemli rıhtım sisi (9 bölge) + gemi güvertesi ve vinçlerde endüstriyel buhar/egzoz (5 bölge)
	var spray_zones: Array[Vector3] = [
		Vector3(-36.0, 0.5, -24.0),
		Vector3(-12.0, 0.5, -26.0),
		Vector3(14.0, 0.5, -26.0),
		Vector3(36.0, 0.5, -24.0),
		Vector3(-38.0, 0.5, 0.0),
		Vector3(38.0, 0.5, 0.0),
		Vector3(-32.0, 0.5, 24.0),
		Vector3(0.0, 0.5, 26.0),
		Vector3(32.0, 0.5, 24.0),
	]
	for i in spray_zones.size():
		var pos := _clamp_to_bounds(spray_zones[i], bounds, 0.35, 1.1)
		_spawn_plume(root, "SeaSpray_%d" % i, pos, _pm_port_spray, 16, 4.6, 2.35, float(i) * 5.9)

	var exhaust_zones: Array[Vector3] = [
		Vector3(-18.0, 1.2, -6.0),
		Vector3(0.0, 1.3, -8.0),
		Vector3(18.0, 1.2, -4.0),
		Vector3(-14.0, 1.1, 12.0),
		Vector3(16.0, 1.1, 12.0),
	]
	for i in exhaust_zones.size():
		var epos := _clamp_to_bounds(exhaust_zones[i], bounds, 0.8, 2.2)
		_spawn_plume(root, "DockExhaust_%d" % i, epos, _pm_port_exhaust, 14, 3.8, 1.9, 50.0 + float(i) * 7.7)


static func _build_quantum(root: Node3D, bounds: AABB) -> void:
	# Yeraltı soğutucu buharı (8 bölge) + merkez ve kadranlarda reaktör plazma zerreleri (6 bölge)
	var vapor_zones: Array[Vector3] = [
		Vector3(-10.0, 0.45, -10.0),
		Vector3(10.0, 0.45, -10.0),
		Vector3(-10.0, 0.45, 10.0),
		Vector3(10.0, 0.45, 10.0),
		Vector3(-26.0, 0.45, -20.0),
		Vector3(26.0, 0.45, -20.0),
		Vector3(-26.0, 0.45, 20.0),
		Vector3(26.0, 0.45, 20.0),
	]
	for i in vapor_zones.size():
		var pos := _clamp_to_bounds(vapor_zones[i], bounds, 0.3, 1.1)
		_spawn_plume(root, "CoolantVapor_%d" % i, pos, _pm_quantum_vapor, 15, 4.5, 2.0, float(i) * 10.3)

	var plasma_zones: Array[Vector3] = [
		Vector3(0.0, 1.3, 0.0),
		Vector3(0.0, 2.1, 0.0),
		Vector3(-18.0, 1.3, -16.0),
		Vector3(18.0, 1.3, -16.0),
		Vector3(-18.0, 1.3, 16.0),
		Vector3(18.0, 1.3, 16.0),
	]
	for i in plasma_zones.size():
		var ppos := _clamp_to_bounds(plasma_zones[i], bounds, 1.0, 2.5)
		_spawn_mote(root, "PlasmaMotes_%d" % i, ppos, _pm_quantum_plasma, 18, 4.2, 0.14, 2.4, 1.2, MOTE_AABB)


static func _build_default_interior(root: Node3D, bounds: AABB, lamp_nodes: Array) -> void:
	# "maze", "embassy", "warehouse" ve varsayılan haritalar:
	# Fener huzmelerini yakalayan asılı toz zerreleri (7 bölge) + hafif zemin sisi (6 bölge)
	var haze_zones: Array[Vector3] = [
		Vector3(-22.0, 0.4, -18.0),
		Vector3(22.0, 0.4, -18.0),
		Vector3(-24.0, 0.4, 0.0),
		Vector3(24.0, 0.4, 0.0),
		Vector3(-20.0, 0.4, 18.0),
		Vector3(20.0, 0.4, 18.0),
	]
	for i in haze_zones.size():
		var pos := _clamp_to_bounds(haze_zones[i], bounds, 0.3, 0.9)
		_spawn_plume(root, "FloorHaze_%d" % i, pos, _pm_floor_haze, 14, 5.0, 2.0, float(i) * 12.1)

	var mote_zones: Array[Vector3] = [
		Vector3(-18.0, 1.4, -14.0),
		Vector3(0.0, 1.4, -16.0),
		Vector3(18.0, 1.4, -14.0),
		Vector3(-14.0, 1.4, 0.0),
		Vector3(0.0, 1.4, 0.0),
		Vector3(14.0, 1.4, 0.0),
		Vector3(0.0, 1.4, 16.0),
	]
	for i in mote_zones.size():
		var fallback := mote_zones[i]
		var mpos := _pick_lamp_or_fallback(lamp_nodes, i, fallback, bounds, 1.4)
		_spawn_mote(root, "DustMotes_%d" % i, mpos, _pm_room_motes, 18, 6.0, 0.11, 0.16, 2.4, MOTE_AABB)


# ─────────────────────────────────────────────
# YAYICI OLUŞTURUCULAR & YARDIMCILAR
# ─────────────────────────────────────────────

static func _spawn_plume(
	parent: Node3D,
	node_name: String,
	pos: Vector3,
	pm: ParticleProcessMaterial,
	amount: int,
	lifetime: float,
	size_mult: float,
	seed_val: float
) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = node_name
	p.position = pos
	p.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	p.amount = amount
	p.lifetime = lifetime
	p.one_shot = false
	p.preprocess = 1.5
	p.explosiveness = 0.0
	p.randomness = 0.25
	p.fixed_fps = 30
	p.local_coords = true
	p.process_material = pm
	p.draw_pass_1 = _mesh_plume
	p.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_range_end = VIS_RANGE_END
	p.visibility_range_end_margin = VIS_RANGE_MARGIN
	p.visibility_aabb = PLUME_AABB
	parent.add_child(p)
	p.set_instance_shader_parameter(&"size_mult", size_mult)
	p.set_instance_shader_parameter(&"seed", seed_val)
	p.emitting = true
	return p


static func _spawn_mote(
	parent: Node3D,
	node_name: String,
	pos: Vector3,
	pm: ParticleProcessMaterial,
	amount: int,
	lifetime: float,
	size_mult: float,
	emissive_boost: float,
	light_react: float,
	aabb: AABB
) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = node_name
	p.position = pos
	p.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	p.amount = amount
	p.lifetime = lifetime
	p.one_shot = false
	p.preprocess = 1.2
	p.explosiveness = 0.0
	p.randomness = 0.35
	p.fixed_fps = 30
	p.local_coords = true
	p.process_material = pm
	p.draw_pass_1 = _mesh_mote
	p.draw_order = GPUParticles3D.DRAW_ORDER_INDEX
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_range_end = VIS_RANGE_END
	p.visibility_range_end_margin = VIS_RANGE_MARGIN
	p.visibility_aabb = aabb
	parent.add_child(p)
	p.set_instance_shader_parameter(&"size_mult", size_mult)
	p.set_instance_shader_parameter(&"emissive_boost", emissive_boost)
	p.set_instance_shader_parameter(&"light_react", light_react)
	p.emitting = true
	return p


static func _sanitize_bounds(bounds: AABB) -> AABB:
	if bounds.size.x < 8.0 or bounds.size.z < 8.0:
		return AABB(Vector3(-55.0, 0.0, -40.0), Vector3(110.0, 12.0, 80.0))
	return bounds


static func _clamp_to_bounds(pos: Vector3, bounds: AABB, min_y: float, max_y: float) -> Vector3:
	var margin_x := minf(4.0, bounds.size.x * 0.1)
	var margin_z := minf(4.0, bounds.size.z * 0.1)
	var x0 := bounds.position.x + margin_x
	var x1 := bounds.position.x + bounds.size.x - margin_x
	var z0 := bounds.position.z + margin_z
	var z1 := bounds.position.z + bounds.size.z - margin_z
	return Vector3(
		clampf(pos.x, minf(x0, x1), maxf(x0, x1)),
		clampf(pos.y, min_y, max_y),
		clampf(pos.z, minf(z0, z1), maxf(z0, z1))
	)


static func _pick_lamp_or_fallback(
	lamp_nodes: Array,
	idx: int,
	fallback: Vector3,
	bounds: AABB,
	target_y: float
) -> Vector3:
	if not lamp_nodes.is_empty():
		var step := maxi(1, lamp_nodes.size() / 4)
		var candidate_idx := (idx * step) % lamp_nodes.size()
		var item: Variant = lamp_nodes[candidate_idx]
		if item is Node3D:
			var n3 := item as Node3D
			var lp := n3.position
			return _clamp_to_bounds(Vector3(lp.x, target_y, lp.z), bounds, 0.5, 3.4)
		elif item is Vector3:
			var v3 := item as Vector3
			return _clamp_to_bounds(Vector3(v3.x, target_y, v3.z), bounds, 0.5, 3.4)
	return _clamp_to_bounds(fallback, bounds, 0.5, 3.4)


# ─────────────────────────────────────────────
# STATİK KAYNAK ÖNBELLEĞİ
# ─────────────────────────────────────────────

static func _ensure_resources() -> void:
	if _initialized:
		return
	_initialized = true

	# 1. Plume / Sis / Kum / Buhar QuadMesh (spatial_fx_dust.gdshader)
	var fnl := FastNoiseLite.new()
	fnl.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	fnl.frequency = 0.011
	fnl.fractal_type = FastNoiseLite.FRACTAL_FBM
	fnl.fractal_octaves = 3
	fnl.fractal_gain = 0.55
	var noise := NoiseTexture2D.new()
	noise.width = 128
	noise.height = 128
	noise.seamless = true
	noise.generate_mipmaps = true
	noise.normalize = true
	noise.noise = fnl

	var plume_mat := ShaderMaterial.new()
	plume_mat.shader = DUST_SHADER
	plume_mat.set_shader_parameter(&"noise_tex", noise)
	# Beyaz taban: her ParticleProcessMaterial kendi color/color_ramp rengiyle renklendirir
	plume_mat.set_shader_parameter(&"dust_color", Vector3(1.0, 1.0, 1.0))
	plume_mat.set_shader_parameter(&"emission_floor", 0.04)
	plume_mat.set_shader_parameter(&"light_gain", 1.15)
	plume_mat.set_shader_parameter(&"density", 0.72)
	plume_mat.set_shader_parameter(&"soft_dist", 0.55)
	plume_mat.set_shader_parameter(&"camera_pull", 0.15)

	_mesh_plume = QuadMesh.new()
	_mesh_plume.size = Vector2(1.0, 1.0)
	_mesh_plume.material = plume_mat

	# 2. Mote / Kor / Kıvılcım / Spor QuadMesh (hafif prosedürel parlama shader'ı)
	var mote_shader := Shader.new()
	mote_shader.code = MOTE_SHADER_CODE
	var mote_mat := ShaderMaterial.new()
	mote_mat.shader = mote_shader

	_mesh_mote = QuadMesh.new()
	_mesh_mote.size = Vector2(1.0, 1.0)
	_mesh_mote.material = mote_mat

	# Ortak ölçek eğrileri
	var plume_scale := _make_curve([
		Vector2(0.0, 0.55),
		Vector2(0.3, 0.92),
		Vector2(0.75, 1.0),
		Vector2(1.0, 0.85),
	])
	var mote_scale := _make_curve([
		Vector2(0.0, 0.2),
		Vector2(0.25, 1.0),
		Vector2(0.75, 0.9),
		Vector2(1.0, 0.0),
	])

	# Çöl kumu tutamları: Y = 0.25..1.4m, sıcak kum rengi Color(0.76, 0.64, 0.48)
	_pm_desert_sand = _make_plume_pm(
		Color(0.76, 0.64, 0.48),
		0.34,
		Vector3(9.5, 0.45, 7.5),
		Vector3(1.0, 0.06, 0.25).normalized(),
		22.0,
		1.4,
		2.8,
		Vector3(0.0, 0.04, 0.0),
		plume_scale
	)

	# Enkaz koyu duman tutamı
	_pm_wreck_smoke = _make_plume_pm(
		Color(0.24, 0.22, 0.20),
		0.42,
		Vector3(4.5, 0.4, 3.5),
		Vector3(0.35, 1.0, 0.15).normalized(),
		26.0,
		0.65,
		1.35,
		Vector3(0.15, 0.32, 0.05),
		plume_scale
	)

	# Enkaz kor/kül kıvılcımları (turuncu-kehribar yükselen korlar)
	_pm_wreck_ember = _make_mote_pm(
		Color(1.0, 0.48, 0.12),
		Color(0.95, 0.22, 0.04),
		0.95,
		Vector3(5.5, 0.35, 4.0),
		Vector3(0.25, 1.0, 0.1).normalized(),
		35.0,
		0.8,
		1.9,
		Vector3(0.25, 0.55, 0.08),
		mote_scale
	)

	# Orman dere sisi: soğuk camgöbeği-gri Color(0.55, 0.72, 0.76)
	_pm_forest_mist = _make_plume_pm(
		Color(0.55, 0.72, 0.76),
		0.32,
		Vector3(5.5, 0.35, 8.5),
		Vector3(0.15, 0.05, 1.0).normalized(),
		30.0,
		0.35,
		0.85,
		Vector3(0.0, 0.02, 0.0),
		plume_scale
	)

	# Orman sporları / polenler
	_pm_forest_spores = _make_mote_pm(
		Color(0.72, 0.92, 0.62),
		Color(0.48, 0.78, 0.58),
		0.78,
		Vector3(9.0, 1.1, 9.0),
		Vector3(0.2, 1.0, 0.2).normalized(),
		75.0,
		0.12,
		0.36,
		Vector3(0.03, 0.04, 0.02),
		mote_scale
	)

	# Hastane kriyo-buhar / karantina havalandırma sisi: Color(0.68, 0.82, 0.86)
	_pm_hospital_steam = _make_plume_pm(
		Color(0.68, 0.82, 0.86),
		0.30,
		Vector3(5.0, 0.35, 5.0),
		Vector3(0.2, 0.35, 0.9).normalized(),
		40.0,
		0.35,
		0.85,
		Vector3(0.0, -0.04, 0.0),
		plume_scale
	)

	# Arızalı elektrik kıvılcımları (yerçekimli parlak kehribar-beyaz mikro kıvılcımlar)
	_pm_elec_sparks = _make_mote_pm(
		Color(1.0, 0.88, 0.55),
		Color(1.0, 0.45, 0.10),
		0.98,
		Vector3(0.45, 0.15, 0.45),
		Vector3(0.0, -1.0, 0.0),
		48.0,
		1.2,
		2.8,
		Vector3(0.0, -6.5, 0.0),
		mote_scale
	)

	# Oda / koridor asılı toz zerreleri (fener ışığını yakalar)
	_pm_room_motes = _make_mote_pm(
		Color(0.85, 0.84, 0.78),
		Color(0.68, 0.66, 0.62),
		0.65,
		Vector3(8.0, 1.2, 8.0),
		Vector3(0.0, 1.0, 0.0),
		90.0,
		0.08,
		0.24,
		Vector3(0.01, 0.01, 0.01),
		mote_scale
	)

	# Metro yeraltı nemli sisi
	_pm_subway_mist = _make_plume_pm(
		Color(0.56, 0.64, 0.68),
		0.30,
		Vector3(6.5, 0.35, 5.5),
		Vector3(1.0, 0.05, 0.15).normalized(),
		32.0,
		0.35,
		0.85,
		Vector3(0.0, 0.01, 0.0),
		plume_scale
	)

	# Liman deniz serpintisi / rıhtım sisi
	_pm_port_spray = _make_plume_pm(
		Color(0.62, 0.75, 0.80),
		0.32,
		Vector3(7.5, 0.45, 7.5),
		Vector3(0.8, 0.12, 0.55).normalized(),
		28.0,
		0.7,
		1.5,
		Vector3(0.05, 0.03, 0.04),
		plume_scale
	)

	# Liman gemi / vinç endüstriyel buhar ve egzoz
	_pm_port_exhaust = _make_plume_pm(
		Color(0.52, 0.56, 0.60),
		0.36,
		Vector3(3.5, 0.4, 3.5),
		Vector3(0.25, 1.0, 0.2).normalized(),
		24.0,
		0.6,
		1.3,
		Vector3(0.1, 0.28, 0.05),
		plume_scale
	)

	# Quantum soğutucu buharı
	_pm_quantum_vapor = _make_plume_pm(
		Color(0.46, 0.78, 0.88),
		0.32,
		Vector3(5.5, 0.35, 5.5),
		Vector3(0.2, 0.25, 0.95).normalized(),
		38.0,
		0.35,
		0.85,
		Vector3(0.0, 0.03, 0.0),
		plume_scale
	)

	# Quantum reaktör plazma zerreleri
	_pm_quantum_plasma = _make_mote_pm(
		Color(0.35, 0.88, 1.0),
		Color(0.52, 0.38, 1.0),
		0.92,
		Vector3(5.5, 1.2, 5.5),
		Vector3(0.0, 1.0, 0.0),
		65.0,
		0.22,
		0.65,
		Vector3(0.0, 0.18, 0.0),
		mote_scale
	)

	# Varsayılan iç mekan (maze, embassy, warehouse) hafif zemin sisi
	_pm_floor_haze = _make_plume_pm(
		Color(0.62, 0.64, 0.66),
		0.24,
		Vector3(6.5, 0.35, 6.5),
		Vector3(0.7, 0.05, 0.7).normalized(),
		40.0,
		0.25,
		0.65,
		Vector3(0.0, 0.01, 0.0),
		plume_scale
	)


static func _make_curve(points: Array[Vector2]) -> CurveTexture:
	var c := Curve.new()
	for pt in points:
		c.add_point(pt)
	var ct := CurveTexture.new()
	ct.curve = c
	return ct


static func _make_plume_pm(
	tint: Color,
	peak_alpha: float,
	box_extents: Vector3,
	dir: Vector3,
	spread_deg: float,
	vel_min: float,
	vel_max: float,
	grav: Vector3,
	scale_curve: CurveTexture
) -> ParticleProcessMaterial:
	var ramp := Gradient.new()
	ramp.set_offset(0, 0.0)
	ramp.set_color(0, Color(tint.r, tint.g, tint.b, 0.0))
	ramp.set_offset(1, 1.0)
	ramp.set_color(1, Color(tint.r * 0.9, tint.g * 0.9, tint.b * 0.9, 0.0))
	ramp.add_point(0.22, Color(tint.r, tint.g, tint.b, peak_alpha))
	ramp.add_point(0.68, Color(tint.r * 0.95, tint.g * 0.95, tint.b * 0.95, peak_alpha * 0.65))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp

	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = box_extents
	pm.direction = dir
	pm.spread = spread_deg
	pm.initial_velocity_min = vel_min
	pm.initial_velocity_max = vel_max
	pm.gravity = grav
	pm.damping_min = 0.25
	pm.damping_max = 0.65
	pm.angle_min = 0.0
	pm.angle_max = 360.0
	pm.angular_velocity_min = -18.0
	pm.angular_velocity_max = 18.0
	pm.scale_min = 0.78
	pm.scale_max = 1.25
	pm.scale_curve = scale_curve
	pm.color_ramp = ramp_tex
	pm.lifetime_randomness = 0.25
	return pm


static func _make_mote_pm(
	col_start: Color,
	col_end: Color,
	peak_alpha: float,
	box_extents: Vector3,
	dir: Vector3,
	spread_deg: float,
	vel_min: float,
	vel_max: float,
	grav: Vector3,
	scale_curve: CurveTexture
) -> ParticleProcessMaterial:
	var ramp := Gradient.new()
	ramp.set_offset(0, 0.0)
	ramp.set_color(0, Color(col_start.r, col_start.g, col_start.b, 0.0))
	ramp.set_offset(1, 1.0)
	ramp.set_color(1, Color(col_end.r, col_end.g, col_end.b, 0.0))
	ramp.add_point(0.18, Color(col_start.r, col_start.g, col_start.b, peak_alpha))
	ramp.add_point(0.72, Color(col_end.r, col_end.g, col_end.b, peak_alpha * 0.75))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp

	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = box_extents
	pm.direction = dir
	pm.spread = spread_deg
	pm.initial_velocity_min = vel_min
	pm.initial_velocity_max = vel_max
	pm.gravity = grav
	pm.damping_min = 0.15
	pm.damping_max = 0.45
	pm.angle_min = 0.0
	pm.angle_max = 360.0
	pm.angular_velocity_min = -35.0
	pm.angular_velocity_max = 35.0
	pm.scale_min = 0.75
	pm.scale_max = 1.35
	pm.scale_curve = scale_curve
	pm.color_ramp = ramp_tex
	pm.lifetime_randomness = 0.30
	return pm
