## StatsPage.gd — PROFİL penceresinin İSTATİSTİK sekmesi (UpgradePage içinde gösterilir).
##   Üst şerit: toplamlar (MAÇ, ÖLDÜRME, ÖLÜM, K/D, KAZANILAN, KAZANMA ORANI).
##   Sol: "KARAKTERLERE GÖRE" — karakter başına iki ince yatay çubuk (öldürme / ölüm) + K/D + MAÇ + KAZANMA.
##   Sağ: "ANALİZ" — MatchStats.insights() cümleleri.
## Ekran YALNIZ MatchStats'tan okur (backend'e geçişte tek bağımlılık). İSABET tutulmaz.
## Görsel dil: UpgradePage ile aynı sade nötr beyaz-gri; kehribar kullanılmaz (birincil eylem + XP'ye ayrılmış), emoji yok.
## Çubuk kuralları: ortak sıfır tabanlı ölçek, değer 0 ise çubuk yok, sayı çubuk ucunda ve hep metin renginde, ızgara yok.

extends VBoxContainer

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const MATCH_STATS := preload("res://scenes/profile/MatchStats.gd")

const BAR_TWEEN_TIME := 0.35
const KILL_COLOR := Color(0.93, 0.95, 0.97, 0.92)    # UpgradePage BAR_FILL ile aynı beyaz
const DEATH_COLOR := Color(0.93, 0.95, 0.97, 0.38)   # aynı beyazın sönük tonu
const NAME_W := 170.0
const KD_W := 100.0
const MATCH_W := 110.0     # İngilizce başlık "MATCHES" 105 px; daha darsa başlık sütunu kayar
const WIN_W := 240.0       # "999/999 KAZANILDI" ~230 px; daha darsa o satırın sütunları başlıktan kayar
const ANALYSIS_W := 430.0
const ROW_MIN_H := 84.0
const ROW_PAD_X := 20.0      # satır iç boşluğu; başlık satırı da aynı boşlukla içeri alınır (StyleBoxFlat içerik boşluğu kenarlığı kapsar)
const MIN_MATCHES_NOTE := "Karşılaştırmalar en az 5 maç sonra görünür"


## İki yatay çubuk (öldürme üstte, ölüm altta). Sayı çubuğun ucunda, hep metin renginde.
class BarPair extends Control:
	const BAR_H := 14.0
	const GAP := 6.0
	const TEXT_ROOM := 70.0     # çubuk ucundaki sayıya ayrılan yer
	const FONT_SIZE := 16
	var kills := 0
	var deaths := 0
	var scale_max := 1
	var progress := 1.0:
		set(v):
			progress = v
			queue_redraw()
	var kill_color := Color.WHITE
	var death_color := Color.WHITE

	func _init() -> void:
		custom_minimum_size = Vector2(0, BAR_H * 2.0 + GAP)

	func _draw() -> void:
		var top := (size.y - (BAR_H * 2.0 + GAP)) * 0.5
		var avail := maxf(size.x - TEXT_ROOM, 0.0)
		_draw_bar(top, kills, kill_color, avail)
		_draw_bar(top + BAR_H + GAP, deaths, death_color, avail)

	func _draw_bar(y: float, value: int, col: Color, avail: float) -> void:
		var w := avail * float(value) / float(maxi(scale_max, 1)) * progress
		if value > 0:
			draw_rect(Rect2(0.0, y, w, BAR_H), col)
		var font: Font = UITheme.font_mono
		var shown := roundi(float(value) * progress)
		var base := y + BAR_H * 0.5 + (font.get_ascent(FONT_SIZE) - font.get_descent(FONT_SIZE)) * 0.5
		draw_string(font, Vector2(w + 8.0, base), str(shown), HORIZONTAL_ALIGNMENT_LEFT, -1, FONT_SIZE, UITheme.TEXT)


var _strip_vals: Dictionary = {}     # alan → Label
var _chart_box: VBoxContainer        # sütun başlıkları + 5 satır
var _empty_box: VBoxContainer        # hiç maç yokken
var _rows: Dictionary = {}           # karakter → {row, bars, kd, matches, win, win_sub}
var _insights_box: VBoxContainer
var _tween: Tween


func _ready() -> void:
	add_theme_constant_override("separation", 14)
	_build()
	refresh()


func _build() -> void:
	# Üst şerit
	var strip := HBoxContainer.new()
	strip.add_theme_constant_override("separation", 14)
	add_child(strip)
	for f: Array in [["matches", "MAÇ"], ["kills", "ÖLDÜRME"], ["deaths", "ÖLÜM"], ["kd", "K/D"], ["wins", "KAZANILAN"], ["rate", "KAZANMA ORANI"]]:
		strip.add_child(_strip_cell(f[0], f[1]))

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 14)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(body)
	body.add_child(_build_left())
	body.add_child(_build_right())


func _card_style() -> StyleBoxFlat:
	return UITheme.style(Color(1, 1, 1, 0.03), UITheme.RADIUS, UITheme.BORDER, 1, 27, 20)


func _strip_cell(key: String, title: String) -> Control:
	var cell := PanelContainer.new()
	cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cell.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.03), UITheme.RADIUS, UITheme.BORDER, 1, 23, 14))
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)
	cell.add_child(box)
	box.add_child(UITheme.label(title, 17, UITheme.TEXT_DIM, UITheme.font_caps))
	var val := UITheme.label("0", 40, UITheme.TEXT, UITheme.font_mono)
	val.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	box.add_child(val)
	_strip_vals[key] = val
	return cell


# ─────────────────────────────────────────────
#  Sol: KARAKTERLERE GÖRE
# ─────────────────────────────────────────────

func _build_left() -> Control:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _card_style())
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	panel.add_child(box)
	box.add_child(UITheme.label("KARAKTERLERE GÖRE", 18, UITheme.TEXT_DIM, UITheme.font_caps))

	_chart_box = VBoxContainer.new()
	_chart_box.add_theme_constant_override("separation", 10)
	_chart_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(_chart_box)
	_chart_box.add_child(_build_header())
	for c: String in PROFILE.CHARACTERS:   # sabit sıra — veriye göre değişmez
		_chart_box.add_child(_build_row(c))

	# Boş durum (hiç maç yok)
	_empty_box = VBoxContainer.new()
	_empty_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_empty_box.add_theme_constant_override("separation", 8)
	_empty_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_empty_box.visible = false
	box.add_child(_empty_box)
	var t1 := UITheme.label("Henüz maç kaydı yok", 30, UITheme.TEXT, UITheme.font_bold)
	t1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty_box.add_child(t1)
	var t2 := UITheme.label("İlk maçını tamamladığında istatistiklerin burada görünür", 20, UITheme.TEXT_DIM)
	t2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty_box.add_child(t2)
	return panel


## Sütun başlıkları + lejant (küçük kare + ad; kimlik yalnız renge bağlı kalmasın diye çubuk uçlarında sayı da var)
func _build_header() -> Control:
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", int(ROW_PAD_X))
	pad.add_theme_constant_override("margin_right", int(ROW_PAD_X))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	pad.add_child(h)
	var sp := Control.new()
	sp.custom_minimum_size = Vector2(NAME_W, 0)
	h.add_child(sp)
	var legend := HBoxContainer.new()
	legend.add_theme_constant_override("separation", 22)
	legend.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(legend)
	legend.add_child(_legend_item(KILL_COLOR, "ÖLDÜRME"))
	legend.add_child(_legend_item(DEATH_COLOR, "ÖLÜM"))
	for f: Array in [["K/D", KD_W], ["MAÇ", MATCH_W], ["KAZANMA", WIN_W]]:
		var l := UITheme.label(f[0], 16, UITheme.TEXT_DIM, UITheme.font_caps)
		l.custom_minimum_size = Vector2(f[1], 0)
		h.add_child(l)
	return pad


func _legend_item(col: Color, text: String) -> Control:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	var sw := ColorRect.new()
	sw.color = col
	sw.custom_minimum_size = Vector2(12, 12)
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	box.add_child(sw)
	box.add_child(UITheme.label(text, 16, UITheme.TEXT_DIM, UITheme.font_caps))
	return box


func _row_style(hover: bool) -> StyleBoxFlat:
	return UITheme.style(Color(1, 1, 1, 0.07 if hover else 0.025), UITheme.RADIUS,
		Color(1, 1, 1, 0.30) if hover else UITheme.BORDER, 1, ROW_PAD_X, 8)


func _build_row(c: String) -> Control:
	var row := PanelContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_STOP
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.custom_minimum_size = Vector2(0, ROW_MIN_H)
	row.add_theme_stylebox_override("panel", _row_style(false))
	row.mouse_entered.connect(func() -> void: row.add_theme_stylebox_override("panel", _row_style(true)))
	row.mouse_exited.connect(func() -> void: row.add_theme_stylebox_override("panel", _row_style(false)))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	row.add_child(h)

	var name_lbl := UITheme.label(c.to_upper(), 22, UITheme.TEXT, UITheme.font_caps)
	name_lbl.custom_minimum_size = Vector2(NAME_W, 0)
	name_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	name_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	h.add_child(name_lbl)

	var bars := BarPair.new()
	bars.kill_color = KILL_COLOR
	bars.death_color = DEATH_COLOR
	bars.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bars.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(bars)

	var kd := _num_label(KD_W)
	h.add_child(kd)
	var matches := _num_label(MATCH_W)
	h.add_child(matches)

	var win_box := VBoxContainer.new()
	win_box.add_theme_constant_override("separation", 0)
	win_box.custom_minimum_size = Vector2(WIN_W, 0)
	win_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(win_box)
	var win := UITheme.label("—", 26, UITheme.TEXT, UITheme.font_mono)
	win.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	win_box.add_child(win)
	var win_sub := UITheme.label("", 16, UITheme.TEXT_DIM, UITheme.font_caps)
	win_sub.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	win_box.add_child(win_sub)

	_ignore_mouse(h)   # hover/tooltip satırın kendisinde kalsın
	_rows[c] = {"row": row, "bars": bars, "kd": kd, "matches": matches, "win": win, "win_sub": win_sub}
	return row


func _num_label(width: float) -> Label:
	var l := UITheme.label("—", 26, UITheme.TEXT, UITheme.font_mono)
	l.custom_minimum_size = Vector2(width, 0)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	l.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	return l


func _ignore_mouse(n: Node) -> void:
	for ch: Node in n.get_children():
		if ch is Control:
			(ch as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
		_ignore_mouse(ch)


# ─────────────────────────────────────────────
#  Sağ: ANALİZ
# ─────────────────────────────────────────────

func _build_right() -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(ANALYSIS_W, 0)
	panel.add_theme_stylebox_override("panel", _card_style())
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	panel.add_child(box)
	box.add_child(UITheme.label("ANALİZ", 18, UITheme.TEXT_DIM, UITheme.font_caps))

	_insights_box = VBoxContainer.new()
	_insights_box.add_theme_constant_override("separation", 12)
	_insights_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(_insights_box)

	box.add_child(_wrap_label(MIN_MATCHES_NOTE, 17, UITheme.TEXT_DIM))   # sabit anahtar, Label otomatik çevirir
	return panel


## Sarılan etiket: genişlik tabanı verilir (yoksa yerleşimden önce dev yükseklik ölçülür)
func _wrap_label(text: String, size: int, col: Color) -> Label:
	var l := UITheme.label(text, size, col)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(ANALYSIS_W - 80.0, 0)
	return l


# ─────────────────────────────────────────────
#  Veri → ekran
# ─────────────────────────────────────────────

## Sekme her açıldığında çağrılır (maçtan dönünce veri değişmiş olabilir); çubuklar yeniden dolar.
func refresh() -> void:
	if _chart_box == null:
		return
	var totals: Dictionary = MATCH_STATS.get_totals()
	var by_char: Dictionary = MATCH_STATS.get_by_character()
	var t_matches := int(totals.get("matches", 0))
	var t_wins := int(totals.get("wins", 0))
	var t_kills := int(totals.get("kills", 0))
	var t_deaths := int(totals.get("deaths", 0))

	(_strip_vals["matches"] as Label).text = str(t_matches)
	(_strip_vals["kills"] as Label).text = str(t_kills)
	(_strip_vals["deaths"] as Label).text = str(t_deaths)
	(_strip_vals["kd"] as Label).text = "%.2f" % MATCH_STATS.kd(t_kills, t_deaths)
	(_strip_vals["wins"] as Label).text = str(t_wins)
	(_strip_vals["rate"] as Label).text = tr("%%%d") % MATCH_STATS.win_rate(t_wins, t_matches)

	var has_data := t_matches > 0
	_chart_box.visible = has_data
	_empty_box.visible = not has_data

	# Ortak ölçek: tüm karakterlerdeki en yüksek öldürme/ölüm, sıfır tabanlı
	var scale_max := 1
	for c: String in PROFILE.CHARACTERS:
		var d: Dictionary = by_char.get(c, {})
		scale_max = maxi(scale_max, maxi(int(d.get("kills", 0)), int(d.get("deaths", 0))))

	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_parallel(true)
	for c: String in PROFILE.CHARACTERS:
		var d: Dictionary = by_char.get(c, {})
		_fill_row(c, d, scale_max)
	_refresh_insights()


func _fill_row(c: String, d: Dictionary, scale_max: int) -> void:
	var r: Dictionary = _rows[c]
	var kills := int(d.get("kills", 0))
	var deaths := int(d.get("deaths", 0))
	var matches := int(d.get("matches", 0))
	var wins := int(d.get("wins", 0))
	var row: Control = r["row"]
	var bars: BarPair = r["bars"]
	bars.kills = kills
	bars.deaths = deaths
	bars.scale_max = scale_max
	bars.progress = 0.0
	_tween.tween_property(bars, "progress", 1.0, BAR_TWEEN_TIME).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	(r["matches"] as Label).text = str(matches)
	(r["win_sub"] as Label).visible = matches > 0
	if matches > 0:
		var kd: float = MATCH_STATS.kd(kills, deaths)
		(r["kd"] as Label).text = "%.2f" % kd
		(r["win"] as Label).text = tr("%%%d") % MATCH_STATS.win_rate(wins, matches)
		(r["win_sub"] as Label).text = tr("%d/%d KAZANILDI") % [wins, matches]
		row.modulate.a = 1.0
		row.tooltip_text = tr("%s: öldürme %d · ölüm %d · K/D %.2f · %d maç · %d galibiyet") % [c, kills, deaths, kd, matches, wins]
	else:
		(r["kd"] as Label).text = "—"
		(r["win"] as Label).text = "—"
		(r["win_sub"] as Label).text = ""
		row.modulate.a = 0.5   # oynanmamış karakter sönük
		row.tooltip_text = tr("%s ile henüz maç yok") % c


func _refresh_insights() -> void:
	for ch: Node in _insights_box.get_children():
		_insights_box.remove_child(ch)
		ch.queue_free()
	var items: Array = MATCH_STATS.insights()
	if items.is_empty():
		var empty := _wrap_label(tr("Daha fazla maç oyna, analiz burada görünsün"), 20, UITheme.TEXT_DIM)
		empty.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		_insights_box.add_child(empty)
		return
	for i: int in items.size():
		var it: Dictionary = items[i]
		var args: Array = it.get("args", [])
		var key := String(it.get("text", ""))
		var line := tr(key) % args if not args.is_empty() else tr(key)
		var l := _wrap_label(line, 21, UITheme.TEXT)
		l.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # zaten çevrildi
		_insights_box.add_child(l)
		if i < items.size() - 1:
			var sep := ColorRect.new()
			sep.color = Color(1, 1, 1, 0.08)
			sep.custom_minimum_size = Vector2(0, 1)
			_insights_box.add_child(sep)
