## Trap.gd — Ayı kapanı (prosedürel görsel, model yok — kullanıcı onaylı placeholder).
## PowerupManager tarafından yönetilir (bu script'te @rpc YOK — tüm ağ yüzeyi PowerupManager'da merkezi,
## bkz Powerup.gd/Bomb.gd kalıbı). Host _process'te armed/trapped_peer/rescue_ratio alanlarını doğrudan
## günceller; _trap_spawn_rpc/_trap_trigger_rpc/_trap_rescue_sync_rpc/_trap_freed_rpc her peer'da aynı
## broadcast'ten çalışıp bu node'un görselini senkron tutar.

extends Node3D

const PROXIMITY_SCRIPT := preload("res://scenes/world/ProximityReveal.gd")

var id := 0
var team_id := -1          # tuzağı koyan takım (bu takım tetikleyemez)
var owner_peer := -1       # tuzağı koyan oyuncu — tuzak hasarıyla gelen kill ona yazılır
## Koyanın güç ağacından (PowerTrees "trap_*") — her peer aynı players listesinden aynı değeri hesaplar
var trigger_radius := 0.9
var dot_damage := 12.0
var rescue_time := 4.0
var reveal_far := 5.0
var reveal_near := 2.0
var armed := true
var trapped_peer := -1
var rescue_ratio := 0.0
var _dot_timer := 0.0      # tetiklenince saniyelik hasar tiker

var _manager: Node = null
var _jaw_left: MeshInstance3D
var _jaw_right: MeshInstance3D
var _tween: Tween


func setup(manager: Node, p_id: int, p_team: int, p_owner: int) -> void:
	_manager = manager
	id = p_id
	team_id = p_team
	owner_peer = p_owner
	var m: Dictionary = manager.POWER_TREES.mods_for(p_owner)
	trigger_radius = m["trap_trigger"]
	dot_damage = m["trap_dot"]
	rescue_time = m["trap_rescue"]
	reveal_far = m["trap_reveal_far"]
	reveal_near = m["trap_reveal_near"]


## Yakından fark edilsin diye: parlak metal (flaşör ışığında gözükür) + çene kenarlarında ince kehribar
## uyarı şeridi (emissive, düşük yoğunluk) + çok kısa menzilli kehribar ışık (ProximityReveal bunu da
## mesafeye göre söndürür/yakar — uzaktan ele vermez, ~1.3 m'den sonra belli olur).
func _ready() -> void:
	var color: Color = _manager.INFO[_manager.Type.TRAP]["color"] if _manager else Color(0.55, 0.5, 0.42)
	var warn := Color(0.95, 0.65, 0.15)

	var metal := StandardMaterial3D.new()
	metal.albedo_color = color.darkened(0.1)
	metal.metallic = 0.9
	metal.roughness = 0.18  # parlak — el feneri ışığını yakalasın

	var warn_mat := StandardMaterial3D.new()
	warn_mat.albedo_color = warn
	warn_mat.emission_enabled = true
	warn_mat.emission = warn
	warn_mat.emission_energy_multiplier = 0.25

	var base := MeshInstance3D.new()
	var base_mesh := CylinderMesh.new()
	base_mesh.top_radius = 0.27
	base_mesh.bottom_radius = 0.29
	base_mesh.height = 0.05
	base.mesh = base_mesh
	base.position.y = 0.025
	base.material_override = metal
	add_child(base)

	# Baskı plakası (ortada hafif yükseltilmiş disk) — belirgin bir "tetik" izlenimi verir.
	var plate := MeshInstance3D.new()
	var plate_mesh := CylinderMesh.new()
	plate_mesh.top_radius = 0.14
	plate_mesh.bottom_radius = 0.15
	plate_mesh.height = 0.035
	plate.mesh = plate_mesh
	plate.position.y = 0.06
	plate.material_override = metal
	add_child(plate)

	# İnce kehribar uyarı şeridi — tabanın kenarında, uzaktan gizli/yakından kontrast.
	var stripe := MeshInstance3D.new()
	var stripe_mesh := TorusMesh.new()
	stripe_mesh.inner_radius = 0.235
	stripe_mesh.outer_radius = 0.26
	stripe.mesh = stripe_mesh
	stripe.position.y = 0.03
	stripe.material_override = warn_mat
	add_child(stripe)

	_jaw_left = _build_jaw(metal, warn_mat, -1.0)
	_jaw_right = _build_jaw(metal, warn_mat, 1.0)
	add_child(_jaw_left)
	add_child(_jaw_right)

	var light := OmniLight3D.new()
	light.light_color = warn
	light.light_energy = 0.12
	light.omni_range = 1.1
	light.shadow_enabled = false
	light.position.y = 0.15
	add_child(light)

	var reveal := PROXIMITY_SCRIPT.new()
	reveal.reveal_far = reveal_far
	reveal.reveal_near = reveal_near
	reveal.mesh_hidden_when_far = true
	add_child(reveal)


func _build_jaw(mat: StandardMaterial3D, warn_mat: StandardMaterial3D, side: float) -> MeshInstance3D:
	var jaw := MeshInstance3D.new()
	var mesh := PrismMesh.new()
	mesh.size = Vector3(0.26, 0.08, 0.08)
	jaw.mesh = mesh
	jaw.material_override = mat
	jaw.position = Vector3(side * 0.13, 0.065, 0.0)
	jaw.rotation.z = deg_to_rad(20.0 * side)

	var teeth := MeshInstance3D.new()
	var teeth_mesh := BoxMesh.new()
	teeth_mesh.size = Vector3(0.22, 0.018, 0.02)
	teeth.mesh = teeth_mesh
	teeth.position = Vector3(0.0, 0.042, 0.0)
	teeth.material_override = warn_mat
	jaw.add_child(teeth)

	return jaw


## Tetiklenince iki çene birbirine kapanır — görsel "patladı" tellini verir.
func spring_shut() -> void:
	if _tween:
		_tween.kill()
	_tween = create_tween().set_parallel(true)
	_tween.tween_property(_jaw_left, "rotation:z", deg_to_rad(80.0), 0.12).set_trans(Tween.TRANS_BACK)
	_tween.tween_property(_jaw_right, "rotation:z", deg_to_rad(-80.0), 0.12).set_trans(Tween.TRANS_BACK)
	for jaw in [_jaw_left, _jaw_right]:
		var mat := jaw.material_override as StandardMaterial3D
		if mat:
			var glow := mat.duplicate() as StandardMaterial3D
			glow.emission_enabled = true
			glow.emission = Color(0.9, 0.15, 0.1)
			glow.emission_energy_multiplier = 1.4
			jaw.material_override = glow
