## LoadingScreen.gd — tam ekran yükleme perdesi (açılış, karakter seçimi, harita). Statik API, autoload DEĞİL:
## kullananlar `preload` eder. Kök pencereye (root) eklenen CanvasLayer → sahne değişse de kalır.
##   LOADING.open(tree, "Harita hazırlanıyor", "Gece Konteyner Limanı")   # gösterir (zaten açıksa metni günceller)
##   LOADING.set_progress(tree, 0.4)                                        # 0..1, < 0 = belirsiz (kayan şerit)
##   await LOADING.close(tree)                                              # en az MIN_SHOW sn göründükten sonra söner
## Ağır işler (GLB) iş parçacığında yüklenirse çubuk akar; ana iş parçacığını kilitleyen işlerde son kare donuk kalır
## ama ekran yine "yükleniyor" der (kullanıcı: açılışta birkaç saniyelik donma vardı).
## Görsel: Sis & Cam (docs/SANAT_KITABI.md). Arka plan: karanlıkta tarayan el feneri konisi ızgarayı ve tozu açığa çıkarır
## (canvas_ui_loading_beam.gdshader) + MenuOverlay dumanı/vinyeti. Ortada TACTICAL / DARK logosu (MainMenu ile aynı),
## durum + yüzde + kehribar çizgi; altta braketli cam panelde dönen TAKTİK İPUCU (kullanıcı: "düz yükleniyor olmasın").

extends CanvasLayer

const NODE_NAME := "LoadingScreen"
const LAYER := 120
const MIN_SHOW := 0.6          # sn — çok kısa yüklemede göz kırpma olmasın
const FADE_TIME := 0.35
const BAR_WIDTH := 420.0
const SEGMENT := 0.28          # belirsiz modda kayan parçanın oranı
const TIP_INTERVAL := 5.5      # sn — ipucu değişimi
const TIP_FADE := 0.4
const DOTS_SPEED := 2.5        # "YÜKLENİYOR..." nokta animasyonu (nokta/sn)
const BEAM_SHADER := preload("res://scenes/ui/canvas_ui_loading_beam.gdshader")
const OVERLAY_SHADER := preload("res://scenes/ui/MenuOverlay.gdshader")
const OVERLAY_FOG := 0.08
const OVERLAY_VIGNETTE := 0.9
const TIPS: Array[String] = [
	"Fenerin seni uzaktan ele verir — karanlıkta kapatıp yaklaş.",
	"Çömelirken mermiler üstünden geçer, ama bombaya karşı korumaz.",
	"Çıkış noktasını sadece kartı taşıyan görür. Takımın onu korumalı.",
	"Kilit açılırken çemberden çıkarsan ilerleme sıfırlanır.",
	"Yüksek kenarlara zıplayarak çıkabilirsin (Space).",
	"Sis bombası görüşü keser — kartı taşırken kaçış yolu açar.",
	"Uydu rakipleri haritada gösterir ama kartın yerini göstermez.",
	"Sniper mermileri duvarı deler. Duvar arkası her zaman güvenli değil.",
]

var _root: Control
var _title: Label
var _sub: Label
var _tip: Label
var _tip_panel: Control
var _tip_index := 0
var _tip_timer := 0.0
var _title_key := ""
var _pct: Label
var _bar_bg: Control
var _bar_fill: ColorRect
var _progress := -1.0
var _shown_at := 0.0
var _closing := false
var _t := 0.0
var _tween: Tween = null


## Örnek statikte tutulur: kök düğüme ERTELENMİŞ eklenir (Main._ready gibi kök meşgulken add_child başarısız oluyordu),
## o yüzden henüz ağaçta olmasa da bulunabilmeli. Arayüz _init'te kurulur → _show hemen çalışır.
static var _instance: Node = null

static func _find(_tree: SceneTree) -> Node:
	if _instance != null and is_instance_valid(_instance) and not _instance.is_queued_for_deletion():
		return _instance
	return null


static func open(tree: SceneTree, title: String = "YÜKLENİYOR", subtitle: String = "") -> void:
	var ls: Node = _find(tree)
	if ls == null:
		ls = (load("res://scenes/ui/LoadingScreen.gd") as GDScript).new()
		ls.name = NODE_NAME
		_instance = ls
		tree.root.add_child.call_deferred(ls)
	ls.call("_show", title, subtitle)


static func set_progress(tree: SceneTree, ratio: float) -> void:
	var ls: Node = _find(tree)
	if ls:
		ls.set("_progress", ratio)


## Alt satırı değiştirir (ör. "3/6 oyuncu hazır · en fazla 1:52") — perde açık değilse bir şey yapmaz
static func set_subtitle(tree: SceneTree, text: String) -> void:
	var ls: Node = _find(tree)
	if ls:
		var sub: Label = ls.get("_sub")
		sub.text = text
		sub.visible = not text.is_empty()


static func is_open(tree: SceneTree) -> bool:
	var ls: Node = _find(tree)
	return ls != null and not bool(ls.get("_closing"))


## Ağır ilk kareler (gölgelendirici derleme vb.) geçsin diye `settle_frames` kare bekler, sonra söner
static func close(tree: SceneTree, settle_frames: int = 3) -> void:
	var ls: Node = _find(tree)
	if ls == null:
		return
	for i in settle_frames:
		await tree.process_frame
	if is_instance_valid(ls):
		await ls.call("_fade_out")


func _init() -> void:
	layer = LAYER
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_STOP   # alttaki menüye tıklanmasın
	add_child(_root)
	# Arka plan: tarayan fener + üstte duman/vinyet/gren
	for shader: Shader in [BEAM_SHADER, OVERLAY_SHADER]:
		var layer_rect := ColorRect.new()
		layer_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		layer_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var mat := ShaderMaterial.new()
		mat.shader = shader
		if shader == OVERLAY_SHADER:
			# Menüdeki duman burada karanlığı gri pusa çeviriyordu → daha ince duman, daha koyu kenar
			mat.set_shader_parameter("fog_strength", OVERLAY_FOG)
			mat.set_shader_parameter("vignette_strength", OVERLAY_VIGNETTE)
		layer_rect.material = mat
		_root.add_child(layer_rect)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.offset_bottom = -70   # alttaki ipucu paneline yer
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(center)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)
	center.add_child(box)

	# Logo (MainMenu._build_brand_column ile aynı ölçü/renk, ortalı)
	var t1 := UITheme.label("TACTICAL", 34, UITheme.TEXT, UITheme.font_title)
	t1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(t1)
	var t2 := UITheme.label("DARK", 72, UITheme.ACCENT, UITheme.font_title)
	t2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t2.add_theme_constant_override("line_spacing", -12)
	box.add_child(t2)
	var logo_bar := ColorRect.new()
	logo_bar.color = UITheme.ACCENT
	logo_bar.custom_minimum_size = Vector2(56, 3)
	var logo_bar_wrap := CenterContainer.new()
	logo_bar_wrap.add_child(logo_bar)
	box.add_child(logo_bar_wrap)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 46)
	box.add_child(gap)

	# Durum satırı: "YÜKLENİYOR..." ······ 42%
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(BAR_WIDTH, 0)
	box.add_child(row)
	_title = UITheme.label("", 13, UITheme.TEXT, UITheme.font_caps)
	_title.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # metni tr() + nokta animasyonuyla kendimiz kurarız
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_title)
	_pct = UITheme.label("", 13, UITheme.ACCENT, UITheme.font_mono)
	row.add_child(_pct)
	var gap2 := Control.new()
	gap2.custom_minimum_size = Vector2(0, 8)
	box.add_child(gap2)

	_bar_bg = Control.new()
	_bar_bg.custom_minimum_size = Vector2(BAR_WIDTH, 3)
	_bar_bg.clip_contents = true
	var track := ColorRect.new()
	track.color = Color(1, 1, 1, 0.1)
	track.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_bar_bg.add_child(track)
	_bar_fill = ColorRect.new()
	_bar_fill.color = UITheme.ACCENT
	_bar_fill.size = Vector2(0, 3)
	_bar_bg.add_child(_bar_fill)
	box.add_child(_bar_bg)
	var gap3 := Control.new()
	gap3.custom_minimum_size = Vector2(0, 8)
	box.add_child(gap3)
	_sub = UITheme.label("", 12, UITheme.TEXT_DIM, UITheme.font_caps)
	box.add_child(_sub)

	# İpucu: altta braketli cam panel
	var tip_anchor := CenterContainer.new()
	tip_anchor.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	tip_anchor.offset_top = -132
	tip_anchor.offset_bottom = -44
	tip_anchor.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(tip_anchor)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(560, 0)
	panel.add_theme_stylebox_override("panel", UITheme.style(UITheme.SURFACE, UITheme.RADIUS, UITheme.BORDER, 1, 20, 12))
	UITheme.add_brackets(panel)
	tip_anchor.add_child(panel)
	_tip_panel = panel
	var tbox := VBoxContainer.new()
	tbox.add_theme_constant_override("separation", 6)
	panel.add_child(tbox)
	tbox.add_child(UITheme.label("◆  TAKTİK İPUCU", 11, UITheme.ACCENT, UITheme.font_caps))
	_tip = UITheme.label("", 14, UITheme.TEXT)
	_tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip.custom_minimum_size = Vector2(520, 0)
	tbox.add_child(_tip)


func _show(title: String, subtitle: String) -> void:
	if _closing or _shown_at == 0.0:
		_shown_at = Time.get_ticks_msec() / 1000.0
		_tip_index = randi() % TIPS.size()
		_tip.text = TIPS[_tip_index]
		_tip_timer = 0.0
	_closing = false
	if _tween:
		_tween.kill()   # sönerken yeniden açıldı (ör. harita → migration)
		_tween = null
	_root.modulate.a = 1.0
	_title_key = title
	_sub.text = subtitle
	_sub.visible = not subtitle.is_empty()
	_progress = -1.0


## İpucunu söndür → değiştir → yak
func _next_tip() -> void:
	var tw := create_tween()
	tw.tween_property(_tip_panel, "modulate:a", 0.0, TIP_FADE)
	tw.tween_callback(func() -> void:
		_tip_index = (_tip_index + 1) % TIPS.size()
		_tip.text = TIPS[_tip_index])
	tw.tween_property(_tip_panel, "modulate:a", 1.0, TIP_FADE)


func _process(delta: float) -> void:
	_t += delta
	_title.text = tr(_title_key) + ".".repeat(int(_t * DOTS_SPEED) % 4)
	_pct.text = "%d%%" % int(round(clampf(_progress, 0.0, 1.0) * 100.0)) if _progress >= 0.0 else ""
	_tip_timer += delta
	if _tip_timer >= TIP_INTERVAL:
		_tip_timer = 0.0
		_next_tip()
	var w := _bar_bg.size.x
	if _progress < 0.0:
		# Belirsiz: kayan parça
		var seg := w * SEGMENT
		var x := fmod(_t * 0.7, 1.0 + SEGMENT) * w - seg
		_bar_fill.position.x = x
		_bar_fill.size.x = seg
	else:
		_bar_fill.position.x = 0.0
		_bar_fill.size.x = lerpf(_bar_fill.size.x, w * clampf(_progress, 0.0, 1.0), 1.0 - exp(-12.0 * delta))


func _fade_out() -> void:
	if _closing:
		return
	_closing = true
	var shown := Time.get_ticks_msec() / 1000.0 - _shown_at
	if shown < MIN_SHOW:
		await get_tree().create_timer(MIN_SHOW - shown).timeout
	if not _closing:
		return   # bu arada yeniden açıldı
	_tween = create_tween()
	_tween.tween_property(_root, "modulate:a", 0.0, FADE_TIME)
	await _tween.finished
	if _closing:
		queue_free()
