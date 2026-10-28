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
##  5. Orman: yerel oyuncuya yakın ağaç tepeleri saydamlaşır (üstten kamera altındakini görsün)

extends Node3D

signal map_ready

## Çarpışma verilmeyecek mesh isim parçaları (rehber §6 + kendi eklemelerimiz).
## NOT: rehber "Pad_Team"i de listeliyor ama takım platformları üstünde durulan zemin — çarpışma ALMALI
## (yoksa Yeraltı haritasında oyuncular platformun 0.27 m içine gömülüyordu).
const NO_COLLISION_KEYWORDS: Array[String] = [
	"Canopy", "Needles", "Frond", "Neon", "LED", "Holo", "CardVisual", "Beacon", "GlowRing",
	"Water", "Pool", "Basin", "Screen", "Glass", "Light", "Lamp",
]
const CANOPY_KEYWORDS: Array[String] = ["Canopy", "Needles", "Frond"]
const CANOPY_FADE_RADIUS := 6.0        # bu yakınlıktaki ağaç tepesi saydamlaşır (yerel oyuncu)
const CANOPY_FADE_ALPHA := 0.78        # GeometryInstance3D.transparency (1 = görünmez)

const GRID_STEP := 1.0                 # tarama çözünürlüğü (m) — minimap 1 px = 1 m
const WALL_STEP_HEIGHT := 1.2          # komşusundan bu kadar yüksek hücre = duvar/engel
const LAMP_MIN_WALL := 2.4             # lamba asılacak duvar en az bu kadar yüksek olmalı
const LAMP_SPACING := 11.0
const LAMP_PER_M2 := 1.0 / 240.0
const LAMP_MAX := 40
const POWERUP_SPACING := 9.0
const POWERUP_MAX := 32
const POWERUP_MIN_FROM_SPAWN := 7.0

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
var _canopy_xz: Array[Vector2] = []
var _lamp_scale := 1.0
var _spawn_list: Array[Vector3] = []
var _card_list: Array[Vector3] = []


func _ready() -> void:
	var info: Dictionary = NetworkManager.get_map_info()
	var path: String = info.get("glb", "")
	var packed: PackedScene = load(path) as PackedScene if not path.is_empty() and ResourceLoader.exists(path) else null
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
	_lamp_scale = float(info.get("lamp_scale", 1.0))
	_bounds = _compute_bounds(_model)
	_build_collisions(_model)
	_build_bounds_walls()

	# Yeni çarpışma şekillerinin fizik uzayına girmesi için birkaç fizik karesi
	for i in 3:
		await get_tree().physics_frame
	if not is_instance_valid(self):
		return

	var space := get_world_3d().direct_space_state
	_snap_points(space)
	_scan_heights(space)
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
	if n is Node3D and "CardVisual" in String(n.name):
		(n as Node3D).visible = false
	for c in n.get_children():
		_hide_card_visuals(c)


## Haritaya özel parlaklık (MAPS "emission_scale"): Yeraltı Kuantum'da 156 neon şerit + plazma (enerji 4-6.5) fazla aydınlıktı.
## Malzemeler içe aktarılan sahneyle PAYLAŞILIYOR → kopyalanıp surface override olarak verilir (yoksa her yüklemede tekrar kısılırdı).
func _scale_emission(n: Node, scale: float) -> void:
	if is_equal_approx(scale, 1.0):
		return
	var dup := {}
	for mi: MeshInstance3D in n.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh == null:
			continue
		for s in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(s) as StandardMaterial3D
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
	for z in _grid_h:
		for x in _grid_w:
			var p := _cell_center(x, z)
			var q := PhysicsRayQueryParameters3D.create(Vector3(p.x, top, p.z), Vector3(p.x, bottom, p.z))
			var hit := space.intersect_ray(q)
			_heights[z * _grid_w + x] = (hit["position"] as Vector3).y if not hit.is_empty() else bottom
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
			_wall[z * _grid_w + x] = 1 if h - low > WALL_STEP_HEIGHT else 0


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
		var q := PhysicsRayQueryParameters3D.create(from, from + dirs[i] * 2.5)
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
			var c: Vector3 = (gi.global_transform * gi.get_aabb()).get_center()
			_canopy_xz.append(Vector2(c.x, c.z))


func _process(delta: float) -> void:
	if _canopies.is_empty():
		return
	var me: Variant = GameManager.active_players.get(NetworkManager.get_local_id())
	if me == null or not is_instance_valid(me):
		return
	var pp: Vector3 = (me as Node3D).global_position
	var p2 := Vector2(pp.x, pp.z)
	var k := 1.0 - exp(-8.0 * delta)
	for i in _canopies.size():
		var near := _canopy_xz[i].distance_to(p2) < CANOPY_FADE_RADIUS
		var gi := _canopies[i]
		gi.transparency = lerpf(gi.transparency, CANOPY_FADE_ALPHA if near else 0.0, k)
