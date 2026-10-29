## GameSettings.gd — oyuncu ayarları (grafik / kontrol / ses / oyun): saklama + uygulama.
## Statik sınıf (autoload değil — editör açıkken project.godot'ya dokunmuyoruz). Kullananlar `preload` eder.
## Dosya: user://options.cfg (MainMenu'nün user://settings.cfg'si oyuncu adı için ayrı kalır).
##
## Akış: UITheme.apply() ilk çağrıda `apply_all(tree)` → tüm ayarlar uygulanır. Ayar penceresi (SettingsWindow.gd)
## TASLAK üzerinde çalışır; UYGULA → `set_all(taslak)` + `save()` + `apply_all()`.
##
## Okuyanlar: Player._get_aim_target / Crosshair (sanal nişangah + fare hassasiyeti), CameraController (sarsıntı),
## MenuBackground3D (menü 3D arka planı), NetworkManager (odak dışı FPS sonrası geri dönüş), FpsCounter.

class_name GameSettings
extends RefCounted

const SAVE_PATH := "user://options.cfg"
const FPS_COUNTER := preload("res://scenes/settings/FpsCounter.gd")
const LANG := preload("res://scenes/settings/Lang.gd")

enum WindowMode { WINDOWED, BORDERLESS, EXCLUSIVE }
enum AA { OFF, FXAA, MSAA_2X, MSAA_4X }
enum Shadows { OFF, LOW, MEDIUM, HIGH }

## Pencereli modda seçilebilir çözünürlükler (ekrandan büyükler listelenmez)
const RESOLUTIONS: Array[Vector2i] = [
	Vector2i(1280, 720), Vector2i(1366, 768), Vector2i(1600, 900), Vector2i(1920, 1080),
	Vector2i(2560, 1440), Vector2i(3840, 2160),
]
const FPS_LIMITS: Array[int] = [30, 60, 120, 144, 165, 240, 0]   # 0 = sınırsız
const AUDIO_BUSES: Array[String] = ["Master", "Music", "SFX", "UI"]

const DEFAULTS := {
	# Grafik
	"window_mode": WindowMode.WINDOWED,
	"resolution": Vector2i(1920, 1080),
	"vsync": 1,                 # 0 kapalı, 1 açık, 2 uyarlamalı
	"max_fps": 0,               # 0 = sınırsız (vsync açıksa ekran yenilemesi)
	"render_scale": 1.0,        # oyun 3D çözünürlüğü (0.5–1.0)
	"aa": AA.MSAA_2X,
	"shadows": Shadows.MEDIUM,
	"menu_background": true,    # ana menü/lobi 3D devriye arka planı (kapalı = hafif)
	"ui_scale": 1.0,            # arayüz ölçeği (0.8–1.0)
	# Kontrol
	"mouse_sensitivity": 1.0,   # sanal nişangah hızı (0.2–3.0)
	"camera_shake": 1.0,        # patlama sarsıntısı (0 = kapalı)
	# Ses (0..1)
	"vol_Master": 0.8,
	"vol_Music": 0.6,
	"vol_SFX": 0.8,
	"vol_UI": 0.7,
	# Oyun
	"show_fps": false,
	"language": "",             # "" = sistem dili, "tr", "en" (Lang.gd)
}

## Hazır grafik profilleri (ayar penceresi "Kalite" menüsü)
const PRESETS := {
	"Düşük":  {"render_scale": 0.7, "aa": AA.OFF, "shadows": Shadows.OFF, "menu_background": false},
	"Orta":   {"render_scale": 0.85, "aa": AA.FXAA, "shadows": Shadows.LOW, "menu_background": true},
	"Yüksek": {"render_scale": 1.0, "aa": AA.MSAA_2X, "shadows": Shadows.MEDIUM, "menu_background": true},
	"Ultra":  {"render_scale": 1.0, "aa": AA.MSAA_4X, "shadows": Shadows.HIGH, "menu_background": true},
}

static var values: Dictionary = {}
static var _loaded := false
static var _applied := false
static var _has_file := false   # hiç kaydedilmemişse açılışta pencere boyutuna dokunma (proje varsayılanı kalsın)

## Sanal nişangah (oyun içi): fare kilitlenir, nişangah hareket × hassasiyet kadar kayar
static var cursor_active := false
static var cursor_pos := Vector2.ZERO


# ─────────────────────────────────────────────
#  Okuma / yazma
# ─────────────────────────────────────────────

static func get_value(key: String) -> Variant:
	_ensure_loaded()
	return values.get(key, DEFAULTS.get(key))


static func get_all() -> Dictionary:
	_ensure_loaded()
	return values.duplicate(true)


static func set_all(d: Dictionary) -> void:
	_ensure_loaded()
	for k: String in DEFAULTS:
		if d.has(k):
			values[k] = d[k]


static func load_settings() -> void:
	_loaded = true
	values = DEFAULTS.duplicate(true)
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	_has_file = true
	for k: String in DEFAULTS:
		if cfg.has_section_key("options", k):
			var v: Variant = cfg.get_value("options", k)
			if typeof(v) == typeof(DEFAULTS[k]) or (DEFAULTS[k] is float and v is int):
				values[k] = v


static func save() -> void:
	var cfg := ConfigFile.new()
	for k: String in values:
		cfg.set_value("options", k, values[k])
	cfg.save(SAVE_PATH)
	_has_file = true


static func _ensure_loaded() -> void:
	if not _loaded:
		load_settings()


# ─────────────────────────────────────────────
#  Uygulama
# ─────────────────────────────────────────────

## Oyun açılışında bir kez (UITheme.apply çağırır)
static func apply_once(tree: SceneTree) -> void:
	if _applied:
		return
	_applied = true
	apply_all(tree)


static func apply_all(tree: SceneTree) -> void:
	_ensure_loaded()
	var root := tree.root
	LANG.apply(String(get_value("language")))
	if _has_file:
		_apply_window()
	DisplayServer.window_set_vsync_mode([DisplayServer.VSYNC_DISABLED, DisplayServer.VSYNC_ENABLED,
		DisplayServer.VSYNC_ADAPTIVE][clampi(int(get_value("vsync")), 0, 2)])
	Engine.max_fps = int(get_value("max_fps"))

	# 3D çözünürlük ölçeği (UI etkilenmez — canvas_items ölçeklemesi)
	var rs := clampf(float(get_value("render_scale")), 0.5, 1.0)
	root.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	root.scaling_3d_scale = rs

	# Kenar yumuşatma
	var aa := int(get_value("aa"))
	root.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if aa == AA.FXAA else Viewport.SCREEN_SPACE_AA_DISABLED
	root.msaa_3d = Viewport.MSAA_4X if aa == AA.MSAA_4X else (Viewport.MSAA_2X if aa == AA.MSAA_2X else Viewport.MSAA_DISABLED)

	# Gölgeler (el feneri / lamba — hepsi konumsal ışık): atlas boyutu 0 = gölge yok
	var sh := int(get_value("shadows"))
	root.positional_shadow_atlas_size = [0, 1024, 2048, 4096][clampi(sh, 0, 3)]
	RenderingServer.positional_soft_shadow_filter_set_quality([
		RenderingServer.SHADOW_QUALITY_HARD, RenderingServer.SHADOW_QUALITY_SOFT_VERY_LOW,
		RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM][clampi(sh, 0, 3)])

	# Arayüz ölçeği (UITheme taban 1152×648 — 1'in üstü ekrana sığmaz)
	root.content_scale_factor = clampf(float(get_value("ui_scale")), 0.8, 1.0)

	_apply_audio()
	_apply_fps_counter(tree)


static func _apply_window() -> void:
	var mode := int(get_value("window_mode"))
	match mode:
		WindowMode.BORDERLESS:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		WindowMode.EXCLUSIVE:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		_:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			var res: Vector2i = get_value("resolution")
			var screen := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
			res = Vector2i(mini(res.x, screen.size.x), mini(res.y, screen.size.y))
			if DisplayServer.window_get_size() != res:
				DisplayServer.window_set_size(res)
				# Editörden çok pencereli testte pencereleri editör dizer — üst üste ortalama
				if not OS.is_debug_build():
					DisplayServer.window_set_position(screen.position + (screen.size - res) / 2)


static func _apply_audio() -> void:
	for bus_name in AUDIO_BUSES:
		var idx := AudioServer.get_bus_index(bus_name)
		if idx < 0:
			# Ses kanalı yoksa oluştur (Master'a bağlı) — sesler eklendiğinde bu kanallara yönlendirilecek
			AudioServer.add_bus()
			idx = AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")
		var v := clampf(float(get_value("vol_" + bus_name)), 0.0, 1.0)
		AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(v, 0.0001)))
		AudioServer.set_bus_mute(idx, v <= 0.001)


static func _apply_fps_counter(tree: SceneTree) -> void:
	var existing := tree.root.get_node_or_null("FpsCounter")
	if bool(get_value("show_fps")):
		if existing == null:
			var c: Node = FPS_COUNTER.new()
			c.name = "FpsCounter"
			tree.root.add_child.call_deferred(c)
	elif existing:
		existing.queue_free()


## Pencereli modda listelenecek çözünürlükler (ekrana sığanlar)
static func available_resolutions() -> Array[Vector2i]:
	var screen := DisplayServer.screen_get_size(DisplayServer.window_get_current_screen())
	var out: Array[Vector2i] = []
	for r in RESOLUTIONS:
		if r.x <= screen.x and r.y <= screen.y:
			out.append(r)
	if out.is_empty():
		out.append(screen)
	return out


# ─────────────────────────────────────────────
#  Nişan (sanal nişangah)
# ─────────────────────────────────────────────

## Player._get_aim_target kullanır: sanal nişangah aktifse onun konumu, değilse gerçek fare
static func aim_screen_position(vp: Viewport) -> Vector2:
	return cursor_pos if cursor_active else vp.get_mouse_position()
