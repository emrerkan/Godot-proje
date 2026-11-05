## DeathRecap.gd — Ölünce ekranın altında çıkan BF1 tarzı bilgi bandı (HUD kurar, `_death_overlay` olarak kullanır).
## Bölümler: SENİ ÖLDÜREN (takım amblemi, ad, karakter, leş/ölüm, kalan canı, ikinizin arasındaki skor)
##   | SİLAH (öldürme yöntemine göre ad + ikon) | YENİDEN DOĞUŞ (halka geri sayım).
## Sadece görsel — veriyi HUD `_on_kill_happened` içinde `present(info)` ile verir, `start_countdown` ölüm ekranı açılınca.
## Sınıf adı YOK — HUD preload eder.

extends Control

const ICONS := preload("res://scenes/ui/IconSet.gd")

## Karakterin silahı (Player.WEAPON_CONFIGS sırası; gerçek model adı vermiyoruz)
const WEAPON_NAMES := {
	"Tank": "AĞIR TÜFEK",
	"Visioner": "KARABİNA",
	"Runner": "HAFİF MAKİNELİ",
	"Medic": "YARI OTOMATİK TÜFEK",
	"Sniper": "KESKİN NİŞANCI TÜFEĞİ",
}

const BAND_WIDTH := 1240.0
const BAND_HEIGHT := 176.0
const BAND_BOTTOM := 44.0
const RING_SIZE := 112.0

var _title: Label
var _emblem_panel: PanelContainer
var _emblem_style: StyleBoxFlat
var _emblem_lbl: Label
var _caption: Label
var _name_lbl: Label
var _stats_row: HBoxContainer
var _kills_val: Label
var _deaths_val: Label
var _hp_val: Label
var _duel_row: HBoxContainer
var _duel_val: Label
var _weapon_name: Label
var _weapon_icon_holder: CenterContainer
var _count_lbl: Label
var _ring: Control

var _time := 0.0
var _total := 3.0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

	var dim := ColorRect.new()
	dim.color = Color(0.04, 0.0, 0.01, 0.42)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	# Alt bant
	var band := PanelContainer.new()
	band.anchor_left = 0.5
	band.anchor_right = 0.5
	band.anchor_top = 1.0
	band.anchor_bottom = 1.0
	band.offset_left = -BAND_WIDTH * 0.5
	band.offset_right = BAND_WIDTH * 0.5
	band.offset_top = -BAND_BOTTOM - BAND_HEIGHT
	band.offset_bottom = -BAND_BOTTOM
	band.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.BG, 0.82), UITheme.RADIUS, UITheme.BORDER, 1, 0, 0))
	UITheme.add_brackets(band)
	add_child(band)

	# Bandın üstünde başlık
	_title = UITheme.label("ETKİSİZ HALE GETİRİLDİN", 26, UITheme.DANGER, UITheme.font_caps)
	_title.anchor_left = 0.5
	_title.anchor_right = 0.5
	_title.anchor_top = 1.0
	_title.anchor_bottom = 1.0
	_title.offset_left = -BAND_WIDTH * 0.5
	_title.offset_right = BAND_WIDTH * 0.5
	_title.offset_top = -BAND_BOTTOM - BAND_HEIGHT - 52
	_title.offset_bottom = -BAND_BOTTOM - BAND_HEIGHT - 14
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_title)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 0)
	band.add_child(row)

	row.add_child(_build_killer_section())
	row.add_child(_separator())
	row.add_child(_build_weapon_section())
	row.add_child(_separator())
	row.add_child(_build_respawn_section())

	_ignore_mouse(self)


# ─────────────────────────────────────────────
#  API (HUD)
# ─────────────────────────────────────────────

## info: killer_name, killer_team, killer_char, kills, deaths, killer_hp (-1 = bilinmiyor), method_key
## ("bullet"/"knife"/"backstab"/"special"/"bomb"/"trap"), duel_me, duel_them, self_kill (bool), special_color
func present(info: Dictionary) -> void:
	var self_kill: bool = info.get("self_kill", false)
	var team: int = info.get("killer_team", -1)
	var tcol: Color = TeamManager.get_color(team) if team >= 0 else UITheme.TEXT_DIM

	_emblem_style.border_color = Color(tcol, 0.7)
	_emblem_style.bg_color = Color(tcol, 0.12)
	_emblem_lbl.text = UITheme.TEAM_GLYPHS[team] if team >= 0 and team < UITheme.TEAM_GLYPHS.size() else "○"
	_emblem_lbl.add_theme_color_override("font_color", tcol)

	if self_kill:
		_caption.text = tr("KENDİ TUZAĞIN")
		_name_lbl.text = tr("Kendi tuzağına yakalandın")
		_name_lbl.add_theme_color_override("font_color", UITheme.TEXT)
		_stats_row.visible = false
		_duel_row.visible = false
	else:
		var ch: String = info.get("killer_char", "")
		_caption.text = tr("SENİ ÖLDÜREN") + ("  ·  " + tr(ch).to_upper() if ch != "" else "")
		_name_lbl.text = info.get("killer_name", "???")
		_name_lbl.add_theme_color_override("font_color", tcol)
		_stats_row.visible = true
		_kills_val.text = str(info.get("kills", 0))
		_deaths_val.text = str(info.get("deaths", 0))
		var hp: int = info.get("killer_hp", -1)
		_hp_val.get_parent().get_parent().visible = hp >= 0
		_hp_val.text = "+%d" % hp
		_duel_row.visible = true
		_duel_val.text = "%d – %d" % [info.get("duel_me", 0), info.get("duel_them", 0)]

	# Silah / yöntem
	var key: String = info.get("method_key", "bullet")
	for c in _weapon_icon_holder.get_children():
		c.queue_free()
	var icon: Control
	match key:
		"knife", "backstab":
			_weapon_name.text = tr("BIÇAK")   # arkadan da aynı — kullanıcı: "arkadan" yazmasın
			icon = _knife_icon(76.0, UITheme.TEXT)
		"special":
			_weapon_name.text = tr("ÖZEL SİLAH")
			icon = UITheme.label("⊕", 64, info.get("special_color", UITheme.DANGER), UITheme.font_bold)
		"bomb":
			_weapon_name.text = tr("BOMBA")
			icon = ICONS.make("bomb", 72.0, UITheme.TEXT)
		"trap":
			_weapon_name.text = tr("TUZAK")
			icon = ICONS.make("trap", 72.0, UITheme.TEXT)
		_:
			_weapon_name.text = tr(WEAPON_NAMES.get(info.get("killer_char", ""), "TÜFEK"))
			icon = ICONS.make("weapon", 72.0, UITheme.TEXT)
	_weapon_icon_holder.add_child(icon)
	_ignore_mouse(icon)


func start_countdown(total: float) -> void:
	_total = maxf(total, 0.01)
	_time = total
	_count_lbl.text = "%d" % ceili(_time)
	_ring.queue_redraw()


func _process(delta: float) -> void:
	if not visible:
		return
	_time = maxf(_time - delta, 0.0)
	_count_lbl.text = "%d" % ceili(_time) if _time > 0.0 else "…"
	_ring.queue_redraw()


# ─────────────────────────────────────────────
#  Kurulum
# ─────────────────────────────────────────────

func _build_killer_section() -> Control:
	var m := _margin(36, 22)
	m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 26)
	m.add_child(h)

	_emblem_panel = PanelContainer.new()
	_emblem_panel.custom_minimum_size = Vector2(118, 118)
	_emblem_panel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_emblem_style = UITheme.style(Color(1, 1, 1, 0.08), UITheme.RADIUS, UITheme.BORDER, 2, 0, 0)
	_emblem_panel.add_theme_stylebox_override("panel", _emblem_style)
	h.add_child(_emblem_panel)
	_emblem_lbl = UITheme.label("●", 64, UITheme.TEXT)
	_emblem_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_emblem_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_emblem_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_emblem_panel.add_child(_emblem_lbl)

	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(v)
	_caption = UITheme.label("SENİ ÖLDÜREN", 15, UITheme.TEXT_DIM, UITheme.font_caps)
	_caption.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # present() tr() ile yazar
	v.add_child(_caption)
	_name_lbl = UITheme.label("", 34, UITheme.TEXT, UITheme.font_bold)
	_name_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # oyuncu adı
	_name_lbl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_lbl.custom_minimum_size.x = 360
	v.add_child(_name_lbl)

	_stats_row = HBoxContainer.new()
	_stats_row.add_theme_constant_override("separation", 22)
	v.add_child(_stats_row)
	_kills_val = _stat_pair(_stats_row, "LEŞ")
	_deaths_val = _stat_pair(_stats_row, "ÖLÜM")
	# Öldürenin kalan canı (BF1 "+100" çipi)
	var hp_chip := PanelContainer.new()
	hp_chip.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.1), 3, UITheme.BORDER, 1, 12, 2))
	var hp_h := HBoxContainer.new()
	hp_h.add_theme_constant_override("separation", 8)
	hp_chip.add_child(hp_h)
	hp_h.add_child(UITheme.label("CAN", 14, UITheme.TEXT_DIM, UITheme.font_caps))
	_hp_val = UITheme.label("+100", 20, UITheme.TEXT, UITheme.font_mono)
	_hp_val.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	hp_h.add_child(_hp_val)
	_stats_row.add_child(hp_chip)

	_duel_row = HBoxContainer.new()
	_duel_row.add_theme_constant_override("separation", 12)
	v.add_child(_duel_row)
	_duel_row.add_child(UITheme.label("SEN – RAKİP", 15, UITheme.TEXT_DIM, UITheme.font_caps))
	_duel_val = UITheme.label("0 – 0", 20, UITheme.TEXT, UITheme.font_mono)
	_duel_val.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_duel_row.add_child(_duel_val)
	return m


func _build_weapon_section() -> Control:
	var m := _margin(30, 20)
	m.custom_minimum_size.x = 340
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	m.add_child(v)
	_weapon_name = UITheme.label("", 19, UITheme.TEXT, UITheme.font_caps)
	_weapon_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_weapon_name.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	v.add_child(_weapon_name)
	_weapon_icon_holder = CenterContainer.new()
	_weapon_icon_holder.custom_minimum_size = Vector2(0, 80)
	v.add_child(_weapon_icon_holder)
	return m


func _build_respawn_section() -> Control:
	var m := _margin(30, 14)
	m.custom_minimum_size.x = 260
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	m.add_child(v)
	var cap := UITheme.label("YENİDEN DOĞUŞ", 15, UITheme.TEXT_DIM, UITheme.font_caps)
	cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(cap)
	_ring = Control.new()
	_ring.custom_minimum_size = Vector2(RING_SIZE, RING_SIZE)
	_ring.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_ring.draw.connect(_draw_ring)
	v.add_child(_ring)
	_count_lbl = UITheme.label("3", 46, UITheme.TEXT, UITheme.font_mono)
	_count_lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_count_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_count_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_count_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_ring.add_child(_count_lbl)
	return m


## Geri sayım halkası: soluk tam daire + kalan süre kadar beyaz yay (saat yönünde boşalır)
func _draw_ring() -> void:
	var c := _ring.size * 0.5
	var r := minf(c.x, c.y) - 4.0
	_ring.draw_arc(c, r, 0.0, TAU, 64, Color(1, 1, 1, 0.14), 3.0, true)
	var ratio := clampf(_time / _total, 0.0, 1.0)
	if ratio > 0.0:
		_ring.draw_arc(c, r, -PI * 0.5, -PI * 0.5 + TAU * ratio, 64, UITheme.TEXT, 4.0, true)


func _stat_pair(parent: Control, caption: String) -> Label:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	parent.add_child(h)
	var c := UITheme.label(caption, 14, UITheme.TEXT_DIM, UITheme.font_caps)
	c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(c)
	var val := UITheme.label("0", 22, UITheme.TEXT, UITheme.font_mono)
	val.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	h.add_child(val)
	return val


func _margin(h: int, v: int) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", h)
	m.add_theme_constant_override("margin_right", h)
	m.add_theme_constant_override("margin_top", v)
	m.add_theme_constant_override("margin_bottom", v)
	return m


func _separator() -> Control:
	var s := ColorRect.new()
	s.color = UITheme.BORDER
	s.custom_minimum_size = Vector2(1, 0)
	s.size_flags_vertical = Control.SIZE_FILL
	return s


## Kodla çizilen bıçak (IconSet'te yok): eğimli düz uçlu ağız + siper + sap, tek renk
func _knife_icon(px: float, col: Color) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(px, px)
	var s := px / 24.0
	c.draw.connect(func() -> void:
		# sap sol altta, ağız sağ üste uzanır
		var blade := PackedVector2Array([Vector2(9.5, 12.5), Vector2(19, 3.5), Vector2(21.5, 2.5), Vector2(20.5, 5), Vector2(11.5, 14.5)])
		for i in blade.size():
			blade[i] *= s
		c.draw_colored_polygon(blade, Color(col, 0.25))
		blade.append(blade[0])
		c.draw_polyline(blade, col, maxf(1.5, 2.0 * s), true)
		c.draw_line(Vector2(7.5, 11.5) * s, Vector2(12.5, 16.5) * s, col, maxf(1.5, 2.0 * s))   # siper
		c.draw_line(Vector2(3, 21) * s, Vector2(9.5, 14.5) * s, col, 3.5 * s))                  # sap
	return c


func _ignore_mouse(node: Node) -> void:
	if node is Control:
		(node as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for ch in node.get_children():
		_ignore_mouse(ch)
