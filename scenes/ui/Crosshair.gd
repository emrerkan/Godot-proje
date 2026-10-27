## Crosshair.gd
## Fare imlecinin yerine çizilen nişangah (HUD ekler). Oyun mantığına dokunmaz.
## - 4 çizgi arası boşluk = silahın gerçek saçılma konisi: oyuncuya ekran mesafesi × tan(spread_degrees)
##   (uzağa nişan aldıkça açılır; Sniper'da spread 0 → sıkı nokta)
## - Atışta kısa "tepme" açılması (ammo_changed'de mermi azalınca)
## - Şarjör değişirken etrafında dolan halka (weapon.reload_time), mermi bitince kırmızı
## Görünmediği durumlarda (menü, sohbet, ölüm, oyun sonu) normal fare imleci geri gelir.
## SANAL NİŞANGAH (fare hassasiyeti için): görünürken fare kilitlenir (CAPTURED), nişangah fare hareketi ×
## `mouse_sensitivity` kadar kayar (GameSettings.cursor_pos). Player._get_aim_target bu konumu kullanır.
## Gizlenince fare serbest kalır ve sistem imleci nişangahın olduğu yere taşınır (zıplama olmasın).

extends Control

const SETTINGS := preload("res://scenes/settings/GameSettings.gd")

const MIN_GAP := 4.0
const MAX_GAP := 70.0
const TICK_LEN := 7.0
const KICK := 7.0

## HUD her kare ayarlar: menü/oyun sonu açıkken false
var allowed := true

var _player: Node = null
var _kick := 0.0
var _last_ammo := -1
var _reload_t := -1.0      # 0..1 dolum, -1 = şarjör değişmiyor
var _reload_time := 1.0
var _empty := false
var _gap := MIN_GAP


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	GameManager.local_player_spawned.connect(_on_local_player_spawned)


func _exit_tree() -> void:
	SETTINGS.cursor_active = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _input(event: InputEvent) -> void:
	if SETTINGS.cursor_active and event is InputEventMouseMotion:
		var rel: Vector2 = (event as InputEventMouseMotion).relative
		var rect := get_viewport().get_visible_rect()
		SETTINGS.cursor_pos = (SETTINGS.cursor_pos + rel * float(SETTINGS.get_value("mouse_sensitivity"))).clamp(
			rect.position, rect.end - Vector2.ONE)


func _set_cursor_active(on: bool) -> void:
	if on == SETTINGS.cursor_active:
		return
	if on:
		SETTINGS.cursor_pos = get_viewport().get_mouse_position()
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		get_viewport().warp_mouse(SETTINGS.cursor_pos)
	SETTINGS.cursor_active = on


func _on_local_player_spawned(player: Node) -> void:
	_player = player
	player.ammo_changed.connect(_on_ammo_changed)


func _on_ammo_changed(current: int, total: int, reloading: bool) -> void:
	if reloading:
		_reload_t = 0.0
		if _player and is_instance_valid(_player) and _player.current_weapon:
			_reload_time = maxf(_player.current_weapon.reload_time, 0.05)
	else:
		_reload_t = -1.0
		if _last_ammo >= 0 and current < _last_ammo:
			_kick = KICK
	_empty = current <= 0 and not reloading
	_last_ammo = current if not reloading else total


func _process(delta: float) -> void:
	var alive: bool = _player != null and is_instance_valid(_player) and not _player.is_dead
	var show := allowed and alive and not ChatBox.is_typing
	visible = show
	_set_cursor_active(show and DisplayServer.window_is_focused())
	if not show:
		return

	_kick = maxf(_kick - delta * 40.0, 0.0)
	if _reload_t >= 0.0:
		_reload_t = minf(_reload_t + delta / _reload_time, 1.0)

	# Saçılma konisinin fare mesafesindeki genişliği
	var target := MIN_GAP
	var cam := get_viewport().get_camera_3d()
	if cam and _player.current_weapon:
		var p_screen := cam.unproject_position((_player as Node3D).global_position)
		var dist := p_screen.distance_to(SETTINGS.aim_screen_position(get_viewport()))
		target = dist * tan(deg_to_rad(float(_player.current_weapon.spread_degrees)))
	_gap = lerpf(_gap, clampf(target, MIN_GAP, MAX_GAP), 1.0 - exp(-14.0 * delta))
	queue_redraw()


func _draw() -> void:
	if not visible:
		return
	var c := SETTINGS.aim_screen_position(get_viewport()) - global_position
	var col := UITheme.DANGER if _empty else UITheme.ACCENT
	var g := _gap + _kick
	var outline := Color(0, 0, 0, 0.75)

	for dir: Vector2 in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]:
		var a := c + dir * g
		var b := c + dir * (g + TICK_LEN)
		draw_line(a, b, outline, 4.0, true)
		draw_line(a, b, col, 2.0, true)

	draw_circle(c, 2.6, outline)
	draw_circle(c, 1.5, col)

	# Şarjör dolum halkası
	if _reload_t >= 0.0:
		var r := g + TICK_LEN + 6.0
		draw_arc(c, r, 0.0, TAU, 40, Color(1, 1, 1, 0.12), 3.0, true)
		draw_arc(c, r, -PI / 2.0, -PI / 2.0 + TAU * _reload_t, 40, UITheme.ACCENT, 3.0, true)
