## BotBrain.gd — bot oyuncunun beyni (SADECE host). GameManager bot Player'ına çocuk olarak ekler:
##   var b = preload("res://scenes/bots/BotBrain.gd").new(); player.add_child(b); b.setup(player, nav)
## Her fizik karesinde player.set_bot_input(move_dir, aim_pos, fire, reload, run, crouch, jump, stab) çağırır;
## hareket/ateş/şarjör/dayanıklılık/bıçak bekleme Player'ın kendi kodundan geçer (insanla aynı kurallar).
## Güç/bomba KULLANMAZ. Çömelme/zıplama seyrek ve rastgele; SADECE BIÇAK modunda rakibe koşup bıçaklar (arkadan yaklaşmayı dener).
## Zorluk: kolay-orta (uzun tepki, geniş nişan hatası, yavaş dönüş, seyrek seriler).
## Durumlar: WANDER (dolaş) · GO_CARD (görülen / ipucu verilen karta) · CARRY (takım N kartın hepsini tutuyor, taşıyıcı kapıya)
##           · ESCORT (taşıyıcıya eşlik) · HUNT (görülen rakip taşıyıcının / kaybedilen hedefin son konumu) · FIGHT (görülen rakip).
## Bilgi adaleti: kart = 7 m + görüş (duvar ışını) — maç UZARSA kademeli: ~4 dk sonra yaklaşık bölge ipucu (bazı botlar),
## ~6,5 dk sonra kesin konum; kapı = görüş menzilinde (12 m + ışın) KEŞFEDİLİR, bulunamazsa taşıyıcı arar; ~4 dk bölge ipucu, ~6,5 dk kesin konum.
## rakip = görüş + 18 m + önde ~130° koni (ya da 6 m içinde her yön — adım sesi; ateş için yine görüş şart).
## Isınmada (GameManager.match_live false) sadece dolaşır: ateş yok, kart yok.
## class_name YOK (proje kuralı).

extends Node

enum BotState { WANDER, GO_CARD, CARRY, ESCORT, HUNT, FIGHT }

# Algı
const PERCEPTION_INTERVAL := 0.2    # görüş ışınları bu aralıkla
const VIEW_RANGE := 18.0            # m
const VIEW_HALF_ANGLE := 65.0       # derece (toplam ~130° koni)
const HEAR_RANGE := 6.0             # m — her yönde (adım sesi)
const CARD_SEE_RANGE := 5.0         # m — kartı ancak bu kadar yakından (+ duvar ışını) fark eder
const DOOR_SEE_RANGE := 6.0        # m — kapı bölgesini (ışık sütunu) bu mesafeden + ışınla fark eder
# Maç UZARSA bilgi kademeli açılır (alive süresi değil, maç saati — _live_time)
const HINT_TIME := 240.0            # ~4 dk: kart/kapı için YAKLAŞIK bölge ipucu (bazı botlar kovalar)
const CARD_REVEAL_TIME := 390.0     # ~6,5 dk: kart + kapı KESİN konum
const HINT_FOLLOW_CHANCE := 0.65    # bir botun ipucuna yönelme olasılığı (bot başına bir kez seçilir)
const HINT_RADIUS_MIN := 9.0        # ipucu noktası gerçek yerden en az/en çok bu kadar uzak (m)
const HINT_RADIUS_MAX := 16.0
const HINT_ARRIVE := 5.0            # ipucu noktasına bu kadar yaklaşınca "burada yok" der, ipucunu bırakır
const EYE_HEIGHT := 1.3             # görüş ışını yüksekliği (m)
const TARGET_HEIGHT := 1.2          # hedef gövde ortası (m)
const CARD_HEIGHT := 0.5
const LOST_MEMORY := 3.0            # hedef kaybolunca son konumunu kovalama süresi (sn)
const HUNT_MEMORY := 12.0           # görülen rakip taşıyıcının son konumu bu kadar geçerli (sn)
const ALERT_MEMORY := 2.0           # duyulan (görülmeyen) rakibe dönüp bakma süresi

# Nişan / ateş (orta zorluk)
const REACTION_TIME := 0.9          # yeni hedefi görünce ateşe kadar gecikme (sn)
const REACTION_JITTER := 0.3
const AIM_TURN_SPEED := 3.2         # savaşta nişan dönüş hızı (rad/sn)
const IDLE_TURN_SPEED := 3.0        # yürürken bakış dönüş hızı
const AIM_ERR_BASE := 0.45          # nişan hatası: yanal ofset (m) = taban + mesafe × katsayı
const AIM_ERR_PER_M := 0.09
const AIM_ERR_SELF_MOVE := 0.35     # bot hareket ederken ek hata (m)
const AIM_ERR_TARGET_MOVE := 0.22   # hedef hareket ederken: hedef hızı (m/sn) × bu kadar ek hata
const AIM_ERR_WARMUP := 1.4         # hedefi ilk gördükten bu kadar sn boyunca hata azalarak normale iner
const AIM_ERR_WARMUP_MULT := 1.9    # ilk andaki hata çarpanı (ilk mermiler daha isabetsiz)
const AIM_ERR_RESAMPLE := 0.6       # nişan hatası yeniden seçim aralığı (sn)
const FIRE_ALIGN_MIN_DEG := 6.0     # nişan hedef noktasıyla bu açı içindeyse tetik
const BURST_MIN := 0.2              # tam otomatik seri süresi (sn)
const BURST_MAX := 0.4
const BURST_PAUSE_MIN := 0.4
const BURST_PAUSE_MAX := 0.9
const SEMI_GAP_MIN := 0.25          # yarı otomatik: silah ateş hızına eklenen bekleme (sn)
const SEMI_GAP_MAX := 0.7
const TACTICAL_RELOAD := 0.35       # kimse yokken şarjör bu oranın altındaysa doldur
const RELOAD_COOLDOWN := 0.6

# Hareket
const WAYPOINT_REACH := 0.6         # m — sonraki yol noktasına geç
const ARRIVE_DIST := 1.0            # m — hedefe vardı
const REPATH_INTERVAL := 1.0        # hareketli hedefe yolu bu aralıkla yenile (sn)
const REPATH_GOAL_MOVE := 1.5       # hedef bu kadar kayınca yolu hemen yenile (m)
const REPATH_MIN_GAP := 0.25        # iki yol hesabı arası en az (sn)
const STUCK_CHECK := 1.5            # takılma kontrol penceresi (sn)
const STUCK_MIN_PROGRESS := 0.3     # pencerede bundan az ilerlediyse takıldı (m)
const SIDESTEP_TIME := 0.5
const TELEPORT_DIST := 4.0          # tek karede bu kadar yer değiştirdiyse (doğuş/ışınlanma) yolu sıfırla
const DOOR_HOLD_DIST := 1.2         # kapıda bu mesafeye gelince durur (kilit yarıçapı 3 m)
const ESCORT_DIST := 4.0            # taşıyıcıya bu kadar yakınsa bekler
const ESCORT_RUN_DIST := 9.0        # taşıyıcıdan bu kadar uzaksa koşar
const STRAFE_MIN := 0.7             # savaşta yan adım yönü değiştirme aralığı (sn)
const STRAFE_MAX := 1.5
const FIGHT_TOO_CLOSE := 5.0        # bundan yakınsa geri çekilir
const FIGHT_PREFERRED_MAX := 16.0   # bundan uzaksa yaklaşır (silah menzili de sınırlar)
const WANDER_PAUSE_MIN := 0.4
const WANDER_PAUSE_MAX := 2.0
const AVOID_PROBE := 1.6            # nav yokken önde engel taraması (m)

# Duruş (çömelme / zıplama) — seyrek, rastgele; asıl sınırı Player'ın dayanıklılığı/beklemesi koyar
const CROUCH_FIGHT_RATE := 0.22     # çatışmada saniyede çömelme başlama olasılığı
const CROUCH_IDLE_RATE := 0.12      # durup beklerken (dolaşma molası)
const CROUCH_MIN := 0.7             # tek çömelme süresi (sn) — CROUCH_MAX_TIME (3 sn)'den çok kısa
const CROUCH_MAX := 1.5
const CROUCH_CD_MIN := 4.0          # iki çömelme arası bekleme
const CROUCH_CD_MAX := 9.0
const CROUCH_MIN_STAMINA := 0.6     # çömelme dayanıklılığı bunun altındaysa başlamaz
const JUMP_WALK_RATE := 0.05        # yürürken saniyede zıplama olasılığı
const JUMP_FIGHT_RATE := 0.1        # çatışmada (yan adım sırasında)
const JUMP_CD_MIN := 4.0
const JUMP_CD_MAX := 9.0
const JUMP_HOLD := 0.15             # Space basılı tutma süresi (sn)
const JUMP_UNSTICK_HOLD := 0.3
const JUMP_MIN_STAMINA := 0.45      # koşu dayanıklılığı (JUMP_STAMINA 0.2) — yetmezse denemez

# Bıçak
const KNIFE_APPROACH_BEHIND := 2.2  # bıçak modunda hedefin ARKASINA bu kadar (m) yaklaşmayı dener
const KNIFE_BEHIND_MIN_DIST := 4.5  # hedef bundan uzaksa arkasına dolanır, yakınsa doğrudan üstüne gider
const KNIFE_STAB_DIST := 1.65       # bu mesafede bıçaklar (Player.STAB_RANGE 1.9 m)
const KNIFE_HOLD_DIST := 1.0        # bundan yakınsa durur (üstüne yürümez)
const KNIFE_TURN_SPEED := 8.0       # bıçak modunda nişan dönüşü (yakın dövüş)
const KNIFE_REACTION_MULT := 0.5
const KNIFE_ALIGN_MAX_DEG := 35.0   # bıçak vurmak için hedefe bu açı içinde dönük olmalı (Player konisi ±60°)
const MELEE_CHANCE_RATE := 0.8      # normal modda çok yakındaki rakibe saniyede bıçak atma olasılığı
const MELEE_CD := 2.5

var _body: CharacterBody3D = null
var _pl = null                       # aynı Player (betik alanlarına dinamik erişim: is_dead, team_id, set_bot_input…)
var _nav = null                      # BotNav (hazır değilse null → düz çizgi + ışın kaçınma)
var _rng := RandomNumberGenerator.new()

var _state: int = BotState.WANDER
var _was_dead := true
var _live_time := 0.0
var _last_pos := Vector3.ZERO

# Algı durumu
var _perceive_left := 0.0
var _target = null                   # görülen rakip Player (yoksa null)
var _target_fire_clear := false      # arada takım arkadaşı yok
var _target_seen_pos := Vector3.ZERO
var _target_vel := Vector3.ZERO
var _target_lost_for := 99.0         # hedef en son ne zaman görüldü (sn)
var _last_seen_pos := Vector3.ZERO
var _last_seen_left := 0.0           # > 0: kaybedilen hedefin son konumu kovalanabilir
var _hunt_pos := Vector3.ZERO
var _hunt_left := 0.0
var _alert_pos := Vector3.ZERO
var _alert_left := 0.0
var _known_cards: Dictionary = {}    # card_id → bilinen yer konumu

# Nişan / ateş
var _aim_dir := Vector3.FORWARD
var _reaction_left := 0.0
var _err_left := 0.0
var _err_lat := 0.0
var _err_lead := 0.5
var _burst_left := 0.0
var _burst_pause := 0.0
var _semi_cd := 0.0
var _reload_cd := 0.0

# Hareket
var _path := PackedVector3Array()
var _path_idx := 0
var _path_goal := Vector3.INF
var _repath_left := 0.0
var _repath_gap := 0.0
var _stuck_left := STUCK_CHECK
var _stuck_ref := Vector3.ZERO
var _sidestep_left := 0.0
var _sidestep_dir := Vector3.ZERO
var _strafe_left := 0.0
var _strafe_sign := 1.0
var _wander_goal := Vector3.INF
var _wander_pause := 0.0
var _goal_card_id := -1

# Kart/kapı bilgisi (kademeli)
var _hint_follow := true             # bu bot ipucu bölgelerine yönelir mi (setup'ta rastgele)
var _card_hints: Dictionary = {}     # card_id → yaklaşık bölge merkezi
var _card_hint_src: Dictionary = {}  # card_id → ipucunun üretildiği gerçek kart konumu (kart taşınınca geçersiz)
var _card_hint_done: Dictionary = {} # card_id → ipucu bölgesine gidildi, bulunamadı
var _door_known := false
var _door_pos := Vector3.ZERO
var _door_hint := Vector3.INF
var _door_hint_done := false

# Duruş / bıçak
var _knife := false                  # oda ayarı: sadece bıçak
var _engage_t := 99.0                # mevcut hedefi ilk gördüğünden beri (sn) — ilk mermiler daha isabetsiz
var _crouch_left := 0.0
var _crouch_cd := 0.0
var _jump_cd := 0.0
var _jump_left := 0.0
var _stab_cd := 0.0


func setup(player: CharacterBody3D, nav) -> void:
	_body = player
	_pl = player
	_nav = nav if nav != null and nav.is_ready() else null
	_rng.randomize()
	_hint_follow = _rng.randf() < HINT_FOLLOW_CHANCE
	_crouch_cd = _rng.randf_range(1.0, CROUCH_CD_MAX)
	_jump_cd = _rng.randf_range(1.0, JUMP_CD_MAX)
	# Player._physics_process'ten ÖNCE çalış → girdi aynı karede uygulanır
	process_physics_priority = -1
	# Botlar aynı karede yol/ışın hesaplamasın: zamanlayıcıları dağıt
	_perceive_left = _rng.randf_range(0.0, PERCEPTION_INTERVAL)
	_repath_left = _rng.randf_range(0.0, REPATH_INTERVAL)
	_last_pos = player.global_position
	_aim_dir = _flat(-player.global_transform.basis.z, Vector3.FORWARD)


func _physics_process(delta: float) -> void:
	if _body == null or not is_instance_valid(_body) or not NetworkManager.is_host():
		return
	# Maç saati: bot ölüyken de akar (kart/kapı bilgisinin kademeli açılması canlı kalma süresine bağlı değil)
	var live: bool = GameManager.match_live and GameManager.state == GameManager.State.IN_GAME
	if live:
		_live_time += delta
	elif not GameManager.match_live:
		_live_time = 0.0
	if bool(_pl.is_dead) or GameManager.state != GameManager.State.IN_GAME:
		_was_dead = true
		_send_idle()
		return
	var pos := _body.global_position
	if _was_dead or pos.distance_to(_last_pos) > TELEPORT_DIST:
		_new_life()   # doğdu / maç başında spawn'a ışınlandı
	_was_dead = false
	_last_pos = pos
	# Taramalar arası hedef öldü / görünmez oldu / oyundan çıktı → hemen bırak
	if _target != null and (not is_instance_valid(_target) or bool(_target.is_dead) or bool(_target.is_invisible)):
		_target = null
		_target_fire_clear = false
		_burst_left = 0.0
	_tick_timers(delta)

	_perceive_left -= delta
	if _perceive_left <= 0.0:
		_perceive_left = PERCEPTION_INTERVAL
		_perceive(live)

	var goal := _decide(live)
	var move := Vector3.ZERO
	var run := false
	var fighting := live and _target != null
	if fighting and _knife and _state != BotState.CARRY:
		move = _knife_chase(pos)       # sadece bıçak: rakibe koş (arkadan yaklaşmayı dene)
		run = true
	elif fighting and _state != BotState.CARRY:
		move = _combat_move(pos)
	else:
		var r := _travel(pos, goal)
		move = r[0]
		run = bool(r[1]) and not fighting
	if move != Vector3.ZERO:
		move = _unstick(pos, move, delta)
	else:
		_stuck_left = STUCK_CHECK
		_stuck_ref = pos

	var aim_point := _update_aim(pos, move, delta)
	var stance := _stance_decision(delta, fighting, move)
	var crouch: bool = stance[0]
	var jump: bool = stance[1]
	var fire := false
	var stab := false
	if fighting:
		if _knife:
			stab = _knife_stab_decision(pos)
		else:
			if not crouch:
				fire = _fire_decision(pos, delta)   # çömelmişken ateş etmez (mermi bağışıklığıyla ateş etmesin)
			else:
				_burst_left = 0.0
			stab = _melee_decision(pos, delta)
	else:
		_burst_left = 0.0
	var reload := _reload_decision() if not _knife else false
	_pl.set_bot_input(move, aim_point, fire, reload, run, crouch, jump, stab)


# ─────────────────────────────────────────────
# Yaşam döngüsü / zamanlayıcılar
# ─────────────────────────────────────────────

func _new_life() -> void:
	_path = PackedVector3Array()
	_path_idx = 0
	_path_goal = Vector3.INF
	_target = null
	_target_lost_for = 99.0
	_last_seen_left = 0.0
	_alert_left = 0.0
	_burst_left = 0.0
	_burst_pause = 0.0
	_sidestep_left = 0.0
	_wander_goal = Vector3.INF
	_wander_pause = 0.0
	_goal_card_id = -1
	_crouch_left = 0.0
	_jump_left = 0.0
	_stab_cd = 0.0
	_engage_t = 99.0
	_knife = bool(_pl.is_knife_mode())
	_stuck_left = STUCK_CHECK
	_stuck_ref = _body.global_position
	_aim_dir = _flat(-_body.global_transform.basis.z, Vector3.FORWARD)


func _tick_timers(delta: float) -> void:
	_repath_left -= delta
	_repath_gap -= delta
	_last_seen_left = maxf(_last_seen_left - delta, 0.0)
	_hunt_left = maxf(_hunt_left - delta, 0.0)
	_alert_left = maxf(_alert_left - delta, 0.0)
	_reaction_left = maxf(_reaction_left - delta, 0.0)
	_reload_cd = maxf(_reload_cd - delta, 0.0)
	_semi_cd = maxf(_semi_cd - delta, 0.0)
	_stab_cd = maxf(_stab_cd - delta, 0.0)
	_crouch_cd = maxf(_crouch_cd - delta, 0.0)
	_jump_cd = maxf(_jump_cd - delta, 0.0)
	_engage_t += delta
	_target_lost_for += delta


func _send_idle() -> void:
	if _body == null or not is_instance_valid(_body):
		return
	var pos := _body.global_position
	_pl.set_bot_input(Vector3.ZERO, pos + _aim_dir * 3.0, false, false, false)


# ─────────────────────────────────────────────
# Algı (PERCEPTION_INTERVAL'de bir)
# ─────────────────────────────────────────────

func _perceive(live: bool) -> void:
	_knife = bool(_pl.is_knife_mode())
	var pos := _body.global_position
	var eye := pos + Vector3(0.0, EYE_HEIGHT, 0.0)
	var facing := _flat(-_body.global_transform.basis.z, _aim_dir)
	var cone_cos := cos(deg_to_rad(VIEW_HALF_ANGLE))
	var my_team: int = int(_pl.team_id)

	var best = null
	var best_score := INF
	var best_clear := false
	for pid: Variant in GameManager.active_players.keys():
		var other = GameManager.active_players[pid]
		if other == null or not is_instance_valid(other) or other == _body:
			continue
		if int(other.team_id) == my_team or bool(other.is_dead) or bool(other.is_invisible):
			continue
		var opos: Vector3 = (other as Node3D).global_position
		var d := pos.distance_to(opos)
		if d > VIEW_RANGE:
			continue
		var to := _flat(opos - pos, facing)
		var in_cone := facing.dot(to) >= cone_cos
		if not in_cone and d > HEAR_RANGE:
			continue
		var hit := _ray(eye, opos + Vector3(0.0, TARGET_HEIGHT, 0.0))
		var visible := false
		var clear := false
		if hit.is_empty():
			visible = true
			clear = true
		else:
			var col: Object = hit.get("collider")
			if col == other:
				visible = true
				clear = true
			elif col is CharacterBody3D and "team_id" in col and int(col.get("team_id")) == my_team:
				visible = true   # görüyor ama arada takım arkadaşı var → ateş yok
		if not visible:
			# Görüş yok ama yakın + çömelmiyor → adım sesi: o yöne dön
			if d <= HEAR_RANGE and not bool(other.is_crouching()):
				_alert_pos = opos
				_alert_left = ALERT_MEMORY
			continue
		var score := d
		if live and GameManager.is_card_carrier(int(pid)):
			score -= 8.0   # kart taşıyıcısı öncelikli
			_hunt_pos = opos
			_hunt_left = HUNT_MEMORY
		if other == _target:
			score -= 5.0   # hedefe sadakat (her taramada hedef değiştirmesin)
		if score < best_score:
			best_score = score
			best = other
			best_clear = clear

	if best != null:
		var bpos: Vector3 = (best as Node3D).global_position
		if best != _target or _target_lost_for > 0.6:
			# Yeni hedef (ya da uzun süre görülmeyen eski hedef): tepki gecikmesi
			_reaction_left = REACTION_TIME + _rng.randf_range(0.0, REACTION_JITTER)
			if _knife:
				_reaction_left *= KNIFE_REACTION_MULT
			_engage_t = 0.0
			_target_vel = Vector3.ZERO
			_err_left = 0.0
		else:
			var dt := maxf(_target_lost_for, PERCEPTION_INTERVAL)
			_target_vel = _target_vel.lerp(Vector3(bpos.x - _target_seen_pos.x, 0.0, bpos.z - _target_seen_pos.z) / dt, 0.5)
		_target = best
		_target_fire_clear = best_clear
		_target_seen_pos = bpos
		_target_lost_for = 0.0
		_last_seen_pos = bpos
		_last_seen_left = LOST_MEMORY
	else:
		_target = null
		_target_fire_clear = false

	if live:
		_perceive_cards(pos, eye)
		_perceive_door(pos, eye)
	else:
		_known_cards.clear()
		_card_hints.clear()
		_card_hint_src.clear()
		_card_hint_done.clear()
		_door_known = false
		_door_hint = Vector3.INF
		_door_hint_done = false


## Kart bilgisi: görüş (7 m + duvar ışını) → kesin; ~4 dk sonra bazı botlara yaklaşık bölge ipucu; ~6,5 dk sonra kesin konum.
func _perceive_cards(pos: Vector3, eye: Vector3) -> void:
	if GameManager.get_card_total() <= 0:
		_known_cards.clear()
		_card_hints.clear()
		return
	var reveal_all := _live_time >= CARD_REVEAL_TIME
	var hint_phase := _live_time >= HINT_TIME and not reveal_all and _hint_follow
	for cid: Variant in GameManager.cards.keys():
		var card = GameManager.cards[cid]
		if card == null or not is_instance_valid(card) or int(card.carrier_peer) != -1:
			_known_cards.erase(cid)   # taşınıyor / yok
			_card_hints.erase(cid)
			_card_hint_src.erase(cid)
			continue
		var cpos: Vector3 = (card as Node3D).global_position
		if reveal_all:
			_known_cards[cid] = cpos
			_card_hints.erase(cid)
			continue
		if pos.distance_to(cpos) > CARD_SEE_RANGE:
			# Bilinen kart başka yere düştüyse (öldürülen taşıyıcı) eski bilgi geçersiz
			if _known_cards.has(cid) and (_known_cards[cid] as Vector3).distance_to(cpos) > 1.5:
				_known_cards.erase(cid)
			# Kart yer değiştirdiyse eski ipucu da geçersiz
			if _card_hint_src.has(cid) and (_card_hint_src[cid] as Vector3).distance_to(cpos) > 1.5:
				_card_hints.erase(cid)
				_card_hint_src.erase(cid)
				_card_hint_done.erase(cid)
			# İpucu aşaması: yaklaşık bölge (kesin yer DEĞİL) — bir kez üretilir
			if hint_phase and not _known_cards.has(cid) and not _card_hints.has(cid) and not _card_hint_done.has(cid):
				_card_hints[cid] = _hint_point(cpos)
				_card_hint_src[cid] = cpos
			continue
		var hit := _ray(eye, cpos + Vector3(0.0, CARD_HEIGHT, 0.0))
		if hit.is_empty() or hit.get("collider") is CharacterBody3D:
			_known_cards[cid] = cpos
			_card_hints.erase(cid)
	# Silinmiş kartları temizle
	for cid: Variant in _known_cards.keys():
		if not GameManager.cards.has(cid):
			_known_cards.erase(cid)
	for cid: Variant in _card_hints.keys():
		if not GameManager.cards.has(cid):
			_card_hints.erase(cid)
			_card_hint_src.erase(cid)


## Kapı (tahliye noktası) bilgisi: görüş (12 m + ışın) ile KEŞFEDİLİR; ~4 dk sonra bazı botlara bölge ipucu; ~6,5 dk sonra kesin konum.
func _perceive_door(pos: Vector3, eye: Vector3) -> void:
	var door: Variant = GameManager.door_instance
	if door == null or not is_instance_valid(door):
		_door_known = false
		return
	var dpos: Vector3 = (door as Node3D).global_position
	if _door_known:
		_door_pos = dpos
		return
	if _live_time >= CARD_REVEAL_TIME:
		_door_known = true
		_door_pos = dpos
		return
	if pos.distance_to(dpos) <= DOOR_SEE_RANGE:
		var hit := _ray(eye, dpos + Vector3(0.0, 0.8, 0.0))
		if hit.is_empty() or hit.get("collider") is CharacterBody3D:
			_door_known = true
			_door_pos = dpos
			return
	if _hint_follow and _live_time >= HINT_TIME and _door_hint == Vector3.INF and not _door_hint_done:
		_door_hint = _hint_point(dpos)


## Gerçek yerden 9-16 m uzakta rastgele açık bir nokta (yaklaşık bölge ipucu)
func _hint_point(real: Vector3) -> Vector3:
	var ang := _rng.randf_range(0.0, TAU)
	var r := _rng.randf_range(HINT_RADIUS_MIN, HINT_RADIUS_MAX)
	var p := real + Vector3(cos(ang) * r, 0.0, sin(ang) * r)
	if _nav != null:
		p = _nav.nearest_walkable(p)
	return p


# ─────────────────────────────────────────────
# Karar (her kare — ucuz)
# ─────────────────────────────────────────────

## Durumu seçer, gidilecek noktayı döndürür (Vector3.INF = gidecek yer yok)
func _decide(live: bool) -> Vector3:
	_goal_card_id = -1
	if not live:
		_state = BotState.WANDER
		return _wander_target()
	var pos := _body.global_position
	var my_team: int = int(_pl.team_id)
	var my_id: int = int(_pl.peer_id)
	var total := GameManager.get_card_total()
	var goal := Vector3.INF
	if total > 0:
		var team_cards := GameManager.get_team_cards(my_team)
		var i_carry := GameManager.is_card_carrier(my_id)
		var door: Variant = GameManager.door_instance
		if team_cards >= total:
			if i_carry and door != null and is_instance_valid(door):
				# Kapı konumunu bilmiyorsa KEŞFEDER (görüş menzili); ipucu varsa o bölgeye, yoksa dolaşarak arar
				_state = BotState.CARRY
				goal = _carry_goal(pos)
			else:
				var carrier := _nearest_team_carrier(pos, my_team, my_id)
				if carrier != null:
					_state = BotState.ESCORT
					goal = carrier.global_position
		if goal == Vector3.INF:
			var cid := _nearest_known_card(pos)
			if cid != -1:
				_state = BotState.GO_CARD
				_goal_card_id = cid
				goal = _known_cards[cid]
				_try_pickup(pos, cid)
			else:
				var hid := _nearest_card_hint(pos)
				if hid != -1:
					_state = BotState.GO_CARD   # yaklaşık bölge: kartı görene kadar oraya git (_goal_card_id -1 → alma denemesi yok)
					goal = _card_hints[hid]
					if _flat_dist(pos, goal) < HINT_ARRIVE:
						_card_hint_done[hid] = true   # burada yok — ipucunu bırak, dolaşmaya dön
						_card_hints.erase(hid)
						goal = Vector3.INF
	if goal == Vector3.INF:
		if _target == null and _last_seen_left > 0.0:
			_state = BotState.HUNT
			goal = _last_seen_pos
		elif _hunt_left > 0.0:
			_state = BotState.HUNT
			goal = _hunt_pos
			if _flat_dist(pos, goal) < ARRIVE_DIST:
				_hunt_left = 0.0
	if goal == Vector3.INF:
		_state = BotState.WANDER
		goal = _wander_target()
	if _target != null and _state != BotState.CARRY:
		_state = BotState.FIGHT
	return goal


func _nearest_team_carrier(pos: Vector3, my_team: int, my_id: int) -> Node3D:
	var best: Node3D = null
	var best_d := INF
	for pid: int in GameManager.get_card_carriers():
		if pid == my_id:
			continue
		var n = GameManager.active_players.get(pid)
		if n == null or not is_instance_valid(n) or bool(n.is_dead) or int(n.team_id) != my_team:
			continue
		var d := pos.distance_to((n as Node3D).global_position)
		if d < best_d:
			best_d = d
			best = n
	return best


func _nearest_known_card(pos: Vector3) -> int:
	var best := -1
	var best_d := INF
	for cid: Variant in _known_cards.keys():
		var d := _flat_dist(pos, _known_cards[cid])
		if d < best_d:
			best_d = d
			best = int(cid)
	return best


## En yakın yaklaşık bölge ipucu (card_id, yoksa -1)
func _nearest_card_hint(pos: Vector3) -> int:
	var best := -1
	var best_d := INF
	for cid: Variant in _card_hints.keys():
		var d := _flat_dist(pos, _card_hints[cid])
		if d < best_d:
			best_d = d
			best = int(cid)
	return best


## Kart taşıyıcının gideceği yer: kapı biliniyorsa kapı; ipucu varsa bölge; yoksa dolaşarak arama (asla INF dönmez)
func _carry_goal(pos: Vector3) -> Vector3:
	if _door_known:
		return _door_pos
	if _door_hint != Vector3.INF and not _door_hint_done:
		if _flat_dist(pos, _door_hint) < HINT_ARRIVE:
			_door_hint_done = true   # burada yok — ara
			_door_hint = Vector3.INF
		else:
			return _door_hint
	var w := _wander_target()
	return w if w != Vector3.INF else pos


## Kartın üstündeyse host'un mevcut alma yolunu çağır (Card.gd de yapar; çift çağrı zararsız — taşınan kart reddedilir)
func _try_pickup(pos: Vector3, cid: int) -> void:
	var card = GameManager.cards.get(cid)
	if card == null or not is_instance_valid(card) or int(card.carrier_peer) != -1:
		return
	if _flat_dist(pos, (card as Node3D).global_position) > ARRIVE_DIST:
		return
	var blocked: Variant = _pl.get("_card_pickup_blocked")
	if blocked != null and float(blocked) > 0.0:
		return
	GameManager.handle_card_pickup(int(_pl.peer_id), cid)


func _wander_target() -> Vector3:
	var pos := _body.global_position
	if _wander_goal == Vector3.INF or _flat_dist(pos, _wander_goal) < ARRIVE_DIST * 1.5:
		if _wander_goal != Vector3.INF and _wander_pause <= 0.0:
			_wander_pause = _rng.randf_range(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
			_wander_goal = Vector3.INF
		if _wander_pause > 0.0:
			_wander_pause -= get_physics_process_delta_time()
			return Vector3.INF   # biraz dur, etrafa bak
		_wander_goal = _pick_wander_point(pos)
	return _wander_goal


func _pick_wander_point(pos: Vector3) -> Vector3:
	if _nav != null:
		var p: Vector3 = _nav.random_walkable_point(_rng)
		return Vector3(p.x, pos.y, p.z)
	var ang := _rng.randf_range(0.0, TAU)
	var r := _rng.randf_range(8.0, 20.0)
	return pos + Vector3(cos(ang) * r, 0.0, sin(ang) * r)


# ─────────────────────────────────────────────
# Hareket
# ─────────────────────────────────────────────

## [yön, koş?] — hedefe yol takibi
func _travel(pos: Vector3, goal: Vector3) -> Array:
	if goal == Vector3.INF:
		return [Vector3.ZERO, false]
	var d := _flat_dist(pos, goal)
	match _state:
		BotState.CARRY:
			if d <= DOOR_HOLD_DIST:
				return [Vector3.ZERO, false]   # kapıda bekle — kilit açılıyor
		BotState.ESCORT:
			if d <= ESCORT_DIST:
				return [Vector3.ZERO, false]
		_:
			if d <= ARRIVE_DIST * 0.5:
				return [Vector3.ZERO, false]
	var dir := _follow_path(pos, goal)
	var run := true
	if _state == BotState.WANDER:
		run = false   # gezinti yürüyerek
	elif _state == BotState.ESCORT:
		run = d > ESCORT_RUN_DIST
	return [dir, run]


func _follow_path(pos: Vector3, goal: Vector3) -> Vector3:
	if _nav == null:
		return _avoid(pos, _flat(goal - pos, Vector3.ZERO))
	var dynamic := _state == BotState.ESCORT or _state == BotState.HUNT or _state == BotState.FIGHT
	var exhausted := _path_idx >= _path.size()
	# Yol yok / hedef kaydı → hemen; yol bitti (kısmi yol) ya da hareketli hedef → en fazla REPATH_INTERVAL'de bir
	var need := _path.is_empty() or _flat_dist(goal, _path_goal) > REPATH_GOAL_MOVE \
			or ((exhausted or dynamic) and _repath_left <= 0.0)
	if need and _repath_gap <= 0.0:
		_path = _nav.find_path(pos, goal)
		_path_idx = 0
		_path_goal = goal
		_repath_left = REPATH_INTERVAL
		_repath_gap = REPATH_MIN_GAP
	while _path_idx < _path.size() and _flat_dist(pos, _path[_path_idx]) < WAYPOINT_REACH:
		_path_idx += 1
	if _path_idx >= _path.size():
		# Yol bitti ama hedefe varılmadı (kısmi yol / son nokta): doğrudan hedefe
		return _flat(goal - pos, Vector3.ZERO) if _flat_dist(pos, goal) > ARRIVE_DIST else Vector3.ZERO
	return _flat(_path[_path_idx] - pos, Vector3.ZERO)


## Savaş hareketi: yürüyerek yanal kayma + menzil ayarı (koşmaz)
func _combat_move(pos: Vector3) -> Vector3:
	var tpos: Vector3 = _target_seen_pos
	var to := _flat(tpos - pos, _aim_dir)
	var d := _flat_dist(pos, tpos)
	_strafe_left -= get_physics_process_delta_time()
	if _strafe_left <= 0.0:
		_strafe_left = _rng.randf_range(STRAFE_MIN, STRAFE_MAX)
		_strafe_sign = -_strafe_sign if _rng.randf() < 0.7 else _strafe_sign
	var side := to.cross(Vector3.UP) * _strafe_sign
	var move := side
	var w = _pl.current_weapon
	var preferred := FIGHT_PREFERRED_MAX
	if w != null and is_instance_valid(w):
		preferred = minf(preferred, float(w.max_distance) * 0.6)
	if d > preferred:
		move += to * 0.8
	elif d < FIGHT_TOO_CLOSE:
		move -= to * 0.6
	move = _flat(move, Vector3.ZERO)
	if move != Vector3.ZERO and not _dir_clear(pos, move):
		_strafe_sign = -_strafe_sign
		move = _flat(to.cross(Vector3.UP) * _strafe_sign + (to * 0.8 if d > preferred else Vector3.ZERO), Vector3.ZERO)
		if not _dir_clear(pos, move):
			move = Vector3.ZERO
	return move


## Takılma algılama: STUCK_CHECK sn'de STUCK_MIN_PROGRESS'ten az ilerlediyse yolu yenile + kısa yan adım
func _unstick(pos: Vector3, move: Vector3, delta: float) -> Vector3:
	if _sidestep_left > 0.0:
		_sidestep_left -= delta
		return _sidestep_dir
	_stuck_left -= delta
	if _stuck_left <= 0.0:
		if pos.distance_to(_stuck_ref) < STUCK_MIN_PROGRESS:
			_path = PackedVector3Array()   # yeniden yol
			_repath_gap = 0.0
			var s := 1.0 if _rng.randf() < 0.5 else -1.0
			_sidestep_dir = _flat(move.cross(Vector3.UP) * s - move * 0.3, Vector3.ZERO)
			_sidestep_left = SIDESTEP_TIME
			if _state == BotState.WANDER or (_state == BotState.CARRY and not _door_known):
				_wander_goal = Vector3.INF   # ulaşılamayan gezinti noktası: yenisini seç
			# Yüksek kenara takılmış olabilir: zıplamayı dene (dayanıklılık/bekleme Player'da)
			if float(_pl.sprint_stamina) >= JUMP_MIN_STAMINA and not bool(_pl.sprint_locked):
				_jump_left = JUMP_UNSTICK_HOLD
				_crouch_left = 0.0
		_stuck_left = STUCK_CHECK
		_stuck_ref = pos
	return move


## Nav yokken: önde engel varsa açıyla sap
func _avoid(pos: Vector3, dir: Vector3) -> Vector3:
	if dir == Vector3.ZERO or _dir_clear(pos, dir):
		return dir
	for deg: float in [35.0, -35.0, 70.0, -70.0, 110.0, -110.0]:
		var d2 := dir.rotated(Vector3.UP, deg_to_rad(deg))
		if _dir_clear(pos, d2):
			return d2
	return -dir


func _dir_clear(pos: Vector3, dir: Vector3) -> bool:
	if _nav != null:
		return _nav.line_clear(pos, pos + dir * AVOID_PROBE)
	var from := pos + Vector3(0.0, 0.6, 0.0)
	return _ray(from, from + dir * AVOID_PROBE).is_empty()


# ─────────────────────────────────────────────
# Nişan / ateş / şarjör
# ─────────────────────────────────────────────

## Sadece bıçak modu: hedefe koş. Uzaksa hedefin ARKASINA dolanmayı dener (arkadan tek vuruş), yakınsa doğrudan üstüne gider.
func _knife_chase(pos: Vector3) -> Vector3:
	if _target == null or not is_instance_valid(_target):
		return Vector3.ZERO
	var tpos: Vector3 = (_target as Node3D).global_position
	var d := _flat_dist(pos, tpos)
	if d <= KNIFE_HOLD_DIST:
		return Vector3.ZERO
	if d > KNIFE_BEHIND_MIN_DIST:
		var tfwd := _flat(-(_target as Node3D).global_transform.basis.z, Vector3.ZERO)
		if tfwd != Vector3.ZERO:
			var behind := tpos - tfwd * KNIFE_APPROACH_BEHIND
			# Arka nokta açıksa oraya (yol hesabı onu dolanır); duvarın içindeyse doğrudan hedefe
			if _nav == null or _nav.line_clear(tpos, behind):
				return _follow_path(pos, behind)
		return _follow_path(pos, tpos)
	# Yakın: görüş hattı açıksa düz üstüne, değilse yolla
	if _target_fire_clear:
		return _flat(tpos - pos, Vector3.ZERO)
	return _follow_path(pos, tpos)


## Çömelme / zıplama kararı → [crouch, jump]. Seyrek ve rastgele; Player dayanıklılık/bekleme kurallarını yine uygular
## (çömelme en çok ~1,5 sn ve bekleme sonrası → sonsuz çömelme yok; zıplama JUMP_STAMINA + cooldown).
func _stance_decision(delta: float, fighting: bool, move: Vector3) -> Array:
	var on_floor := bool(_pl.is_on_floor())
	var sprint_ok := float(_pl.sprint_stamina) >= JUMP_MIN_STAMINA and not bool(_pl.sprint_locked)
	var crouch_ok := float(_pl.crouch_stamina) >= CROUCH_MIN_STAMINA and not bool(_pl.crouch_locked)
	# Süren zıplama basışı
	if _jump_left > 0.0:
		_jump_left -= delta
		_crouch_left = 0.0
		return [false, true]
	# Süren çömelme
	if _crouch_left > 0.0:
		_crouch_left -= delta
		if _crouch_left > 0.0 and not bool(_pl.crouch_locked) and on_floor:
			return [true, false]
		_crouch_left = 0.0
	if not on_floor or _state == BotState.CARRY:
		return [false, false]
	# Çömelme: çatışmada ara sıra (bıçak modunda değil — rakibe koşuyor), ya da durup beklerken
	var crouch_rate := 0.0
	if fighting and not _knife and _target != null and _flat_dist(_body.global_position, (_target as Node3D).global_position) > 4.0:
		crouch_rate = CROUCH_FIGHT_RATE
	elif not fighting and move == Vector3.ZERO and _state == BotState.WANDER:
		crouch_rate = CROUCH_IDLE_RATE
	if crouch_rate > 0.0 and crouch_ok and _crouch_cd <= 0.0 and _rng.randf() < crouch_rate * delta:
		_crouch_left = _rng.randf_range(CROUCH_MIN, CROUCH_MAX)
		_crouch_cd = _rng.randf_range(CROUCH_CD_MIN, CROUCH_CD_MAX)
		return [true, false]
	# Zıplama: yürürken / yan adımda düşük olasılık
	var jump_rate := 0.0
	if fighting and not _knife:
		jump_rate = JUMP_FIGHT_RATE
	elif move != Vector3.ZERO:
		jump_rate = JUMP_WALK_RATE
	if jump_rate > 0.0 and sprint_ok and _jump_cd <= 0.0 and _rng.randf() < jump_rate * delta:
		_jump_left = JUMP_HOLD
		_jump_cd = _rng.randf_range(JUMP_CD_MIN, JUMP_CD_MAX)
		return [false, true]
	return [false, false]


## Sadece bıçak modu: hedef bıçak menzilinde + yeterince dönükse bıçak iste (bekleme/animasyon Player'da)
func _knife_stab_decision(pos: Vector3) -> bool:
	if _target == null or not is_instance_valid(_target) or not _target_fire_clear or _reaction_left > 0.0:
		return false
	var tpos: Vector3 = (_target as Node3D).global_position
	if _flat_dist(pos, tpos) > KNIFE_STAB_DIST:
		return false
	var desired := _flat(tpos - pos, _aim_dir)
	var align := absf(_aim_dir.signed_angle_to(desired, Vector3.UP))
	return align <= deg_to_rad(KNIFE_ALIGN_MAX_DEG)


## Normal mod: çok yakındaki rakibe ara sıra bıçak (düşük olasılık, uzun bekleme)
func _melee_decision(pos: Vector3, delta: float) -> bool:
	if _target == null or not is_instance_valid(_target) or not _target_fire_clear or _reaction_left > 0.0 or _stab_cd > 0.0:
		return false
	var tpos: Vector3 = (_target as Node3D).global_position
	if _flat_dist(pos, tpos) > KNIFE_STAB_DIST:
		return false
	var desired := _flat(tpos - pos, _aim_dir)
	if absf(_aim_dir.signed_angle_to(desired, Vector3.UP)) > deg_to_rad(KNIFE_ALIGN_MAX_DEG):
		return false
	if _rng.randf() < MELEE_CHANCE_RATE * delta:
		_stab_cd = MELEE_CD
		return true
	return false


## Nişan yönünü (sınırlı dönüş hızıyla) günceller, Player'a verilecek dünya noktasını döndürür
func _update_aim(pos: Vector3, move: Vector3, delta: float) -> Vector3:
	var desired := Vector3.ZERO
	var dist := 4.0
	var turn := IDLE_TURN_SPEED
	if _target != null:
		var p := _aim_point(pos)
		desired = _flat(p - pos, Vector3.ZERO)
		dist = maxf(_flat_dist(pos, p), 2.0)
		turn = KNIFE_TURN_SPEED if _knife else AIM_TURN_SPEED
	elif _alert_left > 0.0:
		desired = _flat(_alert_pos - pos, Vector3.ZERO)
	elif _state == BotState.HUNT and _last_seen_left > 0.0:
		desired = _flat(_last_seen_pos - pos, Vector3.ZERO)
	elif move != Vector3.ZERO:
		desired = move
	if desired != Vector3.ZERO:
		var ang := _aim_dir.signed_angle_to(desired, Vector3.UP)
		var step := clampf(ang, -turn * delta, turn * delta)
		_aim_dir = _aim_dir.rotated(Vector3.UP, step).normalized()
	return pos + _aim_dir * dist


## Hedef + kısmi öncül nişan + mesafeyle büyüyen yanal hata
func _aim_point(pos: Vector3) -> Vector3:
	var tpos: Vector3 = _target_seen_pos
	if _target != null and is_instance_valid(_target):
		tpos = (_target as Node3D).global_position
	var d := _flat_dist(pos, tpos)
	if _knife:
		return tpos   # bıçak: tam hedefe (yakın dövüş, saçılma/öncül yok)
	_err_left -= get_physics_process_delta_time()
	if _err_left <= 0.0:
		_err_left = AIM_ERR_RESAMPLE
		# Hata: taban + mesafe; bot hareket ederken ve hedef hareket ederken büyür; ilk anda (hedefi yeni görünce) daha da büyük
		var extra := _target_vel.length() * AIM_ERR_TARGET_MOVE
		if Vector2(_body.velocity.x, _body.velocity.z).length() > 0.5:
			extra += AIM_ERR_SELF_MOVE
		var warm := 1.0 + (AIM_ERR_WARMUP_MULT - 1.0) * clampf(1.0 - _engage_t / AIM_ERR_WARMUP, 0.0, 1.0)
		_err_lat = _rng.randf_range(-1.0, 1.0) * (AIM_ERR_BASE + d * AIM_ERR_PER_M + extra) * warm
		_err_lead = _rng.randf_range(0.2, 0.6)
	var w = _pl.current_weapon
	var bullet_speed := 30.0
	if w != null and is_instance_valid(w):
		bullet_speed = maxf(float(w.bullet_speed), 1.0)
	var lead := _target_vel * (d / bullet_speed) * _err_lead
	var to := _flat(tpos - pos, _aim_dir)
	var side := to.cross(Vector3.UP)
	return tpos + lead + side * _err_lat


func _fire_decision(pos: Vector3, delta: float) -> bool:
	var w = _pl.current_weapon
	if w == null or not is_instance_valid(w) or _target == null or not is_instance_valid(_target):
		_burst_left = 0.0
		return false
	var d := _flat_dist(pos, (_target as Node3D).global_position)
	var p := _aim_point_cached(pos)
	var desired := _flat(p - pos, _aim_dir)
	var align := absf(_aim_dir.signed_angle_to(desired, Vector3.UP))
	var tol := maxf(deg_to_rad(FIRE_ALIGN_MIN_DEG), atan2(0.5, maxf(d, 0.5)))
	var can := _target_fire_clear and _reaction_left <= 0.0 \
			and not bool(_target.is_crouching()) \
			and not bool(w.is_reloading) and int(w.current_ammo) > 0 \
			and d <= float(w.max_distance) * 0.95 and align <= tol
	if bool(w.is_semi_auto):
		# Player basış kenarını algılar: tek karelik tetik + aralık
		if can and _semi_cd <= 0.0:
			_semi_cd = maxf(float(w.fire_rate), 0.25) + _rng.randf_range(SEMI_GAP_MIN, SEMI_GAP_MAX)
			return true
		return false
	# Tam otomatik: kısa seriler
	if not can:
		_burst_left = 0.0
		_burst_pause = maxf(_burst_pause - delta, 0.0)
		return false
	if _burst_left > 0.0:
		_burst_left -= delta
		if _burst_left <= 0.0:
			_burst_pause = _rng.randf_range(BURST_PAUSE_MIN, BURST_PAUSE_MAX)
		return true
	if _burst_pause > 0.0:
		_burst_pause -= delta
		return false
	var far := clampf(d / VIEW_RANGE, 0.0, 1.0)
	_burst_left = lerpf(BURST_MAX, BURST_MIN, far) * _rng.randf_range(0.8, 1.1)
	return true


## _update_aim bu karede hedef noktasını zaten hesapladı; hata zamanlayıcısını iki kez ilerletmemek için yeniden çizmeden hesapla
func _aim_point_cached(pos: Vector3) -> Vector3:
	var tpos: Vector3 = (_target as Node3D).global_position
	if _knife:
		return tpos
	var d := _flat_dist(pos, tpos)
	var w = _pl.current_weapon
	var bullet_speed := maxf(float(w.bullet_speed), 1.0) if w != null and is_instance_valid(w) else 30.0
	var to := _flat(tpos - pos, _aim_dir)
	return tpos + _target_vel * (d / bullet_speed) * _err_lead + to.cross(Vector3.UP) * _err_lat


func _reload_decision() -> bool:
	var w = _pl.current_weapon
	if w == null or not is_instance_valid(w) or bool(w.is_reloading) or _reload_cd > 0.0:
		return false
	var ammo := int(w.current_ammo)
	var max_ammo := int(w.max_ammo)
	if ammo >= max_ammo:
		return false
	var need := ammo <= 0
	if not need and _target == null and _last_seen_left <= 0.0 and float(ammo) < float(max_ammo) * TACTICAL_RELOAD:
		need = true   # kimse yokken taktik şarjör
	if need:
		_reload_cd = RELOAD_COOLDOWN
	return need


# ─────────────────────────────────────────────
# Yardımcılar
# ─────────────────────────────────────────────

func _ray(from: Vector3, to: Vector3) -> Dictionary:
	var q := PhysicsRayQueryParameters3D.create(from, to, 1)
	q.exclude = [_body.get_rid()]
	return _body.get_world_3d().direct_space_state.intersect_ray(q)


## Yatay (XZ) birim vektör; sıfırsa fallback
func _flat(v: Vector3, fallback: Vector3) -> Vector3:
	var f := Vector3(v.x, 0.0, v.z)
	if f.length_squared() < 0.0001:
		return fallback
	return f.normalized()


func _flat_dist(a: Vector3, b: Vector3) -> float:
	return Vector2(a.x - b.x, a.z - b.z).length()
