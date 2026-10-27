## SettingsWindow.gd — AYARLAR penceresi (GRAFİK / KONTROLLER / SES / OYUN). Tam ekran modal, bulanık arka plan.
## Ana menü (operatör kartı → AYARLAR) ve oyun içi ESC menüsü (HUD) `preload(...).new()` ile ekler, `open()` çağırır.
## TASLAK mantığı (lobi oda ayarlarıyla aynı): kontroller sadece `_draft`'ı değiştirir; UYGULA → GameSettings'e yaz +
## kaydet + uygula; KAPAT / ✕ / ESC / dışına tıklama taslağı atar; VARSAYILAN taslağı fabrika ayarına çeker.

extends Control

signal closed

const SETTINGS := preload("res://scenes/settings/GameSettings.gd")
const CARD_SIZE := Vector2(820, 590)   # UITheme taban 1152×648'e sığar

var _draft: Dictionary = {}
var _refreshers: Array[Callable] = []   # taslak değişince (profil/varsayılan) kontrolleri günceller
var _pages: Dictionary = {}
var _tab_buttons: Dictionary = {}
var _blur_mat: ShaderMaterial
var _card: PanelContainer
var _dirty_lbl: Label
var _res_option: OptionButton
var _preset_option: OptionButton
var _suppress_preset := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()


func open() -> void:
	_draft = SETTINGS.get_all()
	_refresh_all()
	_show_tab("graphics")
	visible = true
	_card.modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_method(func(v: float) -> void: _blur_mat.set_shader_parameter("amount", v), 0.0, 1.0, 0.18)
	tw.tween_property(_card, "modulate:a", 1.0, 0.16)


func close() -> void:
	if not visible:
		return
	var tw := create_tween().set_parallel(true)
	tw.tween_method(func(v: float) -> void: _blur_mat.set_shader_parameter("amount", v), 1.0, 0.0, 0.14)
	tw.tween_property(_card, "modulate:a", 0.0, 0.12)
	tw.chain().tween_callback(func() -> void:
		visible = false
		closed.emit())


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		close()
		get_viewport().set_input_as_handled()


# ─────────────────────────────────────────────
#  Yerleşim
# ─────────────────────────────────────────────

func _build() -> void:
	var blur := ColorRect.new()
	blur.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_blur_mat = ShaderMaterial.new()
	_blur_mat.shader = preload("res://scenes/ui/BlurBackdrop.gdshader")
	blur.material = _blur_mat
	blur.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			close())
	add_child(blur)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_card = PanelContainer.new()
	_card.custom_minimum_size = CARD_SIZE
	_card.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.BG, 0.96), 12, UITheme.BORDER, 1, 24, 18))
	UITheme.add_brackets(_card, UITheme.FRAME, 18)
	center.add_child(_card)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	_card.add_child(box)

	# Başlık
	var head := HBoxContainer.new()
	box.add_child(head)
	var tbox := VBoxContainer.new()
	tbox.add_theme_constant_override("separation", 0)
	tbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tbox)
	tbox.add_child(UITheme.label("SİSTEM", 10, UITheme.TEXT_DIM, UITheme.font_caps))
	tbox.add_child(UITheme.label("AYARLAR", 24, UITheme.TEXT, UITheme.font_title))
	var x := Button.new()
	x.text = "✕"
	x.theme_type_variation = "GhostButton"
	x.focus_mode = Control.FOCUS_NONE
	x.pressed.connect(close)
	head.add_child(x)

	# Sekmeler
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 4)
	box.add_child(tabs)
	var group := ButtonGroup.new()
	for t: Array in [["graphics", "GRAFİK"], ["controls", "KONTROLLER"], ["audio", "SES"], ["game", "OYUN"]]:
		var b := Button.new()
		b.text = t[1]
		b.toggle_mode = true
		b.button_group = group
		b.theme_type_variation = "TabButton"
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(_show_tab.bind(t[0]))
		tabs.add_child(b)
		_tab_buttons[t[0]] = b
	box.add_child(HSeparator.new())

	# Sayfalar (kaydırılabilir)
	var stack := Control.new()
	stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(stack)
	_pages["graphics"] = _page(stack, _build_graphics)
	_pages["controls"] = _page(stack, _build_controls)
	_pages["audio"] = _page(stack, _build_audio)
	_pages["game"] = _page(stack, _build_game)

	# Alt şerit
	box.add_child(HSeparator.new())
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 10)
	box.add_child(foot)
	var reset := Button.new()
	reset.text = "VARSAYILAN"
	reset.theme_type_variation = "GhostButton"
	reset.focus_mode = Control.FOCUS_NONE
	reset.pressed.connect(func() -> void:
		_draft = SETTINGS.DEFAULTS.duplicate(true)
		_refresh_all())
	foot.add_child(reset)
	_dirty_lbl = UITheme.label("", 11, UITheme.ACCENT, UITheme.font_caps)
	_dirty_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_dirty_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dirty_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	foot.add_child(_dirty_lbl)
	var cancel := Button.new()
	cancel.text = "KAPAT"
	cancel.focus_mode = Control.FOCUS_NONE
	cancel.custom_minimum_size = Vector2(120, 0)
	cancel.pressed.connect(close)
	foot.add_child(cancel)
	var apply := Button.new()
	apply.text = "UYGULA"
	apply.theme_type_variation = "PrimaryButton"
	apply.focus_mode = Control.FOCUS_NONE
	apply.custom_minimum_size = Vector2(150, 40)
	apply.pressed.connect(_on_apply)
	foot.add_child(apply)


func _page(parent: Control, builder: Callable) -> Control:
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	parent.add_child(scroll)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 6)
	scroll.add_child(col)
	builder.call(col)
	return scroll


func _show_tab(which: String) -> void:
	for k: String in _pages:
		(_pages[k] as Control).visible = k == which
		(_tab_buttons[k] as Button).set_pressed_no_signal(k == which)


# ─────────────────────────────────────────────
#  Sayfalar
# ─────────────────────────────────────────────

func _build_graphics(col: VBoxContainer) -> void:
	_section(col, "GÖRÜNTÜ")
	_preset_option = _option(col, "Kalite profili", "Aşağıdaki ayarları tek seferde seçer", ["Özel", "Düşük", "Orta", "Yüksek", "Ultra"],
		func() -> int: return _current_preset_index(),
		func(i: int) -> void:
			if i > 0:
				var p: Dictionary = SETTINGS.PRESETS[["Düşük", "Orta", "Yüksek", "Ultra"][i - 1]]
				for k: String in p:
					_draft[k] = p[k]
				_refresh_all())
	_option(col, "Ekran modu", "Kenarlıksız: alt-tab hızlı · Tam ekran: en düşük gecikme",
		["Pencereli", "Kenarlıksız tam ekran", "Tam ekran (özel)"],
		func() -> int: return int(_draft["window_mode"]),
		func(i: int) -> void:
			_draft["window_mode"] = i
			_refresh_all())
	var res_list := SETTINGS.available_resolutions()
	var res_names: Array[String] = []
	for r in res_list:
		res_names.append("%d × %d" % [r.x, r.y])
	_res_option = _option(col, "Çözünürlük", "Pencere boyutu (tam ekranda ekranın kendi çözünürlüğü kullanılır)", res_names,
		func() -> int:
			var cur: Vector2i = _draft["resolution"]
			var idx := res_list.find(cur)
			return idx if idx >= 0 else res_list.size() - 1,
		func(i: int) -> void: _draft["resolution"] = res_list[i])
	_refreshers.append(func() -> void: _res_option.disabled = int(_draft["window_mode"]) != SETTINGS.WindowMode.WINDOWED)
	_option(col, "Dikey senkron (VSync)", "Ekran yırtılmasını önler, FPS'i ekran yenilemesine kilitler",
		["Kapalı", "Açık", "Uyarlamalı"],
		func() -> int: return int(_draft["vsync"]),
		func(i: int) -> void: _draft["vsync"] = i)
	var fps_names: Array[String] = []
	for f in SETTINGS.FPS_LIMITS:
		fps_names.append("Sınırsız" if f == 0 else "%d FPS" % f)
	_option(col, "FPS sınırı", "Isınmayı ve fan sesini azaltır", fps_names,
		func() -> int: return maxi(SETTINGS.FPS_LIMITS.find(int(_draft["max_fps"])), 0),
		func(i: int) -> void: _draft["max_fps"] = SETTINGS.FPS_LIMITS[i])

	_section(col, "KALİTE")
	_slider(col, "3D çözünürlük ölçeği", "Düşürmek FPS'i en çok artıran ayar (arayüz net kalır)", 50, 100, 5,
		func() -> float: return float(_draft["render_scale"]) * 100.0,
		func(v: float) -> void: _draft["render_scale"] = v / 100.0,
		func(v: float) -> String: return "%d%%" % int(v), true)
	_option(col, "Kenar yumuşatma", "MSAA en net ama en pahalı · FXAA ucuz",
		["Kapalı", "FXAA", "MSAA 2×", "MSAA 4×"],
		func() -> int: return int(_draft["aa"]),
		func(i: int) -> void:
			_draft["aa"] = i
			_mark_custom())
	_option(col, "Gölgeler", "El feneri ve lamba gölgeleri", ["Kapalı", "Düşük", "Orta", "Yüksek"],
		func() -> int: return int(_draft["shadows"]),
		func(i: int) -> void:
			_draft["shadows"] = i
			_mark_custom())
	_check(col, "Menü 3D arka planı", "Ana menü ve lobide devriye gezen askerler (kapalı = daha hafif)",
		func() -> bool: return bool(_draft["menu_background"]),
		func(b: bool) -> void:
			_draft["menu_background"] = b
			_mark_custom())
	_slider(col, "Arayüz ölçeği", "Menü ve HUD boyutu", 80, 100, 5,
		func() -> float: return float(_draft["ui_scale"]) * 100.0,
		func(v: float) -> void: _draft["ui_scale"] = v / 100.0,
		func(v: float) -> String: return "%d%%" % int(v))


func _build_controls(col: VBoxContainer) -> void:
	_section(col, "FARE")
	_slider(col, "Fare hassasiyeti", "Oyun içi nişangahın fare hareketine göre hızı", 0.2, 3.0, 0.05,
		func() -> float: return float(_draft["mouse_sensitivity"]),
		func(v: float) -> void: _draft["mouse_sensitivity"] = v,
		func(v: float) -> String: return "%.2f×" % v)
	_slider(col, "Ekran sarsıntısı", "Patlamalarda kamera sarsıntısı (0 = kapalı)", 0, 100, 5,
		func() -> float: return float(_draft["camera_shake"]) * 100.0,
		func(v: float) -> void: _draft["camera_shake"] = v / 100.0,
		func(v: float) -> String: return "%d%%" % int(v))

	_section(col, "TUŞLAR")
	for k: Array in [["W A S D", "Hareket"], ["Shift", "Koş"], ["Ctrl", "Çömel (3 sn, mermiler üstünden geçer)"],
			["Sol tık", "Ateş"], ["R", "Şarjör değiştir"], ["Q", "Özel gücü kullan"], ["Enter / T", "Sohbet / takım sohbeti"],
			["TAB", "Skor tablosu"], ["ESC", "Menü"]]:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		col.add_child(row)
		var key := PanelContainer.new()
		key.custom_minimum_size = Vector2(110, 0)
		key.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.06), 4, UITheme.BORDER, 1, 10, 4))
		var kl := UITheme.label(k[0], 12, UITheme.TEXT, UITheme.font_mono)
		kl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		key.add_child(kl)
		row.add_child(key)
		var dl := UITheme.label(k[1], 13, UITheme.TEXT_DIM)
		dl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(dl)
	col.add_child(UITheme.label("Tuş atama (değiştirme) ileride eklenecek.", 11, Color(UITheme.TEXT_DIM, 0.7)))


func _build_audio(col: VBoxContainer) -> void:
	_section(col, "SES SEVİYELERİ")
	for b: Array in [["Master", "Ana ses"], ["Music", "Müzik"], ["SFX", "Efektler (silah, patlama, adım)"], ["UI", "Arayüz"]]:
		var key: String = "vol_" + b[0]
		_slider(col, b[1], "", 0, 100, 5,
			func() -> float: return float(_draft[key]) * 100.0,
			func(v: float) -> void: _draft[key] = v / 100.0,
			func(v: float) -> String: return "%d%%" % int(v))
	var note := UITheme.label("Not: oyunda henüz ses efekti/müzik yok. Ses kanalları hazır — sesler eklendiğinde bu ayarlar geçerli olacak.", 11, Color(UITheme.TEXT_DIM, 0.8))
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(note)


func _build_game(col: VBoxContainer) -> void:
	_section(col, "EKRAN")
	_check(col, "FPS göster", "Sağ üst köşede kare hızı",
		func() -> bool: return bool(_draft["show_fps"]),
		func(b: bool) -> void: _draft["show_fps"] = b)


# ─────────────────────────────────────────────
#  Satır yardımcıları
# ─────────────────────────────────────────────

func _section(col: VBoxContainer, title: String) -> void:
	if col.get_child_count() > 0:
		var sp := Control.new()
		sp.custom_minimum_size = Vector2(0, 6)
		col.add_child(sp)
	col.add_child(UITheme.label(title, 10, UITheme.TEXT_DIM, UITheme.font_caps))


func _row(col: VBoxContainer, title: String, desc: String, control: Control) -> void:
	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.03), 4, Color(1, 1, 1, 0.06), 1, 14, 7))
	col.add_child(row)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	row.add_child(h)
	var txt := VBoxContainer.new()
	txt.add_theme_constant_override("separation", 0)
	txt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(txt)
	txt.add_child(UITheme.label(title, 14, UITheme.TEXT))
	if not desc.is_empty():
		txt.add_child(UITheme.label(desc, 11, UITheme.TEXT_DIM))
	control.custom_minimum_size.x = maxf(control.custom_minimum_size.x, 260)
	control.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(control)


func _option(col: VBoxContainer, title: String, desc: String, items: Array, getter: Callable, setter: Callable) -> OptionButton:
	var ob := OptionButton.new()
	ob.focus_mode = Control.FOCUS_NONE
	for it in items:
		ob.add_item(str(it))
	ob.item_selected.connect(func(i: int) -> void:
		setter.call(i)
		_update_dirty())
	_refreshers.append(func() -> void: ob.select(clampi(int(getter.call()), 0, ob.item_count - 1)))
	_row(col, title, desc, ob)
	return ob


func _slider(col: VBoxContainer, title: String, desc: String, mn: float, mx: float, step: float,
		getter: Callable, setter: Callable, fmt: Callable, custom_on_change := false) -> HSlider:
	var wrap := HBoxContainer.new()
	wrap.add_theme_constant_override("separation", 10)
	var s := HSlider.new()
	s.min_value = mn
	s.max_value = mx
	s.step = step
	s.focus_mode = Control.FOCUS_NONE
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_style_slider(s)
	wrap.add_child(s)
	var val := UITheme.label("", 13, UITheme.TEXT, UITheme.font_mono)
	val.custom_minimum_size = Vector2(56, 0)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	wrap.add_child(val)
	s.value_changed.connect(func(v: float) -> void:
		val.text = fmt.call(v)
		if _suppress_preset:
			return
		setter.call(v)
		if custom_on_change:
			_mark_custom()
		_update_dirty())
	_refreshers.append(func() -> void:
		s.set_value_no_signal(float(getter.call()))
		val.text = fmt.call(s.value))
	_row(col, title, desc, wrap)
	return s


func _check(col: VBoxContainer, title: String, desc: String, getter: Callable, setter: Callable) -> CheckButton:
	var c := CheckButton.new()
	c.focus_mode = Control.FOCUS_NONE
	c.toggled.connect(func(b: bool) -> void:
		setter.call(b)
		_update_dirty())
	_refreshers.append(func() -> void: c.set_pressed_no_signal(bool(getter.call())))
	_row(col, title, desc, c)
	return c


func _style_slider(s: HSlider) -> void:
	var track := UITheme.style(Color(1, 1, 1, 0.12), 2)
	track.content_margin_top = 2
	track.content_margin_bottom = 2
	var fill := UITheme.style(Color(1, 1, 1, 0.85), 2)
	fill.content_margin_top = 2
	fill.content_margin_bottom = 2
	s.add_theme_stylebox_override("slider", track)
	s.add_theme_stylebox_override("grabber_area", fill)
	s.add_theme_stylebox_override("grabber_area_highlight", fill)


# ─────────────────────────────────────────────
#  Durum
# ─────────────────────────────────────────────

func _refresh_all() -> void:
	_suppress_preset = true
	for r in _refreshers:
		r.call()
	_suppress_preset = false
	_update_dirty()


## Elle değiştirilen kalite ayarı profili "Özel" yapar (seçili profil gerçeği yansıtsın)
func _mark_custom() -> void:
	if _preset_option:
		_preset_option.select(_current_preset_index())


func _current_preset_index() -> int:
	var names := ["Düşük", "Orta", "Yüksek", "Ultra"]
	for i in names.size():
		var p: Dictionary = SETTINGS.PRESETS[names[i]]
		var match_all := true
		for k: String in p:
			if not is_equal_approx(float(_draft[k]), float(p[k])):
				match_all = false
				break
		if match_all:
			return i + 1
	return 0


func _update_dirty() -> void:
	var cur := SETTINGS.get_all()
	var dirty := false
	for k: String in _draft:
		if str(_draft[k]) != str(cur.get(k)):
			dirty = true
			break
	_dirty_lbl.text = "● KAYDEDİLMEMİŞ DEĞİŞİKLİKLER" if dirty else ""


func _on_apply() -> void:
	SETTINGS.set_all(_draft)
	SETTINGS.save()
	SETTINGS.apply_all(get_tree())
	_update_dirty()
	close()
