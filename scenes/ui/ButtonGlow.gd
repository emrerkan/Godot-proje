## ButtonGlow.gd — birincil (PrimaryButton) düğmenin içinde fener lekesi + toz zerreleri (canvas_ui_menu_beam.gdshader).
## Kullanıcı isteği: düğme içi sade cam, SADECE çerçeve kehribar; arkada fener boşta nabız gibi PARILDAR ama toz DURUR,
## fare üstüne gelince / odaktayken tam yanar ve toz UÇUŞUR. Pasif (disabled) ya da meta "glow_off" = true iken gizli
## (ör. UpgradePage "XP YETERSİZ" yumuşak pasif düğmesi). Meta "glow_done" = true: pasif olsa da YEŞİL parıltı + duran toz (MAKS).
## Maliyet: düğme başına bir toplamsal dörtgen (~40 ALU/piksel, doku yok) + küçük _process — menüde ihmal edilebilir.
## UITheme.apply `node_added` kancası her PrimaryButton'a OTOMATİK ekler (`attach`) — elle çağırmaya gerek yok.
## Sınıf adı YOK (global class cache'e bağımlı olmasın) — kullanan preload eder.

extends ColorRect

const BEAM := preload("res://scenes/ui/canvas_ui_menu_beam.gdshader")
const NODE_NAME := "ButtonGlow"
const GLOW_LIT := 1.0
const GLOW_BASE := 0.6          # boştaki parıltı ortalaması
const GLOW_PULSE := 0.15        # nabız genliği
const GLOW_RATE := 2.4          # nabız hızı (rad/sn)
const FADE_SPEED := 3.0         # yoğunluk/sn (~0.25 sn'de yanar)
const DUST_MOTION_SPEED := 4.0  # toz durma/kalkma hızı (1/sn)

var _btn: BaseButton
var _mat: ShaderMaterial
var _value := GLOW_BASE
var _motion := 0.0
var _clock := 0.0
var _done := false

const LIGHT_COLOR := Color(1.0, 0.92, 0.78)   # sıcak fener (shader varsayılanı)
const DONE_COLOR := Color(0.40, 0.82, 0.47)   # MAKS / tamamlandı yeşili (UpgradePage STATE_COLORS.owned)


## Düğmeye bir kez ekler (zaten varsa dokunmaz)
static func attach(btn: BaseButton) -> void:
	if not is_instance_valid(btn) or btn.has_node(NODE_NAME):
		return
	var script := load("res://scenes/ui/ButtonGlow.gd") as GDScript
	var g: ColorRect = script.new()
	g.name = NODE_NAME
	btn.add_child(g)
	g.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _ready() -> void:
	_btn = get_parent() as BaseButton
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = BEAM
	_mat.set_shader_parameter("spot_center", Vector2(0.5, 0.5))
	_mat.set_shader_parameter("spot_radius", Vector2(0.62, 1.1))
	_mat.set_shader_parameter("light_alpha", 0.7)
	_mat.set_shader_parameter("hot_strength", 0.45)
	_mat.set_shader_parameter("spill_strength", 0.55)
	_mat.set_shader_parameter("dust_cell_px", 12.0)
	_mat.set_shader_parameter("dust_drift_px", Vector2(2.0, -4.0))
	_mat.set_shader_parameter("dust_clock", 0.0)
	_mat.set_shader_parameter("intensity", _value)
	material = _mat


func _process(delta: float) -> void:
	if _btn == null:
		return
	# meta "glow_done" (UpgradePage MAKS): pasif düğmede de YEŞİL parıltı, toz hep durur, hover'da yanmaz
	var done := bool(_btn.get_meta("glow_done", false))
	if done != _done:
		_done = done
		_mat.set_shader_parameter("light_color", DONE_COLOR if done else LIGHT_COLOR)
	# Varyasyon sonradan değişebilir (Lobby HAZIRIM: hazırken düz düğme) → sadece PrimaryButton iken
	visible = (done or (not _btn.disabled and not bool(_btn.get_meta("glow_off", false)))) \
		and _btn.theme_type_variation == &"PrimaryButton"
	if not visible or not _btn.is_visible_in_tree():
		return
	var lit := not done and (_btn.is_hovered() or _btn.has_focus())
	var target := GLOW_LIT if lit else GLOW_BASE + GLOW_PULSE * sin(Time.get_ticks_msec() * 0.001 * GLOW_RATE)
	if not is_equal_approx(_value, target):
		_value = move_toward(_value, target, delta * FADE_SPEED)
		_mat.set_shader_parameter("intensity", _value)
	# Toz yalnız yanıkken uçuşur (saat ilerler), boşta yerinde durur
	_motion = move_toward(_motion, 1.0 if lit else 0.0, delta * DUST_MOTION_SPEED)
	if _motion > 0.0:
		_clock += delta * _motion
		_mat.set_shader_parameter("dust_clock", _clock)
