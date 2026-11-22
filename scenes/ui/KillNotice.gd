## KillNotice.gd — Öldürünce ekranın orta altında beliren bildirim (HUD kurar).
##        [kafatası]
##       oyuncu adı          (beyaz, kalın değil)
## Kullanıcı: başlık ("DÜŞMAN ÖLDÜRÜLDÜ"), XP ("+100") ve silah ikonu YOK — sadece ölüm ikonu + kurban adı.
## Yeni öldürme gelirse eskisi anında yenisiyle değişir (birikmez). Sadece görsel.
## Sınıf adı YOK — HUD preload eder.
##
## Efekt (kullanıcı 2026-11-18: gri duman "ucuz" → kalktı): koyu kırmızı/bordo, additive (blend_add) parlak parçacıklar —
## aşağıdan yukarı süzülen ince kıvılcım çizgileri + titreyip sönen küçük dijital kareler. Tek Control + draw çağrıları +
## tek materyal; renk shader'da ×3 parlatılır, merkez beyaza yakın, kenar kırmızı hale. Parçacıklar bildirim alanının
## ALT kenarından doğar, dikey süzülür, YANA DAĞILMAZ, alanın üstünü en fazla TOP_OVERSHOOT kadar geçer.
## Additive karışım arka planı sadece aydınlatır → yazı için panelin ARKASINDA ayrı (mix karışımlı) çok hafif koyu leke (_shade).
## Juice: panel 0 → 1.3 (0.2 sn) → 1.0 (0.1 sn), ~0.55 sn bekler, 0.8 sn'de yukarı süzülüp söner (toplam ~1.65 sn).
## Kafatası şekli sanat kitabı ikon dilinde, dokunulmadı.

extends Control

const POP_TIME := 0.2
const POP_SCALE := 1.3
const SETTLE_TIME := 0.1
const HOLD_TIME := 0.55
const FADE_TIME := 0.8
const FLOAT_RISE := 50.0          # sönerken panelin yukarı süzüldüğü mesafe (px)
const TOTAL_TIME := POP_TIME + SETTLE_TIME + HOLD_TIME + FADE_TIME
const FADE_START := POP_TIME + SETTLE_TIME + HOLD_TIME   # panel sönmeye başladığı an

const BOTTOM_OFFSET := 110.0      # kullanıcı: daha aşağıda (300 → 175 → 110)
const KILL_RED := Color(0.92, 0.2, 0.18)
const SKULL_SIZE := 56.0

## Parçacık yerleşimi (yana dağılmasın; alanın ALTINDAN yukarı süzülsün, üstünü azıcık geçsin; kalabalık olmasın)
const STREAK_COUNT := 20             # ince dikey kıvılcım çizgileri (kısa olanlar nokta gibi)
const SQUARE_COUNT := 15              # küçük dijital kareler
const EMIT_SPAN := 0.30              # parçacıklar bu süreye yayılarak çıkar
const TOP_OVERSHOOT := 22.0          # alanın üstüne en fazla bu kadar (px) taşar
const WIDTH_FRACTION := 0.42         # doğuş x'i: merkez ± panel genişliği × bu
const HDR_BOOST := 3.0              # shader renk çarpanı (parlak/HDR görünüm)
const SPARK_COLORS: Array[Color] = [Color(0.62, 0.03, 0.08), Color(0.85, 0.06, 0.1), Color(1.0, 0.16, 0.14)]

## Okunurluk lekesi (panelin arkasında, normal karışım, çok hafif, yumuşak kenarlı)
const SHADE_ALPHA := 0.5
const SHADE_PAD := Vector2(150.0, 60.0)

const SPARK_SHADER := """
shader_type canvas_item;
render_mode blend_add;
uniform float boost = 2.6;
varying vec4 vc;
void vertex() {
	vc = COLOR;
}
void fragment() {
	// Doku: R = yoğunluk, G = sıcaklık (1 → beyaza yakın çekirdek, 0 → saf bordo/kırmızı hale)
	vec2 t = texture(TEXTURE, UV).rg;
	vec3 hot = mix(vc.rgb, vec3(1.0, 0.82, 0.78), t.g);
	COLOR = vec4(hot * boost, t.r * vc.a);
}
"""

static var _glow_tex: Texture2D = null
static var _square_tex: Texture2D = null
static var _shade_tex: Texture2D = null
static var _spark_mat: ShaderMaterial = null

var _stage: Control
var _panel: PanelContainer
var _victim: Label
var _skull: Control
var _sparks: Control
var _shade: Control
var _tween: Tween = null

var _parts: Array[Dictionary] = []
var _t := 0.0
var _active := false
var _area := Rect2()   # bildirim alanı (panel dikdörtgeni, pop ölçeğinden bağımsız)


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_ensure_resources()
	# Arkada okunurluk lekesi (mix karışımı, additive materyalden AYRI Control)
	_shade = Control.new()
	_shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_shade.modulate.a = 0.0
	_shade.draw.connect(_draw_shade)
	add_child(_shade)

	_sparks = Control.new()
	_sparks.set_anchors_preset(Control.PRESET_FULL_RECT)
	_sparks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sparks.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_sparks.material = _spark_mat
	_sparks.draw.connect(_draw_sparks)
	add_child(_sparks)

	# Panel bir sahne (stage) içinde: sönerken stage yukarı süzülür, panelin yerleşimine dokunulmaz
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
	_panel.add_theme_stylebox_override("panel", _plain_style())   # karartıyı _shade veriyor
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
	_victim.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # oyuncu adı
	v.add_child(_victim)

	for n: Control in [_panel, v, _skull, _victim]:
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)


func show_kill(victim_name: String) -> void:
	_victim.text = victim_name
	if _tween and _tween.is_valid():
		_tween.kill()
	# Eski bildirim anında gider: görünmez + konum/ölçek sıfır, parçacıklar temiz
	_panel.modulate.a = 0.0
	_panel.scale = Vector2.ONE * 0.001
	_stage.position = Vector2.ZERO
	_active = false
	_parts.clear()
	_shade.modulate.a = 0.0
	# Boyut değişti → ortalamak için pivot bir kare sonra (container yerleşimi bitince)
	await get_tree().process_frame
	if not is_instance_valid(_panel):
		return
	_panel.pivot_offset = _panel.size * 0.5
	_panel.scale = Vector2.ONE * 0.001
	_panel.modulate.a = 1.0
	_stage.position = Vector2.ZERO
	_area = Rect2(_panel.position, _panel.size)
	_spawn_parts()
	_t = 0.0
	_active = true
	set_process(true)
	_shade.queue_redraw()
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
	# Leke: kısa sürede belirir, panelle birlikte yukarı süzülüp söner
	var k_in := clampf(_t / 0.15, 0.0, 1.0)
	_shade.modulate.a = SHADE_ALPHA * k_in * _fade_k()
	_shade.position.y = _stage.position.y
	if _t >= TOTAL_TIME:
		_active = false
		_parts.clear()
		_shade.modulate.a = 0.0
		set_process(false)
	_sparks.queue_redraw()


## Panel sönerken (FADE_START → TOTAL_TIME) 1 → 0
func _fade_k() -> float:
	return 1.0 - smoothstep(FADE_START, TOTAL_TIME, _t)


# --- Parçacıklar ----------------------------------------------------------------

## Alanın alt kenarından doğar, dikey süzülür; ömrü bitince alanın üstünü en fazla TOP_OVERSHOOT geçmiş olur.
## Tüm ömürler TOTAL_TIME içinde biter (panelle birlikte söner). Yatay sapma çok küçük.
func _spawn_parts() -> void:
	_parts.clear()
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var half_w := maxf(_area.size.x, 200.0) * WIDTH_FRACTION
	var bottom := _area.end.y + 4.0
	var top := _area.position.y - TOP_OVERSHOOT
	for i in STREAK_COUNT + SQUARE_COUNT:
		var is_square := i >= STREAK_COUNT
		var x := _area.get_center().x + rng.randf_range(-half_w, half_w)
		var delay := 0.0 if i < 3 else rng.randf_range(0.05, EMIT_SPAN)
		var life := clampf(rng.randf_range(0.65, 1.1), 0.3, TOTAL_TIME - 0.08 - delay)
		var col: Color = SPARK_COLORS[rng.randi() % SPARK_COLORS.size()]
		var d := {"sq": is_square, "x": x, "delay": delay, "life": life, "col": col,
			"sway": rng.randf_range(-7.0, 7.0), "phase": rng.randf() * 20.0}
		if is_square:
			var sz := rng.randf_range(4.0, 8.0)
			d["w"] = sz
			d["h"] = sz
			d["rise"] = (bottom - top - sz * 0.5) * rng.randf_range(0.35, 0.85)
		else:
			var dot := i % 4 == 0       # kısa olanlar nokta gibi
			var h := rng.randf_range(7.0, 11.0) if dot else rng.randf_range(24.0, 52.0)
			d["w"] = 7.0 if dot else rng.randf_range(5.0, 8.0)
			d["h"] = h
			d["rise"] = (bottom - top - h * 0.5) * rng.randf_range(0.55, 1.0)
		d["start_y"] = bottom
		_parts.append(d)


func _draw_sparks() -> void:
	if not _active or _glow_tex == null:
		return
	var global_k := _fade_k()
	for p: Dictionary in _parts:
		var lt: float = _t - float(p["delay"])
		if lt <= 0.0:
			continue
		var life: float = p["life"]
		if lt >= life:
			continue
		var u := lt / life
		var e := 1.0 - (1.0 - u) * (1.0 - u)   # ease-out süzülme
		var pos := Vector2(float(p["x"]) + float(p["sway"]) * sin(u * PI), float(p["start_y"]) - float(p["rise"]) * e)
		var env := smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.55, 1.0, u))
		var w: float = p["w"]
		var h: float = p["h"]
		var c: Color = p["col"]
		if bool(p["sq"]):
			# Dijital kare: titreyip söner (sert aç/kapa), piksele oturur
			var tick := floorf(lt * 14.0 + float(p["phase"]))
			var on := fposmod(sin(tick * 12.9898) * 43758.5453, 1.0)
			var flick := 1.0 if on > 0.32 else 0.12
			c.a = env * global_k * flick
			if c.a <= 0.01:
				continue
			pos = pos.round()
			# Yumuşak hale (HDR taşma hissi) + keskin kare
			var halo := c
			halo.a *= 0.4
			_sparks.draw_texture_rect(_glow_tex, Rect2(pos - Vector2(w, w) * 1.4, Vector2(w, w) * 2.8), false, halo)
			_sparks.draw_texture_rect(_square_tex, Rect2(pos - Vector2(w, h) * 0.5, Vector2(w, h)), false, c)
		else:
			c.a = env * global_k * (0.85 + 0.15 * sin(lt * 30.0 + float(p["phase"])))
			if c.a <= 0.01:
				continue
			_sparks.draw_texture_rect(_glow_tex, Rect2(pos - Vector2(w, h) * 0.5, Vector2(w, h)), false, c)


## Panelin arkasındaki koyu leke: radyal yumuşak kenarlı (merkez yoğun, kenar şeffaf)
func _draw_shade() -> void:
	if _area.size == Vector2.ZERO or _shade_tex == null:
		return
	var r := _area.grow_individual(SHADE_PAD.x, SHADE_PAD.y, SHADE_PAD.x, SHADE_PAD.y)
	_shade.draw_texture_rect(_shade_tex, r, false)


## Dokular + shader bir kez (statik; tüm örnekler paylaşır)
static func _ensure_resources() -> void:
	if _spark_mat != null:
		return
	_glow_tex = _make_glow_texture()
	_square_tex = _make_square_texture()
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	g.colors = PackedColorArray([Color(0, 0, 0, 0.9), Color(0, 0, 0, 0.45), Color(0, 0, 0, 0.0)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 128
	gt.height = 128
	_shade_tex = gt
	var sh := Shader.new()
	sh.code = SPARK_SHADER
	_spark_mat = ShaderMaterial.new()
	_spark_mat.shader = sh
	_spark_mat.set_shader_parameter("boost", HDR_BOOST)


## Yumuşak elips: merkez 1, kenar 0; üst yarı (kıvılcımın "başı") alt yarıdan (izi) parlak
static func _make_glow_texture() -> Texture2D:
	var s := 32
	var img := Image.create(s, s, false, Image.FORMAT_RG8)
	for y in s:
		for x in s:
			var u := (float(x) + 0.5) / float(s) * 2.0 - 1.0
			var v := (float(y) + 0.5) / float(s) * 2.0 - 1.0
			var r := clampf(1.0 - sqrt(u * u + v * v), 0.0, 1.0)
			var tail := lerpf(1.0, 0.5, smoothstep(0.0, 1.0, v))
			var val := clampf(pow(r, 0.8) * 1.5, 0.0, 1.0) * tail
			var heat := smoothstep(0.45, 1.0, r) * tail
			img.set_pixel(x, y, Color(val, heat, 0.0))
	return ImageTexture.create_from_image(img)


## Dijital kare: dolu iç (kırmızı), 1 px kenar sıcak (beyaza yakın)
static func _make_square_texture() -> Texture2D:
	var s := 8
	var img := Image.create(s, s, false, Image.FORMAT_RG8)
	for y in s:
		for x in s:
			var edge := x == 0 or y == 0 or x == s - 1 or y == s - 1
			img.set_pixel(x, y, Color(1.0 if edge else 0.8, 0.55 if edge else 0.0, 0.0))
	return ImageTexture.create_from_image(img)


## Görünmez panel (sadece iç boşluk; arka plan = _shade)
func _plain_style() -> StyleBoxEmpty:
	var sb := StyleBoxEmpty.new()
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
