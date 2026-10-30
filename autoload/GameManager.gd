## GameManager.gd
## Oyun durumunu, sahne geçişlerini, spawn'ı ve kart/kapı mekaniğini yönetir. (3D)

extends Node

signal game_started
signal game_ended(winning_team: int)
signal local_player_spawned(player: Node)
signal card_picked_up(carrier_peer_id: int, carrier_pos: Vector3, carrier_team_id: int)
signal card_dropped(drop_pos: Vector3, carrier_team_id: int)
## method = öldüren hasarın kaynağı (Player.DAMAGE_*: 0 mermi, 1 patlama/tuzak, 2 bıçak, 3 arkadan bıçak)
signal kill_happened(killer_peer_id: int, victim_peer_id: int, method: int)
signal xp_gained(amount: int, reason: String)  # yerel oyuncu XP kazandı (HUD "+100 XP")
signal door_unlock_changed(ratio: float, carrier_peer_id: int)  # kapı kilidi ilerlemesi (Door.gd + HUD)
signal warmup_status(loaded: int, total: int, seconds_left: int)  # ısınma: kaç oyuncu yüklendi (HUD hedef çipi)

## ─── Kapı kilidi ───
## Kart taşıyıcısı kapının çevresindeki çemberde (DOOR_UNLOCK_RADIUS) DOOR_UNLOCK_TIME sn kalırsa kazanır.
## Çıkar / ölür / kartı düşürürse ilerleme SIFIRLANIR. Host hesaplar (_update_door_unlock), _door_unlock_rpc ile yayar.
const DOOR_UNLOCK_TIME := 5.0
const DOOR_UNLOCK_RADIUS := 3.0
const DOOR_SYNC_INTERVAL := 0.1
var door_unlock := 0.0                # 0..1 (tüm peer'larda, host'tan gelir)
var _door_sync_timer := 0.0

## ─── XP (kalıcı profil — PlayerProfile) ───
## Her peer KENDİ XP'sini, zaten herkese yayılan olaylardan yerelde hesaplar (kill/kart RPC'leri, maç sonu).
## Profil yerel olduğu için ek ağ trafiği yok. Steam sürümünde sunucu doğrulaması gerekecek (bkz docs/PROJE_GECMISI.md).
const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
## Yükleme perdesi (açılış Main.gd, karakter seçimi, harita/migration). Perde, sahnenin ilk ağır kareleri
## (gölgelendirici derleme, SubViewport önizlemeleri) geçene kadar bu kadar kare daha açık kalır.
const LOADING := preload("res://scenes/ui/LoadingScreen.gd")
const CHAR_SELECT_SETTLE_FRAMES := 6
const MAP_SETTLE_FRAMES := 6
const XP_KILL := 100
const XP_CARRIER_KILL_BONUS := 150    # kart taşıyıcısını öldürmek
const XP_KNIFE_BONUS := 40            # bıçakla öldürmek (önden)
const XP_BACKSTAB_BONUS := 80         # arkadan bıçaklamak
const KILL_KNIFE := 2                 # = Player.DAMAGE_MELEE
const KILL_BACKSTAB := 3              # = Player.DAMAGE_BACKSTAB
const XP_CARD_PICKUP := 150
const XP_CARRY := 25                  # kart sendeyken her XP_CARRY_INTERVAL
const XP_CARRY_INTERVAL := 10.0
const XP_SURVIVE := 10                # hayattayken her XP_SURVIVE_INTERVAL
const XP_SURVIVE_INTERVAL := 15.0
const XP_HEAL_ALLY := 75              # Medic takım arkadaşını iyileştirdi (PowerupManager)
const XP_POWERUP := 25                # yerden güç aldı (PowerupManager)
const XP_TRAP_RESCUE := 75            # tuzaktaki takım arkadaşını kurtardı (PowerupManager)
const XP_MATCH := 100                 # maçı bitirdi
const XP_WIN := 300                   # kazanan takım
const RETURN_TO_LOBBY_DELAY := 5.0    # maç bitince lobiye otomatik dönüş (HUD oyun sonu ekranı bu sabiti okur)
## ─── Yükleme bekleme + ISINMA (CS tarzı) ───
## Herkes haritayı yükleyip kendi oyuncusunu doğurunca host'a bildirir (_peer_loaded) ve perdesi kalkar: yüklenen oyuncu
## haritada serbestçe dolaşır (ısınma — hasar yok, kart/kapı/güç yok, XP yok; HUD hedef çipi "n/N oyuncu hazır · süre").
## Maç, HERKES yüklenince _match_go_rpc ile aynı anda başlar: herkes kendi spawn'ına ışınlanır (can/mermi/dayanıklılık dolu).
## LOAD_WAIT_MAX sn sonunda yüklenemeyenler atılır, maç kalanlarla başlar.
const LOAD_WAIT_MAX := 120.0
const LOAD_STATUS_INTERVAL := 0.5
var match_live := false               # tüm peer'larda: maç gerçekten başladı mı (Player/PowerupManager okur)
var menu_notice := ""                 # ana menüde gösterilecek tek seferlik mesaj (yükleme süresi aşımıyla atılma)
var _local_loaded := false
var _expected_loaders: Array = []     # host: maç başında odadaki peer'lar
var _loaded_peers: Dictionary = {}    # host: yüklenmiş peer'lar
var _load_wait_left := 0.0            # host
var _load_status_timer := 0.0         # host

var match_xp := 0                     # bu maçta kazanılan (oyun sonu ekranı)
var _xp_survive_timer := 0.0
var _xp_carry_timer := 0.0
var _match_xp_closed := false

enum State { MENU, LOBBY, CHARACTER_SELECT, IN_GAME, ENDED }

var state: State = State.MENU
var player_scene: PackedScene = null
var map_scene: PackedScene = null
var char_select_scene: PackedScene = null
var card_scene: PackedScene = null
var door_scene: PackedScene = null

## peer_id -> Player node referansı
var active_players: Dictionary = {}

## Kart durumu
var card_instance: Node = null
var door_instance: Node = null
var card_carrier_peer_id: int = -1  # -1 = kart yerde

## Kişisel istatistikler: peer_id -> {kills, deaths}
var player_stats: Dictionary = {}

## Migration: restore sırasında kullanılacak geçici pozisyonlar
var _pending_card_pos: Vector3 = Vector3.ZERO
var _pending_door_pos: Vector3 = Vector3.ZERO
var _pending_positions: Dictionary = {}  # oyuncu adı → son konum (migration)
var _migrated_stats: Dictionary = {}     # oyuncu adı → {kills, deaths} (migration)


func _ready() -> void:
	player_scene      = preload("res://scenes/player/Player.tscn")
	map_scene         = preload("res://scenes/world/Map.tscn")
	char_select_scene = preload("res://scenes/ui/CharacterSelect.tscn")
	card_scene        = preload("res://scenes/world/Card.tscn")
	door_scene        = preload("res://scenes/world/Door.tscn")
	TeamManager.team_won.connect(_on_team_won)


# ─────────────────────────────────────────────
# Oyun Başlatma
# ─────────────────────────────────────────────

func start_game() -> void:
	if not NetworkManager.is_host():
		return
	TeamManager.reset()
	_start_game_rpc.rpc()


@rpc("authority", "call_local", "reliable")
func _start_game_rpc() -> void:
	state = State.CHARACTER_SELECT
	card_carrier_peer_id = -1
	card_instance = null
	door_instance = null
	player_stats.clear()
	# Yükleme perdesi: CharacterSelect _ready'de 5 önizleme modeli kurar (ana iş parçacığı birkaç kare kilitlenir)
	LOADING.open(get_tree(), "YÜKLENİYOR", "Operatörler hazırlanıyor")
	await get_tree().process_frame   # perde çizilsin
	await get_tree().process_frame
	get_tree().change_scene_to_packed(char_select_scene)
	LOADING.close(get_tree(), CHAR_SELECT_SETTLE_FRAMES)


## Tüm oyuncular karakter seçimini tamamladığında host tarafından çağrılır
func check_all_characters_selected() -> void:
	if not NetworkManager.is_host():
		return
	if state != State.CHARACTER_SELECT:
		return
	for p: Dictionary in NetworkManager.players.values():
		if p.get("team_id", -1) < 0:
			continue  # takım seçmemiş (spectator)
		if (p.get("character", "") as String).is_empty():
			return
	_begin_actual_game_rpc.rpc()


@rpc("authority", "call_local", "reliable")
func _begin_actual_game_rpc() -> void:
	state = State.IN_GAME
	match_xp = 0
	_xp_survive_timer = 0.0
	_xp_carry_timer = 0.0
	_match_xp_closed = false
	door_unlock = 0.0
	match_live = false
	_local_loaded = false
	if NetworkManager.is_host():
		_expected_loaders = NetworkManager.players.keys()
		_loaded_peers.clear()
		_load_wait_left = LOAD_WAIT_MAX
		_load_status_timer = 0.0
	# Sahne HEMEN değişir (geç kalan peer başkalarının spawn RPC'sini eski sahnede kaçırmasın); ağır GLB'yi
	# ImportedMap iş parçacığında yükler, perde map_ready + kendi oyuncumuz doğana kadar açık kalır.
	LOADING.open(get_tree(), "YÜKLENİYOR", "Harita hazırlanıyor")
	get_tree().change_scene_to_packed(_get_map_scene())
	await get_tree().process_frame
	await get_tree().process_frame
	await _wait_map_ready()
	if state != State.IN_GAME:
		return  # yüklerken atıldı / menüye dönüldü
	_spawn_local_player()
	_local_loaded = true
	# Isınma: perde kalkar, oyuncu dolaşabilir — maç herkes yüklenince _match_go_rpc ile başlar
	LOADING.close(get_tree(), MAP_SETTLE_FRAMES)
	if NetworkManager.is_host():
		_on_peer_loaded(1)
	else:
		_peer_loaded.rpc_id(1)


## Client → host: haritam yüklendi, oyuncum doğdu
@rpc("any_peer", "reliable")
func _peer_loaded() -> void:
	if NetworkManager.is_host():
		_on_peer_loaded(multiplayer.get_remote_sender_id())


func _on_peer_loaded(peer_id: int) -> void:
	if state != State.IN_GAME:
		return
	if match_live:
		_match_go_rpc.rpc_id(peer_id)  # maç başladıktan sonra yetişen (süre sınırında) — ona da başlat
		return
	_loaded_peers[peer_id] = true
	_send_load_status()
	_check_all_loaded()


## Host: beklenenlerden odada kalan herkes yüklendiyse maçı başlat (yüklerken ayrılan beklenmez)
func _check_all_loaded() -> void:
	if not NetworkManager.is_host() or match_live or state != State.IN_GAME:
		return
	for pid: int in _expected_loaders:
		if NetworkManager.players.has(pid) and not _loaded_peers.has(pid):
			return
	if multiplayer.get_peers().is_empty():
		_match_go_rpc()  # herkes ayrıldı — RPC'siz (bağlı peer yokken rpc hata verir)
	else:
		_match_go_rpc.rpc()


## Host her LOAD_STATUS_INTERVAL'de + her yüklenmede: n/N ve kalan süre → herkesin perdesi
func _send_load_status() -> void:
	var total := 0
	var loaded := 0
	for pid: int in _expected_loaders:
		if NetworkManager.players.has(pid):
			total += 1
			if _loaded_peers.has(pid):
				loaded += 1
	if multiplayer.get_peers().is_empty():
		_load_status_rpc(loaded, total, ceili(_load_wait_left))
	else:
		_load_status_rpc.rpc(loaded, total, ceili(_load_wait_left))


@rpc("authority", "call_local", "unreliable_ordered")
func _load_status_rpc(loaded: int, total: int, seconds_left: int) -> void:
	if match_live or not _local_loaded:
		return  # kendi yüklemesi bitmeyenin perdesi "Harita hazırlanıyor" kalır
	warmup_status.emit(loaded, total, seconds_left)


## Süre doldu: yüklenemeyenleri at, maçı kalanlarla başlat
func _load_timeout() -> void:
	for pid: int in _expected_loaders:
		if pid == 1 or not NetworkManager.players.has(pid) or _loaded_peers.has(pid):
			continue
		var pname: String = NetworkManager.players[pid].get("name", "?")
		NetworkManager._chat_system("%s yüklemeyi zamanında bitiremedi, oyundan atıldı", [pname])
		# Client RPC'yi alınca kendi bağlantısını kapatır → host normal peer_disconnected alır. Tamamen donmuş client'ı
		# ENet zaman aşımı (NetworkManager._relax_timeout, 15-30 s) düşürür. Host'tan disconnect_peer YAPILMAZ:
		# kibar kesme donmuş peer'da "Unable to send packet" spamı, zorla kesme SceneMultiplayer'ı habersiz bırakıyordu.
		_kicked_from_match.rpc_id(pid, "Harita yüklemesi çok uzun sürdü — oyundan atıldın")
	_match_go_rpc.rpc()


## Host → yüklemeyi bitiremeyen client: menüye dön, sebebi ana menüde göster
@rpc("authority", "reliable")
func _kicked_from_match(reason: String) -> void:
	menu_notice = reason
	LOADING.close(get_tree(), 0)
	return_to_menu()


## Maç başlıyor (tüm peer'lar aynı anda): perde kapanır, başlangıç gücü, host kart/kapı
@rpc("authority", "call_local", "reliable")
func _match_go_rpc() -> void:
	if match_live or state != State.IN_GAME or not _local_loaded:
		return
	match_live = true
	LOADING.close(get_tree(), 0)  # zaman aşımı sınırında yetişen peer'ın perdesi hâlâ açık olabilir
	# Isınmadan maça: herkes KENDİ oyuncusunu spawn'ına ışınlar (_apply_respawn call_local — can/mermi/dayanıklılık dolar)
	var me: Variant = active_players.get(NetworkManager.get_local_id())
	if me != null and is_instance_valid(me):
		var team_id: int = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", 0)
		var pos := TeamManager.get_spawn_position(team_id)
		if multiplayer.get_peers().is_empty():
			me._apply_respawn(pos)
		else:
			me._apply_respawn.rpc(pos)
	# Maç başı karaktere özel tek seferlik güç — HER PEER kendi hesaplar (RPC yok). Migration/respawn'da verilmez.
	var powerups := get_tree().current_scene.get_node_or_null("PowerupManager")
	if powerups and powerups.has_method("grant_starting_items"):
		powerups.grant_starting_items()
	if NetworkManager.is_host():
		_spawn_card_and_door()
	emit_signal("game_started")


## İçe aktarılan haritalar (ImportedMap) çarpışma + zemine oturtma için birkaç fizik karesi ister — spawn noktaları,
## kart/kapı ve oyuncu doğmadan önce `map_ready` beklenir. Labirent (Map.gd) bu sinyali taşımaz → beklemeden geçer.
func _wait_map_ready() -> void:
	var scene := get_tree().current_scene
	if scene and scene.has_signal("map_ready") and not bool(scene.get("is_map_ready")):
		await scene.map_ready


## Oda ayarlarında seçili harita (NetworkManager.MAPS) — yüklenemezse varsayılan Map.tscn
func _get_map_scene() -> PackedScene:
	var path: String = NetworkManager.get_map_info()["scene"]
	if ResourceLoader.exists(path):
		var scene := load(path) as PackedScene
		if scene:
			return scene
	return map_scene


func _spawn_local_player() -> void:
	var local_id := NetworkManager.get_local_id()
	var player_data: Dictionary = NetworkManager.players.get(local_id, {})
	var team_id: int = player_data.get("team_id", 0)
	var spawn_pos: Vector3 = TeamManager.get_spawn_position(team_id)
	# Host migration sonrası: kaldığın yerden devam (konum isimle saklanır — peer id'ler değişir)
	var my_name: String = player_data.get("name", "")
	if _pending_positions.has(my_name):
		spawn_pos = _pending_positions[my_name]
		_pending_positions.erase(my_name)

	var player: CharacterBody3D = player_scene.instantiate()
	player.name = "Player_%d" % local_id
	player.set_multiplayer_authority(local_id)
	get_tree().current_scene.add_child(player)
	var character: String = player_data.get("character", "Visioner")
	player.global_position = spawn_pos
	player.initialize(local_id, team_id, character)

	active_players[local_id] = player
	emit_signal("local_player_spawned", player)
	_notify_player_spawned.rpc(local_id, team_id, spawn_pos)
	# Mevcut oyuncuları talep et (migration / geç katılım için)
	if not NetworkManager.is_host():
		_request_active_players.rpc_id(1)


@rpc("any_peer", "call_local", "reliable")
func _notify_player_spawned(peer_id: int, team_id: int, pos: Vector3) -> void:
	if peer_id == NetworkManager.get_local_id():
		return
	if active_players.has(peer_id):
		return
	var player: CharacterBody3D = player_scene.instantiate()
	player.name = "Player_%d" % peer_id
	player.set_multiplayer_authority(peer_id)
	var character: String = NetworkManager.players.get(peer_id, {}).get("character", "Visioner")
	get_tree().current_scene.add_child(player)
	player.global_position = pos
	player.initialize(peer_id, team_id, character)
	active_players[peer_id] = player


## Client, bağlandıktan sonra host'tan mevcut aktif oyuncuları talep eder
@rpc("any_peer", "reliable")
func _request_active_players() -> void:
	if not NetworkManager.is_host():
		return
	var requester := multiplayer.get_remote_sender_id()
	for pid in active_players:
		var p: Node = active_players[pid]
		if not is_instance_valid(p):
			continue
		var pteam: int = NetworkManager.players.get(pid, {}).get("team_id", 0)
		_notify_player_spawned.rpc_id(requester, pid, pteam, p.global_position)


# ─────────────────────────────────────────────
# Kart + Kapı Spawn
# ─────────────────────────────────────────────

func _spawn_card_and_door() -> void:
	# Aday noktalar haritada (Map.tscn → CardPoints / DoorPoints Marker3D'leri) — labirent duvarına denk gelmesin diye
	# rastgele koordinat yerine editörde yerleştirilmiş noktalardan biri seçilir.
	# Adillik: bir takımın doğma noktasına çok yakın aday elenir (Çöl haritasında kapı sarı takımın dibinde çıkıyordu).
	# Hiç aday kalmazsa en uzak olanlar kullanılır (haritada her zaman bir kart/kapı olsun).
	var card_points := _fair_points(_get_marker_positions("CardPoints"), CARD_MIN_FROM_SPAWN)
	var door_points := _fair_points(_get_marker_positions("DoorPoints"), DOOR_MIN_FROM_SPAWN)
	var card_pos: Vector3 = card_points.pick_random() if not card_points.is_empty() else Vector3.ZERO
	var door_pos: Vector3 = door_points.pick_random() if not door_points.is_empty() else Vector3(-44.5, 0.0, -34.5)
	_spawn_objects_rpc.rpc(card_pos, door_pos)


const DOOR_MIN_FROM_SPAWN := 25.0   # kapı: hiçbir takımın spawn'ına bundan yakın olmasın (m)
const CARD_MIN_FROM_SPAWN := 15.0

func _fair_points(points: Array[Vector3], min_dist: float) -> Array[Vector3]:
	var spawns: Array[Vector3] = []
	for t: int in TeamManager.spawn_points:
		for p: Vector3 in TeamManager.spawn_points[t]:
			spawns.append(p)
	if spawns.is_empty() or points.is_empty():
		return points
	var out: Array[Vector3] = []
	var best_d := -1.0
	var best: Array[Vector3] = []
	for p in points:
		var d := INF
		for s in spawns:
			d = minf(d, Vector2(p.x - s.x, p.z - s.z).length())
		if d >= min_dist:
			out.append(p)
		if d > best_d + 0.5:
			best_d = d
			best = [p]
		elif absf(d - best_d) <= 0.5:
			best.append(p)
	return out if not out.is_empty() else best


func _get_marker_positions(group_name: String) -> Array[Vector3]:
	var out: Array[Vector3] = []
	var scene := get_tree().current_scene
	var root := scene.get_node_or_null(group_name)
	if root == null:
		# İçe aktarılan haritalar (ImportedMap): grup GLB'nin alt düğümünde
		root = scene.find_child(group_name, true, false)
	if root == null:
		push_warning("Haritada %s bulunamadı" % group_name)
		return out
	for child in root.get_children():
		# Labirent: Marker3D · GLB haritaları: düz Node3D (rehber: global_position kullan)
		if child is Node3D:
			out.append((child as Node3D).global_position)
	return out


@rpc("authority", "call_local", "reliable")
func _spawn_objects_rpc(card_pos: Vector3, door_pos: Vector3) -> void:
	var card: Node = card_scene.instantiate()
	get_tree().current_scene.add_child(card)
	card.global_position = card_pos
	card_instance = card

	var door: Node = door_scene.instantiate()
	get_tree().current_scene.add_child(door)
	door.global_position = door_pos
	door_instance = door


# ─────────────────────────────────────────────
# Kart Alınması
# ─────────────────────────────────────────────

@rpc("any_peer", "reliable")
func request_card_pickup(picker_peer_id: int) -> void:
	if not NetworkManager.is_host():
		return
	if card_carrier_peer_id != -1:
		return
	handle_card_pickup(picker_peer_id)


func handle_card_pickup(picker_peer_id: int) -> void:
	if not NetworkManager.is_host():
		return
	if card_carrier_peer_id != -1:
		return
	var team_id: int = NetworkManager.players.get(picker_peer_id, {}).get("team_id", -1)
	var player: Node = active_players.get(picker_peer_id)
	var pos: Vector3 = player.global_position if player else Vector3.ZERO
	_apply_card_pickup_rpc.rpc(picker_peer_id, pos, team_id)


@rpc("authority", "call_local", "reliable")
func _apply_card_pickup_rpc(carrier_peer_id: int, carrier_pos: Vector3, carrier_team_id: int) -> void:
	card_carrier_peer_id = carrier_peer_id
	if card_instance and is_instance_valid(card_instance):
		card_instance.hide()
	var player: Node = active_players.get(carrier_peer_id)
	if player:
		player.pick_up_card()
	if carrier_peer_id == NetworkManager.get_local_id():
		gain_xp(XP_CARD_PICKUP, "Kart alındı")
		_xp_carry_timer = 0.0
	emit_signal("card_picked_up", carrier_peer_id, carrier_pos, carrier_team_id)


# ─────────────────────────────────────────────
# Kart Düşürülmesi
# ─────────────────────────────────────────────

func handle_card_drop(drop_pos: Vector3) -> void:
	if not NetworkManager.is_host():
		return
	var carrier_team: int = NetworkManager.players.get(card_carrier_peer_id, {}).get("team_id", -1)
	_apply_card_drop_rpc.rpc(drop_pos, carrier_team)


@rpc("authority", "call_local", "reliable")
func _apply_card_drop_rpc(drop_pos: Vector3, carrier_team_id: int) -> void:
	card_carrier_peer_id = -1
	for player in active_players.values():
		if is_instance_valid(player) and player.has_card:
			player.drop_card()
	if card_instance and is_instance_valid(card_instance):
		card_instance.global_position = drop_pos
		card_instance.show()
	emit_signal("card_dropped", drop_pos, carrier_team_id)


# ─────────────────────────────────────────────
# Kart Teslimatı
# ─────────────────────────────────────────────

## ESKİ: girince anında teslim. Artık teslimat sadece host'un kilit sayacıyla (_update_door_unlock) olur —
## client'ın bu RPC ile kilidi atlaması engellensin diye bilerek etkisiz (RPC imzası uyumluluk için duruyor).
@rpc("any_peer", "reliable")
func request_card_delivery(_carrier_peer_id: int) -> void:
	pass


func handle_card_delivered(carrier_peer_id: int) -> void:
	if not NetworkManager.is_host() or state != State.IN_GAME:
		return
	var team_id: int = NetworkManager.players.get(carrier_peer_id, {}).get("team_id", -1)
	state = State.ENDED
	_end_game_rpc.rpc(team_id)


# ─────────────────────────────────────────────
# Ölüm / Yeniden Doğma
# ─────────────────────────────────────────────

func handle_player_death(dead_peer_id: int, killer_peer_id: int, method: int = 0) -> void:
	if not NetworkManager.is_host():
		return
	var killer_data: Dictionary = NetworkManager.players.get(killer_peer_id, {})
	var killing_team: int = killer_data.get("team_id", -1)
	if killing_team >= 0 and killer_peer_id != dead_peer_id:  # kendi tuzağına basan skora yazılmaz
		TeamManager.add_kill(killing_team)

	_announce_kill_rpc.rpc(killer_peer_id, dead_peer_id, method)

	if card_carrier_peer_id == dead_peer_id:
		var dead_player: Node = active_players.get(dead_peer_id)
		var drop_pos: Vector3 = dead_player.global_position if dead_player else Vector3.ZERO
		handle_card_drop(drop_pos)

	_schedule_respawn(dead_peer_id)


@rpc("authority", "call_local", "reliable")
func _announce_kill_rpc(killer_peer_id: int, victim_peer_id: int, method: int) -> void:
	if not player_stats.has(killer_peer_id):
		player_stats[killer_peer_id] = {"kills": 0, "deaths": 0}
	if not player_stats.has(victim_peer_id):
		player_stats[victim_peer_id] = {"kills": 0, "deaths": 0}
	if killer_peer_id != victim_peer_id:
		player_stats[killer_peer_id]["kills"] += 1
	player_stats[victim_peer_id]["deaths"] += 1
	# Kart düşürme RPC'si bundan SONRA gelir → card_carrier_peer_id hâlâ kurbanı gösteriyor
	if killer_peer_id == NetworkManager.get_local_id() and killer_peer_id != victim_peer_id:
		if card_carrier_peer_id == victim_peer_id:
			gain_xp(XP_KILL + XP_CARRIER_KILL_BONUS, "Kart taşıyıcısı öldürüldü")
		else:
			gain_xp(XP_KILL, "Düşman öldürüldü")
		if method == KILL_BACKSTAB:
			gain_xp(XP_BACKSTAB_BONUS, "Arkadan bıçaklandı")
		elif method == KILL_KNIFE:
			gain_xp(XP_KNIFE_BONUS, "Bıçakla öldürüldü")
	emit_signal("kill_happened", killer_peer_id, victim_peer_id, method)


func _schedule_respawn(dead_peer_id: int) -> void:
	await get_tree().create_timer(3.0).timeout
	var player: Node = active_players.get(dead_peer_id)
	if not is_instance_valid(player):
		return
	var player_data: Dictionary = NetworkManager.players.get(dead_peer_id, {})
	var team_id: int = player_data.get("team_id", 0)
	var spawn_pos: Vector3 = TeamManager.get_spawn_position(team_id)
	player.respawn(spawn_pos)


# ─────────────────────────────────────────────
# Oyun Sonu
# ─────────────────────────────────────────────

func _on_team_won(team_id: int) -> void:
	if not NetworkManager.is_host():
		return
	state = State.ENDED
	_end_game_rpc.rpc(team_id)


## XP/state/sinyal mantığı — _end_game_rpc (normal maç sonu) ve restore_from_migration'daki
## instant_winner dalı (migration sonrası kesinleşmiş zafer) ortak kullanır. RPC DEĞİL: her peer
## kendi yerel kopyasını zaten elindeki bilgiyle (winning_team) çağırır, broadcast'e gerek yok.
func _apply_end_game(winning_team: int) -> void:
	# Maç sonu XP'si game_ended'dan ÖNCE (HUD oyun sonu ekranı match_xp'yi gösterir)
	if not _match_xp_closed:
		_match_xp_closed = true
		gain_xp(XP_MATCH, "Maç tamamlandı")
		var my_team: int = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", -1)
		if my_team >= 0 and my_team == winning_team:
			gain_xp(XP_WIN, "Zafer")
	state = State.ENDED
	emit_signal("game_ended", winning_team)


@rpc("authority", "call_local", "reliable")
func _end_game_rpc(winning_team: int) -> void:
	_apply_end_game(winning_team)
	if NetworkManager.is_host():
		await get_tree().create_timer(RETURN_TO_LOBBY_DELAY).timeout
		_return_to_lobby_rpc.rpc()


## Maç bitince herkes aynı oturumda lobiye geri döner (lobi kapanmaz) — host RETURN_TO_LOBBY_DELAY sonra çağırır.
@rpc("authority", "call_local", "reliable")
func _return_to_lobby_rpc() -> void:
	state = State.LOBBY
	active_players.clear()
	player_stats.clear()
	card_instance = null
	door_instance = null
	card_carrier_peer_id = -1
	door_unlock = 0.0
	match_xp = 0
	_match_xp_closed = false
	_xp_survive_timer = 0.0
	_xp_carry_timer = 0.0
	if NetworkManager.is_host():
		NetworkManager.reset_for_rematch()
	LOADING.open(get_tree(), "LOBİYE DÖNÜLÜYOR", "")
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().change_scene_to_file("res://scenes/ui/Lobby.tscn")
	LOADING.close(get_tree(), MAP_SETTLE_FRAMES)


# ─────────────────────────────────────────────
# Kapı kilidi (host)
# ─────────────────────────────────────────────

func _update_door_unlock(delta: float) -> void:
	var inside := false
	var carrier: Variant = active_players.get(card_carrier_peer_id)
	if card_carrier_peer_id != -1 and carrier != null and is_instance_valid(carrier) and not carrier.is_dead \
			and door_instance and is_instance_valid(door_instance):
		var cp: Vector3 = (carrier as Node3D).global_position
		var dp: Vector3 = (door_instance as Node3D).global_position
		inside = Vector2(cp.x - dp.x, cp.z - dp.z).length() <= DOOR_UNLOCK_RADIUS
	var prev := door_unlock
	door_unlock = minf(door_unlock + delta / DOOR_UNLOCK_TIME, 1.0) if inside else 0.0
	if door_unlock >= 1.0:
		_send_door_unlock(1.0)
		handle_card_delivered(card_carrier_peer_id)
		return
	if door_unlock == prev:
		return
	_door_sync_timer -= delta
	# Başlama / sıfırlanma anı hemen, arada 10 Hz
	if prev == 0.0 or door_unlock == 0.0 or _door_sync_timer <= 0.0:
		_door_sync_timer = DOOR_SYNC_INTERVAL
		_send_door_unlock(door_unlock)


func _send_door_unlock(ratio: float) -> void:
	if multiplayer.get_peers().size() > 0:
		_door_unlock_rpc.rpc(ratio, card_carrier_peer_id)
	else:
		_door_unlock_rpc(ratio, card_carrier_peer_id)


@rpc("authority", "call_local", "reliable")
func _door_unlock_rpc(ratio: float, carrier_peer_id: int) -> void:
	door_unlock = ratio
	door_unlock_changed.emit(ratio, carrier_peer_id)


# ─────────────────────────────────────────────
# XP
# ─────────────────────────────────────────────

## Yerel oyuncuya XP ver (profil kaydedilir). PowerupManager de çağırır (güç alma, Medic iyileştirme).
func gain_xp(amount: int, reason: String) -> void:
	if amount <= 0:
		return
	PROFILE.add_xp(amount)
	match_xp += amount
	xp_gained.emit(amount, reason)


func _process(delta: float) -> void:
	if state != State.IN_GAME:
		return
	if not match_live:
		# Yükleme bekleme: host süreyi sayar, durumu yayar, dolunca yüklenemeyenleri atar
		if NetworkManager.is_host() and _loaded_peers.has(1):
			_load_wait_left -= delta
			_load_status_timer -= delta
			if _load_wait_left <= 0.0:
				_load_timeout()
			elif _load_status_timer <= 0.0:
				_load_status_timer = LOAD_STATUS_INTERVAL
				_send_load_status()
		return
	if NetworkManager.is_host():
		_update_door_unlock(delta)
		if state != State.IN_GAME:
			return
	var me: Variant = active_players.get(NetworkManager.get_local_id())
	if me == null or not is_instance_valid(me) or me.is_dead:
		return
	_xp_survive_timer += delta
	if _xp_survive_timer >= XP_SURVIVE_INTERVAL:
		_xp_survive_timer = 0.0
		gain_xp(XP_SURVIVE, "Hayatta kalma")
	if me.has_card:
		_xp_carry_timer += delta
		if _xp_carry_timer >= XP_CARRY_INTERVAL:
			_xp_carry_timer = 0.0
			gain_xp(XP_CARRY, "Kartı taşıma")


# ─────────────────────────────────────────────
# Oyuncu Bağlantı Kesilmesi (host tarafından çağrılır)
# ─────────────────────────────────────────────

func on_player_disconnected(peer_id: int) -> void:
	# Kart taşıyıcıysa kartı düşür
	if card_carrier_peer_id == peer_id:
		var player: Node = active_players.get(peer_id)
		var drop_pos: Vector3 = player.global_position if player and is_instance_valid(player) else Vector3.ZERO
		handle_card_drop(drop_pos)
	# Player node'unu temizle
	var p: Node = active_players.get(peer_id)
	if p and is_instance_valid(p):
		p.queue_free()
	active_players.erase(peer_id)
	_check_last_team_standing()
	_check_all_loaded()  # yüklerken ayrılan beklenmesin


func _check_last_team_standing() -> void:
	if not NetworkManager.is_host():
		return
	if state != State.IN_GAME:
		return
	var active_teams: Dictionary = {}
	for pid in NetworkManager.players:
		var tid: int = NetworkManager.players[pid].get("team_id", -1)
		if tid >= 0:
			active_teams[tid] = true
	if active_teams.size() == 1:
		state = State.ENDED
		_end_game_rpc.rpc(active_teams.keys()[0])


# ─────────────────────────────────────────────
# Host Migration
# ─────────────────────────────────────────────

## Mevcut oyun durumunun anlık görüntüsü (migration öncesi kaydedilir)
func get_migration_state() -> Dictionary:
	var gstate := { "game_state": state }
	if state != State.IN_GAME:
		return gstate
	# Kart pozisyonu: taşıyıcıda mı yoksa yerde mi?
	var card_pos := Vector3.ZERO
	if card_carrier_peer_id != -1:
		var carrier: Node = active_players.get(card_carrier_peer_id)
		if carrier and is_instance_valid(carrier):
			card_pos = carrier.global_position
	elif card_instance and is_instance_valid(card_instance):
		card_pos = card_instance.global_position
	var door_pos := Vector3.ZERO
	if door_instance and is_instance_valid(door_instance):
		door_pos = door_instance.global_position
	gstate["scores"]   = TeamManager.scores.duplicate()
	gstate["card_pos"] = card_pos
	gstate["door_pos"] = door_pos
	# Oyuncu konumları (isimle; ölüler hariç — onlar spawn noktasında doğar)
	var positions := {}
	for pid in active_players:
		var p: Node = active_players[pid]
		if p and is_instance_valid(p) and not p.is_dead:
			var pname: String = NetworkManager.players.get(pid, {}).get("name", "")
			if not pname.is_empty():
				positions[pname] = (p as Node3D).global_position
	gstate["positions"] = positions
	gstate["stats_by_name"] = _stats_by_name()
	return gstate


func _stats_by_name() -> Dictionary:
	var out := {}
	for pid in player_stats:
		var pname: String = NetworkManager.players.get(pid, {}).get("name", "")
		if not pname.is_empty():
			out[pname] = player_stats[pid].duplicate()
	return out


## Migration sonrası oyunu geri yükle (yeni host + yeniden bağlanan clientlar)
func restore_from_migration(mig: Dictionary) -> void:
	# Migration anında zaten kesinleşmiş kazanan varsa (geriye tek takım kaldı, kimse geri bağlansa
	# da sonuç değişmez) haritayı YENİDEN YÜKLEMEDEN doğrudan zaferi ilan et — client ekranında
	# gereksiz 'YÜKLENİYOR' perdesi hiç görünmesin (HUD zaten canlı, game_ended sinyaline bağlı).
	if mig.has("instant_winner"):
		_apply_end_game(int(mig["instant_winner"]))
		if NetworkManager.is_host():
			await get_tree().create_timer(RETURN_TO_LOBBY_DELAY).timeout
			_return_to_lobby_rpc.rpc()
		return
	door_unlock = 0.0  # kilit ilerlemesi host değişince sıfırdan
	# Skorları geri yükle
	var saved_scores: Dictionary = mig.get("scores", {})
	for tid in saved_scores:
		TeamManager.scores[tid] = int(saved_scores[tid])
	_pending_card_pos = mig.get("card_pos", Vector3.ZERO)
	_pending_door_pos = mig.get("door_pos", Vector3.ZERO)
	_pending_positions = mig.get("positions", {}).duplicate()
	# Kill/ölüm istatistikleri isimle taşınır, yeni peer id'lere geri eşlenir
	_restore_stats_by_name(mig.get("stats_by_name", {}))
	# Oyun durumunu sıfırla — migration'da yükleme beklemesi YOK (maç zaten sürüyordu, herkes kendi yüklenince oynar)
	state = State.IN_GAME
	match_live = true
	_local_loaded = true
	card_carrier_peer_id = -1
	card_instance = null
	door_instance = null
	for p in active_players.values():
		if is_instance_valid(p):
			p.queue_free()
	active_players.clear()
	# Haritayı yeniden yükle
	LOADING.open(get_tree(), "YÜKLENİYOR", "Harita hazırlanıyor")
	get_tree().change_scene_to_packed(_get_map_scene())
	await get_tree().process_frame
	await get_tree().process_frame
	await _wait_map_ready()
	_spawn_local_player()
	LOADING.close(get_tree(), MAP_SETTLE_FRAMES)
	if NetworkManager.is_host():
		# Kart ve kapıyı kaydedilen pozisyona spawn et
		_spawn_objects_rpc.rpc(_pending_card_pos, _pending_door_pos)
	emit_signal("game_started")
	# Buraya gelindiğinde instant_winner yoktu, yani get_migration_remaining_team_count() birden
	# fazlaydı — diğer takımların yeniden bağlanmasını bekle (hemen kontrol edilirse yeni host
	# sadece kendi takımını görüp oyunu anında bitiriyordu)
	if NetworkManager.is_host():
		await get_tree().create_timer(NetworkManager.MIGRATION_WINDOW_MS / 1000.0).timeout
		_check_last_team_standing()


## Host: migration penceresinde yeniden bağlanan oyuncunun istatistiğini yeni peer id'sine taşı
func adopt_migrated_stats(peer_id: int, player_name: String) -> void:
	if _migrated_stats.has(player_name):
		player_stats[peer_id] = (_migrated_stats[player_name] as Dictionary).duplicate()


func _restore_stats_by_name(by_name: Dictionary) -> void:
	_migrated_stats = by_name.duplicate(true)
	player_stats.clear()
	for pid in NetworkManager.players:
		var pname: String = NetworkManager.players[pid].get("name", "")
		if by_name.has(pname):
			player_stats[pid] = (by_name[pname] as Dictionary).duplicate()


func return_to_menu() -> void:
	active_players.clear()
	player_stats.clear()
	card_instance = null
	door_instance = null
	card_carrier_peer_id = -1
	state = State.MENU
	match_live = false
	_local_loaded = false
	NetworkManager.disconnect_all()
	get_tree().change_scene_to_file("res://scenes/main/Main.tscn")
