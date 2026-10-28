## Door.gd (3D)
## Harita noktalarından birinde spawn olan kapı. Teslimat ANINDA DEĞİL: kart taşıyıcısı kapının etrafındaki
## KİLİT BÖLGESİNDE (çember, GameManager.DOOR_UNLOCK_RADIUS) DOOR_UNLOCK_TIME saniye kalmalı.
## Çıkarsa / ölürse ilerleme sıfırlanır. Mantık host'ta (GameManager._update_door_unlock); burası sadece GÖRSEL:
## yerdeki çember + dolan yay (spatial_door_zone.gdshader), etiket ve ışık. GameManager.door_unlock_changed dinler.

extends Area3D

const ZONE_SHADER := preload("res://scenes/world/spatial_door_zone.gdshader")
const LOCKED_LIGHT := Color(0.4, 0.6, 1.0)

var _zone_mat: ShaderMaterial
var _label: Label3D
var _light: OmniLight3D
var _active := 0.0


func _init() -> void:
	# _init'te eklenir → ProximityReveal (_ready'de alt ağacı tarar) çemberi de yakınlığa göre gösterir
	var zone := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	var d: float = GameManager.DOOR_UNLOCK_RADIUS * 2.0 / 0.94  # shader çemberi UV 0.47 yarıçapta
	pm.size = Vector2(d, d)
	zone.mesh = pm
	zone.position.y = 0.04
	zone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_zone_mat = ShaderMaterial.new()
	_zone_mat.shader = ZONE_SHADER
	zone.material_override = _zone_mat
	add_child(zone)


## Görünürlük: yaklaşınca belirir (eski 16 → 7 m) ve SADECE kartı taşıyan görür.
## DOOR_CARRIER_ONLY false yapılırsa herkes yaklaşınca görür (kullanıcı: "sonra değiştirebiliriz").
const REVEAL_FAR := 10.0
const REVEAL_NEAR := 4.0
const DOOR_CARRIER_ONLY := true


func _ready() -> void:
	var pr := get_node_or_null("ProximityReveal")
	if pr:
		pr.reveal_far = REVEAL_FAR
		pr.reveal_near = REVEAL_NEAR
		pr.carrier_only = DOOR_CARRIER_ONLY
	_label = get_node_or_null("Label3D")
	_light = get_node_or_null("OmniLight3D")
	GameManager.door_unlock_changed.connect(_on_unlock_changed)
	_on_unlock_changed(GameManager.door_unlock, GameManager.card_carrier_peer_id)


func _process(delta: float) -> void:
	# Aktiflik yumuşak geçsin (shader nabzı + renk)
	var want := 1.0 if GameManager.door_unlock > 0.0 else 0.0
	_active = lerpf(_active, want, 1.0 - exp(-8.0 * delta))
	_zone_mat.set_shader_parameter("active", _active)


## Door.tscn'deki body_entered bağlantısı için — artık girince teslim YOK (kilit süresi GameManager'da)
func _on_body_entered(_body: Node) -> void:
	pass


func _on_unlock_changed(ratio: float, _carrier: int) -> void:
	_zone_mat.set_shader_parameter("progress", ratio)
	if _label:
		_label.text = "KİLİT AÇILIYOR  %d%%" % int(ratio * 100.0) if ratio > 0.0 else "KAPI  ·  KİLİTLİ"
		_label.modulate = Color(UITheme.ACCENT, _label.modulate.a) if ratio > 0.0 else Color(0.4, 0.7, 1.0, _label.modulate.a)
	if _light:
		_light.light_color = LOCKED_LIGHT.lerp(UITheme.ACCENT, ratio)
