extends SceneTree
## Bot entegrasyon testi (headless, tek süreç, host tek başına).
## Çalıştır: Godot.exe --headless --path . --script res://tools/test_bots.gd [-- A|B|AB]
##   A  = botlu maç: host takım 0 + 1 bot, takım 1'e 2 bot → maç başlar, ~25 sn izlenir (botlar doğdu mu, hareket ediyor mu)
##   B  = botsuz regresyon: lobide bot ekle/kaldır/temizlik + botsuz maç başlar, hiç bot düğümü/nav yok
##   AB = (varsayılan) önce A, menüye dönüş, sonra B
## Sonuç satırları: "BOT_TEST A: PASS/FAIL ..." / "BOT_TEST B: ...". Motor hataları (SCRIPT ERROR dahil) Logger ile sayılır.
## Autoload adları bu betiğin parse anında yok → get_root().get_node(...) ile alınır.

const MATCH_WAIT_MS := 90000      # maç başlaması (yükleme + 10 sn geri sayım) için en fazla
const A_RUN_MS := 25000           # A: maç başladıktan sonra izleme süresi
const B_RUN_MS := 6000            # B: botsuz maç izleme süresi
const MOVE_MIN := 3.0             # A: en az bir bot bu kadar metre yer değiştirmeli


## Motor hata günlüğü (SCRIPT ERROR / push_error / C++ hata). Uyarılar sayılmaz.
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

	func count() -> int:
		mutex.lock()
		var n := errors.size()
		mutex.unlock()
		return n

	func since(start: int) -> Array[String]:
		mutex.lock()
		var out: Array[String] = errors.slice(start)
		mutex.unlock()
		return out


var NM: Node
var GM: Node
var log := ErrLog.new()
var queue: Array[String] = []
var scenario := ""
var phase := ""
var phase_t := 0
var err_start := 0
var fails: Array[String] = []
var notes: Array[String] = []
var start_pos: Dictionary = {}    # bot_id → Vector3 (maç başı)
var max_move: Dictionary = {}     # bot_id → float
var results: Array[String] = []


func _initialize() -> void:
	OS.add_logger(log)
	var args := OS.get_cmdline_user_args()
	var which := String(args[0]).to_upper() if args.size() > 0 else "AB"
	for c in which:
		if c == "A" or c == "B":
			queue.append(c)
	_setup.call_deferred()


func _setup() -> void:
	NM = get_root().get_node("NetworkManager")
	GM = get_root().get_node("GameManager")
	_next_scenario()


func _now() -> int:
	return Time.get_ticks_msec()


func _set_phase(p: String) -> void:
	phase = p
	phase_t = _now()
	print("[test %s] faz: %s" % [scenario, p])


func _check(cond: bool, what: String) -> void:
	if not cond:
		fails.append(what)
		print("[test %s] KONTROL BAŞARISIZ: %s" % [scenario, what])


func _next_scenario() -> void:
	if queue.is_empty():
		_finish()
		return
	scenario = queue.pop_front()
	fails.clear()
	notes.clear()
	start_pos.clear()
	max_move.clear()
	err_start = log.count()
	_set_phase("lobby")


func _process(_delta: float) -> bool:
	if NM == null or phase == "" or phase == "done":
		return false
	var elapsed := _now() - phase_t
	match phase:
		"lobby":
			_do_lobby()
		"wait_select":
			if int(GM.state) == 2 and get_root().get_tree().current_scene != null \
					and get_root().get_tree().current_scene.name.contains("Character"):
				NM.request_select_character("Tank")
				_set_phase("wait_live")
			elif elapsed > 20000:
				_fail_end("karakter seçim sahnesine geçilmedi")
		"wait_live":
			if bool(GM.match_live):
				_set_phase("live_settle")
			elif elapsed > MATCH_WAIT_MS:
				_fail_end("maç %d sn içinde başlamadı (state=%d)" % [MATCH_WAIT_MS / 1000, int(GM.state)])
		"live_settle":
			# _match_go_rpc botları spawn'a ışınlar — başlangıç konumunu ışınlanmadan sonra al
			if elapsed > 500:
				_on_live()
				_set_phase("run")
		"run":
			_track()
			var run_ms := A_RUN_MS if scenario == "A" else B_RUN_MS
			if elapsed > run_ms:
				_evaluate()
	return false


func _do_lobby() -> void:
	NM.create_server("Tester", "BotTest")
	_check(NM.is_host(), "create_server sonrası host değil")
	NM.request_change_team(0)
	_check(int(NM.players[1].get("team_id", -1)) == 0, "host takım 0'a geçemedi")
	if scenario == "A":
		var b1: int = NM.add_bot(0)
		var b2: int = NM.add_bot(1)
		var b3: int = NM.add_bot(1)
		_check(b1 > 0 and b2 > 0 and b3 > 0, "add_bot 0 döndü (%d,%d,%d)" % [b1, b2, b3])
		_check(NM.get_bot_ids().size() == 3, "get_bot_ids 3 değil: %s" % [NM.get_bot_ids()])
		for b: int in [b1, b2, b3]:
			_check(b <= 0 or NM.is_bot(b), "is_bot(%d) false" % b)
		_check(not NM.is_bot(1), "host bot sayıldı")
	else:
		# Lobi akışı: ekle → kaldır → dolu takım → temizlik
		var b: int = NM.add_bot(1)
		_check(b == NM.BOT_ID_BASE + 1, "ilk bot id'si BOT_ID_BASE+1 değil: %d" % b)
		_check(NM.is_bot(b) and NM.players.size() == 2, "bot eklenince players 2 değil")
		_check(String(NM.players[b].get("name", "")) == "BOT 1", "bot adı 'BOT 1' değil")
		NM.remove_bot(b)
		_check(NM.players.size() == 1 and NM.get_bot_ids().is_empty(), "remove_bot sonrası players temizlenmedi")
		NM.remove_bot(1)  # insanı silmemeli
		_check(NM.players.has(1), "remove_bot insanı sildi")
		var size: int = NM.get_team_size()
		var added := 0
		for i in size + 2:
			if NM.add_bot(2) > 0:
				added += 1
		_check(added == size, "dolu takıma bot eklendi (%d/%d)" % [added, size])
		for id: int in NM.get_bot_ids():
			NM.remove_bot(id)
		_check(NM.get_bot_ids().is_empty() and NM.players.size() == 1, "botlar tam temizlenmedi")
	GM.start_game()
	_set_phase("wait_select")


func _on_live() -> void:
	var ap: Dictionary = GM.active_players
	_check(ap.has(1) and is_instance_valid(ap[1]), "host oyuncusu active_players'ta yok")
	if scenario == "A":
		var team_chars: Dictionary = {}
		for pid: int in NM.players:
			var t := int(NM.players[pid].get("team_id", -1))
			var c := String(NM.players[pid].get("character", ""))
			if NM.is_bot(pid):
				_check(not c.is_empty(), "bot %d karakter atanmadı" % pid)
			if not team_chars.has(t):
				team_chars[t] = []
			_check(not (team_chars[t] as Array).has(c), "takım %d'de karakter tekrarı: %s" % [t, c])
			(team_chars[t] as Array).append(c)
		for bid: int in NM.get_bot_ids():
			var ok: bool = ap.has(bid) and is_instance_valid(ap[bid])
			_check(ok, "bot %d active_players'ta yok" % bid)
			if ok:
				var p: Node3D = ap[bid]
				start_pos[bid] = p.global_position
				max_move[bid] = 0.0
				_check(bool(p.get("is_bot")), "bot %d Player.is_bot false" % bid)
				_check(not bool(p.get("is_local")), "bot %d is_local true" % bid)
				_check(p.get_multiplayer_authority() == 1, "bot %d yetkisi 1 değil" % bid)
				var has_brain := false
				for ch in p.get_children():
					var s: Script = ch.get_script()
					if s != null and s.resource_path.ends_with("BotBrain.gd"):
						has_brain = true
				_check(has_brain, "bot %d BotBrain çocuğu yok" % bid)
		notes.append("nav=%s" % ("var" if GM.get("_bot_nav") != null else "yok"))
		notes.append("chars=%s" % [team_chars])
	else:
		for pid: int in ap:
			_check(not NM.is_bot(pid), "botsuz maçta bot düğümü: %d" % pid)
		_check(ap.size() == 1, "botsuz maçta active_players 1 değil: %d" % ap.size())
		_check(GM.get("_bot_nav") == null, "botsuz maçta _bot_nav kuruldu")
		_check(NM.get_bot_ids().is_empty(), "botsuz maçta get_bot_ids boş değil")


func _track() -> void:
	var ap: Dictionary = GM.active_players
	for bid: int in start_pos:
		if ap.has(bid) and is_instance_valid(ap[bid]):
			var p: Node3D = ap[bid]
			var d: float = (p.global_position - (start_pos[bid] as Vector3)).length()
			max_move[bid] = maxf(float(max_move[bid]), d)


func _evaluate() -> void:
	if scenario == "A":
		var best := 0.0
		for bid: int in max_move:
			best = maxf(best, float(max_move[bid]))
		notes.append("max_yer_degistirme=%s" % [max_move])
		_check(best > MOVE_MIN, "hiçbir bot %.1f m'den fazla hareket etmedi (en fazla %.2f)" % [MOVE_MIN, best])
		notes.append("state=%d" % int(GM.state))
	_end_scenario()


func _fail_end(why: String) -> void:
	fails.append(why)
	_end_scenario()


func _end_scenario() -> void:
	var errs := log.since(err_start)
	var script_errs := 0
	for e in errs:
		if e.begins_with("SCRIPT ERROR"):
			script_errs += 1
	if script_errs > 0:
		fails.append("%d SCRIPT ERROR" % script_errs)
	var verdict := "PASS" if fails.is_empty() else "FAIL"
	var line := "BOT_TEST %s: %s | hatalar(motor)=%d script=%d | %s | %s" % [
		scenario, verdict, errs.size(), script_errs, "; ".join(fails), " ".join(notes)]
	results.append(line)
	print(line)
	for i in mini(errs.size(), 25):
		print("  [%s hata] %s" % [scenario, errs[i]])
	_set_phase("done")
	# Sonraki senaryo için temiz başlangıç: menüye dön (disconnect_all + Main.tscn)
	GM.return_to_menu()
	_after_menu.call_deferred()


func _after_menu() -> void:
	await create_timer(2.0).timeout
	_next_scenario()


func _finish() -> void:
	print("==== BOT_TEST ÖZET ====")
	for r in results:
		print(r)
	quit(0 if results.all(func(r: String) -> bool: return r.contains(": PASS")) else 1)
