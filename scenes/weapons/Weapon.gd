## Weapon.gd (3D)
## Ateş etme, şarj ve mermi yönetimi.

extends Node3D

signal ammo_changed(current: int, total: int, reloading: bool)
## Her peer'da tetiklenir (_spawn_bullet call_local) — Player atış animasyonu için
signal fired

@export var damage: float = 25.0
@export var fire_rate: float = 0.15
@export var bullet_speed: float = 30.0
@export var max_ammo: int = 30
@export var reload_time: float = 1.8
@export var spread_degrees: float = 2.0
@export var is_semi_auto: bool = false
@export var max_distance: float = 60.0
## true: mermi duvarlardan geçer (sadece Sniper — Player.WEAPON_CONFIGS "pierce_walls")
var pierce_walls := false
## Özel silah (tek atış) sabitleri — PowerupManager güçü: 999 hasar, 1000 m, duvardan geçer
const SPECIAL_SPEED := 160.0
const SPECIAL_DAMAGE := 999.0
const SPECIAL_MAX_DISTANCE := 1000.0
## Son `fired` özel atıştan mı geldi? (Player ses seçimi için — fired sinyali parametresiz)
var last_shot_special := false
## Eldeki tüfeğin namlu ağzı (HandRifle "Muzzle", Player atar). Yoksa / anormal konumdaysa $Muzzle kullanılır.
var visual_muzzle: Node3D = null
## Karakter modeli görsel olarak büyütülmüşse (Player.CHARACTER_VISUAL_SCALE) namlu da yükselir.
## Fizik mermisi vuruş kutusunun (1.8 m) üstünden geçmesin diye PHYSICS_MAX_HEIGHT'te tutulur;
## görsel tracer ise Bullet.set_visual_offset ile tam namlu ağzından çıkıp uçuş çizgisine kavuşur.
var visual_scale := 1.0
const VISUAL_MUZZLE_MAX_DIST := 2.2   # gövdeden yatay uzaklık sınırı (1.3x ölçekli Sniper namlusu dahil)
const PHYSICS_MAX_HEIGHT := 1.50      # 1.8 m oyuncu kapsülünü asla üstünden atlamayan fizik tavanı

@onready var muzzle: Marker3D = $Muzzle
@onready var fire_timer: Timer = $FireTimer
@onready var reload_timer: Timer = $ReloadTimer

var current_ammo: int = 0
var is_reloading: bool = false
var _ammo_label: Label3D = null
var bullet_scene: PackedScene = preload("res://scenes/weapons/Bullet.tscn")


func _ready() -> void:
	current_ammo = max_ammo
	fire_timer.wait_time = fire_rate
	reload_timer.wait_time = reload_time
	reload_timer.one_shot = true
	fire_timer.one_shot = true
	# AmmoLabel, Player.tscn'dedir — ağaçta iki seviye üstte
	var player := get_parent().get_parent()
	if player and player.has_node("AmmoLabel"):
		_ammo_label = player.get_node("AmmoLabel") as Label3D
	_update_ammo_label()


# ─────────────────────────────────────────────
# Ateş Etme
# ─────────────────────────────────────────────

## ── Dikey nişan (kullanıcı: "aynı düzlemde olmadığım için vuramıyorum") ──
## Mermiler eskiden TAMAMEN yatay uçuyordu → aşağıdaki rakibin üstünden geçiyor, yukarıdakinde yere çarpıyordu.
## Player her atıştan önce aim_point'i yazar (nişangahın altındaki rakibin/zeminin göğüs hizası; duvar/boşluk = INF).
## Yükseklik farkı PITCH_DEADZONE'dan küçükse yatay kalır (düz zeminde mermi hedefin ardında yere gömülmesin).
const PITCH_DEADZONE := 0.45
const MAX_PITCH_DEG := 40.0
var aim_point := Vector3.INF


## Yatay yön + namludan aim_point'e eğim → 3B mermi yönü
func _pitched(horizontal: Vector3, spawn: Vector3, aim: Vector3) -> Vector3:
	if aim == Vector3.INF:
		return horizontal
	var dy := aim.y - spawn.y
	var h := Vector2(aim.x - spawn.x, aim.z - spawn.z).length()
	if absf(dy) < PITCH_DEADZONE or h < 1.0:
		return horizontal
	var p := clampf(atan2(dy, h), -deg_to_rad(MAX_PITCH_DEG), deg_to_rad(MAX_PITCH_DEG))
	return Vector3(horizontal.x * cos(p), sin(p), horizontal.z * cos(p)).normalized()


func try_shoot(shooter_peer_id: int, shooter_team_id: int) -> void:
	if is_reloading or current_ammo <= 0 or not fire_timer.is_stopped():
		return

	current_ammo -= 1
	_update_ammo_label()
	fire_timer.start()

	# Saçılma: Y ekseninde rastgele rotasyon
	var spread_rad := deg_to_rad(randf_range(-spread_degrees, spread_degrees))
	var spread_rot := Basis(Vector3.UP, spread_rad)
	var spawn := _safe_spawn_position()
	var forward := _aim_forward(spawn)
	var direction := _pitched((spread_rot * forward).normalized(), spawn, aim_point)

	_spawn_bullet.rpc(spawn, direction, shooter_peer_id, shooter_team_id, max_distance)

	if current_ammo <= 0:
		reload()


## Yatay mermi yönü: namludan nişangaha (kullanıcı: "nişan aldığım yere gitmiyor"). Eskiden gövde yönüne PARALELDİ →
## namlu gövdenin ~0.3 m sağında olduğu için mermi nişangahın hep sağından geçiyordu (yakın nişanda çok belirgin).
## Nişan noktası = nişangah ışınının NAMLU YÜKSEKLİĞİNDEKİ düzlemle kesişimi → mermi çizgisi ekranda nişangahın üstünden geçer.
## Nişan namlunun dibinde/arkasındaysa (nişangah gövdeyle namlu arasında) gövde yönü kullanılır.
const AIM_CONVERGE_MIN := 0.6
func _aim_forward(spawn: Vector3) -> Vector3:
	var holder: Node3D = get_parent()
	var forward: Vector3 = -holder.global_transform.basis.z
	forward.y = 0
	forward = forward.normalized()
	var player := holder.get_parent()
	if player == null or not player.has_method("get_aim_target_at"):
		return forward
	var target: Vector3 = player.get_aim_target_at(spawn.y)
	var to_aim := Vector3(target.x - spawn.x, 0.0, target.z - spawn.z)
	if to_aim.length() < AIM_CONVERGE_MIN or to_aim.normalized().dot(forward) < 0.5:
		return forward
	return to_aim.normalized()


## Duvarın dibinde namlu duvarın İÇİNE/ARKASINA geçebiliyor → mermi orada doğup duvarı hiç görmüyordu.
## Oyuncu gövdesinden (namlu yüksekliğinde) namluya ışın: arada duvar varsa mermi gövdeden doğar,
## Bullet'ın ilk ışın taraması duvara çarpıp onu yok eder. Sniper (pierce_walls) zaten geçer → kontrol yok.
func _safe_spawn_position(ignore_walls: bool = false) -> Vector3:
	var muzzle_pos := muzzle.global_position
	var player := get_parent().get_parent() as Node3D
	if player and is_instance_valid(visual_muzzle) and visual_muzzle.is_visible_in_tree():
		var tip := visual_muzzle.global_position
		var off := Vector2(tip.x - player.global_position.x, tip.z - player.global_position.z)
		if off.length() < VISUAL_MUZZLE_MAX_DIST:
			var phys_y: float = clampf(tip.y, player.global_position.y + 0.35, player.global_position.y + PHYSICS_MAX_HEIGHT)
			muzzle_pos = Vector3(tip.x, phys_y, tip.z)
	if pierce_walls or ignore_walls or player == null:
		return muzzle_pos
	var body_pos := Vector3(player.global_position.x, muzzle_pos.y, player.global_position.z)
	var q := PhysicsRayQueryParameters3D.create(body_pos, muzzle_pos, 1)
	if player is CollisionObject3D:
		q.exclude = [(player as CollisionObject3D).get_rid()]
	if get_world_3d().direct_space_state.intersect_ray(q).is_empty():
		return muzzle_pos
	return body_pos


## Görsel namlu ağzı ile fizik doğma noktası arasındaki dikey fark (mermi görseli tam namlu ucundan başlar).
func _visual_muzzle_offset(spawn_pos: Vector3) -> Vector3:
	if not is_instance_valid(visual_muzzle) or not visual_muzzle.is_visible_in_tree():
		return Vector3.ZERO
	var tip := visual_muzzle.global_position
	# Duvar dibinde body_pos fallback'i kullanıldıysa görseli duvarın önüne kaydırma
	if Vector2(tip.x - spawn_pos.x, tip.z - spawn_pos.z).length() > 0.8:
		return Vector3.ZERO
	var dy: float = clampf(tip.y - spawn_pos.y, -0.8, 0.8)
	return Vector3(0.0, dy, 0.0) if absf(dy) > 0.01 else Vector3.ZERO


@rpc("any_peer", "call_local", "reliable")
func _spawn_bullet(
	spawn_pos: Vector3,
	direction: Vector3,
	shooter_peer_id: int,
	shooter_team_id: int,
	p_max_distance: float
) -> void:
	var bullet: Node3D = bullet_scene.instantiate()
	get_tree().current_scene.add_child(bullet)
	bullet.global_position = spawn_pos
	bullet.initialize(direction, bullet_speed, damage, shooter_peer_id, shooter_team_id, p_max_distance)
	bullet.pierce_walls = pierce_walls
	var vis_off := _visual_muzzle_offset(spawn_pos)
	if vis_off != Vector3.ZERO and bullet.has_method("set_visual_offset"):
		bullet.set_visual_offset(vis_off)
	last_shot_special = false
	fired.emit()


## Özel silah: şarjör/ateş hızından bağımsız TEK mermi (Player sol tık basışında, special_armed iken çağırır).
## Saçılma yok; nişan yönünde 999 hasar, 1000 m, duvardan geçer, çömelme korumaz, takım arkadaşından geçer (Bullet).
## aim: nişangah noktası (Player._get_aim_target) — mermi namludan TAM oraya (yatayda) gider, lazerle aynı çizgi.
## Namlu gövdenin ~0.3 m sağında olduğu için gövde yönüne paralel atış nişangahı ıskalıyordu.
func fire_special(shooter_peer_id: int, shooter_team_id: int, aim: Vector3 = Vector3.INF) -> void:
	var spawn := _safe_spawn_position(true)
	var holder: Node3D = get_parent()
	var forward: Vector3 = -holder.global_transform.basis.z
	if aim != Vector3.INF:
		var to_aim := Vector3(aim.x - spawn.x, 0.0, aim.z - spawn.z)
		if to_aim.length() > 0.5:   # nişan namlunun dibindeyse gövde yönü
			forward = to_aim
	forward.y = 0
	forward = forward.normalized()
	_spawn_special_bullet.rpc(spawn, _pitched(forward, spawn, aim_point), shooter_peer_id, shooter_team_id)


@rpc("any_peer", "call_local", "reliable")
func _spawn_special_bullet(
	spawn_pos: Vector3,
	direction: Vector3,
	shooter_peer_id: int,
	shooter_team_id: int
) -> void:
	var bullet: Node3D = bullet_scene.instantiate()
	get_tree().current_scene.add_child(bullet)
	bullet.global_position = spawn_pos
	bullet.initialize(direction, SPECIAL_SPEED, SPECIAL_DAMAGE, shooter_peer_id, shooter_team_id, SPECIAL_MAX_DISTANCE)
	bullet.pierce_walls = true
	bullet.make_special()
	var vis_off := _visual_muzzle_offset(spawn_pos)
	if vis_off != Vector3.ZERO and bullet.has_method("set_visual_offset"):
		bullet.set_visual_offset(vis_off)
	# Atış anında her peer'da lazer sönsün (host'un _special_gun_rpc(false)'u RTT sonra gelir)
	var player := get_parent().get_parent()
	if player != null and player.has_method("set_special_armed"):
		player.set_special_armed(false)
	last_shot_special = true
	fired.emit()


# ─────────────────────────────────────────────
# Yeniden Şarj
# ─────────────────────────────────────────────

func configure(config: Dictionary) -> void:
	damage         = config.get("damage",         damage)
	fire_rate      = config.get("fire_rate",      fire_rate)
	bullet_speed   = config.get("bullet_speed",   bullet_speed)
	max_ammo       = config.get("max_ammo",       max_ammo)
	reload_time    = config.get("reload_time",    reload_time)
	spread_degrees = config.get("spread_degrees", spread_degrees)
	is_semi_auto   = config.get("is_semi_auto",   is_semi_auto)
	max_distance   = config.get("max_distance",   max_distance)
	pierce_walls   = config.get("pierce_walls",   false)
	current_ammo   = max_ammo
	fire_timer.wait_time   = fire_rate
	reload_timer.wait_time = reload_time
	_update_ammo_label()


func reload() -> void:
	if is_reloading or current_ammo == max_ammo:
		return
	is_reloading = true
	if _ammo_label:
		_ammo_label.text = "Şarj..."
	emit_signal("ammo_changed", current_ammo, max_ammo, true)
	reload_timer.start()
	await reload_timer.timeout
	current_ammo = max_ammo
	is_reloading = false
	_update_ammo_label()


func refill_ammo() -> void:
	current_ammo = max_ammo
	is_reloading = false
	reload_timer.stop()
	_update_ammo_label()


func _update_ammo_label() -> void:
	if _ammo_label:
		_ammo_label.text = "%d/%d" % [current_ammo, max_ammo]
	emit_signal("ammo_changed", current_ammo, max_ammo, false)
