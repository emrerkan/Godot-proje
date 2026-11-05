extends HBoxContainer
## [−] değer [+] sayı seçici. SpinBox yerine: SpinBox düzenleme modunda son eki (dk/kart) gizliyordu.
## Ortadaki değer ELLE de yazılabilir (tıkla → sadece sayı, Enter/odak kaybı → sınırlara kırpılır, ek geri gelir).
## Kullanım: const NUMBER_STEPPER := preload("res://scenes/ui/NumberStepper.gd"); var s = NUMBER_STEPPER.new()
## Ayarları (min_value, max_value, fmt, snap, control_height) add_child'dan ÖNCE verin.

signal value_changed(value: int)

var min_value := 0
var max_value := 10
var step := 1
## > 0 ise [−]/[+] bu sayının katlarına atlar (dakika: 5 → 3, 5, 10, … 30; kullanıcı isteği). Elle yazım serbest.
var snap := 0
var value := 0
var fmt := "%d"            # çevrilecek biçim anahtarı, ör. "%d dk"
var control_height := 56.0

var _minus: Button
var _plus: Button
var _edit: LineEdit
var _disabled := false


func _ready() -> void:
	add_theme_constant_override("separation", 8)
	_minus = _make_button("−", -1)
	add_child(_minus)
	var box := PanelContainer.new()
	box.custom_minimum_size = Vector2(150, control_height)
	box.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.SURFACE, 0.75), UITheme.RADIUS, UITheme.BORDER, 1, 12, 0))
	box.gui_input.connect(_on_box_input)
	add_child(box)
	_edit = LineEdit.new()
	_edit.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_edit.add_theme_font_override("font", UITheme.font_mono)
	_edit.add_theme_font_size_override("font_size", 24)
	_edit.add_theme_color_override("font_color", UITheme.TEXT)
	for sn in ["normal", "focus", "read_only"]:
		_edit.add_theme_stylebox_override(sn, StyleBoxEmpty.new())   # kutunun kendi çerçevesi yeter
	_edit.select_all_on_focus = true
	_edit.context_menu_enabled = false
	_edit.mouse_default_cursor_shape = Control.CURSOR_IBEAM
	# Yazarken 3 hane sınırı; gösterimde sınır YOK (max_length gösterilen "12 dk"yi "12 "ye kesiyordu)
	_edit.focus_entered.connect(func() -> void:
		_edit.max_length = 3
		_edit.text = str(value))
	_edit.focus_exited.connect(_commit_text)
	_edit.text_submitted.connect(func(_t: String) -> void: _edit.release_focus())
	_edit.gui_input.connect(_on_box_input)
	box.add_child(_edit)
	_plus = _make_button("+", 1)
	add_child(_plus)
	value = clampi(value, min_value, max_value)
	_refresh()


func _make_button(txt: String, dir: int) -> Button:
	var b := Button.new()
	b.text = txt
	b.theme_type_variation = "GhostButton"
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(control_height, control_height)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_size_override("font_size", 28)
	b.pressed.connect(func() -> void: _step_dir(dir))
	return b


func _on_box_input(event: InputEvent) -> void:
	if _disabled or not (event is InputEventMouseButton) or not event.pressed:
		return
	if event.button_index == MOUSE_BUTTON_WHEEL_UP:
		_step_dir(1)
	elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		_step_dir(-1)


## Bir adım: snap varsa bir sonraki/önceki katına (3 → 5 → 10, 30 → 25 … 5 → 3), yoksa step kadar
func _step_dir(dir: int) -> void:
	var nv := value + dir * step
	if snap > 0:
		if dir > 0:
			nv = (value / snap + 1) * snap
		else:
			nv = ((value - 1) / snap) * snap
	_set_value(clampi(nv, min_value, max_value), true)


## Elle yazılan değer: rakam dışı atılır, boşsa eski değer kalır, sınırlara kırpılır
func _commit_text() -> void:
	var digits := ""
	for ch in _edit.text:
		if ch >= "0" and ch <= "9":
			digits += ch
	if not digits.is_empty():
		_set_value(clampi(digits.to_int(), min_value, max_value), true)
	_refresh()


func _set_value(nv: int, emit: bool) -> void:
	if nv == value:
		_refresh()
		return
	value = nv
	_refresh()
	if emit:
		value_changed.emit(value)


func _refresh() -> void:
	if _edit == null:
		return
	if not _edit.has_focus():
		_edit.max_length = 0
		_edit.text = tr(fmt) % value
	_edit.editable = not _disabled
	_minus.disabled = _disabled or value <= min_value
	_plus.disabled = _disabled or value >= max_value


func set_value_no_signal(v: int) -> void:
	value = clampi(v, min_value, max_value)
	_refresh()


func get_value() -> int:
	return value


func set_disabled(b: bool) -> void:
	_disabled = b
	_refresh()
