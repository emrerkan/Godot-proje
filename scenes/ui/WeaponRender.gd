## WeaponRender.gd — Silah modellerinin (HandRifle.WEAPON_MODELS + bıçak) yandan BEYAZ SİLUETİNİ (CS:GO öldürme ikonu gibi) oyun içinde bir kez çizer.
## Ölüm bandı (DeathRecap) ve öldürme bildirimi (KillNotice) kullanır. Statik, sınıf adı YOK — kullananlar preload eder.
##   prewarm(tree)            → tüm silahları arka planda sırayla çizer (HUD kurulunca; ölüm anında takılma olmasın)
##   make_rect(key, size)     → TextureRect döner; resim hazır değilse hazır olunca kendini doldurur
## key = karakter adı ("Tank", "Runner"…) veya "knife". Resim önbellekte kalır (sahne geçişinde de).
## Headless'ta (sunucu/test) çizim yok → boş TextureRect.

extends RefCounted

const HAND_RIFLE := preload("res://scenes/player/HandRifle.gd")

const RENDER_SIZE := Vector2i(840, 280)   # 3:1 — ekranda ~270×90 gösterilir, 4K ölçekte de keskin
const KEYS := ["Tank", "Visioner", "Runner", "Medic", "Sniper", "knife"]

static var _cache := {}        # key → Texture2D
static var _pending := {}      # key → Array[TextureRect] (çizim sürerken istenenler)
static var _busy := false
static var _queue: Array = []


static func prewarm(tree: SceneTree) -> void:
	for k in KEYS:
		_request(tree, k)


static func make_rect(key: String, size: Vector2) -> TextureRect:
	var r := TextureRect.new()
	r.custom_minimum_size = size
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _cache.has(key):
		r.texture = _cache[key]
		return r
	if not _pending.has(key):
		_pending[key] = []
	(_pending[key] as Array).append(r)
	var tree := Engine.get_main_loop() as SceneTree
	if tree != null:
		_request(tree, key)
	return r


static func _request(tree: SceneTree, key: String) -> void:
	if _cache.has(key) or key in _queue or DisplayServer.get_name() == "headless":
		return
	_queue.append(key)
	if not _busy:
		_run(tree)


static func _run(tree: SceneTree) -> void:
	_busy = true
	while not _queue.is_empty():
		var key: String = _queue[0]
		var tex: Texture2D = await _render(tree, key)
		_queue.pop_front()
		if tex == null:
			continue
		_cache[key] = tex
		for r in _pending.get(key, []):
			if is_instance_valid(r):
				(r as TextureRect).texture = tex
		_pending.erase(key)
	_busy = false


## Tek silahı ayrı dünyalı, saydam arka planlı SubViewport'ta ortografik yandan çizer
static func _render(tree: SceneTree, key: String) -> Texture2D:
	var model: Node3D
	if key == "knife":
		model = HAND_RIFLE.build_knife_model()
		model.visible = true
	else:
		model = HAND_RIFLE.build_weapon_mesh(key)
	if model == null:
		return null

	var vp := SubViewport.new()
	vp.size = RENDER_SIZE
	vp.own_world_3d = true
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	tree.root.add_child(vp)

	vp.add_child(model)   # tüfek/bıçak uzayı: -Z namlu/ağız, +Y üst

	# CS:GO tarzı düz BEYAZ siluet (kullanıcı isteği): ışıksız beyaz malzeme, ışık/ortam gerekmez
	var white := StandardMaterial3D.new()
	white.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	white.albedo_color = Color.WHITE
	white.cull_mode = BaseMaterial3D.CULL_DISABLED
	for mi: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		mi.material_override = white

	# Çerçeveleme: köşe noktalarından sıkı sınır (modeller kendi içinde eğik → dönmüş mesh AABB'si şişip
	# keskin nişancı/bıçağı küçük gösteriyordu). Büyük mesh'te örnekleyerek.
	var box := AABB()
	var first := true
	for mi: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh == null:
			continue
		var xf := mi.global_transform
		for s in mi.mesh.get_surface_count():
			var verts: PackedVector3Array = mi.mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX]
			var step := maxi(1, verts.size() / 20000)
			for i in range(0, verts.size(), step):
				var p: Vector3 = xf * verts[i]
				if first:
					box = AABB(p, Vector3.ZERO)
					first = false
				else:
					box = box.expand(p)
	if first:
		vp.queue_free()
		return null

	# Kamera +X'ten -X'e bakar → ekranın sağı = dünya -Z = namlu
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	var aspect := float(RENDER_SIZE.x) / float(RENDER_SIZE.y)
	cam.size = maxf(box.size.y, box.size.z / aspect) * 1.08
	var c := box.get_center()
	cam.near = 0.01
	cam.far = box.size.x + 10.0
	vp.add_child(cam)
	cam.global_transform = Transform3D(Basis.looking_at(Vector3.LEFT, Vector3.UP), c + Vector3(box.size.x * 0.5 + 2.0, 0, 0))
	cam.current = true

	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := vp.get_texture().get_image()
	vp.queue_free()
	if img == null or img.is_empty():
		return null
	return ImageTexture.create_from_image(img)
