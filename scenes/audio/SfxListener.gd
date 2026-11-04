## SfxListener.gd — 3D ses dinleyicisi (Player.initialize, sadece yerel oyuncuya ekler)
## Kamera 14 m yukarıda/12 m geride olduğundan varsayılan dinleyici (kamera) her sesi uzak duyuyordu.
## Dinleyici oyuncunun kafa hizasında durur ama YÖNÜ kameranın yatay yönüdür (oyuncunun nişanı değil) →
## ekranın sağındaki ses sağ kulaktan gelir, fareyle dönünce ses sahnesi dönmez.

extends AudioListener3D

var target: Node3D


func _ready() -> void:
	top_level = true
	make_current()


func _process(_delta: float) -> void:
	if not is_instance_valid(target):
		return
	var cam := get_viewport().get_camera_3d()
	var yaw := cam.global_rotation.y if cam else 0.0
	global_transform = Transform3D(Basis(Vector3.UP, yaw), target.global_position + Vector3.UP * 1.6)
