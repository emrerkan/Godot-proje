extends SceneTree
## Bot entegrasyon testi (headless, tek süreç, host tek başına).
## Çalıştır: Godot.exe --headless --path . --script res://tools/test_bots.gd [-- A|B|AB]
##   A  = botlu maç: host takım 0 + 1 bot, takım 1'e 2 bot → maç başlar, ~25 sn izlenir (botlar doğdu mu, hareket ediyor mu)
##   B  = botsuz regresyon: lobide bot ekle/kaldır/temizlik + botsuz maç başlar, hiç bot düğümü/nav yok
##   K  = SADECE BIÇAK modu: iki bot (takım 1 ve 2) yan yana doğurulur → en az bir bıçak vuruşu (Player._stab_timer > 0) görülmeli
##   AB = (varsayılan) önce A, menüye dönüş, sonra B (K ayrıca: -- K veya -- ABK)
## Sonuç satırları: "BOT_TEST A: PASS/FAIL ..." / "BOT_TEST B: ...". Motor hataları (SCRIPT ERROR dahil) Logger ile sayılır.
## Autoload adları bu betiğin parse anında yok → get_root().get_node(...) ile alınır.

const MATCH_WAIT_MS := 90000      # maç başlaması (yükleme + 10 sn geri sayım) için en fazla
const A_RUN_MS := 25000           # A: maç başladıktan sonra izleme süresi
const B_RUN_MS := 6000            # B: botsuz maç izleme süresi
const MOVE_MIN := 3.0             # A: en az bir bot bu kadar metre yer değiştirmeli
const K_RUN_MS := 25000           # K: bıçak modu izleme süresi
const D_RUN_MS := 15000           # D: Deathmatch (Süreli FFA) izleme süresi
const C_RUN_MS := 8000            # C: Kartlı Ölüm Maçı (kapı açma 3.5 sn + pay)


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
var stab_seen := false            # K: bir bot bıçak animasyon zamanlayıcısı > 0 oldu
var knife_flags_ok := true        # K: botlar is_knife_mode() görüyor mu
var dm_dmg_seen := false          # D: aynı lobi takımındaki botlar birbirine hasar verdi
var results: Array[String] = []


func _initialize() -> void:
	OS.add_logger(log)
	var args := OS.get_cmdline_user_args()
	var which := String(args[0]).to_upper() if args.size() > 0 else "AB"
	for c in which:
		if c == "A" or c == "B" or c == "K" or c == "D" or c == "C":
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
	stab_seen = false
	knife_flags_ok = true
	dm_dmg_seen = false
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
			var run_ms := B_RUN_MS
			if scenario == "A":
				run_ms = A_RUN_MS
			elif scenario == "K":
				run_ms = K_RUN_MS
				if stab_seen and elapsed > 3000:
					run_ms = 0   # K: bıçak vuruşu görüldü → erken bitir
			elif scenario == "D":
				run_ms = D_RUN_MS
				if dm_dmg_seen and elapsed > 3000:
					run_ms = 0   # D: aynı lobi takımındaki botlar savaştı → erken bitir
			elif scenario == "C":
				run_ms = C_RUN_MS
				if int(GM.state) == 4:   # State.ENDED — kapı açıldı
					run_ms = 0
			if elapsed > run_ms:
				_evaluate()
	return false


func _do_lobby() -> void:
	NM.create_server("Tester", "BotTest")
	_check(NM.is_host(), "create_server sonrası host değil")
	NM.request_change_team(0)
	_check(int(NM.players[1].get("team_id", -1)) == 0, "host takım 0'a geçemedi")
	NM.set_weapon_mode("knife" if scenario == "K" else "normal")
	if scenario == "C":
		NM.set_play_mode("deathmatch")
		NM.set_win_mode("cards")
		_check(NM.is_deathmatch() and GM.is_deathmatch_cards(), "C: Kartlı Ölüm Maçı aktif olmadı")
		_check(NM.get_card_count() == 1, "C: Kartlı Ölüm Maçı kart sayısı 1 değil: %d" % NM.get_card_count())
		var c1: int = NM.add_bot(0)
		var c2: int = NM.add_bot(0)
		_check(c1 > 0 and c2 > 0, "C: add_bot 0 döndü (%d,%d)" % [c1, c2])
		_check(NM._are_teams_balanced(), "C: _are_teams_balanced() false")
	elif scenario == "D":
		NM.set_win_mode("deathmatch")
		_check(NM.is_deathmatch(), "D: win_mode deathmatch olmadı: %s" % NM.get_win_mode())
		# Herkes AYNI lobi takımında (Takım 0) — yine de denge kilidi açılmalı ve birbirine düşman olmalı
		var d1: int = NM.add_bot(0)
		var d2: int = NM.add_bot(0)
		var d3: int = NM.add_bot(0)
		_check(d1 > 0 and d2 > 0 and d3 > 0, "D: add_bot 0 döndü (%d,%d,%d)" % [d1, d2, d3])
		_check(NM._are_teams_balanced(), "D: aynı takımda 4 oyuncuyla _are_teams_balanced() false")
		_check(not GM.are_allies(1, d1), "D: are_allies(host, same_team_bot) true döndü")
	elif scenario == "K":
		# Host (takım 0) sabit durur; iki bot farklı takımlarda
		var k1: int = NM.add_bot(1)
		var k2: int = NM.add_bot(2)
		_check(k1 > 0 and k2 > 0, "K: add_bot 0 döndü (%d,%d)" % [k1, k2])
		_check(NM.get_weapon_mode() == "knife", "K: weapon_mode knife olmadı: %s" % NM.get_weapon_mode())
	elif scenario == "A":
		NM.set_bot_difficulty("medium")
		_check(NM.get_bot_difficulty() == "medium", "A: bot zorluğu medium olmadı: %s" % NM.get_bot_difficulty())
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
	if scenario == "A" or scenario == "K" or scenario == "D" or scenario == "C":
		var team_chars: Dictionary = {}
		for pid: int in NM.players:
			var t := int(NM.players[pid].get("team_id", -1))
			var c := String(NM.players[pid].get("character", ""))
			if NM.is_bot(pid):
				_check(not c.is_empty(), "bot %d karakter atanmadı" % pid)
			if not team_chars.has(t):
				team_chars[t] = []
			if scenario != "D" and scenario != "C":
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
						if scenario == "A":
							var want: float = float(ch.REACTION_TIME) * float(ch.DIFFICULTY["medium"]["reaction"])
							_check(is_equal_approx(float(ch.get("_d_reaction")), want),
								"bot %d tepki süresi orta değil (%.2f ≠ %.2f)" % [bid, float(ch.get("_d_reaction")), want])
				_check(has_brain, "bot %d BotBrain çocuğu yok" % bid)
		notes.append("nav=%s" % ("var" if GM.get("_bot_nav") != null else "yok"))
		notes.append("chars=%s" % [team_chars])
		if scenario == "C":
			_check(GM.cards.size() == 1, "C: Kartlı Ölüm Maçı'nda 1 kart doğmadı: %d" % GM.cards.size())
			_check(GM.door_instance != null, "C: Kartlı Ölüm Maçı'nda kapı doğmadı")
			_check(float(GM.match_time_left) < 0.0, "C: Kartlı Ölüm Maçı'nda süre aktif oldu")
			_check(is_equal_approx(float(GM.get_door_unlock_time()), 3.5), "C: kapı kilit süresi 3.5 değil")
			# Host kartın yanına gidip kartı alır, sonra kapının çemberine ışınlanır → 3.5 sn sonra tek kazanan / tek MVP olarak bitmeli
			if not GM.cards.is_empty() and GM.door_instance != null and ap.has(1):
				var cid: int = GM.cards.keys()[0]
				var card_node: Node3D = GM.cards[cid]
				(ap[1] as Node3D).global_position = card_node.global_position
				GM.handle_card_pickup(1, cid)
				_check(GM.is_card_carrier(1), "C: host kartı alamadı")
				(ap[1] as Node3D).global_position = (GM.door_instance as Node3D).global_position
		elif scenario == "D":
			_check(GM.cards.is_empty(), "D: Deathmatch'te kart doğdu")
			_check(GM.door_instance == null, "D: Deathmatch'te kapı doğdu")
			_check(float(GM.match_time_left) > 0.0, "D: match_time_left <= 0")
			var pm := get_root().get_tree().current_scene.get_node_or_null("PowerupManager")
			_check(pm == null or (pm.inventory as Dictionary).is_empty(), "D: başlangıç gücü verildi")
			var ids_d: Array = NM.get_bot_ids()
			for bid: int in ids_d:
				if ap.has(bid):
					var nl: Variant = ap[bid].get("name_label")
					_check(nl == null or not bool(nl.visible), "D: bot %d isim etiketi görünür!" % bid)
			# Aynı lobi takımındaki 2 botu 4 m arayla görüş hattına koy → birbirine ateş edip hasar vermeli
			if ids_d.size() >= 2 and ap.has(ids_d[0]) and ap.has(ids_d[1]):
				var da: Node3D = ap[ids_d[0]]
				var db: Node3D = ap[ids_d[1]]
				db.global_position = da.global_position + Vector3(4.0, 0.0, 0.0)
				start_pos[ids_d[1]] = db.global_position
			var dm_rank: Array = GM.get_deathmatch_ranking()
			var dm_mvps: Array = GM.get_deathmatch_mvps()
			_check(dm_rank.size() == 4, "D: ranking 4 değil: %d" % dm_rank.size())
			_check(dm_mvps.size() == 4, "D: 4'lü tam eşitlikte 4 MVP beklenirdi: %d" % dm_mvps.size())
		elif scenario == "K":
			# İki botu 2.5 m arayla yan yana koy (farklı takımlar) → bıçakla karşılaşsınlar
			var ids: Array = NM.get_bot_ids()
			if ids.size() >= 2 and ap.has(ids[0]) and ap.has(ids[1]):
				var a: Node3D = ap[ids[0]]
				var b: Node3D = ap[ids[1]]
				b.global_position = a.global_position + Vector3(2.5, 0.0, 0.0)
				start_pos[ids[1]] = b.global_position
				for bid: int in ids:
					var knife: bool = bool(ap[bid].is_knife_mode())
					if not knife:
						knife_flags_ok = false
			_check(knife_flags_ok, "K: botlarda is_knife_mode() false")
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
			if scenario == "K" and float(p.get("_stab_timer")) > 0.0:
				stab_seen = true
			if scenario == "D" and (float(p.get("health")) < float(p.get("max_health")) or bool(p.get("is_dead"))):
				dm_dmg_seen = true


func _evaluate() -> void:
	if scenario == "A":
		var best := 0.0
		for bid: int in max_move:
			best = maxf(best, float(max_move[bid]))
		notes.append("max_yer_degistirme=%s" % [max_move])
		_check(best > MOVE_MIN, "hiçbir bot %.1f m'den fazla hareket etmedi (en fazla %.2f)" % [MOVE_MIN, best])
		notes.append("state=%d" % int(GM.state))
	elif scenario == "K":
		_check(stab_seen, "K: sadece bıçak modunda hiçbir bot %d sn içinde bıçak vurmadı" % (K_RUN_MS / 1000))
	elif scenario == "D":
		_check(dm_dmg_seen, "D: Deathmatch'te aynı lobi takımındaki botlar %d sn içinde birbirine hasar vermedi" % (D_RUN_MS / 1000))
	elif scenario == "C":
		_check(int(GM.state) == 4, "C: Kartlı Ölüm Maçı kapı açılarak bitmedi (state=%d)" % int(GM.state))
		_check(int(GM.winning_peer_id) == 1, "C: winning_peer_id host (1) değil: %d" % int(GM.winning_peer_id))
		_check(String(GM.end_reason) == "card", "C: end_reason 'card' değil: %s" % String(GM.end_reason))
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
