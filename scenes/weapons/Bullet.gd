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
var _spawn_pos: Vector3 = Vector3.ZERO
## Mesafe bazlı hasar (Sniper): one_shot_radius içinde tek atış, dışında falloff_end'e kadar min_damage_ratio'ya düşer
var one_shot_radius: float = 0.0
var one_shot_damage: float = 999.0
var falloff_end: float = 0.0
var min_damage_ratio: float = 1.0
## Görsel namlu hizası: mermi fiziği 1.8 m kapsülü aşmamak için daha alçakta doğabilir;
## tracer modeli ilk VISUAL_CONVERGE_DIST m boyunca tam namlu ağzından fizik çizgisine iner.
const VISUAL_CONVERGE_DIST := 6.0
var _visual_offset_world: Vector3 = Vector3.ZERO
## Sniper: duvarlardan geçer (Weapon.pierce_walls). Diğerleri duvarda durur.
var pierce_walls := false
var _done := false   # ışın taraması + Area sinyali aynı karede iki kez işlemesin (çift hasar)

## Özel silah mermisi (make_special): çömelmiş hedefi de vurur, takım arkadaşından geçer (yok olmaz),
## ilk rakipte hasar verip durur. Hasar kaynağı DAMAGE_SPECIAL → host çömelme korumasını uygulamaz.
var is_special := false
const SPECIAL_FX_PATH := "res://scenes/weapons/SpecialGunFx.gd"
## = Player.DAMAGE_SPECIAL (Player'ı preload etmek Player→Weapon→Bullet döngüsü yaratırdı)
const DAMAGE_SPECIAL := 4
const BLOOD_FX := preload("res://scenes/fx/BloodFx.gd")
const IMPACT_FX := preload("res://scenes/fx/ImpactFx.gd")
const SPLAT_CHANCE := 0.3   # isabetlerin bu kadarında hedefin arkasına küçük yer lekesi


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
	direction = dir.normalized()   # dikey bileşen Weapon._pitched'den (farklı yükseklikteki hedef); düzde 0
	speed = spd
	damage = dmg
	shooter_peer_id = peer_id
	shooter_team_id = team_id
	max_distance = p_max_distance
	_spawn_pos = global_position
	# Model (Mermi_OyunIci_Tracer_Scale.glb) ucu -Z'ye bakar → uçuş yönüne çevir
	if direction.length_squared() > 0.0001:
		global_basis = Basis.looking_at(direction, Vector3.UP)
	_disable_shadows(self)


## Mesafe bazlı hasar eğrisi (Sniper): p_one_shot_radius içinde tek atış, dışında p_falloff_end'e kadar düşer
func configure_falloff(
	p_one_shot_radius: float,
	p_one_shot_damage: float,
	p_falloff_end: float,
	p_min_damage_ratio: float
) -> void:
	one_shot_radius = p_one_shot_radius
	one_shot_damage = p_one_shot_damage
	falloff_end = p_falloff_end
	min_damage_ratio = p_min_damage_ratio


## Yatay uçuş mesafesine göre uygulanacak hasar (çember içi tek atış, çember dışı mesafeyle azalan)
func compute_damage_at(dist: float) -> float:
	if is_special or one_shot_radius <= 0.0:
		return damage
	if dist <= one_shot_radius:
		return maxf(one_shot_damage, damage)
	if falloff_end <= one_shot_radius:
		return damage
	var t := clampf((dist - one_shot_radius) / (falloff_end - one_shot_radius), 0.0, 1.0)
	return lerpf(damage, damage * min_damage_ratio, t)


## Görsel tracer'ı ilk karede tam silah namlu ağzına taşır; uçuşun ilk birkaç metresinde fizik çizgisine kavuşur.
func set_visual_offset(world_offset: Vector3) -> void:
	_visual_offset_world = world_offset
	_apply_visual_offset(1.0)


func _apply_visual_offset(weight: float) -> void:
	var local_off: Vector3 = global_basis.inverse() * (_visual_offset_world * weight)
	var model := get_node_or_null("Model") as Node3D
	if model != null:
		model.position = local_off
	var special_tracer := get_node_or_null("SpecialTracer") as Node3D
	if special_tracer != null:
		special_tracer.position = local_off


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
			var ally_skip: bool = is_special and not GameManager.is_deathmatch() and col.get("team_id") == shooter_team_id
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
		IMPACT_FX.spawn(get_tree(), hit["position"], hit["normal"])
		_done = true
		queue_free()
		return
	global_position = to
	_travel_distance += move.length()
	if _visual_offset_world != Vector3.ZERO:
		var w: float = maxf(1.0 - _travel_distance / VISUAL_CONVERGE_DIST, 0.0)
		_apply_visual_offset(w)
		if w <= 0.0:
			_visual_offset_world = Vector3.ZERO
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

		# Takım dostu ateş: mermiyi yok et, hasar verme (Deathmatch'te herkes tek — dost ateşi engeli yok)
		if not GameManager.is_deathmatch() and body.get("team_id") == shooter_team_id:
			if is_special:
				return
			_done = true
			queue_free()
			return

		# Çömelmiş hedef: mermi üstünden geçer (yok olmaz, hasar yok). Host take_damage'de de kontrol eder.
		# Özel mermi çömelmeyi umursamaz.
		if not is_special and body.has_method("is_crouching") and body.is_crouching():
			return

		# Doğma koruması (2.5 sn vurulamaz): mermi durur ama kan / hasar yok (host take_damage de engeller)
		if body.has_method("is_spawn_protected") and body.is_spawn_protected():
			_done = true
			queue_free()
			return

		# Vuruş geri bildirimi: kan (YEREL görsel, her peer kendi mermisinde çizer — ağ yok). Isınmada / ölüde yok.
		if GameManager.match_live and body.get("is_dead") != true:
			BLOOD_FX.spawn(get_tree(), global_position, direction, 2.0 if is_special else 1.0, body)
			if randf() < SPLAT_CHANCE:
				BLOOD_FX.splat(get_tree(), global_position + Vector3(direction.x, 0.0, direction.z) * 0.6, 0.6)

		# Sadece atan oyuncunun clienti hasar bildirir — çift hasar önlenir.
		# Bot mermisi: botun "client"ı yok → host bildirir (diğer peer'lar bildirmez, çift hasar yine yok)
		var reporter := NetworkManager.get_local_id() == shooter_peer_id
		if not reporter and NetworkManager.is_host() and NetworkManager.is_bot(shooter_peer_id):
			reporter = true
		if reporter:
			var source: int = DAMAGE_SPECIAL if is_special else 0   # 0 = Player.DAMAGE_BULLET
			var hit_dist := Vector2(global_position.x - _spawn_pos.x, global_position.z - _spawn_pos.z).length()
			var final_damage := compute_damage_at(hit_dist)
			if NetworkManager.is_host():
				body.take_damage(final_damage, shooter_peer_id, source)
			else:
				body.take_damage.rpc_id(1, final_damage, shooter_peer_id, source)

	_done = true
	queue_free()
