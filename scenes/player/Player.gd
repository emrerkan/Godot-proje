## Player.gd (3D)
## WASD hareketi, mouse ile nişan alma, ateş etme, SpotLight3D el feneri ve sağlık sistemi.

extends CharacterBody3D

signal health_changed(new_health: float)
signal ammo_changed(current: int, total: int, reloading: bool)
signal healed(amount: float)  # sadece local — HUD yeşil vinyet
signal hit_confirmed(killed: bool)  # sadece local — host hasarı İŞLEDİ (isabet işareti + ses, HUD)
## Görünmezlik (PowerupManager._invis_rpc → set_invisible) — HER peer'da emit edilir, HUD yalnızca yerel oyuncununkine bağlanır.
## active=false iken duration = bitişte kalan süre (süre dolduysa 0.0, ateş/bıçakla bozulduysa > 0) — HUD "bozuldu / bitti" ayrımı için.
signal invisibility_changed(active: bool, duration: float)
## Özel silah hazır/değil (PowerupManager._special_gun_rpc → set_special_armed) — HER peer'da emit edilir.
signal special_armed_changed(armed: bool)

@export var speed: float = 8.0
@export var max_health: float = 100.0

@onready var flashlight: SpotLight3D = $Flashlight
@onready var body_light: OmniLight3D = $BodyLight
@onready var health_label: Label3D = $HealthLabel
@onready var name_label: Label3D = $NameLabel
@onready var ammo_label: Label3D = $AmmoLabel
@onready var card_indicator: Label3D = $CardIndicatorLabel
@onready var weapon_holder: Node3D = $WeaponHolder
@onready var collision_shape: CollisionShape3D = $CollisionShape3D

const GRAVITY := 9.8
const SYNC_RATE: float = 0.05
const BODY_LIGHT_LAYER_BIT: int = 20  # BodyLight'ın sadece karakter mesh'ine değmesi için özel render layer
## Sinematik aydınlatma (SceneLighting.gd ile birlikte): fener hafif sıcak, etrafta turuncu "Halo" havuzu.
## Halo HERKESE görünür (kullanıcı kararı: ışık = konumunu ele verir). Flashlight'ın çocuğu → ölüm/görünmezlikte
## fenerle birlikte otomatik gizlenir. Gölgeli (ince duvarlardan sızmasın), kısa menzil → gölge geçişi ucuz.
const FLASHLIGHT_COLOR := Color(1.0, 0.88, 0.72)
const HALO_COLOR := Color(1.0, 0.56, 0.26)
const HALO_ENERGY := 1.4
const HALO_RANGE := 4.5
const HALO_HEIGHT := 1.6
const SELF_RIM_SHADER: Shader = preload("res://scenes/player/SelfVisibility.gdshader")
const OVERHEAD_CARDS_SCRIPT := preload("res://scenes/player/OverheadCards3D.gd")
## Uzak oyuncu ışık LOD'u (20 oyunculu maçta gölge atlası taşıyordu → ani FPS düşüşü). Işık HERKESE görünür kalır;
## sadece GÖLGE kırpılır. Yerel oyuncunun feneri + halesi hep gölgeli. Uzaklarda: motor tarafı mesafe sönümü
## (statik ayar) + `LIGHT_LOD_INTERVAL` aralıkla kameraya en yakın `REMOTE_SHADOW_SPOTS` uzak fener gölgeli.
const LIGHT_LOD_INTERVAL: float = 0.22          # ~4.5 Hz, tüm uzak oyuncular tek sıralamada (statik)
const REMOTE_SHADOW_SPOTS: int = 3              # gölgeli uzak fener sayısı
const LIGHT_LOD_HYSTERESIS: float = 3.0         # gölgesi açık fener sıralamada bu kadar m avantajlı (titreme olmasın)
# Mesafeler KAMERADAN ölçülür — kamera FOV 40'a geçince oyuncudan ~39 m uzakta (eskiden ~18) → hepsi +20 m (CameraController.FOV_DEG)
const REMOTE_SPOT_SHADOW_MAX_DIST: float = 60.0 # bundan uzak fener sıralamaya girse de gölgesiz
const REMOTE_SPOT_FADE_BEGIN: float = 75.0      # fener ışığı kameradan bu mesafeden sonra söner (menzil 26 m → ekrana taşmaz)
const REMOTE_SPOT_FADE_LENGTH: float = 10.0
const REMOTE_HALO_FADE_BEGIN: float = 58.0      # hale ~65 m'de tamamen kaybolur (motor ışığı çizmez)
const REMOTE_HALO_FADE_LENGTH: float = 7.0
static var _lod_remotes: Array = []             # uzak (yerel olmayan) Player düğümleri
static var _lod_next_ms: int = 0

const CHARACTER_STATS: Dictionary = {
	"Tank":     {"health": 150.0, "speed": 5.5},
	"Visioner": {"health": 100.0, "speed": 8.0},
	"Runner":   {"health": 75.0,  "speed": 10.0},
	"Sniper":   {"health": 80.0,  "speed": 7.0},
	"Medic":    {"health": 110.0, "speed": 7.5},
}

const WEAPON_CONFIGS: Dictionary = {
	"Tank":     {"damage": 17.0,  "fire_rate": 0.10, "max_ammo": 30, "reload_time": 2.0, "spread_degrees": 3.0, "bullet_speed": 32.0, "is_semi_auto": false, "max_distance": 45.0},
	"Visioner": {"damage": 18.0,  "fire_rate": 0.09, "max_ammo": 28, "reload_time": 1.7, "spread_degrees": 2.5, "bullet_speed": 32.0, "is_semi_auto": false, "max_distance": 35.0},
	"Runner":   {"damage": 13.0,  "fire_rate": 0.06, "max_ammo": 40, "reload_time": 1.2, "spread_degrees": 3.5, "bullet_speed": 30.0, "is_semi_auto": false, "max_distance": 25.0},
	"Sniper":   {"damage": 120.0, "fire_rate": 1.3,  "max_ammo": 5,  "reload_time": 2.5, "spread_degrees": 0.0, "bullet_speed": 80.0, "is_semi_auto": true,  "max_distance": 400.0, "pierce_walls": false, "one_shot_radius": 18.0, "one_shot_damage": 999.0, "falloff_end": 80.0, "min_damage_ratio": 0.20},  # çember içi (18 m) tek atış, dışı 80 m'ye kadar %20 hasara düşer; duvar delme sadece Özel Silah'ta
	"Medic":    {"damage": 45.0,  "fire_rate": 0.32, "max_ammo": 10, "reload_time": 2.0, "spread_degrees": 1.5, "bullet_speed": 35.0, "is_semi_auto": true,  "max_distance": 55.0},
}

var peer_id: int = 0
var team_id: int = -1
var character_type: String = "Visioner"
var health: float = 100.0
var is_dead: bool = false
var current_weapon: Node = null
var is_local: bool = false
var cards_held: int = 0
var has_card: bool:
	get:
		return cards_held > 0
var _card_base_text: String = ""
var _overhead_cards: Node3D = null
var is_trapped: bool = false   # Ayı kapanı — tam hareketsiz/çaresiz (PowerupManager._trap_trigger_rpc/_trap_freed_rpc)

var _char_mesh: Node3D = null
var _anim_player: AnimationPlayer = null

## Animasyon (SurvivalistModel kütüphanesi: Idle/Run/Walk/Death/...)
const ANIM_IDLE := &"Idle"
const ANIM_RUN := &"Run"
const ANIM_WALK := &"Walk"
const ANIM_CROUCH := &"CrouchWalk"
const ANIM_CROUCH_IDLE := &"CrouchIdle"
const ANIM_DEATH := &"Death"
const ANIM_BLEND := 0.18             # geçiş süresi (sn)
const ANIM_MOVE_THRESHOLD := 0.4     # m/s üstü = hareket ediyor

## Hareket modu — varsayılan yürüyüş, Shift koşu (dayanıklılıklı), Ctrl çömelme (süreli, mermiler üstünden geçer).
## Local tuşlar, uzaklara _broadcast_state ile senkron (host çömelme bağışıklığını bu değerle uygular).
enum MoveMode { RUN, WALK, CROUCH }
const MOVE_SPEED_MULT: Array[float] = [1.0, 0.55, 0.35]           # karakter hızının çarpanı (speed = koşu hızı)
const MOVE_ANIMS: Array[StringName] = [&"Run", &"Walk", &"CrouchWalk"]
## Animasyonun 1.0x oynadığı hız (m/s) — ayak kaymasın diye gerçek hızla oranlanır
## (Run: Tank 5.5 → ~0.9x, Runner 13 → ~2.2x; Walk/Crouch karakter hızının %55/%35'i)
const MOVE_ANIM_REF_SPEED: Array[float] = [6.0, 3.0, 2.0]
var move_mode: int = MoveMode.WALK

## Dayanıklılık (0..1) — sadece local oyuncuda işler, HUD okur
const SPRINT_MAX_TIME := 4.0        # tam dolu → kaç sn koşulur
const SPRINT_REGEN_TIME := 5.0      # boştan tama dolma süresi
const SPRINT_UNLOCK := 0.4          # tükendiyse bu seviyeye dolana kadar koşulamaz
const CROUCH_MAX_TIME := 3.0        # basılı tutarak en fazla
const CROUCH_REGEN_TIME := 4.0
const CROUCH_UNLOCK := 0.5
const STAMINA_REGEN_DELAY := 0.6    # bıraktıktan sonra dolmaya başlama gecikmesi
const DAMAGE_BULLET := 0
const DAMAGE_EXPLOSION := 1
## Özel silah (999). DİKKAT: 2 = DAMAGE_MELEE = GameManager.KILL_KNIFE (bıçak XP bonusu + kill feed bıçak ikonu) ile
## çakışırdı → 4 (3 = arkadan bıçak). GameManager'da 4 özel dala girmez; HUD bunu Player.DAMAGE_SPECIAL ile ayırır.
const DAMAGE_SPECIAL := 4
var sprint_stamina := 1.0
var crouch_stamina := 1.0
var sprint_locked := false          # tükendi, yenileniyor
var crouch_locked := false
var _sprint_delay := 0.0
var _crouch_delay := 0.0

## Zıplama (Space, tüm karakterler): ~1.15 m tepe — sandık/kütük/turnike gibi alçak engellerin üstüne çıkar, 3 m duvarlar
## aşılmaz. Koşu dayanıklılığından JUMP_STAMINA yer (kilitliyken / yetmezse zıplanmaz). Havadayken çömelme (bağışıklık) yok.
## Uzaklara _broadcast_state modunun AIR_FLAG biti → havada JumpRun animasyonu (Mixamo, kök hareketi atılmış).
## Havada yerçekimi: 9.8 ile zıplama/düşme "ağır çekim" gibiydi (kullanıcı: "çok yavaş yükselip çok yavaş alçalıyor")
const AIR_GRAVITY := 24.0
const JUMP_VELOCITY := 7.4          # v²/2g ≈ 1.14 m, havada ~0.62 sn
const JUMP_STAMINA := 0.2
const JUMP_COOLDOWN := 0.35         # yere indikten sonra
const AIR_FLAG := 8
const ANIM_JUMP := &"JumpRun"
const JUMP_ANIM_SPEED := 1.0        # klipte havada kalma 0.07-0.67 sn ≈ ~0.62 sn'lik fizik uçuşu
var _jump_cooldown := 0.0
var _airborne := false              # local: zıpladı ve henüz inmedi · uzak: AIR_FLAG
var _air_anim_played := false

## Fener kapatma (F tuşu, bas-aç/kapa): en fazla 2 sn kapalı kalır, boştan tama 10 sn'de dolar.
## Tükenince otomatik açılır ve tam dolana kadar kilitlenir. Uzaklara _broadcast_state modunun FLASHLIGHT_OFF_FLAG bitiyle senkron.
const FLASHLIGHT_KEY := KEY_F
const FLASHLIGHT_OFF_TIME := 2.0      # tam dolu → kaç sn kapalı kalır
const FLASHLIGHT_REGEN_TIME := 10.0   # boştan tama dolma süresi (sn)
const FLASHLIGHT_OFF_FLAG := 16
var flashlight_off := false
var flashlight_stamina := 1.0         # 0..1 (sadece local oyuncuda işler, HUD okur)
var flashlight_locked := false        # tükendi, tam dolana kadar kullanılamaz
var _flashlight_was_down := false

## Sesler (Sfx.gd — CC0 kayıtlar). Adım: kat edilen yatay mesafe adım boyunu geçince (MOVE_ANIMS sırası: Run, Walk, Crouch)
const SFX := preload("res://scenes/audio/Sfx.gd")
const SFX_LISTENER := preload("res://scenes/audio/SfxListener.gd")
## Vuruş/hareket hissi efektleri (sadece görsel, her peer yerel; headless'ta modüller kendisi atlar)
const BLOOD_FX := preload("res://scenes/fx/BloodFx.gd")
const DEATH_FLASH := preload("res://scenes/fx/DeathFlash.gd")
const SHELL_CASING := preload("res://scenes/fx/ShellCasing.gd")
const MUZZLE_FLASH := preload("res://scenes/fx/MuzzleFlash.gd")
const SLASH_FX := preload("res://scenes/fx/SlashFx.gd")
const DUST_EMITTER := preload("res://scenes/fx/DustEmitter.gd")   # GPUParticles3D toz bulutu (oyuncu başına hazır)
var _dust: Node3D = null
const BLOOD_DEDUP_MS := 250         # mermi zaten kan çıkardıysa _sync_health tekrar çıkarmaz
const SNIPER_EJECT_DELAY := 0.45    # sürgülü: kovan sürgü çekilince
## Kamera vuruşları (kullanıcı: ilk değerler 0.3/0.3/0.5 tam ayarda bile fark edilmiyordu → ~3x + kısa sarsıntı)
const CAM_LUNGE_PUNCH := 1.0        # bıçak hamlesinde kamera itmesi (m)
const CAM_FLIP_PUNCH := 0.8
const CAM_FLIP_DIP := 0.6
const CAM_LAND_DIP := 0.9
const CAM_LAND_TRAUMA := 0.18       # iniş / takla sonu kısa sarsıntı (add_trauma 0..1)
var _flip_move_dir := Vector3.ZERO  # takla toz yönü (dünya XZ)
const STEP_STRIDE: Array[float] = [1.9, 1.25, 0.95]
const STEP_VOLUME_DB: Array[float] = [-10.0, -16.0, -24.0]   # çömelme neredeyse sessiz (taktik)
const SHOT_VOLUME_DB := -5.0
const BREATH_VOLUME_DB := -6.0
const JUMP_VOLUME_DB := -6.0
const BREATH_MIN_GAP := 0.7    # zıpla+takla art arda nefes yağmuru olmasın
var _voice: AudioStreamPlayer3D
var _shot_sound := "shot_rifle"
var _step_dist := 0.0
var _was_airborne := false
var _breath_mode := -1         # çömelmeye GEÇİŞ anında nefes
var _breath_cd := 0.0

## Takla (Ctrl basılı çömelirken + Space, hareket ederken): nişana göre ileri gidiyorsa FrontFlip, geri gidiyorsa BackFlip.
## Kliplerin kalça yüksekliği animasyondan (build_anim_library keep_height), çarpışma gövdesi yerde kalır; ilerlemeyi
## fizik verir: klibin FLIP_MOVE penceresinde yön kilitli sabit hız. Takla sürerken ateş yok, çömelme bağışıklığı yok,
## üst gövde katmanı (AimIdle) kapalı. Uzaklara _flip_rpc (call_local) — konum zaten _broadcast_state ile gelir.
enum Flip { NONE = -1, FRONT, BACK }
const FLIP_ANIMS: Array[StringName] = [&"FrontFlip", &"BackFlip"]
const FLIP_ANIM_SPEED := 1.25
const FLIP_DISTANCE: Array[float] = [5.0, 2.6]            # m (FrontFlip klibi ~6 m koşarak, BackFlip yerinde)
const FLIP_MOVE: Array[Vector2] = [Vector2(0.0, 1.45), Vector2(0.6, 1.4)]   # klip zamanı: ilerleme penceresi
const FLIP_END: Array[float] = [1.5, 1.7]                  # klip zamanı: kontrol geri gelir (kalanı harmanlanır)
const FLIP_STAMINA := 0.3                                  # çömelme dayanıklılığından (koşu ↔ zıplama gibi)
const FLIP_COOLDOWN := 0.5
var _flip: int = Flip.NONE
var _flip_t := 0.0             # klip zamanı
var _flip_dir := Vector3.ZERO  # yatay ilerleme yönü (local)
var _flip_face_yaw := 0.0      # gövdenin dünya yönü (BackFlip: ilerlemenin tersi)
var _flip_cooldown := 0.0
var _space_was_down := false

## Bacak yönü / omurga dönüşü (bkz _update_leg_facing)
const MAX_SPINE_TWIST := 1.92  # ~110°
const LEG_TURN_SPEED := 10.0
const AIM_CORR_GAIN := 10.0    # tüfek→nişan hizalama hızı (1/sn)
const MAX_AIM_CORR := 1.4      # ~80° en fazla düzeltme
var _aim_corr := 0.0
var _leg_yaw := 0.0
var _mesh_base_basis := Basis.IDENTITY
## Karakter modelinin GÖRSEL ölçeği (kullanıcı: tepeden kamerada küçük kalıyordu). Sadece CharacterMesh büyür —
## çarpışma kutusu/hız/vuruş alanı aynı; mermi çıkış yüksekliği Weapon.visual_scale ile eski hizada tutulur.
const CHARACTER_VISUAL_SCALE := 1.3
const SPINE_TWIST_SCRIPT := preload("res://scenes/player/SpineTwistModifier.gd")
const UPPER_BODY_SCRIPT := preload("res://scenes/player/UpperBodyLayer.gd")
const HAND_RIFLE_SCRIPT := preload("res://scenes/player/HandRifle.gd")
var _upper: Node = null       # UpperBodyLayer — tüfek pozları (AimIdle taban + aksiyonlar)
var _hand_rifle: Node = null  # HandRifle — tüfek görseli eller arasında

## Üst gövde aksiyonları (_action_rpc ile diğer peer'lara da oynatılır)
enum Action { RELOAD, TOSS, HIT, STAB }
const ANIM_AIM := &"AimIdle"
const ANIM_FIRE_STAND := &"FireStand"
const ANIM_FIRE_WALK := &"FireWalk"
const ANIM_RELOAD := &"Reload"
const ANIM_TOSS := &"Toss"
const ANIM_HIT := &"HitReact"
const ANIM_DYING := &"Dying"
const DYING_SPEED := 1.6          # Dying 4.4 s → ~2.75 s (respawn 3 s'den önce bitsin)
const TOSS_DURATION := 1.2        # Toss 3.2 s → bomba fırlatma hızında
const FIRE_HOLD := 0.22           # son atıştan sonra ateş pozu ne kadar sürsün

## Bıçaklama (V veya sağ tık, her karakter, her an — şarjör değiştirirken / tuzaktayken / çömelirken de; takla hariç):
## ARKADAN tek vuruş, önden STAB_FRONT_DAMAGE (çömelme korumaz). Arka = hedefin nişan yönüne göre saldıran ±BACKSTAB_ARC
## arkasında (host karar verir). Darbe anında (STAB_HIT_TIME) önündeki koni içindeki en yakın düşman yerel olarak bulunur
## (mermi gibi atan client hesaplar) → host _request_stab ile mesafe/takım/duvarı doğrular. Basınca kısa ileri hamle (lunge).
## Görsel: Stab klibi üst gövdede (Mixamo Stabbing 2.17 s → STAB_DURATION), tüfek gizlenir, sağ elde bıçak (HandRifle).
const ANIM_STAB := &"Stab"
const STAB_KEY := KEY_V
const STAB_DURATION := 0.9        # klip bu süreye sıkıştırılır (darbe klipte ~0.5/2.17 → ~0.21 s)
const STAB_HIT_TIME := 0.22
const STAB_COOLDOWN := 1.0        # basıştan basışa
const KNIFE_SPEED_MULT := 1.15    # sadece bıçak modu: koşu hızı çarpanı (yükseltmeden sonra)
const KNIFE_STAB_COOLDOWN := 0.6  # sadece bıçak modu: bekleme (< STAB_DURATION → ardışık bıçak animasyonu yeniden başlar)


## Oda ayarı "sadece bıçak" mı (room_settings maç içinde değişmez, her peer aynı okur)
func is_knife_mode() -> bool:
	return NetworkManager.get_weapon_mode() == "knife"
const STAB_RANGE := 1.9           # m (gövde merkezleri arası)
const STAB_CONE_COS := 0.5        # nişan yönünden ±60°
const STAB_RANGE_TOLERANCE := 1.2 # host doğrulaması: gecikmeli konum farkı payı
const STAB_DAMAGE := 9999.0       # arkadan
const STAB_FRONT_DAMAGE := 55.0   # önden/yandan
const BACKSTAB_COS := -0.3        # hedefin bakışı · (hedef→saldıran) bundan küçükse arkadan (~±107° arka yay)
const STAB_LUNGE_DIST := 1.0      # basınca ileri hamle (m)
const STAB_LUNGE_TIME := 0.18
const DAMAGE_MELEE := 2
const DAMAGE_BACKSTAB := 3
var _stab_lunge := 0.0            # local: kalan hamle süresi
var _stab_timer := 0.0            # >0: bıçaklama sürüyor (her peer — görsel + ateş kilidi)
var _stab_cooldown := 0.0
var _stab_pending := -1.0         # local: darbe anına kalan süre
var _stab_was_down := false
var _spine_twist: Node = null  # SpineTwistModifier (preload — global class cache'e bağımlı olmasın)
var _idle_anim: StringName = &""
var _last_anim_pos: Vector3 = Vector3.ZERO
var _move_speed := 0.0
var _death_token := 0
var _target_position: Vector3 = Vector3.ZERO
var _target_aim_y: float = 0.0
var _sync_timer: float = 0.0
var _card_pickup_blocked: float = 0.0

## Hasar/iyileşme parıltısı — her peer'da: karakter kırmızı (hasar) / yeşil (sağlık) parlar.
## Işık sadece BODY_LIGHT_LAYER_BIT katmanına (karakter mesh'leri) değer, zemine taşmaz.
const FX_HURT_COLOR := Color(1.0, 0.12, 0.08)
const FX_HEAL_COLOR := Color(0.3, 1.0, 0.45)
const FX_SPAWN_SHIELD_COLOR := Color(0.55, 0.85, 1.0)
const FX_ENERGY := 7.0
const FX_DECAY := 1.8               # 1/sn
var _fx_light: OmniLight3D = null
var _fx_level := 0.0

## Doğma koruması (spawn invulnerability): doğunca / yeniden doğunca bu süre boyunca görünür kalır ama HİÇBİR hasar
## (mermi, bıçak, bomba, özel silah, tuzak) işlemez. Görünmezlik değildir — sadece vurulamazdır.
const SPAWN_INVULN_DURATION := 2.5
const SPAWN_BLINK_HZ := 6.5        # saniyede kaç kez yanıp sönsün (klasik dokunulmazlık sinyali)
const SPAWN_BLINK_TRANS := 0.65    # sönük fazda yarı saydamlık (tamamen kaybolmaz, rakip hâlâ görür)
var _spawn_invuln_left := 0.0
var _spawn_blink_active := false
var _spawn_meshes: Array[GeometryInstance3D] = []
var _reload_sfx_tween: Tween = null

## Profil yükseltme çarpanları (PlayerProfile.multipliers) — initialize'da dolar
const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const GAME_SETTINGS := preload("res://scenes/settings/GameSettings.gd")
var _upgrade_mult: Dictionary = PROFILE.multipliers({})

# ── Yeni güçler: görünmezlik + özel silah (tek atış) ──
# Görsel karar YEREL: rakip bizi hiçbir şekilde görmez (gövde/tüfek/bıçak/fener/etiket/lazer gizli),
# kendisi + takım yarı saydam shimmer görür. Shader/Fx dosyaları paralel yazıldı → yoksa sessizce atlanır.
const SHIMMER_SHADER_PATH := "res://scenes/player/InvisibilityShimmer.gdshader"
const SPECIAL_FX_PATH := "res://scenes/weapons/SpecialGunFx.gd"
const SPECIAL_LASER_LENGTH := 30.0      # = SpecialGunFx.LASER_LENGTH (lazer mesh boyu; nişana göre ölçeklenir)
const SHIMMER_COLOR := Color(0.78, 0.72, 1.0)
const SHIMMER_INTENSITY_SELF := 0.65   # kendi siluetim kaybolmasın (SelfVisibility'nin yerine geçer)
const SHIMMER_INTENSITY_TEAM := 1.0
const SHIMMER_ENDING_TIME := 1.5       # son 1.5 sn yoğunluk yavaşça yükselir (bitiyor ipucu)
const SHIMMER_ENDING_BOOST := 0.2
const SHIMMER_FADE_TIME := 0.2         # bitişte shimmer söner
const SPECIAL_SHOT_SOUND := "shot_sniper"
const SPECIAL_SHOT_EXTRA_DB := 4.0     # normal atıştan yüksek
var is_invisible := false
var special_armed := false
var _invis_left := 0.0
var _vis_hidden := false               # yerelde gizlendi (rakip gözüyle): _fx_light/flash_fx de susar
var _shimmer_mat: ShaderMaterial = null
var _shimmer_shader: Shader = null
var _shimmer_shader_checked := false
var _shimmer_intensity := 0.0
var _shimmer_fade_t := 0.0
var _shimmer_fade_from := 0.0
var _overlay_backup: Dictionary = {}   # MeshInstance3D → önceki material_overlay (SelfVisibility vb.)
var _special_fx: GDScript = null
var _special_fx_checked := false
var _special_laser: Node3D = null
var _shoot_blocked := false            # özel atıştan sonra tuş bırakılana dek normal ateş yok (tam otomatik tüfek)

# ── Bot (NetworkManager.is_bot) — ağda sahte oyuncu, SADECE host simüle eder ──
# is_local'in anlamı DEĞİŞMEZ (kamera/HUD/ses dinleyicisi/self-rim/dayanıklılık HUD'ı/Crosshair hep yerel İNSAN oyuncu).
# _input_driven: girdi + fizik + konum yayını bu peer'da mı yürüyor (yerel insan VEYA host'taki bot).
# Bot girdisi BotBrain → set_bot_input (her kare): hareket/nişan/ateş/şarjör/koşu + çömelme/zıplama/bıçak (takla/güç YOK).
# Çömelme/zıplama/bıçak insanla AYNI kurallardan geçer (dayanıklılık, bekleme); ağ yayını da aynı yol. Botsuz maçta bu alanlar hiç okunmaz.
const BOT_SEMI_REPRESS := 0.12         # tek atışlık silah: tetik basılı kalırsa silah hazır olunca bu kadar sonra yeniden "tıklar"
var is_bot := false
var _input_driven := false
var _bot_driven := false               # is_bot VE bu peer host (bot girdisini bu node işler)
var _bot_move := Vector3.ZERO          # dünya XZ, normalize ya da sıfır
var _bot_aim := Vector3.ZERO           # dünya nişan noktası
var _bot_has_aim := false
var _bot_fire := false                 # tetik basılı
var _bot_fire_prev := false            # önceki karede basılı mıydı (tek atışlıkta kenar algılama)
var _bot_reload_req := false           # tek kare şarjör isteği (tüketilene kadar tutulur)
var _bot_run := false
var _bot_crouch := false               # Ctrl basılı sayılır (çömelme dayanıklılığı sınırı aynen geçerli)
var _bot_jump := false                 # Space basılı sayılır (JUMP_STAMINA + JUMP_COOLDOWN geçerli)
var _bot_stab_req := false             # bıçak isteği (tek seferlik, her stab girişinde tüketilir)
var _bot_repress_t := 0.0


func initialize(p_peer_id: int, p_team_id: int, p_character: String = "Visioner") -> void:
	character_type = p_character
	if _dust == null:
		_dust = DUST_EMITTER.new()   # headless'ta içi boş kalır (burst no-op)
		add_child(_dust)
		_dust.position.y = 0.05
	var char_stats: Dictionary = CHARACTER_STATS.get(p_character, CHARACTER_STATS["Visioner"])
	# Profil yükseltmeleri (karakter başına, NetworkManager.players[peer]["upgrades"] — her peer aynı değeri görür)
	_upgrade_mult = PROFILE.multipliers(NetworkManager.players.get(p_peer_id, {}).get("upgrades", {}))
	max_health = char_stats["health"] * _upgrade_mult["health"]
	speed      = char_stats["speed"] * _upgrade_mult["speed"]
	if is_knife_mode():
		speed *= KNIFE_SPEED_MULT

	peer_id = p_peer_id
	team_id = p_team_id
	is_local = (p_peer_id == NetworkManager.get_local_id())
	# Bot: girdiyi/fiziği host sürer (diğer peer'larda uzak oyuncu gibi _broadcast_state ile gelir)
	is_bot = NetworkManager.is_bot(p_peer_id)
	_bot_driven = is_bot and not is_local and NetworkManager.is_host()
	_input_driven = is_local or _bot_driven
	floor_snap_length = 0.3  # Zemin tespitini güvenilir yapar, hız dalgalanmasını engeller
	_use_capsule_shape()
	collision_mask |= VOID_WALL_LAYER   # ImportedMap su kenarı engeli (sadece oyuncuyu durdurur, mermi/bomba geçer)
	health = max_health

	# Ses: oyuncuya bağlı 3D kaynak (atış/şarjör/adım — her peer'da); yerel oyuncuda dinleyici kafa hizasına
	_voice = SFX.make_voice(self)
	_shot_sound = SFX.shot_for(p_character)
	if is_local:
		var listener: Node3D = SFX_LISTENER.new()
		listener.target = self
		add_child(listener)

	# FBX karakter mesh'ini bul
	_char_mesh = get_node_or_null("CharacterMesh")
	if _char_mesh:
		# Karaktere göre kıyafet (SurvivalistModel.apply_outfit)
		if _char_mesh.has_method("apply_outfit"):
			_char_mesh.apply_outfit(p_character)
		_char_mesh.scale = Vector3.ONE * CHARACTER_VISUAL_SCALE
		# Bacaklar hareket yönüne / üst gövde nişana (bkz _update_leg_facing) — taban basis ölçeği de taşır
		_mesh_base_basis = _char_mesh.transform.basis
		var skeletons := _char_mesh.find_children("*", "Skeleton3D", true, false)
		if not skeletons.is_empty() and _spine_twist == null:
			var sk := skeletons[0] as Skeleton3D
			# Modifier sırası önemli: üst gövde pozu → omurga dönüşü → tüfek ellere hizalanır
			_upper = UPPER_BODY_SCRIPT.new()
			sk.add_child(_upper)
			_spine_twist = SPINE_TWIST_SCRIPT.new()
			sk.add_child(_spine_twist)
			var rifle: Node3D = HAND_RIFLE_SCRIPT.build_weapon_mesh(p_character)   # karakterin gerçek silah modeli
			sk.add_child(rifle)
			_hand_rifle = HAND_RIFLE_SCRIPT.new()
			_hand_rifle.rifle = rifle
			_hand_rifle.aim_node = self  # root -Z = nişan
			var knife: Node3D = HAND_RIFLE_SCRIPT.build_knife_model()
			sk.add_child(knife)
			_hand_rifle.knife = knife
			_hand_rifle.knife_only = is_knife_mode()
			sk.add_child(_hand_rifle)
		_anim_player = _find_anim_player(_char_mesh)
		_play_idle()
		# BodyLight sadece karakter mesh'ine değsin (zemine/duvara ışık/gölge taşmasın)
		_add_render_layer(_char_mesh, BODY_LIGHT_LAYER_BIT)
		# Flashlight kendi gövdesinden devasa gölge atmasın
		_disable_shadow_casting(_char_mesh)
		# Kendi karakterini karanlıkta görünür kılan kenar parıltısı — sadece yerel oyuncuda
		if is_local:
			_apply_self_rim(_char_mesh)

	# Billboard label'lar gizli — bilgiler ekran HUD'ında; tek istisna takım arkadaşının adı
	health_label.visible  = false
	ammo_label.visible    = false
	card_indicator.visible = false
	_setup_ally_name_label()

	# Kafa üstü 3D kart göstergesi ("♦ KART / ×2 / ×3" yazısı yerine 1-2-3 süzülen taktik kart)
	if _overhead_cards == null:
		_overhead_cards = OVERHEAD_CARDS_SCRIPT.new()
		_overhead_cards.position = Vector3(0.0, 3.52, 0.0)
		_overhead_cards.visible = false
		add_child(_overhead_cards)

	# Body ışığı sadece yerel oyuncuda — uzak oyuncuların üzerinde hale olmasın
	body_light.visible = is_local

	_setup_halo_light()

	if _fx_light == null:
		_fx_light = OmniLight3D.new()
		_fx_light.position = Vector3(0, 1.1, 0)
		_fx_light.omni_range = 2.8
		_fx_light.light_cull_mask = 1 << (BODY_LIGHT_LAYER_BIT - 1)
		_fx_light.visible = false
		add_child(_fx_light)

	_target_position = global_position
	_last_anim_pos = global_position
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_ON
	reset_physics_interpolation()
	_spawn_invuln_left = SPAWN_INVULN_DURATION

	_equip_default_weapon()


func _setup_halo_light() -> void:
	flashlight.light_color = FLASHLIGHT_COLOR
	var halo := flashlight.get_node_or_null("Halo") as OmniLight3D
	if halo == null:
		halo = OmniLight3D.new()
		halo.name = "Halo"
		# Flashlight root'a göre (0, 1.3, -0.5) → halo gövdenin tam üstünde dursun
		halo.position = Vector3(0.0, HALO_HEIGHT - flashlight.position.y, -flashlight.position.z)
		halo.light_color = HALO_COLOR
		halo.light_energy = HALO_ENERGY
		halo.light_specular = 0.3
		halo.omni_range = HALO_RANGE
		halo.omni_attenuation = 1.3
		halo.omni_shadow_mode = OmniLight3D.SHADOW_DUAL_PARABOLOID
		flashlight.add_child(halo)
	# Gölge SADECE yerel oyuncunun halesinde (kullanıcı kararı 2026-11-13): uzak oyuncu (insan/bot) başına
	# gölgeli omni çöl haritasında 79 → 14 FPS'e düşürüyordu. Bedeli: uzak hale ince duvar arkasına hafif sızabilir.
	halo.shadow_enabled = is_local
	# Yerel: kamera hep ~18 m'de → mesafe sönümü gereksiz. Uzak: motor ~45 m'de haleyi hiç çizmez.
	halo.distance_fade_enabled = not is_local
	halo.distance_fade_begin = REMOTE_HALO_FADE_BEGIN
	halo.distance_fade_length = REMOTE_HALO_FADE_LENGTH
	# Fener: yerel hep gölgeli; uzak fener başlangıçta gölgesiz, `_update_light_lod` en yakın N'ini açar.
	flashlight.shadow_enabled = is_local
	flashlight.distance_fade_enabled = not is_local
	flashlight.distance_fade_begin = REMOTE_SPOT_FADE_BEGIN
	flashlight.distance_fade_length = REMOTE_SPOT_FADE_LENGTH
	flashlight.distance_fade_shadow = REMOTE_SPOT_SHADOW_MAX_DIST   # gölge açık olsa da bu mesafede motor söndürür
	_lod_remotes.erase(self)
	if not is_local and DisplayServer.get_name() != "headless":
		_lod_remotes.append(self)


func _exit_tree() -> void:
	_lod_remotes.erase(self)


## Statik, tüm uzak oyuncular için TEK sıralama (~4.5 Hz; hangi Player'ın _process'i önce yakalarsa o yapar).
## Kameraya en yakın REMOTE_SHADOW_SPOTS uzak fener gölgeli, kalanı gölgesiz. Işık görünürlüğüne dokunmaz
## (ölüm/görünmezlik gizlemesi `flashlight.visible` ile ayrı yürür). Headless'ta liste boş → hiçbir şey yapmaz.
static func _update_light_lod(vp: Viewport) -> void:
	var now := Time.get_ticks_msec()
	if now < _lod_next_ms:
		return
	_lod_next_ms = now + int(LIGHT_LOD_INTERVAL * 1000.0)
	var cam := vp.get_camera_3d() if vp != null else null
	if cam == null:
		return
	var cam_pos := cam.global_position
	var ranked: Array = []
	for i in range(_lod_remotes.size() - 1, -1, -1):
		var p = _lod_remotes[i]
		if not is_instance_valid(p):
			_lod_remotes.remove_at(i)
			continue
		var fl: SpotLight3D = p.flashlight
		if fl == null or not fl.is_visible_in_tree():
			if fl != null:
				fl.shadow_enabled = false
			continue
		var d: float = fl.global_position.distance_to(cam_pos)
		if fl.shadow_enabled:
			d -= LIGHT_LOD_HYSTERESIS
		ranked.append([d, fl])
	ranked.sort_custom(func(a, b): return a[0] < b[0])
	for i in ranked.size():
		var want: bool = i < REMOTE_SHADOW_SPOTS and ranked[i][0] < REMOTE_SPOT_SHADOW_MAX_DIST
		var light: SpotLight3D = ranked[i][1]
		if light.shadow_enabled != want:
			light.shadow_enabled = want


func _add_render_layer(node: Node, layer_bit: int) -> void:
	if node is VisualInstance3D:
		(node as VisualInstance3D).set_layer_mask_value(layer_bit, true)
	for child in node.get_children():
		_add_render_layer(child, layer_bit)


func _apply_self_rim(node: Node) -> void:
	# material_overlay: mevcut malzemeyi bozmadan üstüne unshaded bir kenar parıltısı pass'i ekler.
	# Gerçek ışık değildir, sadece bu client'ta render edilir — zemine/duvara etkisi yok,
	# diğer oyuncular (kendi sahnelerini kendileri render ettiği için) bunu hiç görmez.
	if node is GeometryInstance3D:
		var mat := ShaderMaterial.new()
		mat.shader = SELF_RIM_SHADER
		(node as GeometryInstance3D).material_overlay = mat
	for child in node.get_children():
		_apply_self_rim(child)


func _disable_shadow_casting(node: Node) -> void:
	# El feneri kendi gövdesinden/silahtan devasa gölge atmasın
	if node is GeometryInstance3D:
		(node as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for child in node.get_children():
		_disable_shadow_casting(child)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var result := _find_anim_player(child)
		if result:
			return result
	return null


func _play_idle() -> void:
	if _anim_player == null:
		return
	var all_anims := _anim_player.get_animation_list()
	if all_anims.is_empty():
		return
	# Tam isim eşleşmesi
	var candidates := ["Idle", "mixamo_com", "mixamo.com", "Breathing Idle", "idle"]
	var anim_name := ""
	for c in candidates:
		if _anim_player.has_animation(c):
			anim_name = c
			break
	# Library prefix ile arama ("LibName/AnimName" formatı)
	if anim_name.is_empty():
		for c in candidates:
			for a: StringName in all_anims:
				var s := a as String
				if s == c or s.ends_with("/" + c):
					anim_name = s
					break
			if not anim_name.is_empty():
				break
	# Son çare: RESET dışındaki ilk animasyon
	if anim_name.is_empty():
		for a: StringName in all_anims:
			if (a as String) != "RESET":
				anim_name = a
				break
	if anim_name.is_empty():
		return
	var anim: Animation = _anim_player.get_animation(anim_name)
	if anim and anim.loop_mode == Animation.LOOP_NONE:
		anim.loop_mode = Animation.LOOP_LINEAR
	_idle_anim = StringName(anim_name)
	_anim_player.speed_scale = 1.0
	_anim_player.play(anim_name)


## Hareket animasyonu (local + uzak oyuncular): hız konum farkından ölçülür (uzaklarda velocity yok),
## mod (koşu/yürüyüş/eğilme) local'de tuşlardan, uzakta _broadcast_state'ten gelir.
## Hareket: Run / Walk / CrouchWalk — adım hızı gerçek hıza göre, bakışa ters gidişte ters oynar.
## Duruş: Idle; eğilirken CrouchWalk ilk karesinde donar (ayrı çömelme-bekleme animasyonu yok).
func _update_animation(delta: float) -> void:
	if _anim_player == null or delta <= 0.0:
		return
	var p := global_position
	var step := Vector3(p.x - _last_anim_pos.x, 0.0, p.z - _last_anim_pos.z)
	_last_anim_pos = p
	_move_speed = lerpf(_move_speed, step.length() / delta, 1.0 - exp(-12.0 * delta))

	var moving := _move_speed > ANIM_MOVE_THRESHOLD
	_update_leg_facing(step, moving, delta)
	_breath_cd -= delta
	# Çömelmeye geçince nefes (uzaklarda da — mod _broadcast_state ile gelir)
	if move_mode != _breath_mode:
		if move_mode == MoveMode.CROUCH and _breath_mode != -1:
			_play_breath("crouch", -2.0)   # kullanıcının çömelme kaydı (kumaş + nefes)
		_breath_mode = move_mode

	# Takla: klip bir kez, zamanı _flip_t yönetir (uzaklarda da aynı RPC'den başlar)
	if _flip != Flip.NONE:
		var flip_clip: StringName = FLIP_ANIMS[_flip]
		if _anim_player.has_animation(flip_clip):
			if _anim_player.current_animation != flip_clip:
				_play_breath("flip", 0.0, true)   # takla: kullanıcının takla kaydı
				_anim_player.play(flip_clip, 0.1)
			_anim_player.speed_scale = FLIP_ANIM_SPEED
		return

	# Havada: zıplama klibi bir kez baştan (bitince son karede kalır), inişte normal klibe harmanlanır
	if _airborne and _anim_player.has_animation(ANIM_JUMP):
		_was_airborne = true
		if not _air_anim_played:
			_air_anim_played = true
			# Kullanıcının zıplama kaydı (nefes/efor içeriyor — üstüne ayrıca nefes çalınmaz)
			SFX.play_voice(_voice, "jump", JUMP_VOLUME_DB, 0.05)
			_breath_cd = BREATH_MIN_GAP
			if not _vis_hidden:
				_dust_burst(&"jump", Vector3.ZERO, 0.8)   # kalkışta ayaktan küçük toz
			_anim_player.play(ANIM_JUMP, 0.08)
			_anim_player.speed_scale = JUMP_ANIM_SPEED
		return
	_air_anim_played = false
	_update_footsteps(step.length(), moving)

	var clip: StringName = MOVE_ANIMS[move_mode]
	if not _anim_player.has_animation(clip):
		clip = ANIM_RUN
	if moving and _anim_player.has_animation(clip):
		# Bacaklar hareket yönüne döndüğü için animasyon hep ileri oynar
		_set_anim(clip, clampf(_move_speed / float(MOVE_ANIM_REF_SPEED[move_mode]), 0.6, 2.2))
	elif move_mode == MoveMode.CROUCH and _anim_player.has_animation(ANIM_CROUCH_IDLE):
		# Olduğu yerde çömelme: durağan CrouchIdle (SurvivalistModel üretir). speed_scale=0 KULLANMA —
		# AnimationPlayer geçişi (blend) de durur ve karakter Idle'da takılı kalır.
		_set_anim(ANIM_CROUCH_IDLE, 1.0)
	else:
		# "Idle" varsa her zaman onu kullan (kütüphane initialize'dan sonra yüklenmiş olsa bile)
		var idle: StringName = ANIM_IDLE if _anim_player.has_animation(ANIM_IDLE) else _idle_anim
		if idle != &"":
			_set_anim(idle, 1.0)


## Adım/iniş sesleri (her peer, uzak oyuncularda da — karanlıkta düşmanı sesinden duyarsın; çömelme neredeyse sessiz)
func _update_footsteps(step_len: float, moving: bool) -> void:
	if _was_airborne:
		_was_airborne = false
		_step_dist = 0.0
		SFX.play_voice(_voice, "step", STEP_VOLUME_DB[MoveMode.RUN] + 3.0, 0.05)   # iniş: biraz daha tok adım
		if not _vis_hidden:
			_dust_burst(&"land", Vector3.ZERO, 1.0)
		return
	if not moving or step_len > 3.0:   # durdu ya da ışınlandı (respawn)
		_step_dist = STEP_STRIDE[move_mode] * 0.6   # yeniden yürüyünce ilk adım çabuk gelsin
		return
	_step_dist += step_len
	if _step_dist >= STEP_STRIDE[move_mode]:
		_step_dist = 0.0
		var sound := "step_soft" if move_mode == MoveMode.CROUCH else "step"
		SFX.play_voice(_voice, sound, STEP_VOLUME_DB[move_mode], 0.06)


## Hareket efor sesi (çömelme "crouch" / takla "flip" — kullanıcının kayıtları). strong → sınırı beklemez (takla zıplamadan hemen sonra gelebilir)
func _play_breath(sound: String, extra_db: float, strong: bool = false) -> void:
	if is_dead or (_breath_cd > 0.0 and not strong):
		return
	_breath_cd = BREATH_MIN_GAP
	SFX.play_voice(_voice, sound, BREATH_VOLUME_DB + extra_db, 0.05)


## Bacaklar hareket yönüne, üst gövde nişana: Player ROOT (= nişan, fener + silah) fareye bakmaya devam eder;
## sadece CharacterMesh root'a göre `_leg_yaw` kadar döner, omurga (SpineTwistModifier) aynı açıyı geri çevirir
## (en fazla MAX_SPINE_TWIST — fare tam arkadaysa üst gövde bir miktar yana bakar). Dururken bacaklar nişana döner.
func _update_leg_facing(step: Vector3, moving: bool, delta: float) -> void:
	if _char_mesh == null:
		return
	var target := 0.0
	if _flip != Flip.NONE:
		# Takla: gövde dünya yönünde sabit (nişan dönse de), omurga bükülmez
		target = wrapf(_flip_face_yaw - rotation.y, -PI, PI)
		target = _leg_yaw + wrapf(target - _leg_yaw, -PI, PI)
		_leg_yaw = wrapf(lerpf(_leg_yaw, target, 1.0 - exp(-LEG_TURN_SPEED * 2.0 * delta)), -PI, PI)
		_char_mesh.transform.basis = Basis(Vector3.UP, _leg_yaw) * _mesh_base_basis
		if _spine_twist:
			_spine_twist.twist = 0.0
		return
	if moving and step.length() > 0.0001:
		var move_yaw := atan2(-step.x, -step.z)  # rotation.y = θ ⇒ ileri = (-sinθ, 0, -cosθ)
		target = wrapf(move_yaw - rotation.y, -PI, PI)
	# Hedefi mevcut açıya göre aç (±180° civarında sağ/sol arasında zıplamasın)
	target = _leg_yaw + wrapf(target - _leg_yaw, -PI, PI)
	_leg_yaw = wrapf(lerpf(_leg_yaw, target, 1.0 - exp(-LEG_TURN_SPEED * delta)), -PI, PI)
	_char_mesh.transform.basis = Basis(Vector3.UP, _leg_yaw) * _mesh_base_basis
	# Nişan düzeltmesi: tüfek namlusu nişan yönüne bakana kadar omurgayı yumuşakça çevir (HandRifle ölçer).
	# Mixamo nişan pozu tüfeği gövdenin ~60° soluna tutar → düzeltme ~-60°'ye oturur. Şarjör/bomba sırasında dondurulur.
	if _stab_timer > 0.0:
		# Bıçak göğüsten dümdüz ileri saplar → tüfek tutuşu düzeltmesi bırakılır, gövde nişana döner
		_aim_corr = lerpf(_aim_corr, 0.0, 1.0 - exp(-14.0 * delta))
	elif _hand_rifle and _hand_rifle.aim_valid and not (_upper and _upper.is_busy()):
		_aim_corr = clampf(_aim_corr - _hand_rifle.aim_error * minf(AIM_CORR_GAIN * delta, 1.0), -MAX_AIM_CORR, MAX_AIM_CORR)
	if _spine_twist:
		_spine_twist.twist = clampf(-_leg_yaw + _aim_corr, -MAX_SPINE_TWIST - MAX_AIM_CORR, MAX_SPINE_TWIST + MAX_AIM_CORR)


func _reset_leg_facing() -> void:
	_leg_yaw = 0.0
	if _char_mesh:
		_char_mesh.transform.basis = _mesh_base_basis
	if _spine_twist:
		_spine_twist.twist = 0.0


func _set_anim(anim_name: StringName, rate: float) -> void:
	if _anim_player.current_animation != anim_name:
		_anim_player.play(anim_name, ANIM_BLEND)
	_anim_player.speed_scale = rate


func _equip_default_weapon() -> void:
	var weapon_scene := preload("res://scenes/weapons/Weapon.tscn")
	current_weapon = weapon_scene.instantiate()
	weapon_holder.add_child(current_weapon)
	# Mermi eldeki tüfeğin namlusundan çıksın (Weapon/Muzzle gövde ortasında kalıyordu)
	if _hand_rifle and _hand_rifle.rifle:
		current_weapon.visual_muzzle = _hand_rifle.rifle.get_node_or_null("Muzzle")
		current_weapon.visual_scale = CHARACTER_VISUAL_SCALE
	if is_local:
		current_weapon.ammo_changed.connect(
			func(cur: int, tot: int, rel: bool): emit_signal("ammo_changed", cur, tot, rel)
		)
	if _input_driven:
		# Şarjör değişimi başladı → herkese Reload animasyonu (yerel oyuncu ya da host'taki bot yayınlar)
		current_weapon.ammo_changed.connect(func(_c: int, _t: int, rel: bool) -> void:
			if rel:
				_broadcast_action(Action.RELOAD))
	# Atış her peer'da tetiklenir (_spawn_bullet call_local) → ateş pozu
	current_weapon.fired.connect(_on_weapon_fired)
	var cfg: Dictionary = WEAPON_CONFIGS.get(character_type, WEAPON_CONFIGS["Visioner"]).duplicate()
	cfg["damage"] = float(cfg["damage"]) * float(_upgrade_mult["damage"])
	cfg["reload_time"] = float(cfg["reload_time"]) * float(_upgrade_mult["reload"])
	cfg["fire_rate"] = float(cfg["fire_rate"]) * float(_upgrade_mult["fire_rate"])
	current_weapon.configure(cfg)
	_add_render_layer(current_weapon, BODY_LIGHT_LAYER_BIT)
	_disable_shadow_casting(current_weapon)
	# Üst gövde taban pozu: tüfek nişanda
	# (bıçak modunda tüfek pozu yok → tüfeksiz Idle duruşu)
	var base_anim: StringName = ANIM_IDLE if is_knife_mode() else ANIM_AIM
	if _upper and _anim_player and _anim_player.has_animation(base_anim):
		_upper.set_base(_anim_player.get_animation(base_anim))


# ─────────────────────────────────────────────
# Üst gövde aksiyonları + tüfek görseli
# ─────────────────────────────────────────────

func _on_weapon_fired() -> void:
	_break_invisibility()   # ateş (normal veya özel) görünmezliği ANINDA bozar (sadece atan'ın kendi client'ı)
	if current_weapon and current_weapon.get("last_shot_special") == true:
		SFX.play_voice(_voice, SPECIAL_SHOT_SOUND, SHOT_VOLUME_DB + SPECIAL_SHOT_EXTRA_DB, 0.04)
	else:
		SFX.play_voice(_voice, _shot_sound, SHOT_VOLUME_DB, 0.04)
	_shot_fx()
	if _upper == null or _anim_player == null or is_dead:
		return
	var clip := ANIM_FIRE_WALK if _move_speed > ANIM_MOVE_THRESHOLD else ANIM_FIRE_STAND
	if _anim_player.has_animation(clip):
		var hold_time: float = FIRE_HOLD + (current_weapon.fire_rate if current_weapon else 0.0)
		_upper.hold(_anim_player.get_animation(clip), hold_time)


## Namlu alevi + kovan (her peer, görsel). Görünmez oyuncu rakibe alevle ele verilmez (ateş zaten bozar, aynı kare için)
func _shot_fx() -> void:
	if is_dead or _vis_hidden or _hand_rifle == null or current_weapon == null:
		return
	var muzzle: Node3D = current_weapon.visual_muzzle
	if muzzle and is_instance_valid(muzzle):
		MUZZLE_FLASH.flash(muzzle, character_type)
	var rifle: Node = _hand_rifle.get("rifle")
	var eject: Node3D = rifle.get_node_or_null("Eject") if rifle != null and is_instance_valid(rifle) else null
	if eject:
		SHELL_CASING.eject(eject, character_type, SNIPER_EJECT_DELAY if character_type == "Sniper" else 0.0)


## Toz bulutu (her peer, görsel; çağıranlar _vis_hidden'ı zaten kontrol eder)
func _dust_burst(kind: StringName, dir: Vector3, strength: float) -> void:
	if _dust != null and is_instance_valid(_dust):
		_dust.call("burst", kind, dir, strength)


## Yerel oyuncunun kamerası (CameraController: punch/dip/add_trauma)
func _local_cam_call(method: StringName, a: Variant, b: Variant = null) -> void:
	if not is_local:
		return
	var cam := get_viewport().get_camera_3d()
	if cam and cam.has_method(method):
		if b == null:
			cam.call(method, a)
		else:
			cam.call(method, a, b)


## Local oyuncu: aksiyonu herkese oynat (bağlı peer yoksa sadece kendine)
func _broadcast_action(action: int) -> void:
	if multiplayer.has_multiplayer_peer() and multiplayer.get_peers().size() > 0:
		_action_rpc.rpc(action)
	else:
		_action_rpc(action)


@rpc("any_peer", "call_local", "reliable")
func _action_rpc(action: int) -> void:
	var s := multiplayer.get_remote_sender_id()
	if s != 0 and (s != 1 if is_bot else s != peer_id):
		return
	play_action(action)


## Üst gövde aksiyonu (sadece görsel). Bomba fırlatmayı PowerupManager._bomb_rpc her peer'da çağırır.
func play_action(action: int) -> void:
	if _upper == null or _anim_player == null or is_dead:
		return
	match action:
		Action.RELOAD:
			_play_reload_sounds()
			if _anim_player.has_animation(ANIM_RELOAD):
				_upper.play_once(_anim_player.get_animation(ANIM_RELOAD), current_weapon.reload_time if current_weapon else -1.0)
		Action.TOSS:
			if _anim_player.has_animation(ANIM_TOSS):
				_upper.play_once(_anim_player.get_animation(ANIM_TOSS), TOSS_DURATION)
		Action.HIT:
			# Şarjör/bomba atma/bıçaklama sürerken sarsılma onları bölmesin
			if _anim_player.has_animation(ANIM_HIT) and not _upper.is_busy():
				_upper.play_once(_anim_player.get_animation(ANIM_HIT), -1.0, 0.65)
		Action.STAB:
			SFX.play_voice(_voice, "stab", -4.0, 0.1)
			_stab_timer = STAB_DURATION
			var fwd := -global_transform.basis.z
			fwd = Vector3(fwd.x, 0.0, fwd.z).normalized()
			if not _vis_hidden:
				SLASH_FX.spawn(get_tree(), global_position, fwd)
			if not is_trapped:   # hamle: hafif ayak sürtünme tozu + kısa hışırtı
				if not _vis_hidden:
					_dust_burst(&"lunge", fwd, 1.0)
				SFX.play_voice(_voice, "lunge_whoosh", -8.0, 0.08)
				_local_cam_call(&"punch", fwd, CAM_LUNGE_PUNCH)
			if _anim_player.has_animation(ANIM_STAB):
				_upper.play_once(_anim_player.get_animation(ANIM_STAB), STAB_DURATION)
			if _hand_rifle:
				_hand_rifle.show_knife(STAB_DURATION)


# ─────────────────────────────────────────────
# Fizik Döngüsü
# ─────────────────────────────────────────────

func _kill_reload_sfx() -> void:
	if _reload_sfx_tween != null and _reload_sfx_tween.is_valid():
		_reload_sfx_tween.kill()
	_reload_sfx_tween = null


## Şarjör: çıkar (hemen) → tak (%55) → kurma kolu (%85) — süre karakterin (yükseltilmiş) şarjör süresine göre
func _play_reload_sounds() -> void:
	_kill_reload_sfx()
	var t: float = current_weapon.reload_time if current_weapon else 1.8
	SFX.play_voice(_voice, "mag_out", -6.0)
	# Tween düğüme bağlı → oyuncu silinirse kendiliğinden iptal
	var tw := create_tween()
	_reload_sfx_tween = tw
	tw.tween_interval(t * 0.55)
	tw.tween_callback(func() -> void:
		if not is_dead:
			SFX.play_voice(_voice, "mag_in", -6.0))
	tw.tween_interval(t * 0.3)
	tw.tween_callback(func() -> void:
		if not is_dead:
			SFX.play_voice(_voice, "bolt", -6.0))


## Hasar/iyileşme parıltısını başlat (sadece görsel). strength 0..1
func flash_fx(color: Color, strength: float) -> void:
	if _fx_light == null or _vis_hidden:   # rakipten gizli görünmez oyuncu hasar parıltısıyla da ele verilmez
		return
	_fx_level = maxf(_fx_level, clampf(strength, 0.0, 1.0))
	_fx_light.light_color = color
	_fx_light.visible = true


func _process(delta: float) -> void:
	if is_local and not _lod_remotes.is_empty():
		_update_light_lod(get_viewport())
	if _special_laser != null:
		_aim_special_laser()   # animasyon namluyu oynattıkça lazer nişangaha kilitli kalsın
	if _spawn_invuln_left > 0.0:
		_spawn_invuln_left = maxf(_spawn_invuln_left - delta, 0.0)
	_update_spawn_blink()
	if is_invisible:
		var invis_rate := 2.0 if GameManager.is_in_door_unlock_zone(peer_id) else 1.0
		_invis_left -= delta * invis_rate
		if _invis_left <= 0.0:
			set_invisible(false, 0.0)
		else:
			_update_shimmer_intensity()
	elif _shimmer_fade_t > 0.0:
		_shimmer_fade_t = maxf(_shimmer_fade_t - delta, 0.0)
		_set_shimmer_intensity(_shimmer_fade_from * _shimmer_fade_t / SHIMMER_FADE_TIME)
		if _shimmer_fade_t <= 0.0:
			_restore_overlays()
	if _fx_light == null:
		return
	if _spawn_invuln_left > 0.0 and not is_dead and not _vis_hidden and _fx_level <= 0.0:
		# Doğma koruması aktifken karakter üzerinde hafif nabızlı mavi-beyaz kalkan parıltısı (sadece gövde katmanı)
		var pulse := 0.35 + 0.25 * sin(Time.get_ticks_msec() * 0.014)
		_fx_light.light_color = FX_SPAWN_SHIELD_COLOR
		_fx_light.light_energy = FX_ENERGY * 0.42 * pulse
		_fx_light.visible = true
		return
	if _fx_level <= 0.0:
		_fx_light.visible = false
		return
	_fx_level = maxf(_fx_level - delta * FX_DECAY, 0.0)
	_fx_light.light_energy = FX_ENERGY * _fx_level * _fx_level
	_fx_light.visible = _fx_level > 0.0 and not _vis_hidden


func _physics_process(delta: float) -> void:
	if is_dead:
		return
	_update_flip_timer(delta)
	_stab_timer = maxf(_stab_timer - delta, 0.0)
	if _input_driven:
		if is_local:
			_update_flashlight(delta)
		if is_local or _bot_driven:
			_handle_stab_input(delta)  # tuzaktayken de (_handle_local_input erken döner); bot: istek set_bot_input'tan
		_handle_local_input(delta)    # bot: girdi set_bot_input'tan
	else:
		_interpolate_remote(delta)
	_update_animation(delta)


func set_trapped(v: bool) -> void:
	is_trapped = v


# ─────────────────────────────────────────────
# Görünmezlik (PowerupManager._invis_rpc her peer'da set_invisible çağırır)
# ─────────────────────────────────────────────

## Yerel oyuncunun gözünden bu oyuncu gizli mi? Görünmez VE yerel oyuncu kendisi değil VE farklı takım.
## Minimap/lazer/gövde bunu kullanır. Kendisi ve takım arkadaşı için false (onlar shimmer görür).
func is_hidden_from_local() -> bool:
	if not is_invisible or is_local:
		return false
	if GameManager.is_deathmatch():
		return true
	var local_team: int = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", -1)
	return local_team < 0 or local_team != team_id


## Her peer'da çağrılır; süre bitince KENDİ yerel zamanlayıcısıyla kapanır (_process). active=false → bozma/erken bitirme.
func set_invisible(active: bool, duration: float) -> void:
	if active:
		if is_dead or duration <= 0.0:
			return
		if is_invisible:
			_end_invisibility(false)   # tekrar alınırsa temiz başla (görsel/overlay yedekleri bozulmasın)
		is_invisible = true
		_invis_left = duration
		_apply_invis_visuals()
		invisibility_changed.emit(true, duration)
	else:
		_end_invisibility(true)


## report_remaining: false → kalan süre raporlanmaz (ölüm/respawn temizliği: HUD "bozuldu" göstermesin)
func _end_invisibility(report_remaining: bool) -> void:
	if not is_invisible:
		return
	var remaining := maxf(_invis_left, 0.0)
	is_invisible = false
	_invis_left = 0.0
	var was_hidden := _vis_hidden
	_vis_hidden = false
	if was_hidden:
		# Rakip gözüyle gizlenenleri geri aç (ölüyse ölüm akışı kendi görünürlüğünü yönetir)
		if _char_mesh:
			_char_mesh.visible = true
		_update_flashlight_visible()
		name_label.visible = _is_local_ally() and not is_dead
		# Rakip de "mordan kendi rengine" geçişi görsün (kullanıcı isteği): gövde tam shimmer'la belirir,
		# sonra kendisi/takımın gördüğü aynı sönme ile normale döner. Ölümde (report_remaining=false) geçiş yok.
		if report_remaining and not is_dead:
			_apply_shimmer()
			if _shimmer_mat != null:
				_shimmer_fade_from = SHIMMER_INTENSITY_TEAM + SHIMMER_ENDING_BOOST
				_set_shimmer_intensity(_shimmer_fade_from)
				_shimmer_fade_t = SHIMMER_FADE_TIME
	elif not _overlay_backup.is_empty():
		if _shimmer_mat != null and not is_dead:
			_shimmer_fade_from = _shimmer_intensity
			_shimmer_fade_t = SHIMMER_FADE_TIME
		else:
			_restore_overlays()
	_update_laser()
	invisibility_changed.emit(false, remaining if report_remaining else 0.0)


func _apply_invis_visuals() -> void:
	_shimmer_fade_t = 0.0
	if is_hidden_from_local():
		_vis_hidden = true
		if _char_mesh:
			_char_mesh.visible = false   # tüfek + bıçak + lazer Skeleton3D çocuğu → birlikte gizlenir
		_update_flashlight_visible()
		name_label.visible = false
		card_indicator.visible = false
		if _overhead_cards:
			_overhead_cards.visible = false
		ammo_label.visible = false
		if _fx_light:
			_fx_light.visible = false
	else:
		_vis_hidden = false
		_apply_shimmer()
	_update_laser()


## Kendisi/takım: gövde + tüfek aynı shimmer overlay (mevcut material_overlay — SelfVisibility — yedeklenir)
func _apply_shimmer() -> void:
	var shader := _get_shimmer_shader()
	if shader == null or _char_mesh == null:
		return
	if _shimmer_mat == null:
		_shimmer_mat = ShaderMaterial.new()
		_shimmer_mat.shader = shader
		_shimmer_mat.set_shader_parameter("shimmer_color", SHIMMER_COLOR)
	if _overlay_backup.is_empty():
		_collect_overlays(_char_mesh)
	_update_shimmer_intensity()


func _collect_overlays(node: Node) -> void:
	if node == _special_laser:
		return
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		_overlay_backup[mi] = mi.material_overlay
		mi.material_overlay = _shimmer_mat
	for child in node.get_children():
		_collect_overlays(child)


func _restore_overlays() -> void:
	_shimmer_fade_t = 0.0
	for key: Variant in _overlay_backup:
		if is_instance_valid(key):
			(key as MeshInstance3D).material_overlay = _overlay_backup[key] as Material
	_overlay_backup.clear()


func _update_shimmer_intensity() -> void:
	var value := SHIMMER_INTENSITY_SELF if is_local else SHIMMER_INTENSITY_TEAM
	if _invis_left < SHIMMER_ENDING_TIME:
		value += SHIMMER_ENDING_BOOST * (1.0 - _invis_left / SHIMMER_ENDING_TIME)
	_set_shimmer_intensity(value)


func _set_shimmer_intensity(value: float) -> void:
	_shimmer_intensity = value
	if _shimmer_mat != null:
		_shimmer_mat.set_shader_parameter("intensity", value)


func _get_shimmer_shader() -> Shader:
	if not _shimmer_shader_checked:
		_shimmer_shader_checked = true
		if ResourceLoader.exists(SHIMMER_SHADER_PATH):
			_shimmer_shader = load(SHIMMER_SHADER_PATH) as Shader
	return _shimmer_shader


## Yerel görünmez oyuncu ateş etti / bıçakladı → herkese "görünürlük bozuldu" (sadece kendi oyuncusu için)
func _break_invisibility() -> void:
	if not is_invisible or not is_local:
		return
	if multiplayer.has_multiplayer_peer() and multiplayer.get_peers().size() > 0:
		_invis_break_rpc.rpc()
	else:
		_invis_break_rpc()


@rpc("any_peer", "call_local", "reliable")
func _invis_break_rpc() -> void:
	var sender := multiplayer.get_remote_sender_id()
	if sender == 0:
		if not is_local:   # call_local yerel çağrı: sadece sahibi kendi node'unda çağırabilir
			return
	elif sender != peer_id:
		return
	set_invisible(false, 0.0)


# ─────────────────────────────────────────────
# Özel silah (tek atış) — hazırlama PowerupManager._special_gun_rpc ile, atış yerelde
# ─────────────────────────────────────────────

## Her peer'da çağrılır. Hazırken tüfeğin namlusunda lazer (SpecialGunFx), değilken kaldırılır.
func set_special_armed(armed: bool) -> void:
	if armed and is_dead:
		armed = false
	if special_armed == armed:
		return
	special_armed = armed
	_update_laser()
	special_armed_changed.emit(armed)


## Lazer SADECE yerel oyuncuda (kullanıcı: nişanı oyuncu dışında kimse görmesin) ve her kare namludan
## nişangah noktasına (_get_aim_target) çizilir → ucu tam nişangahın üstünde (_aim_special_laser).
func _update_laser() -> void:
	if not special_armed or not is_local:
		if _special_laser != null and is_instance_valid(_special_laser):
			_special_laser.queue_free()
		_special_laser = null
		return
	if _special_laser == null or not is_instance_valid(_special_laser):
		_special_laser = null
		var fx := _get_special_fx()
		var muzzle_node: Node = null
		if _hand_rifle and _hand_rifle.rifle:
			muzzle_node = _hand_rifle.rifle.get_node_or_null("Muzzle")
		if fx != null and muzzle_node != null:
			_special_laser = fx.call(&"build_laser") as Node3D
			if _special_laser != null:
				_special_laser.name = "SpecialLaser"
				muzzle_node.add_child(_special_laser)
				_aim_special_laser()


var _special_laser_tip: Node3D = null


## Yerel: lazeri namludan nişan noktasına yönelt + boyunu mesafeye uydur (uçtaki nokta = nişangah).
## SpecialGunFx lazeri -Z'ye LASER_LENGTH boyunda; kök Z ölçeğiyle kısaltılır, uç küresi ters ölçekle yuvarlak kalır.
func _aim_special_laser() -> void:
	if _special_laser == null or not is_instance_valid(_special_laser) or not _special_laser.is_inside_tree():
		_special_laser_tip = null
		return
	var from := (_special_laser.get_parent() as Node3D).global_position
	var to := _get_aim_target()
	var dist := from.distance_to(to)
	if dist < 0.3:
		return
	var look := Basis.looking_at((to - from) / dist, Vector3.UP)
	_special_laser.global_transform = Transform3D(look.scaled_local(Vector3(1.0, 1.0, dist / SPECIAL_LASER_LENGTH)), from)
	if _special_laser_tip == null or not is_instance_valid(_special_laser_tip):
		_special_laser_tip = _special_laser.get_node_or_null("Tip") as Node3D
	if _special_laser_tip:
		_special_laser_tip.scale = Vector3(1.0, 1.0, SPECIAL_LASER_LENGTH / dist)


func _get_special_fx() -> GDScript:
	if not _special_fx_checked:
		_special_fx_checked = true
		if ResourceLoader.exists(SPECIAL_FX_PATH):
			_special_fx = load(SPECIAL_FX_PATH) as GDScript
	return _special_fx


## Sol tık basışı: tek özel mermi → yerelde hemen "hazır değil" → PowerupManager slotu boşaltsın
func _fire_special() -> void:
	current_weapon.aim_point = _get_shot_aim_point()
	current_weapon.fire_special(peer_id, team_id, _get_aim_target())   # mermi lazerle aynı çizgide: nişangaha
	set_special_armed(false)
	var scene := get_tree().current_scene
	var pm: Node = scene.get_node_or_null("PowerupManager") if scene else null
	if pm != null and pm.has_method("local_special_fired"):
		pm.call("local_special_fired")


## Ölüm/respawn: görünmezlik ve hazır özel silah sıfırlanır (HUD "bozuldu" göstermesin diye süre raporlanmaz)
func _clear_power_states() -> void:
	_end_invisibility(false)
	_restore_overlays()
	set_special_armed(false)
	_shoot_blocked = false


func _handle_local_input(delta: float) -> void:
	if is_trapped:
		return
	if _card_pickup_blocked > 0.0:
		_card_pickup_blocked -= delta

	# Sohbete yazılırken hareket/ateş/şarjör tuşları devre dışı (nişan + senkron devam eder) — bot sohbet etmez
	var typing := ChatBox.is_typing if is_local else false

	# WASD hareketi (X/Z düzlemi) — önce yatay hız, sonra yerçekimi. Bot: BotBrain'in yönü
	var dir := Vector3.ZERO
	if _bot_driven:
		dir = _bot_move
	elif not typing:
		if Input.is_action_pressed("move_up"):    dir.z -= 1
		if Input.is_action_pressed("move_down"):  dir.z += 1
		if Input.is_action_pressed("move_left"):  dir.x -= 1
		if Input.is_action_pressed("move_right"): dir.x += 1
	dir = dir.normalized()

	# Hareket modu: varsayılan yürüyüş; Ctrl = çömelme, Shift = koşu (ikisi de süreli + yenilenir)
	# Bot: Space = BotBrain'in zıplama isteği (takla YOK — aşağıda bot için kapalı)
	var space_down := _bot_jump if _bot_driven else (not typing and Input.is_physical_key_pressed(KEY_SPACE))
	var space_pressed := space_down and not _space_was_down
	_space_was_down = space_down
	_flip_cooldown = maxf(_flip_cooldown - delta, 0.0)
	if _flip != Flip.NONE:
		move_mode = MoveMode.WALK  # takla havada — çömelme bağışıklığı yok
		var flip_speed := _flip_speed()
		velocity.x = _flip_dir.x * flip_speed
		velocity.z = _flip_dir.z * flip_speed
	else:
		_update_move_mode(dir, typing, delta)
		var move_speed: float = speed * MOVE_SPEED_MULT[move_mode]
		velocity.x = dir.x * move_speed
		velocity.z = dir.z * move_speed
		# Bıçak hamlesi: nişan yönüne kısa itiş (yürüyüşe eklenir)
		if _stab_lunge > 0.0:
			_stab_lunge -= delta
			var lunge := -global_transform.basis.z
			lunge = Vector3(lunge.x, 0.0, lunge.z).normalized() * (STAB_LUNGE_DIST / STAB_LUNGE_TIME)
			velocity.x += lunge.x
			velocity.z += lunge.z
		# Takla: çömelirken (Ctrl) hareket halinde Space'e bas
		if space_pressed and not _bot_driven and move_mode == MoveMode.CROUCH and dir != Vector3.ZERO and is_on_floor() and _stab_timer <= 0.0 \
				and _flip_cooldown <= 0.0 and not crouch_locked and crouch_stamina >= FLIP_STAMINA:
			_start_local_flip(dir)

	# Yerçekimi + zıplama
	_jump_cooldown = maxf(_jump_cooldown - delta, 0.0)
	if is_on_floor():
		if _airborne and velocity.y <= 0.0:
			_airborne = false
			_jump_cooldown = JUMP_COOLDOWN
		velocity.y = 0.0
		if space_down and _jump_cooldown <= 0.0 and _flip == Flip.NONE and _flip_cooldown <= 0.0 \
				and move_mode != MoveMode.CROUCH and not sprint_locked and sprint_stamina >= JUMP_STAMINA:
			velocity.y = JUMP_VELOCITY
			_airborne = true
			sprint_stamina -= JUMP_STAMINA
			_sprint_delay = STAMINA_REGEN_DELAY
	else:
		velocity.y -= AIR_GRAVITY * delta
		if is_on_ceiling() and velocity.y > 0.0:
			velocity.y = 0.0

	_try_step_up(Vector3(velocity.x, 0.0, velocity.z))
	move_and_slide()

	# Mouse hedefine bak — gövde, silah ve el feneri birlikte döner (asker gibi hedefe yönelme)
	var aim := _get_aim_target()
	var flat_aim := Vector3(aim.x, global_position.y, aim.z)
	if flat_aim.distance_to(global_position) > 0.1:
		look_at(flat_aim, Vector3.UP)

	# Ateş et (semi-auto: sadece tıklama anında; otomatik: basılı tutunca)
	# Bot: tetik durumu set_bot_input'tan, "tıklama anı" _bot_trigger_pressed kenar algılamasından
	var shoot_held: bool
	var shoot_just: bool
	if _bot_driven:
		shoot_held = _bot_fire
		shoot_just = _bot_trigger_pressed(delta)
		_bot_fire_prev = _bot_fire
	else:
		shoot_held = Input.is_action_pressed("shoot")
		shoot_just = Input.is_action_just_pressed("shoot")
	var shoot_pressed: bool
	if current_weapon and current_weapon.is_semi_auto:
		shoot_pressed = shoot_just
	else:
		shoot_pressed = shoot_held
	if _shoot_blocked and not shoot_held:
		_shoot_blocked = false
	if is_knife_mode():
		pass   # sadece bıçak: tüfek ateşi yok (sol tık _handle_stab_input'ta)
	elif special_armed:
		# Özel silah hazır: sol tık BASIŞI = TEK atış (şarjör/ateş hızından bağımsız); normal tüfek susar
		if shoot_just and current_weapon and not typing and _flip == Flip.NONE and _stab_timer <= 0.0:
			_fire_special()
			_shoot_blocked = true   # tuş basılı kalırsa tam otomatik tüfek hemen ateşlemesin
	elif shoot_pressed and not _shoot_blocked and current_weapon and not typing and _flip == Flip.NONE and _stab_timer <= 0.0:
		current_weapon.aim_point = _get_shot_aim_point()
		current_weapon.try_shoot(peer_id, team_id)

	var reload_pressed: bool
	if _bot_driven:
		reload_pressed = _bot_reload_req
		_bot_reload_req = false
	else:
		reload_pressed = Input.is_action_just_pressed("reload")
	if reload_pressed and current_weapon and not typing and not is_knife_mode():
		current_weapon.reload()

	# Pozisyon senkronizasyonu
	_sync_timer += delta
	if _sync_timer >= SYNC_RATE:
		_sync_timer = 0.0
		# Maç bitince (ENDED) yayın durur: lobiye dönüşte karşı tarafta Player node'u silinmişken gelen paketler
		# "Node not found: ImportedMap/Player_…" / "Invalid packet received" hatası basıyordu (zararsız ama gürültü)
		if multiplayer.has_multiplayer_peer() and multiplayer.get_peers().size() > 0 \
				and GameManager.state == GameManager.State.IN_GAME:
			var mode_flags: int = move_mode | (AIR_FLAG if _airborne else 0) | (FLASHLIGHT_OFF_FLAG if flashlight_off else 0)
			_broadcast_state.rpc(global_position, rotation.y, mode_flags)


# ─────────────────────────────────────────────
# Bot girdisi (BotBrain her kare çağırır — sadece host'taki bot node'unda etkili)
# ─────────────────────────────────────────────

## move_dir: dünya XZ (sıfır ya da normalize), aim_pos: dünya nişan noktası, fire: tetik BASILI,
## reload: tek kare istek (bir sonraki fizik karesinde tüketilir), run: koşu (dayanıklılık kurallarına tabi)
## crouch: Ctrl basılı (süreli — tükenince kilitlenir), jump: Space basılı, stab: bıçak isteği (tek seferlik; bekleme Player'da)
func set_bot_input(move_dir: Vector3, aim_pos: Vector3, fire: bool, reload: bool, run: bool,
		crouch: bool = false, jump: bool = false, stab: bool = false) -> void:
	if not _bot_driven:
		return
	_bot_crouch = crouch
	_bot_jump = jump
	if stab:
		_bot_stab_req = true
	var flat := Vector3(move_dir.x, 0.0, move_dir.z)
	_bot_move = flat.normalized() if flat.length_squared() > 0.0001 else Vector3.ZERO
	_bot_aim = aim_pos
	_bot_has_aim = true
	_bot_fire = fire
	if reload:
		_bot_reload_req = true
	_bot_run = run


## Bot tetiği için "tıklama anı": basılmaya başladığı kare. Basılı tutulmaya devam ederse silah hazır olunca
## BOT_SEMI_REPRESS sonra yeniden tıklar (insan gibi) — tek atışlık silah (Sniper/Medic) tetiği bırakılmasa da susmaz,
## seri ateş ise silahın fire_rate'iyle zaten sınırlı.
func _bot_trigger_pressed(delta: float) -> bool:
	if not _bot_fire:
		_bot_repress_t = 0.0
		return false
	if not _bot_fire_prev:
		_bot_repress_t = 0.0
		return true
	if current_weapon == null or current_weapon.is_reloading or not current_weapon.fire_timer.is_stopped():
		_bot_repress_t = 0.0
		return false
	_bot_repress_t += delta
	if _bot_repress_t >= BOT_SEMI_REPRESS:
		_bot_repress_t = 0.0
		return true
	return false


func _reset_bot_input() -> void:
	_bot_move = Vector3.ZERO
	_bot_fire = false
	_bot_fire_prev = false
	_bot_reload_req = false
	_bot_run = false
	_bot_crouch = false
	_bot_jump = false
	_bot_stab_req = false
	_bot_repress_t = 0.0


## Çarpışma şekli: tscn'deki kutu (0.8×1.8×0.8) keskin alt kenarıyla 10 cm'lik zemin farkına bile takılıyordu
## (içe aktarılan haritalar: yükseltilmiş zeminler 0.10-0.15 m, bordür/köprü 0.30-0.35 m). Kapsülün yuvarlak altı
## küçük farkların üstünden kayar; büyükleri _try_step_up çıkar. Editör açık olduğu için tscn değil kod.
const BODY_RADIUS := 0.35
const BODY_HEIGHT := 1.8
const STEP_HEIGHT := 0.42          # bu yüksekliğe kadar kenara otomatik basar (kütük 0.75 m, sandık vb. engel kalır)
const STEP_PROBE := 0.3            # önde bu mesafede engel var mı (m)
const VOID_WALL_LAYER := 16        # ImportedMap._build_void_walls (layer 5)

func _use_capsule_shape() -> void:
	if collision_shape.shape is CapsuleShape3D:
		return
	var cap := CapsuleShape3D.new()
	cap.radius = BODY_RADIUS
	cap.height = BODY_HEIGHT
	collision_shape.shape = cap
	collision_shape.position = Vector3(0, BODY_HEIGHT * 0.5, 0)


var _step_col: KinematicCollision3D = KinematicCollision3D.new()


## Basamak çıkma: önde alçak bir kenar varsa (alt seviyede tıkalı, STEP_HEIGHT yukarıda boş) gövdeyi kenarın
## üstüne kaldırır; ardından move_and_slide ileri taşır. Duvar (yukarıda da tıkalı) ve tavan kontrolü var.
func _try_step_up(horizontal_velocity: Vector3) -> void:
	# Zıplarken de çalışır (kenara tutunma): tepeye tam yetişmeyen zıplama, kenar STEP_HEIGHT içindeyse üstüne çıkar
	if horizontal_velocity.length_squared() < 0.01 or not (is_on_floor() or _airborne):
		return
	var probe := horizontal_velocity.normalized() * STEP_PROBE
	var t := global_transform
	if not test_move(t, probe):
		return                                   # önü boş
	# Yüksek kenarlar (Metro ray çukuru 0.85 m, Liman rıhtımı 0.94 m...) otomatik çıkılmaz → zıplamak gerekir (kullanıcı isteği)
	var step := STEP_HEIGHT
	var up := Vector3(0, step, 0)
	if test_move(t, up):
		return                                   # tavan
	var t_up := t.translated(up)
	if test_move(t_up, probe):
		return                                   # yukarıda da tıkalı → gerçek duvar
	# Kenarın tam yüksekliği: yukarı + ileri konumdan aşağı in, nereye oturuyorsa o kadar kaldır
	var t_fwd := t_up.translated(probe)
	if not test_move(t_fwd, -up, _step_col):
		return                                   # önde zemin yok (çukur) — basamak değil
	var rise := step - _step_col.get_travel().length()
	if rise <= 0.02:
		return
	global_position.y += rise + 0.01


## Bıçaklama girişi (sadece local): basış anında animasyonu herkese yayınlar, STAB_HIT_TIME sonra hedefi arar
func _handle_stab_input(delta: float) -> void:
	_stab_cooldown = maxf(_stab_cooldown - delta, 0.0)
	var pressed := false
	var knife_mode := is_knife_mode()
	if _bot_driven:
		# Bot: BotBrain'in isteği (her girişte tüketilir; bekleme aşağıda insanla aynı)
		pressed = _bot_stab_req
		_bot_stab_req = false
	else:
		var typing := ChatBox.is_typing
		var down := not typing and (Input.is_physical_key_pressed(STAB_KEY) or Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT))
		pressed = down and not _stab_was_down
		_stab_was_down = down
		if knife_mode and not typing and Input.is_action_pressed("shoot"):
			pressed = true   # bıçak modu: sol tık (basılı tutunca bekleme bitince tekrar)
	if pressed and _stab_cooldown <= 0.0 and _flip == Flip.NONE:
		_stab_cooldown = KNIFE_STAB_COOLDOWN if knife_mode else STAB_COOLDOWN
		_stab_pending = STAB_HIT_TIME
		_stab_lunge = STAB_LUNGE_TIME if not is_trapped else 0.0
		_break_invisibility()   # bıçaklama görünmezliği ANINDA bozar
		_broadcast_action(Action.STAB)
	if _stab_pending >= 0.0:
		_stab_pending -= delta
		if _stab_pending < 0.0:
			var target := _find_stab_target()
			if target != null:
				if NetworkManager.is_host():
					_request_stab(target.peer_id)
				else:
					_request_stab.rpc_id(1, target.peer_id)


## Önündeki koni (nişan yönü ±60°) içinde, STAB_RANGE'de, arada duvar olmayan en yakın canlı düşman
func _find_stab_target() -> Node:
	var fwd := -global_transform.basis.z
	var fwd2 := Vector2(fwd.x, fwd.z).normalized()
	var best: Node = null
	var best_d := INF
	for pid: int in GameManager.active_players:
		var other: Variant = GameManager.active_players[pid]
		if pid == peer_id or other == null or not is_instance_valid(other) or other.is_dead or GameManager.are_allies(peer_id, pid):
			continue
		var to: Vector3 = (other as Node3D).global_position - global_position
		var d := Vector2(to.x, to.z).length()
		if d > STAB_RANGE or d >= best_d:
			continue
		if d > 0.3 and fwd2.dot(Vector2(to.x, to.z) / d) < STAB_CONE_COS:
			continue
		if _wall_between(other as Node3D):
			continue
		best = other
		best_d = d
	return best


func _wall_between(other: Node3D) -> bool:
	var from := global_position + Vector3(0, 1.1, 0)
	var q := PhysicsRayQueryParameters3D.create(from, other.global_position + Vector3(0, 1.1, 0), 1)
	q.exclude = [get_rid(), (other as CollisionObject3D).get_rid()]
	return not get_world_3d().direct_space_state.intersect_ray(q).is_empty()


var _host_last_stab_ms: int = 0


## Host: bıçaklayanın (bu node) isteğini doğrular → tek vuruş. Gönderen bu oyuncunun sahibi olmalı.
@rpc("any_peer", "reliable")
func _request_stab(target_peer: int) -> void:
	if not NetworkManager.is_host():
		return
	var sender := multiplayer.get_remote_sender_id()
	if sender == 0:
		sender = 1
	# Bot: gönderen sahibi değil HOST olmalı (bot id'sinden RPC gelmez; yerel doğrudan çağrı → sender 1)
	if (sender != 1 if is_bot else sender != peer_id) or is_dead:
		return
	# Sunucu tarafı bıçak bekleme süresi doğrulaması (ağ jitter'ı için 80 ms tolerans)
	var now_ms := Time.get_ticks_msec()
	var cd_ms := int(((KNIFE_STAB_COOLDOWN if is_knife_mode() else STAB_COOLDOWN) * 1000.0)) - 80
	if _host_last_stab_ms > 0 and now_ms - _host_last_stab_ms < cd_ms:
		return
	var target: Variant = GameManager.active_players.get(target_peer)
	if target == null or not is_instance_valid(target) or target.is_dead or GameManager.are_allies(peer_id, target_peer):
		return
	var to: Vector3 = (target as Node3D).global_position - global_position
	if Vector2(to.x, to.z).length() > STAB_RANGE + STAB_RANGE_TOLERANCE or _wall_between(target as Node3D):
		return
	_host_last_stab_ms = now_ms
	# Arkadan mı: hedefin nişan yönü (root -Z) ile hedeften saldırana vektör zıt yöndeyse
	var target_fwd := -(target as Node3D).global_transform.basis.z
	var to_attacker := Vector2(-to.x, -to.z).normalized()
	if Vector2(target_fwd.x, target_fwd.z).normalized().dot(to_attacker) < BACKSTAB_COS:
		target.take_damage(STAB_DAMAGE, peer_id, DAMAGE_BACKSTAB)
	else:
		target.take_damage(STAB_FRONT_DAMAGE, peer_id, DAMAGE_MELEE)


## Nişana göre ileri gidiyorsa FrontFlip (gövde ilerleme yönüne), geri gidiyorsa BackFlip (gövde ilerlemenin tersine,
## yani nişana yakın bakar ve geriye doğru döner).
func _start_local_flip(dir: Vector3) -> void:
	var aim_fwd := -global_transform.basis.z
	var kind: int = Flip.FRONT if dir.dot(Vector3(aim_fwd.x, 0.0, aim_fwd.z)) >= 0.0 else Flip.BACK
	var move_yaw := atan2(-dir.x, -dir.z)
	_flip_dir = dir
	crouch_stamina -= FLIP_STAMINA
	_crouch_delay = STAMINA_REGEN_DELAY
	var face_yaw := move_yaw if kind == Flip.FRONT else wrapf(move_yaw + PI, -PI, PI)
	if multiplayer.has_multiplayer_peer() and multiplayer.get_peers().size() > 0:
		_flip_rpc.rpc(kind, face_yaw)
	else:
		_flip_rpc(kind, face_yaw)


@rpc("any_peer", "call_local", "reliable")
func _flip_rpc(kind: int, face_yaw: float) -> void:
	var s := multiplayer.get_remote_sender_id()
	if s != 0 and (s != 1 if is_bot else s != peer_id):
		return
	if is_dead or kind < 0 or kind >= FLIP_ANIMS.size():
		return
	_flip = kind
	_flip_t = 0.0
	_flip_face_yaw = face_yaw
	# İlerleme yönü: FrontFlip yüzün yönüne, BackFlip tersine
	_flip_move_dir = Vector3(-sin(face_yaw), 0.0, -cos(face_yaw)) * (1.0 if kind == Flip.FRONT else -1.0)
	if not _vis_hidden:
		_dust_burst(&"flip_start", _flip_move_dir, 0.9)
	if _upper:
		_upper.set_enabled_smooth(false)  # tam gövde takla


## Her peer'da (local + uzak): klip zamanını ilerletir, bitince kontrolü ve üst gövde katmanını geri verir
func _update_flip_timer(delta: float) -> void:
	if _flip == Flip.NONE:
		return
	_flip_t += delta * FLIP_ANIM_SPEED
	if _flip_t >= FLIP_END[_flip]:
		_end_flip()


func _end_flip() -> void:
	if _flip == Flip.NONE:
		return
	_flip = Flip.NONE
	_flip_cooldown = FLIP_COOLDOWN
	if not is_dead:   # takla bitişi: ayak tozu (kamera sarsıntısı kapalı)
		if not _vis_hidden:
			_dust_burst(&"flip_end", _flip_move_dir, 1.0)
	if _upper and not is_dead:
		_upper.set_enabled_smooth(true)


## İlerleme penceresinde sabit hız (FLIP_DISTANCE'ı pencere süresine yayar), dışında yerinde
func _flip_speed() -> float:
	var win: Vector2 = FLIP_MOVE[_flip]
	if _flip_t < win.x or _flip_t > win.y:
		return 0.0
	return FLIP_DISTANCE[_flip] / ((win.y - win.x) / FLIP_ANIM_SPEED)


## Çömelme (Ctrl basılı, en fazla CROUCH_MAX_TIME) önceliklidir; sonra koşu (Shift + hareket, SPRINT_MAX_TIME).
## Tükenen dayanıklılık kilitlenir, *_UNLOCK seviyesine dolana kadar o mod kullanılamaz. Bırakınca
## STAMINA_REGEN_DELAY sonra dolar. Çömelmesi biten oyuncu otomatik kalkar.
func _update_move_mode(dir: Vector3, typing: bool, delta: float) -> void:
	# Bot: çömelme/koşuyu BotBrain ister (aynı dayanıklılık/kilit kuralları — sonsuz çömelme yok)
	var want_crouch: bool
	if _bot_driven:
		want_crouch = _bot_crouch and not _airborne
	else:
		want_crouch = not typing and Input.is_physical_key_pressed(KEY_CTRL) and not _airborne
	var want_sprint: bool
	if _bot_driven:
		want_sprint = _bot_run and dir != Vector3.ZERO
	else:
		want_sprint = not typing and Input.is_physical_key_pressed(KEY_SHIFT) and dir != Vector3.ZERO
	move_mode = MoveMode.WALK

	if want_crouch and not crouch_locked and crouch_stamina > 0.0:
		move_mode = MoveMode.CROUCH
		crouch_stamina = maxf(crouch_stamina - delta / (CROUCH_MAX_TIME * float(_upgrade_mult["stamina"])), 0.0)
		_crouch_delay = STAMINA_REGEN_DELAY
		if crouch_stamina <= 0.0:
			crouch_locked = true
	else:
		_crouch_delay -= delta
		if _crouch_delay <= 0.0:
			crouch_stamina = minf(crouch_stamina + delta / CROUCH_REGEN_TIME, 1.0)
		if crouch_locked and crouch_stamina >= CROUCH_UNLOCK:
			crouch_locked = false

	if move_mode != MoveMode.CROUCH and want_sprint and not sprint_locked and sprint_stamina > 0.0:
		move_mode = MoveMode.RUN
		sprint_stamina = maxf(sprint_stamina - delta / (SPRINT_MAX_TIME * float(_upgrade_mult["stamina"])), 0.0)
		_sprint_delay = STAMINA_REGEN_DELAY
		if sprint_stamina <= 0.0:
			sprint_locked = true
	else:
		_sprint_delay -= delta
		if _sprint_delay <= 0.0:
			sprint_stamina = minf(sprint_stamina + delta / SPRINT_REGEN_TIME, 1.0)
		if sprint_locked and sprint_stamina >= SPRINT_UNLOCK:
			sprint_locked = false


## Fener görünürlüğü: ölü, rakipten görünmez veya oyuncu feneri kapattıysa gizli (Halo çocuğu da birlikte kapanır)
func _update_flashlight_visible() -> void:
	if flashlight:
		flashlight.visible = not is_dead and not _vis_hidden and not flashlight_off


## Fener kapatma (F tuşu, sadece yerel oyuncu): basınca feneri kapatır (en fazla FLASHLIGHT_OFF_TIME = 2 sn),
## tekrar basınca erken açar. Süre dolunca otomatik açılır ve tam dolana kadar (FLASHLIGHT_REGEN_TIME = 10 sn) kilitlenir.
func _update_flashlight(delta: float) -> void:
	var typing := ChatBox.is_typing
	var down := not typing and not is_trapped and Input.is_physical_key_pressed(FLASHLIGHT_KEY)
	var pressed := down and not _flashlight_was_down
	_flashlight_was_down = down

	var prev_off := flashlight_off
	if pressed:
		if flashlight_off:
			flashlight_off = false
		elif not flashlight_locked and flashlight_stamina > 0.0:
			flashlight_off = true

	if flashlight_off:
		flashlight_stamina = maxf(flashlight_stamina - delta / FLASHLIGHT_OFF_TIME, 0.0)
		if flashlight_stamina <= 0.0:
			flashlight_off = false
			flashlight_locked = true
	else:
		if flashlight_stamina < 1.0:
			flashlight_stamina = minf(flashlight_stamina + delta / FLASHLIGHT_REGEN_TIME, 1.0)
		if flashlight_locked and flashlight_stamina >= 1.0:
			flashlight_locked = false

	if flashlight_off != prev_off:
		_update_flashlight_visible()
		SFX.play_voice(_voice, "flashlight_toggle", -6.0, 0.05)
		_sync_timer = SYNC_RATE


func _reset_stamina() -> void:
	sprint_stamina = 1.0
	crouch_stamina = 1.0
	sprint_locked = false
	crouch_locked = false
	flashlight_off = false
	flashlight_stamina = 1.0
	flashlight_locked = false
	_flashlight_was_down = false
	move_mode = MoveMode.WALK
	_airborne = false
	_jump_cooldown = 0.0
	_flip = Flip.NONE
	_flip_cooldown = 0.0
	_stab_pending = -1.0
	_stab_timer = 0.0
	_stab_cooldown = 0.0
	_stab_lunge = 0.0


## Çömelmiş (ve canlı) oyuncunun üstünden mermi geçer — Bullet.gd ve host take_damage kullanır
func is_crouching() -> bool:
	return move_mode == MoveMode.CROUCH and not is_dead


## Doğma koruması aktif mi? (Görünmez değil, sadece vurulamaz — mermi/bıçak/bomba/tuzak hasarı işlemez)
func is_spawn_protected() -> bool:
	return _spawn_invuln_left > 0.0 and not is_dead


## Doğma koruması yanıp sönme görseli: karakter yarı saydam ↔ tam opak arasında ritmik yanıp söner (asla tamamen kaybolmaz)
func _update_spawn_blink() -> void:
	var want_active := _spawn_invuln_left > 0.0 and not is_dead and not _vis_hidden
	if not want_active:
		if _spawn_blink_active:
			_spawn_blink_active = false
			for gi: GeometryInstance3D in _spawn_meshes:
				if is_instance_valid(gi):
					gi.transparency = 0.0
		return
	if _spawn_meshes.is_empty() and _char_mesh != null:
		for child in _char_mesh.find_children("*", "GeometryInstance3D", true, false):
			if _special_laser != null and (child == _special_laser or _special_laser.is_ancestor_of(child)):
				continue
			_spawn_meshes.append(child as GeometryInstance3D)
	_spawn_blink_active = true
	# Son 0.8 sn'de yanıp sönme hafifçe hızlanır (koruma bitiyor ipucu)
	var freq := SPAWN_BLINK_HZ * (1.45 if _spawn_invuln_left < 0.8 else 1.0)
	var phase := sin(Time.get_ticks_msec() * 0.001 * TAU * freq)
	var trans := SPAWN_BLINK_TRANS if phase < 0.0 else 0.0
	for gi: GeometryInstance3D in _spawn_meshes:
		if is_instance_valid(gi):
			gi.transparency = trans


func _get_aim_target() -> Vector3:
	return get_aim_target_at(global_position.y + 0.9)


## Nişangah ışınının verilen yükseklikteki yatay düzlemi kestiği nokta. Weapon mermiyi namlu yüksekliğindeki
## noktaya yollar → mermi çizgisi ekranda TAM nişangahın altından geçer (0.9 m düzlemi perspektifte kaydırıyordu).
func get_aim_target_at(height: float) -> Vector3:
	if _bot_driven:
		# Bot: BotBrain'in nişan noktası (host'un kamerası/faresi DEĞİL); henüz yoksa mevcut bakış yönü
		return _bot_aim if _bot_has_aim else global_position - global_transform.basis.z
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return global_position + Vector3(0, 0, -1)
	# Sanal nişangah (fare hassasiyeti) — Crosshair günceller; yoksa gerçek fare konumu
	var mouse: Vector2 = GAME_SETTINGS.aim_screen_position(get_viewport())
	var from  := cam.project_ray_origin(mouse)
	var dir   := cam.project_ray_normal(mouse)
	if absf(dir.y) < 0.001:
		return global_position
	# Nişan düzlemi oyuncuya göreli (engebeli haritalarda — kum tepesi, arazi — sabit yükseklik sapıyordu)
	var t := (height - from.y) / dir.y
	return from + dir * t


## Merminin dikey hedefi (Weapon._pitched): nişangahın altındaki RAKİBİN ya da ZEMİNİN göğüs hizası — farklı katta/yükseklikteki
## rakip vurulabilsin. Duvar yüzeyi / hiçbir şey → INF (yatay atış, eski davranış). Sadece atış anında (her kare değil).
const SHOT_AIM_CHEST := 1.15   # vuruş kutusu 1.8 m; ölçeksiz namlu ~1.2 m → düzde fark ölü bölgede kalır
func _get_shot_aim_point() -> Vector3:
	if _bot_driven:
		return _bot_aim + Vector3(0, SHOT_AIM_CHEST, 0) if _bot_has_aim else Vector3.INF   # BotBrain hedefin ayak noktasını verir
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return Vector3.INF
	var mouse: Vector2 = GAME_SETTINGS.aim_screen_position(get_viewport())
	var from := cam.project_ray_origin(mouse)
	var q := PhysicsRayQueryParameters3D.create(from, from + cam.project_ray_normal(mouse) * 250.0, 1)
	q.exclude = [get_rid()]
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if hit.is_empty():
		return Vector3.INF
	var col: Object = hit["collider"]
	if col is CharacterBody3D:
		return (col as Node3D).global_position + Vector3(0, SHOT_AIM_CHEST, 0)
	if (hit["normal"] as Vector3).y > 0.6:   # zemin / rampa / platform üstü
		return (hit["position"] as Vector3) + Vector3(0, SHOT_AIM_CHEST, 0)
	return Vector3.INF


func _interpolate_remote(delta: float) -> void:
	var t := minf(delta * 20.0, 1.0)
	global_position = global_position.lerp(_target_position, t)
	rotation.y = lerp_angle(rotation.y, _target_aim_y, t)


@rpc("any_peer", "unreliable_ordered")
func _broadcast_state(pos: Vector3, aim_y: float, mode: int = MoveMode.WALK) -> void:
	if is_local:
		return
	var sender := multiplayer.get_remote_sender_id()
	# Bot: durumu SADECE host yayınlar; insan: SADECE kendi peer_id'si yayınlar
	if is_bot:
		if _bot_driven or (sender != 0 and sender != 1):
			return
	elif sender != 0 and sender != peer_id:
		return
	_target_position = pos
	_target_aim_y = aim_y
	_airborne = (mode & AIR_FLAG) != 0
	var new_fl_off := (mode & FLASHLIGHT_OFF_FLAG) != 0
	if new_fl_off != flashlight_off:
		flashlight_off = new_fl_off
		_update_flashlight_visible()
		if not _vis_hidden and not is_dead:
			SFX.play_voice(_voice, "flashlight_toggle", -6.0, 0.05)
	move_mode = clampi(mode & ~(AIR_FLAG | FLASHLIGHT_OFF_FLAG), MoveMode.RUN, MoveMode.CROUCH)


# ─────────────────────────────────────────────
# Hasar — sadece SERVER işler
# ─────────────────────────────────────────────

## source: DAMAGE_BULLET (mermi — çömelmiş hedefe işlemez) / DAMAGE_EXPLOSION (bomba — çömelme korumaz)
@rpc("any_peer", "reliable")
func take_damage(amount: float, shooter_peer_id: int, source: int = DAMAGE_BULLET) -> void:
	if not NetworkManager.is_host():
		return
	if amount <= 0.0 or is_nan(amount) or is_inf(amount):
		return
	if is_dead or not GameManager.match_live:
		return  # ısınmada (diğer oyuncuların yüklemesi bekleniyor) hasar yok
	if is_spawn_protected():
		return  # doğma koruması (2.5 sn): görünür kalır ama hiçbir hasar işlemez
	# Uzak istemciden gelen hasar RPC'sini doğrula (yerel host/bot/bomba/tuzak çağrıları sender == 0)
	var sender := multiplayer.get_remote_sender_id()
	if sender != 0:
		if shooter_peer_id != sender:
			return
		if source != DAMAGE_BULLET and source != DAMAGE_SPECIAL:
			return
		if GameManager.are_allies(shooter_peer_id, peer_id):
			return
		var shooter: Variant = GameManager.active_players.get(shooter_peer_id)
		if shooter == null or not is_instance_valid(shooter) or shooter.is_dead:
			return
		if source == DAMAGE_SPECIAL:
			amount = minf(amount, 999.0)
		else:
			var cfg: Dictionary = WEAPON_CONFIGS.get(String(shooter.character_type), {})
			var max_dmg: float = float(cfg.get("damage", 50.0)) * 1.35
			if cfg.has("one_shot_radius"):
				var hdist := Vector2((shooter as Node3D).global_position.x - global_position.x,
						(shooter as Node3D).global_position.z - global_position.z).length()
				if hdist <= float(cfg["one_shot_radius"]) + 3.0:
					max_dmg = maxf(max_dmg, float(cfg.get("one_shot_damage", 999.0)))
			amount = minf(amount, max_dmg)
	# Çömelme: mermiler üstünden geçer (kapı kilit çemberindeyken çömelme korumaz)
	if source == DAMAGE_BULLET and is_crouching() and not GameManager.is_in_door_unlock_zone(peer_id):
		return
	health -= amount
	health = clampf(health, 0.0, max_health)
	_sync_health.rpc(health)
	_send_hit_confirm(shooter_peer_id, health <= 0.0)
	if health <= 0.0:
		_die(shooter_peer_id, source)


## Host: hasar gerçekten işlendi → SADECE vurana isabet onayı (çömelme/ısınma reddi yanlış işaret vermesin)
func _send_hit_confirm(shooter: int, killed: bool) -> void:
	if shooter == peer_id or NetworkManager.is_bot(shooter):
		return
	if shooter == NetworkManager.get_local_id():
		_hit_confirm_rpc(killed)
	elif shooter in multiplayer.get_peers():
		_hit_confirm_rpc.rpc_id(shooter, killed)


## Vuranın client'ında (bu düğüm = kurban): yerel oyuncuya ilet
@rpc("any_peer", "reliable")
func _hit_confirm_rpc(killed: bool) -> void:
	if multiplayer.get_remote_sender_id() not in [0, 1]:
		return   # sadece host onaylar (düğüm yetkisi kurbanın kendisi olabilir → "authority" kullanılamaz)
	var me: Variant = GameManager.active_players.get(NetworkManager.get_local_id())
	if me != null and is_instance_valid(me):
		(me as Node).emit_signal("hit_confirmed", killed)


@rpc("any_peer", "call_local", "reliable")
func _sync_health(new_health: float) -> void:
	if multiplayer.get_remote_sender_id() not in [0, 1]:
		return
	var diff := new_health - health
	if diff < 0.0:
		# Hasar → her peer'da kırmızı parıltı (hasara göre), ölmediyse sarsılma
		flash_fx(FX_HURT_COLOR, 0.55 + (-diff) / 60.0)
		SFX.play_voice(_voice, "flesh_hit", -6.0, 0.08)   # gövdeye isabet (3D, herkes duyar)
		# Kan: mermi kendi çıkardıysa tekrar yok; bıçak/bomba/tuzak buradan (görünmez oyuncu rakibe kan ile ele verilmez)
		if not _vis_hidden and not BLOOD_FX.recent(self, BLOOD_DEDUP_MS):
			BLOOD_FX.spawn(get_tree(), global_position + Vector3(0, 1.2, 0), global_transform.basis.z,
					clampf(0.8 + (-diff) / 50.0, 0.8, 2.0), self)
		if new_health > 0.0:
			play_action(Action.HIT)
	elif diff > 0.0:
		# İyileşme (sağlık gücü) → yeşil parıltı; respawn bu yoldan geçmez (_apply_respawn)
		flash_fx(FX_HEAL_COLOR, 1.0)
		if is_local:
			healed.emit(diff)
	health = new_health
	if is_local:
		emit_signal("health_changed", health)


# ─────────────────────────────────────────────
# Ölüm
# ─────────────────────────────────────────────

func _die(killer_peer_id: int, source: int = DAMAGE_BULLET) -> void:
	_apply_death.rpc()
	GameManager.handle_player_death(peer_id, killer_peer_id, source)  # kill feed 🔪 / bıçak XP'si için


@rpc("any_peer", "call_local", "reliable")
func _apply_death() -> void:
	if multiplayer.get_remote_sender_id() not in [0, 1]:
		return
	is_dead = true
	_spawn_invuln_left = 0.0
	BLOOD_FX.splat(get_tree(), global_position, 1.8)   # yerde kan gölü (solarak kaybolur)
	DEATH_FLASH.burst(get_tree(), global_position)   # ölüm noktasında kısa kırmızı ışık patlaması
	drop_card()
	is_trapped = false
	_clear_power_states()   # görünmezlik + hazır özel silah sıfırlanır (cesedin görünmesi için gizlemeler geri alınır)
	_death_token += 1
	_end_flip()  # is_dead zaten true → üst gövde katmanı açılmaz
	_stab_pending = -1.0  # ölürken savrulan bıçak sonradan isabet etmesin
	_stab_timer = 0.0
	if _hand_rifle:
		_hand_rifle.show_knife(0.0)
	_reset_leg_facing()
	if _upper:
		_upper.set_enabled_smooth(false)  # tam gövde ölüm animasyonu
	if _char_mesh:
		# Mixamo Dying (daha dramatik) varsa onu, yoksa UE Death
		var death_clip := ANIM_DYING if _anim_player and _anim_player.has_animation(ANIM_DYING) else ANIM_DEATH
		var rate := DYING_SPEED if death_clip == ANIM_DYING else 1.0
		if _anim_player and _anim_player.has_animation(death_clip):
			# Ölüm animasyonu oynar, bitince ceset gizlenir (arada respawn olursa gizleme iptal)
			_anim_player.speed_scale = rate
			_anim_player.play(death_clip, ANIM_BLEND)
			_hide_corpse_later(_death_token, _anim_player.get_animation(death_clip).length / rate + 0.6)
		else:
			_char_mesh.visible = false
	flashlight_off = false
	_update_flashlight_visible()
	body_light.visible = false
	collision_shape.set_deferred("disabled", true)
	if current_weapon:
		if current_weapon.has_method("cancel_reload"):
			current_weapon.cancel_reload()
		current_weapon.hide()
	_kill_reload_sfx()
	card_indicator.visible = false
	if _overhead_cards:
		_overhead_cards.visible = false
	name_label.visible = false


func _hide_corpse_later(token: int, wait: float) -> void:
	await get_tree().create_timer(wait).timeout
	if not is_instance_valid(self) or token != _death_token or not is_dead:
		return
	if _char_mesh:
		_char_mesh.visible = false


# ─────────────────────────────────────────────
# Respawn
# ─────────────────────────────────────────────

func respawn(spawn_pos: Vector3) -> void:
	_apply_respawn.rpc(spawn_pos)


@rpc("any_peer", "call_local", "reliable")
func _apply_respawn(spawn_pos: Vector3) -> void:
	var s := multiplayer.get_remote_sender_id()
	# Host (0/1) her oyuncuyu, insan client ise maç başı ısınma ışınlamasında yalnızca kendi düğümünü respawn edebilir
	if s not in [0, 1] and (is_bot or s != peer_id):
		return
	is_dead = false
	_spawn_invuln_left = SPAWN_INVULN_DURATION
	drop_card()
	is_trapped = false
	_clear_power_states()
	health = max_health
	if is_local:
		emit_signal("health_changed", health)
	global_position = spawn_pos
	_target_position = spawn_pos
	_last_anim_pos = spawn_pos  # ışınlanma koşu animasyonu tetiklemesin
	_move_speed = 0.0
	_death_token += 1
	_kill_reload_sfx()
	_reset_leg_facing()
	_reset_stamina()
	if is_bot:
		_reset_bot_input()   # ölmeden önceki tetik/şarjör isteği yeni hayata taşınmasın
	_card_pickup_blocked = 0.5
	reset_physics_interpolation()
	if _char_mesh:
		_char_mesh.visible = true
		_play_idle()
	if _upper:
		_upper.set_enabled_smooth(true)
	collision_shape.disabled = false
	_update_flashlight_visible()
	body_light.visible = is_local
	card_indicator.visible = false
	if _overhead_cards:
		_overhead_cards.visible = false
	name_label.visible = _is_local_ally()
	if current_weapon:
		current_weapon.show()
		current_weapon.refill_ammo()


# ─────────────────────────────────────────────
# Kart Taşıma
# ─────────────────────────────────────────────

func pick_up_card() -> void:
	cards_held += 1
	card_indicator.visible = false
	# Sadece taşıyıcının kendisi (ve takım modunda kendi takımı) görür; görünmezken gösterge de gizli
	if _overhead_cards:
		_overhead_cards.set_card_count(cards_held)
		var local_id := NetworkManager.get_local_id()
		_overhead_cards.visible = GameManager.are_allies(local_id, peer_id) and not is_hidden_from_local()


func drop_card() -> void:
	cards_held = 0
	card_indicator.visible = false
	if _overhead_cards:
		_overhead_cards.set_card_count(0)
		_overhead_cards.visible = false


# ─────────────────────────────────────────────
# Takım arkadaşı isim etiketi
# ─────────────────────────────────────────────

# Yerel oyuncunun takım arkadaşı mı (kendisi ve rakipler hariç)
func _is_local_ally() -> bool:
	if is_local or GameManager.is_deathmatch():
		return false
	var local_team: int = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", -1)
	return local_team >= 0 and local_team == team_id


# Başın üstünde takım sembolü + ad (takım rengi). no_depth_test → duvar arkasında da okunur,
# Label3D gölgesiz (unshaded) → karanlıkta da görünür. Rakiplere asla gösterilmez.
func _setup_ally_name_label() -> void:
	var glyphs: Array = UITheme.TEAM_GLYPHS
	var glyph: String = glyphs[team_id] if team_id >= 0 and team_id < glyphs.size() else "○"
	name_label.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED  # oyuncu adı çevrilmesin
	name_label.text = "%s %s" % [glyph, NetworkManager.players.get(peer_id, {}).get("name", "Oyuncu")]
	name_label.modulate = TeamManager.get_color(team_id).lightened(0.25)
	if UITheme.font_bold:
		name_label.font = UITheme.font_bold
	name_label.font_size = 44   # kullanıcı: ×1.3 (34'tü)
	name_label.outline_size = 13
	name_label.outline_modulate = Color(0.0, 0.0, 0.0, 0.9)
	name_label.position = Vector3(0, 2.85, 0)  # büyütülmüş gövdenin (CHARACTER_VISUAL_SCALE) başı üstü, kart göstergesinin (3.3) altı
	name_label.no_depth_test = true
	name_label.visible = _is_local_ally() and not is_dead
