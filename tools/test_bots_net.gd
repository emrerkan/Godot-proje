extends SceneTree
## Bot ağ testi (iki süreç: host + client, 127.0.0.1:7777). Oyun koduna dokunmaz.
## Host:   Godot.exe --headless --path . --script res://tools/test_bots_net.gd -- host
## Client: Godot.exe --headless --path . --script res://tools/test_bots_net.gd -- client
## Senaryo: host takım 0, client takım 1; host takım 0'a + takım 1'e birer bot (2v2); client hazır; host başlatır;
## ikisi karakter seçer; maç başlar (match_live), ~30 sn izlenir.
## Sonuç: "NET_TEST HOST: PASS/FAIL ..." / "NET_TEST CLIENT: PASS/FAIL ..." + "NET_TEST CLIENT OBS4: ...".
## Maç sonunda return_to_menu ÇAĞRILMAZ (MatchStats "abandoned" yazmasın) — doğrudan quit.

const ADDR := "127.0.0.1"
const RUN_MS := 30000          # maç başladıktan sonra izleme
const SETTLE_MS := 1500        # _match_go_rpc ışınlamasından sonra başlangıç konumu alınır
const MOVE_MIN := 3.0
const GLOBAL_TIMEOUT_MS := 170000
const HOST_LINGER_MS := 6000   # host değerlendirdikten sonra client bitirsin diye bekler


class ErrLog extends Logger:
	var mutex := Mutex.new()
	var errors: Array[String] = []

	func _log_error(function: String, file: String, line: int, code: String, rationale: String,
			_editor_notify: bool, error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
		if error_type == ERROR_TYPE_WARNING:
			return
		var kind := "SCRIPT ERROR" if error_type == ERROR_TYPE_SCRIPT else "ERROR"
		var msg := rationale if not rationale.is_empty() else code
		mutex.lock()
		errors.append("%s: %s (%s:%d %s)" % [kind, msg, file, line, function])
		mutex.unlock()

	func _log_message(_message: String, _error: bool) -> void:
		pass

	func snapshot() -> Array[String]:
		mutex.lock()
		var out: Array[String] = errors.duplicate()
		mutex.unlock()
		return out


var NM: Node
var GM: Node
var log := ErrLog.new()
var role := ""
var phase := ""
var phase_t := 0
var t0 := 0
var fails: Array[String] = []
var notes: Array[String] = []
var start_pos: Dictionary = {}
var max_move: Dictionary = {}
var bot_ids: Array[int] = []
var shots: Dictionary = {}       # bot_id → fired sayısı (bu süreçte gözlenen)
var dmg_events := 0              # bot kaynaklı / bota yönelik can düşüşleri (client'ta health_changed)
var kill_events: Array[String] = []
var hooked: Dictionary = {}
var last_health: Dictionary = {}
var evaluated := false


func _initialize() -> void:
	OS.add_logger(log)
	var args := OS.get_cmdline_user_args()
	role = String(args[0]).to_lower() if args.size() > 0 else "host"
	t0 = Time.get_ticks_msec()
	_setup.call_deferred()


func _setup() -> void:
	NM = get_root().get_node("NetworkManager")
	GM = get_root().get_node("GameManager")
	GM.kill_happened.connect(_on_kill)
	if role == "host":
		NM.create_server("NetHost", "BotNetTest")
		_check(NM.is_host(), "create_server sonrası host değil")
		NM.request_change_team(0)
		_set_phase("wait_client")
	else:
		NM.joined_server.connect(_on_joined)
		NM.connection_failed.connect(func() -> void: _fail_end("bağlantı başarısız"))
		NM.kicked.connect(func(r: String) -> void: _fail_end("atıldı: %s" % r))
		_set_phase("connect_delay")


func _now() -> int:
	return Time.get_ticks_msec()


func _set_phase(p: String) -> void:
	phase = p
	phase_t = _now()
	print("[net %s] faz: %s (t=%.1f s)" % [role, p, (_now() - t0) / 1000.0])


func _check(cond: bool, what: String) -> void:
	if not cond:
		fails.append(what)
		print("[net %s] KONTROL BAŞARISIZ: %s" % [role, what])


func _on_joined() -> void:
	print("[net client] joined_server, id=%d" % get_multiplayer().get_unique_id())
	NM.request_change_team(1)
	_set_phase("wait_bots")


func _on_kill(killer: int, victim: int, method: Variant) -> void:
	kill_events.append("%d→%d (%s)" % [killer, victim, str(method)])


func _process(_delta: float) -> bool:
	if NM == null or phase == "" or phase == "done":
		return false
	if _now() - t0 > GLOBAL_TIMEOUT_MS and not evaluated:
		_fail_end("genel zaman aşımı, faz=%s" % phase)
		return false
	var elapsed := _now() - phase_t
	match phase:
		# ── host ──
		"wait_client":
			var cid := _client_id()
			if cid > 0 and int(NM.players[cid].get("team_id", -1)) == 1:
				var b0: int = NM.add_bot(0)
				var b1: int = NM.add_bot(1)
				_check(b0 > 0 and b1 > 0, "add_bot başarısız (%d,%d)" % [b0, b1])
				print("[net host] botlar eklendi: %d (t0), %d (t1)" % [b0, b1])
				_set_phase("wait_ready")
			elif elapsed > 60000:
				_fail_end("client 60 sn içinde takım 1'e geçmedi")
		"wait_ready":
			var cid := _client_id()
			if cid > 0 and bool(NM.players[cid].get("is_ready", false)):
				_check(NM._are_teams_balanced(), "takımlar dengeli değil")
				GM.start_game()
				_set_phase("wait_select")
			elif elapsed > 30000:
				_fail_end("client hazır olmadı")
		# ── client ──
		"connect_delay":
			if elapsed > 2500:
				NM.join_server(ADDR, "NetClient")
				_set_phase("wait_join")
		"wait_join":
			if elapsed > 30000:
				_fail_end("joined_server gelmedi")
		"wait_bots":
			if NM.get_bot_ids().size() >= 2:
				print("[net client] lobide botlar görüldü: %s" % [NM.get_bot_ids()])
				NM.set_ready(true)
				_set_phase("wait_select")
			elif elapsed > 40000:
				_fail_end("client lobide bot göremedi")
		# ── ortak ──
		"wait_select":
			var cs: Node = current_scene
			if int(GM.state) == 2 and cs != null and cs.name.contains("Character"):
				NM.request_select_character("Tank" if role == "host" else "Runner")
				_set_phase("wait_live")
			elif elapsed > 30000:
				_fail_end("karakter seçimine geçilmedi (state=%d)" % int(GM.state))
		"wait_live":
			if bool(GM.match_live):
				_set_phase("settle")
			elif elapsed > 100000:
				_fail_end("maç 100 sn içinde başlamadı (state=%d)" % int(GM.state))
		"settle":
			_hook_bots()
			if elapsed > SETTLE_MS:
				_on_live()
				_set_phase("run")
		"run":
			_hook_bots()
			_track()
			if elapsed > RUN_MS:
				_evaluate()
		"linger":
			if elapsed > HOST_LINGER_MS or get_multiplayer().get_peers().is_empty():
				phase = "done"
				quit(0 if fails.is_empty() else 1)
	return false


func _client_id() -> int:
	for pid: int in NM.players:
		if pid != 1 and not NM.is_bot(pid):
			return pid
	return 0


func _brain_of(p: Node) -> bool:
	for ch in p.get_children():
		var s: Script = ch.get_script()
		if s != null and s.resource_path.ends_with("BotBrain.gd"):
			return true
	return false


## Bot silahlarının fired sinyalini ve tüm oyuncuların can değişimini izle (düğümler geç gelebilir)
func _hook_bots() -> void:
	var ap: Dictionary = GM.active_players
	for pid: int in ap:
		if hooked.has(pid) or not is_instance_valid(ap[pid]):
			continue
		var p: Node = ap[pid]
		hooked[pid] = true
		var w: Node = p.get("current_weapon")
		if NM.is_bot(pid) and w != null:
			shots[pid] = 0
			w.fired.connect(func() -> void: shots[pid] = int(shots.get(pid, 0)) + 1)
		last_health[pid] = float(p.get("health")) if p.get("health") != null else 0.0
		p.health_changed.connect(func(h: float) -> void:
			if h < float(last_health.get(pid, h)):
				dmg_events += 1
			last_health[pid] = h)


func _on_live() -> void:
	var ap: Dictionary = GM.active_players
	bot_ids = NM.get_bot_ids()
	_check(bot_ids.size() == 2, "players'ta 2 bot yok: %s" % [bot_ids])
	var my_id: int = NM.get_local_id()
	_check(ap.has(my_id) and is_instance_valid(ap[my_id]), "yerel oyuncu active_players'ta yok")
	var chars: Dictionary = {}
	for bid: int in bot_ids:
		var c := String(NM.players[bid].get("character", ""))
		chars[bid] = c
		_check(not c.is_empty(), "bot %d character boş (assign_bot_characters yayını ulaşmadı)" % bid)
		var ok: bool = ap.has(bid) and is_instance_valid(ap[bid])
		_check(ok, "bot %d active_players'ta yok" % bid)
		if not ok:
			continue
		var p: Node3D = ap[bid]
		start_pos[bid] = p.global_position
		max_move[bid] = 0.0
		_check(bool(p.get("is_bot")), "bot %d is_bot false" % bid)
		_check(not bool(p.get("is_local")), "bot %d is_local true" % bid)
		_check(p.get_multiplayer_authority() == 1, "bot %d yetkisi %d (1 olmalı)" % [bid, p.get_multiplayer_authority()])
		var brain := _brain_of(p)
		if role == "host":
			_check(brain, "host: bot %d BotBrain çocuğu yok" % bid)
		else:
			_check(not brain, "client: bot %d BotBrain çocuğu VAR (sadece host'ta olmalı)" % bid)
		notes.append("bot%d[char=%s name=%s auth=%d brain=%s]" % [bid - int(NM.BOT_ID_BASE), c, p.name,
				p.get_multiplayer_authority(), brain])
	# İnsan oyuncu da diğer süreçte görünmeli
	var other: int = _client_id() if role == "host" else 1
	_check(ap.has(other) and is_instance_valid(ap[other]), "diğer insan (%d) active_players'ta yok" % other)


func _track() -> void:
	var ap: Dictionary = GM.active_players
	for bid: int in start_pos:
		if ap.has(bid) and is_instance_valid(ap[bid]):
			var d: float = ((ap[bid] as Node3D).global_position - (start_pos[bid] as Vector3)).length()
			max_move[bid] = maxf(float(max_move[bid]), d)


func _flagged(errs: Array[String]) -> Array[String]:
	var out: Array[String] = []
	for e in errs:
		var l := e.to_lower()
		if e.begins_with("SCRIPT ERROR") or l.contains("rpc") or l.contains("peer") or l.contains("invalid"):
			out.append(e)
	return out


func _evaluate() -> void:
	evaluated = true
	var best := 0.0
	var moves: Array[String] = []
	for bid: int in max_move:
		best = maxf(best, float(max_move[bid]))
		moves.append("%d:%.1fm" % [bid - int(NM.BOT_ID_BASE), float(max_move[bid])])
	_check(best > MOVE_MIN, "hiçbir bot %.1f m'den fazla yer değiştirmedi (en fazla %.2f)" % [MOVE_MIN, best])
	notes.append("yer_degistirme=%s" % [moves])
	_report()


func _fail_end(why: String) -> void:
	if evaluated:
		return
	evaluated = true
	fails.append(why)
	_report()


func _report() -> void:
	var errs := log.snapshot()
	var flagged := _flagged(errs)
	if not flagged.is_empty():
		fails.append("%d işaretli hata (SCRIPT ERROR/rpc/peer/Invalid)" % flagged.size())
	var verdict := "PASS" if fails.is_empty() else "FAIL"
	print("NET_TEST %s: %s | hatalar(motor)=%d isaretli=%d | %s | %s" % [role.to_upper(), verdict, errs.size(),
			flagged.size(), "; ".join(fails), " ".join(notes)])
	var shot_txt: Array[String] = []
	var total_shots := 0
	for bid: int in shots:
		shot_txt.append("%d:%d" % [bid - int(NM.BOT_ID_BASE), int(shots[bid])])
		total_shots += int(shots[bid])
	print("NET_TEST %s OBS4: bot_atislari=%s (%s) | can_dususu=%d | kill=%s" % [role.to_upper(),
			("gözlemlendi" if total_shots > 0 else "gözlemlenmedi"), ", ".join(shot_txt), dmg_events,
			(", ".join(kill_events) if not kill_events.is_empty() else "gözlemlenmedi")])
	for i in mini(errs.size(), 40):
		print("  [%s hata] %s" % [role, errs[i]])
	if role == "host":
		_set_phase("linger")
	else:
		phase = "done"
		quit(0 if fails.is_empty() else 1)
