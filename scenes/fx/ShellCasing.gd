extends RefCounted
## Boş kovan fırlatma (statik, preload): her atışta tüfeğin "Eject" marker'ından (HandRifle) pirinç kovan
## sağa/yukarı fırlar, fizikle zemine düşer, ilk temasta tıngırdar. Tamamen YEREL görsel (ağ yok).
## RigidBody3D havuzu (MAX_ACTIVE, en eskisi yeniden kullanılır), sahne değişince havuz yeniden kurulur.
## Çarpışma: layer 0 (kimse kovanı algılamaz), mask 1 (harita) — atan oyuncunun gövdesi istisna.

const SFX = preload("res://scenes/audio/Sfx.gd")
const MuzzleFlash = preload("res://scenes/fx/MuzzleFlash.gd")

const MAX_ACTIVE := 60
const LIFETIME := 5.0          # yerde kalma süresi
const FADE_TIME := 0.4         # sonra küçülüp kaybolur
const CAMERA_MAX_DIST := 70.0  # kamera bundan uzaksa kovan doğmaz
const SOUND_MIN_GAP_MS := 40   # kovan sesleri arası en az (global)
const BRASS := Color(0.80, 0.60, 0.26)

## Karakter → [boy, çap] (m). Gerçek 5.56 kovan ~4.5 cm; 39 m tepeden ~1.8x abartı bile 2-3 px kalıyordu
## (ekran görüntüsü testi) → ~3x boy, ~4x çap.
const SIZES := {
	"Runner": Vector2(0.10, 0.032),     # tabanca/SMG fişeği, küçük
	"Visioner": Vector2(0.13, 0.034),
	"Medic": Vector2(0.15, 0.038),      # tüfek fişeği
	"Sniper": Vector2(0.16, 0.040),
	"Tank": Vector2(0.15, 0.038),
}
const DEFAULT_SIZE := Vector2(0.13, 0.034)

static var _pool: Array[RigidBody3D] = []
static var _next := 0
static var _scene: Node = null
static var _mesh: CylinderMesh = null
static var _mat: StandardMaterial3D = null
static var _phys_mat: PhysicsMaterial = null
static var _shapes := {}        # Vector2 boyut → CapsuleShape3D
static var _last_sound_ms := -100000


## Kovanı marker'ın global konum/yönünde fırlatır (+X sağa, +Y yukarı, +Z hafif geri). delay > 0 → bekler (Sniper sürgüsü).
static func eject(eject_marker: Node3D, character: String, delay: float = 0.0) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if eject_marker == null or not is_instance_valid(eject_marker) or not eject_marker.is_inside_tree():
		return
	var tree := eject_marker.get_tree()
	if delay > 0.0:
		await tree.create_timer(delay).timeout
		if not is_instance_valid(eject_marker) or not eject_marker.is_inside_tree():
			return
	if not eject_marker.is_visible_in_tree():
		return
	var scene := tree.current_scene
	if scene == null:
		return
	var cam := eject_marker.get_viewport().get_camera_3d()
	if cam != null and cam.global_position.distance_to(eject_marker.global_position) > CAMERA_MAX_DIST:
		return
	var body := _acquire(scene)
	if body == null:
		return
	var size: Vector2 = SIZES.get(character, DEFAULT_SIZE)
	_configure(body, size)
	# Atan oyuncunun gövdesine çarpmasın (CharacterBody3D layer 1)
	for ex in body.get_collision_exceptions():
		body.remove_collision_exception_with(ex)
	var shooter := _find_shooter(eject_marker)
	if shooter != null:
		body.add_collision_exception_with(shooter)
	var xf := eject_marker.global_transform.orthonormalized()
	var b := xf.basis
	body.freeze = true
	body.global_transform = xf
	body.visible = true
	(body.get_child(0) as Node3D).scale = Vector3(size.y, size.x, size.y)
	body.set_meta("sounded", false)
	body.reset_physics_interpolation()
	body.freeze = false
	body.sleeping = false
	body.linear_velocity = b.x * randf_range(2.5, 4.0) + b.y * randf_range(1.5, 2.5) + b.z * randf_range(0.2, 0.7)
	body.angular_velocity = Vector3(randf_range(-25.0, 25.0), randf_range(-10.0, 10.0), randf_range(-25.0, 25.0))
	# Ömür: LIFETIME bekle → küçül → havuza dön
	var old: Tween = body.get_meta("tween") if body.has_meta("tween") else null   # varsayılan null → Godot hata basar
	if old != null and old.is_valid():
		old.kill()
	var tw := body.create_tween()
	tw.tween_interval(LIFETIME)
	tw.tween_property(body.get_child(0), "scale", Vector3.ZERO, FADE_TIME)
	tw.tween_callback(_recycle.bind(body))
	body.set_meta("tween", tw)


## Shader/pipeline ısınması: rig altına kovan mesh'i (aynı malzeme) + namlu alevi ekler
static func prewarm(rig: Node3D) -> void:
	if DisplayServer.get_name() == "headless" or rig == null:
		return
	_ensure_resources()
	var mi := MeshInstance3D.new()
	mi.mesh = _mesh
	mi.material_override = _mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.scale = Vector3(DEFAULT_SIZE.y, DEFAULT_SIZE.x, DEFAULT_SIZE.y) * 4.0
	rig.add_child(mi)
	MuzzleFlash.prewarm(rig)


static func _acquire(scene: Node) -> RigidBody3D:
	if _scene != scene or not is_instance_valid(_scene):
		_pool.clear()
		_next = 0
		_scene = scene
	# Sahneden silinmiş düğümleri at
	for i in range(_pool.size() - 1, -1, -1):
		if not is_instance_valid(_pool[i]) or not _pool[i].is_inside_tree():
			_pool.remove_at(i)
	if _pool.size() < MAX_ACTIVE:
		# Önce boşta (gizli) olanı kullan
		for b in _pool:
			if not b.visible:
				return b
		var nb := _create_body()
		scene.add_child(nb)
		_pool.append(nb)
		return nb
	# Havuz dolu: boşta olan varsa o, yoksa en eskisi (sıralı)
	for b in _pool:
		if not b.visible:
			return b
	_next = _next % _pool.size()
	var r := _pool[_next]
	_next += 1
	return r


static func _create_body() -> RigidBody3D:
	_ensure_resources()
	var body := RigidBody3D.new()
	body.name = "ShellCasing"
	body.collision_layer = 0
	body.collision_mask = 1
	body.mass = 0.02
	body.continuous_cd = true
	body.physics_material_override = _phys_mat
	body.contact_monitor = true
	body.max_contacts_reported = 1
	body.linear_damp = 0.1
	body.angular_damp = 1.5
	body.freeze_mode = RigidBody3D.FREEZE_MODE_STATIC
	body.freeze = true
	body.visible = false
	# Kovan ekseni tüfek ekseni (Z) boyunca: silindir Y'den Z'ye çevrilir
	var mi := MeshInstance3D.new()
	mi.mesh = _mesh
	mi.material_override = _mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var holder := Node3D.new()
	holder.rotation.x = PI / 2.0
	holder.add_child(mi)
	body.add_child(holder)   # ilk çocuk = ölçeklenen görsel (eject: scale (çap, boy, çap))
	var cs := CollisionShape3D.new()
	cs.name = "Shape"
	cs.rotation.x = PI / 2.0
	body.add_child(cs)
	body.body_entered.connect(_on_body_entered.bind(body))
	return body


static func _configure(body: RigidBody3D, size: Vector2) -> void:
	if not _shapes.has(size):
		var cap := CapsuleShape3D.new()
		cap.radius = size.y * 0.5
		cap.height = maxf(size.x, size.y + 0.001)
		_shapes[size] = cap
	var cs := body.get_node("Shape") as CollisionShape3D
	cs.shape = _shapes[size]


static func _ensure_resources() -> void:
	if _mesh == null:
		_mesh = CylinderMesh.new()
		_mesh.top_radius = 0.5
		_mesh.bottom_radius = 0.5
		_mesh.height = 1.0
		_mesh.radial_segments = 8
		_mesh.rings = 1
	if _mat == null:
		_mat = StandardMaterial3D.new()
		_mat.albedo_color = BRASS
		_mat.metallic = 0.9
		_mat.roughness = 0.3
		# Karanlıkta fener ışığında hafif parlasın
		_mat.emission_enabled = true
		_mat.emission = BRASS
		_mat.emission_energy_multiplier = 0.6   # karanlıkta da pirinç parıltısı seçilsin
	if _phys_mat == null:
		_phys_mat = PhysicsMaterial.new()
		_phys_mat.bounce = 0.3
		_phys_mat.friction = 0.8


static func _find_shooter(n: Node) -> CollisionObject3D:
	var p := n.get_parent()
	while p != null:
		if p is CharacterBody3D:
			return p as CollisionObject3D
		p = p.get_parent()
	return null


static func _on_body_entered(_other: Node, body: RigidBody3D) -> void:
	if not is_instance_valid(body) or not body.visible or body.get_meta("sounded", true):
		return
	body.set_meta("sounded", true)
	var now := Time.get_ticks_msec()
	if now - _last_sound_ms < SOUND_MIN_GAP_MS:
		return
	_last_sound_ms = now
	SFX.play_at(body.get_tree(), "shell_casing", body.global_position, -14.0, 4.0, 25.0, 0.08)


static func _recycle(body: RigidBody3D) -> void:
	if not is_instance_valid(body):
		return
	body.freeze = true   # deferred DEĞİL: aynı karede yeniden fırlatılırsa sonradan donmasın
	body.visible = false
	for ex in body.get_collision_exceptions():
		body.remove_collision_exception_with(ex)
