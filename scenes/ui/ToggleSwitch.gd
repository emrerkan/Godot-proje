extends Button
## Hap biçimli aç/kapa anahtarı (CheckButton yerine). toggled / button_pressed / set_pressed_no_signal aynen çalışır.

## Rayın çizim boyutu SABİT — kullanan satır hizası için custom_minimum_size'ı büyütebilir (ODA KUR 67 px), ray yine 76×38 çizilir
const TRACK_SIZE := Vector2(76, 38)
var _knob_t := 0.0     # 0 = sol (kapalı), 1 = sağ (açık)
var _tween: Tween


func _init() -> void:
	toggle_mode = true
	text = ""
	focus_mode = Control.FOCUS_NONE
	custom_minimum_size = TRACK_SIZE
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for sn in ["normal", "hover", "pressed", "disabled", "focus", "hover_pressed"]:
		add_theme_stylebox_override(sn, StyleBoxEmpty.new())
	toggled.connect(_on_toggled)
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)


func _ready() -> void:
	_knob_t = 1.0 if button_pressed else 0.0
	queue_redraw()


func _on_toggled(on: bool) -> void:
	_slide(1.0 if on else 0.0)


func _slide(target: float) -> void:
	if _tween and _tween.is_valid():
		_tween.kill()
	if not is_inside_tree():
		_knob_t = target
		queue_redraw()
		return
	_tween = create_tween()
	_tween.tween_method(func(v: float) -> void:
		_knob_t = v
		queue_redraw(), _knob_t, target, 0.12)


func _draw() -> void:
	# set_pressed_no_signal (animasyonsuz) sonrası düğme konumunu durumla eşitle
	if not (_tween and _tween.is_running()):
		_knob_t = 1.0 if button_pressed else 0.0
	# Ray HEP sabit boyut (custom_minimum_size), alan içinde dikey ortalı — satır 67 px'e esnetince daireye dönüşüyordu
	var w := TRACK_SIZE.x
	var h := TRACK_SIZE.y
	var oy := (size.y - h) * 0.5
	draw_set_transform(Vector2(0.0, oy))
	# Görünüm = temadaki cam Button (kullanıcı: "diğer butonlar gibi, siyah-beyaz", yeşil YOK):
	# kapalı = normal/hover cam düğme, açık = seçili (beyaz dolgu) düğme; pahlı köşe (RADIUS, corner_detail 1)
	var hover := is_hovered() and not disabled
	var op := 0.4 if disabled else 1.0
	var track: Color
	var edge: Color
	var knob: Color
	if button_pressed:
		track = Color(1, 1, 1, 0.9)
		edge = Color.WHITE
		knob = UITheme.BG                          # beyaz rayda koyu düğme (seçili düğmenin koyu yazısı gibi)
	else:
		track = Color(1, 1, 1, 0.16 if hover else 0.06)
		edge = Color(1, 1, 1, 0.7) if hover else UITheme.BORDER
		knob = Color(1, 1, 1, 0.85 if hover else 0.6)
	track.a *= op
	edge.a *= op
	knob.a *= op
	draw_style_box(UITheme.style(track, UITheme.RADIUS, edge, 1), Rect2(0, 0, w, h))
	# Düğme: rayı neredeyse dolduran pahlı kare (büyük düğme — kullanıcı: önceki görünüm, şimdiki boyut)
	var pad := 5.0
	var ks := h - pad * 2.0
	var kx := lerpf(pad, w - pad - ks, _knob_t)
	draw_style_box(UITheme.style(knob, maxi(UITheme.RADIUS - 3, 2)), Rect2(kx, pad, ks, ks))
