## WallLamps.gd (Map.tscn → "WallLamps" Node3D, çocukları Lamp* Marker3D)
## Duvar tepelerine monte küçük lambalar: koridora loş ışık havuzu + hafif ışık huzmesi ("sızıntı").
## Marker'ın -Z'si koridora bakar (tools/maze_lamps.py üretir; editörde taşınabilir/silinebilir/eklenebilir).
## Tipler (lamba sırasına göre deterministik — her client'ta aynı lamba aynı tipte):
##   STEADY  sıcak sodyum, çok hafif dalgalanma
##   FLICKER soğuk floresan, ara ara hızlı söner-yanar (kısa patlamalar)
##   DYING   çoğunlukla sönük, arada cızırdayarak kısa süre yanar
## Tamamen yerel görsel — ağ/oyun mantığı yok. Gölge kapalı (performans; ışık duvardan biraz sızar).

extends Node3D

enum Kind { STEADY, FLICKER, DYING }

const KIND_WEIGHTS := [55, 30, 15]
const COLORS := {
	Kind.STEADY:  Color(1.0, 0.62, 0.3),    # sodyum
	Kind.FLICKER: Color(0.78, 0.92, 1.0),   # floresan
	Kind.DYING:   Color(1.0, 0.8, 0.55),
}
const ENERGY := 1.15
const RANGE := 6.5
const LIGHT_OFFSET := 0.55   # ışık kaynağı duvar yüzünden koridora doğru (m)
const SHAFT_INTENSITY := 0.16  # huzmenin tam parlaklıktaki yoğunluğu (LightShaft.gdshader)
const SHAFT_SHADER := preload("res://scenes/world/LightShaft.gdshader")
static var _housing_mat: StandardMaterial3D = null

var _lamps: Array[Dictionary] = []
## Harita bazlı lamba gücü çarpanı (ImportedMap: MAPS "lamp_energy")
var energy_scale := 1.0   # {light, bulb_mat, shaft_mat, kind, rng, level, timer, state}


func _ready() -> void:
	rebuild()


## Marker3D çocuklarından lambaları kurar. İçe aktarılan haritalar (ImportedMap) marker'ları sonradan ekleyip tekrar çağırır.
func rebuild() -> void:
	var idx := 0
	for child in get_children():
		if child is Marker3D:
			if child.get_child_count() == 0:   # zaten kurulmuşsa tekrar kurma
				_build_lamp(child as Marker3D, idx)
			idx += 1


static var _housing_mesh: BoxMesh
static var _bulb_mesh: CylinderMesh
static var _shaft_mesh: CylinderMesh


func _build_lamp(marker: Marker3D, idx: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1000 + idx * 7919
	var kind := _pick_kind(rng)
	var color: Color = COLORS[kind]

	# Armatür: duvar tepesine oturan koyu metal gövde + koridora uzanan kısa kol (paylaşılan mesh)
	if _housing_mesh == null:
		_housing_mesh = BoxMesh.new()
		_housing_mesh.size = Vector3(0.42, 0.12, 0.34)
	var housing := MeshInstance3D.new()
	housing.mesh = _housing_mesh
	housing.position = Vector3(0, 0.12, -0.12)
	if _housing_mat == null:
		_housing_mat = StandardMaterial3D.new()
		_housing_mat.albedo_color = Color(0.13, 0.13, 0.14)
		_housing_mat.metallic = 0.6
		_housing_mat.roughness = 0.5
	housing.material_override = _housing_mat
	housing.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.add_child(housing)

	# Ampul: ışığa göre parlayan emissive küçük silindir (sarkık, paylaşılan mesh)
	if _bulb_mesh == null:
		_bulb_mesh = CylinderMesh.new()
		_bulb_mesh.top_radius = 0.07
		_bulb_mesh.bottom_radius = 0.09
		_bulb_mesh.height = 0.14
	var bulb := MeshInstance3D.new()
	bulb.mesh = _bulb_mesh
	bulb.position = Vector3(0, 0.0, -LIGHT_OFFSET * 0.55)
	var bulb_mat := StandardMaterial3D.new()
	bulb_mat.albedo_color = color
	bulb_mat.emission_enabled = true
	bulb_mat.emission = color
	bulb_mat.emission_energy_multiplier = 3.0
	bulb.material_override = bulb_mat
	bulb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.add_child(bulb)

	# Işık: koridor tarafında, duvar tepesinin biraz altında
	var light := OmniLight3D.new()
	light.position = Vector3(0, -0.2, -LIGHT_OFFSET)
	light.light_color = color
	light.light_energy = ENERGY
	light.omni_range = RANGE
	light.omni_attenuation = 1.6
	light.shadow_enabled = false
	marker.add_child(light)

	# Sızıntı huzmesi: aşağı doğru genişleyen, toplamalı (additive) saydam koni (paylaşılan mesh)
	if _shaft_mesh == null:
		_shaft_mesh = CylinderMesh.new()
		_shaft_mesh.top_radius = 0.08
		_shaft_mesh.bottom_radius = 1.25
		_shaft_mesh.height = 2.6
		_shaft_mesh.cap_top = false
		_shaft_mesh.cap_bottom = false
	var shaft := MeshInstance3D.new()
	shaft.mesh = _shaft_mesh
	shaft.position = Vector3(0, -1.35, -LIGHT_OFFSET - 0.25)
	var shaft_mat := ShaderMaterial.new()
	shaft_mat.shader = SHAFT_SHADER
	shaft_mat.set_shader_parameter("color", color)
	shaft_mat.set_shader_parameter("intensity", SHAFT_INTENSITY)
	shaft.material_override = shaft_mat
	shaft.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.add_child(shaft)

	_lamps.append({
		"light": light, "bulb_mat": bulb_mat, "shaft_mat": shaft_mat, "color": color,
		"kind": kind, "rng": rng, "level": 1.0, "target": 1.0, "timer": rng.randf_range(0.5, 4.0), "burst": 0,
	})


func _pick_kind(rng: RandomNumberGenerator) -> int:
	var roll := rng.randi_range(0, 99)
	if roll < KIND_WEIGHTS[0]:
		return Kind.STEADY
	if roll < KIND_WEIGHTS[0] + KIND_WEIGHTS[1]:
		return Kind.FLICKER
	return Kind.DYING


## Performans: titreşim 30 Hz'de güncellenir (gözle fark edilmez, ışık/shader parametresi yazımı yarıya iner) ve kameradan
## ACTIVE_DIST'ten uzak lambalar tamamen atlanır + ışıkları gizlenir (ekran ~40 m kapsar; uzak ışık kümeleme maliyeti boşuna).
const UPDATE_INTERVAL := 1.0 / 30.0
const ACTIVE_DIST := 58.0   # kameradan; ekran ~40 m kapsar, 58 m dışı ışık kümeleme maliyetini azaltır
var _acc := 0.0


func _process(delta: float) -> void:
	_acc += delta
	if _acc < UPDATE_INTERVAL:
		return
	delta = _acc
	_acc = 0.0
	var t := Time.get_ticks_msec() / 1000.0
	var cam := get_viewport().get_camera_3d()
	var cam_pos := cam.global_position if cam else Vector3.ZERO
	var max_d2 := ACTIVE_DIST * ACTIVE_DIST
	for L: Dictionary in _lamps:
		var lt := L["light"] as OmniLight3D
		if cam != null:
			var far := lt.global_position.distance_squared_to(cam_pos) > max_d2
			if lt.visible == far:
				lt.visible = not far
			if far:
				continue
		var rng: RandomNumberGenerator = L["rng"]
		var level: float
		match L["kind"]:
			Kind.STEADY:
				# Şebeke dalgalanması gibi çok hafif nefes
				level = 0.92 + 0.06 * sin(t * 1.3 + float(L["timer"])) + rng.randf_range(-0.015, 0.015)
			Kind.FLICKER:
				# Çoğunlukla açık; zamanlayıcı dolunca 2-5 hızlı söndür-yak patlaması
				L["timer"] -= delta
				if L["timer"] <= 0.0:
					if L["burst"] > 0:
						L["burst"] -= 1
						L["target"] = 0.05 if L["target"] > 0.5 else 1.0
						L["timer"] = rng.randf_range(0.03, 0.12)
					else:
						L["burst"] = rng.randi_range(3, 9)
						L["target"] = 1.0
						L["timer"] = rng.randf_range(1.5, 6.0)
				if L["burst"] == 0:
					L["target"] = 1.0
				level = L["target"] + rng.randf_range(-0.03, 0.03)
			_:
				# Ölmek üzere: çoğunlukla sönük, arada kısa cızırtılı yanma
				L["timer"] -= delta
				if L["timer"] <= 0.0:
					if L["target"] > 0.5:
						L["target"] = rng.randf_range(0.0, 0.08)
						L["timer"] = rng.randf_range(1.0, 4.0)
					else:
						L["target"] = rng.randf_range(0.6, 1.0)
						L["timer"] = rng.randf_range(0.08, 0.5)
				level = L["target"] * (1.0 if L["target"] < 0.5 else rng.randf_range(0.7, 1.0))
		# Floresan anlık söner; diğerleri hafif yumuşak geçiş (ampul filamanı)
		var smooth := 1.0 if L["kind"] == Kind.FLICKER else 1.0 - exp(-25.0 * delta)
		L["level"] = lerpf(L["level"], clampf(level, 0.0, 1.0), smooth)
		var lv: float = L["level"]
		(L["light"] as OmniLight3D).light_energy = ENERGY * lv * energy_scale
		(L["bulb_mat"] as StandardMaterial3D).emission_energy_multiplier = (0.2 + 3.0 * lv) * energy_scale
		(L["shaft_mat"] as ShaderMaterial).set_shader_parameter("intensity", SHAFT_INTENSITY * lv * energy_scale)
