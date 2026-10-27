## UITheme.gd (statik sınıf — autoload DEĞİL)
## Oyunun ortak arayüz teması. Kodla bir Theme kurar ve root Window'a atar —
## böylece tüm sahnelerdeki Button/LineEdit/Panel/ScrollBar vb. otomatik bu görünümü alır.
## UITheme.apply(get_tree()) Main.gd'de (ve sahne tek başına çalıştırılırsa MainMenu'de) çağrılır;
## root.theme sahne geçişlerinde korunur.
## Ayrıca palet sabitleri ve sık kullanılan stil yardımcıları sunar (UITheme.style(), UITheme.label()).
##
## Tip varyasyonları (Control.theme_type_variation ile kullanılır):
##   Button → "PrimaryButton" (vurgu renkli), "GhostButton" (şeffaf), "TabButton" (sekme, toggle)
##   Label  → "TitleLabel", "CapsLabel" (küçük, aralıklı, soluk), "DimLabel"
##
## GÖRSEL KİMLİK — "SODYUM & GECE OPERASYONU" (ayrıntı: docs/SANAT_KITABI.md)
##   Zemin: yeşilimsi grafit-siyah (gece, beton, ekipman) — soğuk lacivert DEĞİL.
##   Vurgu: SODYUM KEHRİBARI — duvar lambalarının ve el fenerinin ışığı. Sadece etkileşim + en önemli bilgi.
##   Bilgi/istihbarat: FOSFOR (gece görüş yeşili) — uydu, minimap, olumlu durum.
##   Tehlike: KIZILÖTESİ kırmızı. Metin: KEMİK (sıcak kırık beyaz).
##   Şekil dili: pah kırılmış (kesik) köşeler — askeri ekipman plakası (StyleBoxFlat corner_detail=1),
##   köşe braketleri (`add_brackets`), sayılar monospace "taktik okuma" fontu (`font_mono`).
##   Takımlar renk + SEMBOL ile ayrışır (`TEAM_GLYPHS`) — kırmızı/yeşil renk körlüğü için.

class_name UITheme
extends RefCounted

# ── Palet (v2 "Sis & Cam" — BF1 etkisi: saydam koyu cam paneller, beyaz ince kenar/köşe, beyaz metin) ──
const BG        := Color(0.045, 0.052, 0.06)           # soğuk duman grisi-siyah
const SURFACE   := Color(0.06, 0.07, 0.08, 0.58)       # saydam cam panel (arka plan sezilir)
const SURFACE_2 := Color(0.11, 0.125, 0.14, 0.62)
const SURFACE_3 := Color(0.17, 0.19, 0.21, 0.7)
const BORDER    := Color(1, 1, 1, 0.16)                # ince beyaz kenar
const FRAME     := Color(1, 1, 1, 0.85)                # köşe braketleri (beyaz)
const TEXT      := Color(0.96, 0.97, 0.98)             # beyaz
const TEXT_DIM  := Color(0.68, 0.72, 0.76)             # soğuk gri
const ACCENT    := Color(1.0, 0.68, 0.25)              # sodyum kehribarı — AZ: birincil buton + en önemli bilgi
const ACCENT_TEXT := Color(0.1, 0.065, 0.02)
const SIGNAL    := Color(0.45, 0.95, 0.68)             # fosfor — istihbarat/bilgi
const DANGER    := Color(1.0, 0.34, 0.28)              # kızılötesi
const SUCCESS   := Color(0.45, 0.92, 0.6)

## Takım sembolleri (TeamManager index 0-3: Mavi, Kırmızı, Yeşil, Sarı) — renk tek başına bilgi taşımasın
const TEAM_GLYPHS: Array[String] = ["●", "▲", "■", "◆"]

const RADIUS := 4          # corner_detail=1 ile pah (kesik köşe) boyu — v2'de küçük (BF1 keskin dikdörtgen)

static var theme: Theme
static var font_regular: Font
static var font_bold: FontVariation
static var font_title: FontVariation
static var font_caps: FontVariation
static var font_mono: Font  # sayılar, kodlar, sayaçlar — taktik terminal okuması


## Arayüzün tasarlandığı taban çözünürlük — pencere/tam ekran bu boyuttan orantılı büyür/küçülür
const BASE_RESOLUTION := Vector2i(1152, 648)


## Temayı (ilk çağrıda kurup) root Window'a atar + ekran ölçeklemesini kurar. Birden fazla çağrılması güvenli.
static func apply(tree: SceneTree) -> void:
	if theme == null:
		theme = _build_theme()
	if tree.root.theme != theme:
		tree.root.theme = theme
	_apply_scaling(tree.root)
	# Oyuncu ayarları (grafik/ses/kontrol) — açılışta bir kez; ölçeklemeden SONRA (ui_scale content_scale_factor'u ezer)
	preload("res://scenes/settings/GameSettings.gd").apply_once(tree)


## Ölçekleme: CANVAS_ITEMS → 2D arayüz BASE_RESOLUTION'da tasarlanmış gibi davranır, ekrana orantılı ölçeklenir
## (3D dünya yine tam çözünürlükte çizilir). EXPAND → farklı en-boy oranında (ultrawide, 16:10) kenar şeridi yok,
## arayüz alanı genişler. project.godot'daki display/window/stretch ayarının kodla karşılığı (editör açıkken
## project.godot'ya dokunmamak için burada).
static func _apply_scaling(root: Window) -> void:
	if root.content_scale_mode == Window.CONTENT_SCALE_MODE_CANVAS_ITEMS:
		return
	root.content_scale_size = BASE_RESOLUTION
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_EXPAND
	# Kesirli ölçekte (1920 → ×1.67) çizgiler/yazılar piksel arasına düşüp flu görünmesin: gerçek piksele oturt
	root.snap_2d_transforms_to_pixel = true
	root.snap_2d_vertices_to_pixel = true


static func _static_init() -> void:
	# Keskin yazı: tam hinting (glifler piksel ızgarasına oturur) + alt piksel konumlandırma kapalı
	# (ölçeklenmiş UI'da kesirli glif konumları yazıyı yumuşatıyordu)
	var base: Font = ThemeDB.fallback_font
	if base is FontFile:
		var f := (base as FontFile).duplicate() as FontFile
		_make_crisp(f)
		base = f
	font_regular = base

	font_bold = FontVariation.new()
	font_bold.base_font = font_regular
	font_bold.variation_embolden = 0.6
	font_bold.spacing_glyph = 1

	font_title = FontVariation.new()
	font_title.base_font = font_regular
	font_title.variation_embolden = 1.0
	font_title.spacing_glyph = 6

	font_caps = FontVariation.new()
	font_caps.base_font = font_regular
	font_caps.variation_embolden = 0.35
	font_caps.spacing_glyph = 3

	# Sistemde varsa monospace (Windows: Cascadia/Consolas, Linux: DejaVu Sans Mono), yoksa varsayılan font
	var mono := SystemFont.new()
	mono.font_names = PackedStringArray(["Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Courier New", "monospace"])
	mono.font_weight = 600
	mono.fallbacks = [font_regular]
	mono.hinting = TextServer.HINTING_NORMAL
	mono.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	font_mono = mono


static func _make_crisp(f: FontFile) -> void:
	f.hinting = TextServer.HINTING_NORMAL
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	f.force_autohinter = false


## Takım adı + sembol: "▲ KIRMIZI"
static func team_tag(team_id: int, upper: bool = true) -> String:
	var n: String = TeamManager.get_team_name(team_id)
	var g: String = TEAM_GLYPHS[team_id] if team_id >= 0 and team_id < TEAM_GLYPHS.size() else "○"
	return "%s %s" % [g, n.to_upper() if upper else n]


## Panelin köşelerine taktik braket çizer (┌ ┐ └ ┘) — hedefin kendi `draw` sinyaline bağlanır
## (çocuk node yok → container yerleşimini bozmaz; panel zemininin üstüne, çocukların altına çizilir).
## inset < 0 → braketler panel kenarının biraz dışında durur.
static func add_brackets(target: Control, color: Color = FRAME, length: float = 12.0, width: float = 2.0, inset: float = -3.0) -> void:
	target.draw.connect(func() -> void:
		var r := Rect2(Vector2.ONE * inset, target.size - Vector2.ONE * inset * 2.0)
		var l := minf(length, minf(r.size.x, r.size.y) * 0.4)
		var corners := [[r.position, 1.0, 1.0], [Vector2(r.end.x, r.position.y), -1.0, 1.0],
			[Vector2(r.position.x, r.end.y), 1.0, -1.0], [r.end, -1.0, -1.0]]
		for c: Array in corners:
			var p: Vector2 = c[0]
			target.draw_line(p, p + Vector2(l * c[1], 0), color, width)
			target.draw_line(p, p + Vector2(0, l * c[2]), color, width))
	target.resized.connect(target.queue_redraw)
	target.queue_redraw()


# ─────────────────────────────────────────────
#  Yardımcılar (diğer scriptler kullanır)
# ─────────────────────────────────────────────

static func style(bg: Color, radius: int = RADIUS, border: Color = Color.TRANSPARENT, border_w: int = 0,
		margin_h: float = -1.0, margin_v: float = -1.0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.corner_detail = 1  # yuvarlak değil pah kırılmış köşe — askeri plaka dili
	s.anti_aliasing = true
	if border_w > 0:
		s.border_color = border
		s.set_border_width_all(border_w)
	if margin_h >= 0.0:
		s.content_margin_left  = margin_h
		s.content_margin_right = margin_h
	if margin_v >= 0.0:
		s.content_margin_top    = margin_v
		s.content_margin_bottom = margin_v
	return s


static func label(text: String, font_size: int = 15, color: Color = TEXT, font: Font = null) -> Label:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	if font:
		lbl.add_theme_font_override("font", font)
	return lbl


# ─────────────────────────────────────────────
#  Tema
# ─────────────────────────────────────────────

static func _build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = font_regular
	t.default_font_size = 15

	# ── Label ──
	t.set_color("font_color", "Label", TEXT)
	t.set_type_variation("TitleLabel", "Label")
	t.set_font("font", "TitleLabel", font_title)
	t.set_font_size("font_size", "TitleLabel", 28)
	t.set_type_variation("CapsLabel", "Label")
	t.set_font("font", "CapsLabel", font_caps)
	t.set_font_size("font_size", "CapsLabel", 11)
	t.set_color("font_color", "CapsLabel", TEXT_DIM)
	t.set_type_variation("DimLabel", "Label")
	t.set_color("font_color", "DimLabel", TEXT_DIM)
	t.set_font_size("font_size", "DimLabel", 13)

	# ── Button (varsayılan) ──
	var btn_margin_h := 16.0
	var btn_margin_v := 9.0
	# Cam düğme: saydam zemin + ince beyaz kenar; hover'da beyazlaşır (BF1)
	t.set_stylebox("normal",   "Button", style(Color(1, 1, 1, 0.06), RADIUS, BORDER, 1, btn_margin_h, btn_margin_v))
	t.set_stylebox("hover",    "Button", style(Color(1, 1, 1, 0.16), RADIUS, Color(1, 1, 1, 0.7), 1, btn_margin_h, btn_margin_v))
	t.set_stylebox("pressed",  "Button", style(Color(1, 1, 1, 0.9), RADIUS, Color.WHITE, 1, btn_margin_h, btn_margin_v))
	t.set_stylebox("hover_pressed", "Button", style(Color(1, 1, 1, 0.9), RADIUS, Color.WHITE, 1, btn_margin_h, btn_margin_v))
	t.set_stylebox("disabled", "Button", style(Color(1, 1, 1, 0.03), RADIUS, Color(1, 1, 1, 0.06), 1, btn_margin_h, btn_margin_v))
	t.set_stylebox("focus",    "Button", style(Color.TRANSPARENT, RADIUS, Color(1, 1, 1, 0.5), 1))
	t.set_font("font", "Button", font_bold)
	t.set_color("font_color",          "Button", TEXT)
	t.set_color("font_hover_color",    "Button", Color.WHITE)
	t.set_color("font_pressed_color",  "Button", BG)
	t.set_color("font_hover_pressed_color", "Button", BG)
	t.set_color("font_focus_color",    "Button", TEXT)
	t.set_color("font_disabled_color", "Button", Color(TEXT_DIM, 0.6))

	# ── PrimaryButton: sodyum kehribarı plaka — altta koyu kenar (basılabilir metal düğme hissi) ──
	t.set_type_variation("PrimaryButton", "Button")
	var prim_norm := style(ACCENT, RADIUS, Color.TRANSPARENT, 0, btn_margin_h, btn_margin_v)
	prim_norm.border_color = ACCENT.darkened(0.45)
	prim_norm.border_width_bottom = 3
	var prim_hover := style(ACCENT.lightened(0.14), RADIUS, Color.TRANSPARENT, 0, btn_margin_h, btn_margin_v)
	prim_hover.border_color = ACCENT.darkened(0.35)
	prim_hover.border_width_bottom = 3
	prim_hover.shadow_color = Color(ACCENT, 0.35)
	prim_hover.shadow_size = 14
	var prim_pressed := style(ACCENT.darkened(0.12), RADIUS, Color.TRANSPARENT, 0, btn_margin_h, btn_margin_v)
	prim_pressed.border_color = ACCENT.darkened(0.5)
	prim_pressed.border_width_top = 2  # basılınca "çöker"
	t.set_stylebox("normal",   "PrimaryButton", prim_norm)
	t.set_stylebox("hover",    "PrimaryButton", prim_hover)
	t.set_stylebox("pressed",  "PrimaryButton", prim_pressed)
	t.set_stylebox("disabled", "PrimaryButton", style(Color(ACCENT, 0.18), RADIUS, Color.TRANSPARENT, 0, btn_margin_h, btn_margin_v))
	for key: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		t.set_color(key, "PrimaryButton", ACCENT_TEXT)
	t.set_color("font_disabled_color", "PrimaryButton", Color(ACCENT_TEXT, 0.6))

	# ── GhostButton: şeffaf, sadece hover'da zemin ──
	t.set_type_variation("GhostButton", "Button")
	t.set_stylebox("normal",  "GhostButton", style(Color.TRANSPARENT, RADIUS, Color.TRANSPARENT, 0, 12, 7))
	t.set_stylebox("hover",   "GhostButton", style(Color(1, 1, 1, 0.06), RADIUS, Color.TRANSPARENT, 0, 12, 7))
	t.set_stylebox("pressed", "GhostButton", style(Color(1, 1, 1, 0.1), RADIUS, Color.TRANSPARENT, 0, 12, 7))
	t.set_stylebox("disabled", "GhostButton", style(Color.TRANSPARENT, RADIUS, Color.TRANSPARENT, 0, 12, 7))
	t.set_color("font_color", "GhostButton", TEXT_DIM)
	t.set_color("font_hover_color", "GhostButton", TEXT)
	t.set_color("font_pressed_color", "GhostButton", TEXT)

	# ── TabButton: toggle sekme, seçili olan altı çizgili ──
	t.set_type_variation("TabButton", "Button")
	# Seçili sekme (BF1): beyaz metin + beyaz alt çizgi, zemin yok; seçili olmayanlar soluk
	var tab_sel := style(Color(1, 1, 1, 0.05), 0, Color.TRANSPARENT, 0, 18, 12)
	tab_sel.border_color = Color.WHITE
	tab_sel.border_width_bottom = 2
	var tab_norm := style(Color.TRANSPARENT, 0, Color.TRANSPARENT, 0, 18, 12)
	tab_norm.border_width_bottom = 2
	tab_norm.border_color = Color.TRANSPARENT
	var tab_hover := tab_norm.duplicate() as StyleBoxFlat
	tab_hover.bg_color = Color(1, 1, 1, 0.04)
	tab_hover.border_color = Color(1, 1, 1, 0.3)
	t.set_stylebox("normal", "TabButton", tab_norm)
	t.set_stylebox("hover", "TabButton", tab_hover)
	t.set_stylebox("pressed", "TabButton", tab_sel)
	t.set_stylebox("hover_pressed", "TabButton", tab_sel)
	t.set_stylebox("focus", "TabButton", StyleBoxEmpty.new())
	t.set_font("font", "TabButton", font_caps)
	t.set_font_size("font_size", "TabButton", 14)
	t.set_color("font_color", "TabButton", Color(TEXT_DIM, 0.75))
	t.set_color("font_hover_color", "TabButton", TEXT)
	t.set_color("font_pressed_color", "TabButton", Color.WHITE)
	t.set_color("font_hover_pressed_color", "TabButton", Color.WHITE)

	# ── LineEdit ──
	var le_norm := style(Color(0, 0, 0, 0.3), RADIUS, BORDER, 1, 14, 10)
	var le_focus := style(Color(0, 0, 0, 0.4), RADIUS, Color(1, 1, 1, 0.75), 1, 14, 10)
	t.set_stylebox("normal", "LineEdit", le_norm)
	t.set_stylebox("focus", "LineEdit", le_focus)
	t.set_stylebox("read_only", "LineEdit", style(Color(0, 0, 0, 0.2), RADIUS, BORDER, 1, 14, 10))
	t.set_color("font_color", "LineEdit", TEXT)
	t.set_color("font_placeholder_color", "LineEdit", Color(TEXT_DIM, 0.6))
	t.set_color("caret_color", "LineEdit", Color.WHITE)
	t.set_color("selection_color", "LineEdit", Color(1, 1, 1, 0.25))
	t.set_constant("caret_width", "LineEdit", 2)

	# ── Paneller ──
	t.set_stylebox("panel", "PanelContainer", style(SURFACE, RADIUS + 4, BORDER, 1, 0, 0))
	t.set_stylebox("panel", "Panel", style(SURFACE, RADIUS + 4, BORDER, 1))
	t.set_stylebox("panel", "PopupPanel", style(SURFACE_2, RADIUS, BORDER, 1, 12, 12))
	# Açılır menü (OptionButton listesi) — cam panel, hover beyaz
	t.set_stylebox("panel", "PopupMenu", style(Color(BG, 0.97), RADIUS, BORDER, 1, 6, 6))
	t.set_stylebox("hover", "PopupMenu", style(Color(1, 1, 1, 0.12), 2))
	t.set_color("font_color", "PopupMenu", TEXT)
	t.set_color("font_hover_color", "PopupMenu", Color.WHITE)
	t.set_color("font_disabled_color", "PopupMenu", Color(TEXT_DIM, 0.5))
	t.set_constant("v_separation", "PopupMenu", 8)
	t.set_stylebox("panel", "TooltipPanel", style(SURFACE_3, 6, BORDER, 1, 10, 6))
	t.set_color("font_color", "TooltipLabel", TEXT)

	# ── Ayraçlar ──
	var sep := StyleBoxLine.new()
	sep.color = BORDER
	sep.thickness = 1
	t.set_stylebox("separator", "HSeparator", sep)
	t.set_constant("separation", "HSeparator", 1)
	var vsep := StyleBoxLine.new()
	vsep.color = BORDER
	vsep.thickness = 1
	vsep.vertical = true
	t.set_stylebox("separator", "VSeparator", vsep)

	# ── ScrollBar: ince, yuvarlak ──
	var grabber := style(Color(1, 1, 1, 0.14), 4)
	grabber.content_margin_left = 3
	grabber.content_margin_right = 3
	var grabber_hl := style(Color(1, 1, 1, 0.5), 4)
	for bar: String in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox("scroll", bar, style(Color(1, 1, 1, 0.02), 4, Color.TRANSPARENT, 0, 3, 3))
		t.set_stylebox("grabber", bar, grabber)
		t.set_stylebox("grabber_highlight", bar, grabber_hl)
		t.set_stylebox("grabber_pressed", bar, grabber_hl)

	# ── ProgressBar ──
	t.set_stylebox("background", "ProgressBar", style(Color(1, 1, 1, 0.07), 4))
	t.set_stylebox("fill", "ProgressBar", style(ACCENT, 4))
	t.set_color("font_color", "ProgressBar", TEXT)

	return t
