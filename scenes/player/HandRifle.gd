## HandRifle.gd — eldeki tüfek görseli (SkeletonModifier3D, en son çalışır: UpperBodyLayer + SpineTwist sonrası).
## Tüfek her kare sağ elde (kabza) durur ve sol ele (ön el) doğru hizalanır → hangi animasyon oynarsa
## oynasın iki elin arasında kalır. Sol el ayrılınca (şarjör değiştirme / bomba atma) son geçerli tutuşu
## sağ ele göre korur. Mermi tüfeğin "Muzzle" marker'ından çıkar (Weapon.visual_muzzle).

extends SkeletonModifier3D

const GRIP_BONE := "hand_r"
const SUPPORT_BONE := "hand_l"
const VALID_HAND_DIST := Vector2(0.12, 0.65)  # bu aralıktaysa iki elle tutuş geçerli
## Kabzanın el kemiğine göre küçük ofseti (avuç içi), iskelet uzayında
const GRIP_OFFSET := Vector3(0.0, -0.03, 0.0)

var rifle: Node3D = null
## Nişan yönünü veren node (Player root, -Z = nişan). Atanırsa tüfeğin nişandan yatay sapması ölçülür.
var aim_node: Node3D = null
## Tüfek namlusunun nişan yönünden yatay sapması (rad, dünya +Y etrafında; + = sola). Player omurgayı
## bununla düzeltir (Mixamo nişan pozu tüfeği gövdenin ~60° soluna tutuyor).
var aim_error := 0.0
var aim_valid := false   # bu kare iki elle geçerli tutuş + ölçüm var mı
var _grip := -1
var _support := -1
var _rel_to_hand := Transform3D.IDENTITY   # son geçerli tutuşta tüfeğin sağ ele göre konumu
var _has_rel := false

## Bıçaklama: show_knife(süre) boyunca tüfek gizlenir, sağ elde bıçak (yumruk içinde, ağız başparmak yönünde)
var knife: Node3D = null
var _knife_time := 0.0
var _middle := -1
var _thumb := -1


func _ready() -> void:
	var sk := get_skeleton()
	if sk:
		_grip = sk.find_bone(GRIP_BONE)
		_support = sk.find_bone(SUPPORT_BONE)
		_middle = sk.find_bone("middle_01_r")
		_thumb = sk.find_bone("thumb_02_r")


func show_knife(duration: float) -> void:
	_knife_time = duration


func _process_modification_with_delta(delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or rifle == null or _grip < 0 or _support < 0:
		return
	if knife:
		_knife_time = maxf(_knife_time - delta, 0.0)
		var knife_on := _knife_time > 0.0 and _middle >= 0 and _thumb >= 0
		knife.visible = knife_on
		rifle.visible = not knife_on
		if knife_on:
			_place_knife(sk)
			aim_valid = false
			return
	var hand := sk.get_bone_global_pose(_grip)
	var support := sk.get_bone_global_pose(_support)
	var grip_pos := hand.origin + GRIP_OFFSET
	var to_support := support.origin - grip_pos
	var d := to_support.length()
	var xf: Transform3D
	aim_valid = false
	if d > VALID_HAND_DIST.x and d < VALID_HAND_DIST.y:
		# -Z (namlu) sol ele doğru, yukarı iskelet +Y'ye yakın
		var fwd := to_support / d
		var up := Vector3.UP
		if absf(fwd.dot(up)) > 0.95:
			up = Vector3.FORWARD
		xf = Transform3D(Basis.looking_at(fwd, up), grip_pos)
		_rel_to_hand = hand.affine_inverse() * xf
		_has_rel = true
		if aim_node:
			var rifle_fwd := sk.global_transform.basis * fwd
			var aim_fwd := -aim_node.global_transform.basis.z
			var a := Vector2(aim_fwd.x, aim_fwd.z)
			var r := Vector2(rifle_fwd.x, rifle_fwd.z)
			if a.length() > 0.01 and r.length() > 0.01:
				# Dünya +Y etrafında aim → rifle işaretli açı (yukarıdan bakış, sağ el kuralı)
				aim_error = atan2(a.x * r.y - a.y * r.x, a.dot(r)) * -1.0
				aim_valid = true
	elif _has_rel:
		xf = hand * _rel_to_hand
	else:
		return
	# rifle iskeletin çocuğu → iskelet uzayı = rifle'ın yerel uzayı
	rifle.transform = xf


## Bıçak sap ortası yumrukta (el ile orta parmak kökü arası), ağız (-Z) başparmak yönüne — parmaklara dik
func _place_knife(sk: Skeleton3D) -> void:
	var hand := sk.get_bone_global_pose(_grip).origin
	var fingers := sk.get_bone_global_pose(_middle).origin - hand
	var thumb := sk.get_bone_global_pose(_thumb).origin - hand
	if fingers.length() < 0.001:
		return
	var f := fingers.normalized()
	var blade := thumb - f * thumb.dot(f)
	if blade.length() < 0.001:
		return
	knife.transform = Transform3D(Basis.looking_at(blade.normalized(), f), hand + fingers * 0.6)


## Prosedürel bıçak: -Z = ağız, orijin = sap ortası
static func build_knife_mesh() -> Node3D:
	var knife := Node3D.new()
	knife.name = "HandKnife"
	var steel := StandardMaterial3D.new()
	steel.albedo_color = Color(0.72, 0.74, 0.78)
	steel.metallic = 0.95
	steel.roughness = 0.2
	var grip := StandardMaterial3D.new()
	grip.albedo_color = Color(0.08, 0.08, 0.08)
	grip.roughness = 0.85
	# [boyut, konum, malzeme] — sap, siper, ağız
	var parts := [
		[Vector3(0.028, 0.034, 0.11), Vector3(0, 0, 0.0), grip],
		[Vector3(0.05, 0.012, 0.012), Vector3(0, 0, -0.06), steel],
		[Vector3(0.006, 0.03, 0.17), Vector3(0, 0.002, -0.15), steel],
	]
	for p: Array in parts:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = p[0]
		mi.mesh = bm
		mi.position = p[1]
		mi.material_override = p[2]
		knife.add_child(mi)
	knife.visible = false
	return knife


## Basit prosedürel tüfek (Weapon sahnesinde görsel yok). -Z = namlu; orijin = kabza (sağ el).
## Player ve menü arka planı (MenuBackground3D) kullanır.
static func build_rifle_mesh() -> Node3D:
	var rifle := Node3D.new()
	rifle.name = "HandRifle"
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color(0.09, 0.09, 0.1)
	metal.metallic = 0.7
	metal.roughness = 0.45
	var polymer := StandardMaterial3D.new()
	polymer.albedo_color = Color(0.16, 0.15, 0.13)
	polymer.roughness = 0.8
	# [boyut, konum, malzeme] — gövde, el kundağı, dipçik, şarjör, kabza
	var parts := [
		[Vector3(0.06, 0.09, 0.36), Vector3(0, 0.03, -0.12), metal],
		[Vector3(0.055, 0.07, 0.26), Vector3(0, 0.025, -0.42), polymer],
		[Vector3(0.05, 0.1, 0.24), Vector3(0, 0.0, 0.17), polymer],
		[Vector3(0.035, 0.14, 0.06), Vector3(0, -0.07, -0.16), metal],
		[Vector3(0.035, 0.1, 0.045), Vector3(0, -0.04, 0.0), polymer],
	]
	for p: Array in parts:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = p[0]
		mi.mesh = bm
		mi.position = p[1]
		mi.material_override = p[2]
		rifle.add_child(mi)
	var barrel := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.012
	cm.bottom_radius = 0.012
	cm.height = 0.26
	barrel.mesh = cm
	barrel.rotation.x = PI / 2.0
	barrel.position = Vector3(0, 0.035, -0.66)
	barrel.material_override = metal
	rifle.add_child(barrel)
	# Namlu ağzı (namlu ucu z = -0.66 - 0.13) — Weapon mermiyi buradan doğurur (Weapon.visual_muzzle)
	var tip := Marker3D.new()
	tip.name = "Muzzle"
	tip.position = Vector3(0, 0.035, -0.8)
	rifle.add_child(tip)
	return rifle
