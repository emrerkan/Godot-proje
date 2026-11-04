# UX Spec: Yeni Güçler — Görünmezlik · Özel Silah (tek atış) · Tuzak Çözücü

> **Status**: Taslak, uygulamaya hazır (kullanıcı kararları sabit; açık noktalar en sonda)
> **Author**: ux-designer (orkestra şefi sözleşmeleriyle)
> **Last Updated**: 2026-11-05
> **Journey Phase(s)**: Maç içi — güç doğuşu, alma, `Q` ile kullanma (host yetkili)
> **Platform Target**: Windows PC, klavye + fare (oyunun mevcut tek girdi şeması; gamepad yok, bkz. Erişilebilirlik)
> **Template**: UX Spec (HUD akışı)
> **Kod**: `scenes/ui/HUD.gd`, `scenes/ui/Crosshair.gd`, `scenes/ui/Minimap.gd`, `scenes/world/PowerupManager.gd` (INFO), `scenes/player/Player.gd`
> **Görsel dil**: `docs/SANAT_KITABI.md` "Sis & Cam" + `UITheme`. HUD glifleri (`INFO["glyph"]`) ikon dilinden ayrı kalır (SANAT_KITABI §8 giriş notu) → bu işte `IconSet`'e yeni ikon EKLENMEZ.

---

## 0. SÖZLEŞME UYARISI (uygulamadan önce okunmalı)

**`DAMAGE_SPECIAL := 2` ÇAKIŞIYOR.** `Player.DAMAGE_MELEE := 2` ve `GameManager.KILL_KNIFE := 2` zaten var
(`GameManager._announce_kill_rpc`: `method == KILL_KNIFE` → `XP_KNIFE_BONUS`; HUD: "🔪" ikonu + "Seni bıçaklayan"). Özel silah
öldürmesi 2 ile gelirse: bıçak bonus XP'si verilir, kill feed bıçak ikonu gösterir, ölüm ekranı yanlış cümle yazar.
**Öneri: `const DAMAGE_SPECIAL := 4`** (0 mermi, 1 patlama, 2 bıçak, 3 arkadan bıçak, 4 özel). 4 değeri `GameManager`'da
özel dala girmez (bonus yok, `kill_happened` olduğu gibi geçer) → "GameManager'a dokunma" kuralı korunur.
Bu spec'te kill feed / ölüm ekranı **`Player.DAMAGE_SPECIAL` sabitiyle** karşılaştırır, sayıyla değil. Şef değeri 4 yapmazsa
HUD tarafında özel silahı bıçaktan ayırmanın yolu kalmaz (metodlar aynı) — bu bir engelleyicidir.

Diğer sözleşme notları (imza değişmez):
- `_trap_rescue_sync_rpc`: client'ta `trap.self_rescue = true` **`trap_rescue_changed.emit`'ten ÖNCE** yazılmalı; yoksa HUD barı ilk karede `trap_rescue_time()` ile 4 sn hesaplar (3 sn olmalı).
- `notice` (HUD `_show_banner`) tek kanal: aynı anda iki bildirim gelirse sonuncu öncekini ezer. Kalıcı bilgi bu yüzden bandı değil **durum çipini** (§3.3) kullanır; banner sadece anlık olaylar içindir.

---

## 1. Purpose & Player Need

Üç güç, oyuncuya üç farklı "tek cümlelik söz" verir ve ekran her birinde o sözün durumunu **tek bakışta** söylemelidir:

| Güç | Oyuncunun sorusu | Ekranın cevabı |
|---|---|---|
| Görünmezlik | "Hâlâ gizli miyim, ne kadar kaldı?" | Durum çipi + eriyen bar + kendi gövdemde titreşim |
| Özel Silah | "Silah hazır mı? Ne yapacağım?" | Nişangah değişir + lazer + "HAZIR · SOL TIK ATEŞ · Q VAZGEÇ" |
| Tuzak Çözücü | "Şu an kullanabilir miyim?" | Tuzaktayken slot ve çip "Q" der; değilken Q net bir ret verir |

Ortak ilke: **durum tek kaynaktan** gelir (host RPC → `Player` sinyalleri); HUD, nişangah ve 3D lazer aynı sinyalde birlikte değişir, yerelde tahmin yürütülmez. Böylece "çip hazır diyor ama silah hazır değil" tutarsızlığı olmaz.

## 2. Player Context

- Maç koşulu: karanlık harita, el feneri, 5v5v5v5. Oyuncu ekrana değil çevreye bakar; kritik durum **imleç çevresinde** ve **slot yanında** (periferik) gösterilir, banner sadece teyit içindir.
- Güç tek slot: yeni güç eskisini değiştirmez (slot doluysa alınmaz) → oyuncu "ne taşıdığını" hep slottan okur.
- Q mevcut güçlerle aynı tuş (öğrenilmiş model): Q = "bu gücü kullan". Tek istisna Özel Silah (Q = hazırla/vazgeç) ve Tuzak Çözücü (Q sadece tuzaktayken işler). Bu iki istisna slot/çip/banner metinleriyle açıkça söylenir.

---

## 3. Layout Specification

Tüm değerler 1920×1080 tabanında piksel (ölçek referansı kuralı).

### 3.1 Renk / glif / ad (INFO) önerisi

Mevcut glifler: `✸ ✚ ◈ ◉ ✦ ≋ ▽` (güçler), `● ▲ ■ ◆` (takım), `▸ ⚠ ✓ ✕ ▶` (durum). Çakışma olmasın diye yeni glifler:

| Tip (index) | `name` | `glyph` | `color` | `desc` | Yedek glif* |
|---|---|---|---|---|---|
| INVIS (7) | `GÖRÜNMEZLİK` | `◐` (yarı dolu daire = "yarı görünür") | `Color(0.72, 0.62, 1.0)` lavanta | `6 sn rakiplerden gizlenir, ateşle bozulur` | `◑` |
| SPECIAL_GUN (8) | `ÖZEL SİLAH` | `⊕` (daire içinde artı = nişangah) | `Color(1.0, 0.22, 0.55)` kızıl-eflatun (**AD düzeltti**, bkz. §11.1) | `Tek atış · duvardan geçer · menzil sınırsız` | `+` |
| TRAP_BREAKER (9) | `TUZAK ÇÖZÜCÜ` | `✂` (makas = kesip çık) | `Color(0.80, 0.92, 0.36)` limon (**AD düzeltti**, bkz. §11.1) | `Tuzaktayken kendini kurtarır` | `⊘` |

\* **Glif doğrulaması (ui-programmer):** üç glifi 57 px (slot) ve 22 px (kill feed) çizin. Kare kutu (tofu) ya da renkli emoji
çıkıyorsa (özellikle `✂` Windows'ta Segoe UI Emoji'ye düşebilir) yedek glife geçin. Mevcut `✚ ✸ ✦` Dingbats olduğu için sorun beklenmez, ama kanıt görsel kontrolle alınır.

Renk gerekçesi: lavanta = mevcut hiçbir güçte yok (`UYDU` camgöbeği, `SAĞLIK` yeşil, `BOMBA` turuncu, `FLAŞ` buz mavisi, `TUZAK` kahverengi-gri); `ÖZEL SİLAH` kırmızıya yakın ama `BOMBA` turuncusundan ve `DANGER` (1.0,0.34,0.28) kırmızısından pembe yönüyle ayrılır; `TUZAK ÇÖZÜCÜ` tuzak ailesinden (toprak tonu) ayrışsın diye limon-yeşili, kehribar (`ACCENT`) ile karışmaz. **Renk tek başına bilgi taşımaz**: her güç glif + ad ile de ayrışır (protan/deutan'da `BOMBA` ↔ `ÖZEL SİLAH` yalnız renkten karışabilir; glif `✸` ↔ `⊕` ve ad bunu çözer). Nihai tonlar art-director onayına bağlı.

`WEIGHTS` ekleri: INVIS 10, TRAP_BREAKER 10, SPECIAL_GUN 5 (kullanıcı kararı). Yer görselleri (`Powerup.gd`) INFO rengini ve glif/ad etiketini kullanır; üç yer nesnesi **siluet olarak** birbirinden ve mevcut güçlerden ayrışmalı (karanlıkta uzaktan tanıma): görünmezlik = yarı saydam titreşen kristal/küre, özel silah = uzun ince kasa/tüfek siluet + kırmızı nokta, tuzak çözücü = açık çene + anahtar/makas formu. Rengin kendisi ayırt edici olmamalı.

### 3.2 Güç slotu (mevcut `_item_slot`: sol alt, x=613, 173×173)

Slot yapısı değişmez: `GÜÇ [Q]` başlığı, 57 px glif, 15 px caps ad. Kenar/gölge rengi = `INFO.color` (mevcut davranış). Yeni durumlar:

| Durum | Glif | Ad satırı | Kenar | Not |
|---|---|---|---|---|
| Boş | `—` | `BOŞ` | `BORDER` | mevcut |
| INVIS slotta | `◐` lavanta | `GÖRÜNMEZLİK` | lavanta α 0.6 | Q'ya basınca slot BOŞ olur, durum çipi (§3.3) devralır |
| SPECIAL_GUN slotta, hazır DEĞİL | `⊕` kızıl | `ÖZEL SİLAH` | kızıl α 0.6 | Q = hazırla |
| SPECIAL_GUN, **hazır** | `⊕` kızıl (tam parlak) | `HAZIR` | kızıl α 0.6↔1.0 yavaş nefes (1.2 Hz, hızlı yanıp sönme YOK) | Q = vazgeç. Çip §3.3 talimatı verir. Vazgeçince ad `ÖZEL SİLAH`'a döner |
| TRAP_BREAKER slotta, tuzakta DEĞİL | `✂` limon | `TUZAK ÇÖZÜCÜ` | limon α 0.6 | Q = ret (§4.3) |
| TRAP_BREAKER slotta, **tuzakta** | `✂` limon | `TUZAK ÇÖZÜCÜ` | limon α 0.6↔1.0 nefes | Çip "Q · TUZAĞI ÇÖZ" |
| Ret (tuzakta değilken Q) | değişmez | değişmez | 0.3 sn `DANGER` α 0.95 sonra eski | `UpgradePage._deny` kalıbı + `SFX.play_ui(tree, "unlock_reset", -8.0, 1.0)` (mevcut ses) |

Alındığında kısa parlama (`modulate 1.6 → 1.0`, 0.4 sn) mevcut `_on_item_changed` davranışıyla gelir.

### 3.3 Durum çipi (YENİ) — slotun sağında, kalıcı durum bilgisi

Neden: Banner 2.5 sn'de söner ve tek kanaldır; "6 sn görünmezim", "silah hâlâ hazır", "tuzaktayım" gibi **süren** durumlar kalıcı, gözün kenarında duran bir yere ihtiyaç duyar. Slot 173 px dar, talimat metni ("HAZIR · SOL TIK ATEŞ · Q VAZGEÇ") sığmaz; slotun hemen sağı boş.

```
 ALT SOL (1920×1080)
 ┌─ oyuncu kartı ─┐   ┌── GÜÇ ──[Q]┐ ┌──────────────────────────────────┐
 │ ...            │   │            │ │ ⊕ HAZIR · SOL TIK ATEŞ · Q VAZGEÇ│  <- çip 3 (özel silah)
 │                │   │     ⊕      │ ├──────────────────────────────────┤
 │                │   │   HAZIR    │ │ ◐ GÖRÜNMEZ · 4.2 sn              │  <- çip 1 (görünmezlik)
 └────────────────┘   └────────────┘ │ ▰▰▰▰▰▰▰▱▱▱  (6 px eriyen bar)    │
   x=27               x=613..786     └──────────────────────────────────┘
                                       x=800, alt kenar = slotun alt kenarı (−27), yukarı doğru dizilir
```

- Konum: sol `x=800`, alt kenar slot ile hizalı (`offset_bottom=-27`), `grow_vertical = BEGIN`; çipler dikey istiflenir, aralık 8 px. En fazla 3 çip aynı anda (görünmezlik + özel silah hazır + tuzakta-çözücü). XP akışı (`_xp_feed`, x=613, y=−220) slot üstünde kalır, çakışmaz; **ui-programmer 1920×1080'de minimap/sohbet ile çakışmayı doğrular** (bu alanın boşluğu koddan değil varsayımdan).
- Stil: `UITheme.style(Color(UITheme.BG, 0.62), 17, Color(renk, 0.7), 1, 20, 10)` (kill feed satırı / banner ile aynı cam). Glif 24 px güç rengi, metin 20 px `font_caps` `TEXT`, sayaç `font_mono`. Min yükseklik 52 px, genişlik içeriğe göre (en az 260).
- `mouse_filter = IGNORE`. Çip görünürken `visible`, gizliyken yer kaplamaz (VBox).

Çip içerikleri:

| Çip | Ne zaman görünür | Metin (birebir) | Ek |
|---|---|---|---|
| Görünmezlik | yerel oyuncuda `invisibility_changed(true, d)` → `invisibility_changed(false, …)` | `GÖRÜNMEZ · %.1f sn` | Altta 6 px eriyen bar (lavanta, sağdan sola, `1.0 → 0.0`). Son 1.5 sn: kenar α 0.4↔1.0, 2 Hz (yanıp sönme değil, yumuşak nefes) |
| Özel silah | yerel `special_armed_changed(true)` → `(false)` | `HAZIR · SOL TIK ATEŞ · Q VAZGEÇ` | Kenar kızıl nefes. Ölünce / atınca / vazgeçince ANINDA kalkar (RTT beklenmez) |
| Tuzak çözücü | slot TRAP_BREAKER **ve** yerel `is_trapped` | `Q · TUZAĞI ÇÖZ` | Q'ya basılıp bar başlayınca ya da slot boşalınca kalkar |

Çipin **bitiş hali** (görünmezlik): `invisibility_changed(false, …)` geldiğinde kalan süre > 0.3 sn ise **bozuldu**, değilse **süre doldu**. Ek sinyal gerekmez.
- Bozuldu: metin `GÖRÜNÜRLÜK BOZULDU`, kenar+metin `DANGER`, 1.2 sn sonra söner.
- Süre doldu: metin `GÖRÜNMEZLİK BİTTİ`, `TEXT_DIM`, 1.0 sn sonra söner.

### 3.4 Banner (mevcut `_alert_chip`, üst orta) — anlık teyit metinleri

| Olay | Metin (birebir) | Renk | Gönderen |
|---|---|---|---|
| Görünmezlik alındı | `◐ GÖRÜNMEZLİK alındı  ·  [Q] kullan` | INFO rengi | `_set_item_rpc` (mevcut genel biçim) |
| Özel silah alındı | `⊕ ÖZEL SİLAH alındı  ·  [Q] hazırla` | INFO rengi | `_set_item_rpc` — tip bazlı dal, anahtar `"%s %s alındı  ·  [Q] hazırla"` |
| Tuzak çözücü alındı | `✂ TUZAK ÇÖZÜCÜ alındı  ·  tuzakta [Q]` | INFO rengi | aynı, anahtar `"%s %s alındı  ·  tuzakta [Q]"` |
| Görünmezlik başladı (yerel) | `◐ GÖRÜNMEZSİN  ·  ateş edersen bozulur` | lavanta | HUD, `invisibility_changed(true, …)` |
| Özel silah hazırlandı (yerel) | `⊕ ÖZEL SİLAH HAZIR  ·  lazerin rakiplere görünür` | kızıl | HUD, `special_armed_changed(true)` |
| Özel silahtan vazgeçildi (yerel) | `⊕ Vazgeçtin  ·  silah slotta` | `TEXT_DIM`→kızıl α 0.7 | HUD, `special_armed_changed(false)` **ve slot hâlâ SPECIAL_GUN** (atıştan sonra çıkmaz) |
| Tuzakta değilken çözücü Q | `Sadece tuzaktayken kullanılır` | `TEXT` | PowerupManager `notice` (yerel) |
| Tuzağa yakalandı + slotta çözücü var | `⚠ TUZAĞA YAKALANDIN! [Q] Tuzak çözücü` | `DANGER` | PowerupManager `_trap_trigger_rpc` |
| Tuzağa yakalandı (çözücü yok) | `⚠ TUZAĞA YAKALANDIN! Takım arkadaşın gelsin` | `DANGER` | mevcut |
| Kendi kendini kurtardı | `✓ TUZAKTAN KURTULDUN` | tuzak çözücü limonu | `_trap_freed_rpc` (yerel, XP yok) |
| Takım arkadaşı kendini kurtardı | `✓ %s tuzaktan kurtuldu` | tuzak çözücü limonu | `_trap_freed_rpc` (takım arkadaşlarına) |

Rakibe ve rakip takıma **hiçbir** banner/uyarı gitmez (görünmezlik kullanımı, özel silah hazırlığı, çözücü kullanımı gizli bilgidir). Takım arkadaşına "X görünmez oldu / özel silah hazırladı" bildirimi **bilerek yok**: banner tek kanal, spam olur; takım zaten titreşimi/lazeri sahnede görür.

### 3.5 Tuzak çözme barı (mevcut `_trap_bar`, tuzaktaki oyuncunun başı üstü)

Aynı bar, `rescuer_peer` ile üç mod ayrışır (HUD `_on_trap_rescue_changed`'de `_rescuer_peer` parametresi artık kullanılır):

| Mod | Koşul | Etiket (birebir) | Süre hesabı | Renk |
|---|---|---|---|---|
| Takım arkadaşı kurtarıyor | `rescuer_peer != trapped_peer` | `KURTARILIYOR · %s · %.1f sn` (mevcut; `%s` = ad ya da `SEN`) | `(1−ratio) × 4` | `DANGER` (mevcut) |
| Kendi kendini çözüyor — **kendisi** | `rescuer_peer == trapped_peer` ve `trapped_peer == yerel` | `ÇÖZÜLÜYOR · %.1f sn` | `(1−ratio) × 3` | limon (çerçeve, dolgu, etiket) |
| Kendi kendini çözüyor — **takım arkadaşı izliyor** | `rescuer_peer == trapped_peer` ve `trapped_peer != yerel` | `%s KENDİNİ ÇÖZÜYOR · %.1f sn` | `(1−ratio) × 3` | limon |

Bar sadece tuzaktakinin takımına görünür (mevcut kural, değişmez); rakip takım barı hiç görmez. Renk farkına ek olarak **etiket metni** farklıdır (renk körü güvenli). Tuzak hasarı çözerken de sürer (hasar kesilmez) → kırmızı hasar vinyeti ve düşük can uyarısı devam eder; bar bunu örtmez.

### 3.6 Nişangah — özel silah hazırken (`Crosshair.gd`)

Mevcut nişangah: saçılmaya göre genişleyen 4 çizgi + nokta, kehribar, şarjör halkası. Özel silahta saçılma yok ve atış tek olduğundan **farklı bir şekil** kullanılır (renk + şekil, renk körü güvenli):

- Çizim: dış kontur siyah α 0.75 (mevcut), ardından `INFO[SPECIAL_GUN].color`.
- **Sabit halka**: yarıçap 15 px, kalınlık 3 px (kontur 7 px), `draw_arc` 40 nokta. Saçılmayla genişlemez (`_gap`/`_kick` yok sayılır).
- **4 çizgi** halkanın dışından: 15 → 24 px (yön: yukarı/aşağı/sol/sağ), kalınlık 3 px. (Şekil ⊕ glifiyle birebir eşleşir.)
- Merkez nokta r=2.5 px.
- Halka α 0.7↔1.0, 1.2 Hz nefes (hızlı titreme yok).
- Şarjör dolum halkası hazırken ÇİZİLMEZ (özel atış şarjörden bağımsızdır; dolum durumu oyuncu kartında zaten görünür). `_empty` (şarjör boş, kırmızı) rengi yok sayılır — şarjör boşken de özel silah ateşlenebilir ve nişangah bunu "ateşlenebilir" gösterir.
- Atış sonrası `special_armed` false olur olmaz normal nişangaha **tek karede** dönülür.
- Sinyal: `Crosshair._on_local_player_spawned` içinde `player.special_armed_changed` bağlanır (`_armed` bayrağı).

### 3.7 Mini harita (`Minimap.gd`)

`player.has_method("is_hidden_from_local") and player.is_hidden_from_local()` ise o oyuncu **hiçbir katmanda** çizilmez: normal oyuncu noktaları, uydu (`all_players` / `enemies`) ve uyduda kart taşıyıcı elması + halkası dahil. Kendisi ve takım arkadaşları için `is_hidden_from_local()` false döner → görünmez takım arkadaşı normal çizilir (takım koordinasyonu). Uydu kullanan oyuncuya "gizli oyuncu var" ipucu verilmez (gizlilik bilgisinin kendisi gizli). Yeni işaret/legenda yok.

### 3.8 Kill feed ve ölüm ekranı

- Özel silah öldürmesi (`method == Player.DAMAGE_SPECIAL`): oyuncu adları arasındaki işaret `▸` yerine **`⊕`** (22 px, `INFO[SPECIAL_GUN].color`). Mevcut bıçak işareti "🔪" emoji olduğu için tutarsız ama bu işin kapsamı dışı; yeni satıra emoji eklenmez.
- Ölüm ekranı `_death_killer`: `Seni özel silahla vuran: %s`. Sıra: kendi tuzağı → arkadan bıçak → bıçak → **özel silah** → mermi (`else`).
- Görünmez biri öldürürse sıradan satır (adı yazar); ölen oyuncu "kimin vurduğunu" öğrenir — adaletsizlik hissini azaltan en ucuz geri bildirim.
- XP: ek bonus yok (`method=4` GameManager'da bonus dalına girmez).

### 3.9 Test modu ipucu çipi (`_setup_test_hint`, yalnız debug)

Satır eklenir (birebir): `4 Görünmezlik   - Özel silah   = Tuzak çözücü`. Test tuşları (sözleşme): `KEY_4`, `KEY_MINUS`, `KEY_EQUAL`.

---

## 4. Oyuncu akışları

### 4.1 Görünmezlik

Alma → bildirim → kullanma → geri bildirim → bitiş:

1. **Alma**: yerden, ≤1.3 m, slot boşsa (mevcut). Banner `◐ GÖRÜNMEZLİK alındı  ·  [Q] kullan`, slot lavanta parlar.
2. **Kullanma**: Q → host `_invis_rpc(peer, 6.0)` → slot BOŞ.
3. **Geri bildirim (kullanan)**: banner `◐ GÖRÜNMEZSİN  ·  ateş edersen bozulur`; çip + bar başlar; gövde ve tüfek lavanta titreşimli yarı saydam (shimmer, §5). Kendi fenerim açık kalır (kendimi ve çevreyi görürüm).
4. **Süren durum**: bar eriyor, son 1.5 sn kenar nefesi. Alma, kart alma, koşma, zıplama, tuzak kurma/güç alma bozmaz. **Ateş (normal veya özel) ve bıçaklama ANINDA bozar.**
5. **Bitiş**: süre dolarsa `GÖRÜNMEZLİK BİTTİ` (sakin); bozulursa `GÖRÜNÜRLÜK BOZULDU` (kırmızı). Shimmer kapanır. Ölüm de bitirir (çip anında kalkar).

Üç izleyici:

| Kimin gözüyle | Görür | Duyar | Görmez |
|---|---|---|---|
| **Kullanan** | Kendi gövdesinde lavanta titreşim (okunur kalır, kendimi kaybetmem), çip + bar, banner, normal nişangah, normal mini harita (kendi noktam) | Kendi adımlarım (normal) | — |
| **Takım arkadaşı** | Görünmeze yarı saydam titreşen gövde + tüfek, isim etiketi (`● Ad`, takım rengi) AYNEN kalır, mini haritada normal nokta | Adım sesleri | Bildirim yok |
| **Rakip** | HİÇBİR ŞEY: gövde, tüfek/bıçak, el feneri ışığı, isim etiketi, kart göstergesi, mermi sayacı, mini harita noktası (uydu dahil) | **Adım sesleri** (kullanıcı kararı; tek karşı-oyun ipucu) | Ateş edince görünürlük bozulur → o anda gövdesi belirir (mermi izi ve namlu parlaması her zaman görünür) |

Ekran dışı: bozulma anında rakip tarafında gövde **yumuşak belirmez**, ağ kararıyla düz açılır (basit, deterministik). Opsiyonel (ui-programmer/shader takdiri, zorunlu değil): rakipte 0.2 sn alfa belirmesi.

### 4.2 Özel silah (tek atış)

1. **Alma**: banner `⊕ ÖZEL SİLAH alındı  ·  [Q] hazırla`, slot kızıl.
2. **Hazırla**: Q → host `_special_gun_rpc(peer, true)`. Onay gelince **birlikte**: tüfek ucunda kırmızı lazer (tüm peer'lar), nişangah ⊕ şekline döner, slot adı `HAZIR`, çip `HAZIR · SOL TIK ATEŞ · Q VAZGEÇ`, banner `⊕ ÖZEL SİLAH HAZIR  ·  lazerin rakiplere görünür`. Mevcut bir ses (ör. `Sfx` reload "bolt"/"mag_in" anahtarlarından biri) çalınabilir; **Sfx'e yeni giriş eklenmez** (sözleşme).
3. **Vazgeç**: hazırken Q → `armed=false`; lazer, çip, nişangah kalkar; slot kalır; banner `⊕ Vazgeçtin  ·  silah slotta`. Tekrar Q ile yeniden hazırlanır. Q spam'ine karşı yerel 0.25 sn debounce önerilir (host round-trip beklenir).
4. **Atış**: sol tık **basışı** (basılı tutmak tekrar atmaz). Tek mermi: hız 160, hasar 999, 1000 m, duvardan geçer, çömelmeyi umursamaz, takım arkadaşından geçer, ilk rakipte durur. Atışta tüfek atış animasyonu çalar (mevcut `fired`), `special_armed` hemen false, nişangah normale döner, çip ANINDA kalkar, slot ~RTT sonra BOŞ olur (arada kısa süre `ÖZEL SİLAH` yazması kabul edilir).
5. **Sonuç**: kill feed `⊕`, hedef ölüm ekranında `Seni özel silahla vuran: …`. Iskalama için özel mesaj yok (mermi dünyada görünür iz bırakır).

Üç izleyici:

| Kimin gözüyle | Hazırken | Atışta |
|---|---|---|
| **Kullanan** | ⊕ nişangah, lazer, HAZIR slotu/çip/banner | Parlak kırmızı-beyaz iz (~3 m), yüksek atış sesi, nişangah normale döner |
| **Takım arkadaşı** | Aynı lazeri görür (kimin hazır olduğu belli) | İz + ses; mermi onlardan geçer |
| **Rakip** | Lazeri görür **yalnızca görüş hattı varsa** ve atan görünmez değilse (bilinçli karşı-oyun ipucu: ~30 m kırmızı çizgi). Görünmez atanın lazeri de gizlidir. Uyarı metni YOK | Atış sesi (3D) + iz; duvar arkasından atış için görsel uyarı yoktur (bkz. Açık Nokta 2) |

### 4.3 Tuzak çözücü

1. **Alma**: banner `✂ TUZAK ÇÖZÜCÜ alındı  ·  tuzakta [Q]`.
2. **Tuzakta değilken Q**: kullanılmaz, slot kalır, banner `Sadece tuzaktayken kullanılır`, slot 0.3 sn `DANGER` kenar + `unlock_reset` sesi. RPC yok.
3. **Tuzağa yakalanma**: banner `⚠ TUZAĞA YAKALANDIN! [Q] Tuzak çözücü` (slotta çözücü varsa); slot ve çip nefes alır; çip `Q · TUZAĞI ÇÖZ`. Mevcut tuzak hasarı/kırmızı vinyet aynen sürer. Tuzaktayken nişangah gizli (mevcut).
4. **Q (tuzakta)**: slot BOŞ, çip kalkar; baş üstü bar `ÇÖZÜLÜYOR · 3.0 sn` → 0 (limon). Takım arkadaşları aynı barı `%s KENDİNİ ÇÖZÜYOR · %.1f sn` olarak görür. (Takım arkadaşı da yanındaysa hızlı olan kazanır; sözleşme: çözücü varsa çözücü hızı = 3 sn.)
5. **Bitiş**: banner `✓ TUZAKTAN KURTULDUN` (XP yok); takım arkadaşlarına `✓ %s tuzaktan kurtuldu`. Tuzak yok olur, oyuncu serbest.

Üç izleyici: **kullanan** (bar+banner), **takım arkadaşı** (bar+banner, kurtarmak için koşmaya gerek kalmadığını görür), **rakip/tuzak sahibi** (HİÇBİR ŞEY; barlar sadece tuzaktakinin takımına görünür. Tuzağı kuran takım yalnızca mevcut tuzak-sönümü geri bildirimini görür).

---

## 5. Karakter görselleri (3 perspektif, shader ajanı için UX gereksinimleri)

`InvisibilityShimmer` (kullanan + takım arkadaşı görür):
- Gövde ve tüfek aynı efektle: yarı saydam, kenarda lavanta fresnel, üstten aşağı **yavaş** kayan tarama bandı (ritim ≤ 1 Hz; saniyede 3'ten fazla parlama YOK).
- **Okunabilirlik**: kendi oyuncumda efekt, karakteri tamamen silmemeli; yön ve duruş seçilmeli (kullanan için `intensity` ≈ 0.6–0.7, takım için ≈ 1.0 — bu sözleşmede tek uniform olduğundan oranı Ajan 4 verir). Karanlık haritada `SelfVisibility` yerine geçtiğinden kendi siluetim kaybolmamalı.
- Renk tek kanal değil: **hareket (tarama bandı) + saydamlık** da ayrıştırıcıdır; lavanta tonu kaldırılsa bile efekt "görünmez" okunur.
- Bitişte (son 1.5 sn) efekt yoğunluğu yükselebilir (takım arkadaşı ve kullanan için "bitiyor" ipucu); rakip tarafı etkilenmez.

`SpecialGunFx` lazer/iz:
- Lazer ince (≤ 3 px görünür kalınlık), additive, ışık yok, gölge yok; ~30 m; uçta küçük nokta. Çok parlak/yoğun olmamalı (karanlıkta göz yorar).
- İz: ~3 m, kırmızı-beyaz çekirdek; tek atış olduğundan fotosensitivite riski yok.

---

## 6. Erişilebilirlik

| Kriter | Durum |
|---|---|
| Sadece klavye+fare | Q ve sol tık (mevcut şema, yeni tuş yok). Tuş yeniden atama yok (oyunun genel eksiği; bu işte yeni sorun yaratmaz) |
| Gamepad | Oyun gamepad desteklemiyor; kapsam dışı, mevcut durumla aynı |
| Renk tek başına bilgi taşımaz | Her güç glif + ad + metinle; nişangah **şekil** farkı (halka); bar renk farkına ek **etiket** farkı; çipler metin içerir; mini harita gizleme renk bağımsız |
| Okunabilir en küçük metin | Çip 20 px / slot adı 15 px caps (mevcut en küçük HUD metniyle aynı); mono sayaç 20 px |
| Yanıp sönme | Hiçbir öğe saniyede 3'ten fazla parlamaz: nefes animasyonları 1.2–2 Hz, kenar alfa değişimi (tam açık/kapalı değil). Maksimum bir kez kullanılan atış izi |
| Hareketi azalt (planlı ayar) | Nefes ve tarama animasyonları bu ayar gelince statiğe düşebilir; HUD animasyonları tek `_pulse()` fonksiyonundan geçsin ki tek yerden kapatılsın |
| Altyazı | Diyalog yok; yeni ses yalnız mevcut ses anahtarları, önemli bilgi sese bağlı DEĞİL (sessiz oynayan bilgi kaybetmez) |
| Ölçekleme | Değerler 1920×1080; `get_combined_minimum_size()` ile slot+çip yüksekliği ölçülür (3 çip: 3×52+2×8 = 172 px < slot yüksekliği, taşma yok) |
| Çeviri | Tüm metinler `tr()` + LangEN; oyuncu adı geçen satırlarda ad etiketinde `auto_translate_mode = DISABLED` |

---

## 7. Kenar durumlar

| Durum | Beklenen davranış |
|---|---|
| Hazırken (özel silah) ölmek | Ölüm: slot boşalır (`_on_kill_happened`), `armed=false` (host), çip/lazer/nişangah anında kalkar. Respawn'da güç yok, silah normal |
| Hazırken tuzağa düşmek | Hazır kalır (lazer açık), ateş zaten tuzakta kilitli; nişangah tuzakta gizli. Kurtulunca ⊕ geri gelir. Çip "HAZIR…" kalır, ikinci çip "Q · TUZAĞI ÇÖZ" yalnız slot TRAP_BREAKER ise (özel silah slotta olduğundan ikisi birlikte olamaz) |
| Hazırken şarjör değişimi / boş şarjör | Özel atış etkilenmez; reload sürer; nişangah ⊕ kalır, dolum halkası çizilmez |
| Hazırken takla/bıçak | Sol tık atışı o sürede reddedilir (sözleşme); hazır kalır, çip duruyor |
| Hazırken görünmezlik | Mümkün (görünmez + hazır): lazer rakipten gizli; ateşte görünürlük bozulur (iki çip yan yana) |
| Görünmezken kart almak | Alma bozmaz. Kart göstergesi rakipten gizli; **banner "TAKIM KARTI ALDI" hâlâ herkese gider** (olay bilgisi, konum değil) — bilinçli, bkz. Açık Nokta 1 |
| Görünmezken kapı kilidi | Çember/ışık sütunu mevcut; kilit paneli rakipte "DURDUR" gösterir (konum yoksa bilgi sınırlı). Görünmezlik 6 sn < kilit 5 sn + yürüme → pratikte taşıyıcıyı örtmez |
| Çözücü tuzakta değilken | §4.3 ret (banner + slot + ses), slot kalır |
| Çözücü, takım arkadaşı zaten kurtarırken | Q yine çalışır; barın kalan süresi çözücü hızına geçer (ratio korunur). Oyuncu gücü gereksiz yakabilir → çip bu durumda gizlenmez (kullanıcı kararı bırakıldı, Açık Nokta 3) |
| Çözücü + sohbet yazarken | Q sohbette işlemez (mevcut `ChatBox.is_typing` kontrolü) |
| Görünmezken çömelmek | Etkisiz; çömelme ayrı mekanik |
| Maç sonu / host migration | Yeni sahne/oyuncu düğümü yeniden doğar; HUD çip durumları oyuncu node'u ve sinyalleri yeniden bağlandığında sıfırlanır (kalıcı çip durumu node dışında tutulmaz). Migrate eden host'ta aktif görünmezlik/hazır silah kaybı kabul edilir (6 sn / tek güç) |
| Geç katılan | Süren görünmezlik/lazer geç katılana görünmeyebilir; kabul (kısa ömürlü) |
| Çip + banner çakışması | Çip kalıcıdır, banner anlık; üst üste binmezler (farklı bölge) |
| `Q` hızlı basışı | İkinci basış ilk RPC cevabı gelmeden yok sayılır (debounce); görünmezlik için host zaten slot boşalttığından çift kullanım olmaz |

---

## 8. Ajan başına UX gereksinimi (özet)

- **Ajan 3 (PowerupManager)**: INFO satırları §3.1; pickup banner tip dalları §3.4 (`[Q] hazırla`, `tuzakta [Q]`); ret notice `Sadece tuzaktayken kullanılır` (TEXT rengi); `_trap_trigger_rpc` yakalanma mesajı slot TRAP_BREAKER ise çözücü metni; `_trap_freed_rpc` `rescuer == trapped` dalı (limon renk); `self_rescue` yazımı `emit`ten önce; test hint satırı yok (HUD) ama TEST_KEYS §3.9.
- **Ajan 4 (Player/Weapon/Bullet)**: `DAMAGE_SPECIAL` **4** (§0). `invisibility_changed(active, duration)` ve `special_armed_changed(armed)` HER peer'da, HUD yalnızca yerel oyuncununkine bağlanır. Ateş etme anında `invisibility_changed(false, 0.0)` gecikmesiz.
- **Ajan 5 (shader)**: §5 gereksinimleri.
- **Ajan 6 (UI)**: §3.2 slot durumları, §3.3 çip, §3.5 bar, §3.6 nişangah, §3.7 minimap, §3.8 kill feed, §3.9 test ipucu. `IconSet` değişmez. Animasyonlar tek `_pulse` yardımcısı.
- **Ajan 7**: §9 listesini `LangEN`'e ekle.

---

## 9. Yeni UI metinleri (`tr()` anahtarı = birebir Türkçe)

```
GÖRÜNMEZLİK
ÖZEL SİLAH
TUZAK ÇÖZÜCÜ
6 sn rakiplerden gizlenir, ateşle bozulur
Tek atış · duvardan geçer · menzil sınırsız
Tuzaktayken kendini kurtarır
%s %s alındı  ·  [Q] hazırla
%s %s alındı  ·  tuzakta [Q]
◐ GÖRÜNMEZSİN  ·  ateş edersen bozulur
GÖRÜNMEZ · %.1f sn
GÖRÜNÜRLÜK BOZULDU
GÖRÜNMEZLİK BİTTİ
HAZIR
HAZIR · SOL TIK ATEŞ · Q VAZGEÇ
⊕ ÖZEL SİLAH HAZIR  ·  lazerin rakiplere görünür
⊕ Vazgeçtin  ·  silah slotta
Seni özel silahla vuran: %s
Sadece tuzaktayken kullanılır
⚠ TUZAĞA YAKALANDIN! [Q] Tuzak çözücü
Q · TUZAĞI ÇÖZ
ÇÖZÜLÜYOR · %.1f sn
%s KENDİNİ ÇÖZÜYOR · %.1f sn
✓ TUZAKTAN KURTULDUN
✓ %s tuzaktan kurtuldu
4 Görünmezlik   - Özel silah   = Tuzak çözücü
```

(`%s %s alındı  ·  [Q] kullan`, `KURTARILIYOR · %s · %.1f sn`, `⚠ TUZAĞA YAKALANDIN! Takım arkadaşın gelsin` zaten LangEN'de.)

---

## 10. Açık noktalar (kullanıcı / game-designer kararı)

1. **Görünmez kart taşıyıcı**: uydu bile çizmeyeceği için 6 sn boyunca kartla kapıya yaklaşmak çok güçlü olabilir. Öneri: kapıdaki kilit paneli/ışık sütunu zaten konum ipucu verdiği için mevcut hâliyle bırak, playtest'te ölç. Alternatif: görünmezken kart alınca görünürlük bozulsun (kullanıcı kararı "ateş/bıçak bozar" ile çelişir, dokunulmadı).
2. **Özel silah, duvar ardından uyarısız ölüm**: rakibin tek ipucu lazer (görüş hattı gerekir) ve atış sesi. Karşı-oyun yetersiz kalırsa öneri: hazırlama anında 3D sese kısa "mekanik" sesi (mevcut reload anahtarı) — ses kararı kullanıcıda.
3. **Çözücü, takım arkadaşı kurtarırken**: gereksiz yakılabilir. İstenirse barın %50'sinden sonra çip kalkar ve Q reddedilir; şu an serbest.
4. **Glif/renk son hali**: art-director onayı; glif doğrulaması (§3.1) sonucu yedek glife dönüş olabilir.
5. **Rakip tarafında belirme**: bozulma anında düz mü, 0.2 sn alfa mı? Şimdilik düz (sözleşmeye uygun, basit).

---

## 11. Sanat Yönü

> **Yazar**: art-director · 2026-11-05 · Referans: `docs/SANAT_KITABI.md` v2 "Sis & Cam" (§2 renk, §3 şekil, §8 ikon dili), `UITheme` paleti, `Powerup.gd` mevcut yer görselleri.
> Kural özeti: kehribar (`ACCENT`) bu işte HİÇBİR yerde kullanılmaz (birincil buton/XP değil). Üç gücün renkleri HUD-durum rengidir (INFO paleti; sanat kitabının "sade palet" kuralı UpgradePage'e özeldir, HUD'daki güç renkleri onun dışında kalır). Renk tek başına bilgi taşımaz: her güç glif + ad + siluet ile ayrışır.

### 11.1 Renk kararları (spec §3.1 düzeltmeleri)

Mevcut oyun renkleri ile mesafe kontrolü yapıldı (takım renkleri `TeamManager.TEAM_COLORS`, HUD `DANGER`, mevcut `INFO`).

| Güç | Nihai `INFO.color` | Spec'e göre | Gerekçe |
|---|---|---|---|
| INVIS | `Color(0.72, 0.62, 1.0)` lavanta | DEĞİŞMEDİ | Hiçbir aktif güçte mor ailesi yok. Tek yakın renk `ENEMY_SAT` (0.8,0.45,1.0) ama o artık doğmuyor (WEIGHTS'te yok) → çakışma yok. Mavi takım (0.2,0.6,1.0) ile ton farkı ~45°, parlaklık farkı yeterli. Soğuk/pastel = "hayalet, hafif" çağrışımı; karanlık haritada yüksek parlaklığı sayesinde slotta/etikette okunur |
| SPECIAL_GUN | `Color(1.0, 0.22, 0.55)` kızıl-eflatun | **DEĞİŞTİ** (1.0,0.30,0.45) | Eski değer KIRMIZI TAKIM (1.0,0.3,0.3) ile ton olarak neredeyse aynıydı (G aynı, B 0.45 vs 0.3): lazer/iz/kill feed `⊕` kırmızı takımın işareti sanılırdı, ayrıca `DANGER` (1.0,0.34,0.28) ile birleşirdi. Magenta'ya ~25° kaydırıldı: "tehdit" çağrışımı (sıcak, kırmızı ailesi) kalır, ama takım kırmızısı, `DANGER` ve `BOMBA` turuncusundan ayrışır. Lazerin kendisi için çekirdek beyaza çekilir (§11.3) → ek ayırt edicilik |
| TRAP_BREAKER | `Color(0.80, 0.92, 0.36)` limon | **DEĞİŞTİ** (0.78,0.90,0.42) | `SAĞLIK` yeşili (0.35,0.95,0.5) ve yeşil takım (0.3,0.9,0.3) ile yakın olmaması için sarıya biraz kaydırıldı (ton ~72°), doygunluk artırıldı. Sarı takım (1.0,0.85,0.1) ile arası ~20°: takım rengiyle bu güç aynı ekranda nadiren yan yana gelir (takım rengi nokta/isim etiketinde, güç rengi slot/etiket/bar'da) ve glif `✂` + ad zaten ayırır |

Kısıtlar: (1) Üç renk de `ACCENT` ile en az 25° ve belirgin doygunluk farkı taşır. (2) Üç gücün hiçbiri `DANGER` kırmızısını **anlam olarak** ödünç almaz; `DANGER` yalnızca hata/uyarı (ret flaşı, "GÖRÜNÜRLÜK BOZULDU"). (3) Yeşil-sarı / kırmızı-turuncu karışımına karşı güvence: glif ve siluet (§11.4).

### 11.2 Görünmezlik shimmer görünümü (`InvisibilityShimmer.gdshader`)

Hedef his: cam gibi, soğuk, **sakin** — "Sis & Cam"ın karakter üstündeki karşılığı. Efekt karakteri silmez, **cama çevirir**; abartılı neon/hologram yok.

| Parametre | Karar |
|---|---|
| Ana renk (`shimmer_color`) | Lavanta ama soluk: `Color(0.78, 0.72, 1.0)` (INFO lavantasının %20 beyaza çekilmişi; doygun mor değil). Kod tarafında INFO rengi yerine bu değer varsayılan olsun |
| Genel karakter | Gövde ve tüfeğin KENDİ dokusu/silueti okunur kalır (kullanan oyuncu yönünü, duruşunu seçebilmeli). Overlay base'i şeffaflaştıramaz → yarı saydam his şöyle kurulur: base'in üstüne düşük alfa (α ~0.30–0.45) soğuk koyu-lavanta karışımı (doygunluğu bastırır) + kenar fresnel + tarama bandı. Gerçek alfa ile gövdeyi eritmeye ÇALIŞMA (paylaşılan malzeme önbelleği `SurvivalistModel._get_material` bozulur) |
| Fresnel kenar | Belirgin ama ince: güç ~2.5, kenar rengi `shimmer_color` × 1.2, α kenarda 0.85'e çıkar, merkezde ~0.15. Siluet "cam kenarı" gibi parlar — karanlık haritada kullanıcı ve takım arkadaşı için yön/okunurluk bunun üstünden gelir |
| Tarama bandı | Üstten aşağı kayan TEK yatay bant (dünya Y bazlı, nesne uzayı değil → duruş değişse de akış sürer). Hız ~0.6–0.8 Hz (bir geçiş ≈ 1.3–1.6 sn), bant kalınlığı gövde boyunun ~%12'si, kenarlar yumuşak, bant parlaklığı kenar fresnel'den **düşük**. İkinci bir bant, noise bozulması (ışık kırılması gibi küçük UV sapması) opsiyonel; 3 Hz üstü hiçbir şey yok (§6) |
| Titreşim | Çok hafif (±%8 intensity, 2–3 Hz DEĞİL; yavaş sinüs ~0.8 Hz). "Hayalet frekansı" ayrıştırıcı olarak hareketle gelir, renkle değil |
| Işık davranışı | `unshaded` + `blend_mix`; emisyon eklenir ama maksimum parlaklık sis bombası perdesi/el feneri vurgusundan parlak olmamalı (gözü almasın). Tepe değer ≈ HUD `TEXT` beyazının %70'i |
| Intensity | Kullanan ≈ 0.65 (kendimi kaybetmem; `SelfVisibility` yerine geçtiği için siluet garantisi), takım arkadaşı ≈ 1.0. Son 1.5 sn: +0.2 yavaş yükselir (bitiş ipucu), yanıp sönme yok |
| Tüfek | Gövdeyle AYNI shader ve renk (tek efekt, tek bütünlük); tüfeğin tarama bandı gövdeninkiyle faz eşit tutulur ki ayrı iki efekt gibi görünmesin |
| İsim etiketi | Takım arkadaşında `● Ad` takım renginde AYNEN kalır (spec §4.1); shimmer ona uygulanmaz |
| Bitiş | Kullanan/takım: 0.15–0.25 sn içinde intensity 0'a söner (basit lerp). Rakip tarafı: düz belirme (spec Açık Nokta 5 → bu sürümde düz kalır; shader takdiriyle 0.2 sn fade-in eklenebilir ama zorunlu DEĞİL) |

Kabul testi (görsel): (a) Karanlıkta 20 m'den kullanan, takım arkadaşı olarak "burada görünmez biri var, yönü şu" diye okunur; (b) iki görünmez oyuncu yan yana aynı efektle ayrışabilir (isim etiketi ayırır); (c) alevli/sisli sahnede (sis bombası içinde) lavanta ile sis karışmaz çünkü fresnel kenarı ve tarama bandı gri sisi aşar; (d) fener ışığı doğrudan vurunca efekt "yanmaz".

### 11.3 Özel silah: lazer ve iz (`SpecialGunFx`)

Dünya birimi referansı: kamera ~18 m uzakta, 1080p'de ~39 px/m. Aşağıdaki kalınlıklar ekranda hedef pikseldir.

| Öğe | Renk | Kalınlık | Yoğunluk / blend | Diğer |
|---|---|---|---|---|
| **Lazer** gövdesi | `Color(1.0, 0.22, 0.55)` (INFO) | dünya 0.04–0.05 m (≈ 2 px ekranda, **3 px'i geçmez**) | additive, unshaded, α 0.55, ışık/gölge YOK | ~30 m, son %30'unda alfa 0'a lineer söner (sert bitiş yok; 30 m'de bitiş görünmesin) |
| Lazer çekirdeği (isteğe bağlı ince iç şerit) | `Color(1.0, 0.75, 0.85)` | gövdenin %40'ı | additive, α 0.8 | Gözün "kırmızı çizgi" yerine "enerji" okuması için; yoksa atlanabilir |
| Lazer **ucu** | `Color(1.0, 0.45, 0.65)` | küçük disk/küre r ≈ 0.08 m | additive, α 0.9, nabız yok (sabit) | Çarptığı yüzeyde kalıcı nokta değil, ışının ucu (30 m'de) → yerde "sıçrama" izi yok (abartı olmasın) |
| Lazer nabzı | — | — | α 0.45↔0.65, ≤1.2 Hz sinüs | Yavaş "nefes", titreme/flicker YOK |
| **İz (tracer)** çekirdeği | beyaz-pembe `Color(1.0, 0.93, 0.95)` | 0.10–0.12 m | additive, α 1.0 | Mermi hızı 160 m/s: 60 FPS'te 1 kare ≈ 2.7 m → ~3 m iz kare kare kesintisiz çizgi gibi görünür; çekirdek kuyruğa doğru %0'a söner |
| İz halesi | `Color(1.0, 0.22, 0.55)` | 0.22–0.28 m | additive, α 0.45 | Çekirdeği sarar; kenar yumuşak |
| Işık | yok | — | — | OmniLight YOK (kamera sarsıntısı/patlama değil; çok oyunculu maliyet). Çok küçük gerekirse r ≤ 1.2 m, enerji ≤ 0.6, gölgesiz |

Ayırt edicilik ve okunurluk:
- Normal mermi: turuncu emissive iz (`Mermi_OyunIci_Tracer`). Özel iz: **beyaz-pembe çekirdek + eflatun hale, 2× kalın, 4× uzun** → tek bakışta "bu başka mermi".
- Lazer rakipten yalnızca görüş hattıyla görünür (Ajan 4 kararı); görünmez atanın lazeri hiç yok. Renk SPECIAL_GUN rengi olduğu için kırmızı takım işaretiyle karışmaz (§11.1).
- Lazer "sniper kızılötesi" gibi hissedilmeli: çok parlak değil, karanlıkta ince bir çizgi. Sis bombası içinde kaybolur (additive ama düşük α) — beklenen.
- Atış: namlu parlaması mevcut tüfek atışı ile gelir (ayrı bir "büyük patlama" yok). Fotosensitivite: tek atış, tek iz; kare başı parlama sıçraması yok.
- Hazır durumunda tüfek gövdesinde/namlusunda ekstra glow YOK (lazer yeterli); fazla efekt, `HandRifle` mesh'iyle Z-fight riski.

### 11.4 Yerdeki pickup görselleri (`Powerup.gd`)

Mevcut kalıp korunur: `_visual` y=0.9 üstünde parlayan çekirdek, yerde `ring` (torus, aynı glow malzemesi), `OmniLight3D` (INFO rengi, enerji 1.8, menzil 4), `Label3D` "glif ad" (INFO rengi, `no_depth_test`), `ProximityReveal` uzaktan gizleme, mevcut dönme/yüzme davranışı değişmez. Yeni üç görsel **siluet** ile ayrışır (renk körü güvenli) ve mevcut yedi silüetle çakışmaz:

Mevcut silüetler: küre (bomba), artı (sağlık), prizma (uydu), düşük silindir (flaş), kapsül (sis), yassı disk+çarpı (tuzak), halka (takım uydusu).

| Tip | Siluet | Yapı (boyutlar metre) | Malzeme / ışık |
|---|---|---|---|
| **INVIS (7)** | Faceted (pahlı) kristal küre — yarı saydam, bomba küresinden "çokgen ve cam" olmasıyla ayrışır | `SphereMesh` radius 0.30, **radial_segments 6, rings 3** (pahlı his = §3 şekil dili), Y ölçeği ×1.25 (hafif uzun kristal). İç çekirdek yok | Mümkünse **`InvisibilityShimmer` malzemesi** (intensity 1.0, şeffaf karışım) doğrudan çekirdek malzemesi olur → oyuncu "yerdeki bu = giydiğim titreşim" bağını öğrenir. Shader malzemesi çalışmazsa yedek: `glow` albedo α 0.4 + emission 1.4, `transparency ALPHA`. Çekirdek alfa nabzı 0.35↔0.6 (≤0.8 Hz). Işık: INFO lavantası, enerji 1.4 (diğerlerinden hafif soluk; "görünmez" teması), menzil 4 |
| **SPECIAL_GUN (8)** | Uzun ince çubuk (yatay) + ucunda tek kızıl nokta — tek yatay-uzun siluet; tüm diğerleri kompakt | Gövde `BoxMesh` 0.95 × 0.07 × 0.10 (uzun kasa), arka uçta 0.2 × 0.05 × 0.14 kabza bloğu, ön uçta `SphereMesh` r 0.05 "kırmızı nokta" (lazer ucu). Hafif yukarı eğik (+8° pitch) | Gövde koyu gunmetal `Color(0.12, 0.13, 0.15)` + emission INFO × 0.6 (siluet karanlıkta okunur); nokta emission INFO × 3.5 (en parlak yer, odak noktası). Işık: INFO, enerji 2.2, menzil 4.5 (nadir güç → bir kademe öne çıksın; yine de bomba gibi uzaktan çığlık atmasın) |
| **TRAP_BREAKER (9)** | Dikey duran açık makas — tuzakla (yassı disk) karışmaz, uzun-dikey | İki bıçak `BoxMesh` 0.55 × 0.05 × 0.09, kesişme noktasında (pivot) ±22° açıyla V şeklinde açık, XY düzleminde (kameraya yarı dönük); alt uçlarda iki küçük `TorusMesh` sap halkası (inner 0.04, outer 0.075). Toplam yükseklik ~0.6 m | Tüm parçalar `glow` (INFO limon, emission 2.2). Yavaş Y ekseni dönüşü (mevcut `_visual` dönüşü) makas açısını sürekli okutur. Işık: INFO, enerji 1.8, menzil 4 |

Ortak kurallar:
- Emisyon enerjisi: standart parçalar 2.2 (mevcut), vurgu parçası (kırmızı nokta) 3.5'i aşmaz; hiçbir pickup mevcutlardan **belirgin** parlak olmasın (karanlık atmosferi korumak için; uzaktan keşif `ProximityReveal` ile mesafeye bağlı).
- Pahlı/yarım-çokgen dil: yeni küre/silindir kullanılırsa düşük segment sayısı (6–8). Yuvarlak pürüzsüz yeni yüzey eklenmez (ikon dilinin 3D karşılığı; tek istisna sap torusları ve mevcut yer halkası).
- Yer halkası ve Label3D rengi INFO rengi — INVIS halkası diğerlerinden biraz daha soluk (α 0.8 malzeme çarpanı).
- Tuzak (6) ile Tuzak Çözücü (9) yan yana doğarsa: biri yassı-yatay disk, diğeri uzun-dikey makas → aynı ailenin farklı rolü; renk (kahverengi-gri ↔ limon) farkı yardımcı.
- Label3D glifi (`◐ ⊕ ✂`): `✂` Windows'ta emoji renklendirmesine düşerse yedek glife dönülür (§3.1 doğrulaması); Label3D `modulate` renkli emoji'yi boyamaz → bu durumda yedek şart.

### 11.5 HUD ve ikon notları

- **Slot, çip, bar, banner**: sanat kitabı §3 uyarınca cam panel, `BORDER`/INFO kenarı, beyaz metin. Kenar rengi INFO rengi yalnızca durum çiplerinde (HUD'daki mevcut banner/trap bar kalıbı); çip dolgusu INFO ile boyanmaz (cam kalır). Hiçbir yerde `ACCENT` yok.
- **Nişangah (§3.6)**: halka kalınlığı 3 px / 15 px yarıçap, dış kontur siyah α 0.75 — INFO rengi `Color(1.0, 0.22, 0.55)` ile çizilir. Kırmızı takım rengi nişangahta yok (nişangah takım rengi kullanmaz) → karışma riski yok.
- **Kill feed `⊕`**: yeni kırmızı-eflatun ton; takım adları `team_tag` renkleriyle yazıldığından (kırmızı takım adı kırmızı) simge/ad ayrımı için `⊕` ile ad arasında boşluk bırakılır, simge 22 px.
- **IconSet**: sanat kitabı §8 ikon dili ve ızgarası bu işte genişletilmez (UX spec kararı). İleride HUD glifleri ikon diline taşınırsa şu taslaklar geçerli olur (24 birim, 2.0 çizgi, miter, sekizgen):
  - `invis`: yarı dolu sekizgen — `OCT(12,12,8)` konturu + sağ yarısı `[d]` α 0.25 dolu, ortada dikey `L(12,4)-(12,20)`.
  - `special`: `OCT(12,12,6.5)` + dört çentik `L(12,2)-(12,5.5)`, `L(12,18.5)-(12,22)`, `L(2,12)-(5.5,12)`, `L(18.5,12)-(22,12)` + merkez `[F]` kare (damage ikonundan farkı: iç artı çizgileri `L(12,8)-(12,16)`, `L(8,12)-(16,12)` ve çentiklerin dışarıda kalması; nişangah ailesi).
  - `breaker`: iki çapraz bıçak `L(5,4)-(17,16)`, `L(19,4)-(7,16)` + alt sap iki küçük `C` kare halka `C[(3.5,17) (8,17) (8,21.5) (3.5,21.5)]`, `C[(16,17) (20.5,17) (20.5,21.5) (16,21.5)]`.
- **Renk körü kontrol listesi** (deutan/protan): `BOMBA` ↔ `ÖZEL SİLAH` ad+glif+siluet; `SAĞLIK` ↔ `TUZAK ÇÖZÜCÜ` ad+glif+siluet (artı vs makas, yatay/dikey); `UYDU/FLAŞ` ↔ `GÖRÜNMEZLİK` ad+glif (`◈`/`✦` vs `◐`) — renk hiçbir ayrımın tek yolu değil.

### 11.6 Sanat kitabı uyum özeti (Art Director kapısı)

| Kontrol | Sonuç |
|---|---|
| Kehribar yalnızca birincil eylem/XP | Uyumlu — hiçbir yeni öğe `ACCENT` kullanmıyor |
| Cam panel + ince beyaz kenar + beyaz metin | Uyumlu — çipler `UITheme.style(BG α 0.62…)` camı |
| Renk tek başına bilgi taşımaz | Uyumlu — glif + ad + siluet + etiket farkı |
| Animasyon ≤ 3 Hz, tek `_pulse` | Uyumlu — nefes 0.8–1.2 Hz, tarama ≤ 0.8 Hz |
| Takım renkleriyle çakışma | **Düzeltildi** — ÖZEL SİLAH rengi kırmızı takımdan, TUZAK ÇÖZÜCÜ yeşil/sarı takım ve SAĞLIK'tan uzaklaştırıldı (§11.1) |
| Yeni emoji | Yok (tek karakterlik Dingbat/geometrik glifler; `✂` fallback şartı) |
| Yeni ses/ışık maliyeti | Yok; pickup başına tek OmniLight (mevcut kalıp), iz/lazerde ışık yok |
| Açık sorun | `ENEMY_SAT` INFO'da durduğu sürece lavantaya yakın; doğmadığı için kabul. Eğer ileride yeniden eklenirse INVIS'e göre yeniden renklendirilmelidir |

---

## Review Notları

> **Reviewer**: ux-reviewer (ux-review kriterleri, 2026-11-05) · **Checklist**: 3A (HUD akışı spec'i; Template satırı "UX Spec")
> **Verdict: NEEDS REVISION** (uygulama öncesi 1 engelleyici + birkaç uyarı; spec tasarım olarak sağlam)
> **Erişilebilirlik**: NOT ASSESSED — `design/accessibility-requirements.md` yok, taahhüt edilmiş seviye yok. Spec §6 fiilen Basic+ seviyesini varsayıyor (renk tek başına değil, yanıp sönme < 3 Hz); bu bir VARSAYIMDIR. `/ux-design accessibility` önerilir (bu işi bloklamaz).
> **Pattern Library**: NOT ASSESSED — `design/ux/interaction-patterns.md` yok.

### Engelleyici (uygulamadan önce çözülmeli)

1. **`DAMAGE_SPECIAL := 2` çakışması (BLOCKING).** Doğrulandı: `Player.DAMAGE_MELEE := 2`, `GameManager.KILL_KNIFE := 2` (GameManager.gd:40, 566). Özel silah 2 ile gelirse bıçak XP bonusu verilir, kill feed bıçak ikonu, ölüm ekranı yanlış cümle. Ajan 4 sözleşmesi "2" diyor; **4 olmalı** (§0 önerisi doğru). Şef sabitlemeyi güncellemeli; HUD `Player.DAMAGE_SPECIAL` sabitiyle karşılaştırmalı. GameManager'a dokunulmaz (4 bonus dalına girmez, `kill_happened` aynen geçer).

### Uyarılar (önerilen, bloklamaz)

2. **Sözleşme uyumu: banner anahtarları.** Mevcut `_set_item_rpc` genel biçimi `%s %s alındı  ·  [Q] kullan`; §3.4 tip bazlı iki yeni biçim istiyor (`[Q] hazırla`, `tuzakta [Q]`). Sözleşmede bu Ajan 3'e yazılmamış; Ajan 3 yalnızca INFO/WEIGHTS/RPC'leri biliyor. Şef Ajan 3'e bu iki dalı bildirmeli, yoksa üçü de "[Q] kullan" yazar (özel silah/çözücü için yanıltıcı).
3. **Çip için sinyal kaynağı eksik: "tuzakta mı".** §3.3 "Q · TUZAĞI ÇÖZ" çipi yerel `is_trapped` değişimine bağlı; sözleşmede Player'dan böyle bir sinyal yok. HUD ya poll eder (`_process`, mevcut ölüm ekranı kalıbı gibi) ya da `trap_rescue_changed`/`notice` kullanır. Ajan 6 poll ile yapsın (yeni sinyal şart değil); Ajan 4'ten sinyal beklenmesin.
4. **Q debounce / kısmi durum.** §4.2 "Q spam'ine 0.25 sn debounce önerilir" — Ajan 3 sözleşmesinde yok. Host toggle olduğu için hızlı çift Q arm→disarm yapar ve lazer/çip titrer. Ajan 3: `_unhandled_key_input`'ta yerel 0.25 sn kilit (RPC yanıtı beklemeden) ekle.
5. **Özel silah atışı sonrası kısa tutarsızlık.** Yerel `set_special_armed(false)` hemen, slot ise `_request_special_fired` + RTT sonra boşalır. Bu arada oyuncu Q'ya basarsa host hâlâ slot SPECIAL_GUN görür ve **ikinci kez arm eder** (ikinci atış hakkı kapısı). Ajan 3: `_request_use`'da SPECIAL_GUN için yerel "atış gönderildi" bayrağı (`local_special_fired` çağrılınca slot boşalana dek Q yok sayılır) VEYA host `_request_special_fired` gelene dek arm reddet; en az: host tarafında ateş sonrası slotu atış anında boşalt. Çok-oyunculu kötüye kullanım riski olarak ele alın.
6. **Glif doğrulaması kanıtsız.** `✂ ◐ ⊕` fontta olmayabilir (UITheme fontları). Spec doğru olarak ui-programmer'a bırakıyor; kabul kriteri olarak "57/22 px'te tofu/emoji yok" eklensin (aşağıdaki kabul kriterleri).
7. **Minimap `has_method` + takım arkadaşı.** §3.7 doğru; ek not: `is_hidden_from_local()` yerel oyuncu İÇİN false dönmeli (kendi noktası çizilsin) — Ajan 4 sözleşmesi bunu içeriyor ("yerel oyuncu kendisi değil"), uyumlu. Uydu `enemies` modunda ve kart taşıyıcı elması dalının AYRI çizim kodu olabilir; Ajan 6 her iki çizim yolunu da taramalı.
8. **Lazer görünürlüğü ↔ sözleşme.** §4.2 "rakip lazeri yalnızca görüş hattı varsa görür" — sözleşme lazeri sadece `is_hidden_from_local` ile gizliyor; görüş hattı mevcut karanlık/fener/ışık davranışıyla doğal gelir (özel kontrol yok). Spec bunu "yalnızca görüş hattı" diye ayrı kural gibi okutmasın: ek ışın kontrolü YAZILMAZ (kapsam şişmesi).
9. **Yerel gizleme listesi.** `AmmoLabel`, `card_indicator`, `NameLabel` rakipten gizli; ama kendi takım arkadaşı için `NameLabel` kalmalı (§4.1 ile uyumlu). Ajan 4 sözleşmesi "is_hidden_from_local true ise gizli" der; doğru. Ancak `card_indicator` zaten sadece aynı takıma görünür — çift mantık çakışmasın (hidden_from_local dalı yalnız GİZLER, asla GÖSTERMEZ).
10. **Dikey sığma varsayımı.** §3.3 3 çip = 172 px; slot sol-alt 173 px yüksek. Minimap sağ altta, sol alt sohbet (HUD oyuncu kartı üstü) ile çakışma tahmin; ui-programmer 1920×1080 ve 1280×720'de ekran görüntüsüyle doğrulasın.
11. **Yerelleştirme sınırları yok.** §9 listesinde 40% genişleme/maks karakter notu eksik. Öneri: çip genişliği içeriğe göre ama maks 520 px; EN karşılığı `HAZIR · SOL TIK ATEŞ · Q VAZGEÇ` en uzun metin (~32 karakter) → çip metni 520 px'e sığmazsa tek satır kırp değil, çip genişlesin (min 260). Slot adı 15 px `TUZAK ÇÖZÜCÜ` 173 px'e sığmalı (EN "TRAP BREAKER" benzer uzunluk) — kontrol edilsin.
12. **Test ipucu metni** (§9 son satır) `LangEN`'e eklenecek mi? Debug-only; atlanabilir ama Ajan 7 listesinde var — zararsız.

### Eksik spec bölümleri (şablon farkı, ADVISORY)

Bu spec tam bir ekran şablonu değil, HUD katmanı özelliği olarak yazılmış. Şablona göre eksik/zayıf: Navigation Position ve Entry/Exit (HUD için N/A, sorun değil), Data Requirements tablosu (kaynak-sahip: görünmezlik süresi = host RPC → Player; spec metinde var ama tablo yok), Events Fired (analytics: kullanım/iptal/ret sayıları için olay yok), net sayılı Acceptance Criteria (yok). Aşağıda minimum eklenmiştir.

### Veri kaynağı özeti (UI state sahibi DEĞİL)

| Veri | Kaynak/sahip | Güncelleme | Boş durum |
|---|---|---|---|
| Kalan görünmezlik | `Player.invisibility_changed(active,duration)` (host RPC → Player yerel zamanlayıcı) | sinyal + HUD `_process` geri sayım | çip gizli |
| Özel silah hazır | `Player.special_armed_changed` | sinyal | normal nişangah/çip yok |
| Slot tipi | `PowerupManager.inventory_changed` | sinyal | `—  BOŞ` |
| Tuzakta mı | `Player.is_trapped` | HUD poll (kare) | çip gizli |
| Tuzak çözme oranı | `trap_rescue_changed(trapped, ratio, rescuer)` | host 10 Hz sync | bar gizli |

### Kabul kriterleri (QA için, 1920×1080)

1. Görünmezlik alınıp Q'ya basılınca slot boşalır, çip `GÖRÜNMEZ · 6.0 sn` ile başlar ve 0'a iner; rakip ekranında oyuncunun gövdesi, tüfeği, feneri, ismi ve minimap noktası (uydu dahil) görünmez, takım arkadaşı ekranında yarı saydam titreşim ve normal minimap noktası görünür.
2. Görünmezken ateş veya bıçak anında `GÖRÜNÜRLÜK BOZULDU` (kırmızı) gösterir ve rakip ekranında gövde belirir; süre dolarsa `GÖRÜNMEZLİK BİTTİ`.
3. Özel silahta Q → lazer + ⊕ nişangah + `HAZIR · SOL TIK ATEŞ · Q VAZGEÇ` AYNI karede; tekrar Q → hepsi kalkar, slot `ÖZEL SİLAH` kalır; sol tık basışı tek atış yapar, tutmak ikinci atış yapmaz, atıştan sonra nişangah tek karede normale döner ve slot boşalır.
4. Özel silah öldürmesi kill feed'de `⊕`, ölen ekranında `Seni özel silahla vuran: %s`; bıçak XP bonusu VERİLMEZ, kill feed bıçak ikonu çıkmaz (DAMAGE_SPECIAL ≠ 2).
5. Tuzaktayken Q: bar `ÇÖZÜLÜYOR · 3.0 sn` (limon) 3 sn'de biter, takım arkadaşları `%s KENDİNİ ÇÖZÜYOR · %.1f sn` görür; hasar süresince devam eder. Tuzakta değilken Q: `Sadece tuzaktayken kullanılır`, slot kalır, RPC yok.
6. Hiçbir HUD animasyonu saniyede 3 kezden fazla tam parlak/sönük geçiş yapmaz (nefes 1.2-2 Hz).
7. `✂ ◐ ⊕` glifleri 57 px ve 22 px'te kare kutu veya renkli emoji olarak çizilmez; çıkarsa yedek glif kullanılır.
8. 1920×1080'de 3 çip + slot + minimap/sohbet çakışmaz; 1280×720 ölçeklemede de taşmaz.
9. Ölüm, maç sonu ve sahne yeniden kurulumunda çip/lazer/shimmer kalıntısı kalmaz.
10. Slot dolu iken ikinci güç alınmaz (mevcut), ve özel silah atışından sonra Q ile ikinci arm denenemez.

### Sonuç

Spec: oyuncu ihtiyacı net, üç izleyici ayrımı tutarlı, renk-körü ve yanıp-sönme kuralları iyi, sözleşme imzalarına uyuyor. **Tek engelleyici: DAMAGE_SPECIAL değeri 4 olmalı (madde 1).** Madde 2-5 Şef/Ajan 3 için sözleşmeye eklenmeli; kalanı ui-programmer kabul kriteriyle kapatır. Madde 1 çözülünce bu spec APPROVED'a yakın.
