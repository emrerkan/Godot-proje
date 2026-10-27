## SmokeCloud.gd — Sis bombasının duman bulutu (CS:GO tarzı), her peer'da YEREL görsel (Bomb.gd oluşturur).
##
## Hacimsel sis (FogVolume) kullanır — kameraya dönük kart/parçacık DEĞİL (onlar "kare kare" görünüyordu ve zemine
## değdikleri yerde düz kenar bırakıyordu). Gerçek 3B yoğunluk: kenarı yok, el feneri ışığı içinde saçılır (huzme),
## yoğun olduğu için içindekini/arkasındakini tamamen kapatır.
##
## Akış: fitil biter → bulut ~0.9 sn'de kutudan dışarı "patlayarak" büyür → SMOKE süresince durur, yavaşça döner
## (gürültü dokusu kayar, kıvrılan duman hissi) → sonunda seyrelip kaybolur.
##
## PERFORMANS: haritanın Environment'ında hacimsel sis normalde KAPALI. İlk bulut açar, son bulut silinince eski haline
## döndürür (_active_count) → duman yokken oyun hiç yavaşlamaz. Gürültü dokusu harita yüklenirken hazırlanır (warm_up).
## Oyun mantığına dokunmaz (mermiler geçer, hasar yok).

extends Node3D

const DENSITY := 6.0                  # yoğunluk (yüksek = birkaç metrede tamamen opak; CS:GO dumanı gibi)
const HEIGHT := 3.6                   # bulut yüksekliği (m) — karakter (1.9 m) + üstten bakan kamera için baş da gizlensin
const GROW_TIME := 0.9                # patlayıp büyüme süresi
const FADE_TIME := 3.5                # sonunda seyrelme süresi
const SPIN_SPEED := 0.12              # rad/sn — gürültü dokusu kayar, duman kıvrılıyor gibi görünür
const ALBEDO := Color(0.82, 0.84, 0.86)   # ışığı saçan açık gri duman
const AMBIENT := Color(0.13, 0.135, 0.14)  # kendi hafif parlaklığı — karanlık haritada da gri bir duman kütlesi olarak seçilsin

static var _active_count := 0
static var _env_prev: Dictionary = {}   # hacimsel sis açılmadan önceki Environment ayarları
static var _noise_tex: NoiseTexture3D = null

var _radius := 5.0
var _duration := 12.0
var _volume: FogVolume
var _mat: FogMaterial
var _env: Environment
var _spin := 0.0


func setup(radius: float, duration: float) -> void:
	_radius = radius
	_duration = duration


## Harita yüklenirken çağrılır (PowerupManager._ready) — gürültü dokusu ilk sis anında üretilip oyunu dondurmasın
static func warm_up() -> void:
	_get_noise()


func _ready() -> void:
	_enable_volumetric_fog()

	_mat = FogMaterial.new()
	_mat.density = DENSITY
	_mat.albedo = ALBEDO
	_mat.emission = AMBIENT
	_mat.edge_fade = 0.55           # kenarlar yumuşak, top gibi değil
	_mat.height_falloff = 0.25      # üst kısım biraz seyrek (doğal duman)
	_mat.density_texture = _get_noise()

	_volume = FogVolume.new()
	_volume.shape = RenderingServer.FOG_VOLUME_SHAPE_ELLIPSOID
	_volume.material = _mat
	_volume.size = Vector3(0.6, 0.5, 0.6)
	_volume.position.y = HEIGHT * 0.5 - 0.2
	add_child(_volume)

	# Patlayıp büyüme: önce hızlı, sonra yavaşlayarak
	var full := Vector3(_radius * 2.0, HEIGHT, _radius * 2.0)
	var tw := create_tween()
	tw.tween_property(_volume, "size", full, GROW_TIME).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	_fade_later()


func _process(delta: float) -> void:
	_spin += SPIN_SPEED * delta
	_volume.rotation.y = _spin


func _fade_later() -> void:
	await get_tree().create_timer(GROW_TIME + _duration).timeout
	if not is_instance_valid(self):
		return
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_mat, "density", 0.0, FADE_TIME).set_ease(Tween.EASE_IN)
	tw.tween_property(_volume, "size", _volume.size * 1.25, FADE_TIME)  # dağılırken genişler
	tw.chain().tween_callback(queue_free)


func _exit_tree() -> void:
	_active_count -= 1
	if _active_count <= 0:
		_active_count = 0
		_restore_volumetric_fog()


# ─────────────────────────────────────────────
#  Hacimsel sisi sadece duman varken aç
# ─────────────────────────────────────────────

func _enable_volumetric_fog() -> void:
	_env = _find_environment()
	_active_count += 1
	if _env == null or _active_count > 1:
		return
	_env_prev = {
		"enabled": _env.volumetric_fog_enabled,
		"density": _env.volumetric_fog_density,
		"length": _env.volumetric_fog_length,
		"temporal": _env.volumetric_fog_temporal_reprojection_enabled,
	}
	_env.volumetric_fog_enabled = true
	if not bool(_env_prev["enabled"]):
		_env.volumetric_fog_density = 0.0        # global sis yok — sadece FogVolume'lar
	_env.volumetric_fog_length = maxf(_env.volumetric_fog_length, 40.0)  # kamera 14 m yukarıda
	_env.volumetric_fog_temporal_reprojection_enabled = true  # yumuşak, titremesiz


static func _restore_volumetric_fog() -> void:
	if _env_prev.is_empty():
		return
	var env := _last_env
	if env:
		env.volumetric_fog_enabled = _env_prev["enabled"]
		env.volumetric_fog_density = _env_prev["density"]
		env.volumetric_fog_length = _env_prev["length"]
		env.volumetric_fog_temporal_reprojection_enabled = _env_prev["temporal"]
	_env_prev = {}


static var _last_env: Environment = null

func _find_environment() -> Environment:
	var w := get_world_3d()
	var env: Environment = w.environment if w else null
	if env == null and w:
		env = w.fallback_environment
	_last_env = env
	return env


## Kıvrımlı duman dokusu (fbm), tek sefer üretilir, tüm bulutlar paylaşır
static func _get_noise() -> NoiseTexture3D:
	if _noise_tex:
		return _noise_tex
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.11
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 3
	_noise_tex = NoiseTexture3D.new()
	# Kontrast: seyrek yerler belirgin boşalsın, yoğun yerler dolsun → kabarık/topak topak kenar
	var ramp := Gradient.new()
	ramp.set_color(0, Color(0.15, 0.15, 0.15))
	ramp.set_color(1, Color(1, 1, 1))
	ramp.add_point(0.45, Color(0.45, 0.45, 0.45))
	_noise_tex.color_ramp = ramp
	_noise_tex.width = 48
	_noise_tex.height = 32
	_noise_tex.depth = 48
	_noise_tex.seamless = true
	_noise_tex.normalize = true
	_noise_tex.noise = n
	return _noise_tex
