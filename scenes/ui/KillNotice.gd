## KillNotice.gd — Öldürünce ekranın orta altında beliren bildirim (HUD kurar).
##        [kafatası]
##       oyuncu adı          (beyaz, kalın değil)
## Kullanıcı kuralları: başlık, "+XP" ve silah ikonu YOK — sadece ölüm ikonu + kurban adı.
## Yeni öldürme gelirse eskisi anında yenisiyle değişir (birikmez). Sadece görsel.
## Sınıf adı YOK — HUD preload eder.
##
## Tasarım ("Sis & Cam" keskin askeri vurgu — duman/koyu leke YOK):
##  - Kafatasının arkasından iki yana hızla açılıp sönen ince kızıl yatay darbe çizgisi + ince sekizgen şok halkası.
##  - 10 adet keskin, ince, kısa ömürlü dikey kıvılcım iğnesi (bulanık hale/duman yok).
##  - Kurban adı koyu konturlu saf beyaz → her haritada tertemiz okunur.
##  - Juice: 0 → 1.22 (0.16 sn) → 1.0 (0.10 sn), ~0.55 sn bekleme, 0.7 sn yukarı süzülüp sönme (~1.5 sn).

extends Control

const POP_TIME := 0.16
const POP_SCALE := 1.22
const SETTLE_TIME := 0.10
const HOLD_TIME := 0.55
const FADE_TIME := 0.70
const FLOAT_RISE := 42.0
const TOTAL_TIME := POP_TIME + SETTLE_TIME + HOLD_TIME + FADE_TIME
const FADE_START := POP_TIME + SETTLE_TIME + HOLD_TIME

const BOTTOM_OFFSET := 148.0     # durum çipleriyle çakışmadan ekranın alt orta bölgesinde
const KILL_RED := Color(0.95, 0.22, 0.20)
const KILL_HOT := Color(1.0, 0.78, 0.72)
const SKULL_SIZE := 54.0

const SPARK_COUNT := 10
const LINE_HALF_WIDTH := 148.0   # kafatası arkasında iki yana açılan keskin darbe çizgisi (px)
const LINE_DURATION := 0.42
const RING_DURATION := 0.32

var _stage: Control
var _panel: PanelContainer
var _victim: Label
var _skull: Control
var _fx: Control
var _tween: Tween = null

var _sparks: Array[Dictionary] = []
var _t := 0.0
var _active := false
var _center := Vector2.ZERO
var _half_w := 90.0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_fx = Control.new()
	_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)

	_stage = Control.new()
	_stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_stage)

	_panel = PanelContainer.new()
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_top = -BOTTOM_OFFSET
	_panel.offset_bottom = -BOTTOM_OFFSET
	_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_panel.add_theme_stylebox_override("panel", _plain_style())
	_panel.modulate.a = 0.0
	_stage.add_child(_panel)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_panel.add_child(v)

	_skull = Control.new()
	_skull.custom_minimum_size = Vector2(SKULL_SIZE, SKULL_SIZE)
	_skull.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_skull.draw.connect(_draw_skull)
	v.add_child(_skull)

	_victim = UITheme.label("", 22, UITheme.TEXT, UITheme.font_regular)
	_victim.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_victim.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_victim.add_theme_constant_override("outline_size", 5)
	_victim.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.8))
	v.add_child(_victim)

	for n: Control in [_panel, v, _skull, _victim]:
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)


func show_kill(victim_name: String) -> void:
	_victim.text = victim_name
	if _tween and _tween.is_valid():
		_tween.kill()
	_panel.modulate.a = 0.0
	_panel.scale = Vector2.ONE   # düzen hesabı ve kafatası merkezi ölçek=1 iken ölçülsün
	_stage.position = Vector2.ZERO
	_active = false
	_sparks.clear()

	await get_tree().process_frame
	if not is_instance_valid(_panel):
		return
	_panel.pivot_offset = _panel.size * 0.5
	# Kafatası merkezi kesin hesap (container global_position gecikmesinden etkilenmez):
	# panel yatay ortalı, alt kenarı size.y - BOTTOM_OFFSET, üst iç boşluk 6 px
	_center = Vector2(size.x * 0.5, size.y - BOTTOM_OFFSET - _panel.size.y + 6.0 + SKULL_SIZE * 0.5)
	_half_w = maxf(_panel.size.x * 0.42, 72.0)
	_panel.scale = Vector2.ONE * 0.001
	_panel.modulate.a = 1.0
	_stage.position = Vector2.ZERO
	_spawn_sparks()
	_t = 0.0
	_active = true
	set_process(true)
	_fx.queue_redraw()

	_tween = create_tween()
	_tween.tween_property(_panel, "scale", Vector2.ONE * POP_SCALE, POP_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_tween.tween_property(_panel, "scale", Vector2.ONE, SETTLE_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_interval(HOLD_TIME)
	_tween.tween_property(_stage, "position:y", -FLOAT_RISE, FADE_TIME).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_tween.parallel().tween_property(_panel, "modulate:a", 0.0, FADE_TIME)


func _process(delta: float) -> void:
	if not _active:
		set_process(false)
		return
	_t += delta
	if _t >= TOTAL_TIME:
		_active = false
		_sparks.clear()
		set_process(false)
	_fx.queue_redraw()


func _spawn_sparks() -> void:
	_sparks.clear()
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in SPARK_COUNT:
		var ang := rng.randf_range(-PI * 0.85, -PI * 0.15) if i < 6 else rng.randf_range(-PI, PI)
		var speed := rng.randf_range(55.0, 125.0)
		_sparks.append({
			"x": _center.x + rng.randf_range(-_half_w * 0.65, _half_w * 0.65),
			"y": _center.y + rng.randf_range(-10.0, 18.0),
			"vx": cos(ang) * speed * 0.35,
			"vy": -absf(sin(ang)) * speed - 20.0,
			"len": rng.randf_range(8.0, 18.0),
			"delay": rng.randf_range(0.0, 0.12),
			"life": rng.randf_range(0.32, 0.62),
			"hot": i % 3 == 0,
		})


func _draw_fx() -> void:
	if not _active:
		return
	var stage_dy := _stage.position.y
	var c := _center + Vector2(0.0, stage_dy)

	# 1. Keskin yatay kızıl darbe çizgisi (merkezden iki yana açılıp söner — duman/leke yok)
	if _t < LINE_DURATION:
		var u := _t / LINE_DURATION
		var ease_u := 1.0 - pow(1.0 - u, 3.0)
		var half := LINE_HALF_WIDTH * ease_u
		var a := (1.0 - smoothstep(0.25, 1.0, u))
		var left := c - Vector2(half, 0.0)
		var right := c + Vector2(half, 0.0)
		_fx.draw_line(left, right, Color(KILL_RED, a * 0.55), 3.0, true)
		_fx.draw_line(c - Vector2(half * 0.55, 0.0), c + Vector2(half * 0.55, 0.0), Color(KILL_HOT, a * 0.85), 1.5, true)

	# 2. Sekizgen şok halkası (sanat kitabı dili — keskin, tek atım)
	if _t < RING_DURATION:
		var ru := _t / RING_DURATION
		var re := 1.0 - (1.0 - ru) * (1.0 - ru)
		var rad := lerpf(SKULL_SIZE * 0.35, SKULL_SIZE * 0.95, re)
		var ra := (1.0 - ru) * 0.72
		var oct := PackedVector2Array()
		for k in 9:
			var a := PI * 0.125 + float(k % 8) * (TAU / 8.0)
			oct.append(c + Vector2(cos(a), sin(a)) * rad)
		_fx.draw_polyline(oct, Color(KILL_RED, ra), 2.0, true)

	# 3. İnce keskin kıvılcım iğneleri (az sayıda, temiz, bulanık hale yok)
	var global_k := 1.0 - smoothstep(FADE_START, TOTAL_TIME, _t)
	for sp: Dictionary in _sparks:
		var lt: float = _t - float(sp["delay"])
		if lt <= 0.0:
			continue
		var life: float = sp["life"]
		if lt >= life:
			continue
		var u := lt / life
		var drag := 1.0 - 0.5 * u
		var pos := Vector2(float(sp["x"]) + float(sp["vx"]) * lt * drag,
			float(sp["y"]) + float(sp["vy"]) * lt * drag + stage_dy)
		var a := (1.0 - u) * global_k * 0.9
		var seg := float(sp["len"]) * (1.0 - 0.55 * u)
		var col: Color = KILL_HOT if bool(sp["hot"]) else KILL_RED
		_fx.draw_line(pos, pos + Vector2(0.0, seg), Color(col, a), 1.8, true)


func _plain_style() -> StyleBoxEmpty:
	var sb := StyleBoxEmpty.new()
	sb.content_margin_left = 48
	sb.content_margin_right = 48
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
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
