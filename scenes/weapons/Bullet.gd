## Bullet.gd (3D)
## Sadece atan oyuncunun clienti sunucuya hasar bildirir (bot mermisini host bildirir).

extends Area3D

var direction: Vector3 = Vector3.FORWARD
var speed: float = 30.0
var damage: float = 25.0
var shooter_peer_id: int = -1
var shooter_team_id: int = -1

var max_distance: float = 60.0
var _travel_distance: float = 0.0
## Sniper: duvarlardan geçer (Weapon.pierce_walls). Diğerleri duvarda durur.
var pierce_walls := false
var _done := false   # ışın taraması + Area sinyali aynı karede iki kez işlemesin (çift hasar)

## Özel silah mermisi (make_special): çömelmiş hedefi de vurur, takım arkadaşından geçer (yok olmaz),
## ilk rakipte hasar verip durur. Hasar kaynağı DAMAGE_SPECIAL → host çömelme korumasını uygulamaz.
var is_special := false
const SPECIAL_FX_PATH := "res://scenes/weapons/SpecialGunFx.gd"
## = Player.DAMAGE_SPECIAL (Player'ı preload etmek Player→Weapon→Bullet döngüsü yaratırdı)
const DAMAGE_SPECIAL := 4


## Özel mermi görünümü: normal tracer modeli gizlenir, SpecialGunFx iz eklenir (Fx dosyası yoksa normal model açık kalır)
func make_special() -> void:
	is_special = true
	var tracer: Node3D = null
	if ResourceLoader.exists(SPECIAL_FX_PATH):
		var fx := load(SPECIAL_FX_PATH) as GDScript
		if fx != null:
			tracer = fx.call(&"build_tracer") as Node3D
	if tracer != null:
		var model := get_node_or_null("Model") as Node3D
		if model != null:
			model.visible = false
		add_child(tracer)
		_disable_shadows(self)


func initialize(
	dir: Vector3,
	spd: float,
	dmg: float,
	peer_id: int,
	team_id: int,
	p_max_distance: float = 60.0
) -> void:
	direction = dir.normalized()
	direction.y = 0.0  # Yatay düzlemde kal
	speed = spd
	damage = dmg
	shooter_peer_id = peer_id
	shooter_team_id = team_id
	max_distance = p_max_distance
	# Model (Mermi_OyunIci_Tracer_Scale.glb) ucu -Z'ye bakar → uçuş yönüne çevir
	if direction.length_squared() > 0.0001:
		global_basis = Basis.looking_at(direction, Vector3.UP)
	_disable_shadows(self)


## El feneri mermiden gölge atmasın (koridorda kayan dev gölge)
func _disable_shadows(node: Node) -> void:
	for c in node.get_children():
		if c is GeometryInstance3D:
			(c as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_disable_shadows(c)


## Işın taraması: mermi karede 0.5–1.3 m ilerliyor, yeni haritaların duvarları 0.2–0.3 m → Area çakışması duvarı
## "atlıyordu" (mermi duvardan geçiyordu). Eski→yeni konum arası ışın, aradaki ilk duvar/oyuncuyu yakalar.
func _physics_process(delta: float) -> void:
	if _done:
		return
	var move := direction * speed * delta
	var from := global_position
	var to := from + move
	var q := PhysicsRayQueryParameters3D.create(from, to, collision_mask)
	var exclude: Array[RID] = []
	for _i in (12 if is_special else 6):
		q.exclude = exclude
		var hit := get_world_3d().direct_space_state.intersect_ray(q)
		if hit.is_empty():
			break
		var col: Object = hit["collider"]
		if col is CharacterBody3D:
			# Atanın kendisi / çömelmiş hedef: içinden geç, taramaya devam
			# Özel mermi: çömelmiş hedefi GEÇMEZ (vurur), takım arkadaşının içinden geçer
			var crouch_skip: bool = not is_special and col.has_method("is_crouching") and col.is_crouching()
			var ally_skip: bool = is_special and col.get("team_id") == shooter_team_id
			if col.get("peer_id") == shooter_peer_id or crouch_skip or ally_skip:
				exclude.append((col as CollisionObject3D).get_rid())
				continue
			global_position = hit["position"]
			_on_body_entered(col)
			return
		# Duvar / engel
		if pierce_walls:
			exclude.append(hit["rid"])
			continue
		global_position = hit["position"]
		_done = true
		queue_free()
		return
	global_position = to
	_travel_distance += move.length()
	if _travel_distance >= max_distance:
		queue_free()


func _on_body_entered(body: Node) -> void:
	if _done:
		return
	if not (body is CharacterBody3D) and pierce_walls:
		return   # Sniper mermisi duvardan geçer
	if body is CharacterBody3D:
		# Shooter'ın kendi vücudu: mermiyi yok etme, geç
		if body.get("peer_id") == shooter_peer_id:
			return

		# Takım dostu ateş: mermiyi yok et, hasar verme (özel mermi: takım arkadaşından geçer, yok olmaz)
		if body.get("team_id") == shooter_team_id:
			if is_special:
				return
			_done = true
			queue_free()
			return

		# Çömelmiş hedef: mermi üstünden geçer (yok olmaz, hasar yok). Host take_damage'de de kontrol eder.
		# Özel mermi çömelmeyi umursamaz.
		if not is_special and body.has_method("is_crouching") and body.is_crouching():
			return

		# Sadece atan oyuncunun clienti hasar bildirir — çift hasar önlenir.
		# Bot mermisi: botun "client"ı yok → host bildirir (diğer peer'lar bildirmez, çift hasar yine yok)
		var reporter := NetworkManager.get_local_id() == shooter_peer_id
		if not reporter and NetworkManager.is_host() and NetworkManager.is_bot(shooter_peer_id):
			reporter = true
		if reporter:
			var source: int = DAMAGE_SPECIAL if is_special else 0   # 0 = Player.DAMAGE_BULLET
			if NetworkManager.is_host():
				body.take_damage(damage, shooter_peer_id, source)
			else:
				body.take_damage.rpc_id(1, damage, shooter_peer_id, source)

	_done = true
	queue_free()
