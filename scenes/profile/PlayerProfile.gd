## PlayerProfile.gd — kalıcı oyuncu profili: XP + KARAKTER BAŞINA yükseltmeler.
## Statik sınıf (autoload değil — editör açıkken project.godot'ya dokunmuyoruz). Kullananlar `preload` eder.
##
## Şimdilik yerel dosya (user://profile.cfg). Steam sürümünde depolama Steam Cloud / sunucuya taşınacak —
## o yüzden tüm okuma/yazma bu dosyada toplandı (load_profile/save). Not: yerel dosya elle değiştirilebilir (hile riski,
## bkz docs/PROJE_GECMISI.md "XP fikir havuzu").
##
## Ekonomi: tek bir harcanabilir XP havuzu (`xp`), hangi karaktere harcanacağına oyuncu karar verir.
## Fiyat o KARAKTERİN toplam yükseltme sayısıyla katlanır → her açılış daha zor:
##   fiyat = COST_BASE × COST_GROWTH ^ (karakterin aldığı yükseltme sayısı)
## Her stat en fazla MAX_LEVEL. Seviyeler oyunda NetworkManager.players[peer]["upgrades"] ile herkese yayılır,
## Player.initialize `multipliers()` ile uygular (can/hasar tüm peer'larda aynı olsun diye).

class_name PlayerProfile
extends RefCounted

const SAVE_PATH := "user://profile.cfg"
const MAX_LEVEL := 5
const COST_BASE := 150.0
const COST_GROWTH := 1.18
const CHARACTERS: Array[String] = ["Tank", "Visioner", "Runner", "Sniper", "Medic"]

## Stat sırası UI'da da bu sırayla gösterilir. per_level = seviye başına oran.
const STATS: Array[String] = ["health", "speed", "damage", "weapon", "stamina"]
const STAT_INFO := {
	"health":  {"name": "CAN",          "glyph": "❤", "per_level": 0.05, "desc": "+%%%d maksimum can"},
	"speed":   {"name": "HIZ",          "glyph": "➤", "per_level": 0.03, "desc": "+%%%d hareket hızı"},
	"damage":  {"name": "HASAR",        "glyph": "✸", "per_level": 0.04, "desc": "+%%%d mermi hasarı"},
	"weapon":  {"name": "SİLAH",        "glyph": "⟳", "per_level": 0.04, "desc": "%%%d hızlı şarjör ve atış"},
	"stamina": {"name": "DAYANIKLILIK", "glyph": "⚡", "per_level": 0.10, "desc": "+%%%d koşu/çömelme süresi"},
}

static var xp := 0                 # harcanabilir
static var total_xp := 0           # şimdiye kadar kazanılan (profil seviyesi)
static var upgrades := {}          # karakter → {stat: seviye}
static var _loaded := false


# ─────────────────────────────────────────────
#  Depolama
# ─────────────────────────────────────────────

static func load_profile() -> void:
	_loaded = true
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	xp = int(cfg.get_value("profile", "xp", 0))
	total_xp = int(cfg.get_value("profile", "total_xp", 0))
	for c in CHARACTERS:
		upgrades[c] = sanitize(cfg.get_value("upgrades", c, {}))


static func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("profile", "xp", xp)
	cfg.set_value("profile", "total_xp", total_xp)
	for c: String in upgrades:
		cfg.set_value("upgrades", c, upgrades[c])
	cfg.save(SAVE_PATH)


static func _ensure_loaded() -> void:
	if not _loaded:
		load_profile()


# ─────────────────────────────────────────────
#  XP
# ─────────────────────────────────────────────

static func add_xp(amount: int) -> void:
	_ensure_loaded()
	if amount <= 0:
		return
	xp += amount
	total_xp += amount
	save()


static func get_xp() -> int:
	_ensure_loaded()
	return xp


## Profil seviyesi (gösterim): her seviye bir öncekinden biraz daha fazla XP ister
static func profile_level() -> int:
	_ensure_loaded()
	return int(floor(sqrt(total_xp / 250.0))) + 1


# ─────────────────────────────────────────────
#  Yükseltmeler
# ─────────────────────────────────────────────

## Geçersiz/eksik anahtarları temizler, seviyeleri 0..MAX_LEVEL'a kırpar (ağdan gelen veri için de kullanılır)
static func sanitize(raw: Variant) -> Dictionary:
	var out := {}
	var d: Dictionary = raw if raw is Dictionary else {}
	for s in STATS:
		out[s] = clampi(int(d.get(s, 0)), 0, MAX_LEVEL)
	return out


static func get_levels(character: String) -> Dictionary:
	_ensure_loaded()
	return sanitize(upgrades.get(character, {}))


static func upgrade_count(character: String) -> int:
	var n := 0
	var lv := get_levels(character)
	for s in STATS:
		n += int(lv[s])
	return n


static func next_cost(character: String) -> int:
	return int(round(COST_BASE * pow(COST_GROWTH, upgrade_count(character)) / 5.0)) * 5


static func can_upgrade(character: String, stat: String) -> bool:
	return get_levels(character)[stat] < MAX_LEVEL and get_xp() >= next_cost(character)


static func buy(character: String, stat: String) -> bool:
	if not STAT_INFO.has(stat) or not can_upgrade(character, stat):
		return false
	var cost := next_cost(character)
	var lv := get_levels(character)
	lv[stat] = int(lv[stat]) + 1
	upgrades[character] = lv
	xp -= cost
	save()
	return true


## Seviyelerden çarpanlar — Player.initialize ve CharacterSelect kullanır
static func multipliers(levels: Variant) -> Dictionary:
	var lv := sanitize(levels)
	var w: float = lv["weapon"] * STAT_INFO["weapon"]["per_level"]
	return {
		"health":    1.0 + lv["health"] * STAT_INFO["health"]["per_level"],
		"speed":     1.0 + lv["speed"] * STAT_INFO["speed"]["per_level"],
		"damage":    1.0 + lv["damage"] * STAT_INFO["damage"]["per_level"],
		"reload":    1.0 - w,               # şarjör süresi çarpanı (küçük = hızlı)
		"fire_rate": 1.0 - w * 0.75,        # atış aralığı çarpanı (küçük = hızlı)
		"stamina":   1.0 + lv["stamina"] * STAT_INFO["stamina"]["per_level"],
	}


## UI metni: "+%15 maksimum can" gibi (seviye × oran)
static func stat_bonus_text(stat: String, level: int) -> String:
	var info: Dictionary = STAT_INFO[stat]
	return String(TranslationServer.translate(info["desc"])) % int(round(level * float(info["per_level"]) * 100.0))
