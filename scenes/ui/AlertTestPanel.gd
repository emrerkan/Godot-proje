extends Control
## UYARI TEST PANELİ — sadece debug derlemede (editörden çalıştırınca). HUD `U` tuşuyla açar/kapatır.
## Her düğme HUD'daki gerçek uyarı çizimini tetikler (oyun durumuna dokunmaz, ağ yok):
## uyarı bandı (_show_banner), hedef çipi (debug_objective), kapı kilidi paneli (debug_unlock).
## Hedef çipi/kilit paneli bir sonraki gerçek olayda (kart alındı, kilit vb.) kendiliğinden eski haline döner.

var hud: Node   # HUD.gd örneği (HUD kurar)

const CHARS := ["Tank", "Visioner", "Runner", "Medic", "Sniper"]


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var panel := PanelContainer.new()
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.anchor_top = 0.08
	panel.anchor_bottom = 0.92
	panel.offset_left = -470
	panel.offset_right = -24
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.SURFACE, 0.9), 8, UITheme.BORDER, 1, 18, 14))
	add_child(panel)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)
	var title := UITheme.label("UYARI TESTİ", 22, UITheme.TEXT, UITheme.font_caps)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var hint := UITheme.label("U / ESC kapatır  ·  sadece editör testi", 13, UITheme.TEXT_DIM)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(hint)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)

	var blue: Color = TeamManager.get_color(0)
	var red: Color = TeamManager.get_color(1)

	_section(list, "HEDEF ÇİPİ (üst orta, sürekli)")
	_btn(list, "Isınma", func() -> void: hud.debug_objective("ISINMA  ·  3/8 OYUNCU HAZIR  ·  EN FAZLA 1:45", UITheme.TEXT))
	_btn(list, "Süreli mod", func() -> void: hud.debug_objective("EN ÇOK ÖLDÜREN TAKIM KAZANIR", UITheme.ACCENT))
	_btn(list, "Tek kart · yerde", func() -> void: _obj("KART YERDE", UITheme.ACCENT, "Kartı bul ve al"))
	_btn(list, "Tek kart · sende", func() -> void: _obj("KART SENDE", UITheme.SUCCESS, "Kapıya koş, çemberde kal"))
	_btn(list, "Tek kart · takımında", func() -> void: _obj("KART TAKIMINDA", blue, "Taşıyıcıyı koru"))
	_btn(list, "Tek kart · rakipte", func() -> void: _obj(tr("KART %s TAKIMINDA") % "KIRMIZI", red, "Taşıyıcıyı durdur"))
	_btn(list, "Çoklu kart · 0/3", func() -> void: _obj("KARTLAR", UITheme.TEXT, "Kartları bul ve al", true, 0, 3))
	_btn(list, "Çoklu kart · 2/3", func() -> void: _obj("KARTLAR", UITheme.TEXT, "", true, 2, 3))
	_btn(list, "Çoklu kart · hepsi sizde", func() -> void: _obj("TÜM KARTLAR SİZDE", UITheme.TEXT, "Kartları çıkışa götürün", true, 3, 3))
	_btn(list, "Çoklu kart · rakip topladı", func() -> void: _obj(tr("%s TAKIMI TÜM KARTLARI TOPLADI") % "KIRMIZI", UITheme.TEXT, "Taşıyıcıları durdur", true, 3, 3))

	_section(list, "KAPI KİLİDİ (çember dolar)")
	_btn(list, "Takımın kapıyı açıyor", func() -> void: _unlock(tr("%s TAKIM KAPIYI AÇIYOR") % "MAVİ", blue, "Taşıyıcıyı koru"))
	_btn(list, "Rakip kapıyı açıyor", func() -> void: _unlock(tr("%s TAKIM KAPIYI AÇIYOR") % "KIRMIZI", UITheme.DANGER, "Kapıya git, onları durdur"))

	_section(list, "ÖLÜM BANDI (alt, silah resmi)")
	for ch: String in CHARS:
		_btn(list, tr("Öldün · %s silahı") % tr(ch), func() -> void: hud.debug_death({"killer_char": ch, "method_key": "bullet"}))
	_btn(list, "Öldün · bıçak", func() -> void: hud.debug_death({"killer_char": "Runner", "method_key": "knife"}))
	_btn(list, "Öldün · arkadan bıçak", func() -> void: hud.debug_death({"killer_char": "Tank", "method_key": "backstab"}))
	_btn(list, "Öldün · özel silah", func() -> void: hud.debug_death({"killer_char": "Sniper", "method_key": "special"}))
	_btn(list, "Öldün · bomba", func() -> void: hud.debug_death({"killer_char": "Tank", "method_key": "bomb"}))
	_btn(list, "Öldün · tuzak", func() -> void: hud.debug_death({"killer_char": "Medic", "method_key": "trap"}))
	_btn(list, "Öldün · kendi tuzağın", func() -> void: hud.debug_death({"self_kill": true, "killer_team": 0, "method_key": "trap"}))

	_section(list, "ÖLDÜRME BİLDİRİMİ (orta alt)")
	_btn(list, "Öldürdün", func() -> void: hud.debug_kill("BOT 5"))
	_btn(list, "Öldürdün · uzun ad", func() -> void: hud.debug_kill("KeskinNisanciAhmet_42"))

	_section(list, "ÖLDÜRME AKIŞI (sağ üst · silah görseli)")
	_btn(list, "Tüm silahları göster (5 silah)", func() -> void:
		for ch: String in CHARS:
			hud.debug_kill_feed("bullet", ch)
	)
	for ch: String in CHARS:
		_btn(list, tr("Kill feed · %s silahı") % tr(ch), func() -> void: hud.debug_kill_feed("bullet", ch))
	_btn(list, "Kill feed · bıçak", func() -> void: hud.debug_kill_feed("knife"))
	_btn(list, "Kill feed · özel silah", func() -> void: hud.debug_kill_feed("special"))
	_btn(list, "Kill feed · bomba", func() -> void: hud.debug_kill_feed("bomb"))
	_btn(list, "Kill feed · tuzak", func() -> void: hud.debug_kill_feed("trap"))

	_section(list, "MAÇ SONU XP EKRANI (efektli)")
	_btn(list, "Zafer + Seviye atlama", func() -> void: hud.debug_end_screen(true, true))
	_btn(list, "Yenilgi + XP dökümü", func() -> void: hud.debug_end_screen(false, false))

	_section(list, "UYARI BANDI · MAÇ / KART")
	_banner(list, "MAÇ BAŞLADI", UITheme.SUCCESS)
	_banner(list, "MAÇ BAŞLADI", UITheme.SUCCESS, "Kazanmak için öldür")
	_banner(list, "MAÇ BAŞLADI  ·  SADECE BIÇAK", UITheme.SUCCESS)
	_banner(list, "SON 1 DAKİKA", UITheme.ACCENT)
	_banner(list, "KARTI ALDIN!", UITheme.SUCCESS, "Kapıya koş, çemberde kal")
	_banner(list, tr("KART ALINDI · %d/%d") % [1, 3], UITheme.SUCCESS)
	_banner(list, tr("%s TAKIM KARTI ALDI!") % "KIRMIZI", red, "Taşıyıcıyı durdur")
	_banner(list, tr("%s TAKIM KARTI DÜŞÜRDÜ!") % "MAVİ", blue)
	_banner(list, "KİLİT SIFIRLANDI", UITheme.DANGER, "Çemberde kal")

	_section(list, "UYARI BANDI · GÜÇLER")
	for t: int in [0, 1, 2, 4, 5, 6, 7, 8, 9]:
		var info: Dictionary = hud._power_info(t)
		if info.is_empty():
			continue
		_banner(list, tr("%s ALINDI") % tr(info["name"]), Color(info["color"]))
	_banner(list, tr("+%d CAN") % 35, Color(0.35, 0.95, 0.5))
	_banner(list, "GÖRÜNMEZSİN", _col(7), "Ateş edersen görünür olursun")
	_banner(list, "ÖZEL SİLAH HAZIR", _col(8), "Tek atış, duvarlardan geçer")
	_banner(list, "Vazgeçtin  ·  silah slotta", Color(_col(8), 0.7))
	_banner(list, tr("UYDU (%s): tüm oyuncular haritada") % "OYUNCU", _col(2))
	_banner(list, tr("%s TAKIM UYDUSU KONUMUNUZU TESPİT ETTİ!") % "KIRMIZI", UITheme.DANGER)
	_banner(list, tr("MEDIC %s seni iyileştirdi") % "BOT 3", _col(1))
	_banner(list, tr("%s iyileştirildi (+%d)") % ["BOT 2", 35], _col(1))

	_section(list, "UYARI BANDI · TUZAK")
	_banner(list, "Tuzak yere bırakıldı", _col(6))
	_banner(list, "TUZAĞA YAKALANDIN!", UITheme.DANGER, "Tuzak çözücüyü kullan")
	_banner(list, "TUZAĞA YAKALANDIN!", UITheme.DANGER, "Takım arkadaşın seni kurtarabilir")
	_banner(list, tr("%s TUZAĞA YAKALANDI!") % "BOT 2", UITheme.DANGER, "Takım arkadaşını kurtar")
	_banner(list, tr("Tuzağınız %s oyuncusunu yakaladı!") % "BOT 5", _col(6))
	_banner(list, "TUZAKTAN KURTULDUN", _col(9))
	_banner(list, tr("%s KURTARILDI") % "BOT 2", _col(6))
	_banner(list, "Tuzaktayken hazırlanamaz", UITheme.TEXT)


func _col(t: int) -> Color:
	var info: Dictionary = hud._power_info(t)
	return Color(info["color"]) if not info.is_empty() else UITheme.TEXT


func _section(parent: Control, text: String) -> void:
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 6)
	parent.add_child(gap)
	parent.add_child(UITheme.label(text, 14, UITheme.TEXT_DIM, UITheme.font_caps))


## Bant (+ varsa sağ ortada tavsiye); düğme yazısında tavsiye "→" ile görünür
func _banner(parent: Control, text: String, color: Color, tip := "") -> void:
	var t := tr(text)
	var label := t if tip.is_empty() else "%s   →  %s" % [t, tr(tip)]
	var cb := func() -> void:
		hud._show_banner(t, color)
		if not tip.is_empty():
			hud._show_tip(tip)
	_btn(parent, label, cb, color)


func _unlock(text: String, col: Color, tip: String) -> void:
	hud.debug_unlock(text, col)
	hud._show_tip(tip)


func _obj(text: String, col: Color, tip: String, cards := false, taken := 0, total := 0) -> void:
	hud.debug_objective(text, col, cards, taken, total)
	hud._show_tip(tip)


func _btn(parent: Control, text: String, cb: Callable, color := UITheme.TEXT) -> void:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	b.custom_minimum_size = Vector2(0, 36)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 15)
	b.add_theme_color_override("font_color", color)
	b.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	b.pressed.connect(cb)
	parent.add_child(b)
