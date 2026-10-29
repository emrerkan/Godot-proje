## ImportedMap.gd — asset model/haritalar/*.glb haritalarını oyuna kurar (ImportedMap.tscn kökü).
## Hangi GLB: NetworkManager.get_map_info()["glb"] (oda ayarındaki harita). Rehber: asset model/haritalar/HARITALAR_TEKNIK_REHBERI_AI.md
## (dosyalarla doğrulandı; farklar aşağıda not edildi).
##
## Kurulum sırası (_ready → map_ready sinyali; GameManager oyuncu/kart/kapı doğurmadan bunu bekler):
##  1. GLB örneklenir, örnek kart modelleri (CardVisual_*) gizlenir — yoksa 12 sahte kart görünür
##  2. Çarpışma: mesh başına trimesh, isim filtresi (yaprak/su/neon/holo yok) + harita kenarına görünmez duvar
##  3. Fizik hazır olunca: spawn / kart / kapı noktaları zemine (kart: kaidenin üstüne) ışınla oturtulur
##  4. Yükseklik taraması (1 m ızgara) → minimap duvar maskesi + güç noktaları + otomatik duvar lambaları
##     (rehberdeki WallLamps / PowerupPoints grupları GLB'lerde BOŞ — o yüzden üretiliyor; tohumlu RNG, her peer'da aynı)
##  5. Görüş engeli: yerel oyuncuyu kameradan SAKLAYAN duvar/bina parçası ve ağaç tepesi saydamlaşır (_physics_process)

extends Node3D

signal map_ready

## Çarpışma verilmeyecek mesh isim parçaları (rehber §6 + kendi eklemelerimiz).
## "Pad_Team": takım spawn platformları (parlak takım renkli ~7 m disk) GİZLENİR ve çarpışmasızdır — kullanıcı: "takım
## bölgeleri işaretli durmasın, oyuncular öğrenince taktiksel olarak kullanır". (Eskiden çarpışmalıydı; görünmez
## platforma takılmak daha kötü, oyuncu altındaki zemine basar.)
const NO_COLLISION_KEYWORDS: Array[String] = [
	"Canopy", "Needles", "Frond", "Neon", "LED", "Holo", "CardVisual", "Beacon", "GlowRing",
	"Water", "Pool", "Basin", "Screen", "Glass", "Light", "Lamp", "Horn", "HospitalRedCross", "ER_RedGuideLine",
	"Pad_Team",
]
const HIDDEN_KEYWORDS: Array[String] = ["CardVisual", "Pad_Team"]
const CANOPY_KEYWORDS: Array[String] = ["Canopy", "Needles", "Frond"]
const WATER_KEYWORDS: Array[String] = ["Water", "Basin"]

const GRID_STEP := 1.0                 # tarama çözünürlüğü (m) — minimap 1 px = 1 m
const WALL_STEP_HEIGHT := 1.2          # komşusundan bu kadar yüksek hücre = duvar/engel
const LAMP_MIN_WALL := 2.4             # lamba asılacak duvar en az bu kadar yüksek olmalı
const LAMP_SPACING := 11.0
const LAMP_PER_M2 := 1.0 / 240.0
const LAMP_MAX := 40
const POWERUP_SPACING := 9.0
const POWERUP_MAX := 32
const POWERUP_MIN_FROM_SPAWN := 7.0
## Zemini olmayan hücreler (Liman: çarpışmasız su havuzu) → görünmez duvar. Ayrı katman: sadece oyuncu çarpar
## (Player.VOID_WALL_LAYER), mermi/bomba/ışınlar (maske 1) suyun üstünden geçer.
const VOID_WALL_LAYER := 16
const VOID_WALL_HEIGHT := 3.0          # minimap/lamba için hücre yüksekliği (zemin üstü)

var is_map_ready := false
var minimap_min := Vector2(-62, -46)
var minimap_max := Vector2(62, 46)
var minimap_texture: Texture2D = null

var _model: Node3D
var _bounds := AABB()
var _heights := PackedFloat32Array()
var _grid_w := 0
var _grid_h := 0
var _wall := PackedByteArray()
var _canopies: Array[GeometryInstance3D] = []
var _canopy_aabb: Array[AABB] = []
var _lamp_scale := 1.0
var _water_floor := false
const LOADING := preload("res://scenes/ui/LoadingScreen.gd")
const LOAD_SHARE := 0.55               # yükleme çubuğunda GLB yüklemesinin payı (kalanı yükseklik taraması)
const SCAN_ROWS_PER_FRAME := 6
var _spawn_list: Array[Vector3] = []
var _card_list: Array[Vector3] = []


func _ready() -> void:
	var info: Dictionary = NetworkManager.get_map_info()
	var path: String = info.get("glb", "")
	var packed: PackedScene = null
	# GLB iş parçacığında yüklenir → yükleme perdesi (LoadingScreen) akmaya devam eder
	if not path.is_empty() and ResourceLoader.exists(path) and ResourceLoader.load_threaded_request(path, "", true) == OK:
		var progress := []
		while ResourceLoader.load_threaded_get_status(path, progress) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			LOADING.set_progress(get_tree(), LOAD_SHARE * (float(progress[0]) if not progress.is_empty() else 0.0))
			await get_tree().process_frame
		if not is_instance_valid(self):
			return
		packed = ResourceLoader.load_threaded_get(path) as PackedScene
	if packed == null:
		push_error("Harita modeli yüklenemedi: %s" % path)
		_finish()
		return
	_model = packed.instantiate()
	_model.name = "MapModel"
	add_child(_model)
	move_child(_model, 0)

	_hide_card_visuals(_model)
	_scale_emission(_model, float(info.get("emission_scale", 1.0)))
	_scale_emission(_model, float(info.get("water_emission", 1.0)), ["Water", "Basin"])
	_lamp_scale = float(info.get("lamp_scale", 1.0))
	_bounds = _compute_bounds(_model)
	_water_floor = bool(info.get("water_floor", false))
	_build_collisions(_model)
	_build_bounds_walls()

	# Yeni çarpışma şekillerinin fizik uzayına girmesi için birkaç fizik karesi
	for i in 3:
		await get_tree().physics_frame
	if not is_instance_valid(self):
		return

	var space := get_world_3d().direct_space_state
	_snap_points(space)
	await _scan_heights(space)
	if not is_instance_valid(self):
		return
	LOADING.set_progress(get_tree(), 1.0)
	_build_minimap()
	var seed_base := hash(String(info.get("id", "map")))
	var pm := get_node_or_null("PowerupManager")
	if pm and pm.has_method("set_points"):
		pm.set_points(_pick_powerup_points(seed_base))
	_place_lamps(space, seed_base)
	_collect_canopies(_model)
	_finish()


func _finish() -> void:
	is_map_ready = true
	map_ready.emit()


# ─────────────────────────────────────────────
#  1-2. Model hazırlığı + çarpışma
# ─────────────────────────────────────────────

func _hide_card_visuals(n: Node) -> void:
	if n is Node3D and _has_keyword(String(n.name), HIDDEN_KEYWORDS):
		(n as Node3D).visible = false
	for c in n.get_children():
		_hide_card_visuals(c)


## Haritaya özel parlaklık (MAPS "emission_scale"): Yeraltı Kuantum'da 156 neon şerit + plazma (enerji 4-6.5) fazla aydınlıktı.
## Malzemeler içe aktarılan sahneyle PAYLAŞILIYOR → kopyalanıp surface override olarak verilir (yoksa her yüklemede tekrar kısılırdı).
## only_names doluysa sadece adı bunları içeren mesh'ler (MAPS "water_emission": Liman suyu tüm haritayı camgöbeği aydınlatıyordu).
func _scale_emission(n: Node, scale: float, only_names: Array[String] = []) -> void:
	if is_equal_approx(scale, 1.0):
		return
	var dup := {}
	for mi: MeshInstance3D in n.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh == null or (not only_names.is_empty() and not _has_keyword(String(mi.name), only_names)):
			continue
		for s in mi.mesh.get_surface_count():
			var mat := (mi.get_surface_override_material(s) if mi.get_surface_override_material(s) else mi.mesh.surface_get_material(s)) as StandardMaterial3D
			if mat == null or not mat.emission_enabled:
				continue
			if not dup.has(mat):
				var c := mat.duplicate() as StandardMaterial3D
				c.emission_energy_multiplier = mat.emission_energy_multiplier * scale
				dup[mat] = c
			mi.set_surface_override_material(s, dup[mat])


func _has_keyword(node_name: String, words: Array[String]) -> bool:
	for w in words:
		if w in node_name:
			return true
	return false


func _build_collisions(n: Node) -> void:
	if n is MeshInstance3D and (n as MeshInstance3D).mesh and not _has_keyword(String(n.name), NO_COLLISION_KEYWORDS):
		(n as MeshInstance3D).create_trimesh_collision()   # StaticBody3D çocuğu, layer 1 (oyuncu + mermi)
	elif _water_floor and n is MeshInstance3D and (n as MeshInstance3D).mesh and _has_keyword(String(n.name), WATER_KEYWORDS):
		# Güvenlik zemini (MAPS "water_floor"): kenar duvarının kısmi hücrelerden (gemi gövdesi/rampa yanı) sızan oyuncu
		# sonsuza düşmesin, suya basar ve zıplayarak rıhtıma çıkar. Sadece oyuncu katmanı — tarama/mermi görmez.
		(n as MeshInstance3D).create_trimesh_collision()
		for b in n.get_children():
			if b is StaticBody3D:
				(b as StaticBody3D).collision_layer = VOID_WALL_LAYER
				(b as StaticBody3D).collision_mask = 0
	for c in n.get_children():
		if not (c is StaticBody3D):
			_build_collisions(c)


func _compute_bounds(n: Node) -> AABB:
	var out := AABB()
	var first := true
	for mi: MeshInstance3D in n.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh == null:
			continue
		var b: AABB = mi.global_transform * mi.get_aabb()
		out = b if first else out.merge(b)
		first = false
	return out


## Harita kenarına görünmez duvarlar (oyuncu dışarı yürümesin / düşmesin)
func _build_bounds_walls() -> void:
	var body := StaticBody3D.new()
	body.name = "Bounds"
	add_child(body)
	var c := _bounds.get_center()
	var s := _bounds.size
	var h := 12.0
	for side: Array in [[Vector3(_bounds.position.x - 0.5, 0, c.z), Vector3(1, h, s.z + 2)],
			[Vector3(_bounds.end.x + 0.5, 0, c.z), Vector3(1, h, s.z + 2)],
			[Vector3(c.x, 0, _bounds.position.z - 0.5), Vector3(s.x + 2, h, 1)],
			[Vector3(c.x, 0, _bounds.end.z + 0.5), Vector3(s.x + 2, h, 1)]]:
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = side[1]
		cs.shape = box
		cs.position = side[0]
		body.add_child(cs)


# ─────────────────────────────────────────────
#  3. Noktaları zemine oturt + kaydet
# ─────────────────────────────────────────────

func _ray_down(space: PhysicsDirectSpaceState3D, p: Vector3, up: float, down: float) -> Variant:
	var q := PhysicsRayQueryParameters3D.create(p + Vector3(0, up, 0), p - Vector3(0, down, 0))
	var hit := space.intersect_ray(q)
	return null if hit.is_empty() else (hit["position"] as Vector3)


func _snap_points(space: PhysicsDirectSpaceState3D) -> void:
	# Spawn: SpawnPoints çocukları SIRAYLA takım 0-3 (rehber kural 2 — isimler haritaya göre değişiyor)
	var sp: Node = _model.find_child("SpawnPoints", true, false)
	if sp:
		var teams := sp.get_children()
		for t in mini(teams.size(), 4):
			var pts: Array[Vector3] = []
			for slot in teams[t].get_children():
				if slot is Node3D:
					var p: Vector3 = (slot as Node3D).global_position
					var g: Variant = _ray_down(space, p, 3.0, 6.0)
					if g != null:
						p.y = (g as Vector3).y + 0.05
					pts.append(p)
					_spawn_list.append(p)
			TeamManager.register_spawn_points(t, pts)
	# Kart: kaidenin üstüne (Card.tscn zeminden yukarı doğru kurulu) · Kapı: zemine
	for grp: Array in [["CardPoints", 0.6], ["DoorPoints", 2.0]]:
		var root: Node = _model.find_child(grp[0], true, false)
		if root == null:
			continue
		for c in root.get_children():
			if c is Node3D:
				var n3 := c as Node3D
				var g2: Variant = _ray_down(space, n3.global_position, float(grp[1]), 6.0)
				if g2 != null:
					n3.global_position = Vector3(n3.global_position.x, (g2 as Vector3).y + 0.02, n3.global_position.z)
				if grp[0] == "CardPoints":
					_card_list.append(n3.global_position)


# ─────────────────────────────────────────────
#  4. Yükseklik taraması → minimap / güç noktaları / lambalar
# ─────────────────────────────────────────────

func _scan_heights(space: PhysicsDirectSpaceState3D) -> void:
	_grid_w = int(ceil(_bounds.size.x / GRID_STEP))
	_grid_h = int(ceil(_bounds.size.z / GRID_STEP))
	_heights.resize(_grid_w * _grid_h)
	var top := _bounds.end.y + 2.0
	var bottom := _bounds.position.y - 2.0
	# Hücre büyüklüğünde ince kutu aşağı süpürülür → hücredeki EN YÜKSEK yüzey. Tek merkez ışını 0.4 m'lik ince
	# duvarları (Hastane/Metro: tam sayı koordinatta, hücre merkezlerinin arasında) kaçırıyordu.
	var box := BoxShape3D.new()
	box.size = Vector3(GRID_STEP, 0.05, GRID_STEP)
	var sq := PhysicsShapeQueryParameters3D.new()
	sq.shape = box
	sq.collision_mask = 1
	sq.motion = Vector3(0, bottom - top, 0)
	for z in _grid_h:
		# Tarama 1-2 sn sürüyor: satır gruplarına bölünür, aralarda perde ilerler (fizik karesi — uzay sorgusu güvenli)
		if z > 0 and z % SCAN_ROWS_PER_FRAME == 0:
			LOADING.set_progress(get_tree(), LOAD_SHARE + (1.0 - LOAD_SHARE) * float(z) / float(_grid_h))
			await get_tree().physics_frame
			if not is_instance_valid(self):
				return
			space = get_world_3d().direct_space_state
		for x in _grid_w:
			var p := _cell_center(x, z)
			sq.transform = Transform3D(Basis(), Vector3(p.x, top, p.z))
			var frac: PackedFloat32Array = space.cast_motion(sq)
			_heights[z * _grid_w + x] = top + (bottom - top) * frac[0] - 0.025 if frac[0] < 1.0 else NAN
	_build_void_walls(space)
	# Duvar/engel: 3×3 komşuluğunun en alçağından belirgin yüksek hücre (yumuşak tepeler duvar sayılmaz)
	_wall.resize(_grid_w * _grid_h)
	for z in _grid_h:
		for x in _grid_w:
			var h := _heights[z * _grid_w + x]
			var low := h
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					var nx := clampi(x + dx, 0, _grid_w - 1)
					var nz := clampi(z + dz, 0, _grid_h - 1)
					low = minf(low, _heights[nz * _grid_w + nx])
			_wall[z * _grid_w + x] = 1 if h - low > WALL_STEP_HEIGHT or h == VOID_WALL_HEIGHT else 0


## Işın hiçbir şeye çarpmayan (NAN) hücreleri satır satır birleştirip kutu çarpışma olarak kapatır; hücre yüksekliği
## duvar sayılır (minimap'te dolu, lamba/güç noktası kenarına yerleşmez — lamba ışını maske 1 olduğundan engele asılmaz).
## Kısmi hücreler (Liman: bordalama rampası/gemi gövdesi hücrenin bir kısmını kaplıyor, kutu tarama "zemin var" der ama
## yanından suya düşülüyordu): boşluğa komşu hücreler 0.5 m'lik 4 alt hücreye bölünür, merkez ışını (maske 1) bir şeye
## çarpmayan alt hücre de kapatılır.
func _build_void_walls(space: PhysicsDirectSpaceState3D) -> void:
	var body: StaticBody3D = null
	var y0 := _bounds.position.y - 2.0
	var top := _bounds.end.y + 2.0
	var edge: Array[Vector2i] = []
	for z in _grid_h:
		for x in _grid_w:
			if is_nan(_heights[z * _grid_w + x]):
				continue
			for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var nx := x + d.x
				var nz := z + d.y
				if nx >= 0 and nz >= 0 and nx < _grid_w and nz < _grid_h and is_nan(_heights[nz * _grid_w + nx]):
					edge.append(Vector2i(x, z))
					break
	if not edge.is_empty():
		body = StaticBody3D.new()
		body.name = "VoidWalls"
		body.collision_layer = VOID_WALL_LAYER
		body.collision_mask = 0
		add_child(body)
	var half := GRID_STEP * 0.5
	for e in edge:
		var c := _cell_center(e.x, e.y)
		for o: Vector2 in [Vector2(-0.25, -0.25), Vector2(0.25, -0.25), Vector2(-0.25, 0.25), Vector2(0.25, 0.25)]:
			var sx := c.x + o.x * GRID_STEP
			var sz := c.z + o.y * GRID_STEP
			var q := PhysicsRayQueryParameters3D.create(Vector3(sx, top, sz), Vector3(sx, y0, sz), 1)
			if not space.intersect_ray(q).is_empty():
				continue
			var cs0 := CollisionShape3D.new()
			var b0 := BoxShape3D.new()
			b0.size = Vector3(half, 10.0, half)
			cs0.shape = b0
			cs0.position = Vector3(sx, y0 + 5.0, sz)
			body.add_child(cs0)
	for z in _grid_h:
		var x := 0
		while x < _grid_w:
			if not is_nan(_heights[z * _grid_w + x]):
				x += 1
				continue
			var start := x
			while x < _grid_w and is_nan(_heights[z * _grid_w + x]):
				_heights[z * _grid_w + x] = VOID_WALL_HEIGHT
				x += 1
			if body == null:
				body = StaticBody3D.new()
				body.name = "VoidWalls"
				body.collision_layer = VOID_WALL_LAYER
				body.collision_mask = 0
				add_child(body)
			var cs := CollisionShape3D.new()
			var box := BoxShape3D.new()
			box.size = Vector3((x - start) * GRID_STEP, 10.0, GRID_STEP)
			cs.shape = box
			var c0 := _cell_center(start, z)
			cs.position = Vector3(c0.x + (x - start - 1) * GRID_STEP * 0.5, y0 + 5.0, c0.z)
			body.add_child(cs)


func _cell_center(x: int, z: int) -> Vector3:
	return Vector3(_bounds.position.x + (x + 0.5) * GRID_STEP, 0, _bounds.position.z + (z + 0.5) * GRID_STEP)


func _is_wall(x: int, z: int) -> bool:
	if x < 0 or z < 0 or x >= _grid_w or z >= _grid_h:
		return true
	return _wall[z * _grid_w + x] == 1


func _build_minimap() -> void:
	minimap_min = Vector2(_bounds.position.x, _bounds.position.z)
	minimap_max = Vector2(_bounds.end.x, _bounds.end.z)
	var img := Image.create(_grid_w, _grid_h, false, Image.FORMAT_RGBA8)
	for z in _grid_h:
		for x in _grid_w:
			img.set_pixel(x, z, Color(1, 1, 1, 1) if _wall[z * _grid_w + x] == 1 else Color(1, 1, 1, 0))
	minimap_texture = ImageTexture.create_from_image(img)


## Güç noktaları: duvar dibindeki açık hücreler (köşe/kenar — labirentteki "köşe" mantığı), spawn'lardan uzak, aralıklı
func _pick_powerup_points(seed_base: int) -> Array[Vector3]:
	var cands: Array[Vector3] = []
	for z in range(1, _grid_h - 1):
		for x in range(1, _grid_w - 1):
			if _is_wall(x, z):
				continue
			var clear := true
			var near_wall := 0
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					if _is_wall(x + dx, z + dz):
						clear = false
			if not clear:
				continue
			for d: Vector2i in [Vector2i(2, 0), Vector2i(-2, 0), Vector2i(0, 2), Vector2i(0, -2)]:
				if _is_wall(x + d.x, z + d.y):
					near_wall += 1
			if near_wall == 0:
				continue
			var p := _cell_center(x, z)
			p.y = _heights[z * _grid_w + x]
			if _near_any(p, _spawn_list, POWERUP_MIN_FROM_SPAWN) or _near_any(p, _card_list, 3.0):
				continue
			cands.append(p)
	return _spread_pick(cands, POWERUP_SPACING, POWERUP_MAX, seed_base + 17)


func _near_any(p: Vector3, list: Array[Vector3], r: float) -> bool:
	for q in list:
		if Vector2(p.x - q.x, p.z - q.z).length() < r:
			return true
	return false


func _spread_pick(cands: Array[Vector3], spacing: float, max_count: int, seed_v: int) -> Array[Vector3]:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	# Fisher-Yates (tohumlu → her peer'da aynı sıra)
	for i in range(cands.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var t := cands[i]
		cands[i] = cands[j]
		cands[j] = t
	var out: Array[Vector3] = []
	for c in cands:
		if out.size() >= max_count:
			break
		if not _near_any(c, out, spacing):
			out.append(c)
	return out


## Otomatik duvar lambaları: duvar dibindeki hücreden duvara yatay ışın → yüzeye Marker3D (-Z koridora bakar)
func _place_lamps(space: PhysicsDirectSpaceState3D, seed_base: int) -> void:
	var lamps := get_node_or_null("WallLamps")
	if lamps == null:
		return
	lamps.set("energy_scale", float(NetworkManager.get_map_info().get("lamp_energy", 1.0)))
	var cands: Array[Vector3] = []
	var dirs: Array[Vector3] = []
	for z in range(1, _grid_h - 1):
		for x in range(1, _grid_w - 1):
			if _is_wall(x, z):
				continue
			for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				if _is_wall(x + d.x, z + d.y) and not _is_wall(x - d.x, z - d.y):
					var p := _cell_center(x, z)
					p.y = _heights[z * _grid_w + x]
					cands.append(p)
					dirs.append(Vector3(d.x, 0, d.y))
					break
	var order: Array[int] = []
	for i in cands.size():
		order.append(i)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_base + 911
	for i in range(order.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var t := order[i]
		order[i] = order[j]
		order[j] = t
	var max_count := mini(LAMP_MAX, int(_bounds.size.x * _bounds.size.z * LAMP_PER_M2 * _lamp_scale))
	var placed: Array[Vector3] = []
	for i in order:
		if placed.size() >= max_count:
			break
		var floor_p: Vector3 = cands[i]
		if _near_any(floor_p, placed, LAMP_SPACING):
			continue
		var from := floor_p + Vector3(0, 2.0, 0)
		var q := PhysicsRayQueryParameters3D.create(from, from + dirs[i] * 2.5, 1)
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			continue
		var normal: Vector3 = hit["normal"]
		if absf(normal.y) > 0.3:
			continue
		var wall_top: Variant = _ray_down(space, (hit["position"] as Vector3) - normal * 0.3, 8.0, 0.5)
		if wall_top == null or (wall_top as Vector3).y - floor_p.y < LAMP_MIN_WALL:
			continue
		var m := Marker3D.new()
		lamps.add_child(m)
		var y := minf(floor_p.y + 2.75, (wall_top as Vector3).y - 0.25)
		var pos := Vector3((hit["position"] as Vector3).x, y, (hit["position"] as Vector3).z) + normal * 0.02
		m.global_transform = Transform3D(Basis.looking_at(Vector3(normal.x, 0, normal.z).normalized()), pos)
		placed.append(floor_p)
	if lamps.has_method("rebuild"):
		lamps.rebuild()


# ─────────────────────────────────────────────
#  5. Ağaç tepeleri: yerel oyuncuya yakınsa saydam
# ─────────────────────────────────────────────

func _collect_canopies(n: Node) -> void:
	for gi: GeometryInstance3D in n.find_children("*", "GeometryInstance3D", true, false):
		if _has_keyword(String(gi.name), CANOPY_KEYWORDS):
			_canopies.append(gi)
			_canopy_aabb.append((gi.global_transform * gi.get_aabb()).grow(0.3))


## ── Görüş engeli saydamlaştırma (sadece yerel, kullanıcı kuralı: "karakter kameradan GÖRÜNMÜYORSA") ──
## Fizik karesinde kameradan yerel oyuncunun ayak/bel/baş hizasına ışınlar: araya giren duvar/bina mesh'i (trimesh
## StaticBody'sinin ebeveyni) saydamlaşır. Ağaç tepelerinin çarpışması yok → kamera–oyuncu doğrusu AABB'lerini kesiyorsa.
## Zemin/arazi saydamlaşmaz. Karakter açığa çıkınca nesne yavaşça eski haline döner.
const FALL_RESCUE_DEPTH := 4.0
const OCCLUDE_ALPHA := 0.72
const OCCLUDE_HEIGHTS: Array[float] = [0.35, 1.1, 1.8]
const NO_FADE_KEYWORDS: Array[String] = ["Terrain", "Floor", "Ground", "Deck", "Plaza", "Driveway", "Bridge"]
var _occluders: Dictionary = {}   # GeometryInstance3D → true (bu kare kapatanlar)
var _faded: Dictionary = {}       # şu an saydam/geri dönen nesneler


func _physics_process(_delta: float) -> void:
	if not is_map_ready:
		return
	var me: Variant = GameManager.active_players.get(NetworkManager.get_local_id())
	var cam := get_viewport().get_camera_3d()
	_occluders.clear()
	if me == null or not is_instance_valid(me) or cam == null or me.is_dead:
		return
	# Son güvenlik: haritanın altına düşen yerel oyuncu kendi takım spawn'ına döner (konum local otoriteli)
	if (me as Node3D).global_position.y < _bounds.position.y - FALL_RESCUE_DEPTH:
		(me as CharacterBody3D).velocity = Vector3.ZERO
		(me as Node3D).global_position = TeamManager.get_spawn_position(int(me.team_id))
		(me as Node3D).reset_physics_interpolation()
		return
	var space := get_world_3d().direct_space_state
	var cpos := cam.global_position
	var players_rids: Array[RID] = []
	for p in GameManager.active_players.values():
		if is_instance_valid(p):
			players_rids.append((p as CollisionObject3D).get_rid())
	var base: Vector3 = (me as Node3D).global_position
	for h in OCCLUDE_HEIGHTS:
		var target := base + Vector3(0, h, 0)
		var exclude := players_rids.duplicate()
		var q := PhysicsRayQueryParameters3D.create(cpos, target, 1)
		for _i in 4:
			q.exclude = exclude
			var hit := space.intersect_ray(q)
			if hit.is_empty():
				break
			exclude.append(hit["rid"])
			var gi := (hit["collider"] as Node).get_parent() as GeometryInstance3D
			if gi and not _has_keyword(String(gi.name), NO_FADE_KEYWORDS):
				_occluders[gi] = true
		for i in _canopies.size():
			if _canopy_aabb[i].intersects_segment(cpos, target):
				_occluders[_canopies[i]] = true


func _process(delta: float) -> void:
	if _occluders.is_empty() and _faded.is_empty():
		return
	for gi in _occluders:
		_faded[gi] = true
	var k := 1.0 - exp(-10.0 * delta)
	for gi: GeometryInstance3D in _faded.keys():
		if not is_instance_valid(gi):
			_faded.erase(gi)
			continue
		var want := OCCLUDE_ALPHA if _occluders.has(gi) else 0.0
		gi.transparency = lerpf(gi.transparency, want, k)
		if want == 0.0 and gi.transparency < 0.01:
			gi.transparency = 0.0
			_faded.erase(gi)
