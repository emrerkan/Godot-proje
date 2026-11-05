## Sfx.gd (statik — autoload DEĞİL, kullananlar preload eder: `const SFX := preload("res://scenes/audio/Sfx.gd")`)
## Sesler iki kaynaktan: GERÇEK KAYITLAR (`res://audio/sfx/`, hepsi CC0 — kaynaklar audio/sfx/CREDITS.md) ve basit
## bip/çan/çınlama gibi sesler için KOD SENTEZİ (gürültü + filtre + zarf + sinüs → AudioStreamWAV). Kullanıcı: sentez silah/adım/
## patlama için "hiç olmamış" → bunlar kayıt. `FILES` = ad → varyant dosyaları (her çalışta rastgele biri), `SYNTH` = kodla üretilenler.
## `setup(tree)` (UITheme.apply'dan) hepsini WorkerThreadPool'da önceden yükler/üretir — oyun içinde ilk çalışta takılma olmasın.
##
## Çalma:
##   play_ui(tree, ad, db, pitch, bus)   — konumsuz (menü, HUD uyarıları, kulak çınlaması). Polifonik tek oynatıcı / kanal.
##   make_voice(node) + play_voice(...)  — oyuncuya bağlı polifonik 3D ses (atış, şarjör, adım) — oyuncuyla birlikte hareket eder.
##   play_at(tree, ad, konum, ...)       — dünyada tek seferlik 3D ses (patlama, fırlatma).
## 3D dinleyici: SfxListener.gd (yerel oyuncunun üstünde, kamera yönünde — Player.initialize ekler).
## Kanallar: "SFX" ve "UI" (GameSettings._apply_audio kurar; AYARLAR → SES kaydırıcıları).
## Butonlar: setup → SceneTree.node_added ile HER BaseButton'a otomatik hover/tık sesi.

extends RefCounted

const RATE := 22050
const BUS_SFX := &"SFX"
const BUS_UI := &"UI"
const MAX_ONESHOTS := 32          # aynı anda en fazla tek seferlik 3D ses düğümü
const HOVER_MIN_GAP_MS := 45      # fareyle düğme üstlerinde gezerken tık yağmuru olmasın

const DIR := "res://audio/sfx/"
## Kayıt sesleri: ad → varyantlar (her çalışta rastgele biri — aynı ses art arda tekrar etmesin)
const FILES := {
	"shot_rifle": ["shot_rifle_1.wav", "shot_rifle_2.wav", "shot_rifle_3.wav", "shot_rifle_4.wav"],          # AK-47
	"shot_carbine": ["shot_carbine_1.wav", "shot_carbine_2.wav"],                                            # AR-15
	"shot_smg": ["shot_smg_1.wav", "shot_smg_2.wav", "shot_smg_3.wav"],                                      # Carl Gustav M45
	"shot_marksman": ["shot_marksman_1.wav", "shot_marksman_2.wav", "shot_marksman_3.wav", "shot_marksman_4.wav"],  # SKS
	"shot_sniper": ["shot_sniper_1.wav", "shot_sniper_2.wav", "shot_sniper_3.wav", "shot_sniper_4.wav"],     # Mosin Nagant
	# Nefes (Owlish breath-male): takla ağır, çömelme sakin (zıplamada kullanıcının kendi kaydı "jump")
	"breath_hard": ["breath_hard_1.wav", "breath_hard_2.wav", "breath_hard_3.wav", "breath_hard_4.wav"],
	"breath_soft": ["breath_soft_1.wav", "breath_soft_2.wav", "breath_soft_3.wav", "breath_soft_4.wav"],
	"step": ["walk_1.mp3", "walk_2.mp3", "walk_3.mp3", "walk_4.mp3"],          # kullanıcının yurume-ses.mp3'ünden 4 adım
	"step_soft": ["crouch_step_1.wav", "crouch_step_2.wav", "crouch_step_3.wav", "crouch_step_4.wav"],  # çömelme
	"jump": ["ziplama-ses.mp3"],                                                # kullanıcının kaydı
	"crouch": ["crouch_1.wav"],                     # kullanıcının AI kaydı (çömelmeye geçiş; baştaki sessizlik kesildi)
	"flip": ["flip_1.mp3", "flip_2.mp3"],           # kullanıcının AI kayıtları (takla başı)
	# Bomba: kullanıcının kayıtları — yakın patlama / uzaktan duyulan (Bomb._explode mesafeye göre seçer)
	"explosion_near": ["bomba-1.wav"],
	"explosion_far": ["bomba-2.wav"],
	"flashbang": ["flash_bang_01.ogg", "flash_bang_04.ogg", "flash_bang_10.ogg"],
	"mag_out": ["mag_out.ogg"], "mag_in": ["mag_in.ogg"], "bolt": ["bolt.ogg"],
	"stab": ["stab.ogg"], "throw": ["throw.ogg"],
	"ui_click": ["fener-acma-kapama.mp3"],   # kullanıcı: menü tıkı = fener düğmesi
	# kullanıcı: eski Kenney hover sesi "baloncuk" gibiydi → OYUNDAKİ ATEŞ sesi (kısık smg); yükseltme satın alınca tüfek atışı
	"ui_hover": ["shot_smg_1.wav", "shot_smg_2.wav", "shot_smg_3.wav"],
	"upgrade_buy": ["shot_rifle_1.wav", "shot_rifle_2.wav", "shot_rifle_3.wav", "shot_rifle_4.wav"],
	"card_pickup": ["card_pickup.ogg"], "card_alert": ["card_alert.ogg"],
}
## Kodla sentezlenen sesler (bip/çan/çınlama — sentezin iyi yaptığı basit sesler)
const SYNTH: Array[String] = ["tinnitus", "smoke", "unlock_tick", "unlock_tick_enemy", "unlock_reset", "match_win", "match_lose"]

static var _cache: Dictionary = {}   # ad → Array[AudioStream]
static var _mutex := Mutex.new()
static var _setup_done := false
static var _flat_players: Dictionary = {}   # bus → AudioStreamPlayer (polifonik)
static var _oneshots := 0
static var _last_hover_ms := 0


## Açılışta bir kez (UITheme.apply): sesleri arka planda üret + düğmelere hover/tık sesi bağla
static func setup(tree: SceneTree) -> void:
	if _setup_done:
		return
	_setup_done = true
	WorkerThreadPool.add_task(func() -> void:
		for n: String in FILES:
			stream(n)
		for n in SYNTH:
			stream(n))
	tree.node_added.connect(func(n: Node) -> void:
		if n is BaseButton:
			_hook_button(n as BaseButton))


## Karakterin silah sesi (WEAPON_CONFIGS'e göre): Tank ağır tüfek, Visioner karabina, Runner SMG, Medic yarı otomatik, Sniper sürgülü
static func shot_for(character: String) -> String:
	match character:
		"Visioner": return "shot_carbine"
		"Runner": return "shot_smg"
		"Medic": return "shot_marksman"
		"Sniper": return "shot_sniper"
	return "shot_rifle"


## Sesin bir varyantı (kayıtsa rastgele, sentezse tek)
static func stream(sound: String) -> AudioStream:
	_mutex.lock()
	var list: Array = _cache.get(sound, [])
	_mutex.unlock()
	if list.is_empty():
		if FILES.has(sound):
			for f: String in FILES[sound]:
				var s: AudioStream = load(DIR + f)
				if s:
					list.append(s)
		if list.is_empty():
			list.append(_to_wav(_synth(sound)))
		_mutex.lock()
		_cache[sound] = list
		_mutex.unlock()
	return list.pick_random()


# ─────────────────────────────────────────────
#  Çalma
# ─────────────────────────────────────────────

static func play_ui(tree: SceneTree, sound: String, volume_db: float = 0.0, pitch: float = 1.0, bus: StringName = BUS_UI) -> void:
	var p: AudioStreamPlayer = _flat_players.get(bus)
	if p == null or not is_instance_valid(p):
		p = AudioStreamPlayer.new()
		var poly := AudioStreamPolyphonic.new()
		poly.polyphony = 16
		p.stream = poly
		p.bus = bus
		p.process_mode = Node.PROCESS_MODE_ALWAYS   # duraklatma menüsünde de çalsın
		tree.root.add_child(p)
		_flat_players[bus] = p
	if not p.playing:
		p.play()
	(p.get_stream_playback() as AudioStreamPlaybackPolyphonic).play_stream(stream(sound), 0.0, volume_db, pitch)


## Oyuncuya bağlı polifonik 3D ses kaynağı (göğüs yüksekliğinde)
static func make_voice(parent: Node3D) -> AudioStreamPlayer3D:
	var v := AudioStreamPlayer3D.new()
	var poly := AudioStreamPolyphonic.new()
	poly.polyphony = 12
	v.stream = poly
	v.bus = BUS_SFX
	v.position.y = 1.3
	v.unit_size = 8.0
	v.max_distance = 60.0
	v.attenuation_filter_cutoff_hz = 6000.0   # uzaktaki sesler boğuklaşsın
	parent.add_child(v)
	return v


static func play_voice(voice: AudioStreamPlayer3D, sound: String, volume_db: float = 0.0, pitch_var: float = 0.05) -> void:
	if voice == null or not voice.is_inside_tree():
		return
	if not voice.playing:
		voice.play()
	(voice.get_stream_playback() as AudioStreamPlaybackPolyphonic).play_stream(
		stream(sound), 0.0, volume_db, 1.0 + randf_range(-pitch_var, pitch_var))


## Dünyada tek seferlik 3D ses (bittiğinde silinir)
static func play_at(tree: SceneTree, sound: String, pos: Vector3, volume_db: float = 0.0,
		unit_size: float = 10.0, max_distance: float = 70.0, pitch_var: float = 0.04) -> void:
	if _oneshots >= MAX_ONESHOTS or tree.current_scene == null:
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = stream(sound)
	p.bus = BUS_SFX
	p.volume_db = volume_db
	p.unit_size = unit_size
	p.max_distance = max_distance
	p.attenuation_filter_cutoff_hz = 6000.0
	p.pitch_scale = 1.0 + randf_range(-pitch_var, pitch_var)
	tree.current_scene.add_child(p)
	p.global_position = pos
	_oneshots += 1
	p.finished.connect(func() -> void:
		_oneshots -= 1
		p.queue_free())
	p.play()


static func _hook_button(b: BaseButton) -> void:
	b.mouse_entered.connect(func() -> void:
		if b.disabled or not b.is_inside_tree():
			return
		var now := Time.get_ticks_msec()
		if now - _last_hover_ms < HOVER_MIN_GAP_MS:
			return
		_last_hover_ms = now
		play_ui(b.get_tree(), "ui_hover", -24.0, randf_range(0.97, 1.03)))   # ateş sesi: menüde kısık
	b.pressed.connect(func() -> void:
		if b.is_inside_tree():
			play_ui(b.get_tree(), "ui_click", -8.0))


# ─────────────────────────────────────────────
#  Sentez — her ses katmanlardan kurulur
# ─────────────────────────────────────────────

static func _synth(sound: String) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(sound)   # deterministik: her açılışta aynı ses
	match sound:
		"tinnitus":
			# Kulak çınlaması: iki yakın frekans (hafif vuru), yavaş söner
			var b := _buf(4.0)
			_tone(b, 0.0, 0.5, 3700.0, 3700.0, 0.0, 0.08, 1.3)
			_tone(b, 0.0, 0.3, 3712.0, 3712.0, 0.0, 0.08, 1.3)
			return _finish(b, 0.5, 1.0)
		"smoke":
			# Yumuşak tıslama (sert "pof" yok) — sis kutusundan çıkan gaz
			var b := _buf(2.3)
			_noise(b, rng, 0.0, 0.7, 0.25, 0.8, 3200.0, 900.0)
			return _finish(b, 0.45, 1.0)
		"unlock_tick":
			var b := _buf(0.12)
			_tone(b, 0.0, 0.8, 1050.0, 1050.0, 0.0, 0.001, 0.035, 0.0, 0.25)
			return _finish(b, 0.45, 1.0)
		"unlock_tick_enemy":
			var b := _buf(0.14)
			_tone(b, 0.0, 0.8, 640.0, 640.0, 0.0, 0.001, 0.05, 0.0, 0.4)
			return _finish(b, 0.45, 1.3)
		"unlock_reset":
			var b := _buf(0.35)
			_tone(b, 0.0, 0.8, 400.0, 200.0, 0.08, 0.002, 0.15, 0.0, 0.3)
			return _finish(b, 0.5, 1.3)
		"match_win":
			# Majör akor, notalar arka arkaya (C5 E5 G5 C6)
			var b := _buf(2.2)
			for k in 4:
				_tone(b, 0.07 * k, 0.45, [523.3, 659.3, 784.0, 1046.5][k], 0.0, 0.0, 0.01, 0.9, 0.2)
			return _finish(b, 0.6, 1.0)
		"match_lose":
			# Küçük, inen akor (G4 Eb4 C4)
			var b := _buf(2.2)
			for k in 3:
				_tone(b, 0.12 * k, 0.5, [392.0, 311.1, 261.6][k], 0.0, 0.0, 0.01, 0.9, 0.25)
			return _finish(b, 0.6, 1.0)
	push_warning("Sfx: bilinmeyen ses '%s'" % sound)
	return _buf(0.05)


# ─────────────────────────────────────────────
#  Sentez yapı taşları
# ─────────────────────────────────────────────

static func _buf(seconds: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(seconds * RATE))
	return b


## Tek kutuplu filtre katsayısı (kesim frekansı → karışım oranı)
static func _coef(fc: float) -> float:
	return 1.0 - exp(-TAU * fc / RATE)


## Filtreli gürültü katmanı: `start` sn'de başlar, `attack` sn'de yükselir, `tau` ile üstel söner.
## lp/hp = alçak/yüksek geçiren kesim (0 = yok); lp_end > 0 ise alçak geçiren kesim lp'den lp_end'e kapanır (patlama gövdesi).
static func _noise(b: PackedFloat32Array, rng: RandomNumberGenerator, start: float, amp: float, attack: float,
		tau: float, lp: float, hp: float, lp_end: float = -1.0) -> void:
	var i0 := int(start * RATE)
	var i1 := mini(b.size(), i0 + int(tau * 7.0 * RATE) + int(attack * RATE))
	var a_hp := _coef(hp) if hp > 0.0 else 0.0
	# Alçak geçiren beyaz gürültünün gücünü düşürür → katmanlar dengeli kalsın diye telafi kazancı
	var gain := 1.0
	if lp > 0.0:
		var a := _coef(lp)
		gain = minf(sqrt((2.0 - a) / a), 6.0)
	var y_lp := 0.0
	var y_hp := 0.0
	for i in range(i0, i1):
		var t := float(i - i0) / RATE
		var x := rng.randf() * 2.0 - 1.0
		if lp > 0.0:
			var fc := lp if lp_end < 0.0 else lp_end + (lp - lp_end) * exp(-t / maxf(tau, 0.001))
			y_lp += _coef(fc) * (x - y_lp)
			x = y_lp * gain
		if hp > 0.0:
			y_hp += a_hp * (x - y_hp)
			x -= y_hp
		var env := exp(-maxf(t - attack, 0.0) / tau) * (minf(t / attack, 1.0) if attack > 0.0 else 1.0)
		b[i] += x * env * amp


## Sinüs katmanı: f0'dan f1'e `sweep_tau` ile üstel kayan frekans (f1 <= 0 → sabit), attack + üstel sönüm,
## h2/h3 = 2. ve 3. harmonik payı (çan/bip tınısı)
static func _tone(b: PackedFloat32Array, start: float, amp: float, f0: float, f1: float, sweep_tau: float,
		attack: float, tau: float, h2: float = 0.0, h3: float = 0.0) -> void:
	var i0 := int(start * RATE)
	var i1 := mini(b.size(), i0 + int(tau * 7.0 * RATE) + int(attack * RATE))
	var phase := 0.0
	for i in range(i0, i1):
		var t := float(i - i0) / RATE
		var f := f0 if (f1 <= 0.0 or sweep_tau <= 0.0) else f1 + (f0 - f1) * exp(-t / sweep_tau)
		phase += TAU * f / RATE
		var s := sin(phase) + h2 * sin(2.0 * phase) + h3 * sin(3.0 * phase)
		var env := exp(-maxf(t - attack, 0.0) / tau) * (minf(t / attack, 1.0) if attack > 0.0 else 1.0)
		b[i] += s * env * amp


## Yumuşak doyum (tanh — atışa "yumruk" verir) + tepe normalizasyonu + son 5 ms'de kısma (tık olmasın)
static func _finish(b: PackedFloat32Array, peak: float, drive: float) -> PackedFloat32Array:
	var norm := tanh(drive)
	var mx := 0.0
	for i in b.size():
		b[i] = tanh(b[i] * drive) / norm
		mx = maxf(mx, absf(b[i]))
	var k := peak / mx if mx > 0.0 else 1.0
	var fade := int(0.005 * RATE)
	var n := b.size()
	for i in n:
		var f := minf(1.0, float(n - 1 - i) / fade)
		b[i] *= k * f
	return b


static func _to_wav(b: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(b.size() * 2)
	for i in b.size():
		data.encode_s16(i * 2, int(clampf(b[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	return w
