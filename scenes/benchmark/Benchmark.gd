## Benchmark.gd — sistem gereksinimi ölçümü (otomatik, tek kişilik botlu maç).
##
## Çalıştırma: `TacticalDark.exe --sysbench` (editörde: Hata Ayıkla → Çalıştırma Örnekleri argümanı). Godot'nun KENDİ
## `--benchmark` bayrağı var (motor açılış süresi) → çakışmasın diye ad `--sysbench`. Seçenekler (hepsi isteğe bağlı):
##   --sysbench-map=desert_v3        harita id'si (NetworkManager.MAPS) — varsayılan en ağır dokulu harita
##   --sysbench-presets=low,medium,high,ultra   ölçülecek kalite profilleri (sırayla, aynı maç içinde)
##   --sysbench-seconds=30           profil başına ölçüm süresi (öncesinde SETTLE_TIME ısınma ölçülmez)
##   --sysbench-quit                 bitince oyunu kapat (toplu test için)
##
## Akış: Main.gd argümanı görürse menüyü yüklemez, bu düğümü root'a ekler → host kurar (LAN yayını kapalı), haritanın
## en büyük formatında botlarla doldurur (desert_v3 = 5v5v5v5 = 20 oyuncu), süreli mod 30 dk (kart teslimi maçı erken
## bitirmesin) → maç başlayınca kamera botları sırayla izler (çatışma görüntüde olsun), her 5 sn izlenen bot sis/bomba/flaş atar.
## Her profil: GameSettings.values bellekte değişir (KAYDEDİLMEZ), vsync kapalı + FPS sınırsız → apply_all → ölç.
## Bitince ayarlar dosyadan geri yüklenir, menüye dönülür, sonuç tablosu ekranda kalır.
## Çıktı: user://benchmark.csv (her profil bir satır, dosyaya EKLENİR — farklı makinelerin CSV'leri birleştirilebilir)
##        + user://benchmark_<tarih>.txt (okunur rapor). Oyuncu ayar dosyasına dokunulmaz.

extends Node

const SETTINGS := preload("res://scenes/settings/GameSettings.gd")

const DEFAULT_MAP := "desert_v3"
const DEFAULT_SECONDS := 30.0
const SETTLE_TIME := 4.0          # profil değişince (shader/gölge atlası yeniden kurulumu) ölçülmeyen süre
const LIVE_SETTLE := 3.0          # maç başlayınca ilk ışınlanma/derleme dalgası
const MATCH_WAIT_MS := 180000     # yükleme + geri sayım için en fazla
const SPECTATE_SWITCH := 9.0      # kamera bu aralıkla başka bota geçer
const EVENT_INTERVAL := 5.0       # izlenen bot bu aralıkla sis/bomba/flaş atar
const EVENT_CYCLE := ["smoke", "bomb", "flash", "bomb"]
const HITCH_MS := 50.0            # bu süreden uzun kare = takılma

## CLI adı → GameSettings.PRESETS anahtarı
const PRESET_IDS := {"low": "Düşük", "medium": "Orta", "high": "Yüksek", "ultra": "Ultra"}

## Ölçüm sondası: en SON çalışan düğüm (öncelik +1e6) — Benchmark (öncelik -1e6) en önce çalışır,
## aradaki fark = o karedeki/fizik adımındaki TÜM betiklerin süresi (move_and_slide ve fizik sorguları dahil).
## AI bandı: tüm BotBrain'ler AI_PRIORITY'ye alınır, önüne/arkasına birer sonda → yapay zekânın adım başı süresi AYRI.
## Bantlar: betik adı → fizik önceliği. Yeni eklenen her düğüm (node_added) betiğine göre banda alınır;
## bandın önünde/arkasında sonda → o grubun adım başı toplam süresi. Bant dışı kalan = "diğer".
## (Bot Player'ları: sadece botlar — yerel insan oyuncu varsayılan önceliğinde kalır, kamera takibi bozulmasın.)
const AI_PRIORITY := 500000
const BANDS := {"ai": 500000, "player": 400000, "bullet": 300000}
const BAND_SCRIPTS := {"BotBrain.gd": "ai", "Player.gd": "player", "Bullet.gd": "bullet"}
class Probe extends Node:
	var bench: Node
	var kind := "end"     # "end" | "s:<bant>" | "e:<bant>"
	func _ready() -> void:
		var pr := 1000000
		if kind != "end":
			pr = int(BANDS[kind.substr(2)]) + (-1 if kind.begins_with("s:") else 1)
		process_priority = pr
		process_physics_priority = pr
		process_mode = Node.PROCESS_MODE_ALWAYS
		set_process(kind == "end")
	func _process(_d: float) -> void:
		if is_instance_valid(bench):
			bench.call("_probe_process_end")
	func _physics_process(_d: float) -> void:
		if is_instance_valid(bench):
			bench.call("_probe_physics", kind)


var _map_id := DEFAULT_MAP
var _seconds := DEFAULT_SECONDS
var _bots := -1                   # -1 = haritanın en büyük formatını doldur
var _no_brain := false            # tanı: BotBrain'leri durdur (botlar durur ama Player fiziği sürer) → yapay zekâ maliyeti ayrılır
var _proc_start := 0
var _band_start: Dictionary = {}  # bant → µs
var _band_us: Dictionary = {}     # bant → ölçüm boyunca toplam µs
var _ai_us := 0.0                 # ölçüm boyunca BotBrain toplamı (µs)
# Donma kaydı: o karedeki fizik adımı sayısı / en uzun adım / AI süresi + son senaryo olayı
var _frame_ticks := 0
var _frame_tick_max_us := 0.0
var _frame_ai_us := 0.0
var _last_event := ""
var _last_event_t := 0.0
var _spikes: Array[Dictionary] = []
var _phys_start := 0
var _proc_us := 0.0               # ölçüm boyunca betik process toplamı (µs)
var _phys_us := 0.0               # ölçüm boyunca betik fizik toplamı (µs)
var _phys_ticks := 0
var _phys_tick_max_us := 0.0
var _quit_after := false
var _presets: Array[String] = ["low", "medium", "high", "ultra"]

var NM: Node
var GM: Node
var _phase := ""
var _phase_t := 0.0               # aşamanın başladığı an (sn, gerçek zaman)
var _preset_i := -1
var _rng := RandomNumberGenerator.new()

# Ölçüm (o anki profil)
var _frames: PackedFloat32Array = PackedFloat32Array()   # kare süreleri (ms)
var _gpu_ms := 0.0
var _rcpu_ms := 0.0
var _logic_ms := 0.0
var _draws := 0.0
var _prims := 0.0
var _vram_max := 0.0
var _ram_max := 0.0
var _samples := 0
var _results: Array[Dictionary] = []
var _notes: Array[String] = []

# Senaryo
var _spectated: Node3D = null
var _next_switch := 0.0
var _next_event := 0.0
var _event_i := 0

var launched_from_ui := false
var _probes: Array[Node] = []
var _saved_settings: Dictionary = {}
var _saved_win_mode: int = DisplayServer.WINDOW_MODE_WINDOWED
var _saved_win_size: Vector2i = Vector2i.ZERO
var _cancelled := false

# Arayüz
var _layer: CanvasLayer
var _status_bar: HBoxContainer
var _status: Label
var _result_panel: PanelContainer


static var _ran := false   # CLI --sysbench bitince return_to_menu → Main.tscn yeniden açılır; ikinci kez başlamasın


static func requested() -> bool:
	if _ran:
		return false
	for a in OS.get_cmdline_args() + OS.get_cmdline_user_args():
		if String(a) == "--sysbench" or String(a).begins_with("--sysbench-"):
			return true
	return false


## Oyun içi Ayarlar menüsünden başlatma (tekrar çalıştırılabilir; aynı anda tek örnek)
static func start_in_game(tree: SceneTree) -> Node:
	if tree == null or tree.root.get_node_or_null("Benchmark") != null:
		return null
	var bench: Node = (load("res://scenes/benchmark/Benchmark.gd") as GDScript).new()
	bench.name = "Benchmark"
	bench.set("launched_from_ui", true)
	tree.root.add_child.call_deferred(bench)
	return bench


func _ready() -> void:
	if not launched_from_ui:
		_ran = true
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = -1000000
	process_physics_priority = -1000000
	var kinds: Array[String] = ["end"]
	for b: String in BANDS:
		kinds.append("s:" + b)
		kinds.append("e:" + b)
	for k in kinds:
		var pb := Probe.new()
		pb.bench = self
		pb.kind = k
		pb.name = "BenchProbe_" + k.replace(":", "_")
		_probes.append(pb)
		get_tree().root.add_child.call_deferred(pb)
	get_tree().node_added.connect(_on_node_added)
	_rng.seed = 7777   # her makinede aynı kamera/olay sırası
	if not launched_from_ui:
		_parse_args()
	NM = get_node("/root/NetworkManager")
	GM = get_node("/root/GameManager")
	GM.is_benchmark = true
	_saved_settings = SETTINGS.get_all()
	_saved_win_mode = DisplayServer.window_get_mode()
	_saved_win_size = DisplayServer.window_get_size()
	_build_ui()
	if DisplayServer.get_name() == "headless":
		print("SYSBENCH: headless modda ölçüm anlamsız (çizim yok) — pencereli çalıştırın.")
		_cleanup_runtime()
		get_tree().quit(1)
		return
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	_setup_window()
	_set_phase("start")


func _exit_tree() -> void:
	_cleanup_runtime()
	if GM != null and is_instance_valid(GM):
		GM.is_benchmark = false


func _input(event: InputEvent) -> void:
	if _phase == "done":
		return
	if event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		_cancel()


func _cleanup_runtime() -> void:
	var tree := get_tree()
	if tree != null and tree.node_added.is_connected(_on_node_added):
		tree.node_added.disconnect(_on_node_added)
	for pb in _probes:
		if is_instance_valid(pb):
			pb.queue_free()
	_probes.clear()
	var vp := get_viewport()
	if vp != null:
		RenderingServer.viewport_set_measure_render_time(vp.get_viewport_rid(), false)


func _restore_settings() -> void:
	if not _saved_settings.is_empty():
		SETTINGS.set_all(_saved_settings)
	else:
		SETTINGS.load_settings()
	if SETTINGS._has_file:
		SETTINGS._apply_window()
	elif _saved_win_size.x > 0 and _saved_win_size.y > 0:
		DisplayServer.window_set_mode(_saved_win_mode)
		if _saved_win_mode == DisplayServer.WINDOW_MODE_WINDOWED:
			DisplayServer.window_set_size(_saved_win_size)
	SETTINGS.apply_all(get_tree())


func _cancel() -> void:
	if _phase == "done":
		return
	_cancelled = true
	_notes.append("Kullanıcı tarafından iptal edildi")
	_finish()


func _parse_args() -> void:
	for a in OS.get_cmdline_args() + OS.get_cmdline_user_args():
		var s := String(a)
		if s.begins_with("--sysbench-map="):
			_map_id = s.get_slice("=", 1)
		elif s.begins_with("--sysbench-seconds="):
			_seconds = clampf(s.get_slice("=", 1).to_float(), 5.0, 600.0)
		elif s.begins_with("--sysbench-presets="):
			var list: Array[String] = []
			for p in s.get_slice("=", 1).split(",", false):
				if PRESET_IDS.has(p.strip_edges().to_lower()):
					list.append(p.strip_edges().to_lower())
			if not list.is_empty():
				_presets = list
		elif s.begins_with("--sysbench-bots="):
			_bots = maxi(0, s.get_slice("=", 1).to_int())
		elif s == "--sysbench-nobrain":
			_no_brain = true
		elif s == "--sysbench-quit":
			_quit_after = true


## Ölçüm çözünürlüğü sabit olsun: ekran tam 1920×1080 ise tam ekran, büyükse 1920×1080 pencere, küçükse ekranın kendisi.
func _setup_window() -> void:
	var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen()).size
	var v := {"vsync": 0, "max_fps": 0, "show_fps": false}
	if usable.x >= 1920 and usable.y >= 1080:
		v["window_mode"] = SETTINGS.WindowMode.WINDOWED
		v["resolution"] = Vector2i(1920, 1080)
	else:
		v["window_mode"] = SETTINGS.WindowMode.BORDERLESS
	SETTINGS.set_all(v)
	SETTINGS._apply_window()   # kayıt dosyası olmasa da uygula (apply_all sadece dosya varsa pencereye dokunur)
	SETTINGS.apply_all(get_tree())


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


func _set_phase(p: String) -> void:
	_phase = p
	_phase_t = _now()


func _physics_process(_d: float) -> void:
	_phys_start = Time.get_ticks_usec()


func _probe_physics(kind: String) -> void:
	if _phase != "measure":
		return
	var now := Time.get_ticks_usec()
	if kind == "end":
		if _phys_start > 0:
			var us := float(now - _phys_start)
			_phys_us += us
			_phys_ticks += 1
			_phys_tick_max_us = maxf(_phys_tick_max_us, us)
			_frame_ticks += 1
			_frame_tick_max_us = maxf(_frame_tick_max_us, us)
		return
	var band := kind.substr(2)
	if kind.begins_with("s:"):
		_band_start[band] = now
	elif int(_band_start.get(band, 0)) > 0:
		var a := float(now - int(_band_start[band]))
		_band_us[band] = float(_band_us.get(band, 0.0)) + a
		if band == "ai":
			_ai_us += a
			_frame_ai_us += a


## Yeni düğüm betiğine göre ölçüm bandına (bot Player'ı / BotBrain / Bullet)
func _on_node_added(n: Node) -> void:
	var sc: Script = n.get_script()
	if sc == null:
		return
	var band: String = BAND_SCRIPTS.get(sc.resource_path.get_file(), "")
	if band.is_empty():
		return
	if band == "player":
		_band_player.call_deferred(n)   # is_bot initialize()'da belli olur
		return
	n.process_physics_priority = int(BANDS[band])


func _band_player(n: Node) -> void:
	if is_instance_valid(n) and bool(n.get("is_bot")):
		n.process_physics_priority = int(BANDS["player"])


## Maç başında zaten var olan düğümler (node_added'den önce doğmuş olabilir)
func _band_brains() -> void:
	for b in _alive_bots():
		if b.process_physics_priority != int(BANDS["player"]):
			b.process_physics_priority = int(BANDS["player"])
		for ch in b.get_children():
			if ch.process_physics_priority != AI_PRIORITY:
				var sc: Script = ch.get_script()
				if sc != null and sc.resource_path.ends_with("BotBrain.gd"):
					ch.process_physics_priority = AI_PRIORITY


func _probe_process_end() -> void:
	if _phase == "measure" and _proc_start > 0:
		_proc_us += float(Time.get_ticks_usec() - _proc_start)


func _process(delta: float) -> void:
	_proc_start = Time.get_ticks_usec()
	var el := _now() - _phase_t
	match _phase:
		"start":
			if el > 0.5:
				_start_match()
		"wait_select":
			var cs := get_tree().current_scene
			if int(GM.state) == 2 and cs != null and cs.name.contains("Character"):
				NM.request_select_character("Tank")
				_set_phase("wait_live")
			elif el * 1000.0 > 30000:
				_abort("karakter seçimine geçilmedi")
			_show("Maç hazırlanıyor…")
		"wait_live":
			if bool(GM.match_live):
				_set_phase("live_settle")
			elif el * 1000.0 > MATCH_WAIT_MS:
				_abort("maç başlamadı")
			else:
				_show("Harita yükleniyor / geri sayım… %d sn" % int(el))
		"live_settle":
			_drive_scenario()
			_band_brains()
			if _no_brain:
				for b in _alive_bots():
					for ch in b.get_children():
						var sc: Script = ch.get_script()
						if sc != null and sc.resource_path.ends_with("BotBrain.gd"):
							ch.process_mode = Node.PROCESS_MODE_DISABLED
							b.call("_reset_bot_input")
			if el > LIVE_SETTLE:
				_next_preset()
		"settle":
			_drive_scenario()
			_show("%s · hazırlanıyor" % _preset_label())
			if el > SETTLE_TIME:
				_reset_measure()
				_set_phase("measure")
		"measure":
			_drive_scenario()
			_band_brains()
			_sample(delta)
			var fps := 1000.0 / maxf(_avg(_frames), 0.001) if _frames.size() > 0 else 0.0
			_show("%s · %d / %d sn · %d FPS" % [_preset_label(), int(el), int(_seconds), int(fps)])
			if int(GM.state) != 3:
				_notes.append("maç ölçüm sırasında bitti (%s)" % _preset_label())
				_finish_preset()
				_finish()
			elif el >= _seconds:
				_finish_preset()
				_next_preset()


func _start_match() -> void:
	var max_team: int = NM.get_map_max_team(_map_id)
	NM.create_server("Benchmark", "Benchmark-%d" % _rng.randi_range(1000, 9999), str(_rng.randi()),
		{"map": _map_id, "team_size": max_team, "win_mode": "timed", "match_minutes": 30})
	if not NM.is_host():
		_abort("sunucu kurulamadı (port 7777 dolu olabilir — açık oyun penceresi var mı?)")
		return
	var rm := get_node_or_null("/root/RoomManager")
	if rm != null:
		rm.stop_hosting()   # LAN'da "Benchmark" odası görünmesin
	_map_id = String(NM.get_map_info()["id"])
	NM.request_change_team(0)
	var want := max_team * 4 - 1 if _bots < 0 else mini(_bots, max_team * 4 - 1)
	var added := 0
	var t := 1
	var guard := 0
	while added < want and guard < 200:
		guard += 1   # takımlara sırayla dağıt (önce rakipler — kamera çatışma görsün)
		if NM.add_bot(t) > 0:
			added += 1
		elif _team_full_all(max_team):
			break
		t = (t + 1) % 4
	GM.start_game()
	_set_phase("wait_select")


func _team_full_all(max_team: int) -> bool:
	return NM.players.size() >= max_team * 4


func _preset_label() -> String:
	return String(PRESET_IDS[_presets[_preset_i]]) if _preset_i >= 0 and _preset_i < _presets.size() else ""


func _next_preset() -> void:
	_preset_i += 1
	if _preset_i >= _presets.size():
		_finish()
		return
	var p: Dictionary = SETTINGS.PRESETS[PRESET_IDS[_presets[_preset_i]]].duplicate()
	p["vsync"] = 0
	p["max_fps"] = 0
	SETTINGS.set_all(p)
	SETTINGS.apply_all(get_tree())
	_set_phase("settle")


# ─────────────────────────────────────────────
#  Senaryo: kamera botları izler, izlenen bot düzenli bomba/sis/flaş atar
# ─────────────────────────────────────────────

func _drive_scenario() -> void:
	var t := _now()
	if _spectated == null or not is_instance_valid(_spectated) or bool(_spectated.get("is_dead")) or t >= _next_switch:
		_switch_spectate()
		_next_switch = t + SPECTATE_SWITCH
	if t >= _next_event and _spectated != null and is_instance_valid(_spectated):
		_next_event = t + EVENT_INTERVAL
		_last_event = String(EVENT_CYCLE[_event_i % EVENT_CYCLE.size()])
		_last_event_t = t
		_throw_event(_last_event)
		_event_i += 1


func _alive_bots() -> Array[Node3D]:
	var out: Array[Node3D] = []
	for pid: int in GM.active_players:
		var pl: Variant = GM.active_players[pid]
		if NM.is_bot(pid) and pl != null and is_instance_valid(pl) and not bool(pl.get("is_dead")):
			out.append(pl)
	return out


func _switch_spectate() -> void:
	var bots := _alive_bots()
	if bots.is_empty():
		# Botsuz senaryo: kamera yerel oyuncuda kalır, olayları o atar
		var me: Variant = GM.active_players.get(NM.get_local_id())
		_spectated = me if me != null and is_instance_valid(me) else null
		return
	_spectated = bots[_rng.randi_range(0, bots.size() - 1)]
	var cam := get_viewport().get_camera_3d()
	if cam != null and cam.has_method("spectate"):
		cam.spectate(_spectated)


func _throw_event(kind: String) -> void:
	var map := get_tree().current_scene
	var pm := map.get_node_or_null("PowerupManager") if map != null else null
	if pm == null or not pm.has_method("_throw_bomb"):
		return
	var pid: int = int(_spectated.get("peer_id"))
	var team: int = int(_spectated.get("team_id"))
	var ang := _rng.randf() * TAU
	var aim := _spectated.global_position + Vector3(cos(ang), 0.0, sin(ang)) * _rng.randf_range(4.0, 8.0)
	pm._throw_bomb(pid, team, _spectated, aim, kind == "flash", kind == "smoke")


# ─────────────────────────────────────────────
#  Ölçüm
# ─────────────────────────────────────────────

func _reset_measure() -> void:
	_frames = PackedFloat32Array()
	_gpu_ms = 0.0
	_rcpu_ms = 0.0
	_logic_ms = 0.0
	_draws = 0.0
	_prims = 0.0
	_vram_max = 0.0
	_ram_max = 0.0
	_samples = 0
	_proc_us = 0.0
	_phys_us = 0.0
	_phys_ticks = 0
	_phys_tick_max_us = 0.0
	_ai_us = 0.0
	_band_us.clear()
	_frame_ticks = 0
	_frame_tick_max_us = 0.0
	_frame_ai_us = 0.0


## delta = BİR ÖNCEKİ karenin süresi; o karenin fizik adımları bu _process'ten önce sayıldı (_frame_*).
func _sample(delta: float) -> void:
	var ms := delta * 1000.0
	_frames.append(ms)
	if ms > HITCH_MS and _spikes.size() < 200:
		var ev := "%s (%.1f sn önce)" % [_last_event, _now() - _last_event_t] if not _last_event.is_empty() else "-"
		_spikes.append({"preset": _preset_label(), "t": _now() - _phase_t, "ms": ms, "ticks": _frame_ticks,
			"tick_max": _frame_tick_max_us / 1000.0, "ai": _frame_ai_us / 1000.0, "event": ev})
	_frame_ticks = 0
	_frame_tick_max_us = 0.0
	_frame_ai_us = 0.0
	var vp := get_viewport().get_viewport_rid()
	_gpu_ms += RenderingServer.viewport_get_measured_render_time_gpu(vp)
	_rcpu_ms += RenderingServer.viewport_get_measured_render_time_cpu(vp) + RenderingServer.get_frame_setup_time_cpu()
	_draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	_prims += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
	_vram_max = maxf(_vram_max, Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED))
	_ram_max = maxf(_ram_max, Performance.get_monitor(Performance.MEMORY_STATIC))
	_samples += 1


func _avg(a: PackedFloat32Array) -> float:
	if a.is_empty():
		return 0.0
	var s := 0.0
	for v in a:
		s += v
	return s / a.size()


func _finish_preset() -> void:
	if _frames.size() < 10:
		return
	var sorted := _frames.duplicate()
	sorted.sort()
	var n := sorted.size()
	var total := 0.0
	for v in sorted:
		total += v
	var worst_n := maxi(1, n / 100)
	var worst := 0.0
	for i in worst_n:
		worst += sorted[n - 1 - i]
	worst /= worst_n
	var hitches := 0
	for v in sorted:
		if v > HITCH_MS:
			hitches += 1
	var k := float(maxi(_samples, 1))
	var frame_ms := total / n
	var gpu := _gpu_ms / k
	var ticks_pf := float(_phys_ticks) / n
	var phys_tick := _phys_us / maxf(_phys_ticks, 1) / 1000.0
	var proc := _proc_us / n / 1000.0
	var rcpu := _rcpu_ms / k
	# Mantık yükü 60 Hz'de: saniyede 60 fizik adımı × adım süresi + kare başı process. Bu 1000 ms'yi zorlarsa
	# FPS düştükçe kare başına daha çok fizik adımı biner (sarmal) → CPU darboğazı.
	var cpu_frame := proc + phys_tick * ticks_pf + rcpu
	var r := {
		"preset": _preset_label(),
		"render": "%dx%d" % [int(DisplayServer.window_get_size().x * get_viewport().scaling_3d_scale),
			int(DisplayServer.window_get_size().y * get_viewport().scaling_3d_scale)],
		"fps_avg": 1000.0 * n / total,
		"fps_low1": 1000.0 / worst,
		"p99_ms": sorted[clampi(int(n * 0.99), 0, n - 1)],
		"max_ms": sorted[n - 1],
		"hitches": hitches,
		"frame_ms": frame_ms,
		"gpu_ms": gpu,
		"rcpu_ms": rcpu,
		"proc_ms": proc,
		"phys_tick_ms": phys_tick,
		"phys_tick_max_ms": _phys_tick_max_us / 1000.0,
		"ai_tick_ms": _ai_us / maxf(_phys_ticks, 1) / 1000.0,
		"player_tick_ms": float(_band_us.get("player", 0.0)) / maxf(_phys_ticks, 1) / 1000.0,
		"bullet_tick_ms": float(_band_us.get("bullet", 0.0)) / maxf(_phys_ticks, 1) / 1000.0,
		"ticks_pf": ticks_pf,
		"cpu_ms": cpu_frame,
		"draws": _draws / k,
		"prims": _prims / k,
		"vram_mb": _vram_max / 1048576.0,
		"ram_mb": _ram_max / 1048576.0,
		"bottleneck": "GPU" if gpu >= cpu_frame else "CPU",
	}
	r["verdict"] = _verdict(r)
	_results.append(r)
	print("SYSBENCH %s: ort %.1f FPS, %%1 düşük %.1f, kare %.1f ms = gpu %.2f | cpu %.2f (process %.2f + fizik %.2f ms [AI %.2f, bot gövde %.2f, mermi %.2f] × %.2f adım + çizim %.2f), fizik adımı en kötü %.1f ms, darboğaz %s" % [
		r.preset, r.fps_avg, r.fps_low1, frame_ms, gpu, cpu_frame, proc, phys_tick, r.ai_tick_ms, r.player_tick_ms, r.bullet_tick_ms,
		ticks_pf, rcpu, r.phys_tick_max_ms, r.bottleneck])


func _verdict(r: Dictionary) -> String:
	if float(r.fps_avg) >= 60.0 and float(r.fps_low1) >= 40.0:
		return "AKICI"
	if float(r.fps_avg) >= 30.0 and float(r.fps_low1) >= 20.0:
		return "OYNANIR"
	return "YETERSİZ"


# ─────────────────────────────────────────────
#  Bitiş: dosyalar + tablo
# ─────────────────────────────────────────────

func _machine() -> Dictionary:
	var mem := OS.get_memory_info()
	var v := Engine.get_version_info()
	return {
		"os": "%s %s" % [OS.get_name(), OS.get_version()],
		"cpu": OS.get_processor_name(),
		"cores": OS.get_processor_count(),
		"ram_gb": float(mem.get("physical", 0)) / 1073741824.0,
		"gpu": RenderingServer.get_video_adapter_name(),
		"gpu_vendor": RenderingServer.get_video_adapter_vendor(),
		"api": "%s %s" % [RenderingServer.get_current_rendering_driver_name(), RenderingServer.get_video_adapter_api_version()],
		"godot": "%d.%d.%d" % [v.major, v.minor, v.patch],
		"window": "%dx%d" % [DisplayServer.window_get_size().x, DisplayServer.window_get_size().y],
	}


func _recommended_preset() -> String:
	var best_fluid := ""
	var best_playable := ""
	for r: Dictionary in _results:
		var v := String(r.get("verdict", ""))
		var p := String(r.get("preset", ""))
		if v == "AKICI":
			best_fluid = p
		elif v == "OYNANIR":
			best_playable = p
	if not best_fluid.is_empty():
		return best_fluid
	if not best_playable.is_empty():
		return best_playable
	return "Düşük" if not _results.is_empty() else ""


func _finish() -> void:
	if _phase == "done":
		return
	_set_phase("done")
	_cleanup_runtime()
	var m := _machine()
	var stamp := Time.get_datetime_string_from_system().replace(":", "-")
	var players: int = NM.players.size()
	var report := _report_text(m, players)
	var txt_path := "user://benchmark_%s.txt" % stamp
	if not _results.is_empty() or not _cancelled:
		_write_csv(m, stamp, players)
		var f := FileAccess.open(txt_path, FileAccess.WRITE)
		if f != null:
			f.store_string(report)
			f.close()
		print(report)
		print("SYSBENCH dosyalar: %s , %s" % [ProjectSettings.globalize_path("user://benchmark.csv"), ProjectSettings.globalize_path(txt_path)])
	# Oyuncunun kendi ayarlarına dön (bellekteki profil değişikliklerini at)
	_restore_settings()
	if _quit_after:
		get_tree().quit(0)
		return
	GM.return_to_menu()
	if _cancelled and _results.is_empty():
		queue_free()
		return
	_show_results(report, txt_path)


func _abort(why: String) -> void:
	_notes.append("İPTAL: " + why)
	push_warning("SYSBENCH iptal: " + why)
	_finish()


func _write_csv(m: Dictionary, stamp: String, players: int) -> void:
	var path := "user://benchmark.csv"
	var is_new := not FileAccess.file_exists(path)
	var f := FileAccess.open(path, FileAccess.READ_WRITE if not is_new else FileAccess.WRITE)
	if f == null:
		return
	f.seek_end()
	if is_new:
		f.store_csv_line(PackedStringArray(["tarih", "cpu", "cekirdek", "ram_gb", "gpu", "api", "os", "godot", "harita", "oyuncu",
			"profil", "pencere", "3d_cozunurluk", "fps_ort", "fps_dusuk1", "p99_ms", "max_ms", "takilma", "kare_ms", "gpu_ms",
			"cpu_ms", "process_ms", "fizik_adim_ms", "ai_adim_ms", "fizik_adim_max_ms", "adim_kare", "cizim_cpu_ms", "draw_call", "ucgen",
			"vram_mb", "ram_mb", "darbogaz", "sonuc"]))
	for r: Dictionary in _results:
		f.store_csv_line(PackedStringArray([stamp, m.cpu, str(m.cores), "%.1f" % m.ram_gb, m.gpu, m.api, m.os, m.godot, _map_id,
			str(players), r.preset, m.window, r.render, "%.1f" % r.fps_avg, "%.1f" % r.fps_low1, "%.1f" % r.p99_ms,
			"%.1f" % r.max_ms, str(r.hitches), "%.2f" % r.frame_ms, "%.2f" % r.gpu_ms, "%.2f" % r.cpu_ms, "%.2f" % r.proc_ms,
			"%.2f" % r.phys_tick_ms, "%.2f" % r.ai_tick_ms, "%.2f" % r.phys_tick_max_ms, "%.2f" % r.ticks_pf, "%.2f" % r.rcpu_ms, "%d" % r.draws,
			"%d" % r.prims, "%d" % r.vram_mb, "%d" % r.ram_mb, r.bottleneck, r.verdict]))
	f.close()


func _report_text(m: Dictionary, players: int) -> String:
	var s := "TACTICALDARK SİSTEM TESTİ\n"
	s += "İşlemci : %s (%d çekirdek)\n" % [m.cpu, m.cores]
	s += "Bellek  : %.1f GB\n" % m.ram_gb
	s += "Ekran k.: %s  [%s]\n" % [m.gpu, m.api]
	s += "Sistem  : %s · Godot %s · pencere %s\n" % [m.os, m.godot, m.window]
	s += "Senaryo : %s, %d oyuncu (botlar), sis/bomba/flaş, %d sn/profil\n\n" % [_map_id, players, int(_seconds)]
	s += "%-8s %-10s %6s %7s %7s %6s %7s %7s %8s %6s %6s %6s  %s\n" % ["PROFİL", "3D", "FPS", "%1 DÜŞ", "MAX ms", "TAKIL",
		"GPU ms", "CPU ms", "FİZİK ms", "AI ms", "VRAM", "DARB.", "SONUÇ"]
	for r: Dictionary in _results:
		s += "%-8s %-10s %6.1f %7.1f %7.1f %6d %7.2f %7.2f %8.2f %6.2f %6d %6s  %s\n" % [r.preset, r.render, r.fps_avg, r.fps_low1,
			r.max_ms, r.hitches, r.gpu_ms, r.cpu_ms, r.phys_tick_ms, r.ai_tick_ms, int(r.vram_mb), r.bottleneck, r.verdict]
	if _results.is_empty():
		s += "(ölçüm yok)\n"
	if not _spikes.is_empty():
		var top := _spikes.duplicate()
		top.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.ms) > float(b.ms))
		s += "\nEN UZUN KARELER (toplam %d takılma)\n" % _spikes.size()
		s += "%-8s %6s %7s %6s %10s %7s  %s\n" % ["PROFİL", "SN", "KARE ms", "ADIM", "ADIM max", "AI ms", "SON OLAY"]
		for i in mini(top.size(), 10):
			var p: Dictionary = top[i]
			s += "%-8s %6.1f %7.1f %6d %10.1f %7.1f  %s\n" % [p.preset, p.t, p.ms, p.ticks, p.tick_max, p.ai, p.event]
	for n in _notes:
		s += "\nNot: " + n
	s += "\nCPU ms = kare başına betik + fizik adımları + çizim hazırlığı (botların simülasyonu dahil — host yükü).\n"
	s += "FİZİK ms = bir fizik adımının (saniyede 60) ortalama süresi; 16.7 ms'yi aşarsa oyun yetişemez. AI ms = bunun bot yapay zekâsı kısmı.\n"
	s += "Takılma satırı: ADIM max düşük + KARE ms yüksek → betik dışı (çizim/shader derleme/yükleme); ADIM max yüksek → oyun mantığı.\n"
	s += "AKICI: ort ≥60 ve %1 ≥40 · OYNANIR: ort ≥30 ve %1 ≥20\n"
	return s


# ─────────────────────────────────────────────
#  Arayüz (teknik araç — metinler çeviri dışı)
# ─────────────────────────────────────────────

func _build_ui() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 125
	add_child(_layer)
	_status_bar = HBoxContainer.new()
	_status_bar.position = Vector2(24, 24)
	_status_bar.add_theme_constant_override("separation", 18)
	_layer.add_child(_status_bar)
	_status = Label.new()
	_status.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_status.add_theme_font_size_override("font_size", 22)
	_status.add_theme_color_override("font_color", Color(1.0, 0.8, 0.35))
	_status.add_theme_color_override("font_outline_color", Color.BLACK)
	_status.add_theme_constant_override("outline_size", 6)
	_status_bar.add_child(_status)
	var cancel_btn := Button.new()
	cancel_btn.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	cancel_btn.text = "İPTAL (ESC)"
	cancel_btn.focus_mode = Control.FOCUS_NONE
	cancel_btn.pressed.connect(_cancel)
	_status_bar.add_child(cancel_btn)


func _show(text: String) -> void:
	_status.text = "SİSTEM TESTİ · " + text


func _show_results(report: String, txt_path: String) -> void:
	_status_bar.visible = false
	_result_panel = PanelContainer.new()
	_result_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_result_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_result_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.05, 0.06, 0.94)
	sb.border_color = Color(1, 1, 1, 0.3)
	sb.set_border_width_all(1)
	sb.set_content_margin_all(28)
	_result_panel.add_theme_stylebox_override("panel", sb)
	_layer.add_child(_result_panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 16)
	_result_panel.add_child(box)
	var lbl := Label.new()
	lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	lbl.text = report + "\nKaydedildi: " + ProjectSettings.globalize_path("user://benchmark.csv")
	var mono := SystemFont.new()
	mono.font_names = PackedStringArray(["Consolas", "Courier New", "monospace"])
	lbl.add_theme_font_override("font", mono)
	lbl.add_theme_font_size_override("font_size", 17)
	box.add_child(lbl)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 12)
	box.add_child(row)
	var rec := _recommended_preset()
	if not rec.is_empty() and SETTINGS.PRESETS.has(rec):
		var apply_btn := Button.new()
		apply_btn.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		apply_btn.text = "ÖNERİLENİ UYGULA (%s)" % rec
		apply_btn.theme_type_variation = "PrimaryButton"
		apply_btn.focus_mode = Control.FOCUS_NONE
		apply_btn.pressed.connect(func() -> void:
			var cur := SETTINGS.get_all()
			var p: Dictionary = SETTINGS.PRESETS[rec]
			for k: String in p:
				cur[k] = p[k]
			SETTINGS.set_all(cur)
			SETTINGS.save()
			SETTINGS.apply_all(get_tree())
			apply_btn.text = "UYGULANDI (%s) ✓" % rec
			apply_btn.disabled = true)
		row.add_child(apply_btn)
	var open_btn := Button.new()
	open_btn.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	open_btn.text = "KLASÖRÜ AÇ"
	open_btn.pressed.connect(func() -> void: OS.shell_open(ProjectSettings.globalize_path("user://")))
	row.add_child(open_btn)
	var close_btn := Button.new()
	close_btn.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	close_btn.text = "KAPAT"
	close_btn.pressed.connect(queue_free)
	row.add_child(close_btn)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
