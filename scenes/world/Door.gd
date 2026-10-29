## Door.gd (3D)
## Harita noktalarından birinde spawn olan kapı. Teslimat ANINDA DEĞİL: kart taşıyıcısı kapının etrafındaki
## KİLİT BÖLGESİNDE (çember, GameManager.DOOR_UNLOCK_RADIUS) DOOR_UNLOCK_TIME saniye kalmalı.
## Çıkarsa / ölürse ilerleme sıfırlanır. Mantık host'ta (GameManager._update_door_unlock); burası sadece GÖRSEL:
## "Kapı" modeli yok — üstten kamerada kutu gibi duruyordu. Yerine TAHLİYE NOKTASI işareti (kullanıcı: "çıkış noktası
## olduğunu anlayabilmem lazım"): yerde ince çember + yukarı akan oklar (spatial_door_zone.gdshader), ortadan yükselen
## ışık sütunu (spatial_door_beam.gdshader), "ÇIKIŞ" etiketi, ışık. Boşta fosfor yeşili, kilit açılırken kehribar.
## GameManager.door_unlock_changed dinler.

extends Area3D

const ZONE_SHADER := preload("res://scenes/world/spatial_door_zone.gdshader")
const BEAM_SHADER := preload("res://scenes/world/spatial_door_beam.gdshader")
const LOCKED_LIGHT := Color(0.45, 0.95, 0.68)   # UITheme.SIGNAL fosfor — çember/sütunla aynı
const BEAM_HEIGHT := 7.0
const BEAM_RADIUS_TOP := 0.9
const BEAM_RADIUS_BOTTOM := 0.55

var _zone_mat: ShaderMaterial
var _beam_mat: ShaderMaterial
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

	# Tahliye ışık sütunu (açık uçlu silindir, toplamalı)
	var beam := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = BEAM_RADIUS_TOP
	cm.bottom_radius = BEAM_RADIUS_BOTTOM
	cm.height = BEAM_HEIGHT
	cm.cap_top = false
	cm.cap_bottom = false
	beam.mesh = cm
	beam.position.y = BEAM_HEIGHT * 0.5
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_beam_mat = ShaderMaterial.new()
	_beam_mat.shader = BEAM_SHADER
	beam.material_override = _beam_mat
	add_child(beam)


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
	# Kapı kutusu (tscn'deki 1.4×2.4 BoxMesh) çizilmez — yerde sadece ince çember kalsın (kullanıcı: "kalın dikdörtgen
	# yerine yuvarlak ince çizgi, O gibi"). Düğüm silinmez: ProximityReveal _ready'de listesine aldı.
	var box := get_node_or_null("MeshInstance3D") as MeshInstance3D
	if box:
		box.mesh = null
	_label = get_node_or_null("Label3D")
	if _label:
		# tscn'deki 32 px yazı üstten kamerada okunmuyordu
		_label.font_size = 72
		_label.outline_size = 14
		_label.outline_modulate = Color(0, 0, 0, 0.8)
		_label.position.y = 2.6
	_light = get_node_or_null("OmniLight3D")
	GameManager.door_unlock_changed.connect(_on_unlock_changed)
	_on_unlock_changed(GameManager.door_unlock, GameManager.card_carrier_peer_id)


func _process(delta: float) -> void:
	# Aktiflik yumuşak geçsin (shader nabzı + renk)
	var want := 1.0 if GameManager.door_unlock > 0.0 else 0.0
	_active = lerpf(_active, want, 1.0 - exp(-8.0 * delta))
	_zone_mat.set_shader_parameter("active", _active)
	_beam_mat.set_shader_parameter("active", _active)


## Door.tscn'deki body_entered bağlantısı için — artık girince teslim YOK (kilit süresi GameManager'da)
func _on_body_entered(_body: Node) -> void:
	pass


## Yerdeki çember sadece bölgeyi gösterir (aktifken nabız) — dolan yay kaldırıldı, ilerleme HUD'da (taşıyıcının üstünde bar)
func _on_unlock_changed(ratio: float, _carrier: int) -> void:
	_zone_mat.set_shader_parameter("progress", 0.0)
	if _label:
		_label.text = "ÇIKIŞ  ·  KİLİT AÇILIYOR" if ratio > 0.0 else "▲  ÇIKIŞ"
		_label.modulate = Color(UITheme.ACCENT, _label.modulate.a) if ratio > 0.0 else Color(LOCKED_LIGHT, _label.modulate.a)
	if _light:
		_light.light_color = LOCKED_LIGHT.lerp(UITheme.ACCENT, ratio)
