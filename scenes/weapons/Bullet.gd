## Bullet.gd (3D)
## Sadece atan oyuncunun clienti sunucuya hasar bildirir.

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
	for _i in 6:
		q.exclude = exclude
		var hit := get_world_3d().direct_space_state.intersect_ray(q)
		if hit.is_empty():
			break
		var col: Object = hit["collider"]
		if col is CharacterBody3D:
			# Atanın kendisi / çömelmiş hedef: içinden geç, taramaya devam
			if col.get("peer_id") == shooter_peer_id or (col.has_method("is_crouching") and col.is_crouching()):
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

		# Takım dostu ateş: mermiyi yok et, hasar verme
		if body.get("team_id") == shooter_team_id:
			_done = true
			queue_free()
			return

		# Çömelmiş hedef: mermi üstünden geçer (yok olmaz, hasar yok). Host take_damage'de de kontrol eder.
		if body.has_method("is_crouching") and body.is_crouching():
			return

		# Sadece atan oyuncunun clienti hasar bildirir — çift hasar önlenir
		if NetworkManager.get_local_id() == shooter_peer_id:
			if NetworkManager.is_host():
				body.take_damage(damage, shooter_peer_id)
			else:
				body.take_damage.rpc_id(1, damage, shooter_peer_id)

	_done = true
	queue_free()
