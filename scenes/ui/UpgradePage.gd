## UpgradePage.gd — Ana menü PROFİL penceresinin içeriği: iki sekme
##   KARAKTER GELİŞİMİ — profil XP'si ile KARAKTER BAŞINA kalıcı stat yükseltmesi (5 stat × 5 seviye).
##                      Her stat satırı: özel çizim ikon + etki cümlesi ("Can %25 artar") + TEK bar (seviye/MAKS oranı) + YÜKSELT.
##                      Sayı/yüzde ilerleme metni YOK; özet kartı yalnız yüzde ("CAN +%25").
##   GÜÇ GELİŞİMİ     — HESAP GENELİ güç ağaçları (PowerTrees.gd): üstte güç seçici, solda soldan sağa büyüyen ağaç,
##                      sağda seçili düğümün detayı (yüzde dilinde etki cümleleri, fiyat, AÇ). Her güç kendi ağacında ilerler.
## Görsel dil: sade nötr beyaz-gri (kehribar yalnız YÜKSELT/AÇ ve XP), ikonlar IconSet.gd (emoji yok). Spec: docs/ux/upgrade-page.md.
## MainMenu `preload(...).new()` ile pencereye ekler (PROFİL), açılınca `refresh()`.
## Veri/kurallar PlayerProfile + PowerTrees'te (fiyat, ön koşul, değerler); bu dosya sadece arayüz.

extends VBoxContainer

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const POWER_TREES := preload("res://scenes/profile/PowerTrees.gd")
const ICONS := preload("res://scenes/ui/IconSet.gd")
const STATS_PAGE := preload("res://scenes/ui/StatsPage.gd")
const SFX := preload("res://scenes/audio/Sfx.gd")
const ROLES := {"Tank": "Ön Hat", "Visioner": "Keşif", "Runner": "Hızlı Sızma", "Sniper": "Uzun Menzil", "Medic": "Destek"}

## Ağaç ızgarası (PowerTrees düğüm pos = sütun, satır)
const NODE_SIZE := Vector2(210, 93)
const COL_STEP := 263.0
const ROW_STEP := 137.0
const TREE_PAD := Vector2(17, 13)

## Sade palet: bar dolgusu nötr beyaz, zemin %10 beyaz
const BAR_FILL := Color(0.93, 0.95, 0.97, 0.92)
const BAR_BG := Color(1, 1, 1, 0.10)
const BAR_HEIGHT := 10.0
const BAR_TWEEN_TIME := 0.35
const BUY_FLASH := Color(1.35, 1.35, 1.35)
## Güç ağacı düğüm durumu (kullanıcı isteği): açık yeşil, sırası gelen sarı, henüz sırası gelmeyen kırmızı
const STATE_COLORS := {"owned": Color(0.40, 0.82, 0.47), "open": Color(0.96, 0.78, 0.30), "locked": Color(0.86, 0.33, 0.30)}
## İkon kutusu feneri (MainMenu ile aynı shader): boşta loş, satır üzerindeyken/odaktayken tam
const MENU_BEAM := preload("res://scenes/ui/canvas_ui_menu_beam.gdshader")
const BEAM_IDLE := 0.28
const BEAM_LIT := 1.0
const BEAM_SPEED := 3.0   # yoğunluk/sn (~0.25 sn'de yanar)
const DUST_MOTION_SPEED := 4.0  # toz durma/kalkma hızı (1/sn) — boşta durur, yanınca uçuşur
const BUTTON_STATES: Array[String] = ["normal", "hover", "pressed", "hover_pressed"]
const BUTTON_FONT_COLORS: Array[String] = ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]

var _tab_buttons: Dictionary = {}      # "char"/"power" → Button
var _char_page: VBoxContainer
var _power_page: VBoxContainer
var _stats_page: VBoxContainer         # İSTATİSTİK sekmesi (StatsPage.gd)
var _xp_chip: PanelContainer
var _xp_lbl: Label
var _level_lbl: Label
var _xp_shown := -1
var _xp_tween: Tween

# Karakter sekmesi
var _character := "Tank"
var _char_buttons: Dictionary = {}     # karakter → Button
var _role_lbl: Label
var _summary_vals: Dictionary = {}     # stat → {icon: Control, val: Label}
var _rows: Dictionary = {}             # stat → {row, icon, effect, bar, btn, maxbox, tw}
var _cost_lbl: Label
var _beams: Array[Dictionary] = []     # {mat, rect, area (üzerine gelinince yanar), button (YÜKSELT/AÇ ise), value, always, clock, motion}

# Güç sekmesi
var _tree := "bomb"
var _selected := "root"
var _tree_buttons: Dictionary = {}     # ağaç → {btn: Button, icon: Control, lbl: Label}
var _canvas: Control
var _node_buttons: Dictionary = {}     # düğüm id → {btn, name, status, check, lock}
var _d_icon: Control
var _d_title: Label
var _d_name: Label
var _d_desc: Label
var _d_effects: VBoxContainer
var _d_status: Label
var _d_buy: Button
var _power_cost_lbl: Label


func _ready() -> void:
	add_theme_constant_override("separation", 20)
	_build()
	_show_tab("char")
	refresh()
	# Sabit pencere: güç sekmesi karakter sekmesi kadar yüksek (her karakterde aynı — satır yükseklikleri sabit) →
	# karakter/ağaç/sekme değişince panel zıplamaz. Güç sekmesi ölçülmez: sarılan etiketler layout'tan önce dev yükseklik verir.
	_power_page.custom_minimum_size.y = _char_page.get_combined_minimum_size().y
	_stats_page.custom_minimum_size.y = _char_page.get_combined_minimum_size().y


func _build() -> void:
	# Başlık: sekmeler + XP
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	add_child(header)
	var group := ButtonGroup.new()
	for t: Array in [["char", "KARAKTER GELİŞİMİ"], ["power", "GÜÇ GELİŞİMİ"], ["stats", "İSTATİSTİK"]]:
		var b := _tab_button(t[1], group)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(_show_tab.bind(t[0]))
		header.add_child(b)
		_tab_buttons[t[0]] = b
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

	# XP çipi: kehribar kalan iki yerden biri (diğeri YÜKSELT/AÇ)
	_xp_chip = PanelContainer.new()
	_xp_chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_xp_chip.add_theme_stylebox_override("panel", _chip_style(Color(UITheme.ACCENT, 0.5)))
	header.add_child(_xp_chip)
	var xp_box := VBoxContainer.new()
	xp_box.add_theme_constant_override("separation", 0)
	_xp_chip.add_child(xp_box)
	_xp_lbl = UITheme.label("", 33, UITheme.ACCENT, UITheme.font_mono)
	_xp_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	xp_box.add_child(_xp_lbl)
	_level_lbl = UITheme.label("", 17, UITheme.TEXT_DIM, UITheme.font_caps)
	_level_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	xp_box.add_child(_level_lbl)

	_char_page = VBoxContainer.new()
	# 14 (20 değil): karakter sekmesi tahmini ~903 px — 1080'e / PROFİL kartına sığma payı (8 aralık × 6 px = 48 px kazanç)
	_char_page.add_theme_constant_override("separation", 14)
	_char_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_char_page)
	_build_char_page(_char_page)

	_power_page = VBoxContainer.new()
	_power_page.add_theme_constant_override("separation", 20)
	_power_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_power_page)
	_build_power_page(_power_page)

	_stats_page = STATS_PAGE.new()
	_stats_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_stats_page)


func _chip_style(border: Color) -> StyleBoxFlat:
	return UITheme.style(Color.TRANSPARENT, UITheme.RADIUS, border, 1, 23, 13)   # içi saydam, sadece çerçeve


# ─────────────────────────────────────────────
#  Ortak yardımcılar (odak halkası, yumuşak pasif düğme, bar, ikon rengi)
# ─────────────────────────────────────────────

## Klavye/gamepad görünür odak: 2 px beyaz çerçeve, 3 px dışarıda, içi boş
func _ring_style() -> StyleBoxFlat:
	var s := UITheme.style(Color.TRANSPARENT, 0, UITheme.FRAME, 2)
	s.draw_center = false
	s.set_expand_margin_all(3.0)
	return s


func _focusable(c: Control) -> void:
	c.focus_mode = Control.FOCUS_ALL
	if c is Button:
		c.add_theme_stylebox_override("focus", _ring_style())


func _tab_button(text: String, group: ButtonGroup) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.button_group = group
	b.theme_type_variation = "TabButton"
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_focusable(b)
	return b


## IconSet ikonunun rengini değiştirir (Control tipinde `color` yok → set ile)
func _tint(icon: Control, col: Color) -> void:
	icon.set("color", col)


## Gerçek `disabled` görünümü (MAKS / KİLİTLİ): kehribar DEĞİL, nötr cam
func _neutral_disabled(btn: Button) -> void:
	btn.add_theme_stylebox_override("disabled", UITheme.style(Color(1, 1, 1, 0.10), UITheme.RADIUS, UITheme.BORDER, 1, 27, 15))
	btn.add_theme_color_override("font_disabled_color", Color(UITheme.TEXT_DIM, 0.9))


## Yumuşak pasif (XP yetersiz): düğme gerçekte etkin kalır (odak alabilir, basılınca neden gösterilir) ama soluk görünür
## Alınabilir (soft=false): tema PrimaryButton (sade cam + kehribar çerçeve + ButtonGlow feneri). Yumuşak pasifte fener kapalı.
func _set_soft(btn: Button, soft: bool) -> void:
	btn.set_meta("glow_off", soft)
	if soft:
		var st := UITheme.style(Color(1, 1, 1, 0.05), UITheme.RADIUS, UITheme.BORDER, 1, 27, 15)
		for s: String in BUTTON_STATES:
			btn.add_theme_stylebox_override(s, st)
		for c: String in BUTTON_FONT_COLORS:
			btn.add_theme_color_override(c, UITheme.TEXT_DIM)
	else:
		for s: String in BUTTON_STATES:
			btn.remove_theme_stylebox_override(s)
		for c: String in BUTTON_FONT_COLORS:
			btn.remove_theme_color_override(c)


func _bar_style(bar: ProgressBar, maxed: bool) -> void:
	var edge := Color(UITheme.TEXT, 0.9) if maxed else UITheme.BORDER
	bar.add_theme_stylebox_override("background", UITheme.style(BAR_BG, 0, edge, 1))
	bar.add_theme_stylebox_override("fill", UITheme.style(UITheme.TEXT if maxed else BAR_FILL, 0))


## XP yetersiz basışı: XP çipinin kenarı 0.3 sn beyaz yanar + basılan düğme kısa parlar (neden oyuncunun baktığı yerde de görünsün)
## + alçak inen ton ("unlock_reset" sentezi; ui_click kancası onay tıkını zaten çaldı, bu onu "olumsuz" olarak ayırır)
func _deny(btn: Button = null) -> void:
	SFX.play_ui(get_tree(), "unlock_reset", -8.0, 1.0)
	if btn != null:
		_flash(btn, 0.3)
	_xp_chip.add_theme_stylebox_override("panel", _chip_style(Color(1, 1, 1, 0.95)))
	var tw := create_tween()
	tw.tween_interval(0.3)
	tw.tween_callback(func() -> void:
		_xp_chip.add_theme_stylebox_override("panel", _chip_style(Color(UITheme.ACCENT, 0.5))))


func _flash(target: CanvasItem, time: float) -> void:
	target.modulate = BUY_FLASH
	create_tween().tween_property(target, "modulate", Color.WHITE, time)


## Koyu ikon kutusu + arkasında fener lekesi (toz zerreli). `area` üzerindeyken/odaktayken tam yanar.
func _icon_box(icon: Control, area: Control, always_lit: bool = false) -> PanelContainer:
	var box := PanelContainer.new()
	box.custom_minimum_size = Vector2(56, 56)
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	box.clip_contents = true
	box.add_theme_stylebox_override("panel", UITheme.style(UITheme.SURFACE_2, 0, UITheme.BORDER, 1))
	box.add_child(_add_beam(area, Vector2(0.42, 0.38), Vector2(0.95, 0.95), 8.0, always_lit))   # fener sol üstten tutuyor
	box.add_child(icon)
	return box


## Fener lekesi (ColorRect + kendi ShaderMaterial'ı) üretir ve _process listesine ekler.
## (YÜKSELT/AÇ düğmelerinin feneri ayrı: tema → ButtonGlow.gd)
func _add_beam(area: Control, center: Vector2, radius: Vector2, dust_cell: float, always_lit: bool = false) -> ColorRect:
	var rect := ColorRect.new()
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = MENU_BEAM
	mat.set_shader_parameter("spot_center", center)
	mat.set_shader_parameter("spot_radius", radius)
	mat.set_shader_parameter("light_alpha", 0.7)
	mat.set_shader_parameter("hot_strength", 0.45)
	mat.set_shader_parameter("spill_strength", 0.55)
	mat.set_shader_parameter("dust_cell_px", dust_cell)
	mat.set_shader_parameter("dust_drift_px", Vector2(2.0, -4.0))
	mat.set_shader_parameter("dust_clock", 0.0)
	var start := BEAM_LIT if always_lit else BEAM_IDLE
	mat.set_shader_parameter("intensity", start)
	rect.material = mat
	_beams.append({"mat": mat, "area": area, "value": start,
		"always": always_lit, "clock": 0.0, "motion": 1.0 if always_lit else 0.0})
	return rect


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	var mouse := get_global_mouse_position()
	var focus := get_viewport().gui_get_focus_owner()
	for b: Dictionary in _beams:
		var area: Control = b["area"]
		if not area.is_visible_in_tree():
			continue
		var lit: bool = b["always"] or area.get_global_rect().has_point(mouse) \
			or (focus != null and (focus == area or area.is_ancestor_of(focus)))
		var mat: ShaderMaterial = b["mat"]
		var target := BEAM_LIT if lit else BEAM_IDLE
		var v: float = b["value"]
		if not is_equal_approx(v, target):
			v = move_toward(v, target, delta * BEAM_SPEED)
			b["value"] = v
			mat.set_shader_parameter("intensity", v)
		# Toz: sadece yanıkken uçuşur (saat ilerler), boşta yerinde durur
		var motion := move_toward(float(b["motion"]), 1.0 if lit else 0.0, delta * DUST_MOTION_SPEED)
		b["motion"] = motion
		if motion > 0.0:
			b["clock"] = float(b["clock"]) + delta * motion
			mat.set_shader_parameter("dust_clock", b["clock"])


func _show_tab(which: String) -> void:
	for t: String in _tab_buttons:
		(_tab_buttons[t] as Button).set_pressed_no_signal(t == which)
	_char_page.visible = which == "char"
	_power_page.visible = which == "power"
	_stats_page.visible = which == "stats"
	if which == "stats":
		_stats_page.refresh()   # her açılışta veriyi yeniden oku, çubuklar dolsun


## Klavye/gamepad girişi: sayfada odak yokken ilk yön tuşu odağı AKTİF alt sekmeye koyar (GUI'den önce, `_input`);
## yoksa Godot "yakın bir kontrole" düşerdi. Üstteki KARAKTER/GÜÇ sekmelerine yukarı yönle çıkılır.
func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	var nav := false
	for a: StringName in [&"ui_up", &"ui_down", &"ui_left", &"ui_right"]:
		if event.is_action_pressed(a):
			nav = true
			break
	if not nav:
		return
	var f := get_viewport().gui_get_focus_owner()
	if f != null and is_ancestor_of(f):
		return
	var target: Control
	if _stats_page.visible:
		target = _tab_buttons.get("stats")   # istatistik sekmesinde odaklanacak içerik yok → sekme düğmesi
	elif _char_page.visible:
		target = _char_buttons.get(_character)
	else:
		target = (_tree_buttons.get(_tree, {}) as Dictionary).get("btn")
	if target != null and target.is_visible_in_tree():
		target.grab_focus()
		get_viewport().set_input_as_handled()


## Alt sekme döngüsü: PageUp/PageDown ve gamepad LB/RB (project.godot'a eylem eklenmez)
func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	var dir := 0
	if event is InputEventKey:
		var k := event as InputEventKey
		if k.pressed and not k.echo:
			if k.keycode == KEY_PAGEDOWN:
				dir = 1
			elif k.keycode == KEY_PAGEUP:
				dir = -1
	elif event is InputEventJoypadButton:
		var j := event as InputEventJoypadButton
		if j.pressed:
			if j.button_index == JOY_BUTTON_RIGHT_SHOULDER:
				dir = 1
			elif j.button_index == JOY_BUTTON_LEFT_SHOULDER:
				dir = -1
	if dir == 0:
		return
	_cycle(dir)
	get_viewport().set_input_as_handled()


func _cycle(dir: int) -> void:
	if _stats_page.visible:
		return   # istatistik sekmesinde alt sekme yok
	if _char_page.visible:
		var i := PROFILE.CHARACTERS.find(_character)
		_select(PROFILE.CHARACTERS[posmod(i + dir, PROFILE.CHARACTERS.size())])
	else:
		var j := POWER_TREES.TREE_ORDER.find(_tree)
		_select_tree(POWER_TREES.TREE_ORDER[posmod(j + dir, POWER_TREES.TREE_ORDER.size())])


## Sekme her açıldığında (maçtan dönünce XP değişmiş olabilir) ve her satın almada.
## animate_stat: satın alınan stat (bar dolum animasyonu); animate_xp: XP sayısı sayarak insin
func refresh(animate_stat: String = "", animate_xp: bool = false) -> void:
	if _xp_lbl == null:
		return
	_update_xp(animate_xp or animate_stat != "")
	_level_lbl.text = tr("PROFİL SEVİYESİ %d") % PROFILE.profile_level()
	_refresh_char(animate_stat)
	_refresh_power()
	if _stats_page.visible:
		_stats_page.refresh()


func _update_xp(animate: bool) -> void:
	var xp: int = PROFILE.get_xp()
	if _xp_tween != null and _xp_tween.is_valid():
		_xp_tween.kill()
	if animate and _xp_shown >= 0 and xp != _xp_shown:
		_xp_tween = create_tween()
		_xp_tween.tween_method(_set_xp_text, float(_xp_shown), float(xp), 0.3)
	else:
		_set_xp_text(float(xp))


func _set_xp_text(v: float) -> void:
	_xp_shown = int(roundf(v))
	_xp_lbl.text = "%d XP" % _xp_shown


# ─────────────────────────────────────────────
#  KARAKTER GELİŞİMİ
# ─────────────────────────────────────────────

func _build_char_page(page: VBoxContainer) -> void:
	# Karakter seçici (yalnız ad — sayaç yok)
	var chars := HBoxContainer.new()
	chars.add_theme_constant_override("separation", 10)
	page.add_child(chars)
	var group := ButtonGroup.new()
	for c: String in PROFILE.CHARACTERS:
		var b := _tab_button(c.to_upper(), group)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_select.bind(c))
		chars.add_child(b)
		_char_buttons[c] = b
	(_char_buttons[_character] as Button).button_pressed = true

	# Karakter özeti: yalnız yüzde ("CAN +%25"), yükseltilmemiş "—"
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.03), UITheme.RADIUS, UITheme.BORDER, 1, 27, 20))
	page.add_child(card)
	var card_box := VBoxContainer.new()
	card_box.add_theme_constant_override("separation", 13)
	card.add_child(card_box)
	_role_lbl = UITheme.label("", 18, UITheme.TEXT_DIM, UITheme.font_caps)
	card_box.add_child(_role_lbl)
	var summary := GridContainer.new()
	summary.columns = PROFILE.STATS.size()
	summary.add_theme_constant_override("h_separation", 30)
	card_box.add_child(summary)
	for stat: String in PROFILE.STATS:
		var entry := HBoxContainer.new()
		entry.add_theme_constant_override("separation", 13)
		entry.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		summary.add_child(entry)
		var icon := ICONS.make(stat, 28, UITheme.TEXT_DIM)
		entry.add_child(icon)
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 0)
		entry.add_child(box)
		box.add_child(UITheme.label(PROFILE.STAT_INFO[stat]["name"], 17, UITheme.TEXT_DIM, UITheme.font_caps))
		var val := UITheme.label("—", 28, UITheme.TEXT_DIM, UITheme.font_mono)
		val.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		box.add_child(val)
		_summary_vals[stat] = {"icon": icon, "val": val}

	# Stat satırları
	for stat: String in PROFILE.STATS:
		page.add_child(_build_stat_row(stat))

	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(fill)
	_cost_lbl = UITheme.label("", 20, UITheme.TEXT_DIM)
	page.add_child(_cost_lbl)


## [ikon kutusu 56] ─20─ [ad + etki metni, min 380] ─20─ [TEK bar] ─20─ [YÜKSELT 250×57]
func _build_stat_row(stat: String) -> Control:
	var info: Dictionary = PROFILE.STAT_INFO[stat]
	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.025), UITheme.RADIUS, UITheme.BORDER, 1, 23, 13))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 20)
	row.add_child(h)

	var icon := ICONS.make(stat, 36, UITheme.TEXT_DIM)
	h.add_child(_icon_box(icon, row))

	var name_box := VBoxContainer.new()
	name_box.add_theme_constant_override("separation", 0)
	name_box.custom_minimum_size = Vector2(380, 0)
	name_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(name_box)
	name_box.add_child(UITheme.label(info["name"], 20, UITheme.TEXT, UITheme.font_caps))
	var effect := UITheme.label("", 18, UITheme.TEXT_DIM)
	effect.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # stat_effect_text zaten çevrilmiş
	name_box.add_child(effect)

	# Tek bar: yüzde/seviye yazısı YOK, çentik YOK
	var bar := ProgressBar.new()
	bar.min_value = 0.0
	bar.max_value = 1.0
	bar.step = 0.001
	bar.value = 0.0
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, BAR_HEIGHT)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar_style(bar, false)
	h.add_child(bar)

	var btn := Button.new()
	# SABİT boyut: genişlik → bar bitişi tüm satırlarda aynı x (en uzun metin "XP YETERSİZ · 2500 XP");
	# yükseklik 65 → MAKS (disabled stil) satırı YÜKSELT satırından kısa kalmasın (karakter değişince panel zıplıyordu)
	btn.custom_minimum_size = Vector2(380, 65)
	btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	btn.theme_type_variation = "PrimaryButton"
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_focusable(btn)
	# MAKS = tamamlandı: pasif ama "düz" değil — yeşil çerçeve + hafif yeşil iç (güç ağacındaki açık düğümle aynı dil)
	var done: Color = STATE_COLORS["owned"]
	btn.add_theme_stylebox_override("disabled", UITheme.style(Color(done, 0.08), UITheme.RADIUS, Color(done, 0.75), 2, 27, 15))
	btn.pressed.connect(_buy.bind(stat))
	h.add_child(btn)

	# MAKS: onay ikonu + yazı (düğme metni boşalır)
	var maxbox := HBoxContainer.new()
	maxbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	maxbox.alignment = BoxContainer.ALIGNMENT_CENTER
	maxbox.add_theme_constant_override("separation", 8)
	maxbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	maxbox.visible = false
	btn.add_child(maxbox)
	var max_lbl := UITheme.label("MAKS", 22, done, UITheme.font_bold)
	max_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	maxbox.add_child(max_lbl)

	_rows[stat] = {"row": row, "icon": icon, "effect": effect, "bar": bar, "btn": btn, "maxbox": maxbox, "tw": null}
	return row


func _select(character: String) -> void:
	_character = character
	for c: String in _char_buttons:
		(_char_buttons[c] as Button).set_pressed_no_signal(c == character)
	refresh()


func _buy(stat: String) -> void:
	var cost: int = PROFILE.next_cost(_character)
	if PROFILE.get_xp() < cost:
		_deny(_rows[stat]["btn"] as Button)
		return
	if PROFILE.buy(_character, stat):
		SFX.play_ui(get_tree(), "upgrade_buy", -8.0)   # kullanıcı: yükseltmede ateş sesi
		refresh(stat, true)
		_play_buy_fx(stat)


## Nötr parlama + ikon nabzı + etki metni alfa geçişi
func _play_buy_fx(stat: String) -> void:
	var r: Dictionary = _rows[stat]
	_flash(r["row"] as CanvasItem, 0.4)
	var icon: Control = r["icon"]
	var tw := create_tween()
	tw.tween_property(icon, "scale", Vector2.ONE * 1.15, 0.125)
	tw.tween_property(icon, "scale", Vector2.ONE, 0.125)
	var eff: Label = r["effect"]
	eff.modulate.a = 0.4
	create_tween().tween_property(eff, "modulate:a", 1.0, 0.15)


func _refresh_char(animate_stat: String) -> void:
	var levels := PROFILE.get_levels(_character)
	var cost: int = PROFILE.next_cost(_character)
	var can_afford: bool = PROFILE.get_xp() >= cost
	_role_lbl.text = "%s  ·  %s" % [_character.to_upper(), tr(String(ROLES.get(_character, ""))).to_upper()]

	for stat: String in PROFILE.STATS:
		var lv: int = levels[stat]
		var r: Dictionary = _rows[stat]
		var maxed := lv >= PROFILE.MAX_LEVEL

		# Özet kartı: "+%25" / "—"
		var sv: Dictionary = _summary_vals[stat]
		var val: Label = sv["val"]
		if lv > 0:
			val.text = tr("+%%%d") % PROFILE.stat_percent(stat, lv)
			val.add_theme_color_override("font_color", UITheme.TEXT)
		else:
			val.text = "—"
			val.add_theme_color_override("font_color", UITheme.TEXT_DIM)
		_tint(sv["icon"] as Control, UITheme.TEXT if lv > 0 else UITheme.TEXT_DIM)

		# Satır: ikon, etki cümlesi
		_tint(r["icon"] as Control, UITheme.TEXT if lv > 0 else UITheme.TEXT_DIM)
		var effect: Label = r["effect"]
		effect.text = PROFILE.stat_effect_text(stat, lv)
		effect.add_theme_color_override("font_color", UITheme.TEXT if lv > 0 else UITheme.TEXT_DIM)

		# Tek bar: seviye/MAX; sadece satın almada dolum animasyonu (karakter değişince anlık)
		var bar: ProgressBar = r["bar"]
		var old: Tween = r.get("tw")
		if old != null and old.is_valid():
			old.kill()
		_bar_style(bar, maxed)
		var target := float(lv) / float(PROFILE.MAX_LEVEL)
		if stat == animate_stat:
			var tw := create_tween()
			tw.tween_property(bar, "value", target, BAR_TWEEN_TIME).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			r["tw"] = tw
		else:
			bar.value = target
			r["tw"] = null

		# Düğme: YÜKSELT / XP YETERSİZ (yumuşak pasif) / MAKS (gerçek disabled)
		var btn: Button = r["btn"]
		(r["maxbox"] as Control).visible = maxed
		btn.set_meta("glow_done", maxed)   # ButtonGlow: pasif olsa da yeşil parıltı + duran toz
		if maxed:
			btn.text = ""
			btn.disabled = true
			_set_soft(btn, false)
		else:
			btn.disabled = false
			btn.text = tr("YÜKSELT · %d XP") % cost if can_afford else tr("XP YETERSİZ · %d XP") % cost
			_set_soft(btn, not can_afford)
	_cost_lbl.text = tr("Yükseltme sadece seçili karaktere uygulanır  ·  bu karakterin sonraki yükseltmesi: %d XP") % cost
	_rescue_stat_focus()


## MAKS olan düğme odaktaysa odak sıradaki etkin düğmeye, yoksa karakter sekmesine geçer
func _rescue_stat_focus() -> void:
	var focused := false
	for stat: String in PROFILE.STATS:
		var b: Button = _rows[stat]["btn"]
		if b.disabled and b.has_focus():
			focused = true
	if not focused:
		return
	for stat: String in PROFILE.STATS:
		var b: Button = _rows[stat]["btn"]
		if not b.disabled:
			b.grab_focus()
			return
	(_char_buttons[_character] as Button).grab_focus()


# ─────────────────────────────────────────────
#  GÜÇ GELİŞİMİ
# ─────────────────────────────────────────────

func _build_power_page(page: VBoxContainer) -> void:
	# Güç seçici: [ikon] KISA AD (sayaç yok)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	page.add_child(row)
	var group := ButtonGroup.new()
	for t: String in POWER_TREES.TREE_ORDER:
		var b := _tab_button("", group)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 56)
		b.clip_text = true
		b.pressed.connect(_select_tree.bind(t))
		row.add_child(b)
		var inner := HBoxContainer.new()
		inner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		inner.alignment = BoxContainer.ALIGNMENT_CENTER
		inner.add_theme_constant_override("separation", 10)
		inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(inner)
		var icon := ICONS.make(t, 24, UITheme.TEXT_DIM)
		inner.add_child(icon)
		var lbl := UITheme.label(String(POWER_TREES.TREES[t]["short"]), 20, UITheme.TEXT_DIM, UITheme.font_caps)
		lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		inner.add_child(lbl)
		_tree_buttons[t] = {"btn": b, "icon": icon, "lbl": lbl}
	(_tree_buttons[_tree]["btn"] as Button).button_pressed = true

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 20)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(body)

	# Ağaç
	var tree_panel := PanelContainer.new()
	tree_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tree_panel.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.025), UITheme.RADIUS, UITheme.BORDER, 1, 20, 20))
	body.add_child(tree_panel)
	var center := CenterContainer.new()
	tree_panel.add_child(center)
	_canvas = Control.new()
	_canvas.custom_minimum_size = TREE_PAD * 2.0 + NODE_SIZE + Vector2(COL_STEP * 3.0, ROW_STEP * 2.0)
	_canvas.draw.connect(_draw_links)
	center.add_child(_canvas)

	# Detay
	var detail := PanelContainer.new()
	detail.custom_minimum_size = Vector2(483, 0)
	detail.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.04), UITheme.RADIUS, UITheme.BORDER, 1, 27, 23))
	UITheme.add_brackets(detail, UITheme.FRAME, 17)
	body.add_child(detail)
	var d := VBoxContainer.new()
	d.add_theme_constant_override("separation", 13)
	detail.add_child(d)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 17)
	d.add_child(title_row)
	_d_icon = ICONS.make(_tree, 36, UITheme.TEXT)
	title_row.add_child(_icon_box(_d_icon, detail, true))
	_d_title = UITheme.label("", 20, UITheme.TEXT_DIM, UITheme.font_caps)
	_d_title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	title_row.add_child(_d_title)

	_d_name = UITheme.label("", 33, UITheme.TEXT, UITheme.font_bold)
	d.add_child(_d_name)
	_d_desc = UITheme.label("", 20, UITheme.TEXT_DIM)
	_d_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_d_desc.custom_minimum_size = Vector2(430, 0)
	d.add_child(_d_desc)
	var sep := HSeparator.new()
	sep.add_theme_stylebox_override("separator", UITheme.style(UITheme.BORDER, 0))
	d.add_child(sep)
	_d_effects = VBoxContainer.new()
	_d_effects.add_theme_constant_override("separation", 7)
	d.add_child(_d_effects)
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	d.add_child(fill)
	_d_status = UITheme.label("", 18, UITheme.TEXT_DIM)
	_d_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	d.add_child(_d_status)
	_d_buy = Button.new()
	_d_buy.custom_minimum_size = Vector2(0, 67)
	_d_buy.theme_type_variation = "PrimaryButton"
	_d_buy.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_focusable(_d_buy)
	_neutral_disabled(_d_buy)
	_d_buy.pressed.connect(_buy_power)
	d.add_child(_d_buy)

	_power_cost_lbl = UITheme.label("", 20, UITheme.TEXT_DIM)
	page.add_child(_power_cost_lbl)
	_rebuild_tree()


func _select_tree(tree: String) -> void:
	_tree = tree
	for t: String in _tree_buttons:
		((_tree_buttons[t]["btn"]) as Button).set_pressed_no_signal(t == tree)
	_selected = _first_open_node()
	_rebuild_tree()
	_refresh_power()


## Ağaç değişince ilk "açılabilir" düğüm seçili gelsin (hepsi açıksa kök)
func _first_open_node() -> String:
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		if _node_state(n) == "open":
			return n["id"]
	return "root"


func _rebuild_tree() -> void:
	for c in _canvas.get_children():
		c.queue_free()
	_node_buttons.clear()
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		var btn := Button.new()
		btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_focusable(btn)
		btn.position = _node_pos(n)
		btn.size = NODE_SIZE
		btn.custom_minimum_size = NODE_SIZE
		btn.pressed.connect(_select_node.bind(String(n["id"])))
		_canvas.add_child(btn)
		var box := VBoxContainer.new()
		box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		box.alignment = BoxContainer.ALIGNMENT_CENTER
		box.add_theme_constant_override("separation", 2)
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		btn.add_child(box)
		var name_lbl := UITheme.label(n["name"], 20, UITheme.TEXT, UITheme.font_bold)
		name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_lbl.clip_text = true
		name_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(name_lbl)
		# Durum satırı: [ikon 18] metin — durum renge değil ikona/şekle de bağlı
		var status_row := HBoxContainer.new()
		status_row.alignment = BoxContainer.ALIGNMENT_CENTER
		status_row.add_theme_constant_override("separation", 6)
		status_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(status_row)
		var check := ICONS.make("check", 18, UITheme.TEXT)
		var lock := ICONS.make("lock", 18, Color(UITheme.TEXT_DIM, 0.75))
		status_row.add_child(check)
		status_row.add_child(lock)
		var status_lbl := UITheme.label("", 17, UITheme.TEXT_DIM, UITheme.font_mono)
		status_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		status_row.add_child(status_lbl)
		_node_buttons[n["id"]] = {"btn": btn, "name": name_lbl, "status": status_lbl, "check": check, "lock": lock}


func _node_pos(n: Dictionary) -> Vector2:
	var p: Vector2i = n["pos"]
	# Tek satırlık ağaç (Uydu) dikeyde ortada
	return TREE_PAD + Vector2(p.x * COL_STEP, p.y * ROW_STEP)


## owned / open (ön koşul tamam) / locked
func _node_state(n: Dictionary) -> String:
	if PROFILE.has_power(_tree, n["id"]):
		return "owned"
	if n["req"] == "" or PROFILE.has_power(_tree, n["req"]):
		return "open"
	return "locked"


func _select_node(node_id: String) -> void:
	# Kilitli düğümün detayı gösterilmez: önceki adım açılmadan bakılacak bir şey yok
	if _node_state(POWER_TREES.get_node_def(_tree, node_id)) == "locked":
		SFX.play_ui(get_tree(), "unlock_reset", -12.0, 1.0)
		return
	_selected = node_id
	_refresh_power()


func _buy_power() -> void:
	var n := POWER_TREES.get_node_def(_tree, _selected)
	if n.is_empty() or _node_state(n) != "open":
		return
	if PROFILE.get_xp() < PROFILE.power_cost(_tree):
		_deny(_d_buy)
		return
	if PROFILE.buy_power(_tree, _selected):
		SFX.play_ui(get_tree(), "upgrade_buy", -8.0)   # kullanıcı: yükseltmede ateş sesi
		refresh("", true)
		var nb: Dictionary = _node_buttons.get(_selected, {})
		if nb.has("btn"):
			_flash(nb["btn"] as CanvasItem, 0.45)


func _refresh_power() -> void:
	if _canvas == null:
		return
	var owned := PROFILE.get_powers()
	# Sekmeler: ikon + ad; seçili TEXT, diğerleri soluk (sayaç yok)
	for t: String in _tree_buttons:
		var tb: Dictionary = _tree_buttons[t]
		var col := UITheme.TEXT if t == _tree else Color(UITheme.TEXT_DIM, 0.75)
		_tint(tb["icon"] as Control, col)
		(tb["lbl"] as Label).add_theme_color_override("font_color", col)
	(_d_icon as Control).set("icon_id", _tree)

	var cost: int = PROFILE.power_cost(_tree)
	var xp: int = PROFILE.get_xp()
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		var nb: Dictionary = _node_buttons.get(n["id"], {})
		if nb.is_empty():
			continue
		var state := _node_state(n)
		var selected: bool = n["id"] == _selected
		# İçi saydam, SADECE çerçeve durum renginde (yeşil/sarı/kırmızı); seçili düğüm kalın çerçeve.
		# Kilitli düğüm seçilemez (önceki adım açılmadı) → hover'da aydınlanmaz, imleç "yasak".
		var state_col: Color = STATE_COLORS[state]
		var border := Color(state_col, 1.0 if selected else (0.85 if state != "locked" else 0.6))
		var width := 4 if selected else 2
		var st := UITheme.style(Color.TRANSPARENT, 0, border, width, 10, 7)
		var st_hover := st if state == "locked" else UITheme.style(Color.TRANSPARENT, 0, border.lightened(0.3), width, 10, 7)
		var btn: Button = nb["btn"]
		for s: String in ["normal", "pressed", "disabled"]:
			btn.add_theme_stylebox_override(s, st)
		btn.add_theme_stylebox_override("hover", st_hover)
		btn.add_theme_stylebox_override("hover_pressed", st_hover)
		var name_lbl: Label = nb["name"]
		var status_lbl: Label = nb["status"]
		(nb["check"] as Control).visible = state == "owned"
		(nb["lock"] as Control).visible = state == "locked"
		name_lbl.add_theme_color_override("font_color", UITheme.TEXT if state != "locked" else Color(UITheme.TEXT_DIM, 0.75))
		btn.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if state == "locked" else Control.CURSOR_POINTING_HAND
		_tint(nb["lock"] as Control, Color(state_col, 0.85))
		# Açık düğüm: yazı/ikon yok, sadece yeşil çerçeve (kullanıcı isteği) → durum satırı gizli, ad ortada
		status_lbl.get_parent().visible = state != "owned"
		match state:
			"owned":
				status_lbl.text = ""
			"open":
				status_lbl.text = "%d XP" % cost
				status_lbl.add_theme_color_override("font_color", state_col if xp >= cost else Color(state_col, 0.6))
			_:
				status_lbl.text = "KİLİTLİ"
				status_lbl.add_theme_color_override("font_color", Color(state_col, 0.85))
	_canvas.queue_redraw()
	_refresh_detail(owned, cost, xp)
	var done: int = POWER_TREES.owned_count(owned, _tree)
	var total_nodes: int = (POWER_TREES.TREES[_tree]["nodes"] as Array).size()
	_power_cost_lbl.text = tr("Güç gelişimi tüm karakterlerde geçerli  ·  her güç kendi ağacında ilerler  ·  bu ağaçta sonraki düğüm: %d XP") % cost \
		if done < total_nodes else tr("Güç gelişimi tüm karakterlerde geçerli  ·  bu ağaç tamamlandı")


## "Önce" değerleri: düğümün ön koşul zincirindeki atalar AÇIKMIŞ varsayılır (kilitli düğümde de doğru artımlı yüzde),
## ayrıca tanım sırasında bu düğümden önceki ve gerçekten sahip olunan düğümler sayılır.
func _before_mods(n: Dictionary, owned: Dictionary) -> Dictionary:
	var mine: Array = owned.get(_tree, [])
	var ancestors := {}
	var cur := String(n["req"])
	while cur != "":
		ancestors[cur] = true
		cur = String(POWER_TREES.get_node_def(_tree, cur).get("req", ""))
	var ids: Array[String] = []
	for m: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		if m["id"] == n["id"]:
			break
		if mine.has(m["id"]) or ancestors.has(m["id"]):
			ids.append(m["id"])
	var others := owned.duplicate(true)
	others[_tree] = ids
	return POWER_TREES.mods(others)


func _refresh_detail(owned: Dictionary, cost: int, xp: int) -> void:
	var n := POWER_TREES.get_node_def(_tree, _selected)
	if n.is_empty():
		return
	var had_buy_focus := _d_buy.has_focus()
	_d_title.text = tr(String(POWER_TREES.TREES[_tree]["name"]))
	_d_name.text = n["name"]
	_d_desc.text = n["desc"]

	# Etkiler: tek cümle, yüzde dili (mutlak sayı yok)
	var before := _before_mods(n, owned)
	for c in _d_effects.get_children():
		c.queue_free()
	for key: String in n["set"]:
		if not POWER_TREES.LABELS.has(key):
			continue
		var text: String = POWER_TREES.change_text(key, float(before[key]), float(n["set"][key]))
		if text == "":
			continue
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var mark := ColorRect.new()
		mark.color = UITheme.TEXT
		mark.custom_minimum_size = Vector2(6, 6)
		mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(mark)
		var lbl := UITheme.label(text, 22, UITheme.TEXT)
		lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # change_text zaten çevrilmiş
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lbl.custom_minimum_size = Vector2(400, 0)
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(lbl)
		_d_effects.add_child(row)

	match _node_state(n):
		"owned":
			_d_status.text = tr("Bu düğüm açık — etkisi tüm maçlarında, hangi karakterle olursan ol geçerli.")
			_d_buy.visible = false
			if had_buy_focus:
				var nb: Dictionary = _node_buttons.get(_selected, {})
				if nb.has("btn"):
					(nb["btn"] as Button).grab_focus()
		"open":
			_d_status.text = tr("Her açtığın düğüm bu ağaçtaki sonrakini pahalılaştırır.")
			_d_buy.visible = true
			_d_buy.disabled = false
			_d_buy.text = tr("AÇ · %d XP") % cost if xp >= cost else tr("XP YETERSİZ · %d XP") % cost
			_set_soft(_d_buy, xp < cost)
		_:
			var req := POWER_TREES.get_node_def(_tree, n["req"])
			_d_status.text = tr("Önce şunu aç: %s") % tr(String(req.get("name", "")))
			_d_buy.visible = true
			_d_buy.disabled = true
			_set_soft(_d_buy, false)   # disabled → ButtonGlow zaten gizli
			_d_buy.text = tr("KİLİTLİ")


## Düğümler arası bağlantılar: ebeveynin sağ ortasından çocuğun sol ortasına (satır farkı varsa dirsekli).
## Renk çocuğun durumu (yeşil/sarı/kırmızı); açık: dolu kalın, açılabilir: dolu ince, kilitli: kesikli soluk.
func _draw_links() -> void:
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		if n["req"] == "":
			continue
		var parent := POWER_TREES.get_node_def(_tree, n["req"])
		var a := _node_pos(parent) + Vector2(NODE_SIZE.x, NODE_SIZE.y * 0.5)
		var b := _node_pos(n) + Vector2(0, NODE_SIZE.y * 0.5)
		var state := _node_state(n)
		var col := Color(STATE_COLORS[state], 0.8 if state == "owned" else (0.6 if state == "open" else 0.35))
		var w := 3.0 if state == "owned" else 2.5
		var pts: PackedVector2Array
		if is_equal_approx(a.y, b.y):
			pts = PackedVector2Array([a, b])
		else:
			var mid := (a.x + b.x) * 0.5
			pts = PackedVector2Array([a, Vector2(mid, a.y), Vector2(mid, b.y), b])
		for i in pts.size() - 1:
			if state == "locked":
				_canvas.draw_dashed_line(pts[i], pts[i + 1], col, w, 8.0)
			else:
				_canvas.draw_line(pts[i], pts[i + 1], col, w)
