## MatchEndOverlay.gd — Maç sonu ekranı + efektli XP kazanım sunumu (HUD kurar).
## Oyun içinde XP akışı gösterilmez; kazanılan tüm XP kalemleri maç sonunda bu ekranda
## sırayla belirir, toplam sayaç ve profil seviye çubuğu efektlerle (kıvılcım, şok halkası,
## ışık çizgisi, sesler ve seviye atlama patlaması) dolar.
## Sınıf adı YOK — HUD preload eder.

extends Control

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")
const SFX := preload("res://scenes/audio/Sfx.gd")

const AMBER_HOT := Color(1.0, 0.92, 0.72)
const EMBER_COUNT := 26

var _backdrop: ColorRect
var _bg_fx: Control            # arka plan süzülen kıvılcımlar
var _fg_fx: Control            # ön plan şok halkası, darbe çizgisi ve patlama kıvılcımları
var _main_box: VBoxContainer
var _title_lbl: Label
var _sub_lbl: Label
var _kd_lbl: Label

var _xp_card: PanelContainer
var _xp_total_lbl: Label
var _rows_box: VBoxContainer
var _level_badge: Label
var _level_up_pill: PanelContainer
var _level_up_lbl: Label
var _profile_xp_lbl: Label
var _bar_draw: Control
var _bar_sub_lbl: Label
var _countdown_lbl: Label

# Animasyon & efekt durumu
var _seq_id := 0               # eski eşzamansız present() çağrılarını iptal etmek için
var _countdown_remaining := 0.0
var _debug_mode := false
var _embers: Array[Dictionary] = []
var _sparks: Array[Dictionary] = []
var _rings: Array[Dictionary] = []
var _slashes: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()

# Çubuk çizim durumu
var _bar_ratio := 0.0
var _bar_sheen := -0.3
var _bar_flash := 0.0
var _bar_filling := false
var _last_roll_ms := 0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	_rng.randomize()
	_build_ui()
	set_process(false)


func _build_ui() -> void:
	_backdrop = ColorRect.new()
	_backdrop.color = Color(0.024, 0.030, 0.038, 0.84)
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_backdrop)

	_bg_fx = Control.new()
	_bg_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bg_fx.draw.connect(_draw_bg_fx)
	add_child(_bg_fx)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_main_box = VBoxContainer.new()
	_main_box.add_theme_constant_override("separation", 8)
	_main_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_main_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_main_box)

	var cap := UITheme.label("OYUN BİTTİ", 19, UITheme.TEXT_DIM, UITheme.font_caps)
	cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_box.add_child(cap)

	_title_lbl = UITheme.label("ZAFER", 112, UITheme.ACCENT, UITheme.font_title)
	_title_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_lbl.add_theme_constant_override("outline_size", 8)
	_title_lbl.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.55))
	_main_box.add_child(_title_lbl)

	_sub_lbl = UITheme.label("", 26, UITheme.TEXT, UITheme.font_bold)
	_sub_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_box.add_child(_sub_lbl)

	_kd_lbl = UITheme.label("", 20, UITheme.TEXT_DIM, UITheme.font_caps)
	_kd_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_box.add_child(_kd_lbl)

	_main_box.add_child(_vspace(14))

	# ── XP Kazancı Cam Paneli ──
	_xp_card = PanelContainer.new()
	_xp_card.custom_minimum_size = Vector2(680, 0)
	_xp_card.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_xp_card.add_theme_stylebox_override("panel", UITheme.style(
		Color(UITheme.BG, 0.78), UITheme.RADIUS, Color(UITheme.ACCENT, 0.38), 1, 28, 22))
	UITheme.add_brackets(_xp_card, Color(UITheme.ACCENT, 0.85), 18.0, 2.5, -4.0)
	_main_box.add_child(_xp_card)

	var card_v := VBoxContainer.new()
	card_v.add_theme_constant_override("separation", 12)
	_xp_card.add_child(card_v)

	# Panel başlığı + canlı toplam "+XXX XP"
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 12)
	card_v.add_child(head_row)

	var head_title := UITheme.label("MAÇ XP KAZANCI", 18, UITheme.TEXT_DIM, UITheme.font_caps)
	head_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head_row.add_child(head_title)

	_xp_total_lbl = UITheme.label("+0 XP", 34, UITheme.ACCENT, UITheme.font_mono)
	_xp_total_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_xp_total_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	head_row.add_child(_xp_total_lbl)

	card_v.add_child(_divider())

	# Kalem kalem XP dökümü
	_rows_box = VBoxContainer.new()
	_rows_box.add_theme_constant_override("separation", 7)
	card_v.add_child(_rows_box)

	card_v.add_child(_divider())

	# Profil seviye & XP çubuğu bölümü
	var prof_row := HBoxContainer.new()
	prof_row.add_theme_constant_override("separation", 12)
	card_v.add_child(prof_row)

	_level_badge = UITheme.label("SV 1", 22, UITheme.TEXT, UITheme.font_mono)
	_level_badge.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	prof_row.add_child(_level_badge)

	_level_up_pill = PanelContainer.new()
	_level_up_pill.add_theme_stylebox_override("panel", UITheme.style(
		Color(UITheme.ACCENT, 0.22), 5, UITheme.ACCENT, 1, 12, 3))
	_level_up_pill.visible = false
	prof_row.add_child(_level_up_pill)
	_level_up_lbl = UITheme.label("SEVİYE ATLADIN!", 15, AMBER_HOT, UITheme.font_caps)
	_level_up_pill.add_child(_level_up_lbl)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	prof_row.add_child(spacer)

	_profile_xp_lbl = UITheme.label("", 18, UITheme.TEXT_DIM, UITheme.font_mono)
	_profile_xp_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	prof_row.add_child(_profile_xp_lbl)

	_bar_draw = Control.new()
	_bar_draw.custom_minimum_size = Vector2(0, 14)
	_bar_draw.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bar_draw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar_draw.draw.connect(_draw_xp_bar)
	card_v.add_child(_bar_draw)

	_bar_sub_lbl = UITheme.label("", 15, UITheme.TEXT_DIM, UITheme.font_mono)
	_bar_sub_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	card_v.add_child(_bar_sub_lbl)

	_main_box.add_child(_vspace(14))

	_countdown_lbl = UITheme.label("", 20, UITheme.TEXT_DIM, UITheme.font_caps)
	_countdown_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_main_box.add_child(_countdown_lbl)

	# Ön plan efekt katmanı (kıvılcımlar + şok halkaları + darbe çizgileri)
	_fg_fx = Control.new()
	_fg_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fg_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fg_fx.draw.connect(_draw_fg_fx)
	add_child(_fg_fx)


# ─────────────────────────────────────────────
#  Gösterim & Animasyon Sekansı
# ─────────────────────────────────────────────

func present(winning_team: int, won: bool, team_color: Color, end_reason: String,
		stats: Dictionary, match_xp: int, breakdown: Array,
		start_xp: int, start_total_xp: int, delay_seconds: float,
		debug_mode: bool = false) -> void:
	_seq_id += 1
	var my_seq := _seq_id
	_debug_mode = debug_mode
	_countdown_remaining = delay_seconds
	_sparks.clear()
	_rings.clear()
	_slashes.clear()
	_init_embers()

	# Başlık ve alt başlık
	var accent_col := team_color if won else UITheme.DANGER
	if winning_team < 0:
		accent_col = UITheme.ACCENT
		_title_lbl.text = "BERABERLİK"
		_title_lbl.add_theme_color_override("font_color", UITheme.TEXT)
		_sub_lbl.text = "SÜRE DOLDU · SKORLAR EŞİT"
		_sub_lbl.add_theme_color_override("font_color", UITheme.TEXT)
	else:
		_title_lbl.text = "ZAFER" if won else "YENİLGİ"
		_title_lbl.add_theme_color_override("font_color", team_color if won else UITheme.DANGER)
		var win_name: String = TeamManager.get_team_name(winning_team).to_upper()
		if end_reason == "time":
			_sub_lbl.text = tr("SÜRE DOLDU · %s TAKIMI KAZANDI") % win_name
		else:
			_sub_lbl.text = tr("%s TAKIMI KAZANDI") % win_name
		_sub_lbl.add_theme_color_override("font_color", team_color)

	_kd_lbl.text = tr("%d KILL   ·   %d ÖLÜM") % [int(stats.get("kills", 0)), int(stats.get("deaths", 0))]

	# Önceki satırları temizle
	for ch in _rows_box.get_children():
		ch.queue_free()

	# Başlangıç profil durumu
	var start_lv := PROFILE.level_for_xp(start_total_xp)
	var end_total_xp := start_total_xp + match_xp
	var end_xp := start_xp + match_xp
	_level_badge.text = "SV %d" % start_lv
	_level_badge.add_theme_color_override("font_color", UITheme.TEXT)
	_level_up_pill.visible = false
	_profile_xp_lbl.text = tr("PROFİL: %d XP") % start_xp
	_xp_total_lbl.text = "+0 XP"
	_set_bar_for_total_xp(start_total_xp, start_lv)
	_bar_flash = 0.0
	_bar_filling = false

	# Satır düğümlerini önceden gizli oluştur (düzen oturunca tek tek açılacak)
	var row_entries: Array[Dictionary] = []
	if breakdown.is_empty() or match_xp <= 0:
		var empty_lbl := UITheme.label("Bu maçta XP kazanılmadı", 18, UITheme.TEXT_DIM)
		empty_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_rows_box.add_child(empty_lbl)
	else:
		for item: Variant in breakdown:
			if not (item is Dictionary):
				continue
			var d: Dictionary = item
			var amt := int(d.get("amount", 0))
			if amt <= 0:
				continue
			var reason := str(d.get("reason", ""))
			var cnt := int(d.get("count", 1))
			var row := _make_xp_row(reason, amt, cnt)
			row.modulate.a = 0.0
			_rows_box.add_child(row)
			row_entries.append({"node": row, "amount": amt})

	if _debug_mode:
		_countdown_lbl.text = "ESC / TIKLA · KAPAT"
	else:
		_countdown_lbl.text = tr("%d sn sonra lobiye dönülüyor") % ceili(_countdown_remaining)

	# Görünür yap ve düzenin oturmasını bekle (pivot ve küresel konumlar doğru olsun)
	modulate.a = 0.0
	_xp_card.modulate.a = 0.0
	visible = true
	set_process(true)

	await get_tree().process_frame
	if my_seq != _seq_id or not is_inside_tree():
		return

	# 1) Perde girişi + Başlık darbesi
	var tw_in := create_tween().set_parallel(true)
	tw_in.tween_property(self, "modulate:a", 1.0, 0.32).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	_title_lbl.pivot_offset = _title_lbl.size * 0.5
	_title_lbl.scale = Vector2(1.38, 1.38)
	tw_in.tween_property(_title_lbl, "scale", Vector2.ONE, 0.36).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	var title_center := _center_of(_title_lbl)
	_spawn_slash(title_center, 460.0, accent_col, 0.55)
	_spawn_ring(title_center, 36.0, 210.0, accent_col, 0.50)
	_spawn_sparks(title_center, 18, accent_col, 240.0, 520.0)

	# 2) XP Kartı belirir
	await get_tree().create_timer(0.32).timeout
	if my_seq != _seq_id or not is_inside_tree():
		return

	_xp_card.pivot_offset = _xp_card.size * 0.5
	_xp_card.scale = Vector2(0.95, 0.95)
	var tw_card := create_tween().set_parallel(true)
	tw_card.tween_property(_xp_card, "modulate:a", 1.0, 0.28).set_ease(Tween.EASE_OUT)
	tw_card.tween_property(_xp_card, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	await get_tree().create_timer(0.24).timeout
	if my_seq != _seq_id or not is_inside_tree():
		return

	# 3) Kalem kalem XP satırları efektlerle gelir
	var running_xp := 0
	var count := row_entries.size()
	var step_gap := clampf(1.55 / maxf(float(count), 1.0), 0.14, 0.28)

	for i in count:
		if my_seq != _seq_id or not is_inside_tree():
			return
		var entry: Dictionary = row_entries[i]
		var row: Control = entry["node"]
		var amt: int = entry["amount"]
		if not is_instance_valid(row):
			continue

		# Satır soldan kayıp parlakça yerine oturur
		var r_rect := row.get_global_rect()
		var spark_pos := Vector2(r_rect.end.x - 42.0, r_rect.get_center().y) - global_position
		row.modulate = Color(1.4, 1.25, 0.95, 0.0)
		var orig_x := row.position.x
		row.position.x = orig_x - 28.0
		var tw_r := create_tween().set_parallel(true)
		tw_r.tween_property(row, "position:x", orig_x, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw_r.tween_property(row, "modulate", Color.WHITE, 0.26).set_ease(Tween.EASE_OUT)

		# Ses (her satırda hafif yükselen perde)
		var pitch := minf(0.92 + float(i) * 0.06, 1.48)
		SFX.play_ui(get_tree(), "xp_tick", -5.0, pitch)

		# Satırın sağındaki +XP noktasından kıvılcım
		_spawn_sparks(spark_pos, 8, UITheme.ACCENT, 90.0, 260.0)

		# Toplam XP sayacını canlandır
		var from_xp := running_xp
		running_xp += amt
		_tween_total_counter(from_xp, running_xp, minf(step_gap, 0.22))
		_pulse_control(_xp_total_lbl, 1.18, 0.16)

		await get_tree().create_timer(step_gap).timeout

	if my_seq != _seq_id or not is_inside_tree():
		return

	# 4) Toplam XP kilitlenme vurgusu + Profil XP / Seviye Çubuğu dolumu
	if match_xp > 0:
		_xp_total_lbl.text = "+%d XP" % match_xp
		var tot_pos := _center_of(_xp_total_lbl)
		_spawn_ring(tot_pos, 18.0, 95.0, UITheme.ACCENT, 0.42)
		_spawn_sparks(tot_pos, 16, AMBER_HOT, 140.0, 360.0)
		_pulse_control(_xp_total_lbl, 1.26, 0.24)

		await get_tree().create_timer(0.18).timeout
		if my_seq != _seq_id or not is_inside_tree():
			return

		await _animate_profile_bar(my_seq, start_xp, end_xp, start_total_xp, end_total_xp)


func _animate_profile_bar(my_seq: int, start_xp: int, end_xp: int, start_total_xp: int, end_total_xp: int) -> void:
	var cur_lv := PROFILE.level_for_xp(start_total_xp)
	var target_lv := PROFILE.level_for_xp(end_total_xp)
	var total_gain := maxi(end_total_xp - start_total_xp, 1)
	var total_dur := clampf(0.85 + float(target_lv - cur_lv) * 0.45, 0.85, 2.2)

	_bar_filling = true
	var elapsed := 0.0
	var displayed_lv := cur_lv

	while elapsed < total_dur:
		await get_tree().process_frame
		if my_seq != _seq_id or not is_inside_tree() or not visible:
			_bar_filling = false
			return
		elapsed += get_process_delta_time()
		var t := clampf(elapsed / total_dur, 0.0, 1.0)
		# Başta hızlı, sonda yumuşak oturan eğri (ease out cubic)
		var eased := 1.0 - pow(1.0 - t, 3.0)
		var cur_total := start_total_xp + int(round(float(total_gain) * eased))
		var cur_spend := start_xp + int(round(float(end_xp - start_xp) * eased))

		_profile_xp_lbl.text = tr("PROFİL: %d XP") % cur_spend

		var now_lv := PROFILE.level_for_xp(cur_total)
		if now_lv > displayed_lv:
			displayed_lv = now_lv
			_trigger_level_up(displayed_lv)

		_set_bar_for_total_xp(cur_total, displayed_lv)

		# Yumuşak sayaç tıkı (saniyede ~14 kez)
		var now_ms := Time.get_ticks_msec()
		if t < 0.96 and now_ms - _last_roll_ms >= 70:
			_last_roll_ms = now_ms
			SFX.play_ui(get_tree(), "xp_roll", -11.0, 0.92 + eased * 0.35)

	_bar_filling = false
	_profile_xp_lbl.text = tr("PROFİL: %d XP") % end_xp
	if target_lv > displayed_lv:
		_trigger_level_up(target_lv)
	_set_bar_for_total_xp(end_total_xp, target_lv)
	_bar_flash = maxf(_bar_flash, 0.55)
	_bar_draw.queue_redraw()


func _trigger_level_up(new_level: int) -> void:
	_level_badge.text = "SV %d" % new_level
	_level_badge.add_theme_color_override("font_color", UITheme.ACCENT)
	_pulse_control(_level_badge, 1.42, 0.32)

	_level_up_pill.visible = true
	_pulse_control(_level_up_pill, 1.32, 0.30)

	_bar_flash = 1.0
	SFX.play_ui(get_tree(), "xp_level_up", -1.5)

	var bar_center := _center_of(_bar_draw)
	_spawn_slash(bar_center, 420.0, AMBER_HOT, 0.62)
	_spawn_ring(bar_center, 24.0, 190.0, UITheme.ACCENT, 0.58)
	_spawn_ring(bar_center, 14.0, 120.0, AMBER_HOT, 0.42)
	_spawn_sparks(bar_center, 34, AMBER_HOT, 180.0, 520.0)


func _set_bar_for_total_xp(txp: int, lv: int) -> void:
	var lv_start := PROFILE.xp_for_level(lv)
	var lv_next := PROFILE.xp_for_level(lv + 1)
	var span := maxi(lv_next - lv_start, 1)
	var within := clampi(txp - lv_start, 0, span)
	_bar_ratio = clampf(float(within) / float(span), 0.0, 1.0)
	_bar_sub_lbl.text = tr("SONRAKİ SEVİYE: %d / %d XP") % [within, span]
	_bar_draw.queue_redraw()


func _tween_total_counter(from_val: int, to_val: int, dur: float) -> void:
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void:
		if is_instance_valid(_xp_total_lbl):
			_xp_total_lbl.text = "+%d XP" % int(round(v)),
		float(from_val), float(to_val), maxf(dur, 0.05)
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _pulse_control(ctrl: Control, peak: float, dur: float) -> void:
	if not is_instance_valid(ctrl):
		return
	ctrl.pivot_offset = ctrl.size * 0.5
	var tw := create_tween()
	tw.tween_property(ctrl, "scale", Vector2(peak, peak), dur * 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(ctrl, "scale", Vector2.ONE, dur * 0.65).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _make_xp_row(reason: String, amount: int, count: int) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var dot := UITheme.label("▸", 16, UITheme.ACCENT, UITheme.font_bold)
	dot.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	row.add_child(dot)

	var r_lbl := UITheme.label(tr(reason), 20, UITheme.TEXT)
	r_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	row.add_child(r_lbl)

	if count > 1:
		var mult := UITheme.label("×%d" % count, 17, UITheme.TEXT_DIM, UITheme.font_mono)
		mult.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		row.add_child(mult)

	var fill := Control.new()
	fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(fill)

	var val_lbl := UITheme.label("+%d XP" % amount, 21, UITheme.ACCENT, UITheme.font_mono)
	val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	val_lbl.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	row.add_child(val_lbl)

	return row


func update_countdown(delta: float) -> void:
	if not visible or _debug_mode:
		return
	_countdown_remaining = maxf(_countdown_remaining - delta, 0.0)
	_countdown_lbl.text = tr("%d sn sonra lobiye dönülüyor") % ceili(_countdown_remaining)


func dismiss_debug() -> void:
	if not _debug_mode:
		return
	_seq_id += 1
	_debug_mode = false
	visible = false
	set_process(false)


func _gui_input(event: InputEvent) -> void:
	if not _debug_mode:
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		dismiss_debug()
		accept_event()


func _unhandled_input(event: InputEvent) -> void:
	if not visible or not _debug_mode:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		dismiss_debug()
		get_viewport().set_input_as_handled()


# ─────────────────────────────────────────────
#  Parçacık & Vektör Efektleri
# ─────────────────────────────────────────────

func _init_embers() -> void:
	_embers.clear()
	var sz := get_viewport_rect().size
	if sz.x <= 1.0:
		sz = Vector2(1920.0, 1080.0)
	for i in EMBER_COUNT:
		_embers.append({
			"pos": Vector2(_rng.randf_range(0.0, sz.x), _rng.randf_range(0.0, sz.y)),
			"vel": Vector2(_rng.randf_range(-14.0, 14.0), _rng.randf_range(-42.0, -16.0)),
			"size": _rng.randf_range(1.4, 3.2),
			"phase": _rng.randf_range(0.0, TAU),
			"alpha": _rng.randf_range(0.18, 0.55),
		})


func _spawn_sparks(origin: Vector2, count: int, col: Color, speed_min: float, speed_max: float) -> void:
	for i in count:
		var ang := _rng.randf_range(0.0, TAU)
		var spd := _rng.randf_range(speed_min, speed_max)
		_sparks.append({
			"pos": origin,
			"vel": Vector2(cos(ang), sin(ang)) * spd,
			"t": 0.0,
			"life": _rng.randf_range(0.32, 0.68),
			"len": _rng.randf_range(10.0, 26.0),
			"col": col if _rng.randf() > 0.35 else AMBER_HOT,
		})


func _spawn_ring(origin: Vector2, r0: float, r1: float, col: Color, life: float) -> void:
	_rings.append({
		"pos": origin, "r0": r0, "r1": r1, "col": col, "t": 0.0, "life": life,
	})


func _spawn_slash(origin: Vector2, half_w: float, col: Color, life: float) -> void:
	_slashes.append({
		"pos": origin, "half_w": half_w, "col": col, "t": 0.0, "life": life,
	})


func _process(delta: float) -> void:
	if not visible:
		set_process(false)
		return

	var sz := size
	if sz.x <= 1.0:
		sz = Vector2(1920.0, 1080.0)

	# Arka plan süzülen kıvılcımlar
	for e: Dictionary in _embers:
		e["pos"] = (e["pos"] as Vector2) + (e["vel"] as Vector2) * delta
		e["phase"] = float(e["phase"]) + delta * 2.2
		var p: Vector2 = e["pos"]
		if p.y < -12.0:
			p.y = sz.y + 12.0
			p.x = _rng.randf_range(0.0, sz.x)
		elif p.x < -12.0:
			p.x = sz.x + 12.0
		elif p.x > sz.x + 12.0:
			p.x = -12.0
		e["pos"] = p
	_bg_fx.queue_redraw()

	# Ön plan efektleri
	var i := _sparks.size() - 1
	while i >= 0:
		var s: Dictionary = _sparks[i]
		s["t"] = float(s["t"]) + delta
		if float(s["t"]) >= float(s["life"]):
			_sparks.remove_at(i)
		else:
			var vel: Vector2 = s["vel"]
			s["pos"] = (s["pos"] as Vector2) + vel * delta
			s["vel"] = vel * pow(0.06, delta)
		i -= 1

	i = _rings.size() - 1
	while i >= 0:
		var r: Dictionary = _rings[i]
		r["t"] = float(r["t"]) + delta
		if float(r["t"]) >= float(r["life"]):
			_rings.remove_at(i)
		i -= 1

	i = _slashes.size() - 1
	while i >= 0:
		var sl: Dictionary = _slashes[i]
		sl["t"] = float(sl["t"]) + delta
		if float(sl["t"]) >= float(sl["life"]):
			_slashes.remove_at(i)
		i -= 1

	_fg_fx.queue_redraw()

	# Çubuk ışık taraması + parlama sönümü
	if _bar_filling:
		_bar_sheen += delta * 1.45
		if _bar_sheen > 1.35:
			_bar_sheen = -0.35
	if _bar_flash > 0.0:
		_bar_flash = maxf(_bar_flash - delta * 2.2, 0.0)
	if _bar_filling or _bar_flash > 0.0:
		_bar_draw.queue_redraw()


func _draw_bg_fx() -> void:
	for e: Dictionary in _embers:
		var a := float(e["alpha"]) * (0.65 + 0.35 * sin(float(e["phase"])))
		_bg_fx.draw_circle(e["pos"], float(e["size"]), Color(UITheme.ACCENT, a))


func _draw_fg_fx() -> void:
	# Darbe çizgileri (keskin yatay ışık)
	for sl: Dictionary in _slashes:
		var p := clampf(float(sl["t"]) / float(sl["life"]), 0.0, 1.0)
		var ease_p := 1.0 - pow(1.0 - p, 3.0)
		var hw := float(sl["half_w"]) * ease_p
		var a := (1.0 - p) * (1.0 - p)
		var c: Vector2 = sl["pos"]
		var col: Color = sl["col"]
		_fg_fx.draw_line(c - Vector2(hw, 0), c + Vector2(hw, 0), Color(col, a * 0.75), 3.0, true)
		_fg_fx.draw_line(c - Vector2(hw * 0.55, 0), c + Vector2(hw * 0.55, 0), Color(AMBER_HOT, a * 0.9), 1.5, true)

	# Sekizgen şok halkaları (taktik geometri)
	for r: Dictionary in _rings:
		var p := clampf(float(r["t"]) / float(r["life"]), 0.0, 1.0)
		var ease_p := 1.0 - pow(1.0 - p, 3.0)
		var rad := lerpf(float(r["r0"]), float(r["r1"]), ease_p)
		var a := (1.0 - p) * 0.8
		var col: Color = r["col"]
		var c: Vector2 = r["pos"]
		var pts := PackedVector2Array()
		for k in 9:
			var ang := float(k) * TAU / 8.0 + PI / 8.0
			pts.append(c + Vector2(cos(ang), sin(ang)) * rad)
		_fg_fx.draw_polyline(pts, Color(col, a), lerpf(2.8, 1.0, p), true)

	# Keskin kıvılcım iğneleri
	for s: Dictionary in _sparks:
		var p := clampf(float(s["t"]) / float(s["life"]), 0.0, 1.0)
		var a := (1.0 - p)
		var pos: Vector2 = s["pos"]
		var vel: Vector2 = s["vel"]
		var dir := vel.normalized() if vel.length_squared() > 1.0 else Vector2.UP
		var tail := pos - dir * float(s["len"]) * (1.0 - p * 0.65)
		var col: Color = s["col"]
		_fg_fx.draw_line(tail, pos, Color(col, a * 0.95), lerpf(2.4, 1.0, p), true)


func _draw_xp_bar() -> void:
	var w := _bar_draw.size.x
	var h := _bar_draw.size.y
	if w <= 1.0 or h <= 1.0:
		return

	# Arka zemin + ince çerçeve
	_bar_draw.draw_rect(Rect2(0, 0, w, h), Color(1.0, 1.0, 1.0, 0.08))
	_bar_draw.draw_rect(Rect2(0, 0, w, h), Color(1.0, 1.0, 1.0, 0.16), false, 1.0)

	# Dolgu
	var fill_w := w * clampf(_bar_ratio, 0.0, 1.0)
	if fill_w > 0.5:
		var fill_col := UITheme.ACCENT.lerp(AMBER_HOT, _bar_flash * 0.75)
		_bar_draw.draw_rect(Rect2(0, 0, fill_w, h), fill_col)

		# Hareketli ışık şeridi (dolarken)
		if _bar_filling:
			var sx := _bar_sheen * fill_w
			var sw := minf(84.0, fill_w * 0.35)
			var x0 := clampf(sx - sw * 0.5, 0.0, fill_w)
			var x1 := clampf(sx + sw * 0.5, 0.0, fill_w)
			if x1 - x0 > 1.0:
				_bar_draw.draw_rect(Rect2(x0, 0.0, x1 - x0, h), Color(AMBER_HOT, 0.38))

		# Parlak ön uç çizgisi
		_bar_draw.draw_rect(Rect2(maxf(fill_w - 3.0, 0.0), 0.0, 3.0, h), AMBER_HOT)

	# Seviye atlama beyaz parlaması
	if _bar_flash > 0.01:
		_bar_draw.draw_rect(Rect2(0, 0, w, h), Color(AMBER_HOT, _bar_flash * 0.45))


# ─────────────────────────────────────────────
#  Yardımcılar
# ─────────────────────────────────────────────

func _center_of(ctrl: Control) -> Vector2:
	return ctrl.get_global_rect().get_center() - global_position


func _divider() -> ColorRect:
	var d := ColorRect.new()
	d.color = Color(1.0, 1.0, 1.0, 0.10)
	d.custom_minimum_size = Vector2(0, 1)
	d.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return d


func _vspace(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c
