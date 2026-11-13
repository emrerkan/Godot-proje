## BotNav.gd — botlar için ızgara tabanlı yol bulma (harita başına bir kez, SADECE host kurar).
## Kaynak: harita get_nav_grid() → {wall, width, height, origin, cell} (idx = z*width + x, 1 = geçilmez).
## AStarGrid2D: çapraz geçiş sadece iki yan da açıksa (köşe kesmez). Duvara bitişik hücreler engel DEĞİL ama
## pahalı (WALL_WEIGHT) → botlar koridorun ortasından gider, 2-4 m dar koridorlar yine açık kalır.
## Kullanım: preload("res://scenes/bots/BotNav.gd").new() → build(grid) → find_path(from, to).
## class_name YOK (proje kuralı) — kullananlar preload eder.

extends RefCounted

const WALL_WEIGHT := 3.0        # duvara bitişik (8 komşu) hücre maliyeti
const NEAR_WALL_WEIGHT := 1.5   # duvardan iki hücre uzaktaki hücre
const NEAREST_SEARCH_RADIUS := 12   # geçilmez noktayı en yakın açık hücreye kaydırma arama yarıçapı (hücre)
const RANDOM_TRIES := 64
const SMOOTH_STEP := 0.35       # düzleştirme görüş taramasında örnek aralığı (hücre boyu ×)
const BODY_CLEARANCE := 0.3     # düzleştirmede gövde payı (m) — yol duvarı sıyırmasın

var _astar: AStarGrid2D = null
var _wall := PackedByteArray()
var _w := 0
var _h := 0
var _origin := Vector2.ZERO
var _cell := 1.0
var _open_cells: PackedInt32Array = PackedInt32Array()   # rastgele nokta seçimi için açık hücre indeksleri
var _built := false


func build(grid: Dictionary) -> void:
	_built = false
	_astar = null
	if grid.is_empty():
		return
	_wall = grid.get("wall", PackedByteArray())
	_w = int(grid.get("width", 0))
	_h = int(grid.get("height", 0))
	_origin = grid.get("origin", Vector2.ZERO)
	_cell = float(grid.get("cell", 1.0))
	if _w <= 0 or _h <= 0 or _cell <= 0.0 or _wall.size() < _w * _h:
		push_warning("BotNav: geçersiz ızgara (%d×%d, %d hücre)" % [_w, _h, _wall.size()])
		return
	var a := AStarGrid2D.new()
	a.region = Rect2i(0, 0, _w, _h)
	a.cell_size = Vector2(_cell, _cell)
	a.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	a.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	a.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	a.update()
	_open_cells = PackedInt32Array()
	for z in _h:
		for x in _w:
			var idx := z * _w + x
			if _wall[idx] != 0:
				a.set_point_solid(Vector2i(x, z), true)
				continue
			_open_cells.append(idx)
			var d := _wall_distance(x, z, 2)
			if d == 1:
				a.set_point_weight_scale(Vector2i(x, z), WALL_WEIGHT)
			elif d == 2:
				a.set_point_weight_scale(Vector2i(x, z), NEAR_WALL_WEIGHT)
	if _open_cells.is_empty():
		push_warning("BotNav: ızgarada açık hücre yok")
		return
	_astar = a
	_built = true


func is_ready() -> bool:
	return _built


## Dünya noktaları (y = from.y). İlk nokta başlangıç hücresi DEĞİL (zaten oradayız) — doğrudan ilk ara hedef.
## Hedefe ulaşılamıyorsa en yakın ulaşılabilir noktaya kadar kısmi yol. Hazır değilse [to].
func find_path(from: Vector3, to: Vector3) -> PackedVector3Array:
	var out := PackedVector3Array()
	if not _built:
		out.append(Vector3(to.x, from.y, to.z))
		return out
	var start := _nearest_open_cell(_to_cell(from))
	var goal_raw := _to_cell(to)
	var goal := _nearest_open_cell(goal_raw)
	if start.x < 0 or goal.x < 0:
		out.append(Vector3(to.x, from.y, to.z))
		return out
	var ids: Array[Vector2i] = _astar.get_id_path(start, goal, true)
	if ids.is_empty():
		out.append(Vector3(to.x, from.y, to.z))
		return out
	var pts: Array[Vector3] = []
	pts.append(Vector3(from.x, from.y, from.z))   # düzleştirme gerçek konumdan başlasın
	for i in range(1, ids.size()):
		pts.append(_cell_center(ids[i], from.y))
	# Hedef hücresi açık ve yol oraya vardıysa son nokta tam hedef (hücre merkezi değil)
	if goal == goal_raw and ids[ids.size() - 1] == goal and _is_point_clear(to):
		if pts.size() > 1:
			pts[pts.size() - 1] = Vector3(to.x, from.y, to.z)
		else:
			pts.append(Vector3(to.x, from.y, to.z))
	pts = _smooth(pts)
	for i in range(1, pts.size()):
		out.append(pts[i])
	if out.is_empty():
		out.append(_cell_center(goal, from.y) if goal != goal_raw else Vector3(to.x, from.y, to.z))
	return out


## Geçilmez/ızgara dışı noktayı en yakın açık hücre merkezine kaydırır (y korunur). Açıksa olduğu gibi döner.
func nearest_walkable(pos: Vector3) -> Vector3:
	if not _built:
		return pos
	if _is_point_clear(pos):
		return pos
	var n := _nearest_open_cell(_to_cell(pos))
	if n.x < 0:
		return pos
	return _cell_center(n, pos.y)


## Rastgele açık hücre merkezi (y = 0 — çağıran kendi yüksekliğini kullanır; find_path y'yi from'dan alır)
func random_walkable_point(rng: RandomNumberGenerator) -> Vector3:
	if not _built or _open_cells.is_empty():
		return Vector3.ZERO
	for _i in RANDOM_TRIES:
		var c := _idx_to_cell(_open_cells[rng.randi_range(0, _open_cells.size() - 1)])
		# Duvar dibini değil açık alanları tercih et
		if _wall_distance(c.x, c.y, 1) == 0:
			return _cell_center(c, 0.0)
	return _cell_center(_idx_to_cell(_open_cells[rng.randi_range(0, _open_cells.size() - 1)]), 0.0)


@warning_ignore("integer_division")
func _idx_to_cell(idx: int) -> Vector2i:
	return Vector2i(idx % _w, idx / _w)


## İki dünya noktası arası ızgarada açık mı (gövde payıyla) — BotBrain de kullanabilir
func line_clear(a: Vector3, b: Vector3) -> bool:
	if not _built:
		return true
	var d := Vector2(b.x - a.x, b.z - a.z)
	var length := d.length()
	if length < 0.001:
		return _is_point_clear(a)
	var dir := d / length
	var side := Vector2(-dir.y, dir.x) * BODY_CLEARANCE
	var step := _cell * SMOOTH_STEP
	var n := int(ceil(length / step))
	for i in range(n + 1):
		var t := minf(float(i) * step, length)
		var p := Vector2(a.x, a.z) + dir * t
		if not _is_xz_clear(p) or not _is_xz_clear(p + side) or not _is_xz_clear(p - side):
			return false
	return true


# ─────────────────────────────────────────────
# Yardımcılar
# ─────────────────────────────────────────────

## Görüş taramasıyla ara noktaları atlar (string pulling). Önce aynı doğrultudaki noktalar atılır, sonra
## açgözlü ileri tarama: çapadan görülebilen en uzak noktaya atla — O(n) tarama (O(n²) GDScript'te 100 ms sürüyordu).
func _smooth(pts: Array[Vector3]) -> Array[Vector3]:
	if pts.size() <= 2:
		return pts
	# 1) Doğrultu değişmeyen ara noktaları at
	var turns: Array[Vector3] = [pts[0]]
	for i in range(1, pts.size() - 1):
		var d0 := Vector2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z).normalized()
		var d1 := Vector2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z).normalized()
		if d0.dot(d1) < 0.999:
			turns.append(pts[i])
	turns.append(pts[pts.size() - 1])
	if turns.size() <= 2:
		return turns
	# 2) Açgözlü ileri tarama
	var out: Array[Vector3] = [turns[0]]
	var anchor := 0
	while anchor < turns.size() - 1:
		var j := anchor + 1
		while j + 1 < turns.size() and line_clear(turns[anchor], turns[j + 1]):
			j += 1
		out.append(turns[j])
		anchor = j
	return out


func _to_cell(p: Vector3) -> Vector2i:
	return Vector2i(int(floor((p.x - _origin.x) / _cell)), int(floor((p.z - _origin.y) / _cell)))


func _cell_center(c: Vector2i, y: float) -> Vector3:
	return Vector3(_origin.x + (float(c.x) + 0.5) * _cell, y, _origin.y + (float(c.y) + 0.5) * _cell)


func _in_bounds(c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < _w and c.y < _h


func _is_xz_clear(p: Vector2) -> bool:
	var c := Vector2i(int(floor((p.x - _origin.x) / _cell)), int(floor((p.y - _origin.y) / _cell)))
	return _in_bounds(c) and _wall[c.y * _w + c.x] == 0


func _is_point_clear(p: Vector3) -> bool:
	return _is_xz_clear(Vector2(p.x, p.z))


## Hücreden en yakın duvara Chebyshev mesafesi (max_r'ye kadar; bulunmazsa 0 = uzak). Izgara dışı = duvar.
func _wall_distance(x: int, z: int, max_r: int) -> int:
	for r in range(1, max_r + 1):
		for dz in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if maxi(absi(dx), absi(dz)) != r:
					continue
				var c := Vector2i(x + dx, z + dz)
				if not _in_bounds(c) or _wall[c.y * _w + c.x] != 0:
					return r
	return 0


## Açık hücre aynen; değilse halka halka genişleyerek en yakın açık hücre (yoksa (-1,-1))
func _nearest_open_cell(c: Vector2i) -> Vector2i:
	var cc := Vector2i(clampi(c.x, 0, _w - 1), clampi(c.y, 0, _h - 1))
	if _wall[cc.y * _w + cc.x] == 0:
		return cc
	var best := Vector2i(-1, -1)
	var best_d := INF
	for r in range(1, NEAREST_SEARCH_RADIUS + 1):
		for dz in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if maxi(absi(dx), absi(dz)) != r:
					continue
				var n := Vector2i(cc.x + dx, cc.y + dz)
				if not _in_bounds(n) or _wall[n.y * _w + n.x] != 0:
					continue
				var d := float(dx * dx + dz * dz)
				if d < best_d:
					best_d = d
					best = n
		if best.x >= 0:
			return best
	return best
