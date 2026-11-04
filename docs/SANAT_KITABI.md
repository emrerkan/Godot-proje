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

## 8. İkon dili v1 (yükseltme ekranı)

> Kapsam: `scenes/ui/UpgradePage.gd` (PROFİL penceresi) — stat satırları, güç ağacı sekmeleri/düğümleri/detay başlığı.
> Kodda karşılığı: `scenes/ui/IconSet.gd` → `IconSet.make(id, size, color) -> Control`.
> Referans: Call of Duty Warzone menüsü — nötr koyu zemin, beyaz/gri tipografi, tek vurgu rengi nadiren, **emoji yok**,
> ikonlar tek renkli, düz, keskin hatlı, elle çizilmiş gibi tutarlı. Bu bölüm sadece bu ekranı bağlar; HUD/PowerupManager `INFO`
> glifleri ayrı kalır (ileride aynı dile taşınabilir).

### 8.1 Izgara ve çizgi kuralları

| Kural | Değer |
|---|---|
| Tuval | **24 × 24 birim**. Çizimde `p_px = p_birim × (size / 24)`. Başlangıç sol üst (0,0) |
| Güvenli alan | 2…22 (kenarlardan 2 birim boşluk). Yoğun/kompakt ikon (kilit, bomba) 3…21'e inebilir |
| Çizgi kalınlığı | **2.0 birim** → `width = maxf(1.5, 2.0 × size / 24)` px. 1080p'de: size 20 → 1.67 px, 24 → 2.0, 28 → 2.33, 40 → 3.33 |
| Uç | **Kare/düz uç (butt)**. Yuvarlak uç yok |
| Köşe | **Sivri (miter)**. Yuvarlak köşe yok; dönüşlü şekiller pahlı çokgenle çizilir |
| "Daire" | Daire yok → **sekizgen** `OCT(cx, cy, r)`: köşeler `(cx ± 0.383r, cy ± 0.924r)` ve `(cx ± 0.924r, cy ± 0.383r)` (8 köşe, düz kenar üstte/altta/yanlarda). Kodda `draw_arc` yerine bu 8 nokta ya da `draw_arc(..., point_count = 8)` |
| Dolgu | **Kontur esastır.** Kapalı gövdelerde (işaretli `[d]`) aynı renkte **α 0.25 iç dolgu** (`draw_colored_polygon`, rengin alfa çarpanı). `[F]` = küçük tam dolu parça (α 1). Başka dolgu yok |
| Renk | Tek renk, `color` özelliği. Degrade, parlama, gölge, çok renkli parça, dış kontur **yok** |
| Optik hizalama | Koordinatlar kütle merkezine göre çizildi; **otomatik ortalama yapma**. İnce ikonlar (check, speed) kenarlara 2'ye kadar yaklaşabilir; ağır ikonlar (kilit, bomba, kalp) 3 birim boşlukla. Tolerans ±0.5 birim. Kapalı şekilde ilk nokta sonda tekrarlanır (`draw_polyline` kapanmaz) |
| Çizim sırası | önce `[d]` dolgu, sonra kontur, sonra `[F]` |
| Boyutlar | Stat satırı **28 px**, güç sekmesi **20 px**, düğüm **26 px**, detay başlığı **40 px**, düğme içi onay **16 px** |

### 8.2 Geometrik tarifler (24 birim ızgara)

Notasyon: `P[...]` = açık polyline, `C[...]` = kapalı (ilk nokta sona eklenir), `L(a)-(b)` = tek çizgi.

**health** — pahlı kalp `C[d]`
`C[(12,21) (3.5,12.5) (3.5,8) (6,4.5) (9.5,4.5) (12,7.5) (14.5,4.5) (18,4.5) (20.5,8) (20.5,12.5)]`

**speed** — ileri çift şevron (sağa)
`P[(6,5) (13,12) (6,19)]` + `P[(12,5) (19,12) (12,19)]`

**damage** — nişangah
`OCT(12,12,7)` = `C[(14.68,5.53) (18.47,9.32) (18.47,14.68) (14.68,18.47) (9.32,18.47) (5.53,14.68) (5.53,9.32) (9.32,5.53)]`
+ çentikler `L(12,2)-(12,5.5)`, `L(12,18.5)-(12,22)`, `L(2,12)-(5.5,12)`, `L(18.5,12)-(22,12)`
+ merkez `[F]` kare `(11,11) (13,11) (13,13) (11,13)`

**weapon** — şarjör (hafif konik gövde)
`C[(8,2.5) (16,2.5) (16,7) (19,21.5) (12,21.5) (8,7)]` `[d]`
+ besleme dudağı `L(8,5)-(16,5)`, mermi çizgileri `L(10,11)-(15,11)`, `L(10.8,15)-(16,15)`

**stamina** — şimşek `C[d]`
`C[(14,2) (5,13.5) (11,13.5) (10,22) (19,10.5) (13,10.5)]`

**bomb** — el bombası
gövde `OCT(12,14,7.5)` = `C[(14.87,7.07) (18.93,11.13) (18.93,16.87) (14.87,20.93) (9.13,20.93) (5.07,16.87) (5.07,11.13) (9.13,7.07)]` `[d]`
+ başlık `P[(9.5,7.07) (9.5,4) (14.5,4) (14.5,7.07)]`
+ kol `P[(14.5,5) (20.5,4.5) (20.5,9)]`
+ parça çizgileri `L(8,14)-(16,14)`, `L(12,10.5)-(12,17.5)`

**heal** — tıbbi artı `C[d]`
`C[(9,3) (15,3) (15,9) (21,9) (21,15) (15,15) (15,21) (9,21) (9,15) (3,15) (3,9) (9,9)]`

**sat** — uydu (yatay eksen)
gövde `C[(9.5,9.5) (14.5,9.5) (14.5,14.5) (9.5,14.5)]` `[d]`
+ sol panel `C[(2,8.5) (7,8.5) (7,15.5) (2,15.5)]` `[d]` + `L(4.5,8.5)-(4.5,15.5)`
+ sağ panel `C[(17,8.5) (22,8.5) (22,15.5) (17,15.5)]` `[d]` + `L(19.5,8.5)-(19.5,15.5)`
+ bağlantılar `L(7,12)-(9.5,12)`, `L(14.5,12)-(17,12)`
+ anten `L(12,9.5)-(12,5.5)` ve sinyal `P[(9.5,4.5) (12,2.5) (14.5,4.5)]`

**flash** — flaş bombası + ışınlar
gövde `C[(7,9) (13,9) (13,21.5) (7,21.5)]` `[d]`, kapak çizgisi `L(7,12)-(13,12)`, tetik `P[(8.5,9) (8.5,6) (11.5,6) (11.5,9)]`
+ ışınlar (patlama merkezi ≈ (17,7)): `L(17,2)-(17,4.5)`, `L(19.5,7)-(22,7)`, `L(20.8,3.2)-(19,5)`, `L(13.2,3.2)-(15,5)`, `L(20.8,10.8)-(19,9)`

**smoke** — pahlı duman kütlesi `C[d]`
`C[(5,19) (3,16) (4,12.5) (7.5,11) (8,7.5) (11.5,5) (15,6) (16.5,9) (19.5,9.5) (21.5,13) (21,17) (19,19)]`
+ sis çizgileri `L(7,21.5)-(12,21.5)`, `L(14,21.5)-(18,21.5)`

**trap** — ayı kapanı (açık, iki çene dişli)
taban `C[(3,17) (21,17) (21,20.5) (3,20.5)]` `[d]`
+ sol çene `P[(3,17) (4,8) (6.5,12.5) (8,5) (10,12) (12,17)]`
+ sağ çene (ayna) `P[(21,17) (20,8) (17.5,12.5) (16,5) (14,12) (12,17)]`

**lock** — kilit
gövde `C[(5,10.5) (19,10.5) (19,21) (5,21)]` `[d]`
+ kement `P[(8,10.5) (8,6.5) (10,3.5) (14,3.5) (16,6.5) (16,10.5)]`
+ anahtar deliği `[F]` kare `(11,14) (13,14) (13,16) (11,16)` + `L(12,16)-(12,18.5)`

**check** — onay (çizgi 2.5 birim, tek istisna)
`P[(4,12.5) (9.5,18) (20,6.5)]`

### 8.3 Sade palet (yükseltme ekranı)

Beyaz-gri-siyah ekran; kehribar yalnızca **YÜKSELT / AÇ düğmesi** ve **XP** göstergesinde. İkon/bar/vurgu için kehribar, `SIGNAL`, `SUCCESS` kullanılmaz.

| Öğe | Durum | Renk |
|---|---|---|
| Stat ikonu | seviye 0 | `TEXT_DIM` |
| | seviye ≥ 1 / satır hover | `TEXT` |
| İkon kutusu (stat satırı, 48×48) | her durum | zemin `SURFACE_2`, 1 px `BORDER`, ikon 28 px ortada |
| Satır başlığı (stat adı) | | `TEXT`, `font_caps` 20 px |
| Etki metni "Can %25 artar" | seviye ≥ 1 | `TEXT_DIM`, 16 px |
| | seviye 0 ("Henüz yükseltilmedi") | `TEXT_DIM` α 0.6 |
| Özet kartı değeri "+%25" | seviye ≥ 1 | `TEXT`, `font_mono` |
| | seviye 0 "—" | `TEXT_DIM` α 0.5 |
| Özet kartı etiketi | | `TEXT_DIM`, `font_caps` |

**Tek bar** (satır içinde, isim/etki metninin altında veya yanında; ilerleme yazısı YOK, ayraç/çentik YOK):
- Yükseklik **6 px**, genişlik sütun kadar (≥ 360 px), **keskin köşe** (pahsız, `corner_detail` yok).
- Zemin: `Color(1,1,1,0.10)`; 1 px `BORDER` dış kenar.
- Dolgu genişliği = `seviye / MAX_LEVEL` (tween 0.25 sn, `TRANS_QUAD`). Seviye 1–4: dolgu `TEXT_DIM`. Düz renk, degrade yok.
- **MAKS durumu:** dolgu `TEXT` (saf beyaz, α 1), dış kenar da `TEXT` α 0.9 1 px; kehribar DEĞİL. Düğme pasif, içinde `check` (16 px, `TEXT`) + "MAKS" (`TEXT`). Düğme zemini `Color(1,1,1,0.10)`, kenar `BORDER`.
- YÜKSELT düğmesi `PrimaryButton` (kehribar); yetersiz XP'de pasif (`TEXT_DIM`, kehribar yok), fiyat metni `DANGER`.

**Güç ağacı** (ikon dili aynı; düğümler 26 px ikon, düğüm kutusu 56×56, 1 px kenar):

| Düğüm durumu | Kutu zemini | Kenar | İkon |
|---|---|---|---|
| Kilitli (ön koşul yok) | `SURFACE` | `BORDER` (α 0.10'a indir) | `lock`, `TEXT_DIM` α 0.45 |
| Açılabilir | `SURFACE_2` | `TEXT_DIM` α 0.6, 1 px | düğümün ikonu, `TEXT_DIM` |
| Açık (alınmış) | `Color(1,1,1,0.14)` | `TEXT` α 0.9, 1 px | düğümün ikonu, `TEXT`; sağ üst köşede `check` 12 px `TEXT` |
| Seçili (ek) | durumu korur | kenar 2 px `TEXT` + `add_brackets` (`FRAME`) | değişmez |

Bağlantı çizgileri (`_draw_links`): açık→açık `TEXT` α 0.8, 2 px; açılabilir hedef `TEXT_DIM` α 0.4, 1 px; kilitli `BORDER` 1 px. Ağaç sekmesi: 20 px ikon + `font_caps`, seçili `TEXT` + beyaz 2 px alt çizgi, diğerleri `TEXT_DIM`. Detay başlığı: 64×64 `SURFACE_2` kutu (1 px `BORDER`) içinde 40 px ikon `TEXT`. Ağaç ikon eşlemesi: bomb→`bomb`, heal→`heal`, sat→`sat`, flash→`flash`, smoke→`smoke`, trap→`trap`. Düğüm ikonu ağacın ikonu; `lock`/`check` durum içindir.

### 8.4 Yasaklar ve kabul listesi

- Yasak: emoji/Unicode sembol ikonu, yuvarlak uç veya köşe, degrade/parlama/gölge, renk başına ikon (hepsi tek nötr ton), ince (<1.5 px) çizgi, çok parçalı bar, ilerleme yüzdesi veya "2/5" yazısı, mutlak sayı ("187", "4.6 m").
- Etki dili yalnızca yüzde: "Can %25 artar", "Patlama alanı %15 artar" (Türkçe `%` öne gelir; İngilizce `LangEN`'de karşılığı eklenir).
- Kabul: 13 ikon 20 px'te (1080p) ayırt edilebilir; yan yana konunca aynı ağırlık ve aynı keskinlik; ekranda kehribar yalnızca düğme + XP.
