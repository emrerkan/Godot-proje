## Map.gd (3D)
## Spawn noktalarını TeamManager'a kaydeder ve labirent duvarlarının çarpışmasını kurar.
## Labirent: Maze/MazeMesh (asset model/Maze_walls.obj — Maze.obj'den ortalanmış, XZ ×0.5, 3 m yükseklik).
## Kart/kapı aday noktaları CardPoints / DoorPoints altında (GameManager._spawn_card_and_door okur).

extends Node3D

@onready var spawn_root: Node3D = $SpawnPoints

## Bot gezinme ızgarası kaynağı: Minimap ile aynı duvar maskesi (1 px = 1 m) ve aynı hiza (Minimap.MAP_MIN/MAX).
## Izgara tam Bounds iç yüzlerine (±62 / ±46) oturur → ızgara dışı = Bounds dışı = geçilmez.
const NAV_MASK_TEXTURE := "res://asset model/Maze_minimap.png"
const NAV_MIN := Vector2(-62.0, -46.0)
const NAV_MAX := Vector2(62.0, 46.0)
var _nav_grid: Dictionary = {}   # önbellek (görüntü bir kez okunur)
var _nav_built := false


func _ready() -> void:
	preload("res://scenes/world/SceneLighting.gd").apply_node(self)
	_build_maze_collision()
	_register_spawn_points()


## Duvar mesh'inden çarpışma şekli üretir (oyuncular + mermiler duvara takılır, layer 1)
func _build_maze_collision() -> void:
	var mesh_inst := get_node_or_null("Maze/MazeMesh") as MeshInstance3D
	if mesh_inst == null or mesh_inst.mesh == null:
		push_warning("Labirent mesh'i bulunamadı (Maze/MazeMesh)")
		return
	var shape := CollisionShape3D.new()
	shape.shape = mesh_inst.mesh.create_trimesh_shape()
	shape.transform = mesh_inst.transform
	$Maze.add_child(shape)


## Bot gezinme ızgarası (BotNav sözleşmesi): {wall, width, height, origin, cell}; idx = z*width + x, 1 = geçilmez.
## Labirentte sinyal/bekleme yok → hep hazır; görüntü okunamazsa {} (BotBrain düz çizgiye düşer).
func get_nav_grid() -> Dictionary:
	if _nav_built:
		return _nav_grid
	_nav_built = true
	if not ResourceLoader.exists(NAV_MASK_TEXTURE):
		push_warning("Bot ızgarası: duvar maskesi bulunamadı (%s)" % NAV_MASK_TEXTURE)
		return _nav_grid
	var tex := load(NAV_MASK_TEXTURE) as Texture2D
	if tex == null:
		return _nav_grid
	var img := tex.get_image()
	if img == null or img.is_empty():
		return _nav_grid
	if img.is_compressed():
		img.decompress()
	var w := img.get_width()
	var h := img.get_height()
	var wall := PackedByteArray()
	wall.resize(w * h)
	for z in h:
		for x in w:
			# Opak (beyaz) piksel = duvar, saydam = koridor
			wall[z * w + x] = 1 if img.get_pixel(x, z).a > 0.5 else 0
	_nav_grid = {
		"wall": wall,
		"width": w,
		"height": h,
		"origin": NAV_MIN,
		"cell": (NAV_MAX.x - NAV_MIN.x) / float(w),
	}
	return _nav_grid


func _register_spawn_points() -> void:
	for team_id in range(4):
		var team_node: Node = spawn_root.get_node_or_null("Team%d" % team_id)
		if team_node == null:
			push_warning("Spawn noktası bulunamadı: Team%d" % team_id)
			continue
		var points: Array[Vector3] = []
		for child in team_node.get_children():
			if child is Marker3D:
				points.append(child.global_position)
		TeamManager.register_spawn_points(team_id, points)
