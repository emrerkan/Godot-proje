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

enum Type { BOMB, HEAL, INTEL_SAT, ENEMY_SAT, FLASH, SMOKE }  # index sabit (Powerup.gd/Minimap sayıyla kullanır)
const NONE := -1

## Görünüm/isim (HUD, Powerup.gd, Minimap ortak kullanır)
const INFO := {
	Type.BOMB:      {"name": "BOMBA",         "glyph": "✸", "color": Color(1.0, 0.42, 0.22), "desc": "Fareye fırlat, alan hasarı"},
	Type.HEAL:      {"name": "SAĞLIK",        "glyph": "✚", "color": Color(0.35, 0.95, 0.5),  "desc": "+%d can"},
	Type.INTEL_SAT: {"name": "UYDU",          "glyph": "◈", "color": Color(0.3, 0.85, 1.0),   "desc": "Tüm oyuncular + kart taşıyıcı haritada"},
	Type.ENEMY_SAT: {"name": "TAKIM UYDUSU",  "glyph": "◉", "color": Color(0.8, 0.45, 1.0),   "desc": "Düşmanlar haritada"},
	Type.FLASH:     {"name": "FLAŞ BOMBASI",  "glyph": "✦", "color": Color(0.85, 0.93, 1.0),  "desc": "Fareye fırlat, görenleri kör eder"},
	Type.SMOKE:     {"name": "SİS BOMBASI",   "glyph": "≋", "color": Color(0.72, 0.78, 0.86), "desc": "Fareye fırlat, görüşü kapatan sis bulutu"},
}
const WEIGHTS := {Type.BOMB: 22, Type.HEAL: 22, Type.FLASH: 18, Type.SMOKE: 16, Type.INTEL_SAT: 11, Type.ENEMY_SAT: 11}

## Zamanlama (sn)
const FIRST_SPAWN_DELAY := 12.0
const SPAWN_INTERVAL := Vector2(8.0, 15.0)
const LIFETIME := Vector2(5.0, 10.0)
const MAX_ACTIVE := 3

## Etkiler
const HEAL_AMOUNT := 60.0
const BOMB_DAMAGE := 75.0          # merkezde; kenarda %35'e düşer
const BOMB_RADIUS := 4.0
const BOMB_MAX_THROW := 12.0
const BOMB_FLIGHT := 0.55
const BOMB_FUSE := 1.2             # yere düştükten sonra
const BOMB_SHAKE_RANGE := 16.0     # bu mesafenin ötesinde sarsıntı yok
const FLASH_FUSE := 0.8
const FLASH_RADIUS := 11.0         # görüş hattı varsa bu mesafeye kadar kör eder (atan + takımı dahil!)
const SMOKE_FUSE := 0.4            # yere düştükten sonra duman çıkana kadar
const SMOKE_RADIUS := 6.0          # duman bulutu yarıçapı (koridor ~4 m — kavşağı da kapatır)
const SMOKE_DURATION := 15.0       # duman tam yoğunlukta ne kadar kalır (sonra ~3.5 sn'de seyrelir)
const INTEL_DURATION := 8.0
const ENEMY_SAT_DURATION := 6.0

## Maç başında karaktere özel TEK SEFERLİK güç (GameManager._begin_actual_game_rpc → grant_starting_items)
const STARTING_ITEMS := {
	"Tank": Type.BOMB, "Visioner": Type.INTEL_SAT, "Runner": Type.BOMB, "Sniper": Type.FLASH, "Medic": Type.HEAL,
}
## Medic sağlığı takım arkadaşına da verebilir: nişan noktasına en yakın, yaralı, menzildeki takım arkadaşı
const MEDIC_HEAL_RANGE := 6.0      # Medic'e uzaklık
const MEDIC_AIM_RADIUS := 2.5      # nişan noktasına uzaklık

const USE_KEY := KEY_Q
## Test modu: editörden/debug build'den çalıştırınca açık (F1-F5, bkz _handle_test_key). false yapılırsa tamamen kapanır.
var TEST_MODE := OS.is_debug_build()
## Test (F7): kart + kapı konumunu göster — tamamen yerel (Minimap + ProximityReveal okur)
var test_show_objectives := false
const PICKUP_RANGE := 2.5          # host doğrulaması

const POWERUP_SCRIPT := preload("res://scenes/world/Powerup.gd")
const BOMB_SCRIPT := preload("res://scenes/world/Bomb.gd")

## Host + client: id → Powerup node
var _items: Dictionary = {}
## Host + client: peer_id → Type (tek slot)
var inventory: Dictionary = {}
## Yerel: aktif açığa çıkarmalar (kind → bitiş zamanı, sn) — sadece kendi takımımız kullandıysa
var reveal_until: Dictionary = {}

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
	if not NetworkManager.is_host() or GameManager.state != GameManager.State.IN_GAME or _points.is_empty():
		return
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


func _unhandled_key_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo or ChatBox.is_typing:
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
#  1 bomba · 2 sağlık · 3 uydu · 4 takım uydusu · 6 flaş · 8 sis → doğrudan envantere (slot doluysa değiştirir)
#  7 → kart + kapı konumunu göster/gizle (yerel, minimap + 3D)
#  5 → önüne rastgele bir güç doğur (yerden almayı denemek için)
# ─────────────────────────────────────────────

## Rakam tuşları — F tuşları KULLANILMAZ: oyun editör içinde çalışırken F1 yardım, F5 çalıştır, F6 sahne, F7 duraklat,
## F8 DURDUR (oyunu kapatıyordu!) editör kısayolları.
const TEST_KEYS := {KEY_1: Type.BOMB, KEY_2: Type.HEAL, KEY_3: Type.INTEL_SAT, KEY_4: Type.ENEMY_SAT, KEY_6: Type.FLASH, KEY_8: Type.SMOKE}
const TEST_KEY_SPAWN := KEY_5          # önüne rastgele güç
const TEST_KEY_OBJECTIVES := KEY_7     # kart + kapı göster/gizle


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
		notice.emit("TEST: kart ve kapı %s" % ("GÖSTERİLİYOR" if test_show_objectives else "GİZLENDİ"), UITheme.SIGNAL)
		return true
	if code == TEST_KEY_SPAWN:
		var fwd: Vector3 = -(me as Node3D).global_transform.basis.z
		var pos: Vector3 = (me as Node3D).global_position + Vector3(fwd.x, 0, fwd.z).normalized() * 2.5
		if NetworkManager.is_host():
			_request_test_spawn(pos)
		else:
			_request_test_spawn.rpc_id(1, pos)
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
			notice.emit("%s %s alındı  ·  [Q] kullan" % [INFO[type]["glyph"], INFO[type]["name"]], Color(INFO[type]["color"]))


## Maç başında her oyuncuya karakterine göre bir güç (GameManager._begin_actual_game_rpc, TÜM peer'larda).
## RPC yok: herkes aynı players listesinden aynı sonucu YEREL hesaplar → oyun başlar başlamaz slotta, host'un
## envanteri de aynı (kullanım host'ta doğrulanır). Sadece maç başı bir kez.
func grant_starting_items() -> void:
	for pid: int in NetworkManager.players:
		var character: String = NetworkManager.players[pid].get("character", "")
		if STARTING_ITEMS.has(character) and get_item(pid) == NONE:
			_set_item_rpc(pid, STARTING_ITEMS[character], false, true)  # yerel çağrı (rpc değil), bildirimsiz


func _on_kill_happened(_killer: int, victim: int) -> void:
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
	match type:
		Type.HEAL:
			var target: Node = player
			if player.character_type == "Medic":
				target = _medic_heal_target(peer, team, player as Node3D, aim)
			target.health = minf(target.health + HEAL_AMOUNT, target.max_health)
			target._sync_health.rpc(target.health)
			if target != player:
				_medic_heal_rpc.rpc(peer, target.peer_id)
		Type.BOMB:
			_throw_bomb(peer, team, player as Node3D, aim, false)
		Type.FLASH:
			_throw_bomb(peer, team, player as Node3D, aim, true)
		Type.SMOKE:
			_throw_bomb(peer, team, player as Node3D, aim, false, true)
		Type.INTEL_SAT:
			# Tüm oyuncular + kart taşıyıcı (kart/kapı konumu GÖSTERİLMEZ) — Minimap._draw_satellite_reveals
			_reveal_rpc.rpc(team, "all_players", INTEL_DURATION, peer)
		Type.ENEMY_SAT:
			_reveal_rpc.rpc(team, "enemies", ENEMY_SAT_DURATION, peer)


## Medic: nişan noktasına en yakın yaralı takım arkadaşı (Medic'e ≤ MEDIC_HEAL_RANGE, nişana ≤ MEDIC_AIM_RADIUS).
## Nişanda kimse yoksa: Medic yaralıysa kendisi, değilse menzildeki en yaralı takım arkadaşı, o da yoksa kendisi.
func _medic_heal_target(peer: int, team: int, medic: Node3D, aim: Vector3) -> Node:
	var aimed: Node = null
	var aimed_d := MEDIC_AIM_RADIUS
	var weakest: Node = null
	var weakest_ratio := 1.0
	for pid: int in GameManager.active_players:
		var pl: Variant = GameManager.active_players[pid]
		if pid == peer or pl == null or not is_instance_valid(pl) or pl.is_dead or _team_of(pid) != team:
			continue
		if pl.health >= pl.max_health:
			continue
		var pos := (pl as Node3D).global_position
		if pos.distance_to(medic.global_position) > MEDIC_HEAL_RANGE:
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
func _medic_heal_rpc(medic_peer: int, target_peer: int) -> void:
	var me := NetworkManager.get_local_id()
	var medic_name: String = NetworkManager.players.get(medic_peer, {}).get("name", "?")
	var target_name: String = NetworkManager.players.get(target_peer, {}).get("name", "?")
	var col: Color = INFO[Type.HEAL]["color"]
	if me == medic_peer:
		notice.emit("✚ %s iyileştirildi (+%d)" % [target_name, int(HEAL_AMOUNT)], col)
		GameManager.gain_xp(GameManager.XP_HEAL_ALLY, "Takım arkadaşı iyileştirildi")
	elif me == target_peer:
		notice.emit("✚ MEDIC %s seni iyileştirdi" % medic_name, col)


func _throw_bomb(peer: int, team: int, player: Node3D, aim: Vector3, flash: bool, smoke: bool = false) -> void:
	var from := player.global_position + Vector3(0, 1.2, 0)
	var flat := Vector3(aim.x - from.x, 0.0, aim.z - from.z)
	if flat.length() > BOMB_MAX_THROW:
		flat = flat.normalized() * BOMB_MAX_THROW
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
	await get_tree().create_timer(BOMB_FLIGHT + BOMB_FUSE).timeout
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
		if d > BOMB_RADIUS:
			continue
		# Duvar arkası korunur (oyuncuları yok say, sadece duvar/zemin)
		var q := PhysicsRayQueryParameters3D.create(center, target_pos, 1)
		q.exclude = _player_rids()
		if not space.intersect_ray(q).is_empty():
			continue
		var dmg := BOMB_DAMAGE * lerpf(1.0, 0.35, d / BOMB_RADIUS)
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
	var bomb: Node3D = BOMB_SCRIPT.new()
	bomb.is_flash = flash
	bomb.is_smoke = smoke
	bomb.smoke_radius = SMOKE_RADIUS
	bomb.smoke_duration = SMOKE_DURATION
	var fuse := FLASH_FUSE if flash else (SMOKE_FUSE if smoke else BOMB_FUSE)
	bomb.setup(from, target, BOMB_FLIGHT, fuse, BOMB_RADIUS, TeamManager.get_color(team))
	bomb.exploded.connect(_on_bomb_exploded)
	get_parent().add_child(bomb)


## Patlamanın yerel oyuncuya etkisi (her peer kendisi için, sadece görsel):
##  bomba → yakınlığa göre ekran sarsıntısı (hasar/kırmızılık host'tan _sync_health ile gelir)
##  flaş  → görüş hattı varsa mesafe + bakış yönüne göre körlük (flashed sinyali → HUD), hafif sarsıntı
func _on_bomb_exploded(pos: Vector3, flash: bool) -> void:
	var me := _local_player()
	if me == null or me.is_dead:
		return
	var my_pos := (me as Node3D).global_position
	var d := Vector2(my_pos.x - pos.x, my_pos.z - pos.z).length()
	var cam := get_viewport().get_camera_3d()
	if not flash:
		var shake := clampf(1.0 - d / BOMB_SHAKE_RANGE, 0.0, 1.0)
		if d < BOMB_RADIUS:
			shake = maxf(shake, 0.9)
		if shake > 0.0 and cam and cam.has_method("add_trauma"):
			cam.add_trauma(shake * 0.85)
		return

	if cam and cam.has_method("add_trauma"):
		cam.add_trauma(clampf(1.0 - d / FLASH_RADIUS, 0.0, 1.0) * 0.3)
	if d > FLASH_RADIUS:
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
	var strength := pow(1.0 - d / FLASH_RADIUS, 0.6) * lerpf(0.35, 1.0, facing)
	flashed.emit(strength)


@rpc("authority", "call_local", "reliable")
func _reveal_rpc(team: int, kind: String, duration: float, user_peer: int) -> void:
	var local_team := _local_team()
	var user_name: String = NetworkManager.players.get(user_peer, {}).get("name", "?")
	if team == local_team:
		reveal_until[kind] = Time.get_ticks_msec() / 1000.0 + duration
		reveal_started.emit(kind, duration, true)
		var txt := "◈ UYDU (%s): tüm oyuncular haritada" if kind == "all_players" else "◉ TAKIM UYDUSU (%s): düşmanlar haritada"
		notice.emit(txt % user_name, Color(INFO[Type.INTEL_SAT if kind == "all_players" else Type.ENEMY_SAT]["color"]))
	elif kind == "enemies" or kind == "all_players":
		reveal_started.emit(kind, duration, false)
		notice.emit("⚠ %s TAKIM UYDUSU KONUMUNUZU TESPİT ETTİ!" % TeamManager.get_team_name(team).to_upper(), UITheme.DANGER)
