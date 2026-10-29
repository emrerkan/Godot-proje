## UpgradePage.gd — Ana menü PROFİL penceresinin içeriği: profil XP'si ile KARAKTER BAŞINA kalıcı yükseltme.
## MainMenu `preload(...).new()` ile pencereye ekler (sol alttaki operatör kartındaki PROFİL butonu), açılınca `refresh()`.
## Veri/kurallar PlayerProfile'da (fiyat, seviye sınırı, çarpanlar); bu dosya sadece arayüz.

extends VBoxContainer

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const PLAYER := preload("res://scenes/player/Player.gd")
const ROLES := {"Tank": "Ön Hat", "Visioner": "Keşif", "Runner": "Hızlı Sızma", "Sniper": "Uzun Menzil", "Medic": "Destek"}

var _character := "Tank"
var _xp_lbl: Label
var _level_lbl: Label
var _char_buttons: Dictionary = {}     # karakter → Button
var _role_lbl: Label
var _summary: GridContainer
var _rows: Dictionary = {}             # stat → {pips: Array[Panel], bonus: Label, btn: Button}
var _cost_lbl: Label


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_build()
	refresh()


func _build() -> void:
	# Başlık + XP
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	add_child(header)
	var title_box := VBoxContainer.new()
	title_box.add_theme_constant_override("separation", 2)
	title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_box)
	title_box.add_child(UITheme.label("Karakter Yükseltmeleri", 20, UITheme.TEXT, UITheme.font_bold))
	var info := UITheme.label("Yükseltme sadece seçili karaktere uygulanır. Her yükseltme o karakterin bir sonrakini pahalılaştırır.", 12, UITheme.TEXT_DIM)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title_box.add_child(info)

	var xp_chip := PanelContainer.new()
	xp_chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	xp_chip.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.ACCENT, 0.1), 10, Color(UITheme.ACCENT, 0.5), 1, 14, 8))
	header.add_child(xp_chip)
	var xp_box := VBoxContainer.new()
	xp_box.add_theme_constant_override("separation", 0)
	xp_chip.add_child(xp_box)
	_xp_lbl = UITheme.label("", 20, UITheme.ACCENT, UITheme.font_mono)
	_xp_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	xp_box.add_child(_xp_lbl)
	_level_lbl = UITheme.label("", 10, UITheme.TEXT_DIM, UITheme.font_caps)
	_level_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	xp_box.add_child(_level_lbl)

	# Karakter seçici
	var chars := HBoxContainer.new()
	chars.add_theme_constant_override("separation", 6)
	add_child(chars)
	var group := ButtonGroup.new()
	for c: String in PROFILE.CHARACTERS:
		var b := Button.new()
		b.toggle_mode = true
		b.button_group = group
		b.theme_type_variation = "TabButton"
		b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.pressed.connect(_select.bind(c))
		chars.add_child(b)
		_char_buttons[c] = b
	(_char_buttons[_character] as Button).button_pressed = true

	# Karakter özeti: temel → yükseltilmiş değerler
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.03), 12, UITheme.BORDER, 1, 16, 12))
	add_child(card)
	var card_box := VBoxContainer.new()
	card_box.add_theme_constant_override("separation", 8)
	card.add_child(card_box)
	_role_lbl = UITheme.label("", 11, UITheme.TEXT_DIM, UITheme.font_caps)
	card_box.add_child(_role_lbl)
	_summary = GridContainer.new()
	_summary.columns = 5
	_summary.add_theme_constant_override("h_separation", 18)
	card_box.add_child(_summary)

	# Stat satırları
	for stat: String in PROFILE.STATS:
		add_child(_build_stat_row(stat))

	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(fill)
	_cost_lbl = UITheme.label("", 12, UITheme.TEXT_DIM)
	add_child(_cost_lbl)


func _build_stat_row(stat: String) -> Control:
	var info: Dictionary = PROFILE.STAT_INFO[stat]
	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.025), 10, UITheme.BORDER, 1, 14, 8))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	row.add_child(h)

	var glyph := UITheme.label(info["glyph"], 18, UITheme.ACCENT, UITheme.font_bold)
	glyph.custom_minimum_size = Vector2(22, 0)
	glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	h.add_child(glyph)

	var name_box := VBoxContainer.new()
	name_box.add_theme_constant_override("separation", 0)
	name_box.custom_minimum_size = Vector2(170, 0)
	h.add_child(name_box)
	name_box.add_child(UITheme.label(info["name"], 12, UITheme.TEXT, UITheme.font_caps))
	var bonus := UITheme.label("", 11, UITheme.TEXT_DIM)
	name_box.add_child(bonus)

	var pips_box := HBoxContainer.new()
	pips_box.add_theme_constant_override("separation", 4)
	pips_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pips_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(pips_box)
	var pips: Array[Panel] = []
	for i in PROFILE.MAX_LEVEL:
		var p := Panel.new()
		p.custom_minimum_size = Vector2(26, 8)
		pips_box.add_child(p)
		pips.append(p)

	var btn := Button.new()
	btn.custom_minimum_size = Vector2(150, 34)
	btn.theme_type_variation = "PrimaryButton"
	btn.focus_mode = Control.FOCUS_NONE
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	btn.pressed.connect(_buy.bind(stat))
	h.add_child(btn)

	_rows[stat] = {"pips": pips, "bonus": bonus, "btn": btn}
	return row


func _select(character: String) -> void:
	_character = character
	for c: String in _char_buttons:
		(_char_buttons[c] as Button).set_pressed_no_signal(c == character)
	refresh()


func _buy(stat: String) -> void:
	if PROFILE.buy(_character, stat):
		refresh()
		var row: Control = (_rows[stat]["btn"] as Control).get_parent().get_parent()
		row.modulate = Color(1.5, 1.4, 1.1)
		create_tween().tween_property(row, "modulate", Color.WHITE, 0.4)


## Sekme her açıldığında (maçtan dönünce XP değişmiş olabilir)
func refresh() -> void:
	if _xp_lbl == null:
		return
	_xp_lbl.text = "◆ %d XP" % PROFILE.get_xp()
	_level_lbl.text = tr("PROFİL SEVİYESİ %d") % PROFILE.profile_level()
	for c: String in _char_buttons:
		(_char_buttons[c] as Button).text = "%s  %d/%d" % [c.to_upper(), PROFILE.upgrade_count(c), PROFILE.STATS.size() * PROFILE.MAX_LEVEL]

	var levels := PROFILE.get_levels(_character)
	var cost := PROFILE.next_cost(_character)
	var can_afford := PROFILE.get_xp() >= cost
	_role_lbl.text = "%s  ·  %s" % [_character.to_upper(), tr(String(ROLES.get(_character, ""))).to_upper()]
	_refresh_summary(levels)

	for stat: String in PROFILE.STATS:
		var lv: int = levels[stat]
		var r: Dictionary = _rows[stat]
		for i in PROFILE.MAX_LEVEL:
			var on := i < lv
			(r["pips"][i] as Panel).add_theme_stylebox_override("panel",
				UITheme.style(UITheme.ACCENT if on else Color(1, 1, 1, 0.08), 3))
		(r["bonus"] as Label).text = PROFILE.stat_bonus_text(stat, lv) if lv > 0 else "Yükseltilmedi"
		var btn: Button = r["btn"]
		if lv >= PROFILE.MAX_LEVEL:
			btn.text = "MAKS"
			btn.disabled = true
		else:
			btn.text = tr("YÜKSELT · %d XP") % cost
			btn.disabled = not can_afford
	_cost_lbl.text = tr("Bu karakterin sonraki yükseltmesi: %d XP   ·   XP maçlarda kazanılır (kill, kart, zafer…)") % cost


func _refresh_summary(levels: Dictionary) -> void:
	for c in _summary.get_children():
		c.queue_free()
	var m := PROFILE.multipliers(levels)
	var base: Dictionary = PLAYER.CHARACTER_STATS.get(_character, {})
	var wpn: Dictionary = PLAYER.WEAPON_CONFIGS.get(_character, {})
	var entries := [
		["CAN", float(base.get("health", 0)), float(base.get("health", 0)) * m["health"], "%d"],
		["HIZ", float(base.get("speed", 0)), float(base.get("speed", 0)) * m["speed"], "%.1f"],
		["HASAR", float(wpn.get("damage", 0)), float(wpn.get("damage", 0)) * m["damage"], "%d"],
		["ŞARJÖR", float(wpn.get("reload_time", 0)), float(wpn.get("reload_time", 0)) * m["reload"], "%.2f sn"],
		["KOŞU", PLAYER.SPRINT_MAX_TIME, PLAYER.SPRINT_MAX_TIME * m["stamina"], "%.1f sn"],
	]
	for e: Array in entries:
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 0)
		box.add_child(UITheme.label(e[0], 10, UITheme.TEXT_DIM, UITheme.font_caps))
		var changed: bool = absf(float(e[2]) - float(e[1])) > 0.001
		var val := UITheme.label(tr(String(e[3])) % e[2], 17, UITheme.ACCENT if changed else UITheme.TEXT, UITheme.font_bold)
		box.add_child(val)
		if changed:
			box.add_child(UITheme.label(tr("temel %s") % (tr(String(e[3])) % e[1]), 10, UITheme.TEXT_DIM))
		_summary.add_child(box)
