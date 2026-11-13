## Card.gd (3D)
## Haritada duran kart objesi (modda 1-3 adet). Üzerine giren yerel oyuncu pickup isteği gönderir.
## Bir oyuncu birden fazla kart taşıyabilir; her kart kendi card_id'siyle istenir.

extends Area3D

## Görünür olmaya başladığı / tam belirdiği mesafe (m) — kullanıcı: "biraz daha yaklaşınca belirginleşsin" (eski 12 → 5)
const REVEAL_FAR := 8.0
const REVEAL_NEAR := 3.0

const RECHECK_INTERVAL := 0.25   # görünürken alan içindeki yerel oyuncuyu yoklama aralığı
const REQUEST_COOLDOWN := 0.5    # aynı kart için istekler arası en az süre

## GameManager atar
var card_id := -1
var carrier_peer := -1

var _recheck_t := 0.0
var _request_cd := 0.0


func _ready() -> void:
	add_to_group("cards")
	var pr := get_node_or_null("ProximityReveal")
	if pr:
		pr.reveal_far = REVEAL_FAR
		pr.reveal_near = REVEAL_NEAR


func _process(delta: float) -> void:
	_request_cd = maxf(0.0, _request_cd - delta)
	if not visible:
		return
	_recheck_t -= delta
	if _recheck_t > 0.0:
		return
	_recheck_t = RECHECK_INTERVAL
	# Kart yeniden belirdiğinde (düşünce) oyuncu zaten içindeyse body_entered tetiklenmez → yokla
	for body in get_overlapping_bodies():
		_try_pickup(body)


func _on_body_entered(body: Node) -> void:
	_try_pickup(body)


func _try_pickup(body: Node) -> void:
	if not visible:
		return
	if not (body is CharacterBody3D):
		return
	# Bot: SADECE host simüle eder → ağ isteği yok, doğrudan host fonksiyonu (ortak bekleme süresine dokunmaz,
	# aynı anda giren insan oyuncunun isteğini geciktirmesin). Diğer şartları handle_card_pickup da doğrular.
	if body.get("is_bot") == true:
		if NetworkManager.is_host() and not body.get("is_dead"):
			var _bot_blocked = body.get("_card_pickup_blocked")
			if _bot_blocked == null or (_bot_blocked as float) <= 0.0:
				GameManager.handle_card_pickup(int(body.get("peer_id")), card_id)
		return
	if _request_cd > 0.0:
		return
	if body.get("peer_id") != NetworkManager.get_local_id():
		return
	if body.get("is_dead"):
		return
	var _blocked = body.get("_card_pickup_blocked")
	if _blocked != null and (_blocked as float) > 0.0:
		return

	_request_cd = REQUEST_COOLDOWN
	var my_id := NetworkManager.get_local_id()
	if NetworkManager.is_host():
		GameManager.handle_card_pickup(my_id, card_id)
	else:
		GameManager.request_card_pickup.rpc_id(1, my_id, card_id)
