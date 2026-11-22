## DeathFlash.gd — ölüm anında ölüm noktasında kısa kırmızı ışık patlaması (statik, class_name YOK — kullananlar preload eder)
## Tamamen YEREL görsel (Player._apply_death call_local RPC → her peer kendi çağırır). Headless'ta hiçbir şey yapmaz.
## Gölgesiz tek OmniLight3D: ~0.03 sn'de tepeye çıkar, sonra üstel söner (toplam ~0.18 sn), bitince silinir.
## Performans: aynı anda en fazla MAX_LIGHTS ışık, fazlası atlanır; yeni shader varyantı gerektirmez.
##   burst(tree, pos)  — pos = ölüm noktası (oyuncu ayak konumu; ışık göğüs yüksekliğine kaldırılır)
##   prewarm(rig)      — yükleme perdesi arkasında bir kez kısa süre ışık örneği (ImportedMap._prewarm_render'a bağlanabilir)

extends RefCounted

const MAX_LIGHTS := 4
const COLOR := Color(0.95, 0.14, 0.10)
const ENERGY_PEAK := 3.6
const RANGE := 4.2
const HEIGHT := 1.0               # göğüs yüksekliği (pos'a eklenir)
const RISE_TIME := 0.03
const DECAY_TIME := 0.19          # toplam ~0.22 sn — yumuşak, sinematik kızıl parlama

static var _lights: Array = []   # tipsiz: silinmiş düğümler de durabilir (is_instance_valid ile ayıklanır)


static func _headless() -> bool:
	return DisplayServer.get_name() == "headless"


static func _live_count() -> int:
	for i in range(_lights.size() - 1, -1, -1):
		var l = _lights[i]
		if not is_instance_valid(l) or not (l as Node).is_inside_tree():
			_lights.remove_at(i)
	return _lights.size()


static func _make_light() -> OmniLight3D:
	var light := OmniLight3D.new()
	light.name = "DeathFlashLight"
	light.light_color = COLOR
	light.omni_range = RANGE
	light.light_energy = 0.0
	light.shadow_enabled = false
	return light


## Ölüm noktasında kırmızı ışık patlaması (her peer, her ölüm)
static func burst(tree: SceneTree, pos: Vector3) -> void:
	if _headless() or tree == null:
		return
	var scene := tree.current_scene
	if scene == null:
		scene = tree.root
	if scene == null or _live_count() >= MAX_LIGHTS:
		return
	var light := _make_light()
	light.position = pos + Vector3(0, HEIGHT, 0)   # eklemeden ÖNCE konumla (fizik interpolasyonu eski konumdan süzülmesin)
	scene.add_child(light)
	light.reset_physics_interpolation()
	_lights.append(light)
	var tw := light.create_tween()
	tw.tween_property(light, "light_energy", ENERGY_PEAK, RISE_TIME).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(light, "light_energy", 0.0, DECAY_TIME).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
	tw.tween_callback(light.queue_free)


## Işık ardışığı/pipeline ısınması: rig altına çok sönük bir örnek (bir sonraki kareden sonra silinir)
static func prewarm(rig: Node3D) -> void:
	if _headless() or rig == null:
		return
	var light := _make_light()
	light.light_energy = 0.05
	rig.add_child(light)
	light.create_tween().tween_callback(light.queue_free).set_delay(0.2)
