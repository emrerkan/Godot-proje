## MenuMusic.gd — menü müziği (statik, `preload`). Sahne geçişlerinde KESİLMESİN diye player root'a eklenir.
## Akış (kullanıcı isteği): ana menü + lobi `play` (zaten çalıyorsa dokunmaz, baştan başlamaz) →
## CharacterSelect `duck` (sürer, yarı sese kısılır) → oyun başlayınca HUD `stop` (yavaşça söner).
## Dosya: `FILES` içinden ilk bulunan (kullanıcının AI ile ürettiği background-music.mp3), döngüde, "Music" kanalı.

extends RefCounted

const FILES: Array[String] = ["res://audio/music/background-music.mp3", "res://audio/music/menu.mp3", "res://audio/music/menu.ogg"]
const NODE_NAME := "MenuMusic"
const VOLUME_DB := -10.0
const SILENT_DB := -40.0
const FADE_IN := 2.5
const FADE_OUT := 1.5
const DUCK_DB := VOLUME_DB - 10.0
const DUCK_TIME := 1.0


static var _player: AudioStreamPlayer   # root'a ertelenmiş eklenir → ağaçta aramak yerine referans (çift player olmasın)


static func play(tree: SceneTree) -> void:
	var existing := _player if is_instance_valid(_player) else null
	if existing != null:
		if existing.has_meta("stopping") or existing.volume_db < VOLUME_DB - 0.5:   # sönerken/kısıkken menüye dönüldü → geri aç
			existing.remove_meta("stopping")
			existing.create_tween().tween_property(existing, "volume_db", VOLUME_DB, FADE_IN)
		return
	for path: String in FILES:
		if not ResourceLoader.exists(path):
			continue
		var stream := load(path) as AudioStream
		if stream == null:
			continue
		if "loop" in stream:   # mp3 / ogg
			stream.set("loop", true)
		var player := AudioStreamPlayer.new()
		player.name = NODE_NAME
		player.stream = stream
		player.bus = "Music" if AudioServer.get_bus_index("Music") >= 0 else "Master"
		player.volume_db = SILENT_DB
		player.process_mode = Node.PROCESS_MODE_ALWAYS
		_player = player
		tree.root.add_child.call_deferred(player)
		player.ready.connect(func() -> void:
			player.play()
			player.create_tween().tween_property(player, "volume_db", VOLUME_DB, FADE_IN) \
				.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT), CONNECT_ONE_SHOT)
		return


## Karakter seçimi: müzik sürer ama kısılır (-10 dB ≈ algıda yarı ses)
static func duck(tree: SceneTree) -> void:
	play(tree)   # menüden gelinmediyse (ör. doğrudan test) başlasın
	var player := _player if is_instance_valid(_player) else null
	if player == null or player.has_meta("stopping"):
		return
	var to_duck := func() -> void:
		player.create_tween().tween_property(player, "volume_db", DUCK_DB, DUCK_TIME) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	if player.is_inside_tree():
		to_duck.call()
	else:
		player.ready.connect(to_duck, CONNECT_ONE_SHOT | CONNECT_DEFERRED)   # açılış tween'inden sonra


static func stop(_tree: SceneTree) -> void:
	var player := _player if is_instance_valid(_player) else null
	if player == null or player.has_meta("stopping"):
		return
	if not player.is_inside_tree():   # henüz eklenmedi (aynı karede play+stop) → doğrudan iptal
		player.queue_free()
		_player = null
		return
	player.set_meta("stopping", true)
	var tw := player.create_tween()
	tw.tween_property(player, "volume_db", SILENT_DB, FADE_OUT)
	tw.tween_callback(func() -> void:
		if player.has_meta("stopping"):
			player.queue_free()
			if _player == player:
				_player = null)
