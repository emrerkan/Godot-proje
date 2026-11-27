## Minimap.gd (3D)
## Ekranın sağ-alt köşesinde mini harita.
## Kendin ve takım arkadaşların her zaman görünür.
## Düşman kart taşıyıcı, pickup anında 3 saniyeliğine kırmızı alert olarak belirir.

extends Control

## Harita sınırları (3D dünya X/Z) — labirent (Maze_walls.obj) ayak izi, Maze_minimap.png ile birebir (1 px = 1 m)
const MAP_MIN := Vector2(-62.0, -46.0)
const MAP_MAX := Vector2(62.0, 46.0)
const MAX_SIZE := Vector2(333.0, 260.0) # harita oranını koruyarak bu kutuya sığar (kare haritalar basıklaşmaz)
const PAD := 10.0
const WALLS_TEXTURE := "res://asset model/Maze_minimap.png"
## false yapılırsa minimapte duvarlar çizilmez (sadece oyuncular)
const SHOW_WALLS := true

var _size := Vector2(333.0, 247.0)      # güncel çizim boyutu (Labirent 124:92 varsayılanı)
var _walls_tex: Texture2D = null
## Haritaya göre (ImportedMap `minimap_min/max/texture` sağlar; yoksa labirent sabitleri)
var _map_min := MAP_MIN
var _map_max := MAP_MAX
var _map_checked := false
var _powerups: Node = null  # Map/PowerupManager (uydu açığa çıkarmaları)

## Kart alert (düşman kart aldığında 3 sn gösterilen son bilinen konum)
var _alert_timer: float = 0.0
var _alert_pos: Vector3 = Vector3.ZERO
var _alert_color: Color = Color.RED

var _bg_style: StyleBoxFlat = UITheme.style(Color(UITheme.BG, 0.82), 14, UITheme.BORDER, 1)


func _ready() -> void:
	_fit_aspect()
	UITheme.add_brackets(self, Color(UITheme.FRAME, 0.55), 14.0, 2.0, -3.0)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # duvar pikselleri keskin kalsın
	if SHOW_WALLS and ResourceLoader.exists(WALLS_TEXTURE):
		_walls_tex = load(WALLS_TEXTURE)
	GameManager.card_picked_up.connect(_on_card_picked_up)


## Haritanın gerçek X:Z en-boy oranına göre MAX_SIZE içine oturt (kare/dikdörtgen haritalarda bozulma yok)
func _fit_aspect() -> void:
	var ws := (_map_max - _map_min).abs()
	if ws.x < 1.0 or ws.y < 1.0:
		return
	var inner_max := MAX_SIZE - Vector2(PAD, PAD) * 2.0
	var scale_v := minf(inner_max.x / ws.x, inner_max.y / ws.y)
	_size = (ws * scale_v + Vector2(PAD, PAD) * 2.0).round()
	custom_minimum_size = _size
	size = _size


## İçe aktarılan harita hazır olunca kendi sınırlarını ve üretilmiş duvar maskesini verir
func _check_map_source() -> void:
	if _map_checked:
		return
	var scene := get_tree().current_scene
	if scene == null or not scene.has_signal("map_ready"):
		_map_checked = true
		return
	if not bool(scene.get("is_map_ready")):
		return
	_map_checked = true
	_map_min = scene.get("minimap_min")
	_map_max = scene.get("minimap_max")
	_walls_tex = scene.get("minimap_texture")
	_fit_aspect()


func _process(delta: float) -> void:
	_check_map_source()
	if _alert_timer > 0.0:
		_alert_timer -= delta
	queue_redraw()


func _draw() -> void:
	# ── Arka plan: UITheme paletiyle yuvarlak panel + taktik ızgara ──
	draw_style_box(_bg_style, Rect2(Vector2.ZERO, _size))
	var inner := Rect2(Vector2(PAD, PAD), _size - Vector2(PAD, PAD) * 2.0)
	if _walls_tex:
		draw_texture_rect(_walls_tex, inner, false, Color(0.75, 0.78, 0.9, 0.28))
	else:
		for i in range(1, 6):
			var ox := inner.position.x + inner.size.x * i / 6.0
			var oy := inner.position.y + inner.size.y * i / 6.0
			draw_line(Vector2(ox, PAD), Vector2(ox, _size.y - PAD), Color(1, 1, 1, 0.04), 1.0)
			draw_line(Vector2(PAD, oy), Vector2(_size.x - PAD, oy), Color(1, 1, 1, 0.04), 1.0)

	if not multiplayer.has_multiplayer_peer():
		return

	var local_id := NetworkManager.get_local_id()
	var local_data: Dictionary = NetworkManager.players.get(local_id, {})
	var local_team: int = local_data.get("team_id", -1)

	# ── Oyuncular (kendin + takım arkadaşları) ──
	for peer_id: int in GameManager.active_players:
		var player: Node = GameManager.active_players[peer_id]
		if not is_instance_valid(player):
			continue
		if player.is_dead or _is_hidden(player):
			continue

		var data: Dictionary = NetworkManager.players.get(peer_id, {})
		var team_id: int = data.get("team_id", -1)
		var is_self := (peer_id == local_id)
		var is_teammate := (not GameManager.is_deathmatch()) and (team_id == local_team)

		if not (is_self or is_teammate):
			continue

		var p := _w2m(player.global_position)
		var color := TeamManager.get_color(team_id)
		var radius := 8.3 if is_self else 5.8

		# Kendi el feneri konisi (Player root -Z yönüne bakar; harita çerçevesi dışına taşmasın)
		if is_self:
			var fwd3: Vector3 = -(player as Node3D).global_transform.basis.z
			var fwd := Vector2(fwd3.x, fwd3.z).normalized()
			var p1 := (p + fwd.rotated(-0.45) * 43.0).clamp(inner.position, inner.end)
			var p2 := (p + fwd.rotated(0.45) * 43.0).clamp(inner.position, inner.end)
			var cone := PackedVector2Array([p, p1, p2])
			draw_colored_polygon(cone, Color(UITheme.ACCENT, 0.22))

		_draw_team_marker(p, radius, team_id, color, 2.5)

		# Kart taşıyorsa sarı halka
		if player.has_card:
			draw_arc(p, radius + 6.7, 0.0, TAU, 20, Color(1.0, 0.9, 0.1), 3.0)

	# ── Uydu güçleri (PowerupManager) — sadece kendi takımımız kullandıysa ──
	_draw_satellite_reveals(local_team)

	# ── Kart alert (düşman kart taşıyıcı — 3 sn, blink + fade) ──
	if _alert_timer > 0.0:
		var alpha := minf(_alert_timer / 3.0, 1.0)
		var blink := (floori(_alert_timer * 5.0) % 2) == 0
		if blink:
			var p := _w2m(_alert_pos)
			draw_circle(p, 11.7, Color(_alert_color.r, _alert_color.g, _alert_color.b, alpha))
			draw_arc(p, 18.3, 0.0, TAU, 20, Color(_alert_color.r, _alert_color.g, _alert_color.b, alpha * 0.7), 4.0)


## Takım şekli (UITheme.TEAM_GLYPHS ile aynı: 0=● daire, 1=▲ üçgen, 2=■ kare, 3=◆ elmas)
func _draw_team_marker(pos: Vector2, r: float, team_id: int, color: Color, outline: float = 0.0) -> void:
	var bg := Color(0.05, 0.05, 0.08)
	match team_id:
		1:  # ▲ üçgen
			if outline > 0.0:
				var ro := (r + outline) * 1.15
				draw_colored_polygon(PackedVector2Array([
					pos + Vector2(0.0, -ro), pos + Vector2(ro * 0.92, ro * 0.78), pos + Vector2(-ro * 0.92, ro * 0.78)
				]), bg)
			var ri := r * 1.15
			draw_colored_polygon(PackedVector2Array([
				pos + Vector2(0.0, -ri), pos + Vector2(ri * 0.92, ri * 0.78), pos + Vector2(-ri * 0.92, ri * 0.78)
			]), color)
		2:  # ■ kare
			if outline > 0.0:
				var so := (r + outline) * 0.9
				draw_rect(Rect2(pos - Vector2(so, so), Vector2(so * 2.0, so * 2.0)), bg)
			var si := r * 0.9
			draw_rect(Rect2(pos - Vector2(si, si), Vector2(si * 2.0, si * 2.0)), color)
		3:  # ◆ elmas
			if outline > 0.0:
				var do_r := (r + outline) * 1.15
				draw_colored_polygon(PackedVector2Array([
					pos + Vector2(0.0, -do_r), pos + Vector2(do_r, 0.0), pos + Vector2(0.0, do_r), pos + Vector2(-do_r, 0.0)
				]), bg)
			var di_r := r * 1.15
			draw_colored_polygon(PackedVector2Array([
				pos + Vector2(0.0, -di_r), pos + Vector2(di_r, 0.0), pos + Vector2(0.0, di_r), pos + Vector2(-di_r, 0.0)
			]), color)
		_:  # ● daire (takım 0 ve varsayılan)
			if outline > 0.0:
				draw_circle(pos, r + outline, bg)
			draw_circle(pos, r, color)


func _draw_satellite_reveals(local_team: int) -> void:
	if _powerups == null or not is_instance_valid(_powerups):
		_powerups = get_tree().current_scene.get_node_or_null("PowerupManager") if get_tree().current_scene else null
		if _powerups == null:
			return
	var now := Time.get_ticks_msec() / 1000.0
	var pulse := 0.6 + 0.4 * sin(now * 8.0)
	var font := ThemeDB.fallback_font
	var status := ""

	# ◈ Uydu: TÜM oyuncular (her takım). Kart ve kapı gösterilmez — ama kart birinin üzerindeyse
	# o taşıyıcı sarı elmas + halka ile işaretlenir (yerdeki kart gizli kalır).
	if _powerups.is_revealed("all_players"):
		var c: Color = _powerups.INFO[2]["color"]
		for pid: int in GameManager.active_players:
			var pl: Variant = GameManager.active_players[pid]
			if pl == null or not is_instance_valid(pl) or pl.is_dead:
				continue
			if _is_hidden(pl as Node):
				continue  # görünmez rakip — uydu dahil hiç çizilmez (taşıyıcı işareti de)
			if pid != NetworkManager.get_local_id() and _powerups.hidden_from_satellite((pl as Node3D).global_position):
				continue  # "Radar Örtüsü" sisinin içinde
			var tid: int = NetworkManager.players.get(pid, {}).get("team_id", -1)
			var pp := _w2m((pl as Node3D).global_position)
			if pid != NetworkManager.get_local_id():
				_draw_team_marker(pp, 6.7, tid, TeamManager.get_color(tid), 1.8)
				draw_arc(pp, 11.7, 0.0, TAU, 16, Color(c, pulse), 2.5)
			if GameManager.is_card_carrier(pid):
				var dia := PackedVector2Array([pp + Vector2(0, -25), pp + Vector2(8.3, -16.7), pp + Vector2(0, -8.3), pp + Vector2(-8.3, -16.7)])
				draw_colored_polygon(dia, Color(1.0, 0.9, 0.1))
				draw_arc(pp, 18.3, 0.0, TAU, 24, Color(1.0, 0.9, 0.1, pulse), 3.0)
		status += "◈ %d  " % ceili(_powerups.reveal_until["all_players"] - now)

	# ◉ Takım uydusu: tüm düşmanlar
	if _powerups.is_revealed("enemies"):
		var c2: Color = _powerups.INFO[3]["color"]
		for pid: int in GameManager.active_players:
			var pl: Variant = GameManager.active_players[pid]
			if pl == null or not is_instance_valid(pl) or pl.is_dead:
				continue
			if _is_hidden(pl as Node):
				continue  # görünmez rakip
			var tid: int = NetworkManager.players.get(pid, {}).get("team_id", -1)
			if GameManager.is_deathmatch():
				if pid == NetworkManager.get_local_id():
					continue
			elif tid == local_team:
				continue
			var ep := _w2m((pl as Node3D).global_position)
			_draw_team_marker(ep, 6.7, tid, TeamManager.get_color(tid), 1.8)
			draw_arc(ep, 11.7, 0.0, TAU, 16, Color(c2, pulse), 2.5)
		status += "◉ %d" % ceili(_powerups.reveal_until["enemies"] - now)

	# TEST (F7): kart (yerdeyse) + kapı konumu
	if _powerups.get("test_show_objectives") == true:
		var door: Variant = GameManager.door_instance
		if door != null and is_instance_valid(door):
			var dp := _w2m((door as Node3D).global_position)
			draw_rect(Rect2(dp - Vector2(8.5, 8.5), Vector2(17, 17)), UITheme.ACCENT)
			draw_arc(dp, 16.7, 0.0, TAU, 20, Color(UITheme.ACCENT, pulse), 2.5)
		for card: Variant in GameManager.cards.values():
			if card == null or not is_instance_valid(card) or not (card as Node3D).visible:
				continue
			if int(card.carrier_peer) != -1:
				continue
			var cp := _w2m((card as Node3D).global_position)
			var dia := PackedVector2Array([cp + Vector2(0, -10), cp + Vector2(8.3, 0), cp + Vector2(0, 10), cp + Vector2(-8.3, 0)])
			draw_colored_polygon(dia, Color(1.0, 0.9, 0.1))
			draw_arc(cp, 16.7, 0.0, TAU, 20, Color(1.0, 0.9, 0.1, pulse), 2.5)
		status += tr("TEST: ■ KAPI ◆ KART")

	if not status.is_empty():
		draw_string(font, Vector2(PAD + 7, _size.y - PAD - 7), status, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1, 1, 1, 0.9))


## Görünmez + yerel oyuncunun rakibi → minimapte hiçbir yolda çizilmez (Player.is_hidden_from_local)
func _is_hidden(pl: Node) -> bool:
	return pl != null and pl.has_method("is_hidden_from_local") and bool(pl.call("is_hidden_from_local"))


## 3D dünya konumunu (X/Z) minimap koordinatına çevirir
func _w2m(world_pos: Vector3) -> Vector2:
	var t := (Vector2(world_pos.x, world_pos.z) - _map_min) / (_map_max - _map_min)
	var inner_size := _size - Vector2(PAD, PAD) * 2.0
	# Harita dışına taşan noktalar panelin kenarında kalsın
	return (Vector2(PAD, PAD) + t * inner_size).clamp(Vector2(PAD, PAD), _size - Vector2(PAD, PAD))


func _on_card_picked_up(carrier_peer_id: int, carrier_pos: Vector3, carrier_team_id: int) -> void:
	var local_id := NetworkManager.get_local_id()
	if GameManager.is_deathmatch():
		if carrier_peer_id == local_id:
			return
	else:
		var local_team: int = NetworkManager.players.get(local_id, {}).get("team_id", -1)
		if carrier_team_id == local_team:
			return
	_alert_pos   = carrier_pos
	_alert_color = TeamManager.get_color(carrier_team_id)
	_alert_timer = 3.0
