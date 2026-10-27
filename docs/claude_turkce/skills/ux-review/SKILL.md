---
name: ux-review
description: "Bir UX spesifikasyonunu, HUD tasarımını veya kalıp kütüphanesini doğrular — erişilebilirlik, GDD uyumu, hazır olma durumu. APPROVED / NOT ASSESSED / NEEDS REVISION / MAJOR REVISION NEEDED."
argument-hint: "[file-path or 'all' or 'hud' or 'patterns']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash "*/.claude/skills/ux-review/../../hooks/yaml-helper.sh" resolve_config *)
model: sonnet
---
> Bu dosya `.claude\skills\ux-review\SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys workflow`

Yukarıda çözüldü — olduğu gibi kullan. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar.

# UX Review

## Genel Bakış

UX tasarım dokümanlarını uygulama hattına (pipeline) girmeden önce doğrular.
`/team-ui` hattında UX Tasarımı ile Görsel Tasarım/Uygulama arasındaki kalite
kapısı görevini görür.

**Bu skill'i şu durumlarda çalıştır:**
- `/ux-design` ile bir UX spesifikasyonunu tamamladıktan sonra
- `ui-programmer` veya `art-director`'a teslim etmeden önce
- Pre-Production'dan Production'a geçiş kapısı kontrolünden önce (önemli ekranların
  incelenmiş UX spesifikasyonlarına sahip olmasını gerektirir)
- Bir UX spesifikasyonunda büyük revizyonlardan sonra

**Karar seviyeleri:**
- **APPROVED (Onaylandı)** — spesifikasyon eksiksiz, tutarlı ve uygulamaya hazır
- **NOT ASSESSED (Değerlendirilmedi)** — bir veya daha fazla inceleme boyutunun karşılaştırılacak bir
  ölçütü yoktu ya da spesifikasyon okunamadı; hangisi olduğunu belirt
- **NEEDS REVISION (Revizyon Gerekli)** — belirli eksikler bulundu; teslimden önce düzelt ama tam bir yeniden tasarım değil
- **MAJOR REVISION NEEDED (Büyük Revizyon Gerekli)** — kapsam, oyuncu ihtiyacı veya
  bütünlükle ilgili temel sorunlar; önemli ölçüde yeniden çalışma gerekiyor

**`NOT ASSESSED`, APPROVED'ın üstünde ve iki revizyon kararının altında yer alır.** Bir
boyutu değerlendiremeyen bir inceleme, spesifikasyonun uygulamaya hazır olduğunu
göstermemiştir; ama birinin bulduğu bir eksik, kimsenin arayamadığı bir eksikten
daha fazla eyleme dönüştürülebilir, bu yüzden onların yerini almamalıdır. Spesifikasyon dosyası
okunamadığında, bir kontrol listesi boyutunun karşılaştırılacak bir doğruluk kaynağı olmadığında veya
erişilebilirlik seviyesi taahhüt edilmemiş olduğunda (aşağıda) bunu ver.

---

## Aşama 1: Argümanları Ayrıştır

- **Belirli bir dosya yolu** (ör. `/ux-review design/ux/inventory.md`): o tek
  dokümanı doğrula
- **`all`**: `design/ux/` içindeki tüm dosyaları bul ve her birini doğrula
- **`hud`**: özellikle `design/ux/hud.md` dosyasını doğrula
- **`patterns`**: özellikle `design/ux/interaction-patterns.md` dosyasını doğrula
- **Argüman yok**: kullanıcıya hangi spesifikasyonun doğrulanacağını sor

`all` için önce bir özet tablo (dosya | karar | birincil sorun) yazdır, sonra
her biri için tam ayrıntı ver.

**Bir dosyanın hangi kontrol listesini aldığı** (bir dosya yolu veya `all` altındaki her dosya):
`/ux-design`'ın yazdığı `> **Template**:` başlık satırı — `UX Spec` → Aşama 3A,
`HUD Design` → 3B, `Interaction Pattern Library` → 3C. Bu satırı olmayan bir dosya
adına göre sınıflandırılır — `hud.md` → 3B, `interaction-patterns.md` → 3C, diğer
her şey → 3A — ve rapor hangi kontrol listesini varsaydığını ve nedenini belirtir.

---

## Aşama 2: Çapraz Referans Bağlamını Yükle

Herhangi bir spesifikasyonu doğrulamadan önce şunları yükle:

1. **Girdi ve Platform yapılandırması**: `project.yaml` içindeki `platform` bloğunu oku
   (`platform.targets`, `platform.primary_input`, `platform.gamepad_support`,
   `platform.touch_support`); `project.yaml`'da `platform` bloğu yoksa,
   `.claude/docs/technical-preferences.md` içindeki `## Input & Platform` bölümüne
   geri dön. Desteklenen girdi yöntemleri kümesi için: `project.yaml`'dan
   okurken türet — `targets` içinde `PC` veya `Web` varsa klavye/fare;
   `gamepad_support` Full veya Partial ise gamepad; `touch_support` Full veya
   Partial ise dokunmatik; artı `primary_input`.
   `technical-preferences.md`'ye geri dönüldüğünde, bunun yerine onun açık Input
   Methods alanını kullan. Bu, Aşama 3A'daki Input Method Coverage (Girdi Yöntemi Kapsamı)
   kontrolleri için yetkili kaynaktır — spesifikasyonun kendi başlığı değil. İki kaynak da
   yapılandırılmamışsa spesifikasyon başlığına geri dön.
2. `design/accessibility-requirements.md` içinde taahhüt edilen erişilebilirlik seviyesi
   (varsa)
3. `design/ux/interaction-patterns.md` konumundaki etkileşim kalıbı kütüphanesi (varsa)
4. Spesifikasyonun başlığında atıfta bulunulan GDD'ler (UI Requirements bölümlerini oku:
   başlıkları Grep aracıyla bul (desen `^#`, content modu) ve bu aralıkları
   offset ve limit ile Read et)
5. Varışta bağlam doğrulaması için `design/player-journey.md` konumundaki oyuncu yolculuğu
   haritası (varsa)

---

## Aşama 3A: UX Spesifikasyonu Doğrulama Kontrol Listesi

`ux-spec.md` tabanlı bir dokümana karşı tüm kontrolleri çalıştır.

### Bütünlük (zorunlu bölümler)

- [ ] Status, Author, Platform Target içeren doküman başlığı mevcut
- [ ] Purpose & Player Need — oyuncu bakış açısından bir ihtiyaç ifadesi var (geliştirici
  bakış açısından değil)
- [ ] Player Context on Arrival — oyuncunun durumunu ve önceki etkinliğini tarif ediyor
- [ ] Navigation Position — ekranın hiyerarşide nerede durduğunu gösteriyor
- [ ] Entry & Exit Points — tüm giriş kaynakları ve çıkış hedefleri belgelenmiş
- [ ] Layout Specification — bölgeler tanımlanmış, bileşen envanteri tablosu mevcut
- [ ] States & Variants — en azından: yükleme, boş/dolu ve hata durumları
  belgelenmiş
- [ ] Interaction Map — tüm hedef girdi yöntemlerini kapsıyor (başlıktaki platform
  hedefini kontrol et)
- [ ] Data Requirements — gösterilen her veri öğesinin bir kaynak sistemi ve sahibi var
- [ ] Events Fired — her oyuncu eyleminin karşılık gelen bir olayı veya olay olmamasının
  açıklaması var
- [ ] Transitions & Animations — en azından giriş/çıkış geçişleri belirtilmiş
- [ ] Input Method Completeness Checklist — Platform Target satırındaki her girdi yöntemi
  için bir blok; işaretlenmemiş her madde Open Questions altında listelenmiş
- [ ] Accessibility Requirements — ekran düzeyinde gereksinimler mevcut
- [ ] Localization Considerations — metin öğeleri için maksimum karakter sayıları
- [ ] Acceptance Criteria — en az 5 belirli, test edilebilir kriter

### Kalite Kontrolleri

**Oyuncu İhtiyacının Netliği**
- [ ] Amaç sistem/geliştirici bakış açısından değil, oyuncu bakış açısından yazılmış
- [ ] Oyuncunun varıştaki hedefi açık ("Oyuncu ___ isteğiyle gelir")
- [ ] Varıştaki oyuncu bağlamı belirli (sadece "envanteri açtılar"
  değil)

**Durumların Bütünlüğü**
- [ ] Hata durumu belgelenmiş (sadece mutlu yol değil)
- [ ] Boş durum belgelenmiş (veri olmayan senaryo)
- [ ] Ekran asenkron veri çekiyorsa yükleme durumu belgelenmiş
- [ ] Zamanlayıcılı veya otomatik kapanan her durum süresiyle birlikte belgelenmiş

**Girdi Yöntemi Kapsamı**
- [ ] Platform PC içeriyorsa: yalnızca klavyeyle gezinme tam olarak belirtilmiş
- [ ] Platform konsol/gamepad içeriyorsa: d-pad gezinmesi ve yüz tuşu (face button)
  eşlemesi belgelenmiş
- [ ] Hiçbir etkileşim gamepad'de fare benzeri hassasiyet gerektirmiyor
- [ ] Odak sırası tanımlanmış (klavye için Tab sırası, gamepad için d-pad sırası)

**Veri Mimarisi**
- [ ] Hiçbir veri öğesinin sahibi "UI" olarak listelenmemiş (UI oyun durumuna sahip olmamalıdır)
- [ ] Tüm gerçek zamanlı veriler için güncelleme sıklığı belirtilmiş (sadece "gerçek zamanlı" değil —
  güncellemeyi ne tetikliyor?)
- [ ] Tüm veri öğeleri için null durumunun ele alınması belirtilmiş (veri
  kullanılamadığında ne gösteriliyor?)

**Erişilebilirlik**
- [ ] `accessibility-requirements.md`'deki erişilebilirlik seviyesi karşılanmış veya aşılmış
- [ ] Basic seviyeyse: yalnızca renge dayalı bilgi göstergesi yok
- [ ] Standard seviye ve üstüyse: odak sırası belgelenmiş, metin kontrast oranları belirtilmiş
- [ ] Comprehensive seviye ve üstüyse: önemli durum değişiklikleri için ekran okuyucu duyuruları
- [ ] Renk körlüğü kontrolü: renk kodlu her öğenin renk dışı alternatifleri var

**GDD Uyumu**
- [ ] Başlıkta atıfta bulunulan her GDD UI Gereksinimi bu spesifikasyonda ele alınmış
- [ ] Hiçbir UI öğesi karşılık gelen bir GDD gereksinimi olmadan oyun durumunu göstermiyor
  veya değiştirmiyor
- [ ] Hiçbir GDD UI Gereksinimi bu spesifikasyonda eksik değil (atıfta bulunulan
  GDD bölümleriyle çapraz kontrol et)

**Kalıp Kütüphanesi Tutarlılığı**
- [ ] Tüm etkileşimli bileşenler kalıp kütüphanesine atıfta bulunuyor (veya yeni
  kalıp olduklarını not ediyor)
- [ ] Kalıp kütüphanesinde zaten var olan hiçbir kalıp davranışı sıfırdan yeniden
  belirtilmemiş
- [ ] Bu spesifikasyonda icat edilen yeni kalıplar kalıp kütüphanesine eklenmek
  üzere işaretlenmiş

**Yerelleştirme**
- [ ] Metin ağırlıklı tüm öğeler için karakter sınırı uyarıları mevcut
- [ ] Yerleşim açısından kritik her metin %40 genişlemeyi karşılayacak şekilde işaretlenmiş

**Kabul Kriterlerinin Kalitesi**
- [ ] Kriterler, tasarım dokümanlarını görmemiş bir QA test uzmanı için yeterince belirli
- [ ] Performans kriteri mevcut (ekran X ms içinde açılır)
- [ ] Çözünürlük kriteri mevcut
- [ ] Hiçbir kriter değerlendirilmek için başka bir dokümanı okumayı gerektirmiyor

---

## Aşama 3B: HUD Doğrulama Kontrol Listesi

`hud-design.md` tabanlı bir dokümana karşı tüm kontrolleri çalıştır.

### Bütünlük

- [ ] HUD Philosophy tanımlanmış
- [ ] Information Architecture tablosu, GDD'lerde UI Requirements bulunan TÜM sistemleri kapsıyor
- [ ] Layout Zones, tüm hedef platformlar için güvenli alan kenar boşluklarıyla tanımlanmış
- [ ] Her HUD öğesinin tam bir spesifikasyonu var (bölge, görünürlük tetikleyicisi, veri
  kaynağı, öncelik)
- [ ] HUD States by Gameplay Context en azından şunları kapsıyor: keşif, çatışma,
  diyalog/ara sahne, duraklatılmış
- [ ] Information Hierarchy her HUD öğesine bir öncelik seviyesi veriyor (MUST KEEP /
  SHOULD KEEP / CAN HIDE / ALWAYS HIDE)
- [ ] Visual Budget tanımlanmış (aynı anda maksimum öğe, maksimum ekran yüzdesi)
- [ ] Platform Adaptation tüm hedef platformları kapsıyor
- [ ] Oyuncunun ayarlayabileceği öğeler için Tuning Knobs mevcut
- [ ] Acceptance Criteria — en az 5 belirli, test edilebilir kriter

### Kalite Kontrolleri

- [ ] Hiçbir HUD öğesi, onu gizleyecek bir görünürlük kuralı olmadan merkezi oyun alanını
  kaplamıyor
- [ ] Herhangi bir GDD'de var olan her bilgi maddesi ya HUD'da ya da açıkça
  "gizli/istek üzerine" olarak kategorilendirilmiş
- [ ] Renk kodlu tüm HUD öğelerinin renk körlüğü varyantları var
- [ ] Feedback & Notification bölümündeki HUD öğelerinin kuyruk/öncelik
  davranışı tanımlanmış
- [ ] Görsel Bütçe uyumu: aynı andaki toplam öğe sayısı bütçe dahilinde

### GDD Uyumu

- [ ] `design/gdd/systems-index.md` içinde UI kategorisine sahip tüm sistemlerin
  HUD'da temsili var (veya yokluğu gerekçelendirilmiş)

---

## Aşama 3C: Kalıp Kütüphanesi Doğrulama Kontrol Listesi

- [ ] Kalıp kataloğu dizini güncel (dokümandaki gerçek kalıplarla eşleşiyor)
- [ ] Tüm standart kontrol kalıpları belirtilmiş: düğme varyantları, açma/kapama (toggle),
  kaydırıcı (slider), açılır liste (dropdown), liste, ızgara, modal, iletişim kutusu, toast, ipucu (tooltip), ilerleme çubuğu,
  giriş alanı, sekme çubuğu, kaydırma
- [ ] Mevcut UX spesifikasyonlarının ihtiyaç duyduğu tüm oyuna özgü kalıplar mevcut
- [ ] Her kalıbın şunları var: Ne Zaman Kullanılır, Ne Zaman KULLANILMAZ, tam durum spesifikasyonu,
  erişilebilirlik spesifikasyonu, uygulama notları
- [ ] Animasyon Standartları tablosu mevcut
- [ ] Ses Standartları tablosu mevcut
- [ ] Kalıplar arasında çelişen davranış yok (ör. "Geri" davranışı tüm
  navigasyon kalıplarında tutarlı)

---

## Aşama 4: Kararı Yazdır

```markdown
## UX Review: [Document Name]
**Date**: [date]
**Reviewer**: ux-review skill
**Document**: [file path]
**Checklist**: [3A / 3B / 3C — from its Template line, or assumed from the file name]
**Platform Target**: [from header]
**Accessibility Tier**: [from header or accessibility-requirements.md]

### Completeness: [X/Y sections present]
- [x] Purpose & Player Need
- [ ] States & Variants — MISSING: error state not documented

### Quality Issues: [N found]
1. **[Issue title]** [BLOCKING / ADVISORY]
   - What's wrong: [specific description]
   - Where: [section name]
   - Fix: [specific action to take]

### GDD Alignment: [ALIGNED / GAPS FOUND]
- GDD [name] UI Requirements — [X/Y requirements covered]
- Missing: [list any uncovered GDD requirements]

### Accessibility: [COMPLIANT / GAPS / NON-COMPLIANT / NOT ASSESSED]
- Target tier: [tier]
- [list specific accessibility findings]

> **If `design/accessibility-requirements.md` is absent there is no committed
> tier, so this dimension has no criterion.** Report
> `Accessibility: NOT ASSESSED — no committed tier (design/accessibility-requirements.md absent)`
> and do NOT report it as COMPLIANT — a gate compared against an absent standard
> passes the way an assertion that can never fail passes. The same rule lives in
> `/team-ui` Phase 4 and is mirrored here so the two cannot drift. If the spec's own
> header states a tier, carry it forward as an **assumption** and say plainly that
> it was assumed rather than committed. Recommend `/ux-design accessibility` to
> establish the tier.

### Pattern Library: [CONSISTENT / INCONSISTENCIES FOUND / N/A]
- [findings]

> **For a HUD design there is no Pattern Library checklist to run it against (Phase 3B has none), so Pattern Library is N/A, excluded from the dimension count.**
> Report `Pattern Library: N/A — no pattern library checklist for this document
> type`.
>
> For a UX spec, this dimension does have a checklist — it is checked against
> `design/ux/interaction-patterns.md`. If that file is absent: N/A only where
> the workflow tier does not require the library (`minimal`) — report
> `Pattern Library: N/A — interaction pattern library not required at this
> tier`. At any tier that requires or recommends it (`standard`, `full`), report
> `Pattern Library: NOT ASSESSED — design/ux/interaction-patterns.md not found`
> instead: the library is missing, not out of scope, and NOT ASSESSED counts it
> against the verdict as the unresolved item it is.

### Verdict: APPROVED / NOT ASSESSED / NEEDS REVISION / MAJOR REVISION NEEDED
**Blocking issues**: [N] — must be resolved before implementation
**Advisory issues**: [N] — recommended but not blocking
**Dimensions not assessed**: [N] — [name each, and what would make it checkable]

[For APPROVED]: This spec is ready for handoff to `/team-ui` Phase 2
(Visual Design).

[For NOT ASSESSED]: [N] of the four review dimensions could not be evaluated:
[name them]. The spec may well be sound — this review cannot say either way for
those dimensions. [For each: the one input that would make it checkable.]
Handoff to `/team-ui` is not recommended on this result.

[For NEEDS REVISION]: Address the [N] blocking issues above, then re-run
`/ux-review`.

[For MAJOR REVISION NEEDED]: The spec has fundamental gaps in [areas].
Recommend returning to `/ux-design` to rework [sections].
```

**Yukarıdaki rapor şablonunun Türkçe açıklaması** (şablonun kendisi kod bloğu olduğu için İngilizce bırakıldı):

- Başlık alanları: doküman adı, tarih, inceleyen (ux-review skill), dosya yolu, kullanılan kontrol listesi (3A/3B/3C — Template satırından veya dosya adından varsayılan), platform hedefi, erişilebilirlik seviyesi.
- **Completeness (Bütünlük)**: X/Y bölüm mevcut; eksik bölümler "MISSING" ile belirtilir.
- **Quality Issues (Kalite Sorunları)**: her sorun için başlık, BLOCKING (engelleyici) / ADVISORY (tavsiye niteliğinde), neyin yanlış olduğu, nerede olduğu ve nasıl düzeltileceği.
- **GDD Alignment (GDD Uyumu)**: ALIGNED (uyumlu) / GAPS FOUND (eksik bulundu); her GDD için kapsanan gereksinim sayısı ve eksikler.
- **Accessibility (Erişilebilirlik)**: COMPLIANT / GAPS / NON-COMPLIANT / NOT ASSESSED. **`design/accessibility-requirements.md` yoksa taahhüt edilmiş bir seviye yoktur, dolayısıyla bu boyutun ölçütü yoktur.** `Accessibility: NOT ASSESSED — no committed tier (design/accessibility-requirements.md absent)` raporlanır ve COMPLIANT olarak RAPORLANMAZ — var olmayan bir standarda göre karşılaştırılan bir kapı, asla başarısız olamayan bir doğrulamanın (assertion) geçtiği gibi geçer. Aynı kural `/team-ui` Aşama 4'te de vardır ve ikisi birbirinden sapmasın diye burada tekrarlanmıştır. Spesifikasyonun kendi başlığı bir seviye belirtiyorsa, bu bir **varsayım** olarak ileri taşınır ve taahhüt edilmediği, varsayıldığı açıkça söylenir. Seviyeyi belirlemek için `/ux-design accessibility` önerilir.
- **Pattern Library (Kalıp Kütüphanesi)**: CONSISTENT / INCONSISTENCIES FOUND / N/A. **HUD tasarımı için karşılaştırılacak bir Kalıp Kütüphanesi kontrol listesi yoktur (Aşama 3B'de yok), bu yüzden Pattern Library N/A'dır ve boyut sayımından çıkarılır** — `Pattern Library: N/A — no pattern library checklist for this document type` raporlanır. UX spesifikasyonu için bu boyutun bir kontrol listesi vardır — `design/ux/interaction-patterns.md`'ye göre kontrol edilir. O dosya yoksa: yalnızca iş akışı seviyesinin kütüphaneyi gerektirmediği durumda (`minimal`) N/A olur — `Pattern Library: N/A — interaction pattern library not required at this tier` raporlanır. Kütüphaneyi gerektiren veya öneren herhangi bir seviyede (`standard`, `full`) bunun yerine `Pattern Library: NOT ASSESSED — design/ux/interaction-patterns.md not found` raporlanır: kütüphane kapsam dışı değil, eksiktir ve NOT ASSESSED onu karara karşı çözülmemiş bir madde olarak sayar.
- **Verdict (Karar)**: APPROVED / NOT ASSESSED / NEEDS REVISION / MAJOR REVISION NEEDED; engelleyici sorun sayısı (uygulamadan önce çözülmeli), tavsiye niteliğindeki sorun sayısı (önerilir ama engelleyici değil), değerlendirilemeyen boyut sayısı (her birinin adı ve onu kontrol edilebilir yapacak şey).
- APPROVED için: spesifikasyon `/team-ui` Aşama 2'ye (Görsel Tasarım) teslime hazırdır.
- NOT ASSESSED için: dört inceleme boyutundan [N] tanesi değerlendirilemedi (adları verilir). Spesifikasyon pekâlâ sağlam olabilir — bu inceleme o boyutlar için ne olumlu ne olumsuz bir şey söyleyebilir. Her biri için onu kontrol edilebilir yapacak tek girdi belirtilir. Bu sonuçla `/team-ui`'a teslim önerilmez.
- NEEDS REVISION için: yukarıdaki [N] engelleyici sorunu gider, sonra `/ux-review`'u yeniden çalıştır.
- MAJOR REVISION NEEDED için: spesifikasyonun [alanlarda] temel eksikleri var. [Bölümleri] yeniden çalışmak için `/ux-design`'a dönülmesi önerilir.

---

## Aşama 5: İşbirlikçi Protokol

Bu skill SALT OKUNURDUR — asla dosya düzenlemez veya yazmaz. Yalnızca bulguları raporlar.

Kararı verdikten sonra:
- **APPROVED** için: uygulama koordinasyonunu başlatmak üzere `/team-ui` çalıştırmayı öner
- **NOT ASSESSED** için: boyut başına eksik girdiyi adlandır ve onu üretmeye yardım etmeyi
  teklif et (taahhüt edilmemiş bir seviye için `/ux-design accessibility`, eksik UI gereksinimleri
  için GDD yolu). İncelemeyi aynı eksik girdilerle yeniden çalıştırıp farklı bir karar
  raporlama — bu kararı yalnızca yeni girdiler değiştirir
- **NEEDS REVISION** için: belirli eksikleri düzeltmeye yardım etmeyi teklif et ("Eksik hata
  durumunun taslağını çıkarmana yardım etmemi ister misin?") — ama otomatik düzeltme yapma; kullanıcının
  talimatını bekle
- **MAJOR REVISION NEEDED** için: yeniden çalışılacak belirli bölümlerle `/ux-design`'a
  dönmeyi öner

Kullanıcının devam etmesini asla engelleme — karar tavsiye niteliğindedir. Riskleri belgele,
bulguları sun, endişelere rağmen devam edip etmeyeceğine kullanıcı karar versin. NEEDS REVISION
spesifikasyonuyla devam etmeyi seçen bir kullanıcı belgelenmiş riski üstlenir.
