## MainMenu.gd
## Giriş ekranı (BF1 düzeni): solda oyun kimliği + operatör kartı, sağ üstte gezinme `OYNA | PROFİL | AYARLAR`.
## OYNA alt menüyü açar (ODALAR / ODA KUR / KOD İLE KATIL); madde üzerine gelince fener oraya tutulur
## (2D: canvas_ui_menu_beam.gdshader lekesi, 3D: MenuBackground3D fareyi bırakıp maddeye kilitlenir).
## Maddeye tıklayınca ekranı kaplamayan cam panel açılır, arka plan bulanıklaşır (BlurBackdrop).
## UI tamamen kodla kurulur; görünüm UITheme temasından gelir. Değerler 1920×1080 tabanına göre (UITheme.BASE_RESOLUTION).
## Arka plan MenuBackground3D: taktik ızgara zeminde fenerli askerler devriye gezer + fareyi takip eden fener
## (üstünde MenuOverlay.gdshader vinyeti).

extends Control

const SETTINGS_PATH := "user://settings.cfg"
const NAME_MAX_LEN := 16
const CALLSIGNS: Array[String] = ["Kurt", "Gölge", "Baykuş", "Şahin", "Kobra", "Tilki", "Atmaca", "Hayalet", "Puma", "Akrep"]

const MENU_BACKGROUND := preload("res://scenes/ui/MenuBackground3D.gd")
const MENU_OVERLAY := preload("res://scenes/ui/MenuOverlay.gdshader")
const MENU_BEAM := preload("res://scenes/ui/canvas_ui_menu_beam.gdshader")
const BLUR_BACKDROP := preload("res://scenes/ui/BlurBackdrop.gdshader")
const UPGRADE_PAGE := preload("res://scenes/ui/UpgradePage.gd")
const MENU_MUSIC := preload("res://scenes/audio/MenuMusic.gd")
const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const SETTINGS_WINDOW := preload("res://scenes/ui/SettingsWindow.gd")
const GAME_SETTINGS := preload("res://scenes/settings/GameSettings.gd")
const SFX := preload("res://scenes/audio/Sfx.gd")

## OYNA alt menüsü: [anahtar, metin, panel başlığı] — anahtar = _pages anahtarı
const PLAY_ITEMS := [["browse", "ODALAR"], ["create", "ODA KUR"], ["code", "KOD İLE KATIL"]]
## Oyun paneli genişliği sayfaya göre (yükseklik: odalar sabit, diğerleri içerik kadar) — ekranı kaplamasın
const PLAY_CARD_SIZE := {"browse": Vector2(1150, 760), "create": Vector2(1000, 0), "code": Vector2(680, 0)}
const TOAST_TIME := 5.0

var _settings_window: Control
var _menu_bg_setting := true

# Profil (üst menü PROFİL → bulanık pencere)
var _profile_level_lbl: Label
var _profile_xp_lbl: Label
var _profile_modal: Control
var _profile_card: Control
var _profile_page: Node
var _profile_blur: ShaderMaterial
var _background: Node = null

# Üst gezinme + OYNA alt menüsü
var _nav_play: Button
var _play_menu: VBoxContainer
var _play_open := false
var _play_items: Dictionary = {}    # anahtar → {"button", "beam" (ShaderMaterial), "marker"}
var _rooms_badge: Label             # ODALAR yanında bulunan oda sayısı

# Oyun paneli (bulanık arka plan + cam kart; sayfalar burada)
var _play_modal: Control
var _play_blur: ShaderMaterial
var _play_card: PanelContainer
var _play_crumb: Label

var _name_input: LineEdit
var _status_lbl: Label
var _pages: Dictionary = {}         # sayfa adı → Control
var _current_tab := ""

# Panel kapalıyken durum mesajları (bağlantı hatası, maçtan atılma) alt ortada bildirim olarak
var _toast: PanelContainer
var _toast_lbl: Label
var _toast_tween: Tween

# Odalar
var _room_list: VBoxContainer
var _room_scroll: ScrollContainer
var _empty_state: Control
var _scan_dot: Label
var _room_count_lbl: Label

# Oda kur
var _room_name_input: LineEdit
var _password_input: LineEdit
var _map_option: OptionButton
var _map_limit_lbl: Label           # "EN FAZLA 3v3v3v3" (haritanın sınırı)
var _size_buttons: Array[Button] = []   # 2v2v2v2 … 5v5v5v5 (ButtonGroup)
var _players_lbl: Label             # "12 OYUNCU"
var _team_size := 0
var _host_btn: Button

# Kod ile katıl
var _code_input: LineEdit
var _code_pw_input: LineEdit
var _join_btn: Button

# Şifre modalı
var _modal: Control
var _modal_room_lbl: Label
var _modal_pw_input: LineEdit
var _modal_status: Label
var _modal_room_ip := ""


func _ready() -> void:
	UITheme.apply(get_tree())  # sahne tek başına (F6) çalıştırılırsa da tema gelsin
	NetworkManager.server_created.connect(_on_server_created)
	NetworkManager.joined_server.connect(_on_joined_server)
	NetworkManager.connection_failed.connect(_on_connection_failed)
	NetworkManager.kicked.connect(_on_kicked)
	RoomManager.rooms_updated.connect(_refresh_room_list)

	_build_ui()
	MENU_MUSIC.play(get_tree())   # karakter seçimine kadar sürer (lobi de çalar, kesilmez)
	_name_input.text = _load_name()
	_show_tab("browse")
	_update_listening()
	# Maçtan atılarak dönüldüyse (yükleme süresi aşımı) sebebi göster
	if not GameManager.menu_notice.is_empty():
		_set_status(tr(GameManager.menu_notice), "error")
		GameManager.menu_notice = ""


## Dil değişince (AYARLAR → OYUN → Dil) kodla biçimlenmiş metinleri yeniden yaz — sabit metinleri Control'ler kendisi çevirir
func _notification(what: int) -> void:
	if what != NOTIFICATION_TRANSLATION_CHANGED or _room_list == null:
		return
	_refresh_profile_summary()
	_refresh_room_list()
	_update_size_options()


func _process(_delta: float) -> void:
	# "Taranıyor" göstergesi nabız gibi yanıp söner
	if _scan_dot and _play_modal.visible and _current_tab == "browse":
		_scan_dot.modulate.a = 0.35 + 0.65 * (0.5 + 0.5 * sin(Time.get_ticks_msec() / 260.0))


## ESC sırası: şifre modalı → oyun paneli → profil → OYNA alt menüsü (ayarlar penceresi kendi ESC'sini yönetir)
func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("ui_cancel"):
		return
	if _modal.visible:
		_close_modal()
	elif _play_modal.visible:
		_close_play_panel()
	elif _profile_modal.visible:
		_close_profile()
	elif _play_open:
		_set_play_open(false)
	else:
		return
	get_viewport().set_input_as_handled()


# ─────────────────────────────────────────────
#  Yerleşim
# ─────────────────────────────────────────────

func _build_ui() -> void:
	# 3D arka plan: ızgara zeminde fenerli askerler devriye gezer + fareyi takip eden fener
	_background = MENU_BACKGROUND.new()
	add_child(_background)
	var overlay := ColorRect.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var om := ShaderMaterial.new()
	om.shader = MENU_OVERLAY
	overlay.material = om
	add_child(overlay)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_theme_constant_override("margin_left", 93)
	margin.add_theme_constant_override("margin_right", 93)
	margin.add_theme_constant_override("margin_top", 73)
	margin.add_theme_constant_override("margin_bottom", 60)
	add_child(margin)

	var columns := HBoxContainer.new()
	columns.mouse_filter = Control.MOUSE_FILTER_IGNORE
	columns.add_theme_constant_override("separation", 80)
	margin.add_child(columns)

	columns.add_child(_build_brand_column())
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	columns.add_child(gap)
	columns.add_child(_build_nav_column())

	_build_toast()
	_build_play_modal()
	_build_password_modal()
	_build_profile_modal()
	_settings_window = SETTINGS_WINDOW.new()
	_settings_window.closed.connect(_on_settings_closed)
	add_child(_settings_window)


## AYARLAR (grafik / kontrol / ses / oyun) — SettingsWindow kendi ESC/kapama mantığını yönetir
func _open_settings() -> void:
	_set_play_open(false)
	_menu_bg_setting = bool(GAME_SETTINGS.get_value("menu_background"))
	_settings_window.open()


func _on_settings_closed() -> void:
	# "Menü 3D arka planı" değiştiyse arka planı yeniden kur (askerler eklensin/kalksın)
	if bool(GAME_SETTINGS.get_value("menu_background")) != _menu_bg_setting and _background:
		var idx := _background.get_index()
		_background.queue_free()
		_background = MENU_BACKGROUND.new()
		add_child(_background)
		move_child(_background, idx)


## Bulanık tam ekran katman + ortalayıcı. Dışına (bulanık alana) sol tık `on_close`'u çağırır.
## Dönüş: [katman, blur ShaderMaterial, CenterContainer]
func _make_blur_layer(on_close: Callable) -> Array:
	var layer := Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.visible = false
	add_child(layer)

	var blur := ColorRect.new()
	blur.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	blur.mouse_filter = Control.MOUSE_FILTER_STOP
	var mat := ShaderMaterial.new()
	mat.shader = BLUR_BACKDROP
	blur.material = mat
	blur.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			on_close.call())
	layer.add_child(blur)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(center)
	return [layer, mat, center]


## Panel başlığı: solda küçük kehribar başlık, sağda ✕
func _modal_head(title: Label, on_close: Callable) -> Control:
	var head := HBoxContainer.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(title)
	var close := Button.new()
	close.text = "✕"
	close.theme_type_variation = "GhostButton"
	close.focus_mode = Control.FOCUS_NONE
	close.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	close.pressed.connect(on_close)
	head.add_child(close)
	return head


func _fade_layer(layer: Control, mat: ShaderMaterial, card: Control, show: bool) -> void:
	var tw := create_tween().set_parallel(true)
	if show:
		layer.visible = true   # açılış sesi yok — kullanıcı: sadece düğmenin fener tıkı
		card.modulate.a = 0.0
		tw.tween_method(func(v: float) -> void: mat.set_shader_parameter("amount", v), 0.0, 1.0, 0.18)
		tw.tween_property(card, "modulate:a", 1.0, 0.16)
	else:
		tw.tween_method(func(v: float) -> void: mat.set_shader_parameter("amount", v), 1.0, 0.0, 0.14)
		tw.tween_property(card, "modulate:a", 0.0, 0.12)
		tw.chain().tween_callback(func() -> void: layer.visible = false)


## PROFİL penceresi: bulanık arka plan + ortada UpgradePage (karakter başına yükseltme). Dışına tık / ✕ / ESC kapatır.
func _build_profile_modal() -> void:
	var parts := _make_blur_layer(_close_profile)
	_profile_modal = parts[0]
	_profile_blur = parts[1]

	# UpgradePage ~1000 px yüksek → başlık satırı yok, kenar payı ince (1080'e sığsın); ✕ ekranın sağ üstünde
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(1667, 0)
	card.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.BG, 0.97), 23, Color(UITheme.ACCENT, 0.35), 1, 43, 20))
	UITheme.add_brackets(card, UITheme.FRAME, 33)
	(parts[2] as Control).add_child(card)
	_profile_card = card
	_profile_page = UPGRADE_PAGE.new()
	card.add_child(_profile_page)

	var close := _modal_head(Label.new(), _close_profile)
	close.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	close.offset_left = -100
	close.offset_right = -23
	close.offset_top = 17
	_profile_modal.add_child(close)


func _open_profile() -> void:
	_set_play_open(false)
	_profile_page.refresh()
	_fade_layer(_profile_modal, _profile_blur, _profile_card, true)


func _close_profile() -> void:
	if not _profile_modal.visible:
		return
	_refresh_profile_summary()
	_fade_layer(_profile_modal, _profile_blur, _profile_card, false)


func _refresh_profile_summary() -> void:
	if _profile_xp_lbl:
		_profile_level_lbl.text = tr("PROFİL SEVİYESİ %d") % PROFILE.profile_level()
		_profile_xp_lbl.text = "◆ %d XP" % PROFILE.get_xp()


func _build_brand_column() -> Control:
	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(600, 0)
	col.add_theme_constant_override("separation", 0)

	col.add_child(UITheme.label("TACTICAL", 57, UITheme.TEXT, UITheme.font_title))
	var dark := UITheme.label("DARK", 120, UITheme.ACCENT, UITheme.font_title)
	dark.add_theme_constant_override("line_spacing", -20)
	col.add_child(dark)
	# Logo altı kehribar çizgi (yazısız — kullanıcı isteğiyle etiketler kaldırıldı)
	var bar := ColorRect.new()
	bar.color = UITheme.ACCENT
	bar.custom_minimum_size = Vector2(93, 5)
	bar.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	col.add_child(bar)
	col.add_child(_spacer(23))

	var tagline := UITheme.label("Zifiri karanlıkta yalnızca el fenerin var.\nKartı bul, kapıya ulaştır, takımını zafere taşı.", 23, UITheme.TEXT_DIM)
	tagline.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(tagline)

	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(fill)

	# Operatör kartı: ad + profil özeti (PROFİL butonu üst menüde)
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", UITheme.style(UITheme.SURFACE, 20, UITheme.BORDER, 1, 30, 27))
	UITheme.add_brackets(card, UITheme.FRAME, 17)
	col.add_child(card)
	var card_box := VBoxContainer.new()
	card_box.add_theme_constant_override("separation", 13)
	card.add_child(card_box)
	card_box.add_child(UITheme.label("OPERATÖR ADI", 18, UITheme.TEXT_DIM, UITheme.font_caps))

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 13)
	card_box.add_child(name_row)
	_name_input = LineEdit.new()
	_name_input.placeholder_text = "Oyuncu adı"
	_name_input.max_length = NAME_MAX_LEN
	_name_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name_input.add_theme_font_override("font", UITheme.font_bold)
	_name_input.add_theme_font_size_override("font_size", 28)
	_name_input.text_changed.connect(func(_t: String) -> void: _set_status(""))
	name_row.add_child(_name_input)
	var dice := Button.new()
	dice.text = "↻"
	dice.tooltip_text = "Rastgele isim"
	dice.custom_minimum_size = Vector2(77, 0)
	dice.add_theme_font_size_override("font_size", 30)
	dice.pressed.connect(func() -> void: _name_input.text = _random_name())
	name_row.add_child(dice)

	card_box.add_child(_spacer(7))
	var prof_row := HBoxContainer.new()
	prof_row.add_theme_constant_override("separation", 17)
	card_box.add_child(prof_row)
	_profile_level_lbl = UITheme.label("", 17, UITheme.TEXT_DIM, UITheme.font_caps)
	_profile_level_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_profile_level_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	prof_row.add_child(_profile_level_lbl)
	_profile_xp_lbl = UITheme.label("", 27, UITheme.ACCENT, UITheme.font_mono)
	prof_row.add_child(_profile_xp_lbl)
	_refresh_profile_summary()
	return col


## Sağ üst: OYNA | PROFİL | AYARLAR + OYNA'nın açtığı alt menü (sağa yaslı)
func _build_nav_column() -> Control:
	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(600, 0)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 0)

	var nav := HBoxContainer.new()
	nav.alignment = BoxContainer.ALIGNMENT_END
	nav.add_theme_constant_override("separation", 7)
	col.add_child(nav)
	_nav_play = _nav_button("OYNA", func() -> void: _set_play_open(not _play_open))
	_nav_play.toggle_mode = true
	nav.add_child(_nav_play)
	nav.add_child(_nav_divider())
	nav.add_child(_nav_button("PROFİL", _open_profile))
	nav.add_child(_nav_divider())
	nav.add_child(_nav_button("AYARLAR", _open_settings))

	col.add_child(_spacer(47))
	_play_menu = VBoxContainer.new()
	_play_menu.add_theme_constant_override("separation", 10)
	_play_menu.visible = false
	col.add_child(_play_menu)
	for item: Array in PLAY_ITEMS:
		_play_menu.add_child(_build_play_item(item[0], item[1]))
	return col


func _nav_button(text: String, on_press: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.theme_type_variation = "TabButton"
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_size_override("font_size", 27)
	b.pressed.connect(on_press)
	return b


func _nav_divider() -> Label:
	var l := UITheme.label("|", 27, Color(UITheme.TEXT_DIM, 0.3))
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return l


## Alt menü maddesi: [▸ işareti][metin][oda sayısı] — arkasında fener lekesi (show_behind_parent ColorRect)
func _build_play_item(key: String, text: String) -> Control:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 7)

	var marker := UITheme.label("▸", 40, UITheme.ACCENT)
	marker.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	marker.modulate.a = 0.0
	row.add_child(marker)

	var b := Button.new()
	b.text = text
	b.flat = true
	b.alignment = HORIZONTAL_ALIGNMENT_RIGHT
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font", UITheme.font_caps)
	b.add_theme_font_size_override("font_size", 43)
	b.add_theme_color_override("font_color", Color(UITheme.TEXT_DIM, 0.85))
	for state: String in ["font_hover_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(state, Color.WHITE)
	b.add_theme_color_override("font_pressed_color", UITheme.ACCENT)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.pressed.connect(_open_play_panel.bind(key))
	row.add_child(b)

	# Fener lekesi: yazıdan geniş, sola doğru (fener sağ üstten gelir gibi) taşar; tıklamaları engellemez
	var beam := ColorRect.new()
	beam.show_behind_parent = true
	beam.mouse_filter = Control.MOUSE_FILTER_IGNORE
	beam.set_anchors_preset(Control.PRESET_FULL_RECT)
	beam.offset_left = -200
	beam.offset_right = 67
	beam.offset_top = -37
	beam.offset_bottom = 37
	var mat := ShaderMaterial.new()
	mat.shader = MENU_BEAM
	beam.material = mat
	b.add_child(beam)

	if key == "browse":
		_rooms_badge = UITheme.label("", 22, UITheme.ACCENT, UITheme.font_mono)
		_rooms_badge.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		row.add_child(_rooms_badge)

	_play_items[key] = {"button": b, "beam": mat, "marker": marker}
	b.mouse_entered.connect(_set_item_lit.bind(key, true))
	b.mouse_exited.connect(_set_item_lit.bind(key, false))
	b.focus_entered.connect(_set_item_lit.bind(key, true))
	b.focus_exited.connect(_set_item_lit.bind(key, false))
	return row


## Fener maddeye döner / maddeden ayrılır: 2D leke + işaret + 3D arka plan feneri maddeye kilitlenir
func _set_item_lit(key: String, lit: bool) -> void:
	var item: Dictionary = _play_items[key]
	var b: Button = item["button"]
	# Fare hâlâ üstündeyse odak kaybı söndürmesin (ve tersi)
	if not lit and (b.has_focus() or b.is_hovered()):
		return
	var mat: ShaderMaterial = item["beam"]
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	# Parametre hiç atanmadıysa get_shader_parameter null döner → son değer sözlükte tutulur
	tw.tween_method(func(v: float) -> void:
		item["level"] = v
		mat.set_shader_parameter("intensity", v),
		float(item.get("level", 0.0)), 1.0 if lit else 0.0, 0.22 if lit else 0.35)
	tw.tween_property(item["marker"], "modulate:a", 1.0 if lit else 0.0, 0.18)
	if _background and _background.has_method("focus_light"):
		if lit:
			_background.focus_light(b.get_global_rect().get_center())
		else:
			_background.release_light()


func _set_play_open(open: bool) -> void:
	if _play_open == open:
		return
	_play_open = open
	_nav_play.set_pressed_no_signal(open)
	_update_listening()
	if open:
		_refresh_room_list()
		_play_menu.visible = true
		# Maddeler sırayla belirir (yukarıdan aşağı, kısa gecikmeyle)
		var i := 0
		for row: Control in _play_menu.get_children():
			row.modulate.a = 0.0
			create_tween().tween_property(row, "modulate:a", 1.0, 0.2).set_delay(0.05 * i)
			i += 1
		(_play_items["browse"]["button"] as Button).grab_focus()
	else:
		for key: String in _play_items:
			(_play_items[key]["button"] as Button).release_focus()
		_play_menu.visible = false
		if _background and _background.has_method("release_light"):
			_background.release_light()


## Oda keşfi: OYNA alt menüsü ya da oyun paneli açıkken dinle (liste panel açılmadan dolsun, ODALAR sayacı canlı)
func _update_listening() -> void:
	if _play_open or (_play_modal and _play_modal.visible):
		RoomManager.start_listening()
	else:
		RoomManager.stop_listening()


# ─────────────────────────────────────────────
#  Oyun paneli (Odalar / Oda Kur / Kod ile Katıl)
# ─────────────────────────────────────────────

func _build_play_modal() -> void:
	var parts := _make_blur_layer(_close_play_panel)
	_play_modal = parts[0]
	_play_blur = parts[1]

	_play_card = PanelContainer.new()
	_play_card.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.BG, 0.9), 23, UITheme.BORDER, 1, 43, 33))
	UITheme.add_brackets(_play_card, UITheme.FRAME, 30)
	(parts[2] as Control).add_child(_play_card)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 20)
	_play_card.add_child(box)
	_play_crumb = UITheme.label("", 20, UITheme.ACCENT, UITheme.font_caps)
	box.add_child(_modal_head(_play_crumb, _close_play_panel))

	var pages_box := VBoxContainer.new()
	pages_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(pages_box)
	_pages["browse"] = _build_browse_page()
	_pages["create"] = _build_create_page()
	_pages["code"]   = _build_code_page()
	for key: String in _pages:
		(_pages[key] as Control).size_flags_vertical = Control.SIZE_EXPAND_FILL
		pages_box.add_child(_pages[key])

	_status_lbl = UITheme.label("", 22, UITheme.TEXT_DIM)
	_status_lbl.custom_minimum_size = Vector2(0, 33)
	_status_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_status_lbl)


func _open_play_panel(which: String) -> void:
	_show_tab(which)
	if not _play_modal.visible:
		_fade_layer(_play_modal, _play_blur, _play_card, true)
	_update_listening()
	# İlk alana odak — klavyeyle doğrudan yazılabilsin
	match which:
		"create": _room_name_input.grab_focus()
		"code": _code_input.grab_focus()


func _close_play_panel() -> void:
	if not _play_modal.visible:
		return
	_fade_layer(_play_modal, _play_blur, _play_card, false)
	_set_status("")
	# Alt menü açık kalır; odak geri gelsin (klavyeyle gezinme kopmasın)
	if _play_open:
		(_play_items[_current_tab]["button"] as Button).grab_focus()
	_update_listening.call_deferred()


func _build_browse_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 23)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 17)
	page.add_child(header)
	var title_box := VBoxContainer.new()
	title_box.add_theme_constant_override("separation", 3)
	title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_box)
	title_box.add_child(UITheme.label("Yerel Ağdaki Odalar", 33, UITheme.TEXT, UITheme.font_bold))
	var scan_row := HBoxContainer.new()
	scan_row.add_theme_constant_override("separation", 10)
	title_box.add_child(scan_row)
	_scan_dot = UITheme.label("●", 17, UITheme.SUCCESS)
	scan_row.add_child(_scan_dot)
	_room_count_lbl = UITheme.label("", 18, UITheme.TEXT_DIM, UITheme.font_caps)
	scan_row.add_child(_room_count_lbl)

	var refresh := Button.new()
	refresh.text = "↻  Yenile"
	refresh.theme_type_variation = "GhostButton"
	refresh.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	refresh.pressed.connect(_on_refresh_pressed.bind(refresh))
	header.add_child(refresh)

	var stack := Control.new()
	stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(stack)

	_room_scroll = ScrollContainer.new()
	_room_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_room_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(_room_scroll)
	_room_list = VBoxContainer.new()
	_room_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_room_list.add_theme_constant_override("separation", 13)
	_room_scroll.add_child(_room_list)

	# Boş durum
	var empty := CenterContainer.new()
	empty.set_anchors_preset(Control.PRESET_FULL_RECT)
	stack.add_child(empty)
	_empty_state = empty
	var empty_box := VBoxContainer.new()
	empty_box.add_theme_constant_override("separation", 10)
	empty.add_child(empty_box)
	var icon := UITheme.label("◎", 73, Color(UITheme.ACCENT, 0.5))
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_box.add_child(icon)
	var e1 := UITheme.label("Henüz oda bulunamadı", 28, UITheme.TEXT, UITheme.font_bold)
	e1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_box.add_child(e1)
	var e2 := UITheme.label("Aynı ağdaki odalar burada otomatik belirir.", 22, UITheme.TEXT_DIM)
	e2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	empty_box.add_child(e2)
	empty_box.add_child(_spacer(13))
	var e_btns := HBoxContainer.new()
	e_btns.alignment = BoxContainer.ALIGNMENT_CENTER
	e_btns.add_theme_constant_override("separation", 17)
	empty_box.add_child(e_btns)
	var go_create := Button.new()
	go_create.text = "Oda Kur"
	go_create.theme_type_variation = "PrimaryButton"
	go_create.pressed.connect(_open_play_panel.bind("create"))
	e_btns.add_child(go_create)
	var go_code := Button.new()
	go_code.text = "Kod ile Katıl"
	go_code.pressed.connect(_open_play_panel.bind("code"))
	e_btns.add_child(go_code)
	return page


func _build_create_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 20)
	page.add_child(UITheme.label("Yeni Oda Kur", 33, UITheme.TEXT, UITheme.font_bold))
	var info := UITheme.label("Odan yerel ağda yayınlanır. Arkadaşların listeden ya da oda kodunla katılabilir.", 22, UITheme.TEXT_DIM)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	page.add_child(info)
	# Oda adı + şifre yan yana (panel kısa kalsın — ekranı kaplamasın)
	var id_row := HBoxContainer.new()
	id_row.add_theme_constant_override("separation", 20)
	page.add_child(id_row)
	_room_name_input = LineEdit.new()
	_room_name_input.max_length = 32
	_room_name_input.text_submitted.connect(func(_t: String) -> void: _on_host_pressed())
	_room_name_input.focus_entered.connect(func() -> void:
		_room_name_input.placeholder_text = tr("%s'nin Odası") % _get_player_name(tr("Oyuncu")))
	var name_field := _field("ODA ADI", _room_name_input)
	name_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	id_row.add_child(name_field)
	_password_input = LineEdit.new()
	_password_input.placeholder_text = "Herkese açık"
	_password_input.secret = true
	_password_input.text_submitted.connect(func(_t: String) -> void: _on_host_pressed())
	var pw_field := _field("ŞİFRE  (OPSİYONEL)", _password_input, _make_reveal_button(_password_input))
	pw_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	id_row.add_child(pw_field)

	# Harita (tam satır) + format (bölümlü düğmeler). Lobby ODA AYARLARI ile aynı kural: harita takım boyutunu sınırlar
	_map_option = OptionButton.new()
	for m: Dictionary in NetworkManager.MAPS:
		_map_option.add_item(m["name"])
	_map_option.item_selected.connect(func(_i: int) -> void: _update_size_options())
	_map_option.custom_minimum_size.y = 73
	_map_option.clip_text = true
	_map_limit_lbl = UITheme.label("", 18, UITheme.TEXT_DIM, UITheme.font_caps)
	page.add_child(_caption_field("HARİTA", _map_limit_lbl, _map_option))

	var seg := HBoxContainer.new()
	seg.add_theme_constant_override("separation", 10)
	var group := ButtonGroup.new()
	for s in range(NetworkManager.TEAM_SIZE_MIN, NetworkManager.TEAM_SIZE_MAX + 1):
		var b := Button.new()
		b.text = NetworkManager.get_format_text(s)
		b.toggle_mode = true
		b.button_group = group
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size.y = 67
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_override("font", UITheme.font_mono)
		b.toggled.connect(func(on: bool) -> void:
			if on:
				_select_size(s))
		seg.add_child(b)
		_size_buttons.append(b)
	_players_lbl = UITheme.label("", 18, UITheme.TEXT_DIM, UITheme.font_caps)
	page.add_child(_caption_field("FORMAT", _players_lbl, seg))
	_load_room_prefs()

	page.add_child(_spacer(7))
	_host_btn = Button.new()
	_host_btn.text = "ODAYI KUR"
	_host_btn.theme_type_variation = "PrimaryButton"
	_host_btn.custom_minimum_size = Vector2(0, 83)
	_host_btn.add_theme_font_size_override("font_size", 27)
	_host_btn.pressed.connect(_on_host_pressed)
	page.add_child(_host_btn)
	return page


func _build_code_page() -> Control:
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 23)
	page.add_child(UITheme.label("Kod ile Katıl", 33, UITheme.TEXT, UITheme.font_bold))
	var info := UITheme.label("Oda sahibinden 7 haneli oda kodunu iste. Yerel test için IP adresi de yazabilirsin.", 22, UITheme.TEXT_DIM)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	page.add_child(info)
	page.add_child(_spacer(7))

	_code_input = LineEdit.new()
	_code_input.placeholder_text = "ABCD234"
	_code_input.max_length = 15
	_code_input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_code_input.add_theme_font_override("font", UITheme.font_mono)
	_code_input.add_theme_font_size_override("font_size", 47)
	_code_input.text_changed.connect(_on_code_text_changed)
	_code_input.text_submitted.connect(func(_t: String) -> void: _on_join_code_pressed())
	page.add_child(_field("ODA KODU", _code_input))

	_code_pw_input = LineEdit.new()
	_code_pw_input.placeholder_text = "Oda şifreliyse"
	_code_pw_input.secret = true
	_code_pw_input.text_submitted.connect(func(_t: String) -> void: _on_join_code_pressed())
	page.add_child(_field("ŞİFRE", _code_pw_input, _make_reveal_button(_code_pw_input)))

	page.add_child(_spacer(13))
	_join_btn = Button.new()
	_join_btn.text = "KATIL"
	_join_btn.theme_type_variation = "PrimaryButton"
	_join_btn.custom_minimum_size = Vector2(0, 83)
	_join_btn.add_theme_font_size_override("font_size", 27)
	_join_btn.pressed.connect(_on_join_code_pressed)
	page.add_child(_join_btn)
	return page


func _build_password_modal() -> void:
	_modal = ColorRect.new()
	(_modal as ColorRect).color = Color(0, 0, 0, 0.65)
	_modal.set_anchors_preset(Control.PRESET_FULL_RECT)
	_modal.mouse_filter = Control.MOUSE_FILTER_STOP
	_modal.visible = false
	add_child(_modal)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_modal.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(633, 0)
	var card_style := UITheme.style(UITheme.SURFACE_2, 27, Color(UITheme.ACCENT, 0.3), 1, 40, 37)
	card_style.shadow_color = Color(0, 0, 0, 0.5)
	card_style.shadow_size = 50
	card.add_theme_stylebox_override("panel", card_style)
	center.add_child(card)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 20)
	card.add_child(box)
	box.add_child(UITheme.label("🔒  ŞİFRELİ ODA", 20, UITheme.ACCENT, UITheme.font_caps))
	_modal_room_lbl = UITheme.label("", 33, UITheme.TEXT, UITheme.font_bold)
	_modal_room_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # oda adı kullanıcı metni
	box.add_child(_modal_room_lbl)

	_modal_pw_input = LineEdit.new()
	_modal_pw_input.placeholder_text = "Oda şifresi"
	_modal_pw_input.secret = true
	_modal_pw_input.text_submitted.connect(func(_t: String) -> void: _on_modal_join())
	box.add_child(_modal_pw_input)

	_modal_status = UITheme.label("", 20, UITheme.DANGER)
	box.add_child(_modal_status)

	var btns := HBoxContainer.new()
	btns.add_theme_constant_override("separation", 17)
	btns.alignment = BoxContainer.ALIGNMENT_END
	box.add_child(btns)
	var cancel := Button.new()
	cancel.text = "Vazgeç"
	cancel.theme_type_variation = "GhostButton"
	cancel.pressed.connect(_close_modal)
	btns.add_child(cancel)
	var join := Button.new()
	join.text = "KATIL"
	join.theme_type_variation = "PrimaryButton"
	join.custom_minimum_size = Vector2(200, 0)
	join.pressed.connect(_on_modal_join)
	btns.add_child(join)


## Alt ortada cam bildirim — panel kapalıyken gelen durum mesajları (bağlantı hatası, maçtan atılma) burada görünür
func _build_toast() -> void:
	_toast = PanelContainer.new()
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast.add_theme_stylebox_override("panel", UITheme.style(UITheme.SURFACE_2, UITheme.RADIUS, UITheme.BORDER, 1, 33, 17))
	_toast.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_toast.offset_bottom = -67
	_toast.modulate.a = 0.0
	add_child(_toast)
	_toast_lbl = UITheme.label("", 23, UITheme.TEXT)
	_toast.add_child(_toast_lbl)


func _show_toast(text: String, col: Color) -> void:
	_toast_lbl.text = text
	_toast_lbl.add_theme_color_override("font_color", col)
	# Genişlik metne göre değişir — ortada kalsın
	_toast.reset_size()
	_toast.offset_left = -_toast.size.x * 0.5
	_toast.offset_right = _toast.size.x * 0.5
	if _toast_tween:
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_property(_toast, "modulate:a", 1.0, 0.2)
	_toast_tween.tween_interval(TOAST_TIME)
	_toast_tween.tween_property(_toast, "modulate:a", 0.0, 0.6)


func _build_room_row(code: String, room: Dictionary) -> Control:
	var has_pw: bool = room.get("has_password", false)
	var room_ip: String = room.get("ip", "")
	var count: int = room.get("player_count", 0)
	var room_name: String = room.get("room_name", code)
	# Oda özellikleri (RoomManager broadcast — eski sürüm host'larda alanlar yoksa varsayılan)
	var team_size: int = int(room.get("team_size", NetworkManager.TEAM_SIZE_MAX))
	var max_players: int = int(room.get("max_players", NetworkManager.MAX_PLAYERS))
	var map_name: String = room.get("map_name", "Labirent")
	var in_game: bool = room.get("state", "lobby") == "game"
	var full := count >= max_players

	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", UITheme.style(UITheme.SURFACE_2, 20, UITheme.BORDER, 1, 27, 20))

	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 23)
	row.add_child(h)

	# Simge kutusu
	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(67, 67)
	icon_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon_box.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.ACCENT, 0.1), 17))
	var icon := UITheme.label("🔒" if has_pw else "◆", 27, UITheme.ACCENT)
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon_box.add_child(icon)
	h.add_child(icon_box)

	var info := VBoxContainer.new()
	info.add_theme_constant_override("separation", 3)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(info)
	var name_lbl := UITheme.label(room_name, 27, UITheme.TEXT, UITheme.font_bold)
	name_lbl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # oda adı kullanıcı metni
	info.add_child(name_lbl)
	var sub := (tr("KOD  %s  ·  ŞİFRELİ") if has_pw else tr("KOD  %s")) % code
	info.add_child(UITheme.label(sub, 17, UITheme.TEXT_DIM, UITheme.font_caps))
	# Özellik çipleri: durum · format · harita
	# Akış kabı: yer yetmezse uzun harita adı (YERALTI KUANTUM LABİRENTİ) TAM haliyle alt satıra geçer —
	# kesilmez, satırı kartın dışına da itmez (en küçük genişlik = en geniş tek çip)
	var chips := HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 10)
	chips.add_theme_constant_override("v_separation", 7)
	info.add_child(chips)
	chips.add_child(_room_chip("● OYUNDA" if in_game else "● BEKLEMEDE", UITheme.DANGER if in_game else UITheme.SUCCESS))
	chips.add_child(_room_chip(NetworkManager.get_format_text(team_size), UITheme.ACCENT))
	chips.add_child(_room_chip(tr(map_name).to_upper(), UITheme.TEXT_DIM))

	# Doluluk
	var cap_box := VBoxContainer.new()
	cap_box.add_theme_constant_override("separation", 7)
	cap_box.custom_minimum_size = Vector2(133, 0)
	cap_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(cap_box)
	var cap_lbl := UITheme.label("%d / %d" % [count, max_players], 22,
		UITheme.DANGER if full else UITheme.TEXT, UITheme.font_bold)
	cap_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	cap_box.add_child(cap_lbl)
	var cap_bar := ProgressBar.new()
	cap_bar.show_percentage = false
	cap_bar.custom_minimum_size = Vector2(0, 7)
	cap_bar.max_value = max_players
	cap_bar.value = count
	if full:
		cap_bar.add_theme_stylebox_override("fill", UITheme.style(UITheme.DANGER, 7))
	cap_box.add_child(cap_bar)

	var btn := Button.new()
	# Oyun sürerken katılım yok (host da reddeder) — bitince tekrar denenebilir
	btn.text = "OYUNDA" if in_game else ("DOLU" if full else "KATIL")
	btn.disabled = full or in_game
	btn.tooltip_text = "Oyun devam ediyor — bitince katılabilirsin" if in_game else ""
	btn.theme_type_variation = "PrimaryButton"
	btn.custom_minimum_size = Vector2(160, 67)
	btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	btn.pressed.connect(_on_room_join_btn.bind(code, room_name, room_ip, has_pw))
	h.add_child(btn)
	return row


# ─────────────────────────────────────────────
#  Küçük yardımcılar
# ─────────────────────────────────────────────

func _room_chip(text: String, color: Color) -> Control:
	var chip := PanelContainer.new()
	chip.add_theme_stylebox_override("panel", UITheme.style(Color(color, 0.12), 10, Color.TRANSPARENT, 0, 12, 2))
	chip.add_child(UITheme.label(text, 15, color, UITheme.font_caps))
	return chip



func _spacer(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _field(caption: String, input: LineEdit, trailing: Control = null) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	box.add_child(UITheme.label(caption, 18, UITheme.TEXT_DIM, UITheme.font_caps))
	input.custom_minimum_size.y = 73
	input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	input.text_changed.connect(func(_t: String) -> void: _set_status(""))
	if trailing:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 13)
		row.add_child(input)
		row.add_child(trailing)
		box.add_child(row)
	else:
		box.add_child(input)
	return box


## Başlık solda, bilgi etiketi sağda; altında kontrol
func _caption_field(caption: String, info: Label, control: Control) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	var head := HBoxContainer.new()
	var cap := UITheme.label(caption, 18, UITheme.TEXT_DIM, UITheme.font_caps)
	cap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(cap)
	head.add_child(info)
	box.add_child(head)
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_child(control)
	return box


func _select_size(size: int) -> void:
	_team_size = size
	_players_lbl.text = tr("%d OYUNCU") % (size * NetworkManager.TEAM_COUNT)
	var b := _size_buttons[size - NetworkManager.TEAM_SIZE_MIN]
	if not b.button_pressed:
		b.set_pressed_no_signal(true)


## Seçili haritanın kaldıramadığı formatlar kapanır (ör. Karantina Hastanesi en fazla 2v2v2v2); seçim sığmıyorsa kırpılır
func _update_size_options() -> void:
	var map_max := NetworkManager.get_map_max_team(NetworkManager.MAPS[_map_option.selected]["id"])
	for i in _size_buttons.size():
		_size_buttons[i].disabled = NetworkManager.TEAM_SIZE_MIN + i > map_max
	_map_limit_lbl.text = "" if map_max >= NetworkManager.TEAM_SIZE_MAX \
		else tr("EN FAZLA %s") % NetworkManager.get_format_text(map_max)
	_select_size(mini(_team_size, map_max))


## Son kurulan odanın harita/format seçimi hatırlanır (user://settings.cfg [room])
func _load_room_prefs() -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)
	var map_id: String = cfg.get_value("room", "map", NetworkManager.MAPS[0]["id"])
	_map_option.select(0)
	for i in NetworkManager.MAPS.size():
		if NetworkManager.MAPS[i]["id"] == map_id:
			_map_option.select(i)
	_team_size = clampi(int(cfg.get_value("room", "team_size", NetworkManager.TEAM_SIZE_MAX)),
		NetworkManager.TEAM_SIZE_MIN, NetworkManager.TEAM_SIZE_MAX)
	_update_size_options()


func _save_room_prefs(map_id: String, size: int) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)
	cfg.set_value("room", "map", map_id)
	cfg.set_value("room", "team_size", size)
	cfg.save(SETTINGS_PATH)


func _make_reveal_button(target: LineEdit) -> Button:
	var b := Button.new()
	b.text = "Göster"
	b.toggle_mode = true
	b.theme_type_variation = "GhostButton"
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(127, 0)
	b.toggled.connect(func(on: bool) -> void:
		target.secret = not on
		b.text = "Gizle" if on else "Göster")
	return b


## Durum: panel açıkken panelin altında, kapalıyken alt ortada bildirim (boş metin bildirimi tetiklemez)
func _set_status(text: String, kind: String = "info") -> void:
	if _status_lbl == null:
		return
	_status_lbl.text = text
	var col := UITheme.TEXT_DIM
	match kind:
		"error": col = UITheme.DANGER
		"ok":    col = UITheme.SUCCESS
		"busy":  col = UITheme.ACCENT
	_status_lbl.add_theme_color_override("font_color", col)
	if not text.is_empty() and not _play_modal.visible:
		_show_toast(text, col)


func _set_busy(busy: bool) -> void:
	_host_btn.disabled = busy
	_join_btn.disabled = busy


## Geçerli oyuncu adını döner; boşsa hata gösterip "" döner (fallback verilirse onu döner).
func _get_player_name(fallback: String = "") -> String:
	var n := _name_input.text.strip_edges()
	if n.is_empty() and fallback.is_empty():
		# Ad kutusu bulanık panelin arkasında kalmasın — paneli kapat, ada odaklan
		_close_play_panel()
		_set_status("Önce bir operatör adı gir.", "error")
		_name_input.grab_focus()
	return n if not n.is_empty() else fallback


func _random_name() -> String:
	return "%s_%d" % [CALLSIGNS.pick_random(), randi_range(10, 99)]


func _load_name() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		var saved: String = cfg.get_value("player", "name", "")
		if not saved.is_empty():
			return saved
	return _random_name()


func _save_name(player_name: String) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)
	cfg.set_value("player", "name", player_name)
	cfg.save(SETTINGS_PATH)


# ─────────────────────────────────────────────
#  Sayfalar
# ─────────────────────────────────────────────

func _show_tab(which: String) -> void:
	_play_crumb.text = tr("OYNA  /  %s") % tr(_play_item_text(which))
	if _current_tab == which:
		return
	_current_tab = which
	for key: String in _pages:
		(_pages[key] as Control).visible = (key == which)
	_play_card.custom_minimum_size = PLAY_CARD_SIZE[which]
	_play_card.reset_size()
	_set_status("")
	if which == "browse":
		_refresh_room_list()


func _play_item_text(key: String) -> String:
	for item: Array in PLAY_ITEMS:
		if item[0] == key:
			return item[1]
	return ""


# ─────────────────────────────────────────────
#  Odalar
# ─────────────────────────────────────────────

## Yenile: dinlemeyi baştan kurar (liste temizlenir, odalar yayın aralığı ≤2 sn içinde tekrar gelir) + görsel geri bildirim
func _on_refresh_pressed(btn: Button) -> void:
	RoomManager.refresh()
	_refresh_room_list()
	btn.disabled = true
	btn.text = "↻  Taranıyor…"
	await get_tree().create_timer(2.2).timeout
	if is_instance_valid(btn):
		btn.disabled = false
		btn.text = "↻  Yenile"


func _refresh_room_list() -> void:
	for child in _room_list.get_children():
		child.queue_free()
	var rooms := RoomManager.discovered_rooms
	_empty_state.visible = rooms.is_empty()
	_room_scroll.visible = not rooms.is_empty()
	if _rooms_badge:
		_rooms_badge.text = "" if rooms.is_empty() else str(rooms.size())
	if not RoomManager.is_listening():
		_room_count_lbl.text = "DİNLEME PORTU MEŞGUL · TEKRAR DENENİYOR..."
	else:
		_room_count_lbl.text = tr("TARANIYOR...") if rooms.is_empty() else tr("%d ODA BULUNDU") % rooms.size()
	for code: String in rooms:
		_room_list.add_child(_build_room_row(code, rooms[code]))


func _on_room_join_btn(room_code: String, room_name: String, room_ip: String, has_password: bool) -> void:
	var player_name := _get_player_name()
	if player_name.is_empty():
		return
	if has_password:
		_modal_room_ip = room_ip
		_modal_room_lbl.text = room_name
		_modal_pw_input.text = ""
		_modal_status.text = ""
		_modal.visible = true
		_modal_pw_input.grab_focus()
	else:
		_save_name(player_name)
		_set_status(tr("Bağlanıyor: %s ...") % room_name, "busy")
		NetworkManager.join_server(room_ip, player_name, "")


func _on_modal_join() -> void:
	var player_name := _get_player_name()
	if player_name.is_empty():
		_close_modal()
		return
	_save_name(player_name)
	_modal_status.add_theme_color_override("font_color", UITheme.ACCENT)
	_modal_status.text = "Bağlanıyor..."
	NetworkManager.join_server(_modal_room_ip, player_name, _modal_pw_input.text)


func _close_modal() -> void:
	_modal.visible = false


# ─────────────────────────────────────────────
#  Oda kur / Kod ile katıl
# ─────────────────────────────────────────────

func _on_host_pressed() -> void:
	var player_name := _get_player_name()
	if player_name.is_empty():
		return
	var r_name := _room_name_input.text.strip_edges()
	if r_name.is_empty():
		r_name = tr("%s'nin Odası") % player_name
	_save_name(player_name)
	var map_id: String = NetworkManager.MAPS[_map_option.selected]["id"]
	var size := _team_size
	_save_room_prefs(map_id, size)
	_set_busy(true)
	_set_status("Sunucu oluşturuluyor...", "busy")
	NetworkManager.create_server(player_name, r_name, _password_input.text, {"map": map_id, "team_size": size})


func _on_code_text_changed(new_text: String) -> void:
	# Kodu yazarken otomatik büyük harfe çevir (IP girilirse dokunma)
	if new_text.contains("."):
		return
	var upper := new_text.to_upper()
	if upper != new_text:
		var caret := _code_input.caret_column
		_code_input.text = upper
		_code_input.caret_column = caret


func _on_join_code_pressed() -> void:
	var player_name := _get_player_name()
	if player_name.is_empty():
		return
	var code := _code_input.text.strip_edges().to_upper()
	if code.is_empty():
		_set_status("Oda kodunu gir.", "error")
		_code_input.grab_focus()
		return
	var ip := RoomManager.get_ip_for_code(code)
	if ip.to_lower() == "localhost":
		ip = "127.0.0.1"  # kod kutusu otomatik büyük harfe çevirir
	if not NetworkManager.is_valid_address(ip):
		_set_status("Geçersiz oda kodu. Kod 7 haneli olmalı (ör. ABCD234) ya da bir IP adresi gir.", "error")
		_code_input.select_all()
		_code_input.grab_focus()
		return
	_save_name(player_name)
	_set_busy(true)
	_set_status("Bağlanıyor...", "busy")
	NetworkManager.join_server(ip, player_name, _code_pw_input.text)


# ─────────────────────────────────────────────
#  Ağ olayları
# ─────────────────────────────────────────────

func _on_server_created() -> void:
	get_tree().change_scene_to_file.call_deferred("res://scenes/ui/Lobby.tscn")


func _on_joined_server() -> void:
	RoomManager.stop_listening()
	get_tree().change_scene_to_file.call_deferred("res://scenes/ui/Lobby.tscn")


func _on_connection_failed() -> void:
	_set_busy(false)
	_set_status("Bağlantı başarısız! Oda kapanmış ya da kod hatalı olabilir.", "error")
	if _modal.visible:
		_modal_status.add_theme_color_override("font_color", UITheme.DANGER)
		_modal_status.text = "Bağlantı başarısız!"


func _on_kicked(reason: String) -> void:
	_set_busy(false)
	if _modal.visible:
		# Muhtemelen yanlış şifre — modal açık kalsın, tekrar denensin
		_modal_status.add_theme_color_override("font_color", UITheme.DANGER)
		_modal_status.text = reason
		_modal_pw_input.select_all()
		_modal_pw_input.grab_focus()
	_set_status(reason, "error")
