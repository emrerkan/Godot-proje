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

const POP_TIME := 0.14
const POP_SCALE := 1.42
const SETTLE_TIME := 0.12
const HOLD_TIME := 1.05
const FADE_TIME := 0.65
const FLOAT_RISE := 54.0
const TOTAL_TIME := POP_TIME + SETTLE_TIME + HOLD_TIME + FADE_TIME
const FADE_START := POP_TIME + SETTLE_TIME + HOLD_TIME

const BOTTOM_OFFSET := 182.0     # durum çiplerinin üstünde, alt orta görüş alanında belirgin
const KILL_RED := Color(0.98, 0.20, 0.18)
const KILL_HOT := Color(1.0, 0.86, 0.78)
const SKULL_SIZE := 76.0

const SPARK_COUNT := 16
const LINE_HALF_WIDTH := 230.0   # kafatası arkasında iki yana hızla açılan keskin darbe çizgisi (px)
const LINE_DURATION := 0.52
const RING_DURATION := 0.44
const FLASH_DURATION := 0.18
const EDGE_PULSE_DURATION := 0.30

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

	_victim = UITheme.label("", 28, Color.WHITE, UITheme.font_bold)
	_victim.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_victim.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_victim.add_theme_constant_override("outline_size", 6)
	_victim.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.88))
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
	_tween.tween_property(_panel, "scale", Vector2.ONE * POP_SCALE, POP_TIME).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
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
	if _t <= FLASH_DURATION + 0.04:
		_skull.queue_redraw()
	_fx.queue_redraw()


func _spawn_sparks() -> void:
	_sparks.clear()
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in SPARK_COUNT:
		var ang := rng.randf_range(-PI * 0.92, -PI * 0.08) if i < 10 else rng.randf_range(-PI, PI)
		var speed := rng.randf_range(85.0, 210.0)
		_sparks.append({
			"x": _center.x + rng.randf_range(-_half_w * 0.72, _half_w * 0.72),
			"y": _center.y + rng.randf_range(-14.0, 20.0),
			"vx": cos(ang) * speed * 0.55,
			"vy": -absf(sin(ang)) * speed - 28.0,
			"len": rng.randf_range(12.0, 26.0),
			"delay": rng.randf_range(0.0, 0.08),
			"life": rng.randf_range(0.36, 0.72),
			"hot": i % 2 == 0,
		})


func _draw_fx() -> void:
	if not _active:
		return
	var stage_dy := _stage.position.y
	var c := _center + Vector2(0.0, stage_dy)

	# 0. Alt ekran kenarında kısa kızıl çevresel darbe parıltısı (göz nişangahtayken bile vuruşu hissettirir)
	if _t < EDGE_PULSE_DURATION:
		var eu := _t / EDGE_PULSE_DURATION
		var ea := (1.0 - eu) * (1.0 - eu) * 0.24
		var band_h := 96.0
		var y0 := size.y - band_h
		var pts := PackedVector2Array([Vector2(0, y0), Vector2(size.x, y0), Vector2(size.x, size.y), Vector2(0, size.y)])
		var c0 := Color(KILL_RED, 0.0)
		var c1 := Color(KILL_RED, ea)
		_fx.draw_polygon(pts, PackedColorArray([c0, c0, c1, c1]))

	# 1. Keskin yatay kızıl + sıcak beyaz darbe çizgisi (merkezden iki yana hızla açılır)
	if _t < LINE_DURATION:
		var u := _t / LINE_DURATION
		var ease_u := 1.0 - pow(1.0 - u, 3.0)
		var half := LINE_HALF_WIDTH * ease_u
		var a := (1.0 - smoothstep(0.28, 1.0, u))
		var left := c - Vector2(half, 0.0)
		var right := c + Vector2(half, 0.0)
		_fx.draw_line(left, right, Color(KILL_RED, a * 0.35), 9.0, true)
		_fx.draw_line(left, right, Color(KILL_RED, a * 0.85), 3.6, true)
		_fx.draw_line(c - Vector2(half * 0.62, 0.0), c + Vector2(half * 0.62, 0.0), Color(KILL_HOT, a * 0.95), 2.0, true)

	# 2. Çift sekizgen şok halkası (birincil yoğun + ikincil hızlı dış halka)
	if _t < RING_DURATION:
		var ru := _t / RING_DURATION
		var re := 1.0 - (1.0 - ru) * (1.0 - ru)
		var rad1 := lerpf(SKULL_SIZE * 0.32, SKULL_SIZE * 1.28, re)
		var ra1 := (1.0 - ru) * 0.92
		_draw_oct_ring(c, rad1, Color(KILL_RED, ra1), 3.2)
		var rad2 := lerpf(SKULL_SIZE * 0.45, SKULL_SIZE * 1.72, pow(re, 0.85))
		var ra2 := (1.0 - ru) * 0.55
		_draw_oct_ring(c, rad2, Color(KILL_HOT, ra2), 1.8)

	# 3. İnce keskin kıvılcım iğneleri
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
		var a := (1.0 - u) * global_k * 0.95
		var seg := float(sp["len"]) * (1.0 - 0.5 * u)
		var col: Color = KILL_HOT if bool(sp["hot"]) else KILL_RED
		_fx.draw_line(pos, pos + Vector2(0.0, seg), Color(col, a), 2.2, true)


func _draw_oct_ring(c: Vector2, rad: float, col: Color, width: float) -> void:
	var oct := PackedVector2Array()
	for k in 9:
		var a := PI * 0.125 + float(k % 8) * (TAU / 8.0)
		oct.append(c + Vector2(cos(a), sin(a)) * rad)
	_fx.draw_polyline(oct, col, width, true)


func _plain_style() -> StyleBoxEmpty:
	var sb := StyleBoxEmpty.new()
	sb.content_margin_left = 48
	sb.content_margin_right = 48
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	return sb


## Kafatası (koyu arka kontur + canlı kızıl gövde + ilk 0.18 sn sıcak beyaz darbe parıltısı)
func _draw_skull() -> void:
	var s := _skull.size.x / 24.0
	var w := maxf(2.0, 2.2 * s)
	var flash := clampf(1.0 - _t / FLASH_DURATION, 0.0, 1.0) if _active else 0.0
	var col := KILL_RED.lerp(Color.WHITE, flash * 0.72)
	var head := PackedVector2Array([Vector2(8, 2), Vector2(16, 2), Vector2(21, 7), Vector2(21, 13), Vector2(17, 16),
		Vector2(17, 20), Vector2(7, 20), Vector2(7, 16), Vector2(3, 13), Vector2(3, 7)])
	for i in head.size():
		head[i] *= s
	var outline := head.duplicate()
	outline.append(outline[0])
	# Koyu dış çerçeve → aydınlık ve karanlık her zeminde anında seçilir
	_skull.draw_polyline(outline, Color(0.0, 0.0, 0.0, 0.85), w + 4.5, true)
	_skull.draw_colored_polygon(head, Color(col, 0.42))
	_skull.draw_polyline(outline, col, w, true)
	# Göz çukurları
	_skull.draw_rect(Rect2(Vector2(6.5, 8) * s, Vector2(4, 4) * s), col)
	_skull.draw_rect(Rect2(Vector2(13.5, 8) * s, Vector2(4, 4) * s), col)
	# Burun
	_skull.draw_colored_polygon(PackedVector2Array([Vector2(12, 12.5) * s, Vector2(13.3, 14.8) * s, Vector2(10.7, 14.8) * s]), col)
	# Dişler
	for x: float in [10.0, 12.0, 14.0]:
		_skull.draw_line(Vector2(x, 17) * s, Vector2(x, 20) * s, col, maxf(1.2, 1.7 * s))
