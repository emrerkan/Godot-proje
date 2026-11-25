## HandRifle.gd — eldeki tüfek görseli (SkeletonModifier3D, en son çalışır: UpperBodyLayer + SpineTwist sonrası).
## Tüfek her kare sağ elde (kabza) durur ve sol ele (ön el) doğru hizalanır → hangi animasyon oynarsa
## oynasın iki elin arasında kalır. Sol el ayrılınca (şarjör değiştirme / bomba atma) son geçerli tutuşu
## sağ ele göre korur. Mermi tüfeğin "Muzzle" marker'ından çıkar (Weapon.visual_muzzle).

extends SkeletonModifier3D

const GRIP_BONE := "hand_r"
const SUPPORT_BONE := "hand_l"
const VALID_HAND_DIST := Vector2(0.12, 0.65)  # bu aralıktaysa iki elle tutuş geçerli

var rifle: Node3D = null
## Nişan yönünü veren node (Player root, -Z = nişan). Atanırsa tüfeğin nişandan yatay sapması ölçülür.
var aim_node: Node3D = null
## Tüfek namlusunun nişan yönünden yatay sapması (rad, dünya +Y etrafında; + = sola). Player omurgayı
## bununla düzeltir (Mixamo nişan pozu tüfeği gövdenin ~60° soluna tutuyor).
var aim_error := 0.0
var aim_valid := false   # bu kare iki elle geçerli tutuş + ölçüm var mı
var _grip := -1
var _support := -1
var _mid1_r := -1
var _mid2_r := -1
var _mid1_l := -1
var _mid2_l := -1
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
		_mid1_r = sk.find_bone("middle_01_r")
		_mid2_r = sk.find_bone("middle_02_r")
		_mid1_l = sk.find_bone("middle_01_l")
		_mid2_l = sk.find_bone("middle_02_l")
		_middle = _mid1_r
		_thumb = sk.find_bone("thumb_02_r")


## Avuç içi merkezi: bilek (hand_*) yerine orta parmak köklerine kaydırarak tüfeği gerçek kavrama noktasına oturtur.
func _palm_center(sk: Skeleton3D, hand_id: int, mid1_id: int, mid2_id: int) -> Vector3:
	var h := sk.get_bone_global_pose(hand_id).origin
	if mid1_id < 0:
		return h
	var palm := h.lerp(sk.get_bone_global_pose(mid1_id).origin, 0.55)
	if mid2_id >= 0:
		palm = palm.lerp(sk.get_bone_global_pose(mid2_id).origin, 0.35)
	return palm


## Sadece bıçak modu: tüfek hep gizli, bıçak hep sağ elde; aim_error 0 (nişan düzeltmesi yok)
var knife_only := false


func show_knife(duration: float) -> void:
	_knife_time = duration


func _process_modification_with_delta(delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or rifle == null or _grip < 0 or _support < 0:
		return
	if knife_only and knife:
		aim_error = 0.0
		aim_valid = false
		rifle.visible = false
		var on := _middle >= 0 and _thumb >= 0
		knife.visible = on
		if on:
			_place_knife(sk)
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
	var grip_pos := _palm_center(sk, _grip, _mid1_r, _mid2_r)
	var support_pos := _palm_center(sk, _support, _mid1_l, _mid2_l)
	var to_support := support_pos - grip_pos
	var d := to_support.length()
	var xf: Transform3D
	aim_valid = false
	if d > VALID_HAND_DIST.x and d < VALID_HAND_DIST.y:
		# Kabza (0, 0, 0) sağ avuçta, el kundağı (0, fg_y, -d*cos_a) tam sol avuç içinde olacak şekilde kapalı form hizalama
		var dir := to_support / d
		var up_hint := Vector3.UP if absf(dir.dot(Vector3.UP)) <= 0.95 else Vector3.FORWARD
		var x_axis := dir.cross(up_hint).normalized()
		var chord_up := x_axis.cross(dir)
		var fg_y: float = float(rifle.get_meta("foregrip_y", 0.06))
		var sin_a := clampf(fg_y / d, -0.75, 0.75)
		var cos_a := sqrt(maxf(1.0 - sin_a * sin_a, 0.0))
		var fwd := dir * cos_a - chord_up * sin_a
		var y_axis := dir * sin_a + chord_up * cos_a
		xf = Transform3D(Basis(x_axis, y_axis, -fwd), grip_pos)
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


## ── Gerçek silah modelleri (kullanıcının Tripo modelleri, 2026-11-14) ──
## Tripo GLB'leri EXT_meshopt_compression + KHR_mesh_quantization ile geliyordu (Godot açamıyor) → scratchpad Python çözücüyle
## düz GLB'ye çevrildi: asset model/silahlar/*.glb (orijinaller silahlar/kaynak/, .gdignore). M4A1 FBX doğrudan içe aktarılıyor.
## Modeller 1 m'ye normalize ve kendi içlerinde eğik/dönük → her biri için MODEL uzayında ölçülen:
##   fwd   = namlu yönü (dipçikten namluya; köşe verisinden ölçüldü), grip = sağ elin tuttuğu kabza noktası,
##   tip   = namlu ağzı (mermi buradan), tb = uç–dip boyu (model birimi), length = oyundaki gerçek boy (m, iskelet uzayı).
## Dönüşüm: tüfek uzayı = ölçek × looking_at(fwd)⁻¹ × (p − grip) → -Z namlu, +Y üst, orijin kabza (prosedürel tüfekle aynı sözleşme).
## Dokular içe aktarmada 1024'e sınırlı (4K geliyordu). Tripo GLB'lerde ORM: G=pürüzlülük, B=metal (glTF ile aynı) → importer bağlar.
const WEAPON_MODELS := {
	"Medic": {"path": "res://asset model/silahlar/medic_silah.glb", "fwd": Vector3(0, 0.007, 1),
		"grip": Vector3(0, -0.046, -0.225), "tip": Vector3(0.001, 0.097, 0.491), "tb": 0.986, "length": 0.88,
		"eject_fwd": 0.10, "foregrip_y": 0.090, "grip_shift": Vector3(0.0, -0.015, -0.045)},
	"Runner": {"path": "res://asset model/silahlar/mp5.glb", "fwd": Vector3(0, 0.259, 0.966),
		"grip": Vector3(0, -0.126, -0.172), "tip": Vector3(0.002, 0.191, 0.493), "tb": 1.022, "length": 0.78,
		"eject_fwd": 0.09, "foregrip_y": 0.072, "grip_shift": Vector3(0.0, -0.010, -0.025)},
	"Sniper": {"path": "res://asset model/silahlar/sniper_tufek.glb", "fwd": Vector3(-0.331, 0.666, 0.965),
		"grip": Vector3(0.061, -0.184, -0.218), "tip": Vector3(-0.179, 0.380, 0.483), "tb": 1.218, "length": 1.00,
		"eject_fwd": 0.12, "foregrip_y": 0.060, "grip_shift": Vector3(0.0, -0.025, -0.140)},
	"Tank": {"path": "res://asset model/silahlar/tank_tufek.glb", "fwd": Vector3(0, 0, 1),
		"grip": Vector3(0, 0.0, -0.179), "tip": Vector3(-0.001, 0.073, 0.494), "tb": 0.989, "length": 1.00,
		"eject_fwd": 0.10, "foregrip_y": 0.050, "grip_shift": Vector3(0.0, -0.010, -0.020)},
	"Visioner": {"path": "res://asset model/karakterler/Visioner/m4a1.fbx", "fwd": Vector3(0, 0.005, 1),
		"grip": Vector3(0, -0.028, -0.149), "tip": Vector3(0, 0.077, 0.493), "tb": 0.987, "length": 0.84,
		"eject_fwd": 0.10, "foregrip_y": 0.068, "grip_shift": Vector3(0.0, -0.015, -0.030),
		# FBX importer pürüzlülük/metal dokularını bağlamadı
		"rough_tex": "res://asset model/karakterler/Visioner/m4a1_2.png", "metal_tex": "res://asset model/karakterler/Visioner/m4a1_3.png"},
}
## Bıçak: grip = sap ortası, tip = ağız ucu; bıçak uzayı -Z = ağız (prosedürel bıçakla aynı sözleşme, _place_knife yerleştirir)
const KNIFE_MODEL := {"path": "res://asset model/silahlar/bicak.glb", "fwd": Vector3(0, 0.812, 0.984),
	"grip": Vector3(0, -0.251, -0.350), "tip": Vector3(0, 0.444, 0.492), "tb": 1.276, "length": 0.30}
static var _model_cache := {}   # yol → PackedScene (20 oyuncu aynı sahneyi paylaşır)


## Model + "Muzzle" marker; dosya yoksa null (çağıran prosedürele düşer)
static func _build_from_model(spec: Dictionary, node_name: String) -> Node3D:
	var path: String = spec["path"]
	if not _model_cache.has(path):
		_model_cache[path] = load(path) if ResourceLoader.exists(path) else null
	var packed := _model_cache[path] as PackedScene
	if packed == null:
		return null
	var root := Node3D.new()
	root.name = node_name
	var model: Node3D = packed.instantiate()
	var s: float = float(spec["length"]) / float(spec["tb"])
	var b := Basis.looking_at((spec["fwd"] as Vector3).normalized(), Vector3.UP).inverse().scaled(Vector3.ONE * s)
	var shift: Vector3 = spec.get("grip_shift", Vector3.ZERO)
	model.transform = Transform3D(b, -(b * (spec["grip"] as Vector3)) + shift)
	root.add_child(model)
	if spec.has("rough_tex"):
		_bind_extra_textures(model, spec)
	var tip := Marker3D.new()
	tip.name = "Muzzle"
	tip.position = b * ((spec["tip"] as Vector3) - (spec["grip"] as Vector3)) + shift
	root.add_child(tip)
	root.set_meta("foregrip_y", float(spec.get("foregrip_y", clampf(tip.position.y * 0.65, 0.03, 0.09))))
	if spec.has("eject_fwd"):
		root.add_child(_make_eject_marker(tip.position, float(spec["eject_fwd"])))
	return root


## Kovan atma deliği ("Eject", Muzzle'ın kardeşi; ShellCasing.eject kullanır). Tüfek uzayında: kabzanın
## eject_fwd m önünde, namlu ekseni yüksekliğinin ~%85'inde, gövdenin sağ yüzünde. Bazis birim:
## -Z = tüfek ileri, +X = atma yönü (tüfeğin sağı), +Y = üst.
static func _make_eject_marker(muzzle_pos: Vector3, fwd_dist: float) -> Marker3D:
	var m := Marker3D.new()
	m.name = "Eject"
	m.position = Vector3(0.03, muzzle_pos.y * 0.85, -fwd_dist)
	return m


static var _extra_mat_cache := {}
static func _bind_extra_textures(model: Node, spec: Dictionary) -> void:
	for mi: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		for i in mi.mesh.get_surface_count():
			var src := mi.mesh.surface_get_material(i) as StandardMaterial3D
			if src == null:
				continue
			if not _extra_mat_cache.has(src):
				var m := src.duplicate() as StandardMaterial3D
				m.roughness_texture = load(spec["rough_tex"])
				m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
				m.roughness = 1.0
				m.metallic_texture = load(spec["metal_tex"])
				m.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
				m.metallic = 1.0
				_extra_mat_cache[src] = m
			mi.set_surface_override_material(i, _extra_mat_cache[src])


## Karakterin silahı (Player + MenuBackground3D). Tablo/dosya yoksa prosedürel tüfek.
static func build_weapon_mesh(character: String) -> Node3D:
	if WEAPON_MODELS.has(character):
		var w := _build_from_model(WEAPON_MODELS[character], "HandRifle")
		if w != null:
			return w
	return build_rifle_mesh()


## Bıçak modeli (gizli başlar); dosya yoksa prosedürel
static func build_knife_model() -> Node3D:
	var k := _build_from_model(KNIFE_MODEL, "HandKnife")
	if k == null:
		return build_knife_mesh()
	k.visible = false
	return k


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
	# Kovan atma deliği: gövde kutusunun sağ yüzü (x 0.03), kabzanın biraz önü
	var ej := Marker3D.new()
	ej.name = "Eject"
	ej.position = Vector3(0.035, 0.05, -0.1)
	rifle.add_child(ej)
	return rifle
