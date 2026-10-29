## Lang.gd — dil seçimi (Türkçe / İngilizce). Statik, autoload değil (editör açıkken project.godot'ya dokunmuyoruz);
## kullananlar `preload` eder. GameSettings.apply_all çağırır.
##
## Kaynak dil TÜRKÇE: koddaki metinler olduğu gibi kalır, İngilizce karşılıkları LangEN.STRINGS'te (anahtar = Türkçe metnin
## kendisi). Godot Label/Button/OptionButton/Label3D metinlerini otomatik çevirir (auto_translate) — sabit metinler için kod
## değişmez. İçine sayı/isim giren metinler `tr("… %s …") % x` biçiminde yazılmalı (anahtar biçim dizgisinin kendisi).
##
## Ayar "language": "" = sistem dili (OS.get_locale_language: "tr" → Türkçe, diğerleri → İngilizce), "tr", "en".

extends RefCounted

const EN := preload("res://scenes/settings/LangEN.gd")
const SUPPORTED: Array[String] = ["tr", "en"]

static var _registered := false


## Ayar değerinden gerçek dil kodu
static func resolve(setting: String) -> String:
	if setting in SUPPORTED:
		return setting
	return "tr" if OS.get_locale_language() == "tr" else "en"


static func apply(setting: String) -> void:
	_register()
	TranslationServer.set_locale(resolve(setting))


static func current() -> String:
	return TranslationServer.get_locale().substr(0, 2)


## Çevirileri koddan kurar (CSV içe aktarma editör gerektirir). Türkçe için de birebir tablo eklenir: yoksa Godot eksik
## anahtarı proje yedek diline (varsayılan "en") düşürüp Türkçe seçiliyken İngilizce gösterirdi.
static func _register() -> void:
	if _registered:
		return
	_registered = true
	var en := Translation.new()
	en.locale = "en"
	var tr_t := Translation.new()
	tr_t.locale = "tr"
	for k: String in EN.STRINGS:
		en.add_message(k, EN.STRINGS[k])
		tr_t.add_message(k, k)
	TranslationServer.add_translation(en)
	TranslationServer.add_translation(tr_t)
