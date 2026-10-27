## FpsCounter.gd — sağ üstte küçük FPS göstergesi (Ayarlar → Oyun → "FPS göster"). GameSettings root'a ekler/kaldırır.

extends CanvasLayer

var _lbl: Label


func _ready() -> void:
	layer = 100
	_lbl = Label.new()
	_lbl.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_lbl.offset_left = -90
	_lbl.offset_right = -8
	_lbl.offset_top = 4
	_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lbl.add_theme_font_size_override("font_size", 12)
	_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_lbl.add_theme_constant_override("outline_size", 4)
	add_child(_lbl)


func _process(_delta: float) -> void:
	var fps := Engine.get_frames_per_second()
	_lbl.text = "%d FPS" % fps
	_lbl.add_theme_color_override("font_color",
		Color(0.45, 0.92, 0.6) if fps >= 55 else (Color(1.0, 0.75, 0.3) if fps >= 30 else Color(1.0, 0.4, 0.35)))
