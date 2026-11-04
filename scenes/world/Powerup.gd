## Powerup.gd — yerde duran güç nesnesi (PowerupManager oluşturur, sahne dosyası yok).
## Görsel: renkli parlayan sembol + taban halkası + ışık + etiket; süzülür ve döner, son 2 sn yanıp söner.
## Tip siluetleri: 0 küre, 1 artı, 2 prizma, 4 düşük silindir, 5 kapsül, 6 disk+çarpı, 7 pahlı yarı saydam kristal
## (InvisibilityShimmer), 8 uzun yatay kasa + kırmızı nokta (özel silah), 9 dikey açık makas (tuzak çözücü), diğer halka.
## Kart gibi SADECE yaklaşınca görünür (ProximityReveal). Alma: yerel oyuncu yakındaysa ve slotu boşsa
## PowerupManager.local_touched → host doğrular. (Area3D sinyali yerine mesafe kontrolü: slot boşalınca
## üzerinde duran oyuncu da tekrar alabilsin.)

extends Area3D

const PICK_RADIUS := 1.3
const PROXIMITY_SCRIPT := preload("res://scenes/world/ProximityReveal.gd")
const SHIMMER_SHADER := preload("res://scenes/player/InvisibilityShimmer.gdshader")

## Yeni güç tipleri (PowerupManager.Type ile aynı index)
const TYPE_INVIS := 7
const TYPE_SPECIAL_GUN := 8
const TYPE_TRAP_BREAKER := 9
const GUNMETAL := Color(0.12, 0.13, 0.15)
const INVIS_PULSE_HZ := 0.8        # kristal alfa nabzı (≤0.8 Hz)

var item_type := 0
var time_left := 5.0

var _shimmer_mat: ShaderMaterial   # sadece INVIS: alfa nabzı için
var _manager: Node
var _id := 0
var _visual: Node3D
var _light: OmniLight3D
var _t := 0.0
var _touch_cooldown := 0.0


func setup(manager: Node, id: int, type: int, lifetime: float) -> void:
	_manager = manager
	_id = id
	item_type = type
	time_left = lifetime


func _ready() -> void:
	monitoring = false
	monitorable = false
	var info: Dictionary = _manager.INFO[item_type]
	var color: Color = info["color"]

	var glow := StandardMaterial3D.new()
	glow.albedo_color = color
	glow.emission_enabled = true
	glow.emission = color
	glow.emission_energy_multiplier = 2.2

	_visual = Node3D.new()
	_visual.position.y = 0.9
	add_child(_visual)
	var core := MeshInstance3D.new()
	match item_type:
		0:  # bomba — küre
			var s := SphereMesh.new()
			s.radius = 0.28
			s.height = 0.56
			core.mesh = s
		1:  # sağlık — artı
			var b := BoxMesh.new()
			b.size = Vector3(0.55, 0.18, 0.18)
			core.mesh = b
			var b2 := MeshInstance3D.new()
			var bm := BoxMesh.new()
			bm.size = Vector3(0.18, 0.55, 0.18)
			b2.mesh = bm
			b2.material_override = glow
			_visual.add_child(b2)
		2:  # uydu — elmas
			var pm := PrismMesh.new()
			pm.size = Vector3(0.45, 0.45, 0.45)
			core.mesh = pm
		4:  # flaş bombası — kısa silindir (sis/flaş el bombası)
			var c := CylinderMesh.new()
			c.top_radius = 0.14
			c.bottom_radius = 0.14
			c.height = 0.5
			core.mesh = c
		5:  # sis bombası — kapsül (duman kutusu)
			var cap := CapsuleMesh.new()
			cap.radius = 0.15
			cap.height = 0.55
			core.mesh = cap
		6:  # tuzak — katlanmış/paketlenmiş hali (yassı disk + çarpı şeklinde iki çene)
			var disk := CylinderMesh.new()
			disk.top_radius = 0.3
			disk.bottom_radius = 0.3
			disk.height = 0.08
			core.mesh = disk
			for ang in [45.0, -45.0]:
				var cross := MeshInstance3D.new()
				var cb := BoxMesh.new()
				cb.size = Vector3(0.5, 0.06, 0.1)
				cross.mesh = cb
				cross.rotation.y = deg_to_rad(ang)
				cross.material_override = glow
				_visual.add_child(cross)
		TYPE_INVIS:  # görünmezlik — pahlı (düşük segmentli), hafif uzun, yarı saydam kristal küre
			var crystal := SphereMesh.new()
			crystal.radius = 0.30
			crystal.height = 0.60
			crystal.radial_segments = 6
			crystal.rings = 3
			core.mesh = crystal
			core.scale.y = 1.25
			# Oyuncunun giydiği titreşimin AYNISI (InvisibilityShimmer): yerdeki nesne = giyilen efekt bağı.
			# Tarama bandı küçük kristale sığsın diye sweep_period kısaltılır.
			_shimmer_mat = ShaderMaterial.new()
			_shimmer_mat.shader = SHIMMER_SHADER
			_shimmer_mat.set_shader_parameter("intensity", 1.0)
			_shimmer_mat.set_shader_parameter("sweep_period", 0.9)
			core.material_override = _shimmer_mat
		TYPE_SPECIAL_GUN:  # özel silah — uzun yatay kasa + kabza + uçta parlak kırmızı nokta
			var gun := Node3D.new()
			gun.rotation.z = deg_to_rad(8.0)  # hafif yukarı eğik
			_visual.add_child(gun)
			var gun_mat := StandardMaterial3D.new()
			gun_mat.albedo_color = GUNMETAL
			gun_mat.metallic = 0.6
			gun_mat.roughness = 0.45
			gun_mat.emission_enabled = true
			gun_mat.emission = color
			gun_mat.emission_energy_multiplier = 0.6  # karanlıkta siluet okunsun
			core.mesh = _box(Vector3(0.95, 0.07, 0.10))
			core.material_override = gun_mat
			gun.add_child(core)
			var grip := MeshInstance3D.new()
			grip.mesh = _box(Vector3(0.2, 0.05, 0.14))
			grip.material_override = gun_mat
			grip.position = Vector3(-0.37, -0.055, 0.0)
			gun.add_child(grip)
			# Lazer ucu: sahnenin en parlak noktası (≤3.5)
			var dot_mat := glow.duplicate() as StandardMaterial3D
			dot_mat.emission_energy_multiplier = 3.5
			var red_dot := MeshInstance3D.new()
			var dot_mesh := SphereMesh.new()
			dot_mesh.radius = 0.05
			dot_mesh.height = 0.10
			dot_mesh.radial_segments = 8
			dot_mesh.rings = 4
			red_dot.mesh = dot_mesh
			red_dot.material_override = dot_mat
			red_dot.position = Vector3(0.5, 0.0, 0.0)
			gun.add_child(red_dot)
		TYPE_TRAP_BREAKER:  # tuzak çözücü — dikey duran AÇIK makas (tuzağın yassı diskinden siluetle ayrışır)
			# Her yarım: pivot'ta kesişen bıçak + alt ucunda sap halkası; ±22° → X biçimli açık makas
			for sgn in [1.0, -1.0]:
				var half := Node3D.new()
				half.rotation.z = deg_to_rad(22.0) * sgn
				_visual.add_child(half)
				var blade := MeshInstance3D.new()
				blade.mesh = _box(Vector3(0.05, 0.55, 0.09))
				blade.material_override = glow
				blade.position.y = 0.095  # bıçak -0.18 (sap tarafı) .. +0.37 (uç)
				half.add_child(blade)
				var handle := MeshInstance3D.new()
				var hm := TorusMesh.new()
				hm.inner_radius = 0.04
				hm.outer_radius = 0.075
				handle.mesh = hm
				handle.rotation.x = deg_to_rad(90.0)  # halka XY düzleminde (kameraya yarı dönük)
				handle.material_override = glow
				handle.position.y = -0.255
				half.add_child(handle)
		_:  # takım uydusu — halka
			var t := TorusMesh.new()
			t.inner_radius = 0.18
			t.outer_radius = 0.32
			core.mesh = t
	# Mesh'siz çekirdek (tuzak çözücü: parçalar match içinde eklendi) sahneye girmez; kendi malzemesi olan tip (görünmezlik, özel silah) ezilmez
	if core.mesh != null:
		if core.material_override == null:
			core.material_override = glow
		if core.get_parent() == null:
			_visual.add_child(core)

	var ring := MeshInstance3D.new()
	var rm := TorusMesh.new()
	rm.inner_radius = 0.55
	rm.outer_radius = 0.62
	ring.mesh = rm
	var ring_mat := glow.duplicate() as StandardMaterial3D
	ring_mat.emission_energy_multiplier = 1.2
	if item_type == TYPE_INVIS:
		ring_mat.emission_energy_multiplier = 0.95  # "görünmez" teması: halka diğerlerinden biraz soluk (~x0.8)
	ring.material_override = ring_mat
	ring.position.y = 0.05
	add_child(ring)

	# Pickup başına tek OmniLight (gölgesiz, mevcut kalıp). Nadir güç (özel silah) bir kademe öne çıkar, görünmezlik soluk.
	_light = OmniLight3D.new()
	_light.light_color = color
	_light.light_energy = 1.8
	_light.omni_range = 4.0
	match item_type:
		TYPE_INVIS:
			_light.light_energy = 1.4
		TYPE_SPECIAL_GUN:
			_light.light_energy = 2.2
			_light.omni_range = 4.5
	_light.position.y = 1.0
	add_child(_light)

	var label := Label3D.new()
	label.text = "%s %s" % [info["glyph"], tr(info["name"])]
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.font_size = 40
	label.outline_size = 10
	label.modulate = color
	label.position.y = 1.7
	add_child(label)

	var reveal = PROXIMITY_SCRIPT.new()
	reveal.reveal_far = 11.0
	reveal.reveal_near = 5.0
	add_child(reveal)


func _process(delta: float) -> void:
	_t += delta
	time_left -= delta
	_visual.position.y = 0.9 + sin(_t * 2.5) * 0.12
	_visual.rotation.y += delta * 1.8
	if _shimmer_mat != null:
		# Kristal alfa nabzı (~0.35↔0.6 etkisi): shader intensity 0.6↔1.0, ≤0.8 Hz
		_shimmer_mat.set_shader_parameter("intensity", 0.8 + 0.2 * sin(_t * TAU * INVIS_PULSE_HZ))
	# Son 2 saniye: yanıp sön (kaybolmak üzere)
	if time_left < 2.0:
		_visual.visible = fmod(_t * 6.0, 1.0) > 0.35
	_try_pickup(delta)


static func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b


func _try_pickup(delta: float) -> void:
	_touch_cooldown -= delta
	if _touch_cooldown > 0.0 or _manager == null:
		return
	var me: Variant = GameManager.active_players.get(NetworkManager.get_local_id())
	if me == null or not is_instance_valid(me) or me.is_dead:
		return
	var d := Vector2((me as Node3D).global_position.x - global_position.x, (me as Node3D).global_position.z - global_position.z).length()
	if d <= PICK_RADIUS:
		_touch_cooldown = 0.4  # host cevabını beklerken isteği tekrar yollama
		_manager.local_touched(_id)
