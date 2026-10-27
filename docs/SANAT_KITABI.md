# TacticalDark — Sanat Kitabı (Görsel Kimlik)

> Arayüz ve görsel varlıklar için tek doğru kaynak. Kodda karşılığı: `scenes/ui/UITheme.gd`.
> Yeni bir ekran, ikon, model veya efekt bu kurallara uymalı. Bir kural değişirse önce burası, sonra UITheme güncellenir.
>
> **Sürüm 2 — "Sis & Cam"** (Ekim 2026). Kullanıcının referansı: Battlefield 1 menüsü — saydam koyu cam paneller,
> beyaz ince kenarlar ve köşeler, beyaz metin, dumanlı arka plan. v1 ("Sodyum & Gece Operasyonu") üzerine kurulu:
> kesik köşeler, köşe braketleri, mono sayılar ve takım sembolleri korundu; renk dili beyaza döndü, kehribar azaldı.

## 1. Kimlik

Oyuncu gece operasyonundaki bir özel tim üyesi. Dünya beton, çelik, karanlık ve **sis**. Arayüz dumanlı arka planın
üstünde yüzen **cam paneller**: arkası sezilir, kenarları ince beyaz çizgi, köşelerinde beyaz braketler.
Tek sıcak renk hâlâ **sodyum kehribarı**. Ama artık sadece en önemli eylem ve bilgi için kullanılıyor.

**Üç kelime:** sis · cam · askeri kesinlik.

## 2. Renk dili

| Rol | Ad | Değer | Ne için |
|---|---|---|---|
| Zemin | Duman siyahı | `BG` (0.045, 0.052, 0.06) | Arka planlar |
| Cam panel | Saydam koyu | `SURFACE` α 0.58, `SURFACE_2` α 0.62, `SURFACE_3` α 0.7 | Paneller, kartlar (arka plan sezilsin) |
| Kenar | İnce beyaz | `BORDER` beyaz α 0.16 | Panel/düğme kenarları, ayraçlar |
| Köşe | Beyaz braket | `FRAME` beyaz α 0.85 | Önemli panellerin köşe braketleri |
| Ana metin | Beyaz | `TEXT` | Başlık, gövde, seçili sekme |
| İkincil metin | Soğuk gri | `TEXT_DIM` | Etiketler, açıklamalar, seçili olmayan sekme |
| Vurgu (AZ) | Sodyum kehribarı | `ACCENT` | **Sadece** birincil buton, logo "DARK", XP, oda kodu |
| Bilgi | Fosfor | `SIGNAL` | Durum/istihbarat etiketleri |
| Tehlike | Kızılötesi | `DANGER` | Hasar, uyarı, hata |

**Kurallar**
- Bir ekranda kehribar **en fazla 1–2 öğede** olsun. Seçim/odak durumları beyazla gösterilir.
- Paneller opak olmaz: arka plan (sis, askerler) her zaman hafifçe sezilmeli.
- Renk tek başına bilgi taşımaz: takımlar renk **ve sembol** ile ayrışır (§4).

## 3. Şekil dili

- **Küçük pah:** Köşeler 45° kesik ama küçük (`RADIUS` 4). BF1'deki keskin dikdörtgene yakın.
- **Beyaz köşe braketleri:** ┌ ┐ └ ┘ — `UITheme.add_brackets(control)` (varsayılan renk `FRAME`).
  Ana menü paneli, operatör kartı, profil/ayar pencereleri, HUD oyuncu kartı, menü penceresi. Oda kodu kehribar braketli.
- **Düğmeler:** Cam (saydam + ince beyaz kenar). Hover'da beyazlaşır, basınca beyaz dolar ve yazı koyulaşır.
  **Birincil düğme** kehribar plaka (altta koyu kenar), ekranda tek ana eylem.
- **Sekmeler (BF1):** Büyük harf, geniş aralıklı. Seçili olan beyaz yazı ve beyaz alt çizgi, diğerleri soluk gri.
- **Lobi takım kartları:** Asimetrik pah (sol üst + sağ alt) — künye formu.

## 4. Takımlar

| Takım | Sembol |
|---|---|
| Mavi | ● |
| Kırmızı | ▲ |
| Yeşil | ■ |
| Sarı | ◆ |

UI'da takım adı her zaman `UITheme.team_tag(id)` ile yazılır ("▲ KIRMIZI").

## 5. Tipografi

| Kullanım | Font |
|---|---|
| Başlıklar | `font_title` (kalın, geniş aralık, büyük harf) |
| Etiketler / sekmeler | `font_caps` (aralıklı, büyük harf) |
| Sayılar, kodlar, sayaçlar | `font_mono` (Cascadia Mono / Consolas / DejaVu Sans Mono) |

**Bekleyen karar:** BF1'deki ince, geniş aralıklı yazı tipi için OFL lisanslı bir font dosyası eklemek.
Kullanıcı: "şimdilik kalsın, sonra düşünelim". Şu an Godot'un varsayılan fontu kullanılıyor.

## 6. Atmosfer ve sis

- **Menü/lobi arka planı:**
  - 3D devriye askerleri + hacimsel sis (`MenuBackground3D.FOG_DENSITY`). Fener ve fare ışığı sisin içinde huzme gibi görünür.
  - Üst katman `MenuOverlay.gdshader`: süzülen iki katmanlı duman (fbm, ekranın altında yoğun), vinyet, hafif tarama çizgisi ve gren.
- **Karakter seçimi:** Aynı duman katmanı, soğuk gri degradenin üstünde.
- **Oyun içi:** Neredeyse tamamen karanlık. **Sis bombası** (`SmokeCloud.gd`) ışık alan duman bulutu bırakır. Karanlıkta zor seçilir, el feneri vurunca beyaz bir perde gibi parlar.

## 7. Erişilebilirlik (`.claude/rules/ui-code.md`'den uyarlandı)

- Renk körlüğü: takım sembolleri ✅. **Yapılacak:** renk körü modu.
- Ölçeklenebilir yazı, gamepad desteği, "hareketi azalt" ayarı: **yapılacak**.
- Saydam paneller: metnin okunması için panel arkası en az α 0.55 koyu tutulur. Açık renkli arka plana konacak panel olursa saydamlık azaltılmalı.
- Yerelleştirme: metinler şimdilik koda gömülü Türkçe. Steam'de çok dil gerekirse `tr()` sistemine geçilecek.
