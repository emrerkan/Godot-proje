## Main.gd
## Giriş noktası – yükleme ekranını açar, ana menüyü iş parçacığında yükler (açılışta birkaç saniyelik donma vardı),
## sonra geçer. Menünün ilk kareleri (3D arka plan, gölgelendirici derleme) da perdenin arkasında geçer.

extends Node

const LOADING := preload("res://scenes/ui/LoadingScreen.gd")
const MENU_PATH := "res://scenes/ui/MainMenu.tscn"
const MENU_SETTLE_FRAMES := 8


func _ready() -> void:
	UITheme.apply(get_tree())
	LOADING.open(get_tree(), "YÜKLENİYOR", "Sistem başlatılıyor")
	_load_menu()


func _load_menu() -> void:
	var tree := get_tree()
	# Perde çizilsin
	await tree.process_frame
	await tree.process_frame
	var packed: PackedScene = null
	if ResourceLoader.load_threaded_request(MENU_PATH, "", true) == OK:
		var progress := []
		while ResourceLoader.load_threaded_get_status(MENU_PATH, progress) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			LOADING.set_progress(tree, float(progress[0]) if not progress.is_empty() else 0.0)
			await tree.process_frame
		packed = ResourceLoader.load_threaded_get(MENU_PATH) as PackedScene
	LOADING.set_progress(tree, 1.0)
	if packed == null:
		packed = load(MENU_PATH) as PackedScene
	tree.change_scene_to_packed(packed)
	LOADING.close(tree, MENU_SETTLE_FRAMES)
