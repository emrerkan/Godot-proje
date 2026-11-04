# UX Spec: Yükseltme Ekranı (PROFİL → KARAKTER GELİŞİMİ / GÜÇ GELİŞİMİ)

> **Status**: Approved for implementation (kararlar kullanıcı isteğiyle onaylı; açık noktalar en sonda)
> **Author**: ux-designer (orkestra şefi sözleşmeleriyle)
> **Last Updated**: 2026-11-04
> **Journey Phase(s)**: Meta ilerleme — maçlar arası, ana menüden (maç içi değil)
> **Platform Target**: Windows PC; birincil fare+klavye, ikincil gamepad (menüde yön tuşu/A/B)
> **Template**: UX Spec
> **Kod**: `scenes/ui/UpgradePage.gd` (+ yeni `scenes/ui/IconSet.gd`, `PlayerProfile.gd`, `PowerTrees.gd`)
> **Görsel dil**: `docs/SANAT_KITABI.md` "Sis & Cam" + `UITheme`; bu ekranda Call of Duty Warzone menüsü gibi SADE: nötr beyaz-gri, düz, keskin, ince çizgi, özel çizilmiş ikon.

---

## Purpose & Player Need

Oyuncu bu ekrana **"kazandığım XP'yi karakterimi/gücümü güçlendirmeye harcamak"** için gelir.
Ekran üç soruya tek bakışta cevap vermeli: (1) Şu an ne kadar güçlüyüm? (2) Bir sonraki adım ne verir, ne kadar tutar? (3) Param yetiyor mu?

Bu revizyonun üç kararı:

1. **Tek bar** — her stat için seviye/MAX_LEVEL oranında dolan tek ince bar. Seviye sayısı/yüzde barın yanında ya da üstünde YAZILMAZ.
2. **Yüzde dili** — hiçbir yerde mutlak değer (187 can, 4.6 m, 2.5 sn) yok. Etki "Can %25 artar" biçiminde söylenir. Amaç: oyuncu yönü ve büyüklüğü hisseder, formülü/tam sayıyı ezberlemez.
3. **Sade renk + özel ikon** — emoji/Unicode glyph yok; kodla çizilen vektör ikon (`IconSet`). Kehribar yalnız birincil eylem + XP.

## Player Context on Arrival

- Genelde bir maç bitti, XP kazanıldı; sakin, meraklı, zaman baskısı yok. Menü fon müziği/sisli arka plan arkada.
- Gönüllü gelir (PROFİL). İlk kez gelen oyuncu için XP=0: ekran boş görünmemeli, ne yapılacağı belli olmalı (bkz. States).
- Oyuncu hızlı karar verir: "en çok neye ihtiyacım var" → satırlar yan yana kıyaslanabilir olmalı (aynı ikon boyu, aynı bar uzunluğu).

## Navigation Position

`Ana Menü → PROFİL (sağ üst gezinme) → bulanık modal → [KARAKTER GELİŞİMİ | GÜÇ GELİŞİMİ] → (karakter sekmesi | güç sekmesi)`.
Maç içinden erişilmez. Pencere başlıksız, ✕ ekranın sağ üstünde (mevcut, değişmiyor).

## Entry & Exit Points

| Entry Source | Trigger | Player carries this context |
|---|---|---|
| MainMenu gezinme PROFİL | tık / Enter | `refresh()` her açılışta; son açık sekme ve seçili karakter/ağaç korunur (oturum içi) |
| Maç sonu → menü | kendiliğinden değil | XP değişmiş olabilir → `refresh()` yeniler |

| Exit Destination | Trigger | Notes |
|---|---|---|
| Ana menü | ESC / ✕ / dışarı tık / gamepad B | Satın alımlar anında kaydedilir (`PlayerProfile.buy/buy_power`), "kaydet" adımı yok, geri alma yok |

---

## Layout Specification

Tüm değerler 1920×1080 tabanında piksel. Kart ~1667×1000, içerik alanı ≈ 1580 × 930 (padding sonrası).

### Information Hierarchy

**KARAKTER GELİŞİMİ** (önem sırası):
1. Seçili karakterin **yüzde özeti** ("CAN +%25 …") — "ne kadar güçlüyüm"
2. 5 stat satırı: **etki metni + tek bar + YÜKSELT** — "bir sonrakini alayım mı"
3. XP çipi (sağ üst, kehribar) — "param"
4. Karakter sekmeleri — gezinme (düşük ağırlık)
5. Maliyet notu (alt, soluk) — "yükseltmeler karaktere özel, maliyet ortak artar"

**GÜÇ GELİŞİMİ**:
1. Seçili düğümün detayı (sağ panel): ad, açıklama, **yüzde etkiler**, AÇ düğmesi
2. Ağaç tuvali (hangi düğüm açık/açılabilir/kilitli — şekil+ikonla ayırt edilir)
3. XP çipi, 4. Güç sekmeleri, 5. Maliyet notu

### ASCII Wireframe

```
KARAKTER GELİŞİMİ
┌──────────────────────────────────────────────────────────────────────────────┐
│ [KARAKTER GELİŞİMİ] [GÜÇ GELİŞİMİ]                      ┌───────────────┐   │
│                                                          │  ◆ 1240 XP    │   │
│                                                          │ PROFİL SEV. 7 │   │
│ [ TANK ][ VİZYONER ][ RUNNER ][ SNIPER ][ MEDIC ]        └───────────────┘   │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ TANK · ÖN HAT                                                            │ │
│ │ (+)CAN     (»)HIZ     (◎)HASAR    ([])SİLAH    (/)DAYANIKLILIK           │ │
│ │ +%25       —          +%12        +%8          —                         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [ic44] CAN              ████████████████░░░░░░░░░░░░░░░░   [YÜKSELT·150XP]│ │
│ │        Can %25 artar                                                     │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ [ic44] HIZ              ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   [YÜKSELT·150XP]│ │
│ │        Henüz yükseltilmedi                                               │ │
│ │  … HASAR / SİLAH / DAYANIKLILIK (aynı anatomi) …                         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ Yükseltme sadece seçili karaktere uygulanır · sonraki yükseltme: 150 XP      │
└──────────────────────────────────────────────────────────────────────────────┘

GÜÇ GELİŞİMİ
┌──────────────────────────────────────────────────────────────────────────────┐
│ [KARAKTER GELİŞİMİ] [GÜÇ GELİŞİMİ]                              [ XP çipi ] │
│ [bomb BOMBA][heal SAĞLIK][sat UYDU][flash FLAŞ][smoke SİS][trap TUZAK]       │
│ ┌──────────────────────────────────────────────┐ ┌──────────────────────────┐│
│ │            ┌────────┐   ┌────────┐            │ │ [ic28] BOMBA             ││
│ │        ┌──▶│Geniş P.│──▶│Sert K. │            │ │ Geniş Patlama            ││
│ │ ┌─────┐│   └────────┘   └────────┘            │ │ Patlama alanı büyür.     ││
│ │ │Kısa ├┤                                      │ │ ──────────────────────── ││
│ │ │Fitil││   ┌────────┐   ┌────────┐ ┌────────┐ │ │ ▪ Patlama alanı %15 artar││
│ │ └─────┘└──▶│Uzun Kol│──▶│Sert Atış│▶│Anlık F.│ │ │                          ││
│ │            └────────┘   └────────┘ └────────┘ │ │ Önce şunu aç: …          ││
│ └──────────────────────────────────────────────┘ │ [      AÇ · 300 XP      ] ││
│ Güç gelişimi tüm karakterlerde geçerli · sonraki düğüm: 300 XP                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Layout Zones

| Bölge | Konum | Boyut |
|---|---|---|
| Başlık | üst | sekmeler solda, XP çipi sağda; yükseklik ≈ 88 |
| Alt sekme çubuğu | başlığın altı | karakter (5) veya güç (6) sekmesi, eşit genişlik, ≈ 56 |
| Özet kartı (yalnız karakter) | sekmenin altı | tam genişlik, ≈ 133 |
| Stat satırları (yalnız karakter) | özetin altı | 5 × 83, aralar 20 |
| Ağaç tuvali (yalnız güç) | solda, genişleyen | 1033×393 içerik, panel ortalar |
| Detay paneli (yalnız güç) | sağda | 483 genişlik, içerik kadar yüksek |
| Maliyet notu | en alt | 1 satır, TEXT_DIM 20 |

### Component Inventory

| Bileşen | Tür | İçerik / Not |
|---|---|---|
| Üst sekmeler | TabButton ×2 | KARAKTER GELİŞİMİ / GÜÇ GELİŞİMİ (değişmez) |
| XP çipi | PanelContainer | `◆ n XP` + `PROFİL SEVİYESİ n` — **kehribar kalır** (XP kuralı). `◆` metin glyph'i yerine `IconSet` kullanmak serbest ama zorunlu değil; kapsam dışı |
| Karakter sekmeleri | TabButton ×5 | **Yalnız karakter adı** (`TANK`). `n/25` sayacı KALDIRILIR (bkz. Yüzde dili §4) |
| Özet girişi ×5 | HBox: ikon 28 + (etiket 17 caps TEXT_DIM / değer 28 bold) | etiket = stat adı (CAN, HIZ, HASAR, SİLAH, DAYANIKLILIK — satırlarla birebir aynı); değer `+%25` TEXT, yükseltilmemiş `—` TEXT_DIM. Eski "ŞARJÖR/KOŞU" etiketleri kalkar |
| Stat satırı ×5 | PanelContainer (mevcut stil) | Aşağıda "Stat satırı anatomisi" |
| Güç sekmeleri | TabButton ×6 | `[ikon 26] KISA AD` — sayaç (`2/6`) kalkar; ikon id = ağaç tipi (bomb/heal/sat/flash/smoke/trap) |
| Ağaç düğümü | Button 210×93 | ad (20) + durum satırı (ikon 18 + metin 17) |
| Bağlantı çizgisi | `_draw_links` | mevcut; yalnız kilitli α artar (aşağıda) |
| Detay paneli | PanelContainer + FRAME braketleri | başlık (ikon 28 + ağaç adı), düğüm adı 33, açıklama 20, ayraç, etki satırları, durum, AÇ düğmesi 67 |
| Etki satırı | HBox: 6×6 beyaz kare işaret + Label 22 TEXT | tek cümle: `PowerTrees.change_text(...)` |

### Stat satırı anatomisi (1534 px iç genişlik, yükseklik 83)

`[İKON 44 | slot 56] ─20─ [METİN KOLON min 380] ─20─ [BAR genişler ≈ 788] ─20─ [DÜĞME 250×57]`

- **İkon**: `IconSet.make(stat, 44, renk)`; renk = `TEXT` (seviye>0) / `TEXT_DIM` (seviye 0). Slot içinde ortalı. Emoji/`glyph` yok.
- **Metin kolonu**: isim 20 px caps `TEXT`; altında **etki metni** 18 px (`stat_effect_text`): seviye>0 → `TEXT`, seviye 0 → `TEXT_DIM` "Henüz yükseltilmedi". Autowrap kapalı; min genişlik 380 (EN en uzun: "Run and crouch time increases by 50%" ≈ 340).
- **Bar**: `ProgressBar`, `min=0 max=1 step=0.001`, **`show_percentage=false` (şart — yoksa yüzde yazar)**, yükseklik 10 (`custom_minimum_size.y=10`, `size_flags_vertical=SHRINK_CENTER`), yatay genişler. Segment, çentik, ayraç YOK (tek düz bar). Köşe yarıçapı 0-1. Zemin (track) `Color(1,1,1,0.10)` + 1 px `BORDER`; dolgu `Color(0.93,0.95,0.97,0.92)` (nötr beyaz; kehribar değil). `value = level / MAX_LEVEL` → seviye 1 = %20 dolu (görünür ≈158 px). Tüm statların barı aynı uzunlukta (kendi 0-MAX ölçeği; stat'lar arası değer kıyası yok, bu bilinçli).
- **Düğme**: 250×57 `PrimaryButton` (kehribar — tek kehribar öğe satırda).
- Bar yanında/üstünde/tooltip'inde seviye sayısı, "2/5", "%40", "LV", "yükseltildi" **YASAK**.

### Güç düğümü (210×93)

Satır 1: düğüm adı (20, bold). Satır 2: durum — ikon 18 + metin 17 (ortalı, 6 px aralık):

| Durum | Arka plan | Kenar | Durum satırı | Bağlantı |
|---|---|---|---|---|
| Açık (owned) | beyaz α0.13 | 1 px beyaz α0.55 | `check` ikonu + "AÇIK" (TEXT) | dolu, α0.75, 3 px |
| Açılabilir (open) | beyaz α0.05 | 1 px beyaz α0.55 | "{n} XP" (XP yeterse TEXT, yetmezse TEXT_DIM; kehribar YOK) | düz, α0.40, 2.5 px |
| Kilitli (locked) | siyah α0.25 | 1 px beyaz α0.10 | `lock` ikonu + "KİLİTLİ" (TEXT_DIM α0.75) | **kesikli**, α0.25 |
| Seçili (herhangi) | — | **3 px `FRAME`** | — | — |

Durumlar renge değil **şekil/ikon/çizgi tipi/kalınlığa** da bağlı (kilit ikonu, check ikonu, kesikli çizgi, kalın seçim kenarı).

---

## States & Variants

| State / Variant | Trigger | What Changes |
|---|---|---|
| Varsayılan (stat) | satır, seviye 1-4, XP yeterli | bar kısmen dolu, etki "Can %25 artar", düğme "YÜKSELT · 150 XP" kehribar etkin |
| Yükseltilmemiş | seviye 0 | bar boş, ikon TEXT_DIM, etki "Henüz yükseltilmedi"; özet "—" |
| XP yetersiz | `xp < cost` | düğme **soft-disabled**: soluk stil, metin "XP YETERSİZ · 150 XP", **odak alabilir**; basılınca yükseltme olmaz, XP çipinin kenarı 0.3 sn beyaz parlar (nedeni gösterir) + `ui_hover` sesi. (Gerçek `disabled` odağı kaybettirir; klavye kullanıcısı nedeni göremez) |
| MAKS | seviye = MAX_LEVEL | bar tam dolu, düğme "MAKS" gerçek `disabled`, etki metni son değer ("Can %25 artar") |
| İlk giriş / XP=0 | yeni profil | tüm satırlar "Henüz yükseltilmedi", tüm düğmeler "XP YETERSİZ · 150 XP"; maliyet notu "Maçlarda XP kazan; sonraki yükseltme: 150 XP" yerine mevcut not yeterli (yeni metin eklenmez) |
| Güç düğümü: açık | owned | yukarıdaki tablo; detayda AÇ gizli, durum metni "Bu düğüm açık — …" |
| Güç düğümü: açılabilir + XP yeterli | open | AÇ kehribar etkin "AÇ · 300 XP" |
| Güç düğümü: açılabilir + XP yetersiz | open | soft-disabled "XP YETERSİZ · 300 XP" (stat düğmesiyle aynı davranış) |
| Güç düğümü: kilitli | locked | AÇ gerçek `disabled`, metin "KİLİTLİ"; durum "Önce şunu aç: {ad}"; etkiler yine gösterilir (önizleme, ata düğümler açıkmış sayılır — bkz. Data) |
| Ağaç tamamlandı | tüm düğümler owned | alt not "Güç gelişimi tüm karakterlerde geçerli · bu ağaç tamamlandı" (mevcut) |
| Satın alma anı | başarılı `buy` / `buy_power` | aşağıda "Transitions & Animations" |

## Interaction Map

| Bileşen | Fare | Klavye | Gamepad | Geri bildirim | Sonuç |
|---|---|---|---|---|---|
| Üst sekme | tık | Sol/Sağ (odakta), Enter | D-pad + A; LB/RB | `ui_click`, sekme alt çizgisi | sayfa değişir |
| Karakter/güç sekmesi | tık | Sol/Sağ, PageUp/PageDown (her yerden) | D-pad, LB/RB | `ui_click` | `_select` / `_select_tree`; odak ile seçim (sekmeler odaklanınca etkinleşir) |
| YÜKSELT | tık | Enter/Space | A | satın alma animasyonu + ses | `PROFILE.buy` → `refresh()` |
| Düğüm | tık | oklar (konuma göre en yakın düğüm), Enter | D-pad, A | seçim kenarı 3 px | detay güncellenir (satın alma YOK, ayrı AÇ gerekir) |
| AÇ | tık | Tab ile ulaş, Enter | A | satın alma animasyonu | `PROFILE.buy_power` |
| Kapat | ✕ / ESC / dışarı | ESC | B | — | modal kapanır |

Kurallar:
- **Tüm etkileşimli öğeler `focus_mode = FOCUS_ALL`** (şu an `FOCUS_NONE` → klavyeyle kullanılamıyor; erişilebilirlik kontrol listesinde başarısız). Görünür odak: 2 px `FRAME` kenar + 3 px dış boşluk; `UITheme` focus stili yoksa UpgradePage'de yerel override.
- Tab sırası: üst sekmeler → alt sekme çubuğu → satırlar/düğümler → AÇ. Satırlarda yukarı/aşağı ok satırlar arası.
- Düğme `disabled` olup odaktaysa (MAKS olunca) odak aynı satırın yerine sıradaki etkin düğmeye, yoksa karakter sekmesine taşınır.
- Gamepad omuz tuşları `project.godot`'a dokunmadan `_unhandled_input` içinde `InputEventJoypadButton` (`JOY_BUTTON_LEFT/RIGHT_SHOULDER`) ile okunur.
- Fare imleci elde olduğunda bile hover ile tooltip AÇILMAZ (seviye bilgisi sızmasın).

## Data Requirements

Okunan: `PROFILE.get_levels(char)`, `get_xp()`, `next_cost(char)`, `power_cost(tree)`, `get_powers()`, `has_power`, `PowerTrees.TREES/mods/BASE/LABELS`. Yazılan: yalnız `buy` / `buy_power` (mevcut).

**Yeni/değişen API (sözleşme):**
- `IconSet.make(id, size, color) -> Control` — id: health, speed, damage, weapon, stamina, bomb, heal, sat, flash, smoke, trap, lock, check.
- `PlayerProfile.stat_percent(stat, level) -> int` = `roundi(level * per_level * 100)` → can 5-25, hız 3-15, hasar 4-20, silah 4-20, dayanıklılık 10-50.
- `PlayerProfile.stat_effect_text(stat, level) -> String` (tr uygulanmış):

| stat | level>0 | level 0 |
|---|---|---|
| health | `Can %%%d artar` | `Henüz yükseltilmedi` |
| speed | `Hız %%%d artar` | aynı |
| damage | `Hasar %%%d artar` | aynı |
| weapon | `Şarjör ve atış %%%d hızlanır` | aynı |
| stamina | `Koşu ve çömelme süresi %%%d uzar` | aynı |

  `STAT_INFO` içinde `glyph` silinir; `desc` alanı artık `stat_effect_text` tarafından kullanılır veya silinir (`stat_bonus_text` başka yerde kullanılmıyorsa kaldırılabilir — grep et).
- Özet değeri: `tr("+%%%d") % stat_percent(...)`, seviye 0 → `"—"`.
- `PowerTrees.change_text(key, before, after) -> String`: kurallar "Yüzde dili" §2. Yeni sabit `CHANGE_CLASS := {key: "amount"|"duration"|"unlock"}` (LABELS yapısına dokunmadan).
- **Önizleme "önce" değeri**: `_refresh_detail` bugün yalnız tanım sırasında önceki ve SAHİP olunan düğümleri sayıyor; kilitli düğümde bu, atası açılmamış olduğundan yanlış (kümülatif) yüzde gösterir (ör. Anlık Fitil: %42 yerine %30). Kural: `before = mods(owned ∪ düğümün req zincirindeki tüm atalar ∪ tanım sırasında öncekiler ∩ owned)` — yani atalar açıkmış varsayılır. Satın alınabilir düğümde zaten aynıdır.
- `UpgradePage`: `_rows[stat]` → `{icon: Control, effect: Label, bar: ProgressBar, btn: Button}` (`pips` kalkar). Bar değeri doğrudan `bar.value`.

## Events Fired

Ağ yok, yalnız yerel profil yazımı. Ses: satın alma onayı için mevcut bir UI sesi (`Sfx.play_ui`; yeni dosya gerekmez — bkz. Open Questions). Analitik (şimdilik altyapı yok; `analytics-engineer` için öneri): `stat_upgrade_bought {character, stat, new_level, cost, xp_after}`, `power_node_bought {tree, node, cost, xp_after}`, `upgrade_denied_xp {kind}`.

## Transitions & Animations

Tümü ≤ 0.45 sn, tek seferlik; yanıp sönme/strobe yok (en fazla 1.35× parlaklık, tek darbe).

| Olay | Animasyon |
|---|---|
| Başarılı YÜKSELT | `bar.value` yeni orana tween 0.35 sn `TRANS_CUBIC / EASE_OUT`; satır `modulate` nötr beyaz `Color(1.35,1.35,1.35)` → beyaz 0.4 sn (eski sıcak/kehribar renk `Color(1.5,1.4,1.1)` KALDIRILIR); ikon ölçek 1.0→1.15→1.0 0.25 sn (pivot merkez); etki metni değişince 0.15 sn alfa 0.4→1; XP değeri yeni sayıya 0.3 sn sayarak iner |
| Başarılı AÇ | düğüm `modulate` aynı nötr parlama; durum satırı `check` ikonuyla değişir; bağlantı çizgisi anında dolu/kalın; detayda AÇ gizlenir (panel `fill` ayırıcısı sayesinde yükseklik zıplamaz) |
| Karakter/ağaç değiştirme | **animasyonsuz anlık** (bar `value` doğrudan atanır — sekmeler arası gezinirken barlar yürümesin) |
| Sayfa/sekme açılışı | mevcut; ek animasyon yok |
| XP yetersiz basış | XP çipi kenarı 0.3 sn beyaz parlama |

## Input Method Completeness Checklist

- [x] Fare: tüm eylemler tıkla
- [x] Klavye: her öğe odak alır (FOCUS_ALL), Enter/Space eylem, ESC kapatır, PageUp/PageDown alt sekme döngüsü
- [x] Gamepad: yön tuşu odak gezintisi, A onay, B kapat, LB/RB alt sekme
- [x] Kısayol çakışması yok (menüde Q/rakam test tuşları aktif değil)
- [x] Fare yokken tüm bilgi görülebilir (tooltip'e bağımlılık yok)

## Accessibility

- **Renk tek başına bilgi taşımaz**: seviye = bar uzunluğu + etki metni; durum = ikon (check/lock) + metin + çizgi tipi + kenar kalınlığı; yeterli XP = düğme metni ("XP YETERSİZ"). Kehribar yalnız süs/vurgudur, bilgi yalnız ondan okunmaz.
- **Kontrast**: bar dolgusu (≈ L 0.88) / track (≈ L 0.10) > 10:1 (≥3:1 gerekli). Metin: `TEXT` ve `TEXT_DIM` koyu cam üstünde ≥ 7:1; kilitli düğüm metni `TEXT_DIM` α ≥ 0.75 (≈ 5:1; eski 0.5/0.55 değerleri kontrastı düşürüyordu → yükseltilir).
- **Yazı boyutu**: gövde ≥ 18, başlık-etiketi (caps) ≥ 17 px @1080p; `content_scale_factor` 0.8'de bile ≥ 13.6 px. Etki metni 18 px.
- **Ölçek**: tüm bileşenler Container içinde; sabit px yalnız minimum boyutlar. 1080 yüksekliğe sığar (bkz. bütçe). 16:10 ve 21:9'da `EXPAND` aspect ile yatay genişler, bar uzar.
- **Ölçeklenebilir**: ikonlar `size` parametreli vektör → her çözünürlükte keskin.
- **Işık/hareket**: yanıp sönme yok; tek 0.4 sn parlama. Animasyonlar atlansa bilgi kaybolmaz (son durum her zaman metin+bar).
- **Ekran okuyucu**: Godot'da sınırlı; `tooltip_text` kullanılmaz (seviye sızar). Bu nedenle etki cümlesinin kendisi eksiksiz anlamlıdır ("Can %25 artar").
- Ses kapalıyken de tüm geri bildirim görsel olarak vardır (bar, parlama, metin).

## Localization Considerations

Kaynak dil Türkçe, `LangEN.STRINGS`'e **birebir biçim dizgisi anahtarlarıyla** eklenecekler (`%%%d` = Türkçe "%25"; EN karşılıkta `%d%%`):

| TR anahtar | EN |
|---|---|
| `Henüz yükseltilmedi` | Not upgraded yet |
| `Can %%%d artar` | Health increases by %d%% |
| `Hız %%%d artar` | Speed increases by %d%% |
| `Hasar %%%d artar` | Damage increases by %d%% |
| `Şarjör ve atış %%%d hızlanır` | Reload and fire rate improve by %d%% |
| `Koşu ve çömelme süresi %%%d uzar` | Run and crouch time increases by %d%% |
| `+%%%d` | +%d%% |
| `%s %%%d artar` / `%s %%%d azalır` | %s increases by %d%% / %s decreases by %d%% |
| `%s %%%d uzar` / `%s %%%d kısalır` | %s increases by %d%% / %s is reduced by %d%% (süre: "lasts %d%% longer / shorter" tercih edilebilir) |
| `%s etkinleşir` | %s unlocked |
| `AÇIK`, `KİLİTLİ` (✓ ön eki kalkar: mevcut `✓ AÇIK` anahtarı yerine `AÇIK`) | Unlocked, Locked |
| Yeniden adlandırılan LABELS: `Patlama alanı`, `Etki alanı`, `Sis alanı`, `Yenilenme`, `Grup iyileştirme`, `Uyduda görünmezlik` | Blast area, Effect area, Smoke area, Regeneration, Group healing, Hidden on satellite |

Konu (özne) `tr(LABELS[key][0])` ile ayrı çevrilir, cümle kalıbı ayrıca. Kullanıcı içeriği yok → `auto_translate_mode` varsayılan. EN metinler TR'den ~%20 uzun: metin kolonu min 380, düğüm adı satırı `clip_text`; güç sekmeleri 20 px + ikon 26 ile 6 × ≈ 255 px içine sığmalı (kısa ad kullan).

---

## Yüzde dili kuralları (uygulayıcı için bağlayıcı)

1. **Mutlak sayı yasak**: can/hız/hasar/metre/saniye/çarpan (`187`, `4.6 m`, `×1.5`, `4 sn`) hiçbir etiket, özet, etki satırı, düğüm açıklaması ve tooltip'te görünmez. İstisna: **XP/maliyet** ve profil seviyesi (para birimi, oyuncunun kararı için gerekli).
2. **`change_text(key, before, after)`**:
   - Yüzde = `roundi(abs(after − before) / before × 100)`, **bir önceki adıma göre artımlı** ("bu düğüm bana ne katar"). Sonuç 0 ise ama değer değiştiyse 1'e yükselt; değişim yoksa `""` döner (çağıran satırı atlar).
   - Özne = `tr(LABELS[key][0])`.
   - Sözcük `CHANGE_CLASS`'a göre:

     | Sınıf | Artış | Azalış | Anahtarlar |
     |---|---|---|---|
     | `amount` (miktar, menzil, alan, şiddet) | artar | azalır | bomb_radius, bomb_edge, bomb_throw, heal_amount, heal_medic_range, heal_medic_aim, heal_critical, flash_radius, flash_strength, flash_self, flash_throw, flash_team, smoke_radius, smoke_throw, trap_dot, trap_trigger, trap_reveal_far |
     | `duration` (süre, fitil, uçuş) | uzar | kısalır | bomb_fuse, bomb_flight, sat_duration, flash_fuse, smoke_duration, smoke_fuse, trap_rescue |
     | `unlock` (0'dan başlayan / bool) | `{özne} etkinleşir` (yüzde yok) | — | heal_regen, heal_group, smoke_radar |

   - `before ≈ 0` ve `after > 0` → `unlock` cümlesi; yüzde asla ∞ yazmaz.
   - **Yön sözcüğü iyi/kötü değil, değişim yönüdür**: Fitil kısalır ve Sana körlük azalır oyuncu lehine olsa da renk (kırmızı/yeşil) KULLANILMAZ; yalnız sözcük.
3. **Örnek çıktılar (kabul testi)**: Geniş Patlama `Patlama alanı %15 artar` · Kısa Fitil `Fitil %17 kısalır` · Sert Kenar `Kenar hasarı %29 artar` · Anlık Fitil (Sert Atış açık) `Fitil %30 kısalır` · Sıkı Sargı `İyileştirme %14 artar` · Yenilenme `Yenilenme etkinleşir` · Uzak Tedavi iki satır: `Medic menzili %33 artar`, `Medic nişan alanı %28 artar` · Acil Müdahale `Kritik canda etki %50 artar` · Göz Kırpma `Sana körlük %40 azalır` · Dost Uyarısı `Takımına körlük %50 azalır` · Hızlı Duman `Duman çıkışı %75 kısalır` · Sıkı Kenet `Kurtarma süresi %25 uzar` · Kamuflaj `Fark edilme mesafesi %20 azalır` · Uydu zinciri `%19 → %16 → %14 uzar`.
4. **Bar çevresinde ilerleme metni yasak**: "%40 yükseltildi", "2/5", "LV 2", "Seviye 2", tooltip'te seviye. Ek tutarlılık kararı: karakter sekmelerindeki `n/25` ve güç sekmelerindeki `n/6` sayaçları da kalkar (aynı bilgiyi sızdırır). Geri alması tek satır; bkz. Open Questions.
5. **Düğüm açıklamalarındaki gizli sayılar temizlenir** (`PowerTrees.TREES[..]["desc"]`): Acil Müdahale → "Canı kritik seviyedeki oyuncuda iyileştirme güçlenir." · Grup Şifası → "İyileştirilenin yakınındaki takım arkadaşları da iyileşir." · Yenilenme → "İyileştirmeden sonra bir süre ek can dolar." · Dost Uyarısı → "Takım arkadaşların senin flaşından daha az etkilenir." Eski `LABELS` birimleri (`format_value`) başka yerde kullanılmıyorsa dokunulmaz.
6. "Patlama alanı/Etki alanı/Sis alanı" yüzdesi **yarıçap** değişiminden hesaplanır (oyuncunun algıladığı erişim); gerçek alan daha hızlı büyür — kullanıcı örneğine ("Patlama alanı %15 artar") uyuldu, bkz. Open Questions.

## Renk kullanımı

| Öğe | Renk |
|---|---|
| YÜKSELT / AÇ (etkin) | `ACCENT` (PrimaryButton) — **tek birincil eylem** |
| XP çipi (sayı + çerçeve) | `ACCENT` |
| Bar dolgusu, ikonlar, özet değerleri, etki metni | `TEXT` / `TEXT_DIM` / nötr beyaz `Color(0.93,0.95,0.97,0.92)` |
| Paneller, çizgiler | `SURFACE*`, `BORDER`, `FRAME` |
| "AÇIK" durumu | `TEXT` + `check` ikonu (eski `SUCCESS` yeşil KALDIRILIR) |
| Düğüm XP maliyeti | `TEXT` / `TEXT_DIM` (eski kehribar KALDIRILIR) |
| `DANGER` | bu ekranda kullanılmaz |

## İkon sistemi (`IconSet`, özet — sanat yönlendirmesi art-director'ın)

- 24×24 birim ızgara, `size/24` ölçeği; çizgi kalınlığı `clampf(size × 0.07, 1.5, 3.5)` px; köşeler keskin, dolgu yalnız vurgu parçalarında; `antialiased = true`; tek renk (`color`), yarı saydam dolgu α0.25 serbest.
- Çizim: `draw_polyline`, `draw_line`, `draw_arc`, `draw_colored_polygon`; ikon `_draw`'da, `color` set edilince `queue_redraw()`.
- Silüetler (18 px ve 44 px'te ayırt edilebilir olmalı):

| id | Silüet |
|---|---|
| health | keskin köşeli kalkan + ortada kalın artı |
| speed | üç ardışık ileri chevron `>>>` |
| damage | nişangah: daire + 4 çentik + orta nokta |
| weapon | şarjör (hafif eğik dikdörtgen + üstte 2-3 mermi ucu) |
| stamina | açılı şimşek çokgeni |
| bomb | gövde dairesi + üst kapak + eğik sigorta çizgisi |
| heal | tıbbi çanta: dikdörtgen + üst sap + artı (health'ten kalkan vs çanta ile ayrışır) |
| sat | küçük dolu daire + 3 yay yayılım (yayın/anten) |
| flash | merkez daire + 8 ışın |
| smoke | düz tabanlı 3 yay bulut |
| trap | tabanda çubuk + üstünde dişli yarım daire (açık çene) |
| lock | gövde dikdörtgeni + yay kulp |
| check | iki parçalı onay çizgisi |

## Yükseklik bütçesi (hedef ≤ 930 iç yükseklik, kart ~1000 / 1080)

**Karakter sekmesi**: başlık 88 + 20 · karakter sekmeleri 56 + 20 · özet kartı 133 (eski 155: "temel" alt satırı kalktı) + 20 · 5 satır × 83 + 4 × 20 = 495 · boşluk 20 · maliyet notu 26 → **≈ 878** (≈ 50 px boşluk, `fill` emer). İkon 44 satırı büyütmez (düğme 57 baskın, satır 83).

**Güç sekmesi**: başlık 88 + 20 · güç sekmeleri 56 + 20 · gövde ≈ 450 (detay: 46 pad + 28 başlık + 13 + 42 ad + 13 + 78 açıklama(3 satır) + 13 + ayraç + 13 + etki 2 × 33 + 13 + durum 46 + 13 + düğme 67) + 20 · not 26 → **≈ 680** (gövde `EXPAND_FILL` kalan ≈ 250 px'i alır, ağaç ortalı).

Detay etki listesi en fazla 2 satır (Uzak Tedavi); 3+ olursa panel sabit yüksekliği ölçmek için `get_combined_minimum_size()` ile doğrula.

---

## Acceptance Criteria

1. Hiçbir stat satırında 5 parçalı pip yok; her satırda **tek** `ProgressBar`, `show_percentage=false`, `value = level/MAX_LEVEL`, ve satırda "%", "/", "LV", "seviye" içeren ilerleme metni yok.
2. İsim altında `stat_effect_text`: seviye 0 → "Henüz yükseltilmedi", ≥1 → "Can %N artar" benzeri.
3. Karakter özeti "CAN +%25" biçiminde, yükseltilmemiş "—"; mutlak sayı ve "temel" alt satırı yok; etiketler stat adlarıyla aynı.
4. Güç detayında etkiler yalnız `change_text` cümleleri; ekranda `m`, `sn`, `can`, `×` birimli sayı yok (XP ve profil seviyesi hariç); örnek çıktılar §3 ile eşleşir; kilitli düğüm önizlemesi atalar açıkmış gibi hesaplanır.
5. Ekranda emoji/Unicode glyph ikon yok (`❤ ➤ ✸ ⟳ ⚡ ✓` ve `PowerupManager.INFO.glyph` kullanımı bu sayfadan çıkar); tüm ikonlar `IconSet`.
6. Kehribar yalnız etkin YÜKSELT/AÇ ve XP çipinde; bar, ikon, özet, düğüm durumu nötr.
7. Her etkileşimli öğe klavyeyle odaklanır ve görünür odak halkası var; Tab/ok/Enter ile bir stat yükseltilebilir ve bir düğüm açılabilir; ESC kapatır.
8. XP yetersizken düğmeye basış odağı kaybettirmez, XP çipi parlar, satın alma olmaz.
9. Satın alma: bar 0.35 sn dolar, nötr parlama; karakter değiştirirken barlar animasyonsuz.
10. 1920×1080'de her iki sekme kart içine sığar (taşma/kaydırma yok); 1280×720 ve 2560×1080'de ölçekli bozulma yok; EN dilde metinler kırpılmaz.
11. `LangEN`'de tüm yeni anahtarlar var; dil değişince etki cümleleri çevrilir.
12. İkon sistemindeki 13 id'nin hepsi `IconSet.make` ile 18, 26, 28, 44 px'te hatasız çizilir.

## Open Questions

1. **Sekme sayaçları** (`TANK 3/25`, `BOMBA 2/6`): bu spec kaldırır (ilerleme metni yasağıyla tutarlı). Kullanıcı sayaç isterse yalnız sekmelerde kalabilir — şef onayı gerekir.
2. **"Alan" vs yarıçap**: yüzde yarıçaptan hesaplanıyor, etiket "alan". Dürüst alternatif: "Patlama erişimi %15 artar". Varsayılan: kullanıcı örneği.
3. **Satın alma sesi**: mevcut bir UI sesi (örn. `ui_open` -6 dB) önerilir; özel bir onay sesi (kısa, düşük) ayrıca eklenmek istenirse audio işi.
4. **Gamepad**: menüde LB/RB ve odak kullanımı yalnız Godot `ui_*` varsayılanları + `_unhandled_input` ile; tam gamepad menü desteği projede henüz hedef değilse bu madde "iyi olur" seviyesinde kalır, ama klavye odağı zorunludur.
5. **Sonraki seviye önizlemesi** (düğme üstüne gelince "sonraki: Can %30 artar") eklenmedi; yüzde dili ve sadelik için bilinçli kapsam dışı.
6. **Analitik olayları** (Events Fired) için altyapı yok; uygulanmayacak, yalnız adlandırma önerisi.
