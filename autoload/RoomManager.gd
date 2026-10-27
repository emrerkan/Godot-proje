## RoomManager.gd
## LAN oda keşfi (UDP broadcast) ve oda kodu yönetimi.
## Oda kodu = host IPv4 → base-32 (7 hane) — LAN + internet'te geçerli.

extends Node

signal rooms_updated

const DISCOVERY_PORT    := 7778
## Aynı bilgisayarda birden fazla oyun penceresi: bir UDP portunu (Windows'ta) tek süreç dinleyebiliyor.
## Dinleyici bu listeden ilk boş portu alır, host yayını HEPSİNE gönderir → her pencere odaları görür.
const DISCOVERY_PORTS: Array[int] = [7778, 7779, 7780, 7781]
const LISTEN_RETRY := 1.0          # tüm portlar doluysa tekrar deneme aralığı (sn)
const BROADCAST_INTERVAL := 2.0
const ROOM_STALE_MS     := 7000

## Belirsiz karakter içermeyen 32-karakter alfabe (0,1,I,O çıkarıldı)
const ALPHA := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

## Host bilgileri
var room_name:     String = ""
var room_code:     String = ""
var room_password: String = ""

## Keşfedilen odalar: code → {name, code, has_password, player_count, ip, _ts}
var discovered_rooms: Dictionary = {}

var _broadcast_sock: PacketPeerUDP = null
var _listen_sock:    PacketPeerUDP = null
var _broadcast_timer: float = 0.0
var _stale_accum:     float = 0.0
var _is_hosting:   bool = false
var _is_listening: bool = false
var _want_listening: bool = false   # dinlemek isteniyor ama port alınamadıysa _process tekrar dener
var _retry_timer: float = 0.0
var listen_port: int = -1           # şu an dinlenen port (-1 = dinlenemiyor)


func _process(delta: float) -> void:
	if _want_listening and not _is_listening:
		_retry_timer -= delta
		if _retry_timer <= 0.0:
			_retry_timer = LISTEN_RETRY
			_try_bind()

	if _is_hosting and _broadcast_sock:
		_broadcast_timer += delta
		if _broadcast_timer >= BROADCAST_INTERVAL:
			_broadcast_timer = 0.0
			_send_broadcast()

	if _is_listening and _listen_sock:
		_receive_broadcasts()
		_stale_accum += delta
		if _stale_accum >= 3.0:
			_stale_accum = 0.0
			_prune_stale()


# ─────────────────────────────────────────────
# Genel API
# ─────────────────────────────────────────────

## Host: oda oluştur, 7 haneli kodu döndür
func create_room(p_name: String, p_password: String) -> String:
	room_name     = p_name
	room_password = p_password
	room_code     = _ip_to_code(_get_local_ip())
	_is_hosting   = true
	_broadcast_sock = PacketPeerUDP.new()
	_broadcast_sock.set_broadcast_enabled(true)
	_broadcast_timer = BROADCAST_INTERVAL  # İlk broadcast hemen
	return room_code


## Client: LAN odaları dinlemeye başla (port alınamazsa arka planda tekrar dener)
func start_listening() -> void:
	_want_listening = true
	if _is_listening:
		return
	_try_bind()


func _try_bind() -> void:
	for port in DISCOVERY_PORTS:
		var sock := PacketPeerUDP.new()
		if sock.bind(port) == OK:
			_listen_sock = sock
			listen_port = port
			_is_listening = true
			emit_signal("rooms_updated")  # arayüz durum yazısını güncellesin
			return
	listen_port = -1


## "Yenile": listeyi temizle, dinlemeyi baştan kur (port boşaldıysa artık alınır) — odalar ≤2 sn içinde yeniden gelir
func refresh() -> void:
	var was_wanted := _want_listening
	stop_listening()
	if was_wanted:
		start_listening()
	emit_signal("rooms_updated")


func is_listening() -> bool:
	return _is_listening


func stop_hosting() -> void:
	_is_hosting = false
	if _broadcast_sock:
		_broadcast_sock.close()
		_broadcast_sock = null
	room_name = ""
	room_code = ""
	room_password = ""


func stop_listening() -> void:
	_is_listening = false
	_want_listening = false
	listen_port = -1
	if _listen_sock:
		_listen_sock.close()
		_listen_sock = null
	discovered_rooms.clear()


## Kod'dan IP çöz: keşfedilen listeden → base-32 decode → direkt IP fallback
func get_ip_for_code(code: String) -> String:
	var upper := code.strip_edges().to_upper()
	if discovered_rooms.has(upper):
		return discovered_rooms[upper].get("ip", "")
	if upper.length() == 7:
		var decoded := _code_to_ip(upper)
		if not decoded.is_empty():
			return decoded
	return code.strip_edges()  # Direkt IP girilmişse (localhost testi)


# ─────────────────────────────────────────────
# UDP
# ─────────────────────────────────────────────

func _send_broadcast() -> void:
	var info := {
		"room_name":    room_name,
		"room_code":    room_code,
		"has_password": not room_password.is_empty(),
		"player_count": NetworkManager.get_player_count(),
	}
	# Oda özellikleri: team_size, max_players, map_name, state ("lobby"/"game") — ana menü listesi gösterir
	info.merge(NetworkManager.get_room_status())
	var data := JSON.stringify(info).to_utf8_buffer()
	for port in DISCOVERY_PORTS:
		_broadcast_sock.set_dest_address("255.255.255.255", port)
		_broadcast_sock.put_packet(data)


func _receive_broadcasts() -> void:
	while _listen_sock.get_available_packet_count() > 0:
		var pkt    := _listen_sock.get_packet()
		var sender := _listen_sock.get_packet_ip()
		var parsed  = JSON.parse_string(pkt.get_string_from_utf8())
		if not (parsed is Dictionary) or not parsed.has("room_code"):
			continue
		parsed["ip"]  = sender
		parsed["_ts"] = Time.get_ticks_msec()
		discovered_rooms[parsed["room_code"]] = parsed
		emit_signal("rooms_updated")


func _prune_stale() -> void:
	var now     := Time.get_ticks_msec()
	var changed := false
	for code in discovered_rooms.keys():
		if now - int(discovered_rooms[code].get("_ts", 0)) > ROOM_STALE_MS:
			discovered_rooms.erase(code)
			changed = true
	if changed:
		emit_signal("rooms_updated")


# ─────────────────────────────────────────────
# Kod ↔ IP  (base-32, 7 hane)
# 32^7 = 34 milyar > 4.3 milyar (IPv4 maks)
# ─────────────────────────────────────────────

func _ip_to_code(ip: String) -> String:
	var parts := ip.split(".")
	if parts.size() != 4:
		return _random_code()
	var n: int = (int(parts[0]) << 24) | (int(parts[1]) << 16) | (int(parts[2]) << 8) | int(parts[3])
	var code := ""
	for i in range(7):
		code = ALPHA[n % 32] + code
		n >>= 5
	return code


func _code_to_ip(code: String) -> String:
	if code.length() != 7:
		return ""
	var n: int = 0
	for ch in code:
		var idx := ALPHA.find(ch)
		if idx < 0:
			return ""
		n = (n << 5) | idx
	return "%d.%d.%d.%d" % [(n >> 24) & 0xFF, (n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]


func _random_code() -> String:
	var code := ""
	for i in range(7):
		code += ALPHA[randi() % 32]
	return code


func _get_local_ip() -> String:
	for addr in IP.get_local_addresses():
		if ":" in addr:  # IPv6 atla
			continue
		if addr.begins_with("192.168.") or addr.begins_with("10.") or addr.begins_with("172."):
			return addr
	return "127.0.0.1"
