## IconSet.gd — Yükseltme ekranı için KODLA çizilen vektör ikonlar (emoji/Unicode glyph yerine).
## Kullanım: `const ICONS := preload("res://scenes/ui/IconSet.gd")` → `ICONS.make("health", 28, UITheme.TEXT)`.
## Tarifler docs/SANAT_KITABI.md §8.2'deki 24×24 birimlik ızgaradan: tek renk, düz uçlu çizgi, sivri köşe,
## "daire" yerine sekizgen, kapalı gövdelerde α 0.25 iç dolgu, küçük vurgu parçaları tam dolu.
## `color` değişince kendini yeniden çizer. Kimlikler: health, speed, damage, weapon, stamina, bomb, heal, sat, flash,
## smoke, trap, lock, check. Ölçek `custom_minimum_size`'dan (px/24) alınır → her çözünürlükte keskin.
## Sınıf adı YOK (global class cache'e bağımlı olmasın) — kullanan dosya preload eder.

extends Control

const GRID := 24.0
const FILL_ALPHA := 0.25
const HEART_STEPS := 36   # kalp eğrisi örnek sayısı

var icon_id: String = "":
	set(v):
		icon_id = v
		queue_redraw()

var color: Color = Color.WHITE:
	set(v):
		color = v
		queue_redraw()

var _s := 1.0          # birim → piksel
var _w := 1.5          # çizgi kalınlığı (px)


## Verilen kimlikte, px×px boyutunda, tek renkli ikon üretir (fare olaylarını geçirir).
static func make(id: String, px: float, tint: Color) -> Control:
	var script := load("res://scenes/ui/IconSet.gd") as GDScript
	var ic: Control = script.new()
	ic.set("icon_id", id)
	ic.set("color", tint)
	ic.custom_minimum_size = Vector2(px, px)
	ic.size = Vector2(px, px)
	ic.pivot_offset = Vector2(px, px) * 0.5
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return ic


func _draw() -> void:
	var px := custom_minimum_size.x
	if px <= 0.0:
		return
	_s = px / GRID
	_w = maxf(1.5, 2.0 * _s)
	match icon_id:
		"health":
			# Yumuşak kalp (klasik kalp eğrisi) + içinden geçen nabız çizgisi
			var heart := PackedVector2Array()
			for i in HEART_STEPS:
				var t := TAU * float(i) / float(HEART_STEPS)
				var x := 16.0 * pow(sin(t), 3.0)
				var y := 13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)
				heart.append(Vector2(12.0 + x * 0.56, 11.2 - y * 0.56) * _s)
			draw_colored_polygon(heart, Color(color, color.a * FILL_ALPHA))
			heart.append(heart[0])
			draw_polyline(heart, color, _w, true)
			_poly([2, 12.5, 7.5, 12.5, 9, 9.5, 11.5, 16, 13.5, 7, 15.5, 12.5, 22, 12.5], false, false, 1.8)
		"speed":
			_poly([6, 5, 13, 12, 6, 19])
			_poly([12, 5, 19, 12, 12, 19])
		"damage":
			_poly([14.68, 5.53, 18.47, 9.32, 18.47, 14.68, 14.68, 18.47, 9.32, 18.47, 5.53, 14.68, 5.53, 9.32, 9.32, 5.53], true)
			_ln(12, 2, 12, 5.5)
			_ln(12, 18.5, 12, 22)
			_ln(2, 12, 5.5, 12)
			_ln(18.5, 12, 22, 12)
			_solid([11, 11, 13, 11, 13, 13, 11, 13])
		"weapon":
			# Yandan tüfek: dipçik → gövde → namlu, altta kavisli şarjör + kabza, üstte nişangâh
			_poly([1.5, 9.8, 6.5, 9, 7, 8.5, 17, 8.5, 17, 9.6, 22.5, 9.6, 22.5, 11, 17, 11, 16, 12.3,
				13, 12.3, 14.2, 17.2, 11.6, 17.8, 10.3, 12.3, 9.2, 12.3, 8.6, 16, 6.6, 16, 7, 12.3, 1.5, 14.2], true, true, 1.6)
			_solid([9.5, 6.8, 12, 6.8, 12, 8.5, 9.5, 8.5])
			_ln(17, 9.6, 17, 11)
		"stamina":
			_poly([14, 2, 5, 13.5, 11, 13.5, 10, 22, 19, 10.5, 13, 10.5], true, true)
		"bomb":
			_poly([14.87, 7.07, 18.93, 11.13, 18.93, 16.87, 14.87, 20.93, 9.13, 20.93, 5.07, 16.87, 5.07, 11.13, 9.13, 7.07], true, true)
			_poly([9.5, 7.07, 9.5, 4, 14.5, 4, 14.5, 7.07])
			_poly([14.5, 5, 20.5, 4.5, 20.5, 9])
			_ln(8, 14, 16, 14)
			_ln(12, 10.5, 12, 17.5)
		"heal":
			_poly([9, 3, 15, 3, 15, 9, 21, 9, 21, 15, 15, 15, 15, 21, 9, 21, 9, 15, 3, 15, 3, 9, 9, 9], true, true)
		"sat":
			_poly([9.5, 9.5, 14.5, 9.5, 14.5, 14.5, 9.5, 14.5], true, true)
			_poly([2, 8.5, 7, 8.5, 7, 15.5, 2, 15.5], true, true)
			_ln(4.5, 8.5, 4.5, 15.5)
			_poly([17, 8.5, 22, 8.5, 22, 15.5, 17, 15.5], true, true)
			_ln(19.5, 8.5, 19.5, 15.5)
			_ln(7, 12, 9.5, 12)
			_ln(14.5, 12, 17, 12)
			_ln(12, 9.5, 12, 5.5)
			_poly([9.5, 4.5, 12, 2.5, 14.5, 4.5])
		"flash":
			_poly([7, 9, 13, 9, 13, 21.5, 7, 21.5], true, true)
			_ln(7, 12, 13, 12)
			_poly([8.5, 9, 8.5, 6, 11.5, 6, 11.5, 9])
			_ln(17, 2, 17, 4.5)
			_ln(19.5, 7, 22, 7)
			_ln(20.8, 3.2, 19, 5)
			_ln(13.2, 3.2, 15, 5)
			_ln(20.8, 10.8, 19, 9)
		"smoke":
			_poly([5, 19, 3, 16, 4, 12.5, 7.5, 11, 8, 7.5, 11.5, 5, 15, 6, 16.5, 9, 19.5, 9.5, 21.5, 13, 21, 17, 19, 19], true, true)
			_ln(7, 21.5, 12, 21.5)
			_ln(14, 21.5, 18, 21.5)
		"trap":
			_poly([3, 17, 21, 17, 21, 20.5, 3, 20.5], true, true)
			_poly([3, 17, 4, 8, 6.5, 12.5, 8, 5, 10, 12, 12, 17])
			_poly([21, 17, 20, 8, 17.5, 12.5, 16, 5, 14, 12, 12, 17])
		"lock":
			_poly([5, 10.5, 19, 10.5, 19, 21, 5, 21], true, true)
			_poly([8, 10.5, 8, 6.5, 10, 3.5, 14, 3.5, 16, 6.5, 16, 10.5])
			_solid([11, 14, 13, 14, 13, 16, 11, 16])
			_ln(12, 16, 12, 18.5)
		"check":
			_poly([4, 12.5, 9.5, 18, 20, 6.5], false, false, 2.5)


## Düz sayı listesi (x, y, x, y …) birim → piksel noktaları
func _pts(flat: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(0, flat.size() - 1, 2):
		out.append(Vector2(float(flat[i]), float(flat[i + 1])) * _s)
	return out


## Çokgen/çoklu çizgi: önce (istenirse) α 0.25 dolgu, sonra kontur. Kapalıysa ilk nokta sona eklenir.
func _poly(flat: Array, closed: bool = false, fill: bool = false, width_units: float = 2.0) -> void:
	var pts := _pts(flat)
	if pts.size() < 2:
		return
	if fill and pts.size() >= 3:
		draw_colored_polygon(pts, Color(color, color.a * FILL_ALPHA))
	if closed:
		pts.append(pts[0])
	draw_polyline(pts, color, maxf(1.5, width_units * _s), true)


func _ln(x1: float, y1: float, x2: float, y2: float) -> void:
	draw_line(Vector2(x1, y1) * _s, Vector2(x2, y2) * _s, color, _w, true)


## Küçük tam dolu vurgu parçası
func _solid(flat: Array) -> void:
	var pts := _pts(flat)
	if pts.size() >= 3:
		draw_colored_polygon(pts, color)
