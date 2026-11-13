## SceneLighting.gd — oyun haritalarının "sinematik karanlık" görünümü (post-process).
## Statik, `preload` ile kullanılır (autoload değil). default_env.tres'e DOKUNMAZ (editör açıkken ezilmesin) —
## ayarlar çalışma anında haritanın WorldEnvironment'ına yazılır (yerinde: SmokeCloud aynı Environment'ı okur).
##
## Çağıranlar: Map.gd / ImportedMap.gd `_ready` (`apply_node`), GameSettings.apply_all (`apply_tree` — oyun içinde
## Ayarlar → UYGULA gölge kalitesini değiştirirse SSAO açılır/kapanır).
##
## Hedef görünüm: neredeyse siyah, hafif SOĞUK ortam + SICAK oyuncu ışıkları (fener + Player "Halo"),
## ACES kontrast, parlak (HDR > 1) emissive yüzeylerde glow, köşe/dip kararması (SSAO), hafif mavi derinlik pusu.

extends RefCounted

const AMBIENT_COLOR := Color(0.1, 0.125, 0.22)     # soğuk mavi (ACES karanlıkları ezer → doğrusal eskisinden yüksek)
const AMBIENT_ENERGY := 1.0
const EXPOSURE := 1.6                              # ACES orta tonları koyulaştırır → telafi
const WHITE := 6.0
const FOG_COLOR := Color(0.035, 0.05, 0.1)
const FOG_DENSITY := 0.004                         # kamera ~18 m → ~%7 mavi pus


static func apply_tree(tree: SceneTree) -> void:
	if tree == null or tree.current_scene == null:
		return
	apply_node(tree.current_scene)


## Sahne kökünden WorldEnvironment'ı bulup uygular (yoksa sessiz geçer — menü/lobi kendi Environment'larını kurar)
static func apply_node(scene_root: Node) -> void:
	var we := scene_root.find_child("WorldEnvironment", false, false) as WorldEnvironment
	if we == null or we.environment == null:
		return
	apply(we.environment, int(GameSettings.get_value("shadows")))


## quality = GameSettings "shadows" (0 kapalı .. 3 yüksek — kalite presetine bağlı)
static func apply(env: Environment, quality: int) -> void:
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = AMBIENT_COLOR
	env.ambient_light_energy = AMBIENT_ENERGY

	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = EXPOSURE
	env.tonemap_white = WHITE

	# Glow: sadece HDR > 1 parlayanlar (ampuller, güç küreleri, çıkış sütunu, mermi izi) etrafa ışık saçar
	# Ölçüm (1600×900, iGPU): glow ~3.2 ms → Yüksek ve Ultra'da; Düşük/Orta'da kapalı
	env.glow_enabled = quality >= 2
	env.glow_normalized = true
	env.glow_intensity = 0.7
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	# Seviye 1 (yarım çözünürlük) en pahalısı → sadece 2-4 (daha yumuşak/geniş hale, ölçümde ucuz)
	for i in 7:
		env.set_glow_level(i, 1.0 if i in [2, 3, 4] else 0.0)
	RenderingServer.environment_glow_set_use_bicubic_upscale(false)

	# SSAO: SADECE Ultra. Ölçüm (1600×900): tam çözünürlük ~4.4 ms, yarım çözünürlük + düşük kalite ~2.5 ms.
	# light_affect: ortam ışığı düşük → doğrudan ışığı da biraz karartır.
	env.ssao_enabled = quality >= 3
	RenderingServer.environment_set_ssao_quality(RenderingServer.ENV_SSAO_QUALITY_LOW, true, 0.5, 2, 50.0, 300.0)
	env.ssao_radius = 1.4
	env.ssao_intensity = 2.5
	env.ssao_power = 1.6
	env.ssao_light_affect = 0.15

	# Hafif kontrast + doygunluk (sıcak/soğuk zıtlığı belirginleşsin)
	env.adjustment_enabled = true
	env.adjustment_brightness = 1.0
	env.adjustment_contrast = 1.04
	env.adjustment_saturation = 1.12

	# Ucuz derinlik pusu (hacimsel değil). SmokeCloud hacimsel sisi ayrıca açıp kapatır — çakışmaz.
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = FOG_COLOR
	env.fog_light_energy = 1.0
	env.fog_density = FOG_DENSITY
	env.fog_sky_affect = 0.0
