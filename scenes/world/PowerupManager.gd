## PowerupManager.gd (Map.tscn → "PowerupManager" Node)
## Labirent köşelerinde (Map/PowerupPoints Marker3D'leri) zaman zaman kısa ömürlü güçler belirir.
## Oyuncu üzerinden geçince tek slotluk envanterine alır, Q ile kullanır. Ölünce slot boşalır.
##
## HOST YETKİLİ (GameManager ile aynı kural): spawn zamanlaması, alma, kullanma, bomba hasarı host'ta.
## Client'lar sadece istek yollar (request_pickup / request_use) ve görsel/HUD durumunu RPC ile alır.
##   _spawn_rpc / _despawn_rpc        → Powerup.gd nesneleri (tüm peer'lar)
##   _set_item_rpc(peer, type)        → envanter (herkese; HUD sadece kendini gösterir)
##   _bomb_rpc(...)                   → Bomb.gd görseli (herkese; bomba + flaş), hasar host'ta _detonate'te
##   _reveal_rpc(team, kind, süre)    → uydu: o takımın minimapinde tüm oyuncular + kart taşıyıcı ("all_players") / düşmanlar ("enemies")
## Patlama YEREL etkileri (_on_bomb_exploded, her peer kendi oyuncusu için): yakınlığa göre kamera sarsıntısı
## (CameraController.add_trauma), flaşta görüş hattı + bakış yönüne göre körlük (flashed → HUD beyaz ekran).
## Sinyaller (HUD/Minimap dinler): inventory_changed(type), reveal_started(kind, dur, own_team), notice(text, color), flashed(strength)

extends Node

signal inventory_changed(item_type: int)            # yerel oyuncunun slotu (-1 = boş)
signal reveal_started(kind: String, duration: float, own_team: bool)
signal notice(text: String, color: Color)
signal flashed(strength: float)                     # yerel oyuncu flaşla kör oldu (0..1)
signal trap_rescue_changed(trapped_peer: int, ratio: float, rescuer_peer: int)  # HUD kurtarma barı

enum Type { BOMB, HEAL, INTEL_SAT, ENEMY_SAT, FLASH, SMOKE, TRAP }  # index sabit (Powerup.gd/Minimap sayıyla kullanır) — yeni tip SONA eklenir
const NONE := -1

## Görünüm/isim (HUD, Powerup.gd, Minimap ortak kullanır)
const INFO := {
	Type.BOMB:      {"name": "BOMBA",         "glyph": "✸", "color": Color(1.0, 0.42, 0.22), "desc": "Fareye fırlat, alan hasarı"},
	Type.HEAL:      {"name": "SAĞLIK",        "glyph": "✚", "color": Color(0.35, 0.95, 0.5),  "desc": "+%d can"},
	Type.INTEL_SAT: {"name": "UYDU",          "glyph": "◈", "color": Color(0.3, 0.85, 1.0),   "desc": "Tüm oyuncular + kart taşıyıcı haritada"},
	Type.ENEMY_SAT: {"name": "TAKIM UYDUSU",  "glyph": "◉", "color": Color(0.8, 0.45, 1.0),   "desc": "Düşmanlar haritada"},
	Type.FLASH:     {"name": "FLAŞ BOMBASI",  "glyph": "✦", "color": Color(0.85, 0.93, 1.0),  "desc": "Fareye fırlat, görenleri kör eder"},
	Type.SMOKE:     {"name": "SİS BOMBASI",   "glyph": "≋", "color": Color(0.72, 0.78, 0.86), "desc": "Fareye fırlat, görüşü kapatan sis bulutu"},
	Type.TRAP:      {"name": "TUZAK",         "glyph": "▽", "color": Color(0.55, 0.5, 0.42),  "desc": "Yere bırak, düşmanı yakalar"},
}
## ENEMY_SAT artık doğmaz (tek uydu kararı — INTEL_SAT tüm takımların oyuncularını gösterir); index sabit kaldığı için enum'da duruyor
const WEIGHTS := {Type.BOMB: 22, Type.HEAL: 22, Type.FLASH: 18, Type.SMOKE: 16, Type.INTEL_SAT: 16, Type.TRAP: 14}

## Zamanlama (sn)
const FIRST_SPAWN_DELAY := 12.0
const SPAWN_INTERVAL := Vector2(8.0, 15.0)
const LIFETIME := Vector2(5.0, 10.0)
const MAX_ACTIVE := 3

## Etkiler — yükseltilebilen değerler (iyileştirme, yarıçap, fitil, atış, süre, tuzak...) burada DEĞİL:
## PowerTrees.BASE + kullananın güç ağacı → `_m(peer)` (her peer players listesinden aynı sonucu hesaplar).
const POWER_TREES := preload("res://scenes/profile/PowerTrees.gd")
const BOMB_DAMAGE := 75.0          # merkezde; kenarda PowerTrees "bomb_edge" (%35) oranına düşer — bilerek yükseltilmez
const BOMB_SHAKE_RANGE := 16.0     # bu mesafenin ötesinde sarsıntı yok
const SMOKE_FADE := 3.5            # SmokeCloud seyrelme süresi (radar örtüsü bitişi için)
const HEAL_REGEN_TIME := 4.0       # "Yenilenme" ek canı bu sürede dolar
const HEAL_CRITICAL_RATIO := 0.3   # "Acil Müdahale" bu oranın altındaki cana etki eder
const HEAL_GROUP_RADIUS := 2.5     # "Grup Şifası" iyileştirilene uzaklık
const TRAP_PLACE_DISTANCE := 1.0   # oyuncunun önüne, kısa mesafe (fırlatılmaz, bırakılır)
const TRAP_RESCUE_RADIUS := 2.0
const TRAP_SYNC_INTERVAL := 0.1

## Maç başında karaktere özel TEK SEFERLİK güç (GameManager._begin_actual_game_rpc → grant_starting_items)
const STARTING_ITEMS := {
	"Tank": Type.BOMB, "Visioner": Type.INTEL_SAT, "Runner": Type.BOMB, "Sniper": Type.FLASH, "Medic": Type.HEAL,
}
## Medic sağlığı takım arkadaşına da verebilir: nişan noktasına en yakın, yaralı, menzildeki takım arkadaşı
## (Medic'e uzaklık "heal_medic_range", nişana uzaklık "heal_medic_aim" — PowerTrees)

const USE_KEY := KEY_Q
## Test modu: editörden/debug build'den çalıştırınca açık (F1-F5, bkz _handle_test_key). false yapılırsa tamamen kapanır.
var TEST_MODE := OS.is_debug_build()
## Test (F7): kart + kapı konumunu göster — tamamen yerel (Minimap + ProximityReveal okur)
var test_show_objectives := false
const PICKUP_RANGE := 2.5          # host doğrulaması

const POWERUP_SCRIPT := preload("res://scenes/world/Powerup.gd")
const BOMB_SCRIPT := preload("res://scenes/world/Bomb.gd")
const TRAP_SCRIPT := preload("res://scenes/world/Trap.gd")

## Host + client: id → Powerup node
var _items: Dictionary = {}
## Host + client: peer_id → Type (tek slot)
var inventory: Dictionary = {}
## Yerel: aktif açığa çıkarmalar (kind → bitiş zamanı, sn) — sadece kendi takımımız kullandıysa
var reveal_until: Dictionary = {}
## Host + client: id → Trap node (ground-placed; tetiklenme/kurtarma host _process'te hesaplanır)
var _traps: Dictionary = {}
var _trap_sync_timer := 0.0

## Yerel: "Radar Örtüsü" sis bulutları — içlerindekiler uydu haritasında çizilmez (Minimap hidden_from_satellite)
var _radar_smokes: Array[Dictionary] = []   # {pos, radius, from, until} (sn)

var _points: Array[Vector3] = []
var _next_id := 1
var _spawn_timer := 0.0


func _ready() -> void:
	var root := get_parent().get_node_or_null("PowerupPoints")
	if root:
		for c in root.get_children():
			if c is Marker3D:
				_points.append((c as Marker3D).global_position)
	if _points.is_empty() and not get_parent().has_signal("map_ready"):  # ImportedMap noktaları sonra verir (set_points)
		push_warning("PowerupPoints bulunamadı — güç spawn edilmeyecek")
	_spawn_timer = FIRST_SPAWN_DELAY
	GameManager.kill_happened.connect(_on_kill_happened)
	# Sis dokusu harita yüklenirken hazırlansın (ilk sis bombasında donma olmasın)
	preload("res://scenes/world/SmokeCloud.gd").warm_up()
	# Geç katılan / migration sonrası client: aktif güçleri host'tan iste
	# (biraz beklenir — host'un Map/PowerupManager'ı henüz yüklenmemişse RPC "node bulunamadı" hatası verir)
	if not NetworkManager.is_host() and multiplayer.has_multiplayer_peer():
		await get_tree().create_timer(1.5).timeout
		if is_instance_valid(self) and multiplayer.has_multiplayer_peer() and not NetworkManager.is_host():
			_request_sync.rpc_id(1)


## İçe aktarılan haritalar (ImportedMap) güç noktalarını haritayı tarayıp sonradan üretir
func set_points(points: Array[Vector3]) -> void:
	_points = points.duplicate()


func _process(delta: float) -> void:
	if NetworkManager.is_host() and GameManager.state == GameManager.State.IN_GAME:
		_update_traps(delta)
	if not NetworkManager.is_host() or GameManager.state != GameManager.State.IN_GAME or not GameManager.match_live or _points.is_empty():
		return  # maç başlamadan (yükleme beklemesi) güç doğmaz
	_spawn_timer -= delta
	if _spawn_timer > 0.0:
		return
	_spawn_timer = randf_range(SPAWN_INTERVAL.x, SPAWN_INTERVAL.y)
	if _items.size() >= MAX_ACTIVE:
		return
	# Dolu olmayan ve oyunculara çok yakın olmayan bir köşe seç
	var free: Array[Vector3] = []
	for p in _points:
		if _is_point_free(p):
			free.append(p)
	if free.is_empty():
		return
	var id := _next_id
	_next_id += 1
	_spawn_rpc.rpc(id, _pick_type(), free.pick_random(), randf_range(LIFETIME.x, LIFETIME.y))


## Host-only: her tuzağın ömür/tetikleme/DOT/kurtarma mantığı — _door_unlock ile birebir aynı "yakınlıkla
## dolan, kırılınca sıfırlanan ilerleme" kalıbı, çoğullaştırılmış (id ile).
func _update_traps(delta: float) -> void:
	if _traps.is_empty():
		return
	_trap_sync_timer -= delta
	var do_sync := _trap_sync_timer <= 0.0
	if do_sync:
		_trap_sync_timer = TRAP_SYNC_INTERVAL
	for id: int in _traps.keys():
		var trap: Variant = _traps.get(id)
		if not is_instance_valid(trap):
			_traps.erase(id)
			continue
		if trap.armed:
			var pos: Vector3 = (trap as Node3D).global_position
			for pid: int in GameManager.active_players.keys():
				var pl: Variant = GameManager.active_players.get(pid)
				if pl == null or not is_instance_valid(pl) or pl.is_dead or pl.is_trapped:
					continue
				if _team_of(pid) == trap.team_id:
					continue  # kendi takımı tetikleyemez
				if (pl as Node3D).global_position.distance_to(pos) <= trap.trigger_radius:
					_trap_trigger_rpc.rpc(id, pid)
					break
		else:
			var trapped: Variant = GameManager.active_players.get(trap.trapped_peer)
			if trapped == null or not is_instance_valid(trapped) or trapped.is_dead:
				_trap_despawn_rpc.rpc(id)
				continue
			trap._dot_timer += delta
			if trap._dot_timer >= 1.0:
				trap._dot_timer -= 1.0
				(trapped as Node).take_damage(trap.dot_damage, trap.owner_peer, 1)  # kill tuzağı koyana
			var rescuer := -1
			var pos: Vector3 = (trap as Node3D).global_position
			var trapped_team := _team_of(trap.trapped_peer)
			for pid: int in GameManager.active_players.keys():
				if pid == trap.trapped_peer:
					continue
				var pl: Variant = GameManager.active_players.get(pid)
				if pl == null or not is_instance_valid(pl) or pl.is_dead or _team_of(pid) != trapped_team:
					continue
				if (pl as Node3D).global_position.distance_to(pos) <= TRAP_RESCUE_RADIUS:
					rescuer = pid
					break
			if rescuer != -1:
				trap.rescue_ratio = minf(trap.rescue_ratio + delta / trap.rescue_time, 1.0)
			else:
				trap.rescue_ratio = 0.0
			if trap.rescue_ratio >= 1.0:
				_trap_freed_rpc.rpc(id, rescuer)
			elif do_sync:
				_trap_rescue_sync_rpc.rpc(id, trap.rescue_ratio, rescuer)


func _unhandled_key_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo or ChatBox.is_typing or not GameManager.match_live:
		return
	if TEST_MODE and _handle_test_key(k.physical_keycode):
		get_viewport().set_input_as_handled()
		return
	if k.physical_keycode != USE_KEY:
		return
	var me := _local_player()
	if me == null or me.is_dead or get_item(NetworkManager.get_local_id()) == NONE:
		return
	get_viewport().set_input_as_handled()
	var aim: Vector3 = me._get_aim_target()
	if NetworkManager.is_host():
		_request_use(aim)
	else:
		_request_use.rpc_id(1, aim)


# ─────────────────────────────────────────────
#  TEST MODU (sadece debug build — editörden çalıştırınca; dışa aktarılmış oyunda kapalı)
#  1 bomba · 2 sağlık · 3 uydu · 6 flaş · 8 sis · 9 tuzak → doğrudan envantere (slot doluysa değiştirir)
#  7 → kart + kapı konumunu göster/gizle (yerel, minimap + 3D)
#  5 → önüne rastgele bir güç doğur (yerden almayı denemek için)
#  0 → önüne DÜŞMAN tuzağı kur (takımsız, team -1 — üstüne basıp yakalanmayı tek başına denemek için)
# ─────────────────────────────────────────────

## Rakam tuşları — F tuşları KULLANILMAZ: oyun editör içinde çalışırken F1 yardım, F5 çalıştır, F6 sahne, F7 duraklat,
## F8 DURDUR (oyunu kapatıyordu!) editör kısayolları.
const TEST_KEYS := {KEY_1: Type.BOMB, KEY_2: Type.HEAL, KEY_3: Type.INTEL_SAT, KEY_6: Type.FLASH, KEY_8: Type.SMOKE, KEY_9: Type.TRAP}
const TEST_KEY_SPAWN := KEY_5          # önüne rastgele güç
const TEST_KEY_OBJECTIVES := KEY_7     # kart + kapı göster/gizle
const TEST_KEY_ENEMY_TRAP := KEY_0     # önüne düşman tuzağı


func _handle_test_key(code: Key) -> bool:
	var me := _local_player()
	if me == null or me.is_dead:
		return false
	if TEST_KEYS.has(code):
		if NetworkManager.is_host():
			_request_test_give(TEST_KEYS[code])
		else:
			_request_test_give.rpc_id(1, TEST_KEYS[code])
		return true
	if code == TEST_KEY_OBJECTIVES:
		# Sadece yerel görsel: minimapte kart + kapı, 3D'de ProximityReveal mesafeyi yok sayar
		test_show_objectives = not test_show_objectives
		notice.emit(tr("TEST: kart ve kapı %s") % tr("GÖSTERİLİYOR" if test_show_objectives else "GİZLENDİ"), UITheme.SIGNAL)
		return true
	if code == TEST_KEY_SPAWN:
		var fwd: Vector3 = -(me as Node3D).global_transform.basis.z
		var pos: Vector3 = (me as Node3D).global_position + Vector3(fwd.x, 0, fwd.z).normalized() * 2.5
		if NetworkManager.is_host():
			_request_test_spawn(pos)
		else:
			_request_test_spawn.rpc_id(1, pos)
		return true
	if code == TEST_KEY_ENEMY_TRAP:
		if NetworkManager.is_host():
			_request_test_trap()
		else:
			_request_test_trap.rpc_id(1)
		notice.emit(tr("TEST: önüne düşman tuzağı kuruldu"), UITheme.SIGNAL)
		return true
	return false


@rpc("any_peer", "reliable")
func _request_test_give(type: int) -> void:
	if not NetworkManager.is_host() or not TEST_MODE or not INFO.has(type):
		return  # host da debug build olmalı
	var peer := multiplayer.get_remote_sender_id()
	if peer == 0:
		peer = 1
	_set_item_rpc.rpc(peer, type)


@rpc("any_peer", "reliable")
func _request_test_spawn(pos: Vector3) -> void:
	if not NetworkManager.is_host() or not TEST_MODE:
		return
	var id := _next_id
	_next_id += 1
	_spawn_rpc.rpc(id, _pick_type(), Vector3(pos.x, 0.0, pos.z), 15.0)


## Takımsız (team -1) tuzak: kimsenin takımıyla eşleşmez → isteyen dahil herkes tetikler.
@rpc("any_peer", "reliable")
func _request_test_trap() -> void:
	if not NetworkManager.is_host() or not TEST_MODE:
		return
	var peer := multiplayer.get_remote_sender_id()
	if peer == 0:
		peer = 1
	var player: Variant = GameManager.active_players.get(peer)
	if player == null or not is_instance_valid(player) or player.is_dead:
		return
	_place_trap(peer, -1, player as Node3D)


# ─────────────────────────────────────────────
#  Yardımcılar
# ─────────────────────────────────────────────

func get_item(peer_id: int) -> int:
	return inventory.get(peer_id, NONE)


func is_revealed(kind: String) -> bool:
	return reveal_until.get(kind, 0.0) > Time.get_ticks_msec() / 1000.0


func _local_player() -> Node:
	var p: Variant = GameManager.active_players.get(NetworkManager.get_local_id())
	return p if p != null and is_instance_valid(p) else null


func _local_team() -> int:
	return NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", -1)


func _pick_type() -> int:
	var total := 0
	for t: int in WEIGHTS:
		total += WEIGHTS[t]
	var roll := randi() % total
	for t: int in WEIGHTS:
		roll -= WEIGHTS[t]
		if roll < 0:
			return t
	return Type.HEAL


func _is_point_free(p: Vector3) -> bool:
	for item in _items.values():
		if is_instance_valid(item) and (item as Node3D).global_position.distance_to(p) < 1.0:
			return false
	for pl in GameManager.active_players.values():
		if is_instance_valid(pl) and (pl as Node3D).global_position.distance_to(p) < 4.0:
			return false
	return true


func _team_of(peer_id: int) -> int:
	return NetworkManager.players.get(peer_id, {}).get("team_id", -1)


# ─────────────────────────────────────────────
#  Spawn / despawn (herkes)
# ─────────────────────────────────────────────

@rpc("authority", "call_local", "reliable")
func _spawn_rpc(id: int, type: int, pos: Vector3, lifetime: float) -> void:
	if _items.has(id):
		return
	var item: Area3D = POWERUP_SCRIPT.new()
	item.setup(self, id, type, lifetime)
	get_parent().add_child(item)
	item.global_position = pos
	_items[id] = item
	if NetworkManager.is_host():
		_expire_later(id, lifetime)


func _expire_later(id: int, lifetime: float) -> void:
	await get_tree().create_timer(lifetime).timeout
	if is_instance_valid(self) and _items.has(id):
		_despawn_rpc.rpc(id)


@rpc("authority", "call_local", "reliable")
func _despawn_rpc(id: int) -> void:
	var item: Variant = _items.get(id)
	_items.erase(id)
	if item != null and is_instance_valid(item):
		(item as Node).queue_free()


@rpc("any_peer", "reliable")
func _request_sync() -> void:
	if not NetworkManager.is_host():
		return
	var requester := multiplayer.get_remote_sender_id()
	for id: int in _items:
		var item: Node3D = _items[id]
		if is_instance_valid(item):
			_spawn_rpc.rpc_id(requester, id, item.get("item_type"), item.global_position, item.get("time_left"))
	for pid: int in inventory:
		_set_item_rpc.rpc_id(requester, pid, inventory[pid], false, true)  # senkron — bildirim yok
	for id: int in _traps:
		var trap: Variant = _traps[id]
		if not is_instance_valid(trap):
			continue
		_trap_spawn_rpc.rpc_id(requester, id, (trap as Node3D).global_position, trap.team_id, trap.owner_peer)
		if not trap.armed:
			_trap_trigger_rpc.rpc_id(requester, id, trap.trapped_peer)
			_trap_rescue_sync_rpc.rpc_id(requester, id, trap.rescue_ratio, -1)


# ─────────────────────────────────────────────
#  Alma — Powerup.gd yerel oyuncu girince çağırır
# ─────────────────────────────────────────────

func local_touched(id: int) -> void:
	if get_item(NetworkManager.get_local_id()) != NONE:
		return  # slot dolu
	if NetworkManager.is_host():
		_request_pickup(id)
	else:
		_request_pickup.rpc_id(1, id)


@rpc("any_peer", "reliable")
func _request_pickup(id: int) -> void:
	if not NetworkManager.is_host():
		return
	var peer := multiplayer.get_remote_sender_id()
	if peer == 0:
		peer = 1
	var item: Variant = _items.get(id)
	var player: Variant = GameManager.active_players.get(peer)
	if item == null or not is_instance_valid(item) or player == null or not is_instance_valid(player):
		return
	if player.is_dead or get_item(peer) != NONE:
		return
	if (player as Node3D).global_position.distance_to((item as Node3D).global_position) > PICKUP_RANGE:
		return
	var type: int = item.get("item_type")
	_despawn_rpc.rpc(id)
	_set_item_rpc.rpc(peer, type, true)


## picked_up: yerden toplandı (XP verilir) — başlangıç gücü / test / temizleme false
## silent: bildirim bandı yok (başlangıç gücü slotta sessizce doğar)
@rpc("authority", "call_local", "reliable")
func _set_item_rpc(peer_id: int, type: int, picked_up: bool = false, silent: bool = false) -> void:
	if type == NONE:
		inventory.erase(peer_id)
	else:
		inventory[peer_id] = type
	if peer_id == NetworkManager.get_local_id():
		if picked_up:
			GameManager.gain_xp(GameManager.XP_POWERUP, "Güç toplandı")
		inventory_changed.emit(type)
		if type != NONE and not silent:
			notice.emit(tr("%s %s alındı  ·  [Q] kullan") % [INFO[type]["glyph"], tr(INFO[type]["name"])], Color(INFO[type]["color"]))


## Maç başında her oyuncuya karakterine göre bir güç (GameManager._begin_actual_game_rpc, TÜM peer'larda).
## RPC yok: herkes aynı players listesinden aynı sonucu YEREL hesaplar → oyun başlar başlamaz slotta, host'un
## envanteri de aynı (kullanım host'ta doğrulanır). Sadece maç başı bir kez.
func grant_starting_items() -> void:
	for pid: int in NetworkManager.players:
		var character: String = NetworkManager.players[pid].get("character", "")
		if STARTING_ITEMS.has(character) and get_item(pid) == NONE:
			_set_item_rpc(pid, STARTING_ITEMS[character], false, true)  # yerel çağrı (rpc değil), bildirimsiz


func _on_kill_happened(_killer: int, victim: int, _method: int) -> void:
	# Ölünce slot boşalır (host karar verir)
	if NetworkManager.is_host() and get_item(victim) != NONE:
		_set_item_rpc.rpc(victim, NONE)


# ─────────────────────────────────────────────
#  Kullanma (host)
# ─────────────────────────────────────────────

@rpc("any_peer", "reliable")
func _request_use(aim: Vector3) -> void:
	if not NetworkManager.is_host():
		return
	var peer := multiplayer.get_remote_sender_id()
	if peer == 0:
		peer = 1
	var type := get_item(peer)
	var player: Variant = GameManager.active_players.get(peer)
	if type == NONE or player == null or not is_instance_valid(player) or player.is_dead:
		return
	_set_item_rpc.rpc(peer, NONE)
	var team := _team_of(peer)
	var m := _m(peer)
	match type:
		Type.HEAL:
			_use_heal(peer, team, player, aim, m)
		Type.BOMB:
			_throw_bomb(peer, team, player as Node3D, aim, false)
		Type.FLASH:
			_throw_bomb(peer, team, player as Node3D, aim, true)
		Type.SMOKE:
			_throw_bomb(peer, team, player as Node3D, aim, false, true)
		Type.INTEL_SAT, Type.ENEMY_SAT:
			# Tek uydu: tüm takımların oyuncuları + kart taşıyıcı (kart/kapı konumu GÖSTERİLMEZ) — Minimap._draw_satellite_reveals
			_reveal_rpc.rpc(team, "all_players", float(m["sat_duration"]), peer)
		Type.TRAP:
			_place_trap(peer, team, player as Node3D)


## Kullananın güç ağacı değerleri (PowerTrees.BASE + açılmış düğümler)
func _m(peer: int) -> Dictionary:
	return POWER_TREES.mods_for(peer)


## Sağlık (host): Medic hedef seçer; kritik canda "Acil Müdahale" çarpanı, "Yenilenme" ek can 4 sn'ye yayılır,
## "Grup Şifası" iyileştirilenin yakınındaki takım arkadaşlarına oranında verir.
func _use_heal(peer: int, team: int, player: Node, aim: Vector3, m: Dictionary) -> void:
	var target: Node = player
	if player.character_type == "Medic":
		target = _medic_heal_target(peer, team, player as Node3D, aim, m)
	var amount: float = m["heal_amount"]
	if target.health < target.max_health * HEAL_CRITICAL_RATIO:
		amount *= float(m["heal_critical"])
	_heal(target, amount)
	if float(m["heal_regen"]) > 0.0:
		_heal_over_time(target, float(m["heal_regen"]))
	if float(m["heal_group"]) > 0.0:
		for pid: int in GameManager.active_players:
			var pl: Variant = GameManager.active_players[pid]
			if pl == null or not is_instance_valid(pl) or pl == target or pl.is_dead or _team_of(pid) != team:
				continue
			if (pl as Node3D).global_position.distance_to((target as Node3D).global_position) <= HEAL_GROUP_RADIUS:
				_heal(pl, amount * float(m["heal_group"]))
	if target != player:
		_medic_heal_rpc.rpc(peer, target.peer_id, int(round(amount)))


func _heal(target: Node, amount: float) -> void:
	if target.is_dead or target.health >= target.max_health:
		return
	target.health = minf(target.health + amount, target.max_health)
	target._sync_health.rpc(target.health)


func _heal_over_time(target: Node, total: float) -> void:
	var ticks := int(HEAL_REGEN_TIME)
	for i in ticks:
		await get_tree().create_timer(1.0).timeout
		if not is_instance_valid(self) or not is_instance_valid(target):
			return
		_heal(target, total / ticks)


## Medic: nişan noktasına en yakın yaralı takım arkadaşı (Medic'e ≤ heal_medic_range, nişana ≤ heal_medic_aim).
## Nişanda kimse yoksa: Medic yaralıysa kendisi, değilse menzildeki en yaralı takım arkadaşı, o da yoksa kendisi.
func _medic_heal_target(peer: int, team: int, medic: Node3D, aim: Vector3, m: Dictionary) -> Node:
	var aimed: Node = null
	var aimed_d: float = m["heal_medic_aim"]
	var weakest: Node = null
	var weakest_ratio := 1.0
	for pid: int in GameManager.active_players:
		var pl: Variant = GameManager.active_players[pid]
		if pid == peer or pl == null or not is_instance_valid(pl) or pl.is_dead or _team_of(pid) != team:
			continue
		if pl.health >= pl.max_health:
			continue
		var pos := (pl as Node3D).global_position
		if pos.distance_to(medic.global_position) > float(m["heal_medic_range"]):
			continue
		var d := Vector2(pos.x - aim.x, pos.z - aim.z).length()
		if d <= aimed_d:
			aimed_d = d
			aimed = pl
		var ratio: float = pl.health / maxf(pl.max_health, 1.0)
		if ratio < weakest_ratio:
			weakest_ratio = ratio
			weakest = pl
	if aimed:
		return aimed
	if medic.get("health") < medic.get("max_health") or weakest == null:
		return medic
	return weakest


@rpc("authority", "call_local", "reliable")
func _medic_heal_rpc(medic_peer: int, target_peer: int, amount: int) -> void:
	var me := NetworkManager.get_local_id()
	var medic_name: String = NetworkManager.players.get(medic_peer, {}).get("name", "?")
	var target_name: String = NetworkManager.players.get(target_peer, {}).get("name", "?")
	var col: Color = INFO[Type.HEAL]["color"]
	if me == medic_peer:
		notice.emit(tr("✚ %s iyileştirildi (+%d)") % [target_name, amount], col)
		GameManager.gain_xp(GameManager.XP_HEAL_ALLY, "Takım arkadaşı iyileştirildi")
	elif me == target_peer:
		notice.emit(tr("✚ MEDIC %s seni iyileştirdi") % medic_name, col)


func _throw_bomb(peer: int, team: int, player: Node3D, aim: Vector3, flash: bool, smoke: bool = false) -> void:
	var m := _m(peer)
	var max_throw: float = m["flash_throw"] if flash else (m["smoke_throw"] if smoke else m["bomb_throw"])
	var from := player.global_position + Vector3(0, 1.2, 0)
	var flat := Vector3(aim.x - from.x, 0.0, aim.z - from.z)
	if flat.length() > max_throw:
		flat = flat.normalized() * max_throw
	var target := Vector3(from.x + flat.x, 0.15, from.z + flat.z)
	# Duvara çarparsa duvarın önüne düşer
	var space := player.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, Vector3(target.x, from.y, target.z), 1)   # 1: sadece dünya (su kenarı engeli hariç)
	q.exclude = _player_rids()
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		var back: Vector3 = (hit["position"] as Vector3) - flat.normalized() * 0.4
		target = Vector3(back.x, 0.15, back.z)
	var id := _next_id
	_next_id += 1
	_bomb_rpc.rpc(id, from, target, team, peer, flash, smoke)
	if not flash and not smoke:
		_detonate_later(peer, team, target)  # flaş/sis hasarsız — etkileri her peer'da yerel


func _detonate_later(peer: int, team: int, pos: Vector3) -> void:
	var m := _m(peer)
	var radius: float = m["bomb_radius"]
	await get_tree().create_timer(float(m["bomb_flight"]) + float(m["bomb_fuse"])).timeout
	if not is_instance_valid(self) or GameManager.state != GameManager.State.IN_GAME:
		return
	var space := (get_parent() as Node3D).get_world_3d().direct_space_state
	var center := pos + Vector3(0, 0.6, 0)
	for pid: int in GameManager.active_players.keys():
		var pl: Variant = GameManager.active_players.get(pid)
		if pl == null or not is_instance_valid(pl) or pl.is_dead:
			continue
		if pid == peer or _team_of(pid) == team:
			continue  # dost ateşi / kendine hasar yok
		var target_pos := (pl as Node3D).global_position + Vector3(0, 0.9, 0)
		var d := center.distance_to(target_pos)
		if d > radius:
			continue
		# Duvar arkası korunur (oyuncuları yok say, sadece duvar/zemin)
		var q := PhysicsRayQueryParameters3D.create(center, target_pos, 1)
		q.exclude = _player_rids()
		if not space.intersect_ray(q).is_empty():
			continue
		var dmg := BOMB_DAMAGE * lerpf(1.0, float(m["bomb_edge"]), d / radius)
		pl.take_damage(dmg, peer, 1)  # Player.DAMAGE_EXPLOSION — çömelme bombadan korumaz


func _player_rids() -> Array[RID]:
	var out: Array[RID] = []
	for pl in GameManager.active_players.values():
		if is_instance_valid(pl):
			out.append((pl as CollisionObject3D).get_rid())
	return out


@rpc("authority", "call_local", "reliable")
func _bomb_rpc(_id: int, from: Vector3, target: Vector3, team: int, thrower: int = -1, flash: bool = false, smoke: bool = false) -> void:
	# Fırlatanın el bombası atma animasyonu (her peer'da)
	var pl: Variant = GameManager.active_players.get(thrower)
	if pl != null and is_instance_valid(pl) and pl.has_method("play_action"):
		pl.play_action(1)  # Player.Action.TOSS
	# Atanın güç ağacı değerleri — her peer aynı players listesinden aynı sonucu bulur (RPC'ye ek alan gerekmez)
	var m := _m(thrower)
	var bomb: Node3D = BOMB_SCRIPT.new()
	bomb.is_flash = flash
	bomb.is_smoke = smoke
	bomb.smoke_radius = m["smoke_radius"]
	bomb.smoke_duration = m["smoke_duration"]
	var flight: float = m["bomb_flight"] if not flash and not smoke else 0.55
	var fuse: float = m["flash_fuse"] if flash else (m["smoke_fuse"] if smoke else m["bomb_fuse"])
	bomb.setup(from, target, flight, fuse, m["bomb_radius"], TeamManager.get_color(team))
	bomb.exploded.connect(_on_bomb_exploded.bind(thrower, team))
	get_parent().add_child(bomb)
	if smoke and float(m["smoke_radar"]) > 0.0:
		var now := Time.get_ticks_msec() / 1000.0
		var start := now + flight + fuse
		_radar_smokes.append({"pos": target, "radius": float(m["smoke_radius"]), "from": start,
			"until": start + float(m["smoke_duration"]) + SMOKE_FADE * 0.5})


## HUD kurtarma barı: yakalanmış oyuncunun tuzağının kurtarma süresi (koyanın "Sıkı Kenet" düğümüne göre)
func trap_rescue_time(trapped_peer: int) -> float:
	for trap: Variant in _traps.values():
		if is_instance_valid(trap) and trap.trapped_peer == trapped_peer:
			return trap.rescue_time
	return float(POWER_TREES.BASE["trap_rescue"])


## "Radar Örtüsü": bu konum aktif bir radar sisinin içinde mi (Minimap uydu çizimi sorar — yerel)
func hidden_from_satellite(pos: Vector3) -> bool:
	if _radar_smokes.is_empty():
		return false
	var now := Time.get_ticks_msec() / 1000.0
	_radar_smokes = _radar_smokes.filter(func(s: Dictionary) -> bool: return now < float(s["until"]))
	for s: Dictionary in _radar_smokes:
		if now >= float(s["from"]) and Vector2(pos.x - s["pos"].x, pos.z - s["pos"].z).length() <= float(s["radius"]):
			return true
	return false


## Patlamanın yerel oyuncuya etkisi (her peer kendisi için, sadece görsel):
##  bomba → yakınlığa göre ekran sarsıntısı (hasar/kırmızılık host'tan _sync_health ile gelir)
##  flaş  → görüş hattı varsa mesafe + bakış yönüne göre körlük (flashed sinyali → HUD), hafif sarsıntı.
##          Atanın ağacı: yarıçap, şiddet, kendine ("Göz Kırpma") / takımına ("Dost Uyarısı") körlük çarpanı.
func _on_bomb_exploded(pos: Vector3, flash: bool, thrower: int, thrower_team: int) -> void:
	var me := _local_player()
	if me == null or me.is_dead:
		return
	var m := _m(thrower)
	var my_pos := (me as Node3D).global_position
	var d := Vector2(my_pos.x - pos.x, my_pos.z - pos.z).length()
	var cam := get_viewport().get_camera_3d()
	if not flash:
		var shake := clampf(1.0 - d / BOMB_SHAKE_RANGE, 0.0, 1.0)
		if d < float(m["bomb_radius"]):
			shake = maxf(shake, 0.9)
		if shake > 0.0 and cam and cam.has_method("add_trauma"):
			cam.add_trauma(shake * 0.85)
		return

	var flash_radius: float = m["flash_radius"]
	if cam and cam.has_method("add_trauma"):
		cam.add_trauma(clampf(1.0 - d / flash_radius, 0.0, 1.0) * 0.3)
	if d > flash_radius:
		return
	# Duvar arkasındaysa etkilenmez
	var eye := my_pos + Vector3(0, 1.5, 0)
	var src := pos + Vector3(0, 0.5, 0)
	var q := PhysicsRayQueryParameters3D.create(src, eye, 1)
	q.exclude = _player_rids()
	if not (me as Node3D).get_world_3d().direct_space_state.intersect_ray(q).is_empty():
		return
	# Flaşa bakıyorsan tam, sırtın dönükse ~%35
	var fwd := -(me as Node3D).global_transform.basis.z
	var to_flash := Vector3(pos.x - my_pos.x, 0, pos.z - my_pos.z)
	var facing := 1.0 if to_flash.length() < 0.5 else (Vector3(fwd.x, 0, fwd.z).normalized().dot(to_flash.normalized()) + 1.0) * 0.5
	var strength := pow(1.0 - d / flash_radius, 0.6) * lerpf(0.35, 1.0, facing) * float(m["flash_strength"])
	if NetworkManager.get_local_id() == thrower:
		strength *= float(m["flash_self"])
	elif _local_team() == thrower_team:
		strength *= float(m["flash_team"])
	flashed.emit(strength)  # "Derin Körlük" 1.0'ı aşabilir → HUD körlüğü daha uzun tutar


@rpc("authority", "call_local", "reliable")
func _reveal_rpc(team: int, kind: String, duration: float, user_peer: int) -> void:
	var local_team := _local_team()
	var user_name: String = NetworkManager.players.get(user_peer, {}).get("name", "?")
	if team == local_team:
		reveal_until[kind] = Time.get_ticks_msec() / 1000.0 + duration
		reveal_started.emit(kind, duration, true)
		var txt := "◈ UYDU (%s): tüm oyuncular haritada" if kind == "all_players" else "◉ TAKIM UYDUSU (%s): düşmanlar haritada"
		notice.emit(tr(txt) % user_name, Color(INFO[Type.INTEL_SAT if kind == "all_players" else Type.ENEMY_SAT]["color"]))
	elif kind == "enemies" or kind == "all_players":
		reveal_started.emit(kind, duration, false)
		notice.emit(tr("⚠ %s TAKIM UYDUSU KONUMUNUZU TESPİT ETTİ!") % TeamManager.get_team_name(team).to_upper(), UITheme.DANGER)


# ─────────────────────────────────────────────
#  Tuzak (Ayı kapanı) — yerleştirme/tetikleme/kurtarma host'ta, görsel herkeste
# ─────────────────────────────────────────────

func _place_trap(peer: int, team: int, player: Node3D) -> void:
	var from := player.global_position + Vector3(0, 1.0, 0)
	var fwd := -player.global_transform.basis.z
	var flat := Vector3(fwd.x, 0.0, fwd.z).normalized() * TRAP_PLACE_DISTANCE
	var target := Vector3(from.x + flat.x, 0.1, from.z + flat.z)
	var space := player.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, Vector3(target.x, from.y, target.z), 1)
	q.exclude = _player_rids()
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		var back: Vector3 = (hit["position"] as Vector3) - flat.normalized() * 0.3
		target = Vector3(back.x, 0.1, back.z)
	var id := _next_id
	_next_id += 1
	_trap_spawn_rpc.rpc(id, target, team, peer)
	notice.emit(tr("▽ Tuzak yere bırakıldı"), Color(INFO[Type.TRAP]["color"]))


@rpc("authority", "call_local", "reliable")
func _trap_spawn_rpc(id: int, pos: Vector3, team: int, owner_peer: int) -> void:
	if _traps.has(id):
		return
	var trap: Variant = TRAP_SCRIPT.new()
	trap.setup(self, id, team, owner_peer)
	get_parent().add_child(trap)
	(trap as Node3D).global_position = pos
	trap._dot_timer = 0.0
	_traps[id] = trap


@rpc("authority", "call_local", "reliable")
func _trap_despawn_rpc(id: int) -> void:
	var trap: Variant = _traps.get(id)
	_traps.erase(id)
	if trap != null and is_instance_valid(trap):
		(trap as Node).queue_free()


@rpc("authority", "call_local", "reliable")
func _trap_trigger_rpc(id: int, trapped_peer: int) -> void:
	var trap: Variant = _traps.get(id)
	if trap == null or not is_instance_valid(trap):
		return
	trap.armed = false
	trap.trapped_peer = trapped_peer
	trap.rescue_ratio = 0.0
	if trap.has_method("spring_shut"):
		trap.spring_shut()
	var pl: Variant = GameManager.active_players.get(trapped_peer)
	if pl != null and is_instance_valid(pl) and pl.has_method("set_trapped"):
		pl.set_trapped(true)
	var me := NetworkManager.get_local_id()
	var trapped_name: String = NetworkManager.players.get(trapped_peer, {}).get("name", "?")
	var col: Color = INFO[Type.TRAP]["color"]
	if me == trapped_peer:
		notice.emit(tr("⚠ TUZAĞA YAKALANDIN! Takım arkadaşın gelsin"), UITheme.DANGER)
	elif _team_of(trapped_peer) == _local_team():
		notice.emit(tr("⚠ %s TUZAĞA YAKALANDI! Kurtar") % trapped_name, UITheme.DANGER)
	elif _team_of(me) == trap.team_id:
		notice.emit(tr("🪤 Tuzağınız %s'ı yakaladı!") % trapped_name, col)


@rpc("authority", "call_local", "reliable")
func _trap_rescue_sync_rpc(id: int, ratio: float, rescuer_peer: int) -> void:
	var trap: Variant = _traps.get(id)
	if trap != null and is_instance_valid(trap):
		trap.rescue_ratio = ratio
	trap_rescue_changed.emit(trap.trapped_peer if trap != null and is_instance_valid(trap) else -1, ratio, rescuer_peer)


@rpc("authority", "call_local", "reliable")
func _trap_freed_rpc(id: int, rescuer_peer: int) -> void:
	var trap: Variant = _traps.get(id)
	var trapped_peer: int = trap.trapped_peer if trap != null and is_instance_valid(trap) else -1
	var pl: Variant = GameManager.active_players.get(trapped_peer)
	if pl != null and is_instance_valid(pl) and pl.has_method("set_trapped"):
		pl.set_trapped(false)
	_traps.erase(id)
	if trap != null and is_instance_valid(trap):
		(trap as Node).queue_free()
	trap_rescue_changed.emit(trapped_peer, 0.0, -1)
	var me := NetworkManager.get_local_id()
	var trapped_name: String = NetworkManager.players.get(trapped_peer, {}).get("name", "?")
	if me == rescuer_peer:
		GameManager.gain_xp(GameManager.XP_TRAP_RESCUE, "Takım arkadaşı kurtarıldı")
		notice.emit(tr("✓ %s KURTARILDI") % trapped_name, Color(INFO[Type.TRAP]["color"]))
	elif _team_of(trapped_peer) == _local_team():
		notice.emit(tr("✓ %s KURTARILDI") % trapped_name, Color(INFO[Type.TRAP]["color"]))
