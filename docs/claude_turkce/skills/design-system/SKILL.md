---
name: design-system
description: "Tek bir sistem için bölüm bölüm GDD (Oyun Tasarım Dokümanı) yazımı — gerekli her bölümü sırayla ele alır, bağımlılıklarla çapraz kontrol yapar."
argument-hint: "<system-name> [--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Agent, AskUserQuestion, TaskCreate, TaskGet, TaskList, TaskUpdate, Bash(bash "*/.claude/skills/design-system/../../hooks/yaml-helper.sh" resolve_config *), Bash(bash .claude/scripts/registry.sh *)
model: sonnet
---

> Bu dosya `.claude\skills\design-system\SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys review_mode,automation,workflow,docs.density,system_overrides`

Yukarıda çözümlenmiştir — olduğu gibi kullan; `--review` bayrağı `review_mode` değerini geçersiz kılar. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar geçerlidir.

# Design System

Bu skill çağrıldığında:

## 1. Argümanları Ayrıştır ve Doğrula

**Şimdi `references/1-parse-arguments.md` dosyasını oku ve takip et** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında konuşma sıkıştırıldıysa (compaction) veya kaldığı yerden devam ettirildiyse dosyayı tekrar oku.

## 2. Bağlam Topla (Okuma Aşaması)

**Şimdi `references/2-gather-context.md` dosyasını oku ve takip et** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında konuşma sıkıştırıldıysa veya kaldığı yerden devam ettirildiyse dosyayı tekrar oku.

## 3. Dosya İskeletini Oluştur

**Şimdi `references/3-file-skeleton.md` dosyasını oku ve takip et** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında konuşma sıkıştırıldıysa veya kaldığı yerden devam ettirildiyse dosyayı tekrar oku.

## 4. Bölüm Bölüm Tasarım

**Şimdi `references/4-section-design.md` dosyasını oku ve takip et** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında konuşma sıkıştırıldıysa veya kaldığı yerden devam ettirildiyse dosyayı tekrar oku.

## 5. Tasarım Sonrası Doğrulama

**Şimdi `references/5-post-design.md` dosyasını oku ve takip et** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında konuşma sıkıştırıldıysa veya kaldığı yerden devam ettirildiyse dosyayı tekrar oku.

## 6. Uzman Agent Yönlendirmesi

Bu skill, alan uzmanlığı için işi uzman agent'lara devreder. Ana oturum genel akışı
yönetir (orkestrasyon); agent'lar uzman içerik sağlar.

**Buradaki satırlar dokuz `Category` değerinden bilerek daha ayrıntılıdır** — dövüş
(combat) için doğru uzman, yol bulma (pathfinding) için doğru uzman değildir, ama ikisi de
`Gameplay` kategorisindedir. İki adımda çözümle: önce sistemin `Category` değerini
`systems-index.md` dosyasından al, sonra o kategori içinde sistemin gerçekte ne yaptığına
uyan satırı seç. Her kategorinin en az bir satırı vardır, yani hiçbir şey açıkta kalmaz.

| `Category` | Aşağıdan seçilebilecek satırlar |
|---|---|
| `Gameplay` | Combat/damage/health · AI/pathfinding/behavior · Animation/character movement · Character systems · Camera/input/controls |
| `Core` | Foundation/Infrastructure · Camera/input/controls |
| `Persistence` | Foundation/Infrastructure |
| `Economy` | Economy/loot/crafting |
| `Progression` | Progression/XP/skills |
| `UI` | UI systems · Visual effects (sistem HUD'a yakın bir görsel efekt (VFX) olduğunda) |
| `Audio` | Audio systems |
| `Narrative` | Dialogue/quests/lore |
| `Meta` | Foundation/Infrastructure (analitik, eğitim/tutorial altyapısı) · UI systems (erişilebilirlik seçenekleri ekranları) |

İki satır uyuyorsa, ikisinin Birincil (Primary) agent'larının birleşimini başlat ve nedenini söyle.

| Sistem türü | Birincil Agent | Destekleyici Agent(lar) |
|----------------|---------------|---------------------|
| **Foundation/Infrastructure** (olay veriyolu (event bus), kaydet/yükle, sahne yönetimi, servis bulucu (service locator)) | `systems-designer` | `gameplay-programmer` (uygulanabilirlik), `engine-programmer` (motor entegrasyonu) |
| Dövüş, hasar, can | `game-designer` | `systems-designer` (formüller), `ai-programmer` (düşman yapay zekâsı), `art-director` (isabet geri bildirimi görsel yönü, VFX amacı) |
| Ekonomi, ganimet, üretim (crafting) | `economy-designer` | `systems-designer` (eğriler), `game-designer` (döngüler) |
| İlerleme, XP, yetenekler | `game-designer` | `systems-designer` (eğriler), `economy-designer` (harcama noktaları / sink'ler) |
| Diyalog, görevler, hikâye arka planı (lore) | `game-designer` | `narrative-director` (hikâye), `writer` (içerik), `art-director` (karakter görsel profilleri, sinematik ton) |
| UI sistemleri (HUD, menüler) | `game-designer` | `ux-designer` (akışlar), `ui-programmer` (uygulanabilirlik), `art-director` (görsel stil yönü), `technical-artist` (render/shader kısıtları) |
| Ses sistemleri | `game-designer` | `audio-director` (yön), `sound-designer` (spesifikasyonlar) |
| Yapay zekâ, yol bulma, davranış | `game-designer` | `ai-programmer` (uygulama), `systems-designer` (puanlama) |
| Seviye/dünya sistemleri | `game-designer` | `level-designer` (mekânsal), `world-builder` (lore) |
| Kamera, girdi, kontroller | `game-designer` | `ux-designer` (his), `gameplay-programmer` (uygulanabilirlik) |
| Animasyon, karakter hareketi | `game-designer` | `art-director` (animasyon stili, poz dili), `technical-artist` (rig/blend kısıtları), `gameplay-programmer` (his) |
| Görsel efektler, parçacıklar, shader'lar | `game-designer` | `art-director` (VFX görsel yönü), `technical-artist` (performans bütçesi, shader karmaşıklığı), `systems-designer` (tetikleyici/durum entegrasyonu) |
| Karakter sistemleri (istatistikler, arketipler) | `game-designer` | `art-director` (karakter görsel arketipi), `narrative-director` (karakter gelişim çizgisi uyumu), `systems-designer` (istatistik formülleri) |

**`Agent` aracıyla iş devrederken**:
- Şunları ver: sistem adı, oyun konsepti özeti, bağımlılık GDD'lerinden alıntılar, üzerinde
  çalışılan belirli bölüm ve hangi soruya uzman görüşü gerektiği
- Agent, analizini/önerilerini ana oturuma döndürür
- Ana oturum, agent'ın çıktısını `AskUserQuestion` ile kullanıcıya sunar
- Kararı kullanıcı verir; dosyaya ana oturum yazar
- Agent'lar dosyalara doğrudan YAZMAZ — tüm dosya yazımları ana oturuma aittir

---

## 7. Kurtarma ve Devam Etme

Oturum kesintiye uğrarsa (sıkıştırma, çökme, yeni oturum):

1. `production/session-state/active.md` dosyasını oku — mevcut sistemi ve hangi
   bölümlerin tamamlandığını kaydeder
2. `design/gdd/[system-name].md` dosyasını oku — gerçek içeriği olan bölümler bitmiştir;
   `[To be designed]` içeren bölümler hâlâ çalışma gerektirir. Dosyayı bölüm bölüm oku:
   başlıkları Grep aracıyla bul (desen `^#`, content modu) ve o aralıkları
   offset ve limit ile Read et.
3. Bir sonraki tamamlanmamış bölümden devam et — tamamlanmış olanları yeniden tartışmaya gerek yok

Artımlı (incremental) yazmanın önemli olmasının nedeni budur: onaylanan her bölüm her türlü
kesintiden sağ çıkar.

---

## İşbirliği Protokolü

**`collaborative` modunda (varsayılan).** `guided` ve `autonomous` modları için
`.claude/docs/automation-modes.md` içindeki moda özel kurallara bak — aşağıdaki
"Asla" satırları collaborative modun gerektirdiklerini anlatır, her durumda
geçerli olanları değil.

Bu skill her adımda işbirliğine dayalı tasarım ilkesini izler:

1. Her bölüm için **Soru -> Seçenekler -> Karar -> Taslak -> Onay**
2. Her karar noktasında **AskUserQuestion** (Açıkla -> Yakala deseni):
   - Aşama 2: "Başlamaya hazır mısın, yoksa daha fazla bağlam mı gerekiyor?"
   - Aşama 3: "İskeleti oluşturabilir miyim?"
   - Aşama 4 (her bölüm): Tasarım soruları, yaklaşım seçenekleri, taslak onayı
   - Aşama 5: "Varlık kayıt defterini (entity registry) güncelleyebilir miyim? Sistem
     dizinini güncelleyebilir miyim? Sırada ne var?" — "Tasarım incelemesi çalıştırılsın mı?"
     **değil**: §5c, `/design-review`'u aynı oturum içinde önermeyi yasaklar, çünkü
     inceleyen agent bu oturumun tasarım geçmişini devralmamalıdır. Aşama 5c devri sunar; asla sormaz.
3. İskeletten önce ve her bölüm yazımından önce **"[filepath] dosyasına yazabilir miyim?"**
4. **Artımlı yazma**: Her bölüm onaydan hemen sonra dosyaya yazılır
5. **Oturum durumu güncellemeleri**: Her bölüm yazımından sonra
6. **Çapraz kontrol**: Her bölüm, mevcut GDD'lerle çelişki olup olmadığını kontrol eder
7. **Uzman yönlendirmesi**: Karmaşık bölümler uzman agent görüşü alır, bu görüş karar için
   kullanıcıya sunulur — asla sessizce yazılmaz

**Asla** GDD'nin tamamını otomatik üretip olup bitmiş bir iş (fait accompli) olarak sunma.
**Asla** kullanıcı onayı olmadan bir bölüm yazma.
**Asla** onaylanmış mevcut bir GDD ile, çelişkiyi işaretlemeden ters düşme.
**Her zaman** kararların nereden geldiğini göster (bağımlılık GDD'leri, temel ilkeler (pillars), kullanıcı seçimleri).

## Bağlam Penceresi Farkındalığı

Bu uzun süren bir skill'dir. Her bölümü yazdıktan sonra, durum satırının (status line)
bağlamı %70 veya üzerinde gösterip göstermediğini kontrol et. Öyleyse yanıta şu notu ekle:

> **Bağlam sınıra yaklaşıyor (≥%70).** İlerlemen kaydedildi — onaylanan tüm
> bölümler `design/gdd/[system-name].md` dosyasına yazıldı. Devam etmeye hazır olduğunda,
> yeni bir Claude Code oturumu aç ve `/design-system [system-name]` komutunu çalıştır — hangi
> bölümlerin tamamlandığını algılayıp bir sonrakinden devam edecektir.

---

## Önerilen Sonraki Adımlar

- Tamamlanan GDD'yi bağımsız olarak doğrulamak için **yeni bir oturumda** `/design-review design/gdd/[system-name].md` çalıştır
- Bu GDD'deki değerlerin diğer GDD'lerle çelişmediğini doğrulamak için `/consistency-check` çalıştır
- Tasarlanmamış, en yüksek öncelikli bir sonraki sisteme geçmek için `/map-systems next` çalıştır
- Tüm MVP GDD'leri yazılıp incelendiğinde `/gate-check technical-setup` çalıştır
