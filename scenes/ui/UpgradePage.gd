## UpgradePage.gd — Ana menü PROFİL penceresinin içeriği: iki sekme
##   KARAKTER GELİŞİMİ — profil XP'si ile KARAKTER BAŞINA kalıcı stat yükseltmesi (5 stat × 5 seviye, zincir/pip satırları)
##   GÜÇ GELİŞİMİ     — HESAP GENELİ güç ağaçları (PowerTrees.gd): üstte güç seçici, solda soldan sağa büyüyen ağaç,
##                      sağda seçili düğümün detayı (eski → yeni değer, fiyat, AÇ). Her güç kendi ağacında ilerler.
## MainMenu `preload(...).new()` ile pencereye ekler (sol alttaki operatör kartındaki PROFİL butonu), açılınca `refresh()`.
## Veri/kurallar PlayerProfile + PowerTrees'te (fiyat, ön koşul, değerler); bu dosya sadece arayüz.

extends VBoxContainer

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const POWER_TREES := preload("res://scenes/profile/PowerTrees.gd")
const POWERUPS := preload("res://scenes/world/PowerupManager.gd")
const PLAYER := preload("res://scenes/player/Player.gd")
const ROLES := {"Tank": "Ön Hat", "Visioner": "Keşif", "Runner": "Hızlı Sızma", "Sniper": "Uzun Menzil", "Medic": "Destek"}

## Ağaç ızgarası (PowerTrees düğüm pos = sütun, satır)
const NODE_SIZE := Vector2(126, 56)
const COL_STEP := 158.0
const ROW_STEP := 82.0
const TREE_PAD := Vector2(10, 8)

var _tab_buttons: Dictionary = {}      # "char"/"power" → Button
var _char_page: VBoxContainer
var _power_page: VBoxContainer
var _xp_lbl: Label
var _level_lbl: Label

# Karakter sekmesi
var _character := "Tank"
var _char_buttons: Dictionary = {}     # karakter → Button
var _role_lbl: Label
var _summary: GridContainer
var _rows: Dictionary = {}             # stat → {pips: Array[Panel], bonus: Label, btn: Button}
var _cost_lbl: Label

# Güç sekmesi
var _tree := "bomb"
var _selected := "root"
var _tree_buttons: Dictionary = {}     # ağaç → Button
var _canvas: Control
var _node_buttons: Dictionary = {}     # düğüm id → {btn, name, status}
var _d_title: Label
var _d_name: Label
var _d_desc: Label
var _d_effects: VBoxContainer
var _d_status: Label
var _d_buy: Button
var _power_cost_lbl: Label


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_build()
	_show_tab("char")
	refresh()


func _build() -> void:
	# Başlık: sekmeler + XP
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 6)
	add_child(header)
	var group := ButtonGroup.new()
	for t: Array in [["char", "KARAKTER GELİŞİMİ"], ["power", "GÜÇ GELİŞİMİ"]]:
		var b := _tab_button(t[1], group)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(_show_tab.bind(t[0]))
		header.add_child(b)
		_tab_buttons[t[0]] = b
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

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

	_char_page = VBoxContainer.new()
	_char_page.add_theme_constant_override("separation", 12)
	_char_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_char_page)
	_build_char_page(_char_page)

	_power_page = VBoxContainer.new()
	_power_page.add_theme_constant_override("separation", 12)
	_power_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_power_page)
	_build_power_page(_power_page)


func _tab_button(text: String, group: ButtonGroup) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.button_group = group
	b.theme_type_variation = "TabButton"
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return b


func _show_tab(which: String) -> void:
	for t: String in _tab_buttons:
		(_tab_buttons[t] as Button).set_pressed_no_signal(t == which)
	_char_page.visible = which == "char"
	_power_page.visible = which == "power"


## Sekme her açıldığında (maçtan dönünce XP değişmiş olabilir)
func refresh() -> void:
	if _xp_lbl == null:
		return
	_xp_lbl.text = "◆ %d XP" % PROFILE.get_xp()
	_level_lbl.text = tr("PROFİL SEVİYESİ %d") % PROFILE.profile_level()
	_refresh_char()
	_refresh_power()


# ─────────────────────────────────────────────
#  KARAKTER GELİŞİMİ
# ─────────────────────────────────────────────

func _build_char_page(page: VBoxContainer) -> void:
	# Karakter seçici
	var chars := HBoxContainer.new()
	chars.add_theme_constant_override("separation", 6)
	page.add_child(chars)
	var group := ButtonGroup.new()
	for c: String in PROFILE.CHARACTERS:
		var b := _tab_button("", group)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_select.bind(c))
		chars.add_child(b)
		_char_buttons[c] = b
	(_char_buttons[_character] as Button).button_pressed = true

	# Karakter özeti: temel → yükseltilmiş değerler
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.03), 12, UITheme.BORDER, 1, 16, 12))
	page.add_child(card)
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
		page.add_child(_build_stat_row(stat))

	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(fill)
	_cost_lbl = UITheme.label("", 12, UITheme.TEXT_DIM)
	page.add_child(_cost_lbl)


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


func _refresh_char() -> void:
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
	_cost_lbl.text = tr("Yükseltme sadece seçili karaktere uygulanır  ·  bu karakterin sonraki yükseltmesi: %d XP") % cost


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


# ─────────────────────────────────────────────
#  GÜÇ GELİŞİMİ
# ─────────────────────────────────────────────

func _build_power_page(page: VBoxContainer) -> void:
	# Güç seçici
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	page.add_child(row)
	var group := ButtonGroup.new()
	for t: String in POWER_TREES.TREE_ORDER:
		var b := _tab_button("", group)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 12)   # 6 sekme 948 px'e sığsın
		b.clip_text = true
		b.pressed.connect(_select_tree.bind(t))
		row.add_child(b)
		_tree_buttons[t] = b
	(_tree_buttons[_tree] as Button).button_pressed = true

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(body)

	# Ağaç
	var tree_panel := PanelContainer.new()
	tree_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tree_panel.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.025), 12, UITheme.BORDER, 1, 12, 12))
	body.add_child(tree_panel)
	var center := CenterContainer.new()
	tree_panel.add_child(center)
	_canvas = Control.new()
	_canvas.custom_minimum_size = TREE_PAD * 2.0 + NODE_SIZE + Vector2(COL_STEP * 3.0, ROW_STEP * 2.0)
	_canvas.draw.connect(_draw_links)
	center.add_child(_canvas)

	# Detay
	var detail := PanelContainer.new()
	detail.custom_minimum_size = Vector2(290, 0)
	detail.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.04), 12, UITheme.BORDER, 1, 16, 14))
	UITheme.add_brackets(detail, UITheme.FRAME, 10)
	body.add_child(detail)
	var d := VBoxContainer.new()
	d.add_theme_constant_override("separation", 8)
	detail.add_child(d)
	_d_title = UITheme.label("", 10, UITheme.TEXT_DIM, UITheme.font_caps)
	d.add_child(_d_title)
	_d_name = UITheme.label("", 20, UITheme.TEXT, UITheme.font_bold)
	d.add_child(_d_name)
	_d_desc = UITheme.label("", 12, UITheme.TEXT_DIM)
	_d_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_d_desc.custom_minimum_size = Vector2(258, 0)
	d.add_child(_d_desc)
	var sep := HSeparator.new()
	sep.add_theme_stylebox_override("separator", UITheme.style(UITheme.BORDER, 0))
	d.add_child(sep)
	_d_effects = VBoxContainer.new()
	_d_effects.add_theme_constant_override("separation", 4)
	d.add_child(_d_effects)
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	d.add_child(fill)
	_d_status = UITheme.label("", 11, UITheme.TEXT_DIM)
	_d_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	d.add_child(_d_status)
	_d_buy = Button.new()
	_d_buy.custom_minimum_size = Vector2(0, 40)
	_d_buy.theme_type_variation = "PrimaryButton"
	_d_buy.focus_mode = Control.FOCUS_NONE
	_d_buy.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_d_buy.pressed.connect(_buy_power)
	d.add_child(_d_buy)

	_power_cost_lbl = UITheme.label("", 12, UITheme.TEXT_DIM)
	page.add_child(_power_cost_lbl)
	_rebuild_tree()


func _select_tree(tree: String) -> void:
	_tree = tree
	for t: String in _tree_buttons:
		(_tree_buttons[t] as Button).set_pressed_no_signal(t == tree)
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
		btn.focus_mode = Control.FOCUS_NONE
		btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		btn.position = _node_pos(n)
		btn.size = NODE_SIZE
		btn.custom_minimum_size = NODE_SIZE
		btn.pressed.connect(_select_node.bind(String(n["id"])))
		_canvas.add_child(btn)
		var box := VBoxContainer.new()
		box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		box.alignment = BoxContainer.ALIGNMENT_CENTER
		box.add_theme_constant_override("separation", 1)
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		btn.add_child(box)
		var name_lbl := UITheme.label(n["name"], 12, UITheme.TEXT, UITheme.font_bold)
		name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(name_lbl)
		var status_lbl := UITheme.label("", 10, UITheme.TEXT_DIM, UITheme.font_mono)
		status_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		status_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(status_lbl)
		_node_buttons[n["id"]] = {"btn": btn, "name": name_lbl, "status": status_lbl}


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
	_selected = node_id
	_refresh_power()


func _buy_power() -> void:
	if PROFILE.buy_power(_tree, _selected):
		refresh()
		var nb: Dictionary = _node_buttons.get(_selected, {})
		if nb.has("btn"):
			var btn: Control = nb["btn"]
			btn.modulate = Color(1.6, 1.5, 1.2)
			create_tween().tween_property(btn, "modulate", Color.WHITE, 0.45)


func _refresh_power() -> void:
	if _canvas == null:
		return
	var owned := PROFILE.get_powers()
	for t: String in _tree_buttons:
		var info: Dictionary = POWERUPS.INFO[POWER_TREES.TREES[t]["type"]]
		var total: int = (POWER_TREES.TREES[t]["nodes"] as Array).size()
		(_tree_buttons[t] as Button).text = "%s %s  %d/%d" % [info["glyph"], tr(String(POWER_TREES.TREES[t]["short"])), POWER_TREES.owned_count(owned, t), total]

	var cost := PROFILE.power_cost(_tree)
	var xp := PROFILE.get_xp()
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		var nb: Dictionary = _node_buttons.get(n["id"], {})
		if nb.is_empty():
			continue
		var state := _node_state(n)
		var selected: bool = n["id"] == _selected
		var bg := Color(1, 1, 1, 0.13) if state == "owned" else (Color(1, 1, 1, 0.05) if state == "open" else Color(0, 0, 0, 0.25))
		var border := UITheme.FRAME if selected else (Color(1, 1, 1, 0.55) if state != "locked" else Color(1, 1, 1, 0.1))
		var st := UITheme.style(bg, 4, border, 2 if selected else 1, 6, 4)
		var st_hover := UITheme.style(bg.lightened(0.15) if state != "locked" else bg, 4, UITheme.FRAME, 2 if selected else 1, 6, 4)
		var btn: Button = nb["btn"]
		for s: String in ["normal", "pressed", "focus", "disabled"]:
			btn.add_theme_stylebox_override(s, st)
		btn.add_theme_stylebox_override("hover", st_hover)
		var name_lbl: Label = nb["name"]
		var status_lbl: Label = nb["status"]
		name_lbl.add_theme_color_override("font_color", UITheme.TEXT if state != "locked" else Color(UITheme.TEXT_DIM, 0.55))
		match state:
			"owned":
				status_lbl.text = tr("✓ AÇIK")
				status_lbl.add_theme_color_override("font_color", UITheme.SUCCESS)
			"open":
				status_lbl.text = "%d XP" % cost
				status_lbl.add_theme_color_override("font_color", UITheme.ACCENT if xp >= cost else UITheme.TEXT_DIM)
			_:
				status_lbl.text = tr("KİLİTLİ")
				status_lbl.add_theme_color_override("font_color", Color(UITheme.TEXT_DIM, 0.5))
	_canvas.queue_redraw()
	_refresh_detail(owned, cost, xp)
	var done: int = POWER_TREES.owned_count(owned, _tree)
	var total_nodes: int = (POWER_TREES.TREES[_tree]["nodes"] as Array).size()
	_power_cost_lbl.text = tr("Güç gelişimi tüm karakterlerde geçerli  ·  her güç kendi ağacında ilerler  ·  bu ağaçta sonraki düğüm: %d XP") % cost \
		if done < total_nodes else tr("Güç gelişimi tüm karakterlerde geçerli  ·  bu ağaç tamamlandı")


func _refresh_detail(owned: Dictionary, cost: int, xp: int) -> void:
	var n := POWER_TREES.get_node_def(_tree, _selected)
	if n.is_empty():
		return
	var info: Dictionary = POWERUPS.INFO[POWER_TREES.TREES[_tree]["type"]]
	_d_title.text = "%s  %s" % [info["glyph"], tr(String(POWER_TREES.TREES[_tree]["name"]))]
	_d_name.text = n["name"]
	_d_desc.text = n["desc"]

	# Eski → yeni: bu düğümden ÖNCE tanımlanmış (ve açık) düğümlerle değer, sonra bu düğümün değeri
	var before := {}
	var mine: Array = owned.get(_tree, [])
	var others := owned.duplicate(true)
	var prior: Array[String] = []
	for m: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		if m["id"] == n["id"]:
			break
		if mine.has(m["id"]):
			prior.append(m["id"])
	others[_tree] = prior
	before = POWER_TREES.mods(others)
	for c in _d_effects.get_children():
		c.queue_free()
	for key: String in n["set"]:
		if not POWER_TREES.LABELS.has(key):
			continue
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var lbl := UITheme.label(String(POWER_TREES.LABELS[key][0]), 12, UITheme.TEXT_DIM)
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(lbl)
		var old_lbl := UITheme.label(POWER_TREES.format_value(key, float(before[key])), 12, UITheme.TEXT_DIM, UITheme.font_mono)
		old_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		row.add_child(old_lbl)
		row.add_child(UITheme.label("→", 12, UITheme.TEXT_DIM))
		var new_lbl := UITheme.label(POWER_TREES.format_value(key, float(n["set"][key])), 13, UITheme.TEXT, UITheme.font_mono)
		new_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		row.add_child(new_lbl)
		_d_effects.add_child(row)

	match _node_state(n):
		"owned":
			_d_status.text = tr("Bu düğüm açık — etkisi tüm maçlarında, hangi karakterle olursan ol geçerli.")
			_d_buy.visible = false
		"open":
			_d_status.text = tr("Her açtığın düğüm bu ağaçtaki sonrakini pahalılaştırır.")
			_d_buy.visible = true
			_d_buy.text = tr("AÇ · %d XP") % cost if xp >= cost else tr("XP YETERSİZ · %d XP") % cost
			_d_buy.disabled = xp < cost
		_:
			var req := POWER_TREES.get_node_def(_tree, n["req"])
			_d_status.text = tr("Önce şunu aç: %s") % tr(String(req.get("name", "")))
			_d_buy.visible = true
			_d_buy.text = tr("KİLİTLİ")
			_d_buy.disabled = true


## Düğümler arası bağlantılar: ebeveynin sağ ortasından çocuğun sol ortasına (satır farkı varsa dirsekli).
## İkisi de açıksa dolu beyaz, çocuk açılabilirse ince beyaz, kilitliyse kesikli soluk.
func _draw_links() -> void:
	for n: Dictionary in POWER_TREES.TREES[_tree]["nodes"]:
		if n["req"] == "":
			continue
		var parent := POWER_TREES.get_node_def(_tree, n["req"])
		var a := _node_pos(parent) + Vector2(NODE_SIZE.x, NODE_SIZE.y * 0.5)
		var b := _node_pos(n) + Vector2(0, NODE_SIZE.y * 0.5)
		var state := _node_state(n)
		var col := Color(1, 1, 1, 0.75) if state == "owned" else (Color(1, 1, 1, 0.4) if state == "open" else Color(1, 1, 1, 0.14))
		var w := 2.0 if state == "owned" else 1.5
		var pts: PackedVector2Array
		if is_equal_approx(a.y, b.y):
			pts = PackedVector2Array([a, b])
		else:
			var mid := (a.x + b.x) * 0.5
			pts = PackedVector2Array([a, Vector2(mid, a.y), Vector2(mid, b.y), b])
		for i in pts.size() - 1:
			if state == "locked":
				_canvas.draw_dashed_line(pts[i], pts[i + 1], col, w, 5.0)
			else:
				_canvas.draw_line(pts[i], pts[i + 1], col, w)
