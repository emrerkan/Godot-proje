## MatchStats.gd — kalıcı maç istatistikleri: karakter başına öldürme / ölüm / maç / galibiyet.
## Statik sınıf (autoload değil — editör açıkken project.godot'ya dokunmuyoruz). Kullananlar `preload` eder.
##
## Şimdilik yerel dosya (user://stats.cfg). Backend hazır olunca depolama TAMAMEN bu dosyada değişir
## (record_match → API'ye gönder, get_* → API'den çek + yerel önbellek); çağıranlar etkilenmez.
## Not: yerel dosya elle değiştirilebilir → bu sayılar doğrulanmış DEĞİL, Steam sürümüne taşınmaz.
##
## Veri düzeni: karakter toplamları, maç listesinden AYRI tutulur. Maç listesi RECENT_MAX ile sınırlı;
## eski kayıtlar atılınca toplamlar ve en iyi maç DEĞİŞMEZ. İsabet sayısı tutulmaz (kullanıcı kararı).

class_name MatchStats
extends RefCounted

const PROFILE := preload("res://scenes/profile/PlayerProfile.gd")

const SAVE_PATH := "user://stats.cfg"
const VERSION := 1
const RECENT_MAX := 100
const RESULTS: Array[String] = ["win", "loss", "draw", "abandoned"]

## İçgörüler için eşikler
const MIN_MATCHES := 5            # karakter karşılaştırması için en az maç
const TREND_MIN_TOTAL := 25       # eğilim içgörüsü için toplam maç
const TREND_RECENT := 20          # eğilimde bakılan son maç sayısı
const TREND_BAND := 0.10          # genel K/D'ye göre bu orandan fazla sapma = üstünde/altında

static var _path := SAVE_PATH
static var _loaded := false
static var _by_char := {}         # karakter → {matches, wins, kills, deaths}
static var _recent: Array = []    # en yeni başta; {character, kills, deaths, result, ts}
static var _best := {}            # {character, kills, deaths} ya da {}


# ─────────────────────────────────────────────
#  Depolama
# ─────────────────────────────────────────────

## Testler gerçek veriyi ezmesin diye: yolu değiştirir, bellekteki durumu sıfırlar
static func _set_save_path_for_tests(path: String) -> void:
	_path = path
	_loaded = false
	_reset()


static func _reset() -> void:
	_by_char = {}
	for c in PROFILE.CHARACTERS:
		_by_char[c] = _empty_counts()
	_recent = []
	_best = {}


static func _empty_counts() -> Dictionary:
	return {"matches": 0, "wins": 0, "kills": 0, "deaths": 0}


static func _ensure_loaded() -> void:
	if not _loaded:
		load_stats()


static func load_stats() -> void:
	_loaded = true
	_reset()
	var cfg := ConfigFile.new()
	if cfg.load(_path) != OK:
		return
	# Karakter toplamları
	for c in PROFILE.CHARACTERS:
		_by_char[c] = _sanitize_counts(cfg.get_value("totals", c, {}))
	# Maç listesi (en yeni başta)
	var raw_recent: Variant = cfg.get_value("recent", "list", [])
	if raw_recent is Array:
		for e: Variant in raw_recent:
			var m := _sanitize_match(e)
			if not m.is_empty():
				_recent.append(m)
			if _recent.size() >= RECENT_MAX:
				break
	# En iyi maç
	_best = _sanitize_best(cfg.get_value("best", "match", {}))


static func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("meta", "version", VERSION)
	for c in PROFILE.CHARACTERS:
		cfg.set_value("totals", c, _by_char[c])
	cfg.set_value("recent", "list", _recent)
	cfg.set_value("best", "match", _best)
	cfg.save(_path)


static func _to_int(v: Variant) -> int:
	if v is int:
		return v
	if v is float:
		return int(v)
	if v is String and (v as String).is_valid_int():
		return int(v)
	return 0


static func _sanitize_counts(raw: Variant) -> Dictionary:
	var d: Dictionary = raw if raw is Dictionary else {}
	var out := _empty_counts()
	for k: String in out:
		out[k] = maxi(0, _to_int(d.get(k, 0)))
	# Galibiyet maç sayısını aşamaz
	out["wins"] = mini(out["wins"], out["matches"])
	return out


static func _sanitize_match(raw: Variant) -> Dictionary:
	if not (raw is Dictionary):
		return {}
	var d: Dictionary = raw
	var c: String = str(d.get("character", ""))
	var r: String = str(d.get("result", ""))
	if not PROFILE.CHARACTERS.has(c) or not RESULTS.has(r):
		return {}
	var ts: Variant = d.get("ts", 0)
	return {
		"character": c,
		"kills": maxi(0, _to_int(d.get("kills", 0))),
		"deaths": maxi(0, _to_int(d.get("deaths", 0))),
		"result": r,
		"ts": float(ts) if (ts is int or ts is float) else 0.0,
	}


static func _sanitize_best(raw: Variant) -> Dictionary:
	if not (raw is Dictionary):
		return {}
	var d: Dictionary = raw
	var c: String = str(d.get("character", ""))
	if not PROFILE.CHARACTERS.has(c):
		return {}
	return {
		"character": c,
		"kills": maxi(0, _to_int(d.get("kills", 0))),
		"deaths": maxi(0, _to_int(d.get("deaths", 0))),
	}


# ─────────────────────────────────────────────
#  Kayıt
# ─────────────────────────────────────────────

## Biten bir maçı kaydeder. result: "win" | "loss" | "draw" | "abandoned".
## draw ve abandoned maç sayılır ama galibiyet sayılmaz. Geçersiz karakter/sonuç yok sayılır.
static func record_match(character: String, kills: int, deaths: int, result: String) -> void:
	if not PROFILE.CHARACTERS.has(character) or not RESULTS.has(result):
		return
	_ensure_loaded()
	var k := maxi(0, kills)
	var d := maxi(0, deaths)

	var counts: Dictionary = _by_char[character]
	counts["matches"] += 1
	if result == "win":
		counts["wins"] += 1
	counts["kills"] += k
	counts["deaths"] += d

	# Maç listesi: en yeni başta, RECENT_MAX'ı aşan eskiler atılır (toplamlar etkilenmez)
	_recent.push_front({
		"character": character, "kills": k, "deaths": d,
		"result": result, "ts": Time.get_unix_time_from_system(),
	})
	while _recent.size() > RECENT_MAX:
		_recent.pop_back()

	# En iyi maç: en çok öldürme, eşitlikte en az ölüm
	if _best.is_empty() \
			or k > int(_best["kills"]) \
			or (k == int(_best["kills"]) and d < int(_best["deaths"])):
		_best = {"character": character, "kills": k, "deaths": d}
	save()


# ─────────────────────────────────────────────
#  Okuma
# ─────────────────────────────────────────────

## Tüm karakterlerin toplamı: {matches, wins, kills, deaths}
static func get_totals() -> Dictionary:
	_ensure_loaded()
	var out := _empty_counts()
	for c in PROFILE.CHARACTERS:
		var counts: Dictionary = _by_char[c]
		for k: String in out:
			out[k] += int(counts[k])
	return out


## PlayerProfile.CHARACTERS'taki HER karakter → {matches, wins, kills, deaths} (oynanmamışsa sıfırlar)
static func get_by_character() -> Dictionary:
	_ensure_loaded()
	var out := {}
	for c in PROFILE.CHARACTERS:
		out[c] = (_by_char[c] as Dictionary).duplicate()
	return out


## En yeni n maç (en yeni başta): {character, kills, deaths, result, ts}
static func get_recent(n: int) -> Array:
	_ensure_loaded()
	var out: Array = []
	for i in mini(maxi(n, 0), _recent.size()):
		out.append((_recent[i] as Dictionary).duplicate())
	return out


## {character, kills, deaths}; kayıt yoksa {}
static func get_best_match() -> Dictionary:
	_ensure_loaded()
	return _best.duplicate()


static func kd(kills: int, deaths: int) -> float:
	if deaths <= 0:
		return float(kills)
	return float(kills) / float(deaths)


## 0-100 tam sayı yüzde
static func win_rate(wins: int, matches: int) -> int:
	if matches <= 0:
		return 0
	return clampi(roundi(100.0 * float(wins) / float(matches)), 0, 100)


# ─────────────────────────────────────────────
#  İçgörüler
# ─────────────────────────────────────────────

## [{text, args}] — text çeviri anahtarı (LangEN'de), gösterim: tr(text) % args. Eşitlikte CHARACTERS sırası kazanır.
static func insights() -> Array:
	_ensure_loaded()
	var out: Array = []

	# 1) En az MIN_MATCHES maçlı karakterler arasında en yüksek K/D
	var best_kd_char := ""
	var best_kd := -1.0
	for c in PROFILE.CHARACTERS:
		var counts: Dictionary = _by_char[c]
		if int(counts["matches"]) < MIN_MATCHES:
			continue
		var v := kd(int(counts["kills"]), int(counts["deaths"]))
		if v > best_kd:
			best_kd = v
			best_kd_char = c
	if not best_kd_char.is_empty():
		out.append({"text": "En verimli: %s (K/D %.2f)", "args": [best_kd_char, best_kd]})

	# 2) En az MIN_MATCHES maçlı, en az 1 galibiyetli karakterler arasında en yüksek kazanma oranı
	var best_wr_char := ""
	var best_wr := -1.0
	for c in PROFILE.CHARACTERS:
		var counts: Dictionary = _by_char[c]
		var m := int(counts["matches"])
		var w := int(counts["wins"])
		if m < MIN_MATCHES or w < 1:
			continue
		var r := float(w) / float(m)
		if r > best_wr:
			best_wr = r
			best_wr_char = c
	if not best_wr_char.is_empty():
		var bc: Dictionary = _by_char[best_wr_char]
		out.append({"text": "En çok kazandıran: %s (%%%d)",
				"args": [best_wr_char, win_rate(int(bc["wins"]), int(bc["matches"]))]})

	# 3) En çok oynanan karakter (en az 1 maç)
	var most_char := ""
	var most_n := 0
	for c in PROFILE.CHARACTERS:
		var n := int((_by_char[c] as Dictionary)["matches"])
		if n > most_n:
			most_n = n
			most_char = c
	if most_n > 0:
		out.append({"text": "En çok oynanan: %s (%d maç)", "args": [most_char, most_n]})

	# 4) Eğilim: son TREND_RECENT maçın K/D'si ile genel K/D
	var totals := get_totals()
	if int(totals["matches"]) >= TREND_MIN_TOTAL and _recent.size() >= TREND_RECENT:
		var rk := 0
		var rd := 0
		for i in TREND_RECENT:
			rk += int(_recent[i]["kills"])
			rd += int(_recent[i]["deaths"])
		var recent_kd := kd(rk, rd)
		var overall_kd := kd(int(totals["kills"]), int(totals["deaths"]))
		if recent_kd > overall_kd * (1.0 + TREND_BAND):
			out.append({"text": "Son 20 maçta K/D genel ortalamanın üstünde", "args": []})
		elif recent_kd < overall_kd * (1.0 - TREND_BAND):
			out.append({"text": "Son 20 maçta K/D genel ortalamanın altında", "args": []})
		else:
			out.append({"text": "Son 20 maçta K/D genel ortalamana yakın", "args": []})

	# 5) En iyi maç (en az 1 öldürme)
	if not _best.is_empty() and int(_best["kills"]) >= 1:
		out.append({"text": "En iyi maç: %s ile %d öldürme, %d ölüm",
				"args": [_best["character"], int(_best["kills"]), int(_best["deaths"])]})

	return out
