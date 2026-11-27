## CharacterSelect.gd — Yön B ("Tim Dizilimi" / Squad Lineup)
## 5 operatör tek tam ekran 3D hangarda V-formasyonunda durur (elinde kendi 3D silahıyla).
## Hover/seçili operatöre üst spot ışık ve rim ışığı kilitlenir, kamera yumuşakça ona yaklaşır;
## diğer 4 operatör karanlıkta siluet kalır. Altta "Sis & Cam" v2 köşe braketli brifing paneli
## ve tek sodyum kehribarı PrimaryButton (ONAYLA) bulunur.

extends Control

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const SHARP_VIEWPORT := preload("res://scenes/ui/SharpViewport.gd")
const WEAPON_RENDER := preload("res://scenes/ui/WeaponRender.gd")
const ICONS := preload("res://scenes/ui/IconSet.gd")
const SURVIVALIST := preload("res://scenes/player/SurvivalistModel.tscn")
const UPPER_BODY := preload("res://scenes/player/UpperBodyLayer.gd")
const SPINE_TWIST := preload("res://scenes/player/SpineTwistModifier.gd")
const HAND_RIFLE := preload("res://scenes/player/HandRifle.gd")
const FLOOR_SHADER := preload("res://scenes/ui/MenuFloor.gdshader")
const OVERLAY_SHADER := preload("res://scenes/ui/MenuOverlay.gdshader")
const SHAFT_SHADER := preload("res://scenes/world/LightShaft.gdshader")
const SFX := preload("res://scenes/audio/Sfx.gd")

const CHARACTERS: Array[Dictionary] = [
	{
		"name": "Tank", "role": "Ön Hat", "color": Color(0.92, 0.35, 0.25),
		"weapon": "AĞIR TÜFEK", "power_icon": "bomb", "power": "BOMBA", "power_color": Color(1.0, 0.42, 0.22),
		"stats": {"Can": 150.0, "Hız": 5.5, "Hasar": 17.0, "Menzil": 45.0},
	},
	{
		"name": "Visioner", "role": "Keşif", "color": Color(0.25, 0.58, 1.0),
		"weapon": "KARABİNA", "power_icon": "sat", "power": "TAKIM UYDUSU", "power_color": Color(0.28, 0.85, 1.0),
		"stats": {"Can": 100.0, "Hız": 8.0, "Hasar": 18.0, "Menzil": 35.0},
	},
	{
		"name": "Runner", "role": "Hızlı Sızma", "color": Color(0.85, 0.38, 0.96),
		"weapon": "HAFİF MAKİNELİ", "power_icon": "smoke", "power": "SİS BOMBASI", "power_color": Color(0.72, 0.78, 0.86),
		"stats": {"Can": 75.0, "Hız": 10.0, "Hasar": 13.0, "Menzil": 25.0},
	},
	{
		"name": "Sniper", "role": "Uzun Menzil", "color": Color(0.96, 0.84, 0.18),
		"weapon": "KESKİN NİŞANCI TÜFEĞİ", "power_icon": "flash", "power": "FLAŞ BOMBASI", "power_color": Color(0.85, 0.93, 1.0),
		"stats": {"Can": 80.0, "Hız": 7.0, "Hasar": 120.0, "Menzil": 130.0},
	},
	{
		"name": "Medic", "role": "Destek", "color": Color(0.25, 0.90, 0.38),
		"weapon": "YARI OTOMATİK TÜFEK", "power_icon": "heal", "power": "SAĞLIK", "power_color": Color(0.32, 0.92, 0.50),
		"stats": {"Can": 110.0, "Hız": 7.5, "Hasar": 45.0, "Menzil": 55.0},
	},
]

const STAT_ORDER: Array[String] = ["Can", "Hız", "Hasar", "Menzil"]
# Yükseltilmiş tavanı kapsar (Lv5 +%12.5 Can / +%10 Hasar / +%7.5 Hız → bar tavana yapışmaz)
const STAT_MAX: Dictionary = {"Can": 175.0, "Hız": 11.5, "Hasar": 135.0, "Menzil": 135.0}

# V-formasyonu sahne dizilimi (5 operatör tek hangarda)
const LINEUP_POS: Array[Vector3] = [
	Vector3(-3.3, 0.0, -1.05),
	Vector3(-1.65, 0.0, -0.40),
	Vector3(0.0, 0.0, 0.25),
	Vector3(1.65, 0.0, -0.40),
	Vector3(3.3, 0.0, -1.05),
]
# root'un -Z'si ileri baktığı için PI eklenince 5 operatörün tamamı (silahıyla birlikte) kameraya (+Z) bakar
const LINEUP_YAW: Array[float] = [PI + 0.22, PI + 0.11, PI, PI - 0.11, PI - 0.22]
const CAM_BASE_POS := Vector3(0.0, 2.02, 8.55)
const CAM_BASE_LOOK := Vector3(0.0, 0.96, -0.35)

var _local_selected: String = ""
var _confirmed: bool = false
var _hovered: String = ""
var _team_color: Color = Color.WHITE

# 3D sahne referansları
var _stage_vp: SubViewport = null
var _cam: Camera3D = null
var _cam_look: Vector3 = CAM_BASE_LOOK
var _spot: SpotLight3D = null
var _spot_shaft: MeshInstance3D = null
var _spot_shaft_mat: ShaderMaterial = null
var _spot_dust_mat: StandardMaterial3D = null
## Her eleman: {name, color, root, base_yaw, twist, hand, corr, tag_panel, tag_lbl, sub_lbl, slot_btn}
var _slots: Array[Dictionary] = []

# 2D UI referansları
var _confirm_btn: Button = null
var _status_lbl: Label = null
var _progress: ProgressBar = null
var _roster_row: HBoxContainer = null
var _floating_layer: Control = null

# Alt brifing paneli referansları
var _ins_bar_accent: ColorRect = null
var _ins_name: Label = null
var _ins_role: Label = null
var _ins_sv: Label = null
var _ins_badge: PanelContainer = null
var _ins_badge_lbl: Label = null
var _ins_weapon_wrap: Control = null
var _ins_weapon_lbl: Label = null
var _ins_power_icon_wrap: Control = null
var _ins_power_lbl: Label = null
var _ins_extras_row: HBoxContainer = null
var _stat_rows: Dictionary = {}   # stat_key -> {val_lbl, bonus_lbl, base_fill, bonus_fill}
var _shown_char: String = ""


func _ready() -> void:
	preload("res://scenes/audio/MenuMusic.gd").duck(get_tree())   # menü müziği sürer ama yarı sese kısılır; oyun başlayınca HUD durdurur
	WEAPON_RENDER.prewarm(get_tree())
	NetworkManager.player_list_updated.connect(_refresh)
	_build_ui()
	_pick_initial_focus()
	_refresh()


func _exit_tree() -> void:
	if NetworkManager.player_list_updated.is_connected(_refresh):
		NetworkManager.player_list_updated.disconnect(_refresh)


func _unhandled_key_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	if k.keycode in [KEY_LEFT, KEY_A, KEY_RIGHT, KEY_D] and not _confirmed:
		var dir := -1 if k.keycode in [KEY_LEFT, KEY_A] else 1
		_step_selection(dir)
		get_viewport().set_input_as_handled()
	elif k.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE] and not _confirmed and not _local_selected.is_empty():
		_on_confirm()
		get_viewport().set_input_as_handled()


func _step_selection(dir: int) -> void:
	var taken := _get_team_taken()
	var idx := _char_index(_local_selected if not _local_selected.is_empty() else _shown_char)
	for step in range(1, CHARACTERS.size() + 1):
		var next_i := posmod(idx + dir * step, CHARACTERS.size())
		var nm: String = CHARACTERS[next_i]["name"]
		if not taken.has(nm):
			_on_slot_clicked(nm)
			return


func _pick_initial_focus() -> void:
	var taken := _get_team_taken()
	# Varsayılan başlangıç operatörü: Runner (alınmamışsa)
	if not taken.has("Runner"):
		_local_selected = "Runner"
		return
	for c: Dictionary in CHARACTERS:
		if not taken.has(c["name"]):
			_local_selected = c["name"]
			return
	_local_selected = "Runner"


func _process(delta: float) -> void:
	if _cam == null or _slots.is_empty():
		return
	var active_name := _get_displayed_char()
	var active_idx := maxi(_char_index(active_name), 0)
	var active_pos: Vector3 = LINEUP_POS[active_idx]
	var active_col: Color = CHARACTERS[active_idx]["color"]
	var t := Time.get_ticks_msec() / 1000.0
	var k := 1.0 - exp(-5.5 * delta)

	# Kamera: seçili operatöre yumuşakça kayar, 5 operatörün tamamı kadrajda kalır
	var target_cam := Vector3(active_pos.x * 0.18, CAM_BASE_POS.y - 0.05, CAM_BASE_POS.z - 0.45)
	var target_look := Vector3(active_pos.x * 0.32, CAM_BASE_LOOK.y + 0.04, active_pos.z)
	_cam.position = _cam.position.lerp(target_cam, k)
	_cam_look = _cam_look.lerp(target_look, k)
	_cam.look_at(_cam_look, Vector3.UP)

	# Tek yukarıdan dar spot ışık + görünür ışık huzmesi + süzülen toz zerrecikleri
	if _spot != null:
		var sp_target := Vector3(active_pos.x, 5.4, active_pos.z + 0.35)
		_spot.position = _spot.position.lerp(sp_target, k)
		_spot.look_at(active_pos + Vector3(0.0, 0.85, 0.0), Vector3.UP)
		var want_col := active_col.lerp(Color.WHITE, 0.20)
		_spot.light_color = _spot.light_color.lerp(want_col, k)
		_spot.light_energy = lerpf(_spot.light_energy, 26.0 if _confirmed else 20.0, k)
		if _spot_shaft != null and _spot_shaft_mat != null:
			_spot_shaft.position = Vector3(_spot.position.x, 2.7, _spot.position.z - 0.12)
			_spot_shaft_mat.set_shader_parameter("color", _spot.light_color)
			_spot_shaft_mat.set_shader_parameter("intensity", 0.19 if _confirmed else 0.14)
		if _spot_dust_mat != null:
			_spot_dust_mat.albedo_color = Color(_spot.light_color, 0.72)

	# Operatör hafif dönüşü + 3D baş-üstü yüzen etiket projeksiyonu
	var vp_size := get_viewport_rect().size
	var sub_size := Vector2(_stage_vp.size) if _stage_vp else vp_size
	var scale_xy := Vector2(vp_size.x / maxf(sub_size.x, 1.0), vp_size.y / maxf(sub_size.y, 1.0))

	for i in _slots.size():
		var sl: Dictionary = _slots[i]
		var root: Node3D = sl["root"]
		var is_act: bool = (sl["name"] == active_name)
		var want_yaw: float = float(sl["base_yaw"]) + (sin(t * 1.05) * 0.16 if is_act else 0.0)
		root.rotation.y = lerp_angle(root.rotation.y, want_yaw, k)
		var want_scale := 1.04 if is_act else 0.96
		var cur_s := lerpf(root.scale.x, want_scale, k)
		root.scale = Vector3.ONE * cur_s

		# Mixamo AimIdle sapmasını düzelt → gövde ve tüfek doğrudan kameraya baksın (MenuBackground3D ile aynı)
		var hand: Node = sl["hand"]
		var twist: Node = sl["twist"]
		if hand != null and twist != null:
			if hand.aim_valid:
				sl["corr"] = clampf(float(sl["corr"]) - float(hand.aim_error) * minf(10.0 * delta, 1.0), -1.4, 1.4)
			twist.twist = float(sl["corr"])

		# Baş üstü etiketi 3D konumdan 2D'ye hizala
		var tag: Control = sl["tag_panel"]
		var head_world: Vector3 = LINEUP_POS[i] + Vector3(0.0, 2.22, 0.0)
		var screen_p := _cam.unproject_position(head_world) * scale_xy
		tag.position = Vector2(screen_p.x - tag.size.x * 0.5, screen_p.y - tag.size.y)


# ─────────────────────────────────────────────
#  Sahne & UI Kurulumu
# ─────────────────────────────────────────────

func _build_ui() -> void:
	var local_data: Dictionary = NetworkManager.players.get(NetworkManager.get_local_id(), {})
	var team_id: int = local_data.get("team_id", -1)
	_team_color = TeamManager.get_color(team_id)

	# 1) Tek tam ekran 3D Sahne (SharpViewport — 5 ayrı SubViewport yerine 1× render pass)
	_build_3d_stage()

	# 2) Süzülen duman + vinyet (MenuOverlay.gdshader — "Sis & Cam" kimliği)
	var smoke := ColorRect.new()
	smoke.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	smoke.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sm := ShaderMaterial.new()
	sm.shader = OVERLAY_SHADER
	sm.set_shader_parameter("fog_strength", 0.24)
	sm.set_shader_parameter("dim_amount", 0.0)
	sm.set_shader_parameter("vignette_strength", 0.58)
	smoke.material = sm
	add_child(smoke)

	# 3) 3D Operatörler için tıklanabilir sütunlar + baş-üstü yüzen etiket katmanı
	_build_interactive_stage_overlay()

	# 4) 2D HUD (Üst Şerit + Sol-Üst Kadro + Alt Brifing Paneli)
	var hud := Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hud)

	hud.add_child(_build_top_bar(team_id))
	hud.add_child(_build_roster_strip())
	hud.add_child(_build_bottom_briefing())


func _build_3d_stage() -> void:
	var sv: TextureRect = SHARP_VIEWPORT.new()
	sv.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(sv)

	_stage_vp = sv.viewport
	_stage_vp.own_world_3d = true
	_stage_vp.msaa_3d = Viewport.MSAA_2X
	_stage_vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	_stage_vp.scaling_3d_scale = 0.85

	# Ortam: karanlık taktik hangar (ACES + ucuz glow seviyeleri)
	var env_node := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = UITheme.BG
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.32, 0.38, 0.50)
	env.ambient_light_energy = 0.16
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.glow_enabled = true
	env.glow_intensity = 0.45
	env.set_glow_level(0, 0.0)
	env_node.environment = env
	_stage_vp.add_child(env_node)

	# Zemin: MenuFloor.gdshader taktik ızgara
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(70.0, 44.0)
	floor_mesh.mesh = pm
	var fm := ShaderMaterial.new()
	fm.shader = FLOOR_SHADER
	floor_mesh.material_override = fm
	_stage_vp.add_child(floor_mesh)

	# Kamera
	_cam = Camera3D.new()
	_cam.fov = 34.0
	_cam.position = CAM_BASE_POS
	_stage_vp.add_child(_cam)
	_cam.look_at(CAM_BASE_LOOK, Vector3.UP)

	# Hafif genel ay ışığı (pasif 4 operatör siluet olarak seçilsin)
	var fill_dir := DirectionalLight3D.new()
	fill_dir.rotation_degrees = Vector3(-42.0, 22.0, 0.0)
	fill_dir.light_color = Color(0.68, 0.78, 0.96)
	fill_dir.light_energy = 0.28
	fill_dir.shadow_enabled = false
	_stage_vp.add_child(fill_dir)

	# Tek yukarıdan dar odak spot ışığı (11.5° koni — sadece o karakteri aydınlatır, komşuya taşmaz)
	_spot = SpotLight3D.new()
	_spot.position = Vector3(0.0, 5.4, 0.6)
	_spot.light_color = Color.WHITE
	_spot.light_energy = 20.0
	_spot.spot_range = 9.5
	_spot.spot_angle = 11.5
	_spot.spot_angle_attenuation = 1.8
	_spot.spot_attenuation = 0.8
	_spot.shadow_enabled = true
	_stage_vp.add_child(_spot)

	# Yukarıdan inen görünür ışık huzmesi konisi (LightShaft.gdshader — tepeden fenerle tutulduğu belli olsun)
	_spot_shaft = MeshInstance3D.new()
	var sm := CylinderMesh.new()
	sm.top_radius = 0.14
	sm.bottom_radius = 1.05
	sm.height = 5.4
	sm.radial_segments = 32
	sm.cap_top = false
	sm.cap_bottom = false
	_spot_shaft.mesh = sm
	_spot_shaft.position = Vector3(0.0, 2.7, 0.48)
	_spot_shaft.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_spot_shaft_mat = ShaderMaterial.new()
	_spot_shaft_mat.shader = SHAFT_SHADER
	_spot_shaft_mat.set_shader_parameter("color", Color.WHITE)
	_spot_shaft_mat.set_shader_parameter("intensity", 0.14)
	_spot_shaft.material_override = _spot_shaft_mat
	_stage_vp.add_child(_spot_shaft)

	# Işık huzmesinin içinde süzülen toz zerrecikleri (fenerle birlikte kayar, ışık renginde parıldar)
	var dust := CPUParticles3D.new()
	dust.amount = 92
	dust.lifetime = 3.8
	dust.preprocess = 2.0
	dust.local_coords = true
	dust.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	dust.emission_box_extents = Vector3(0.55, 2.0, 0.55)
	dust.direction = Vector3(0.3, 0.25, 0.0)
	dust.spread = 180.0
	dust.gravity = Vector3(0.0, 0.035, 0.0)
	dust.initial_velocity_min = 0.04
	dust.initial_velocity_max = 0.14
	dust.scale_amount_min = 0.55
	dust.scale_amount_max = 1.35
	var dgrad := Gradient.new()
	dgrad.set_color(0, Color(1, 1, 1, 0.0))
	dgrad.set_color(1, Color(1, 1, 1, 0.0))
	dgrad.add_point(0.25, Color(1, 1, 1, 0.85))
	dgrad.add_point(0.75, Color(1, 1, 1, 0.70))
	dust.color_ramp = dgrad
	var dtex := GradientTexture2D.new()
	var dtex_g := Gradient.new()
	dtex_g.set_color(0, Color(1, 1, 1, 1.0))
	dtex_g.set_color(1, Color(1, 1, 1, 0.0))
	dtex.gradient = dtex_g
	dtex.fill = GradientTexture2D.FILL_RADIAL
	dtex.fill_from = Vector2(0.5, 0.5)
	dtex.fill_to = Vector2(1.0, 0.5)
	dtex.width = 16
	dtex.height = 16
	_spot_dust_mat = StandardMaterial3D.new()
	_spot_dust_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_spot_dust_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_spot_dust_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_spot_dust_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	_spot_dust_mat.vertex_color_use_as_albedo = true
	_spot_dust_mat.albedo_texture = dtex
	_spot_dust_mat.albedo_color = Color(1, 1, 1, 0.72)
	var dmesh := QuadMesh.new()
	dmesh.size = Vector2(0.017, 0.017)
	dmesh.material = _spot_dust_mat
	dust.mesh = dmesh
	_spot_shaft.add_child(dust)

	# 5 operatörü V-formasyonunda sahneye diz
	var is_knife := NetworkManager.get_weapon_mode() == "knife"
	for i in CHARACTERS.size():
		var c: Dictionary = CHARACTERS[i]
		var char_name: String = c["name"]
		var char_col: Color = c["color"]

		var root := Node3D.new()
		root.position = LINEUP_POS[i]
		root.rotation.y = LINEUP_YAW[i]
		_stage_vp.add_child(root)

		var model: Node3D = SURVIVALIST.instantiate()
		model.transform = Transform3D(Basis(Vector3.UP, PI), Vector3.ZERO)  # +Z → -Z (kameraya dönük)
		root.add_child(model)
		model.apply_outfit(char_name)

		# Üst gövde + eldeki 3D silah (MenuBackground3D ile aynı modifier zinciri)
		var twist_ref: Node = null
		var hand_ref: Node = null
		var sks := model.find_children("*", "Skeleton3D", true, false)
		var aps := model.find_children("*", "AnimationPlayer", true, false)
		if not sks.is_empty() and not aps.is_empty():
			var sk: Skeleton3D = sks[0]
			var ap: AnimationPlayer = aps[0]
			var upper: Node = UPPER_BODY.new()
			sk.add_child(upper)
			var twist: Node = SPINE_TWIST.new()
			sk.add_child(twist)
			twist_ref = twist
			var rifle: Node3D = HAND_RIFLE.build_weapon_mesh(char_name)
			sk.add_child(rifle)
			var hand: Node = HAND_RIFLE.new()
			hand.rifle = rifle
			hand.aim_node = root
			sk.add_child(hand)
			hand_ref = hand
			if is_knife and hand.has_method("show_knife"):
				hand.show_knife(9999.0)
			if ap.has_animation(&"AimIdle"):
				upper.set_base(ap.get_animation(&"AimIdle"))
			if ap.has_animation(&"Idle"):
				ap.play(&"Idle")
				ap.seek(float(i) * 0.45, true)  # 5 asker aynı anda senkron nefes almasın

		_slots.append({
			"name": char_name,
			"color": char_col,
			"root": root,
			"base_yaw": LINEUP_YAW[i],
			"twist": twist_ref,
			"hand": hand_ref,
			"corr": 0.0,
			"tag_panel": null,
			"tag_lbl": null,
			"sub_lbl": null,
			"slot_btn": null,
		})


func _build_interactive_stage_overlay() -> void:
	# 5 şeffaf tıklanabilir sütun (üst şerit ile alt brifing arasında)
	var click_row := HBoxContainer.new()
	click_row.anchor_left = 0.06
	click_row.anchor_right = 0.94
	click_row.anchor_top = 0.10
	click_row.anchor_bottom = 0.72
	click_row.add_theme_constant_override("separation", 8)
	add_child(click_row)

	# Yüzen baş-üstü etiket katmanı
	_floating_layer = Control.new()
	_floating_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_floating_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_floating_layer)

	for i in _slots.size():
		var sl: Dictionary = _slots[i]
		var char_name: String = sl["name"]

		var hit := Control.new()
		hit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hit.size_flags_vertical = Control.SIZE_EXPAND_FILL
		hit.mouse_filter = Control.MOUSE_FILTER_STOP
		hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		hit.mouse_entered.connect(_on_slot_hover.bind(char_name, true))
		hit.mouse_exited.connect(_on_slot_hover.bind(char_name, false))
		hit.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				if _get_team_taken().has(char_name) and not _is_mine(char_name):
					SFX.play_ui(get_tree(), "unlock_reset", -10.0)
					return
				_on_slot_clicked(char_name)
				if ev.double_click:
					_on_confirm())
		click_row.add_child(hit)
		sl["slot_btn"] = hit

		# Baş-üstü kompakt cam künye
		var tag := PanelContainer.new()
		tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tag.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.SURFACE, 0.72), UITheme.RADIUS, UITheme.BORDER, 1, 14, 6))
		var tb := VBoxContainer.new()
		tb.add_theme_constant_override("separation", 1)
		tag.add_child(tb)
		var tlbl := UITheme.label(UITheme.upper_tr(char_name), 17, UITheme.TEXT, UITheme.font_bold)
		tlbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tb.add_child(tlbl)
		var slbl := UITheme.label("", 13, UITheme.TEXT_DIM, UITheme.font_mono)
		slbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		slbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		tb.add_child(slbl)
		_floating_layer.add_child(tag)
		sl["tag_panel"] = tag
		sl["tag_lbl"] = tlbl
		sl["sub_lbl"] = slbl


func _build_top_bar(team_id: int) -> Control:
	var bar := PanelContainer.new()
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = 74
	bar.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.BG, 0.72), 0, Color(1, 1, 1, 0.10), 0, 36, 14))
	var st := bar.get_theme_stylebox("panel") as StyleBoxFlat
	st.border_width_bottom = 1

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	bar.add_child(row)

	# Sol: Takım / Deathmatch rozeti
	var badge := PanelContainer.new()
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var is_dm := NetworkManager.is_deathmatch()
	var bcol := UITheme.ACCENT if is_dm else _team_color
	badge.add_theme_stylebox_override("panel", UITheme.style(Color(bcol, 0.14), UITheme.RADIUS, Color(bcol, 0.45), 1, 16, 7))
	var blbl := UITheme.label(
		"DEATHMATCH  ·  HERKES TEK" if is_dm else tr("%s TAKIM") % UITheme.team_tag(team_id),
		18, bcol, UITheme.font_caps)
	badge.add_child(blbl)
	row.add_child(badge)

	var map_lbl := UITheme.label(UITheme.upper_tr(String(NetworkManager.get_map_info().get("name", ""))), 16, UITheme.TEXT_DIM, UITheme.font_caps)
	map_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(map_lbl)

	# Orta başlık
	var title := UITheme.label("OPERATÖR SEÇİMİ", 24, UITheme.TEXT, UITheme.font_title)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(title)

	# Sağ: Hazır sayacı + ince bar
	var right := HBoxContainer.new()
	right.add_theme_constant_override("separation", 14)
	right.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(right)

	_status_lbl = UITheme.label("0 / 0 OYUNCU HAZIR", 16, UITheme.TEXT_DIM, UITheme.font_mono)
	_status_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	right.add_child(_status_lbl)

	_progress = ProgressBar.new()
	_progress.min_value = 0.0
	_progress.max_value = 1.0
	_progress.show_percentage = false
	_progress.custom_minimum_size = Vector2(160, 8)
	_progress.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_progress.add_theme_stylebox_override("background", UITheme.style(Color(1, 1, 1, 0.08), 3, Color.TRANSPARENT, 0, 0, 0))
	_progress.add_theme_stylebox_override("fill", UITheme.style(UITheme.TEXT, 3, Color.TRANSPARENT, 0, 0, 0))
	right.add_child(_progress)
	return bar


func _build_roster_strip() -> Control:
	var wrap := CenterContainer.new()
	wrap.set_anchors_preset(Control.PRESET_TOP_WIDE)
	wrap.offset_top = 84
	wrap.offset_bottom = 132
	wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_roster_row = HBoxContainer.new()
	_roster_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_roster_row.add_theme_constant_override("separation", 12)
	_roster_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.add_child(_roster_row)
	return wrap


func _build_bottom_briefing() -> Control:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	margin.offset_top = -268
	margin.offset_bottom = 0
	margin.add_theme_constant_override("margin_left", 52)
	margin.add_theme_constant_override("margin_right", 52)
	margin.add_theme_constant_override("margin_bottom", 30)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.SURFACE, 0.76), UITheme.RADIUS, UITheme.BORDER, 1, 28, 22))
	UITheme.add_brackets(panel, UITheme.FRAME, 18.0, 2.0, -5.0)
	margin.add_child(panel)

	var main_row := HBoxContainer.new()
	main_row.add_theme_constant_override("separation", 28)
	panel.add_child(main_row)

	# ── 1) Sol: Operatör Kimliği + Başlangıç Gücü ──
	var id_col := VBoxContainer.new()
	id_col.custom_minimum_size = Vector2(310, 0)
	id_col.add_theme_constant_override("separation", 10)
	main_row.add_child(id_col)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 12)
	id_col.add_child(name_row)

	_ins_bar_accent = ColorRect.new()
	_ins_bar_accent.custom_minimum_size = Vector2(5, 44)
	_ins_bar_accent.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	name_row.add_child(_ins_bar_accent)

	var name_vbox := VBoxContainer.new()
	name_vbox.add_theme_constant_override("separation", 2)
	name_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_row.add_child(name_vbox)

	_ins_name = UITheme.label("", 32, UITheme.TEXT, UITheme.font_bold)
	name_vbox.add_child(_ins_name)
	_ins_role = UITheme.label("", 15, UITheme.TEXT_DIM, UITheme.font_caps)
	name_vbox.add_child(_ins_role)

	_ins_sv = UITheme.label("SV 0", 18, UITheme.ACCENT, UITheme.font_mono)
	_ins_sv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	name_row.add_child(_ins_sv)

	# Başlangıç gücü çipi
	var pow_box := PanelContainer.new()
	pow_box.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.045), UITheme.RADIUS, Color(1, 1, 1, 0.12), 1, 14, 10))
	var pow_row := HBoxContainer.new()
	pow_row.add_theme_constant_override("separation", 12)
	pow_box.add_child(pow_row)
	_ins_power_icon_wrap = CenterContainer.new()
	_ins_power_icon_wrap.custom_minimum_size = Vector2(28, 28)
	pow_row.add_child(_ins_power_icon_wrap)
	var pow_txt := VBoxContainer.new()
	pow_txt.add_theme_constant_override("separation", 1)
	pow_txt.add_child(UITheme.label("BAŞLANGIÇ GÜCÜ", 12, UITheme.TEXT_DIM, UITheme.font_caps))
	_ins_power_lbl = UITheme.label("", 17, UITheme.TEXT, UITheme.font_bold)
	pow_txt.add_child(_ins_power_lbl)
	pow_row.add_child(pow_txt)
	id_col.add_child(pow_box)

	# Alınmış / Önizleme durum rozeti
	_ins_badge = PanelContainer.new()
	_ins_badge.visible = false
	_ins_badge.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.DANGER, 0.18), UITheme.RADIUS, Color(UITheme.DANGER, 0.5), 1, 12, 5))
	_ins_badge_lbl = UITheme.label("", 14, UITheme.DANGER, UITheme.font_caps)
	_ins_badge_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_ins_badge.add_child(_ins_badge_lbl)
	id_col.add_child(_ins_badge)

	main_row.add_child(_vsep())

	# ── 2) Orta-Sol: Silah Vitrini ──
	var weap_col := VBoxContainer.new()
	weap_col.custom_minimum_size = Vector2(310, 0)
	weap_col.alignment = BoxContainer.ALIGNMENT_CENTER
	weap_col.add_theme_constant_override("separation", 8)
	main_row.add_child(weap_col)

	weap_col.add_child(UITheme.label("BİRİNCİL SİLAH", 13, UITheme.TEXT_DIM, UITheme.font_caps))
	var weap_frame := PanelContainer.new()
	weap_frame.custom_minimum_size = Vector2(300, 96)
	weap_frame.add_theme_stylebox_override("panel", UITheme.style(Color(0, 0, 0, 0.34), UITheme.RADIUS, Color(1, 1, 1, 0.10), 1, 10, 8))
	_ins_weapon_wrap = CenterContainer.new()
	_ins_weapon_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ins_weapon_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	weap_frame.add_child(_ins_weapon_wrap)
	weap_col.add_child(weap_frame)

	_ins_weapon_lbl = UITheme.label("", 16, UITheme.TEXT, UITheme.font_caps)
	_ins_weapon_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	weap_col.add_child(_ins_weapon_lbl)

	main_row.add_child(_vsep())

	# ── 3) Orta-Sağ: 4 Stat Barı + Profil Bonus Çipleri ──
	var stat_col := VBoxContainer.new()
	stat_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stat_col.alignment = BoxContainer.ALIGNMENT_CENTER
	stat_col.add_theme_constant_override("separation", 10)
	main_row.add_child(stat_col)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 24)
	grid.add_theme_constant_override("v_separation", 14)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stat_col.add_child(grid)

	for key: String in STAT_ORDER:
		var cell := VBoxContainer.new()
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.add_theme_constant_override("separation", 5)
		var top := HBoxContainer.new()
		var klbl := UITheme.label(UITheme.upper_tr(key), 14, UITheme.TEXT_DIM, UITheme.font_caps)
		klbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(klbl)
		var vlbl := UITheme.label("", 16, UITheme.TEXT, UITheme.font_mono)
		top.add_child(vlbl)
		var blbl := UITheme.label("", 13, UITheme.SIGNAL, UITheme.font_mono)
		top.add_child(blbl)
		cell.add_child(top)

		var track := Control.new()
		track.custom_minimum_size = Vector2(0, 8)
		track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var bg_rect := ColorRect.new()
		bg_rect.color = Color(1, 1, 1, 0.09)
		bg_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		track.add_child(bg_rect)
		var base_fill := ColorRect.new()
		base_fill.color = Color(1, 1, 1, 0.45)
		base_fill.anchor_bottom = 1.0
		track.add_child(base_fill)
		var bonus_fill := ColorRect.new()
		bonus_fill.color = UITheme.TEXT
		bonus_fill.anchor_bottom = 1.0
		track.add_child(bonus_fill)
		cell.add_child(track)

		grid.add_child(cell)
		_stat_rows[key] = {"val": vlbl, "bonus": blbl, "base": base_fill, "ext": bonus_fill}

	_ins_extras_row = HBoxContainer.new()
	_ins_extras_row.add_theme_constant_override("separation", 10)
	stat_col.add_child(_ins_extras_row)

	main_row.add_child(_vsep())

	# ── 4) Sağ: Tek Kehribar PrimaryButton (ONAYLA) + Kısa İpucu ──
	var act_col := VBoxContainer.new()
	act_col.custom_minimum_size = Vector2(300, 0)
	act_col.alignment = BoxContainer.ALIGNMENT_CENTER
	act_col.add_theme_constant_override("separation", 12)
	main_row.add_child(act_col)

	_confirm_btn = Button.new()
	_confirm_btn.text = "ONAYLA"
	_confirm_btn.theme_type_variation = "PrimaryButton"
	_confirm_btn.custom_minimum_size = Vector2(290, 68)
	_confirm_btn.add_theme_font_size_override("font_size", 22)
	_confirm_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_confirm_btn.pressed.connect(_on_confirm)
	act_col.add_child(_confirm_btn)

	var hint := UITheme.label("Operatöre tıkla · Çift tık / Enter onayla", 14, UITheme.TEXT_DIM)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	act_col.add_child(hint)

	return margin


func _vsep() -> ColorRect:
	var s := ColorRect.new()
	s.custom_minimum_size = Vector2(1, 0)
	s.color = Color(1, 1, 1, 0.11)
	s.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return s


# ─────────────────────────────────────────────
#  Etkileşim
# ─────────────────────────────────────────────

func _on_slot_hover(char_name: String, entered: bool) -> void:
	if entered:
		# Kilitli/alınmış karaktere veya onay sonrası hover odaklanmasın
		if _confirmed or (_get_team_taken().has(char_name) and not _is_mine(char_name)):
			return
		_hovered = char_name
		# Fare hangi boş operatörün üzerindeyse seçim + brifing + ONAYLA butonu anında onunla eşleşir
		_local_selected = char_name
	elif _hovered == char_name:
		_hovered = ""
	_update_visuals()


func _on_slot_clicked(char_name: String) -> void:
	if _confirmed or _get_team_taken().has(char_name):
		return
	if _local_selected != char_name:
		SFX.play_ui(get_tree(), "ui_click", -10.0)
	_local_selected = char_name
	_update_visuals()


func _on_confirm() -> void:
	if _local_selected.is_empty() or _confirmed:
		return
	if _get_team_taken().has(_local_selected) and not _is_mine(_local_selected):
		SFX.play_ui(get_tree(), "unlock_reset", -10.0)
		return
	_confirmed = true
	_hovered = ""
	_confirm_btn.text = "BEKLENİYOR..."
	_update_visuals()
	NetworkManager.request_select_character(_local_selected)


# ─────────────────────────────────────────────
#  Durum Güncelleme
# ─────────────────────────────────────────────

func _refresh() -> void:
	if _slots.is_empty():
		return

	# Yarış durumu koruması: seçili (veya onaylanan) karakteri bir takım arkadaşı aldıysa hemen boşa çıkar
	var taken := _get_team_taken()
	var my_char: String = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("character", "")
	if not _hovered.is_empty() and taken.has(_hovered) and my_char != _hovered:
		_hovered = ""
	if not _local_selected.is_empty() and taken.has(_local_selected) and my_char != _local_selected:
		if _confirmed and my_char.is_empty():
			_confirmed = false
			SFX.play_ui(get_tree(), "unlock_reset", -8.0)
		_local_selected = ""
		_pick_initial_focus()

	# Botlar karakter seçmez (host maç başında otomatik atar) → sayaca girmez
	var selected_count := 0
	var total := 0
	for pid: int in NetworkManager.players:
		if NetworkManager.is_bot(pid):
			continue
		total += 1
		if not String(NetworkManager.players[pid].get("character", "")).is_empty():
			selected_count += 1

	_status_lbl.text = tr("%d / %d OYUNCU HAZIR") % [selected_count, total]
	_progress.value = float(selected_count) / float(maxi(total, 1))
	_refresh_roster()
	_update_visuals()


## Takım içinde alınan karakterler: karakter adı → oyuncu adı (Deathmatch'te kilit yok)
func _get_team_taken() -> Dictionary:
	if NetworkManager.is_deathmatch():
		return {}
	var local_team: int = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("team_id", -1)
	var taken: Dictionary = {}
	for pid: int in NetworkManager.players:
		var pdata: Dictionary = NetworkManager.players[pid]
		if pdata.get("team_id", -1) != local_team or NetworkManager.is_bot(pid):
			continue
		var ch: String = pdata.get("character", "")
		if not ch.is_empty():
			taken[ch] = pdata.get("name", "???")
	return taken


func _is_mine(char_name: String) -> bool:
	var my_char: String = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("character", "")
	return my_char == char_name


func _get_displayed_char() -> String:
	# Fare bir operatörün üzerindeyse tıklamadan anında önizle (kamera, spot ışık, alt brifing)
	if not _hovered.is_empty():
		return _hovered
	if not _local_selected.is_empty():
		return _local_selected
	return "Runner"


func _refresh_roster() -> void:
	for child in _roster_row.get_children():
		child.queue_free()
	if NetworkManager.is_deathmatch():
		_roster_row.visible = false
		return
	_roster_row.visible = true

	var local_id := NetworkManager.get_local_id()
	var local_team: int = NetworkManager.players.get(local_id, {}).get("team_id", -1)
	for pid: int in NetworkManager.players:
		var pdata: Dictionary = NetworkManager.players[pid]
		if pdata.get("team_id", -1) != local_team:
			continue
		var ch: String = pdata.get("character", "")
		var ch_color := _get_char_color(ch)

		var chip := PanelContainer.new()
		var st := UITheme.style(Color(UITheme.SURFACE, 0.72), UITheme.RADIUS, Color(1, 1, 1, 0.14), 1, 16, 7)
		st.border_width_left = 4
		st.border_color = ch_color if not ch.is_empty() else Color(1, 1, 1, 0.18)
		chip.add_theme_stylebox_override("panel", st)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		chip.add_child(row)

		var pname: String = pdata.get("name", "???")
		if pid == local_id:
			pname = tr("%s (Sen)") % pname
		var pname_lbl := UITheme.label(pname, 16, UITheme.TEXT)
		pname_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		row.add_child(pname_lbl)

		if NetworkManager.is_bot(pid):
			row.add_child(UITheme.label("BOT · otomatik", 14, UITheme.TEXT_DIM, UITheme.font_caps))
		elif ch.is_empty():
			row.add_child(UITheme.label("seçiyor…", 14, UITheme.TEXT_DIM))
		else:
			row.add_child(UITheme.label(UITheme.upper_tr(ch), 14, ch_color, UITheme.font_caps))
			var lv := 0
			var ups: Dictionary = pdata.get("upgrades", {})
			for s: String in ups:
				lv += int(ups[s])
			row.add_child(UITheme.label(tr("SV %d") % lv, 14, UITheme.ACCENT if lv > 0 else UITheme.TEXT_DIM, UITheme.font_mono))
		_roster_row.add_child(chip)


func _update_visuals() -> void:
	var taken := _get_team_taken()
	var my_char: String = NetworkManager.players.get(NetworkManager.get_local_id(), {}).get("character", "")
	var active_name := _get_displayed_char()

	for sl: Dictionary in _slots:
		var nm: String = sl["name"]
		var tag: PanelContainer = sl["tag_panel"]
		var tlbl: Label = sl["tag_lbl"]
		var slbl: Label = sl["sub_lbl"]
		var btn: Control = sl["slot_btn"]

		var is_mine := (my_char == nm)
		var is_sel := (_local_selected == nm)
		var is_taken_other := (taken.has(nm) and not is_mine)
		var is_act := (nm == active_name)
		var is_hov := (_hovered == nm and not is_taken_other and not _confirmed)
		var lv := PROFILE.upgrade_count(nm)

		# Yüzen baş-üstü künye
		var border := Color(1, 1, 1, 0.80) if (is_sel or is_mine) else (Color(UITheme.DANGER, 0.55) if is_taken_other else (Color(1, 1, 1, 0.45) if is_hov else Color(1, 1, 1, 0.14)))
		var bg := Color(UITheme.SURFACE_2, 0.88) if (is_act or is_hov) else Color(UITheme.SURFACE, 0.55)
		tag.add_theme_stylebox_override("panel", UITheme.style(bg, UITheme.RADIUS, border, 1, 14, 5))
		tag.modulate.a = 0.50 if is_taken_other else (1.0 if (is_act or is_hov or is_mine) else 0.72)
		tlbl.add_theme_color_override("font_color", UITheme.TEXT if (is_act or is_hov or is_mine) else UITheme.TEXT_DIM)

		if is_mine:
			slbl.text = "✓  " + tr("KİLİTLENDİ")
			slbl.add_theme_color_override("font_color", UITheme.SIGNAL)
		elif is_taken_other:
			slbl.text = tr("ALINDI") + " · " + UITheme.upper_tr(String(taken[nm]))
			slbl.add_theme_color_override("font_color", UITheme.DANGER)
		elif is_sel and not _confirmed:
			slbl.text = "●  " + tr("SEÇİLİ") + " · " + (tr("SV %d") % lv)
			slbl.add_theme_color_override("font_color", UITheme.TEXT)
		else:
			slbl.text = tr("SV %d") % lv
			slbl.add_theme_color_override("font_color", UITheme.ACCENT if lv > 0 else UITheme.TEXT_DIM)

		btn.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if is_taken_other else (Control.CURSOR_ARROW if _confirmed else Control.CURSOR_POINTING_HAND)

	# Alt brifing panelini aktif operatörle güncelle
	_update_briefing(active_name, taken, my_char)

	# Onay butonu (PrimaryButton — sodyum kehribarı çerçeve)
	if _confirmed:
		_confirm_btn.disabled = true
		_confirm_btn.text = ("✓  " + tr("KİLİTLENDİ")) if not my_char.is_empty() else "BEKLENİYOR..."
	else:
		var can_ok := not _local_selected.is_empty() and not (taken.has(_local_selected) and not _is_mine(_local_selected))
		_confirm_btn.disabled = not can_ok
		_confirm_btn.text = "ONAYLA" if not can_ok else tr("%s İLE ONAYLA") % UITheme.upper_tr(_local_selected)


func _update_briefing(char_name: String, taken: Dictionary, my_char: String) -> void:
	var c := _get_char_dict(char_name)
	if c.is_empty():
		return
	var col: Color = c["color"]
	var lv := PROFILE.upgrade_count(char_name)
	var levels := PROFILE.get_levels(char_name)
	var mults := PROFILE.multipliers(levels)
	var is_knife := NetworkManager.get_weapon_mode() == "knife"
	var powers_on := NetworkManager.powers_enabled()

	_ins_bar_accent.color = col
	_ins_name.text = UITheme.upper_tr(char_name)
	_ins_role.text = UITheme.upper_tr(tr(String(c["role"])))
	_ins_sv.text = tr("SV %d") % lv + " / %d" % (PROFILE.STATS.size() * PROFILE.MAX_LEVEL)

	# Alınmış rozeti (hover artık doğrudan _local_selected'ı güncellediği için önizleme çelişkisi yok)
	var is_taken_other := taken.has(char_name) and my_char != char_name
	if is_taken_other:
		_ins_badge.visible = true
		_ins_badge.add_theme_stylebox_override("panel", UITheme.style(Color(UITheme.DANGER, 0.18), UITheme.RADIUS, Color(UITheme.DANGER, 0.5), 1, 12, 5))
		_ins_badge_lbl.add_theme_color_override("font_color", UITheme.DANGER)
		_ins_badge_lbl.text = tr("%s TARAFINDAN ALINDI") % UITheme.upper_tr(String(taken[char_name]))
	else:
		_ins_badge.visible = false

	# Silah ve Güç sadece karakter değiştiğinde yeniden kurulur
	if _shown_char != char_name:
		_shown_char = char_name
		for ch in _ins_weapon_wrap.get_children():
			ch.queue_free()
		var wkey := "knife" if is_knife else char_name
		var wrect: TextureRect = WEAPON_RENDER.make_rect(wkey, Vector2(276, 76))
		_ins_weapon_wrap.add_child(wrect)
		_ins_weapon_lbl.text = tr("BIÇAK") if is_knife else tr(String(c["weapon"]))

		for ch in _ins_power_icon_wrap.get_children():
			ch.queue_free()
		var picon_id := "knife" if is_knife else String(c["power_icon"])
		var pcol: Color = UITheme.TEXT_DIM if (not powers_on and not is_knife) else Color(c["power_color"])
		_ins_power_icon_wrap.add_child(ICONS.make(picon_id, 24, pcol))
		if is_knife:
			_ins_power_lbl.text = tr("YAKIN DÖVÜŞ")
		elif not powers_on:
			_ins_power_lbl.text = tr("GÜÇLER KAPALI")
		else:
			_ins_power_lbl.text = tr(String(c["power"]))

	# 4 Stat barı (taban + profil yükseltme bonusu ayrı segment)
	var base_stats: Dictionary = c["stats"]
	var mult_key := {"Can": "health", "Hız": "speed", "Hasar": "damage"}
	for key: String in STAT_ORDER:
		var base_v := float(base_stats[key])
		var cur_v := base_v
		var bonus_txt := ""
		if mult_key.has(key):
			var mk: String = mult_key[key]
			var m := float(mults[mk])
			cur_v = base_v * m
			var lv_s := int(levels.get(mk, 0))
			if lv_s > 0:
				bonus_txt = "  (+%%%d)" % PROFILE.stat_percent(mk, lv_s)
		var max_v := float(STAT_MAX[key])
		var base_r := clampf(base_v / max_v, 0.0, 1.0)
		var cur_r := clampf(cur_v / max_v, base_r, 1.0)

		var row: Dictionary = _stat_rows[key]
		(row["val"] as Label).text = ("%.1f" % cur_v) if key == "Hız" else str(int(round(cur_v)))
		(row["bonus"] as Label).text = bonus_txt
		var bf: ColorRect = row["base"]
		bf.anchor_left = 0.0
		bf.anchor_right = base_r
		var ef: ColorRect = row["ext"]
		ef.anchor_left = base_r
		ef.anchor_right = cur_r

	# Ek profil bonus çipleri (Silah & Dayanıklılık)
	for ch in _ins_extras_row.get_children():
		ch.queue_free()
	for extra_stat: Array in [["weapon", "SİLAH"], ["stamina", "DAYANIKLILIK"]]:
		var skey: String = extra_stat[0]
		var elv := int(levels.get(skey, 0))
		if elv > 0:
			var pill := PanelContainer.new()
			pill.add_theme_stylebox_override("panel", UITheme.style(Color(1, 1, 1, 0.06), UITheme.RADIUS, Color(1, 1, 1, 0.14), 1, 10, 3))
			pill.add_child(UITheme.label("%s +%%%d" % [tr(extra_stat[1]), PROFILE.stat_percent(skey, elv)], 12, UITheme.TEXT_DIM, UITheme.font_mono))
			_ins_extras_row.add_child(pill)


# ─────────────────────────────────────────────
#  Yardımcılar
# ─────────────────────────────────────────────

func _char_index(char_name: String) -> int:
	for i in CHARACTERS.size():
		if CHARACTERS[i]["name"] == char_name:
			return i
	return -1


func _get_char_dict(char_name: String) -> Dictionary:
	for c: Dictionary in CHARACTERS:
		if c["name"] == char_name:
			return c
	return {}


func _get_char_color(char_name: String) -> Color:
	var c := _get_char_dict(char_name)
	return c["color"] if not c.is_empty() else UITheme.TEXT_DIM
