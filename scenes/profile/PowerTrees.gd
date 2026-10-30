## PowerTrees.gd — GÜÇ GELİŞİMİ ağaçları (HESAP GENELİ — güçler karaktere ait değil, herkes toplayabiliyor).
## Statik veri + hesap; kullananlar `preload` eder. Kayıt PlayerProfile'da (`powers`), ağda NetworkManager.players[peer]["powers"].
##
## Her düğüm "set" ile değer(ler)i MUTLAK olarak belirler; düğümler tanım sırasıyla uygulanır (zincirde sonraki düğüm öncekini ezer,
## ör. Bomba kök fitil 1.0 → B3 0.7). `mods(owned)` = BASE + sahip olunan düğümler → PowerupManager/Trap/Minimap bunu kullanır.
## Her peer atanın değerlerini aynı players listesinden hesaplar → güç RPC'lerine ek alan gerekmez.
## Fiyat ağaç başına: COST_BASE × COST_GROWTH ^ (o ağaçta alınan düğüm sayısı). Tasarım: docs/PROJE_GECMISI.md §5.3.

extends RefCounted

const COST_BASE := 300.0
const COST_GROWTH := 1.4

## Güçlerin temel değerleri (yükseltmesiz)
const BASE := {
	"bomb_fuse": 1.2, "bomb_radius": 4.0, "bomb_edge": 0.35, "bomb_throw": 12.0, "bomb_flight": 0.55,
	"heal_amount": 35.0, "heal_regen": 0.0, "heal_medic_range": 6.0, "heal_medic_aim": 2.5, "heal_critical": 1.0, "heal_group": 0.0,
	"sat_duration": 8.0,
	"flash_fuse": 0.8, "flash_radius": 11.0, "flash_strength": 1.0, "flash_self": 1.0, "flash_throw": 12.0, "flash_team": 1.0,
	"smoke_duration": 10.0, "smoke_radius": 6.0, "smoke_fuse": 0.4, "smoke_throw": 12.0, "smoke_radar": 0.0,
	"trap_dot": 12.0, "trap_rescue": 4.0, "trap_trigger": 0.9, "trap_reveal_far": 5.0, "trap_reveal_near": 2.0,
}

## Detay panelinde "eski → yeni" gösterimi: [etiket, biçim]  (biçim: s saniye, m metre, hp can, pct yüzde, x çarpan, bool)
const LABELS := {
	"bomb_fuse": ["Fitil", "s"], "bomb_radius": ["Patlama yarıçapı", "m"], "bomb_edge": ["Kenar hasarı", "pct"],
	"bomb_throw": ["Atış menzili", "m"], "bomb_flight": ["Uçuş süresi", "s"],
	"heal_amount": ["İyileştirme", "hp"], "heal_regen": ["4 sn'de ek can", "hp"], "heal_medic_range": ["Medic menzili", "m"],
	"heal_medic_aim": ["Medic nişan alanı", "m"], "heal_critical": ["Kritik canda etki", "x"], "heal_group": ["Yakındakilere", "pct"],
	"sat_duration": ["Uydu süresi", "s"],
	"flash_fuse": ["Fitil", "s"], "flash_radius": ["Etki yarıçapı", "m"], "flash_strength": ["Körlük şiddeti", "pct"],
	"flash_self": ["Sana körlük", "pct"], "flash_throw": ["Atış menzili", "m"], "flash_team": ["Takımına körlük", "pct"],
	"smoke_duration": ["Sis süresi", "s"], "smoke_radius": ["Sis yarıçapı", "m"], "smoke_fuse": ["Duman çıkışı", "s"],
	"smoke_throw": ["Atış menzili", "m"], "smoke_radar": ["Uyduda görünmez", "bool"],
	"trap_dot": ["Saniyelik hasar", "hp"], "trap_rescue": ["Kurtarma süresi", "s"], "trap_trigger": ["Tetik alanı", "m"],
	"trap_reveal_far": ["Fark edilme mesafesi", "m"],
}

## Ağaçlar (UI'da bu sırayla). type = PowerupManager.Type indeksi (glyph/renk INFO'dan).
## Düğüm: id, ad, açıklama, req (ön koşul düğüm id'si, "" = yok), pos (sütun, satır — UI ızgarası), set (değerler).
const TREE_ORDER: Array[String] = ["bomb", "heal", "sat", "flash", "smoke", "trap"]
const TREES := {
	"bomb": {"type": 0, "name": "BOMBA", "short": "BOMBA", "nodes": [
		{"id": "root", "name": "Kısa Fitil", "desc": "Bomba yere düştükten sonra daha çabuk patlar.", "req": "", "pos": Vector2i(0, 1), "set": {"bomb_fuse": 1.0}},
		{"id": "a1", "name": "Geniş Patlama", "desc": "Patlama alanı büyür.", "req": "root", "pos": Vector2i(1, 0), "set": {"bomb_radius": 4.6}},
		{"id": "a2", "name": "Sert Kenar", "desc": "Patlama alanının kenarındakiler daha çok hasar alır.", "req": "a1", "pos": Vector2i(2, 0), "set": {"bomb_edge": 0.45}},
		{"id": "b1", "name": "Uzun Kol", "desc": "Bombayı daha uzağa atarsın.", "req": "root", "pos": Vector2i(1, 2), "set": {"bomb_throw": 14.5}},
		{"id": "b2", "name": "Sert Atış", "desc": "Bomba havada daha kısa kalır, hedefe çabuk varır.", "req": "b1", "pos": Vector2i(2, 2), "set": {"bomb_flight": 0.45}},
		{"id": "b3", "name": "Anlık Fitil", "desc": "Yere düşer düşmez patlar — rakibe kaçacak vakit kalmaz.", "req": "b2", "pos": Vector2i(3, 2), "set": {"bomb_fuse": 0.7}},
	]},
	"heal": {"type": 1, "name": "SAĞLIK", "short": "SAĞLIK", "nodes": [
		{"id": "root", "name": "Sıkı Sargı", "desc": "Sağlık gücü daha çok iyileştirir.", "req": "", "pos": Vector2i(0, 1), "set": {"heal_amount": 40.0}},
		{"id": "a1", "name": "Yenilenme", "desc": "İyileştirmeden sonra 4 sn boyunca ek can dolar.", "req": "root", "pos": Vector2i(1, 0), "set": {"heal_regen": 10.0}},
		{"id": "a2", "name": "Güçlü Sargı", "desc": "Sağlık gücü daha da çok iyileştirir.", "req": "a1", "pos": Vector2i(2, 0), "set": {"heal_amount": 45.0}},
		{"id": "b1", "name": "Uzak Tedavi", "desc": "Medic ile takım arkadaşını daha uzaktan iyileştirirsin.", "req": "root", "pos": Vector2i(1, 2), "set": {"heal_medic_range": 8.0, "heal_medic_aim": 3.2}},
		{"id": "b2", "name": "Acil Müdahale", "desc": "Canı %30'un altındaki oyuncuda iyileştirme 1.5 kat etki eder.", "req": "b1", "pos": Vector2i(2, 2), "set": {"heal_critical": 1.5}},
		{"id": "b3", "name": "Grup Şifası", "desc": "İyileştirilenin 2.5 m yakınındaki takım arkadaşları iyileştirmenin %20'sini alır.", "req": "b2", "pos": Vector2i(3, 2), "set": {"heal_group": 0.2}},
	]},
	"sat": {"type": 2, "name": "UYDU", "short": "UYDU", "nodes": [
		{"id": "root", "name": "Kalibrasyon", "desc": "Uydu daha uzun süre açık kalır.", "req": "", "pos": Vector2i(0, 1), "set": {"sat_duration": 9.5}},
		{"id": "a1", "name": "Uzun Yörünge", "desc": "Uydu daha uzun süre açık kalır.", "req": "root", "pos": Vector2i(1, 1), "set": {"sat_duration": 11.0}},
		{"id": "a2", "name": "Sabit Yörünge", "desc": "Uydu daha uzun süre açık kalır.", "req": "a1", "pos": Vector2i(2, 1), "set": {"sat_duration": 12.5}},
	]},
	"flash": {"type": 4, "name": "FLAŞ BOMBASI", "short": "FLAŞ", "nodes": [
		{"id": "root", "name": "Hızlı Pim", "desc": "Flaş yere düştükten sonra daha çabuk patlar.", "req": "", "pos": Vector2i(0, 1), "set": {"flash_fuse": 0.65}},
		{"id": "a1", "name": "Parlak Flaş", "desc": "Flaş daha uzaktakileri kör eder.", "req": "root", "pos": Vector2i(1, 0), "set": {"flash_radius": 12.5}},
		{"id": "a2", "name": "Derin Körlük", "desc": "Körlük daha güçlü ve uzun sürer.", "req": "a1", "pos": Vector2i(2, 0), "set": {"flash_strength": 1.15}},
		{"id": "b1", "name": "Göz Kırpma", "desc": "Kendi flaşın seni daha az kör eder.", "req": "root", "pos": Vector2i(1, 2), "set": {"flash_self": 0.6}},
		{"id": "b2", "name": "Uzun Kol", "desc": "Flaşı daha uzağa atarsın.", "req": "b1", "pos": Vector2i(2, 2), "set": {"flash_throw": 14.5}},
		{"id": "b3", "name": "Dost Uyarısı", "desc": "Takım arkadaşların senin flaşından yarı yarıya etkilenir.", "req": "b2", "pos": Vector2i(3, 2), "set": {"flash_team": 0.5}},
	]},
	"smoke": {"type": 5, "name": "SİS BOMBASI", "short": "SİS", "nodes": [
		{"id": "root", "name": "Yoğun Sis", "desc": "Sis daha uzun süre kalır.", "req": "", "pos": Vector2i(0, 1), "set": {"smoke_duration": 11.0}},
		{"id": "a1", "name": "Geniş Sis", "desc": "Sis bulutu büyür.", "req": "root", "pos": Vector2i(1, 0), "set": {"smoke_radius": 6.8}},
		{"id": "a2", "name": "Kalıcı Perde", "desc": "Sis daha da uzun süre kalır.", "req": "a1", "pos": Vector2i(2, 0), "set": {"smoke_duration": 13.0}},
		{"id": "b1", "name": "Hızlı Duman", "desc": "Duman yere düşer düşmez çıkar.", "req": "root", "pos": Vector2i(1, 2), "set": {"smoke_fuse": 0.1}},
		{"id": "b2", "name": "Uzun Kol", "desc": "Sis bombasını daha uzağa atarsın.", "req": "b1", "pos": Vector2i(2, 2), "set": {"smoke_throw": 14.5}},
		{"id": "b3", "name": "Radar Örtüsü", "desc": "Sisin içindekiler uydu haritasında görünmez.", "req": "b2", "pos": Vector2i(3, 2), "set": {"smoke_radar": 1.0}},
	]},
	"trap": {"type": 6, "name": "TUZAK", "short": "TUZAK", "nodes": [
		{"id": "root", "name": "Paslı Diş", "desc": "Yakalanan saniyede daha çok hasar alır.", "req": "", "pos": Vector2i(0, 1), "set": {"trap_dot": 14.0}},
		{"id": "a1", "name": "Keskin Diş", "desc": "Yakalanan saniyede daha da çok hasar alır.", "req": "root", "pos": Vector2i(1, 0), "set": {"trap_dot": 16.0}},
		{"id": "a2", "name": "Sıkı Kenet", "desc": "Yakalananı kurtarmak daha uzun sürer.", "req": "a1", "pos": Vector2i(2, 0), "set": {"trap_rescue": 5.0}},
		{"id": "b1", "name": "Geniş Çene", "desc": "Tuzağın tetik alanı büyür.", "req": "root", "pos": Vector2i(1, 2), "set": {"trap_trigger": 1.1}},
		{"id": "b2", "name": "Kamuflaj", "desc": "Tuzak ancak daha yakından fark edilir.", "req": "b1", "pos": Vector2i(2, 2), "set": {"trap_reveal_far": 4.0, "trap_reveal_near": 1.5}},
		{"id": "b3", "name": "Dev Çene", "desc": "Tetik alanı daha da büyür.", "req": "b2", "pos": Vector2i(3, 2), "set": {"trap_trigger": 1.3}},
	]},
}


static func get_node_def(tree: String, node_id: String) -> Dictionary:
	for n: Dictionary in TREES.get(tree, {}).get("nodes", []):
		if n["id"] == node_id:
			return n
	return {}


## Geçersiz ağaç/düğüm ve ön koşulu eksik düğümleri atar (profil dosyası + ağdan gelen veri için)
static func sanitize(raw: Variant) -> Dictionary:
	var out := {}
	var d: Dictionary = raw if raw is Dictionary else {}
	for tree: String in TREE_ORDER:
		var raw_have: Variant = d.get(tree, [])
		var have: Array = Array(raw_have) if (raw_have is Array or raw_have is PackedStringArray) else []
		var ok: Array[String] = []
		for n: Dictionary in TREES[tree]["nodes"]:
			if have.has(n["id"]) and (n["req"] == "" or ok.has(n["req"])):
				ok.append(n["id"])
		if not ok.is_empty():
			out[tree] = ok
	return out


## BASE + sahip olunan düğümlerin değerleri (düğümler tanım sırasıyla)
static func mods(owned: Variant) -> Dictionary:
	var m: Dictionary = BASE.duplicate()
	var o := sanitize(owned)
	for tree: String in o:
		for n: Dictionary in TREES[tree]["nodes"]:
			if (o[tree] as Array).has(n["id"]):
				for k: String in n["set"]:
					m[k] = float(n["set"][k])
	return m


## Bir oyuncunun (peer) güç değerleri — NetworkManager.players listesinden, her peer'da aynı sonuç
static func mods_for(peer_id: int) -> Dictionary:
	var nm: Node = Engine.get_main_loop().root.get_node_or_null("NetworkManager") if Engine.get_main_loop() else null
	if nm == null:
		return BASE.duplicate()
	return mods(nm.players.get(peer_id, {}).get("powers", {}))


static func owned_count(owned: Dictionary, tree: String) -> int:
	return (owned.get(tree, []) as Array).size()


static func next_cost(owned: Dictionary, tree: String) -> int:
	return int(round(COST_BASE * pow(COST_GROWTH, owned_count(owned, tree)) / 5.0)) * 5


## Detay paneli: değeri biçimle ("4.6 m", "%45", "Var")
static func format_value(key: String, v: float) -> String:
	match String(LABELS.get(key, ["", ""])[1]):
		"s":
			return String(TranslationServer.translate("%.1f sn")) % v
		"m":
			return "%.1f m" % v
		"hp":
			return String(TranslationServer.translate("%d can")) % int(round(v))
		"pct":
			return String(TranslationServer.translate("%%%d")) % int(round(v * 100.0))
		"x":
			return "×%.1f" % v
		"bool":
			return String(TranslationServer.translate("Var" if v > 0.0 else "Yok"))
	return str(v)
