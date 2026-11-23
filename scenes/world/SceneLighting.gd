## SceneLighting.gd — oyun haritalarının "sinematik karanlık" görünümü (post-process).
## Statik, `preload` ile kullanılır (autoload değil). default_env.tres'e DOKUNMAZ (editör açıkken ezilmesin) —
## ayarlar çalışma anında haritanın WorldEnvironment'ına yazılır (yerinde: SmokeCloud aynı Environment'ı okur).
##
## Çağıranlar: Map.gd / ImportedMap.gd `_ready` (`apply_node`), GameSettings.apply_all (`apply_tree` — oyun içinde
## Ayarlar → UYGULA gölge kalitesini değiştirirse SSAO açılır/kapanır).
##
## Hedef görünüm: neredeyse siyah, haritaya özel ince soğuk/gece tonu + SICAK oyuncu ışıkları (fener + Player "Halo"),
## ACES kontrast, parlak (HDR > 1) emissive yüzeylerde glow, köşe/dip kararması (SSAO), hafif derinlik pusu.

extends RefCounted

const AMBIENT_COLOR := Color(0.10, 0.125, 0.22)    # varsayılan soğuk gece mavisi
const AMBIENT_ENERGY := 1.0
const EXPOSURE := 1.6                              # ACES orta tonları koyulaştırır → telafi
const WHITE := 6.0
const FOG_COLOR := Color(0.035, 0.05, 0.10)
const FOG_DENSITY := 0.0019                        # kamera ~39 m (FOV 40) → oyuncuda yine ~%7 pus

## Harita bazlı ince gece atmosfer tonları (karanlık gerilimini koruyarak her haritaya kimlik verir)
const MAP_THEMES := {
	"maze":        {"ambient": Color(0.08, 0.105, 0.18), "fog": Color(0.025, 0.038, 0.075), "fog_density": 0.0023},
	"maze_v3":     {"ambient": Color(0.078, 0.105, 0.175), "fog": Color(0.024, 0.036, 0.072), "fog_density": 0.0024},
	"embassy":     {"ambient": Color(0.095, 0.115, 0.19), "fog": Color(0.032, 0.042, 0.082), "fog_density": 0.0019},
	"embassy_v3":  {"ambient": Color(0.095, 0.115, 0.19), "fog": Color(0.032, 0.042, 0.082), "fog_density": 0.0019},
	"desert":      {"ambient": Color(0.13, 0.115, 0.15), "fog": Color(0.055, 0.045, 0.065), "fog_density": 0.0022},
	"desert_v3":   {"ambient": Color(0.13, 0.115, 0.15), "fog": Color(0.055, 0.045, 0.065), "fog_density": 0.0022},
	"forest":      {"ambient": Color(0.085, 0.135, 0.14), "fog": Color(0.025, 0.055, 0.055), "fog_density": 0.0024},
	"forest_v3":   {"ambient": Color(0.085, 0.135, 0.14), "fog": Color(0.025, 0.055, 0.055), "fog_density": 0.0024},
	"quantum":     {"ambient": Color(0.075, 0.13, 0.19), "fog": Color(0.02, 0.05, 0.085), "fog_density": 0.0017},
	"quantum_v3":  {"ambient": Color(0.075, 0.13, 0.19), "fog": Color(0.02, 0.05, 0.085), "fog_density": 0.0020},
	"hospital":    {"ambient": Color(0.085, 0.13, 0.14), "fog": Color(0.025, 0.048, 0.055), "fog_density": 0.0021},
	"hospital_v3": {"ambient": Color(0.085, 0.13, 0.14), "fog": Color(0.025, 0.048, 0.055), "fog_density": 0.0021},
	"subway":      {"ambient": Color(0.095, 0.115, 0.16), "fog": Color(0.03, 0.04, 0.065), "fog_density": 0.0021},
	"subway_v3":   {"ambient": Color(0.095, 0.115, 0.16), "fog": Color(0.03, 0.04, 0.065), "fog_density": 0.0021},
	"warehouse":   {"ambient": Color(0.11, 0.11, 0.145), "fog": Color(0.04, 0.04, 0.058), "fog_density": 0.0021},
	"warehouse_v3":{"ambient": Color(0.11, 0.11, 0.145), "fog": Color(0.04, 0.04, 0.058), "fog_density": 0.0021},
	"port":        {"ambient": Color(0.085, 0.12, 0.21), "fog": Color(0.025, 0.045, 0.095), "fog_density": 0.0022},
	"port_v3":     {"ambient": Color(0.085, 0.12, 0.21), "fog": Color(0.025, 0.045, 0.095), "fog_density": 0.0022},
}


static func apply_tree(tree: SceneTree) -> void:
	if tree == null or tree.current_scene == null:
		return
	apply_node(tree.current_scene)


## Sahne kökünden WorldEnvironment'ı bulup uygular (yoksa sessiz geçer — menü/lobi kendi Environment'larını kurar)
static func apply_node(scene_root: Node) -> void:
	var we := scene_root.find_child("WorldEnvironment", false, false) as WorldEnvironment
	if we == null or we.environment == null:
		return
	var map_id := ""
	var nm := scene_root.get_tree().root.get_node_or_null("NetworkManager") if scene_root.get_tree() else null
	if nm != null and nm.has_method("get_map_info"):
		map_id = String(nm.call("get_map_info").get("id", ""))
	apply(we.environment, int(GameSettings.get_value("shadows")), map_id)


## quality = GameSettings "shadows" (0 kapalı .. 3 yüksek — kalite presetine bağlı)
static func apply(env: Environment, quality: int, map_id: String = "") -> void:
	var theme: Dictionary = MAP_THEMES.get(map_id, {})
	var amb: Color = theme.get("ambient", AMBIENT_COLOR)
	var fog_col: Color = theme.get("fog", FOG_COLOR)
	var fog_dens: float = float(theme.get("fog_density", FOG_DENSITY))

	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = amb
	env.ambient_light_energy = AMBIENT_ENERGY

	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = EXPOSURE
	env.tonemap_white = WHITE

	# Glow: sadece HDR > 1 parlayanlar (ampuller, güç küreleri, çıkış sütunu, mermi/kıvılcım izi) etrafa ışık saçar
	# Ölçüm (1600×900, iGPU): glow ~3.2 ms → Yüksek ve Ultra'da; Düşük/Orta'da kapalı
	env.glow_enabled = quality >= 2
	env.glow_normalized = true
	env.glow_intensity = 0.72
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	# Seviye 1 (yarım çözünürlük) en pahalısı → sadece 2-4 (daha yumuşak/geniş hale, ölçümde ucuz)
	for i in 7:
		env.set_glow_level(i, 1.0 if i in [2, 3, 4] else 0.0)
	RenderingServer.environment_glow_set_use_bicubic_upscale(false)

	# SSAO: SADECE Ultra. Ölçüm (1600×900): tam çözünürlük ~4.4 ms, yarım çözünürlük + düşük kalite ~2.5 ms.
	env.ssao_enabled = quality >= 3
	RenderingServer.environment_set_ssao_quality(RenderingServer.ENV_SSAO_QUALITY_LOW, true, 0.5, 2, 50.0, 300.0)
	env.ssao_radius = 1.4
	env.ssao_intensity = 2.5
	env.ssao_power = 1.6
	env.ssao_light_affect = 0.15

	# Hafif kontrast + doygunluk (sıcak/soğuk zıtlığı belirginleşsin)
	env.adjustment_enabled = true
	env.adjustment_brightness = 1.0
	env.adjustment_contrast = 1.05
	env.adjustment_saturation = 1.12

	# Ucuz derinlik pusu (hacimsel değil). SmokeCloud hacimsel sisi ayrıca açıp kapatır — çakışmaz.
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = fog_col
	env.fog_light_energy = 1.0
	env.fog_density = fog_dens
	env.fog_sky_affect = 0.0
