## KillNotice.gd — Öldürünce ekranın orta altında beliren BF1 tarzı bildirim (HUD kurar).
##   [kafatası]  ARKADAN BIÇAKLAMA   +180
##               oyuncu adı (takım renginde)
## Yeni öldürme gelirse eskisi anında yenisiyle değişir (birikmez). Sadece görsel.
## Sınıf adı YOK — HUD preload eder.

extends Control

const SHOW_TIME := 2.4
const FADE_TIME := 0.5
const POP_SCALE := 1.25
const BOTTOM_OFFSET := 300.0
const KILL_RED := Color(0.92, 0.2, 0.18)

var _panel: PanelContainer
var _title: Label
var _xp: Label
var _victim: Label
var _skull: Control
var _tween: Tween = null


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_panel = PanelContainer.new()
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_top = -BOTTOM_OFFSET
	_panel.offset_bottom = -BOTTOM_OFFSET
	_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_panel.add_theme_stylebox_override("panel", _fade_style())
	_panel.modulate.a = 0.0
	add_child(_panel)

	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	_panel.add_child(h)
	_skull = Control.new()
	_skull.custom_minimum_size = Vector2(44, 44)
	_skull.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_skull.draw.connect(_draw_skull)
	h.add_child(_skull)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 22)
	v.add_child(top)
	_title = UITheme.label("", 28, KILL_RED, UITheme.font_caps)
	_title.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # show_kill tr() ile yazar
	top.add_child(_title)
	_xp = UITheme.label("", 28, UITheme.TEXT, UITheme.font_mono)
	_xp.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	top.add_child(_xp)
	_victim = UITheme.label("", 19, UITheme.TEXT_DIM, UITheme.font_bold)
	_victim.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # oyuncu adı
	v.add_child(_victim)

	for n: Control in [_panel, h, _skull, v, top, _title, _xp, _victim]:
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE


## title: çevrilecek Türkçe anahtar (ör. "ARKADAN BIÇAKLAMA"), xp: toplam kazanılan XP
func show_kill(title: String, xp: int, victim_name: String, victim_color: Color) -> void:
	_title.text = tr(title)
	_xp.text = "+%d" % xp
	_victim.text = victim_name
	_victim.add_theme_color_override("font_color", victim_color)
	if _tween and _tween.is_valid():
		_tween.kill()
	# Boyut değişti → ortalamak için pivot bir kare sonra (container yerleşimi bitince)
	await get_tree().process_frame
	if not is_instance_valid(_panel):
		return
	_panel.pivot_offset = _panel.size * 0.5
	_panel.scale = Vector2.ONE * POP_SCALE
	_panel.modulate.a = 0.0
	_tween = create_tween()
	_tween.set_parallel(true)
	_tween.tween_property(_panel, "modulate:a", 1.0, 0.12)
	_tween.tween_property(_panel, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_tween.chain().tween_interval(SHOW_TIME)
	_tween.chain().tween_property(_panel, "modulate:a", 0.0, FADE_TIME)


## Kenarları saydam koyu şerit (BF1'deki gibi metnin arkasında hafif karartı)
func _fade_style() -> StyleBoxTexture:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.18, 0.82, 1.0])
	g.colors = PackedColorArray([Color(UITheme.BG, 0.0), Color(UITheme.BG, 0.62), Color(UITheme.BG, 0.62), Color(UITheme.BG, 0.0)])
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.width = 256
	tex.height = 4
	var sb := StyleBoxTexture.new()
	sb.texture = tex
	sb.content_margin_left = 70
	sb.content_margin_right = 70
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	return sb


## Kafatası (sanat kitabı ikon dili: sekizgen kafa, tek renk, iç dolgu α 0.25, gözler/dişler dolu)
func _draw_skull() -> void:
	var s := _skull.size.x / 24.0
	var w := maxf(1.5, 2.0 * s)
	var col := KILL_RED
	var head := PackedVector2Array([Vector2(8, 2), Vector2(16, 2), Vector2(21, 7), Vector2(21, 13), Vector2(17, 16),
		Vector2(17, 20), Vector2(7, 20), Vector2(7, 16), Vector2(3, 13), Vector2(3, 7)])
	for i in head.size():
		head[i] *= s
	_skull.draw_colored_polygon(head, Color(col, 0.25))
	head.append(head[0])
	_skull.draw_polyline(head, col, w, true)
	# Göz çukurları
	_skull.draw_rect(Rect2(Vector2(6.5, 8) * s, Vector2(4, 4) * s), col)
	_skull.draw_rect(Rect2(Vector2(13.5, 8) * s, Vector2(4, 4) * s), col)
	# Burun
	_skull.draw_colored_polygon(PackedVector2Array([Vector2(12, 12.5) * s, Vector2(13.3, 14.8) * s, Vector2(10.7, 14.8) * s]), col)
	# Dişler
	for x: float in [10.0, 12.0, 14.0]:
		_skull.draw_line(Vector2(x, 17) * s, Vector2(x, 20) * s, col, maxf(1.0, 1.5 * s))
