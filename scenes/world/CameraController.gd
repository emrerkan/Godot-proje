## CameraController.gd
## Yerel oyuncuyu sinematik şekilde takip eden izometrik kamera.
## Exponential lerp kullanır: hedefe hızlı yaklaşır, varınca yumuşar.

extends Camera3D

## Görüş açısı (kullanıcı: "eğiklik çok, aşağıdaki karakter küçük benimki kocaman"): FOV 75'te ekran kenarındaki duvarlar
## dışa devriliyor, kameraya yakın/uzak karakter boyu çok farklıydı. Dar FOV + aynı açıdan uzak kamera = ekran ortasında AYNI
## zemin kapsamı, çok daha az perspektif bozulması. OFFSET, FOV 75'teki (0,14,12) kapsamını koruyacak şekilde ölçeklenir
## (40° → ×2.11, kamera–oyuncu ~39 m; eskiden ~18 m). Kameradan mesafeyle çalışan eşikler (sis, uzak ışık sönmesi,
## ot/lamba görünürlüğü) bu yüzden ~+20 m kaydırıldı — FOV değişirse onları da güncelle.
const FOV_DEG      := 40.0
const BASE_OFFSET  := Vector3(0, 14, 12)   # FOV 75'teki eski ofset (kapsam referansı)
const BASE_FOV_DEG := 75.0
var OFFSET := BASE_OFFSET * (tan(deg_to_rad(BASE_FOV_DEG * 0.5)) / tan(deg_to_rad(FOV_DEG * 0.5)))
const PITCH        := -50.0
const FOLLOW_SPEED := 7.0   # Yükselt = daha hızlı; düşür = daha geride kalır

## Ekran sarsıntısı (trauma modeli): add_trauma(0..1) — PowerupManager patlamada yakınlığa göre çağırır.
## Takip konumuna dokunmaz; h_offset/v_offset + hafif yuvarlanma ile uygulanır.
const SHAKE_MAX_OFFSET := 0.55   # m
const SHAKE_MAX_ROLL   := 2.5    # derece
const SHAKE_DECAY      := 1.4    # trauma/sn
const SHAKE_FREQ       := 28.0

## ── Harita sınırı (kullanıcı: "sınıra gelince kamera en fazla orayı göstersin, arkasını göstermesin") ──
## Harita get_camera_limits() → yarı düzlemler Vector3(nx, nz, d): n·p ≤ d (ImportedMap: kare ya da sekizgen, Map.gd: Labirent).
## Kameranın baktığı nokta (oyuncu) clampf mantığıyla içeri itilir: ekranın yere düşen izi (footprint) hiçbir düzlemi geçmez.
## Ekranın üst kenarı ~50 m öteye bakıyor (pitch -50°, fov 75°) — tamamı sayılsa kamera kuzeyde hiç ilerlemezdi →
## iz FAR_VIEW_CAP'te kesilir (ötesi karanlıkta zaten görünmüyor).
const FAR_VIEW_CAP := 16.0
const SIDE_VIEW_FRACTION := 0.85
const FOOT_ROWS := 24
var _limits: Array[Vector3] = []
var _foot := PackedVector2Array()   # ekran izinin bakış noktasına göre XZ ofsetleri (önbellek)
var _foot_key := Vector3.ZERO       # (genişlik, yükseklik, fov) değişince yeniden hesaplanır

var _target: Node3D = null
var _snapped: bool  = false
var _trauma := 0.0
var _shake_t := 0.0
var _noise := FastNoiseLite.new()


func add_trauma(amount: float) -> void:
	# Ayarlar → Kontroller → Ekran sarsıntısı (0 = kapalı)
	var mult := float(preload("res://scenes/settings/GameSettings.gd").get_value("camera_shake"))
	_trauma = clampf(_trauma + amount * mult, 0.0, 1.0)


## _physics_process'ten — kamera physics interpolation açık, dönüş fizik karesinde değişmeli
func _update_shake(delta: float) -> void:
	if _trauma <= 0.0:
		return
	_trauma = maxf(_trauma - SHAKE_DECAY * delta, 0.0)
	_shake_t += delta * SHAKE_FREQ
	var s := _trauma * _trauma
	h_offset = SHAKE_MAX_OFFSET * s * _noise.get_noise_2d(_shake_t, 0.0)
	v_offset = SHAKE_MAX_OFFSET * s * _noise.get_noise_2d(_shake_t, 100.0)
	rotation_degrees = Vector3(PITCH, 0.0, SHAKE_MAX_ROLL * s * _noise.get_noise_2d(_shake_t, 200.0))


func _ready() -> void:
	rotation_degrees = Vector3(PITCH, 0.0, 0.0)
	fov = FOV_DEG
	_noise.frequency = 0.4  # × SHAKE_FREQ ≈ 11 Hz titreşim
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_ON
	GameManager.local_player_spawned.connect(_on_local_player_spawned)


func _on_local_player_spawned(player: Node) -> void:
	_target  = player
	_snapped = false   # Yeni oyuncu: ilk frame'de anında konumlan
	_fetch_limits()


## Sistem testi (scenes/benchmark/Benchmark.gd): kamerayı başka bir oyuncuya bağla (yumuşak geçiş, snap yok)
func spectate(node: Node3D) -> void:
	_target = node


func _fetch_limits() -> void:
	var map := get_parent()
	if map != null and map.has_method("get_camera_limits"):
		_limits.assign(map.call("get_camera_limits"))


## Ekranın yere düşen izi: ekran kenarlarındaki ışınların bakış noktası yüksekliğindeki zemin kesişimleri (ofset olarak)
func _footprint() -> PackedVector2Array:
	var vp := get_viewport().get_visible_rect().size
	var key := Vector3(vp.x, vp.y, fov)
	if key == _foot_key and not _foot.is_empty():
		return _foot
	_foot_key = key
	_foot = PackedVector2Array()
	# Ekran üstü yanlara daha geniş açılır (yamuk) — yan sınır oyuncunun satırındaki genişliğe göre alınır, yoksa kenara
	# giden oyuncu ekrandan çıkardı. SIDE_VIEW_FRACTION: oyuncu kenardayken ekran kenarına bu oran kadar yaklaşabilir.
	var mid := project_ray_normal(Vector2(vp.x, vp.y * 0.5))
	var half_w := absf((OFFSET + mid * (OFFSET.y / maxf(-mid.y, 0.01))).x) * SIDE_VIEW_FRACTION
	for i in FOOT_ROWS + 1:
		var sy := vp.y * float(i) / float(FOOT_ROWS)
		for sx: float in [0.0, vp.x]:
			var dir := project_ray_normal(Vector2(sx, sy))
			if dir.y > -0.01:
				continue
			var p := OFFSET + dir * (OFFSET.y / -dir.y)   # kamera bakış noktasının OFFSET kadar üstünde
			if p.z < -FAR_VIEW_CAP:
				continue
			_foot.append(Vector2(clampf(p.x, -half_w, half_w), p.z))
	return _foot


## Bakış noktasını sınırların içine kıstır (her düzlem için clampf; köşelerde birkaç tur yeter)
func _clamp_look(p: Vector3) -> Vector3:
	if _limits.is_empty():
		return p
	var foot := _footprint()
	if foot.is_empty():
		return p
	var t := Vector2(p.x, p.z)
	for _it in 4:
		for pl: Vector3 in _limits:
			var n := Vector2(pl.x, pl.y)
			var reach := -INF
			for f: Vector2 in foot:
				reach = maxf(reach, n.dot(f))
			var over := n.dot(t) - (pl.z - reach)
			if over > 0.0:
				t -= n * over
	return Vector3(t.x, p.y, t.y)


func _physics_process(delta: float) -> void:
	_update_shake(delta)
	if _target == null or not is_instance_valid(_target):
		return
	if _limits.is_empty():
		_fetch_limits()
	var desired: Vector3 = _clamp_look(_target.global_position) + OFFSET
	if not _snapped:
		global_position = desired
		reset_physics_interpolation()
		_snapped = true
	else:
		# Exponential decay lerp — framerate bağımsız, sinematik yumuşaklık
		global_position = global_position.lerp(desired, 1.0 - exp(-FOLLOW_SPEED * delta))
