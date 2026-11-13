## Mixamo ile riglenmiş özel karakter mesh'ini Survivalist'in UE mannequin iskeletine YENİDEN BAĞLAR.
## Sonuç: UE kemik adlarıyla skin'lenmiş mesh + karaktere özel kemik rest'leri (bone_rests meta).
## Rest DÖNÜŞLERİ UE ile aynı kalır (animasyon kütüphanesi rotasyon track'leri doğrudan uyar), sadece
## kemik KONUMLARI karakterin gövdesine oturur. Mesh'in bağlanma duruşu (Mixamo T-pozu) her kemik için
## "UE rest yönü → Mixamo yönü" salınımı (swing) ile bind pose'a yazılır; rest'te mesh UE A-pozuna kıvrılır.
## Ölçek: Mixamo kalça yüksekliği = UE pelvis yüksekliği (animasyonların pelvis konum track'i mutlak).
## Çıktı: PackedScene (.scn) — kök MeshInstance3D (mesh + skin, meta "bone_rests" {kemik: Transform3D}).
## SurvivalistModel.apply_outfit CUSTOM_MODELS ile kullanır.
## Kullanım (kopya projede — model ve UE FBX'i res:// altında olmalı):
##   godot --headless --path <proje> --script <bu dosya> -- res://ue.fbx res://mixamo.fbx res://out.scn
extends SceneTree

## El ayası yönü (ikincil eksen) — bilek dönüşü (roll) de hizalansın, tüfek tutuşu doğru dursun
const PALM := {
	"hand_l": ["index_01_l", "pinky_01_l"], "hand_r": ["index_01_r", "pinky_01_r"],
}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var ue_root: Node3D = (load(args[0]) as PackedScene).instantiate()
	var mx_root: Node3D = (load(args[1]) as PackedScene).instantiate()
	get_root().add_child(ue_root)
	get_root().add_child(mx_root)
	var lib: Script = load(get_script().resource_path.get_base_dir().path_join("retarget_lib.gd"))
	var MAP: Dictionary = lib.MAP
	var ue: Skeleton3D = ue_root.find_children("*", "Skeleton3D", true, false)[0]
	var mx: Skeleton3D = mx_root.find_children("*", "Skeleton3D", true, false)[0]
	var mi: MeshInstance3D = null
	for n in mx_root.find_children("*", "MeshInstance3D", true, false):
		if (n as MeshInstance3D).skin:
			mi = n
			break
	var skin := mi.skin

	# Mixamo kemik → bağlanma duruşundaki global transform (skin bind'inden; yoksa rest)
	var mx_rest_g: Dictionary = lib._global_rests(mx)
	var mx_g := {}
	for b in mx.get_bone_count():
		mx_g[b] = mx_rest_g[b]
	var max_diff := 0.0
	for i in skin.get_bind_count():
		var b := mx.find_bone(skin.get_bind_name(i))
		var t: Transform3D = skin.get_bind_pose(i).affine_inverse()
		max_diff = maxf(max_diff, (t.origin - mx_rest_g[b].origin).length())
		mx_g[b] = t
	print("bind/rest farkı (maks): ", max_diff)

	# UE adı → Mixamo kemik indeksi
	var ue_to_mx := {}
	for m: String in MAP:
		var si := mx.find_bone("mixamorig_" + m)
		var di := ue.find_bone(MAP[m])
		if si >= 0 and di >= 0:
			ue_to_mx[di] = si
	var ue_rest_g: Dictionary = lib._global_rests(ue)
	var pelvis := ue.find_bone("pelvis")
	var hips := mx.find_bone("mixamorig_Hips")
	var k: float = ue_rest_g[pelvis].origin.y / mx_g[hips].origin.y
	print("ölçek k = ", k)

	var joint := func(si: int) -> Vector3: return (mx_g[si] as Transform3D).origin * k
	var ue_child := func(di: int) -> int:
		var m: String = ""
		for key: String in MAP:
			if MAP[key] == ue.get_bone_name(di):
				m = key
		var c: String = lib._chain_child(m)
		if c.is_empty() or not MAP.has(c):
			return -1
		return ue.find_bone(MAP[c])

	# Kemik başına salınım (UE rest yönü → Mixamo bağlanma yönü); çocuğu olmayan ebeveyninkini alır
	var order: Array[int] = lib._hier_order(ue)
	var swing := {}
	for di in order:
		var p := ue.get_bone_parent(di)
		var inherited: Basis = swing.get(p, Basis.IDENTITY)
		if not ue_to_mx.has(di):
			swing[di] = inherited
			continue
		var dc: int = ue_child.call(di)
		if dc < 0 or not ue_to_mx.has(dc):
			swing[di] = inherited
			continue
		var dd: Vector3 = (ue_rest_g[dc].origin - ue_rest_g[di].origin).normalized()
		var ds: Vector3 = (joint.call(ue_to_mx[dc]) - joint.call(ue_to_mx[di])).normalized()
		var bn := ue.get_bone_name(di)
		if PALM.has(bn):
			var a := ue.find_bone(PALM[bn][0])
			var b := ue.find_bone(PALM[bn][1])
			var dd2: Vector3 = ue_rest_g[a].origin - ue_rest_g[b].origin
			var ds2: Vector3 = joint.call(ue_to_mx[a]) - joint.call(ue_to_mx[b])
			swing[di] = _frame(ds, ds2) * _frame(dd, dd2).inverse()
		else:
			swing[di] = Basis(Quaternion(dd, ds))

	# Yeni rest'ler + bind (bağlanma duruşunda kemik transformu) B
	var B := {}
	var rests := {}
	for di in order:
		var p := ue.get_bone_parent(di)
		var ue_local := ue.get_bone_rest(di)
		var local := Transform3D(ue_local.basis.orthonormalized(), ue_local.origin)
		if ue_to_mx.has(di):
			var j: Vector3 = joint.call(ue_to_mx[di])
			B[di] = Transform3D((swing[di] as Basis) * (ue_rest_g[di] as Transform3D).basis.orthonormalized(), j)
			if p >= 0:
				local.origin = (B[p] as Transform3D).affine_inverse() * j
			else:
				local.origin = j
		else:
			B[di] = (B[p] as Transform3D) * local if p >= 0 else (ue_rest_g[di] as Transform3D)
			if p >= 0:
				# eşlenmeyen (root/twist): UE yerel konumu, ebeveynin salınımıyla bağlanma duruşunda
				B[di] = Transform3D((swing[di] as Basis) * (ue_rest_g[di] as Transform3D).basis.orthonormalized(),
					(B[p] as Transform3D) * ue_local.origin)
		rests[ue.get_bone_name(di)] = local

	# Mesh: köşe konumları ×k, kemik indeksleri UE bind'lerine (eşlenmeyen Mixamo kemiği → en yakın eşlenen ata)
	var mx_to_ue := {}
	for di: int in ue_to_mx:
		mx_to_ue[ue_to_mx[di]] = di
	var bind_ue := []   # skin bind indeksi → UE kemik
	for i in skin.get_bind_count():
		var b := mx.find_bone(skin.get_bind_name(i))
		while b >= 0 and not mx_to_ue.has(b):
			b = mx.get_bone_parent(b)
		bind_ue.append(mx_to_ue[b] if b >= 0 else pelvis)
	var new_skin := Skin.new()
	var ue_bind_index := {}
	for di: int in bind_ue:
		if not ue_bind_index.has(di):
			ue_bind_index[di] = new_skin.get_bind_count()
			new_skin.add_named_bind(ue.get_bone_name(di), (B[di] as Transform3D).affine_inverse())

	var arrays := mi.mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		verts[i] *= k
	arrays[Mesh.ARRAY_VERTEX] = verts
	var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
	var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
	var per := 8 if (mi.mesh.surface_get_format(0) & Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS) else 4
	var nb := PackedInt32Array()
	var nw := PackedFloat32Array()
	nb.resize(bones.size())
	nw.resize(weights.size())
	for v in verts.size():
		var acc := {}
		for s in per:
			var w := weights[v * per + s]
			if w <= 0.0:
				continue
			var ui: int = ue_bind_index[bind_ue[bones[v * per + s]]]
			acc[ui] = acc.get(ui, 0.0) + w
		var keys := acc.keys()
		keys.sort_custom(func(a, b): return acc[a] > acc[b])
		var total := 0.0
		for s in mini(per, keys.size()):
			total += acc[keys[s]]
		for s in per:
			if s < keys.size():
				nb[v * per + s] = keys[s]
				nw[v * per + s] = acc[keys[s]] / total
			else:
				nb[v * per + s] = 0
				nw[v * per + s] = 0.0
	arrays[Mesh.ARRAY_BONES] = nb
	arrays[Mesh.ARRAY_WEIGHTS] = nw

	var im := ImporterMesh.new()
	var flags := Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS if per == 8 else 0
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, null, "body", flags)
	im.generate_lods(25.0, 60.0, [])
	var mesh := im.get_mesh()
	print("üçgen: ", arrays[Mesh.ARRAY_INDEX].size() / 3, " lod: ", mesh.surface_get_format(0), " bind: ", new_skin.get_bind_count())

	var out := MeshInstance3D.new()
	out.name = "CustomBody"
	out.mesh = mesh
	out.skin = new_skin
	out.set_meta("bone_rests", rests)
	var ps := PackedScene.new()
	ps.pack(out)
	var err := ResourceSaver.save(ps, args[2])
	print("kaydedildi ", args[2], " err=", err)
	quit()


## İki yönden ortonormal çerçeve (birincil a, ikincil b'nin a'ya dik bileşeni)
static func _frame(a: Vector3, b: Vector3) -> Basis:
	var x := a.normalized()
	var y := (b - x * b.dot(x)).normalized()
	return Basis(x, y, x.cross(y))
