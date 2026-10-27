## SharpViewport.gd — İçindeki SubViewport'u ekranın GERÇEK piksel çözünürlüğünde çizen TextureRect.
##
## Neden: UI ölçeklemesi (UITheme._apply_scaling, taban 1152×648) altında SubViewportContainer(stretch) 3D görüntüyü
## mantıksal boyutta (ör. 1152×648) çizip büyütüyordu → 1920×1080'de bulanık. Burada SubViewport boyutu
## kontrol boyutu × ekran ölçeği olarak tutulur; TextureRect onu aynı alana 1:1 piksel düşecek şekilde çizer.
## Kullanım: `extends "res://scenes/ui/SharpViewport.gd"` (MenuBackground3D) veya `preload(...).new()` (CharacterSelect);
## 3D sahneyi `viewport`'a ekle. Fare/ışın hesabı için `to_viewport(get_local_mouse_position())`.
## Alt sınıf _process tanımlarsa `super(delta)` çağırmalı.

extends TextureRect

var viewport := SubViewport.new()


func _init() -> void:
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_SCALE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # 1:1 piksel — yumuşatma (bilinear) yok
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	texture = viewport.get_texture()


func _process(_delta: float) -> void:
	_sync_size()


## Kontrolün ekrandaki gerçek piksel boyutu (canvas + pencere ölçeği dahil)
func _sync_size() -> void:
	var s := get_global_transform_with_canvas().get_scale() * get_viewport().get_final_transform().get_scale()
	var want := Vector2i((size * s).round()).max(Vector2i.ONE)
	if viewport.size != want:
		viewport.size = want


## Kontrol içi konum → SubViewport piksel konumu (Camera3D.project_ray_* için)
func to_viewport(local_pos: Vector2) -> Vector2:
	return local_pos * Vector2(viewport.size) / size.max(Vector2.ONE)
