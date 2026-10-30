## Survivalist (UE mannequin iskeleti) animasyon kütüphanesini kurar → anims/survivalist_anims.res
## Kaynak: anims/Basic+Demo+Animations/*.FBX (aynı iskelet, doğrudan uyumlu) + mevcut "Breathing Idle" (Mixamo bake'i).
## Temizlik: modelde olmayan kemiklerin (ik_*) track'leri, pelvis dışındaki position track'leri (kemik boyu farkı
## gerilme yapmasın — Death farklı rest'le gelmiş) ve scale track'leri atılır. Döngü ayarları burada.
## Kullanım (proje kökünde, editör kapalıyken ya da kopya projede):
##   godot --headless --path . --script tools/build_anim_library.gd
extends SceneTree

const MODEL := "res://asset model/Survivalist/SK_Military_Survivalist.fbx"
const SRC_DIR := "res://anims/Basic+Demo+Animations/"
const OUT := "res://anims/survivalist_anims.res"
## dosya → [kütüphanedeki ad, döngü]
const CLIPS := {
	"Idle.fbx": ["Idle", true],
	"Walk.FBX": ["Walk", true],
	"Run.FBX": ["Run", true],
	"Crouch_Walk.FBX": ["CrouchWalk", true],
	"Talk.FBX": ["Talk", true],
	"Jump.FBX": ["Jump", false],
	"Death.fbx": ["Death", false],
}
## Mixamo (mixamorig iskeleti) klipleri → retarget_lib ile UE iskeletine aktarılır. [ad, döngü]
## Üst gövde katmanı (UpperBodyLayer) kullanır: AimIdle/FireStand/FireWalk/Reload/Toss/HitReact; Dying tam gövde.
const MIXAMO_CLIPS := {
	"res://anims/Basic Shooter Pack/rifle aiming idle.fbx": ["AimIdle", true],
	"res://anims/NotWalkFire.fbx": ["FireStand", true],
	"res://anims/WalkFiring Rifle.fbx": ["FireWalk", true],
	"res://anims/Reloading.fbx": ["Reload", false],
	"res://anims/Basic Shooter Pack/toss grenade.fbx": ["Toss", false],
	"res://anims/Basic Shooter Pack/hit reaction.fbx": ["HitReact", false],
	"res://anims/Dying.fbx": ["Dying", false],
	# Kullanıcının eklediği Mixamo koşarak zıplama (1 sn; havada ~0.07-0.67 sn) — 3. eleman: in_place (kök hareketi atılır)
	"res://anims/Jump.fbx": ["JumpRun", false, true],
	# Takla (Ctrl + Space) — 4. eleman keep_height: yatay kök hareketi atılır, kalça yüksekliği kalır
	"res://anims/Front Flip.fbx": ["FrontFlip", false, true, true],
	"res://anims/Backflip.fbx": ["BackFlip", false, true, true],
	# Bıçaklama (V / sağ tık) — üst gövde aksiyonu, sağ el ~0.5 sn'de ileri saplar
	"res://anims/Stabbing.fbx": ["Stab", false, true],
}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var model: Node3D = (load(MODEL) as PackedScene).instantiate()
	get_root().add_child(model)
	var sk: Skeleton3D = model.find_children("*", "Skeleton3D", true, false)[0]

	var lib := AnimationLibrary.new()
	# Eski kütüphanedeki Breathing Idle'ı koru (yedek idle)
	if ResourceLoader.exists(OUT):
		var old := load(OUT) as AnimationLibrary
		if old and old.has_animation(&"Breathing Idle"):
			lib.add_animation(&"Breathing Idle", old.get_animation(&"Breathing Idle"))

	for file: String in CLIPS:
		var path := SRC_DIR + file
		if not ResourceLoader.exists(path):
			print("YOK: ", path)
			continue
		var src: Node3D = (load(path) as PackedScene).instantiate()
		var ap: AnimationPlayer = src.find_children("*", "AnimationPlayer", true, false)[0]
		var src_anim: Animation = null
		for an in ap.get_animation_list():
			if an != &"RESET":
				src_anim = ap.get_animation(an)
				break
		var anim := src_anim.duplicate(true) as Animation
		var removed := 0
		for t in range(anim.get_track_count() - 1, -1, -1):
			var tp := anim.track_get_path(t)
			var bone := str(tp.get_concatenated_subnames())
			var type := anim.track_get_type(t)
			var drop := sk.find_bone(bone) < 0 \
				or type == Animation.TYPE_SCALE_3D \
				or (type == Animation.TYPE_POSITION_3D and bone != "pelvis")
			if drop:
				anim.remove_track(t)
				removed += 1
		anim.loop_mode = Animation.LOOP_LINEAR if CLIPS[file][1] else Animation.LOOP_NONE
		lib.add_animation(StringName(CLIPS[file][0]), anim)
		print("%-16s → %-10s len=%.2f tracks=%d (atılan %d)" % [file, CLIPS[file][0], anim.length, anim.get_track_count(), removed])
		src.free()

	# Mixamo klipleri (tools/.gdignore yüzünden res:// değil, script'in disk yolundan yüklenir)
	var retarget: Script = load(get_script().resource_path.get_base_dir().path_join("retarget_lib.gd"))
	for path: String in MIXAMO_CLIPS:
		if not ResourceLoader.exists(path):
			print("YOK: ", path)
			continue
		var opts: Array = MIXAMO_CLIPS[path]
		var anim: Animation = retarget.retarget(path, get_root(), model, opts.size() > 2 and opts[2], opts.size() > 3 and opts[3])
		anim.loop_mode = Animation.LOOP_LINEAR if MIXAMO_CLIPS[path][1] else Animation.LOOP_NONE
		lib.add_animation(StringName(MIXAMO_CLIPS[path][0]), anim)
		print("%-34s → %-10s len=%.2f tracks=%d (Mixamo → UE)" % [path.get_file(), MIXAMO_CLIPS[path][0], anim.length, anim.get_track_count()])

	var err := ResourceSaver.save(lib, OUT)
	print("kaydedildi ", OUT, " err=", err, " animasyonlar=", lib.get_animation_list())
	quit()
