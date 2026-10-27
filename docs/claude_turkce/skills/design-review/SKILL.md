---
name: design-review
description: "Tek bir tasarım belgesini eksiksizlik, iç tutarlılık, uygulanabilirlik ve tasarım standartları açısından inceler. Programcılara teslim etmeden önce."
argument-hint: "[path-to-design-doc] [--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Agent, AskUserQuestion, Bash(bash "*/.claude/skills/design-review/../../hooks/yaml-helper.sh" resolve_config *), Bash(bash .claude/scripts/review-receipts.sh check *), Bash(bash .claude/scripts/review-receipts.sh hash *), Bash(bash .claude/scripts/gdd-structure-check.sh *), Bash(grep -E '^  - name:' design/registry/entities.yaml), Bash(grep -n -i -E *)
model: sonnet
---

> Bu dosya `.claude/skills/design-review/SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys review_mode,automation,workflow,system_overrides`

Yukarıda çözümlendi — olduğu gibi kullan; `--review`, `review_mode`'u geçersiz kılar. `--depth`,
aynı bayrağın (flag) 1.1 öncesi adıdır: `--depth <mode>`'u tam olarak
`--review <mode>` gibi ele al ve adının değiştiğini bir kez söyle. İkisi birlikte verilirse `--review`
kazanır ve `--depth` yok sayılır — bunu söyle. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar.

# Tasarım İncelemesi (Design Review)


## Aşama 0: Argümanları Ayrıştır


Tam kontrol kalıbı için `.claude/docs/director-gates.md` dosyasına bak. Tek tek kapı (gate) tanımları `.claude/docs/director-gates/[gate-id].md` içinde durur — başlatılan ajan kendi kapı dosyasını okur; üst oturumda (parent session) onu okuma.


Her `AskUserQuestion` çağrısı `.claude/docs/automation-modes.md` kurallarına uyar
(collaborative her zaman sorar · guided sadece büyük kararlarda sorar · autonomous kaydeder ve devam eder;
`automation_always_ask` kategorileri her zaman sorulur).

İncelenen GDD (Oyun Tasarım Belgesi) için **`workflow`** — blok `<system>` için bir `system_overrides` satırı listeliyorsa onu, yoksa proje değerini kullan. Doğrulama kapsamı seviyeyi izler:
- `full` — 8 bölümün tamamı doğrulanır; eksik herhangi bir bölüm onayı engeller.
- `standard` — 5 zorunlu bölüm (Overview, Detailed Rules, Edge Cases,
  Dependencies, Acceptance Criteria) eksikse engeller; Formulas yalnızca
  sistem sayısal kurallar tanımlıyorsa engeller (oranlar, eğriler, eşikler, maliyetler — 
  kategori bir ipucudur, test değil); Player Fantasy ve
  Tuning Knobs tavsiye niteliğindedir (uyarır, asla engellemez), `workflow_overrides`
  onları zorunlu kılmadıkça.
- `minimal` — GDD beklenmez; varsa 5 standart bölümü tavsiye
  niteliğinde doğrula.

Çözümlenen mod bu incelemenin ne kadar kapsamlı olacağını kontrol eder:

- **`full`**: Tam inceleme — tüm aşamalar + uzman ajan devri (Aşama 3b)
- **`lean`**: Tüm aşamalar, uzman ajan yok — daha hızlı, tek oturumluk analiz
- **`solo`**: Sadece Aşama 1-4, devir yok, Aşama 5 sonraki adım sorusu yok — başka bir skill'in içinden çağrıldığında kullan

---

## Aşama 1: Belgeleri Yükle

**Önce tazelik kontrolü — değişmemiş bir belgenin yeniden incelenmesi tam
maliyete mal olur ve aynı kararı tekrar üretir.** Şunu çalıştır:

```
Bash: bash .claude/scripts/review-receipts.sh check "design/gdd/reviews/[doc-name]-review-log.md" "[target-doc-path]" "design/registry/entities.yaml" ".claude/skills/design-review/SKILL.md"
```

Kayıt defteri (registry) kontrolde yer alır çünkü bu inceleme belgeler arası olgular için
ona başvurur — *değişmiş* bir kayıt defterine karşı incelenen değişmemiş bir GDD
farklı sonuçlara varabilir; bu yüzden atlama sadece **her** satır `UNCHANGED`
okuduğunda güvenlidir (hiç var olmamış bir kayıt defteri çıktıda
görünmez ve atlamayı engellemez). Bu skill'in dosyası da içindedir
çünkü değişmiş bir skill farklı inceler. Kontrol ayrıca günlüğün damgaladığı diğer
her dosyayı da karşılaştırır — önceki incelemelerin okuduğu ilgili GDD'ler, konsept veya özet ve anlatı (narrative)
dosyaları — ve artık var olmayan biri için `GONE:` yazdırır.

Ardından en son girdinin `Review mode:` satırını oku. O inceleme bu çalışmayı ancak
modu şimdi çözümlenen modla aynı veya ondan derinse
(`full` > `lean` > `solo`) ve workflow'u aynı veya daha derinse (`full` >
`standard` > `minimal`) **kapsar**. Bu satırı içermeyen bir girdi, satır
var olmadan önce yazılmıştır ve hiçbir şeyi kapsamaz.

- **Hepsi `UNCHANGED`** ve günlüğün en son girdisi bir karar taşıyorsa — onu göster:
  *"This document is byte-identical to its last review on [date] ([mode]
  review, verdict: [verdict])."* (Türkçesi: "Bu belge [tarih] tarihli son incelemesiyle bayt bayt aynıdır ([mod] inceleme, karar: [karar]).")
  Bu karar APPROVED idiyse ve o inceleme bu çalışmayı kapsıyorsa, `AskUserQuestion` ile sun:
  `[A] Use the prior verdict (Recommended)` / `[B] Re-review anyway` (Türkçesi: [A] Önceki kararı kullan (Önerilen) / [B] Yine de yeniden incele) —
  `guided` [A] ile devam eder ve bunu not eder; `autonomous` `log_decision` ile kaydeder ve
  önceki kararı kullanır. APPROVED idiyse ama şimdi istenen inceleme kaydedilenden daha
  derinse, bunu söyle — *"That was a
  [mode] review at workflow [tier]; this run asks for [mode] at [tier]."* (Türkçesi: "O, [seviye] workflow'unda bir [mod] incelemeydi; bu çalışma [seviye]'de [mod] istiyor.") —
  ve `[A] Re-review at [mode] (Recommended)` / `[B] Use the prior
  [mode] verdict` sun (Türkçesi: [A] [mod] ile yeniden incele (Önerilen) / [B] Önceki [mod] kararını kullan); `guided` ve `autonomous` yeniden inceler (`autonomous` bunu
  `log_decision` ile kaydeder). NEEDS REVISION veya
  MAJOR REVISION NEEDED idiyse, açıkça söyle: belge, incelemeden kaldığından beri
  değişmedi — önceki bulgular geçerlidir; sıradaki adım belgeyi yeniden incelemek değil,
  revize etmektir. Önceki bulguları günlükten göstermeyi teklif et.
- **Hedef belge ve bu skill'in dosyası `UNCHANGED`, ve sadece kayıt defteri veya
  damgalanmış başka bir belgeler arası dosya `CHANGED`, `NEW` veya `GONE`** — önceki
  karar belgeler arası olgular dışında geçerlidir: belgenin değerlerini
  değişen dosyalara karşı yeniden doğrula ve kararı yeniden ver; bir çatışma çıkarsa veya
  o inceleme bu çalışmayı kapsamıyorsa tam bir yeniden incelemeye yükselt.
- **Hedef belge veya bu skill'in dosyası `CHANGED` veya `NEW`, ya da `RECEIPT: NONE`** —
  aşağıdaki tam incelemeyle devam et. **Değişmemiş bölümleri okumayı veya yeniden analiz etmeyi atlayan
  kısmi/fark (delta) yeniden incelemesi teklif etme.** Bölümle sınırlı bir yeniden inceleme,
  tam bir incelemenin bulduğu kusurları kaçırır ve çok az şey kazandırır ya da hiç kazandırmaz.
  "Son incelemeden beri değişmedi" sadece o zaman incelenenle
  bayt bayt aynı demektir — o önceki geçişin kendisinin eksiksiz olup olmadığı hakkında
  hiçbir şey söylemez ve her şeyi taraman söylense bile dikkat
  işaretlenen değişikliğe daralır.

Hedef tasarım belgesini tamamen oku. Bu adım GDD'nin tamamını gerektirir: başlıklarına göre aralıklar halinde oku (Grep aracıyla bulunur: desen `^#`, content modu), çünkü 40 KB'ın üzerindeki tam dosya Read'i reddedilir. Proje bağlamını ve standartlarını anlamak için CLAUDE.md'yi oku.

**Belgeler arası olgular için kardeş GDD'ler yerine kayıt defterini tercih et.**
`design/registry/entities.yaml` varsa **ve bu sistem için girdiler listeliyorsa**,
onu grep'le — bunlar bu GDD'nin çelişmemesi gereken yerleşik olgulardır ve
onları yeniden keşfetmek için kardeş GDD'leri okumanın yerini alırlar:
```
Grep pattern="source: design/gdd/[system].md" path="design/registry/entities.yaml" output_mode="content" -A 6
Grep pattern="design/gdd/[system].md" path="design/registry/entities.yaml" output_mode="content" -B 8
```
İlki bu sistemin **sahip olduğu** girdileri bulur — `-A 6` bağlamı onların
`referenced_by:` bloğunu içerir. İkincisi bu sisteme **referans veren** girdileri bulur —
`referenced_by:` bir blok dizisidir (anahtar ve yolları ayrı satırlardadır),
bu yüzden sahip girdiyi görmek için yolu `-B 8` bağlamıyla eşleştir,
`referenced_by.*name` tek satırlığıyla değil (o blok biçimiyle asla eşleşmez).

**`design/registry/entities.yaml` yoksa veya bu sistem için hiç girdi
listelemiyorsa** — dosya boş bir taslak (stub) olarak gelir, bu yüzden `/design-system`
onu doldurana kadar varsayılan durum budur — hedef belgenin Dependencies bölümünde adı geçen
ilgili GDD'leri okumaya geri dön. Okumayı bunlarla sınırla, "ima edilen" her şeyle değil.
`design/gdd/`'nin tamamını glob ile okuma.

**Bağımlılık grafiği doğrulaması:** Dependencies bölümünde listelenen her sistem için, GDD dosyasının `design/gdd/` içinde var olup olmadığını Glob ile kontrol et. Henüz var olmayanları işaretle — bunlar aşağı akıştaki yazarların karşılaşacağı kırık referanslardır.

**Lore/anlatı uyumu:** `design/gdd/game-concept.md` (veya `rigor: minimal`'da tek sayfalık özet `design/game-brief.md`) ya da `design/narrative/` içinde herhangi bir dosya varsa, oku. Bu GDD'de yerleşik dünya kurallarıyla, tonla veya tasarım sütunlarıyla çelişen mekanik seçimleri not et. Bu bağlamı Aşama 3b'de `game-designer`'a ilet.

**Önceki inceleme kontrolü:** `design/gdd/reviews/[doc-name]-review-log.md` dosyasının var olup olmadığını kontrol et. Varsa, en son girdiyi oku — hangi kararın verildiğini ve hangi engelleyici maddelerin listelendiğini not et. Bu oturum bir yeniden incelemedir; önceki maddelerin ele alınıp alınmadığını takip et.

---

## Aşama 2: Eksiksizlik Kontrolü

**Adım 2a — bölüm varlığını deterministik olarak topla (belge okumadan):**

```
Bash: bash .claude/scripts/gdd-structure-check.sh [target-doc-path]
```

Bir `PRESENT:` listesi ve uygun olduğunda bir `ABSENT:` listesi ve bir
`PLACEHOLDER:` listesi yazdırır (sadece `[To be designed]` içeren mevcut bölümler: henüz
yazılmamış, dolayısıyla kontrol listesi için eksik say). Sadece
**varlığı** raporlar ve REQUIRED/ADVISORY yargısı yapmaz — bu Adım 2b'nin
işidir. `## Detailed Design`'ı `Detailed Rules` gereksinimini karşılıyor olarak
zaten kabul eder, bu yüzden onu eksik olarak işaretleme.

**Adım 2b — seviyeyi uygula.** Adım 2a listelerini kullanarak aşağıdaki
Tasarım Belgesi Standardı kontrol listesine göre değerlendir. **Her bölümü çözümlenen
workflow seviyesine (Aşama 0) göre REQUIRED (zorunlu) veya ADVISORY (tavsiye) olarak işaretle.** Eksik bir REQUIRED bölüm
onayı engeller; eksik bir ADVISORY bölüm öneri olarak gösterilir ama
engellemez.

PRESENT olarak raporlanan bir bölüm, boş bir başlıksa yine de incelemeden kalabilir —
kararın gerçekten bağlı olduğu her bölümü yer yer kontrol ederek oku.

- [ ] Overview bölümü var (tek paragraflık özet) — tüm seviyelerde REQUIRED
- [ ] Player Fantasy bölümü var (amaçlanan his) — `full`'da REQUIRED; `standard`'da ADVISORY
- [ ] Detailed Rules bölümü var (belirsizlik içermeyen mekanikler) — `full`/`standard`'da REQUIRED. GDD şablonu bu bölümü `## Detailed Design` olarak adlandırır (Core Rules / States / Interactions alt başlıklarını taşır); bu gereksinimi karşılamak için **her iki** başlığı da kabul et — bir `## Detailed Design` bölümü varken "Detailed Rules"u eksik olarak işaretleme.
- [ ] Formulas bölümü var (tüm matematik değişkenleriyle tanımlı) — `full`'da REQUIRED; `standard`'da sistem sayısal kurallar tanımladığında (oranlar, eğriler, eşikler, maliyetler, hasar, düşme (drop) ağırlıkları) REQUIRED, aksi halde ADVISORY. Sistemin `Category`'si bir ipucudur, test değil — bunu sadece bir kategori etiketine dayanarak temize çıkarma
- [ ] Edge Cases bölümü var (olağandışı durumlar ele alınmış) — `full`/`standard`'da REQUIRED
- [ ] Dependencies bölümü var (diğer sistemler listelenmiş) — `full`/`standard`'da REQUIRED
- [ ] Tuning Knobs bölümü var (yapılandırılabilir değerler belirlenmiş) — `full`'da REQUIRED; `standard`'da `workflow_overrides.tuning_knobs` olmadıkça ADVISORY
- [ ] Acceptance Criteria bölümü var (test edilebilir başarı koşulları) — `full`/`standard`'da REQUIRED

---

## Aşama 3: Tutarlılık ve Uygulanabilirlik

**İç tutarlılık:**
- Formüller anlatılan davranışla eşleşen değerler üretiyor mu?
- Uç durumlar (edge cases) ana kurallarla çelişiyor mu?
- Bağımlılıklar çift yönlü mü (diğer sistem bundan haberdar mı)?

**Uygulanabilirlik:**
- Kurallar bir programcının tahmin yürütmeden uygulayabileceği kadar kesin mi?
- Detayların eksik olduğu, "geçiştirilmiş" (hand-wave) bölümler var mı?
- Performans etkileri dikkate alınmış mı?
- Her kabul kriteri bağımsız olarak test edilebilir mi? Edilemeyen her birini
  alıntılayarak işaretle — "dengeli hissettiriyor", "doğru çalışıyor", "iyi performans gösteriyor" kriter
  değildir — ve ölçülebilir bir yeniden yazım öner. `full` modunda `qa-lead` de bunları kontrol eder
  (Aşama 3b); `lean` ve `solo`'da hiçbir uzman çalışmaz, dolayısıyla bu ana inceleme kontrolü
  tek kontroldür.

**Sistemler arası tutarlılık:**
- Bu, mevcut herhangi bir mekanikle çatışıyor mu?
- Bu, diğer sistemlerle istenmeyen etkileşimler yaratıyor mu?
- Bu, oyunun yerleşik tonu ve sütunlarıyla tutarlı mı?

**Kayıt defteri değerleri, GDD onları nerede belirtirse belirtsin.** Bir tabloda,
bir katalog girdisinde veya bir varyant notunda yeniden belirtilen bir değer, Detailed Rules'taki
bir değer kadar kesin şekilde kayıt defteriyle çelişir ve bölüm bölüm okumak bu metinlerin
üstünden kolayca geçilmesine yol açar. Kayıt defterinin girdi adlarını listele
(`grep -E '^  - name:' design/registry/entities.yaml`),
sonra hedef belgenin tamamında hepsini ve taşıdıkları sayısal anahtarları
bir kerede, büyük/küçük harf duyarsız olarak ara; her `_` karakterini `[_ ]` olarak yaz ki `goblin_scout`
"Goblin scouts" ile de eşleşsin:

```
grep -n -i -E 'goblin[_ ]scout|iron[_ ]sword|health|value[_ ]gold' [target-doc-path]
```

Yazdırdığı her satırı, hangi bölümde olursa olsun kayıt defterine karşı kontrol et.
Bir girdiye farklı bir değer veren bir satır — tek bir oda, varyant, seviye
veya istisna için bile olsa — sahip GDD ile çelişir: onu Required Before
Implementation altında satır numarası, bu belgenin değeri ve kayıt defterinin değeriyle listele.
Kayıt defteri girdisi yoksa, aynı aramayı ilgili GDD'lerin tanımladığı varlıklar ve değerler için yap.

---

## Aşama 3b: Karşıt Uzman İncelemesi (Adversarial Specialist Review) (sadece full modu)

**`lean` veya `solo` modunda bu aşamayı atla.**

**Bu aşama full modunda ZORUNLUDUR.** Atlama.

**Herhangi bir ajan başlatmadan önce**, şu bildirimi yazdır:
> "Full review: spawning specialist agents in parallel. This typically takes 8–15 minutes. Use `--review lean` for faster single-session analysis."
> (Türkçesi: "Tam inceleme: uzman ajanlar paralel olarak başlatılıyor. Bu genellikle 8–15 dakika sürer. Daha hızlı tek oturumluk analiz için `--review lean` kullan.")

### Adım 1 — GDD'nin dokunduğu tüm alanları belirle

**Aşama 1'de zaten yüklenmiş** GDD'yi kullanarak — yeniden okuma — mevcut her alanı (domain) belirle. Bir GDD aynı anda birden fazla alana dokunabilir — titiz ol. Yaygın işaretler:

| GDD şunları içeriyorsa... | Şu ajanları başlat |
|------------------------|-------------------|
| Maliyetler, fiyatlar, düşen eşyalar (drops), ödüller, ekonomi | `economy-designer` |
| Savaş istatistikleri, hasar, can, DPS | `game-designer`, `systems-designer` |
| Yapay zekâ davranışı, yol bulma (pathfinding), hedefleme | `ai-programmer` |
| Seviye düzeni, doğma (spawning), dalga yapısı | `level-designer` |
| Oyuncu ilerlemesi, XP, kilit açmalar | `economy-designer`, `game-designer` |
| UI, HUD, menüler, oyuncuya dönük göstergeler | `ux-designer`, `ui-programmer` |
| Diyalog, görevler, hikâye, lore | `narrative-director` |
| Animasyon, his, zamanlama, "juice" | `gameplay-programmer` |
| Çok oyunculu, senkronizasyon, replikasyon | `network-programmer` |
| Ses ipuçları, müzik tetikleyicileri | `audio-director` |
| Performans, draw call'lar, bellek | `performance-analyst` |
| Motora özgü kalıplar veya API'ler | Birincil motor uzmanı (`engine.name`'den `<engine>-specialist` — Godot→`godot-specialist`, Unity→`unity-specialist`, Unreal→`unreal-specialist`; yoksa `technical-preferences.md` içindeki `## Engine Specialists` bölümünün Primary satırına geri dön) |
| Kabul kriterleri, test kapsamı | `qa-lead` |
| Veri şeması, kaynak (resource) yapısı | `systems-designer` |
| Herhangi bir oynanış sistemi | `game-designer` (her zaman) |

Oynanış mekaniklerini veya oyuncuya dönük kuralları anlatan tüm GDD'ler için `game-designer` başlat.
Formüller veya sistem etkileşim kuralları içeren tüm GDD'ler için `systems-designer` başlat.
Bunlar en yaygın temel ajanlardır — ama saf UI şartnameleri, ses şartnameleri veya lore belgeleri için zorunlu değildir. Hangi uzmanların gerçekten ilgili olduğunu belirlemek için yukarıdaki alan tablosunu kullan.

### Adım 2 — İlgili tüm uzmanları paralel olarak başlat

**KRİTİK: Bu skill'deki `Agent`, bir ALT AJAN (SUBAGENT) başlatır — kendi bağlam penceresi olan
ayrı, bağımsız bir Claude oturumu. Bu bir görev takibi DEĞİLDİR. Uzman bakış açılarını
içeride simüle ETME. Alan görüşlerini kendin akıl yürüterek ÇIKARMA. Gerçek
`Agent` çağrıları yapmak ZORUNDASIN. Simüle edilmiş bir inceleme, bir uzman incelemesi değildir.**

Tüm `Agent` çağrılarını aynı anda yap. Birer birer BAŞLATMA.

**Her uzmana karşıt (adversarial) bir şekilde talimat ver:**
> "Here is the GDD for [system] and the main review's structural findings so far.
> Your job is NOT to validate this design — your job is to find problems.
> Challenge the design choices from your domain expertise. What is wrong,
> underspecified, likely to cause problems, or missing entirely?
> Be specific and critical. Disagreement with the main review is welcome.
> Read the GDD by section: find the headings with the Grep tool (pattern `^#`,
> content mode) and Read those ranges with offset and limit."
>
> (Türkçesi: "İşte [sistem] için GDD ve ana incelemenin şu ana kadarki yapısal bulguları.
> Senin işin bu tasarımı doğrulamak DEĞİL — senin işin sorunları bulmak.
> Tasarım seçimlerine kendi alan uzmanlığından itiraz et. Ne yanlış,
> yetersiz tanımlanmış, sorun çıkarması muhtemel veya tamamen eksik?
> Somut ve eleştirel ol. Ana incelemeyle anlaşmazlık memnuniyetle karşılanır.
> GDD'yi bölüm bölüm oku: başlıkları Grep aracıyla bul (desen `^#`,
> content modu) ve o aralıkları offset ve limit ile Read et.")

**Ajan tipine göre ek talimatlar:**

- **`game-designer`**: İncelemeni bu GDD'nin B Bölümünde belirtilen Player Fantasy'ye (Oyuncu Fantezisi) dayandır. Bu tasarım o fanteziyi gerçekten sunuyor mu? Bir oyuncu amaçlanan deneyimi hisseder mi? Uygulanabilirliğe hizmet eden ama belirtilen hissi zayıflatan kuralları işaretle.

- **`systems-designer`**: GDD'deki her formül için sınır değerleri (en düşük ve en yüksek makul girdiler) yerine koy. Uç noktalarda herhangi bir çıktının bozulup bozulmadığını raporla — negatif değerler, sıfıra bölme, sonsuz veya anlamsız sonuçlar.

- **`qa-lead`**: Her kabul kriterini incele. Bağımsız olarak test edilemeyenleri işaretle — "dengeli hissettiriyor", "doğru çalışıyor", "iyi performans gösteriyor" gibi ifadeler kabul kriteri (AC) değildir. Bu testten geçemeyenler için somut yeniden yazımlar öner.

### Adım 3 — Kıdemli lider incelemesi

Tüm uzmanlar cevap verdikten sonra, **kıdemli inceleyici** olarak `creative-director` başlat:
- Sağla: GDD, tüm uzman bulguları, aralarındaki her türlü anlaşmazlık
- Sor: "Synthesise these findings. What are the most important issues? Do you agree with the specialists? What is your overall verdict on this design — APPROVED, NEEDS REVISION or MAJOR REVISION NEEDED?"
  (Türkçesi: "Bu bulguları sentezle. En önemli sorunlar neler? Uzmanlara katılıyor musun? Bu tasarım hakkındaki genel kararın nedir — APPROVED, NEEDS REVISION veya MAJOR REVISION NEEDED?")
- creative-director'ın sentezi, Aşama 4'te bu skill'in karar kelimeleriyle **nihai karar** olur — asla READY veya REJECT gibi bir yönetmen kapısı (director-gate) kelimesiyle değil.

### Adım 4 — Anlaşmazlıkları ortaya koy

Uzmanlar birbirleriyle veya creative-director ile anlaşmazlığa düşerse, bir görüşü sessizce SEÇME. Kullanıcının hakemlik yapabilmesi için anlaşmazlığı Aşama 4'te açıkça sun.

Her bulguyu kaynağıyla işaretle: `[game-designer]`, `[economy-designer]`, `[creative-director]` vb.

---

## Aşama 4: İnceleme Çıktısı

```
## Design Review: [Document Title]
Specialists consulted: [list agents spawned]
Re-review: [Yes — prior verdict was X on YYYY-MM-DD / No — first review]

### Completeness: [X/N sections present, where N is the count REQUIRED at this project's `modes.workflow`]
[List only sections missing that are REQUIRED at this tier. Mark ADVISORY gaps
separately as "advisory at `standard`" — do not list them as missing.]

> **N is not 8 unless `workflow: full`.** The tier table earlier in this skill is
> authoritative: 8 required at `full`, 5 at `standard` (+ Formulas when the system
> defines numeric rules), 0 at `minimal`. Do not hardcode `/8` here: reporting a
> `standard` project as "5/8 missing Player Fantasy, Formulas, Tuning Knobs"
> warns about three sections that project's own configuration says it does not
> need, which trains the reader to ignore the review.

### Dependency Graph
[List each declared dependency and whether its GDD file exists on disk]
- ✓ enemy-definition-data.md — exists
- ✗ loot-system.md — NOT FOUND (file does not exist yet)

### Registry Values
[The whole-document search from Phase 3: the terms searched, how many lines it
printed, and each conflict with its line number. With nothing to search, say so:
"No registry entries or related-GDD values: values not cross-checked."]

### Required Before Implementation
[Numbered list — blocking issues only. Each item tagged with source agent.]

### Recommended Revisions
[Numbered list — important but not blocking. Source-tagged.]

### Specialist Disagreements
[Any cases where agents disagreed with each other or with the main review.
Present both sides — do not silently resolve.]

### Nice-to-Have
[Minor improvements, low priority.]

### Senior Verdict [creative-director]
[Creative director's synthesis and overall assessment.]

### Scope Signal
Estimate implementation scope based on: dependency count, formula count,
systems touched, and whether new ADRs are required.
- **S** — single system, no formulas, no new ADRs, <3 dependencies
- **M** — moderate complexity, 1-2 formulas, 3-6 dependencies
- **L** — multi-system integration, 3+ formulas, may require new ADR
- **XL** — cross-cutting concern, 5+ dependencies, multiple new ADRs likely
Label clearly: "Rough scope signal: M (producer should verify before sprint planning)"

### Verdict: [APPROVED / NEEDS REVISION / MAJOR REVISION NEEDED / NOT ASSESSED]

> **`NOT ASSESSED` when the review could not actually be performed.**
> The other three verdicts are all claims about the design's quality, so each one
> asserts that the document was read and judged. Use `NOT ASSESSED` instead when
> the target document is absent, unreadable, or empty of the sections being
> reviewed, or when a document it depends on is missing so the criteria cannot be
> applied. **Name what was unavailable and which skill produces it.**
>
> `APPROVED` is the dangerous default here: a review that could not find its
> input has not approved anything, and this verdict is consumed downstream as a
> sign-off. `NOT ASSESSED` outranks `APPROVED` in any aggregate — it does not
> outrank the two revision verdicts, because a known problem is more actionable
> than an unknown one.
```

> **Yukarıdaki çıktı şablonunun Türkçe açıklaması** (şablonun kendisi Claude'un ürettiği çıktı biçimi olduğu için İngilizce bırakılmıştır):
>
> - **Başlık bilgileri**: incelenen belgenin adı, danışılan uzmanlar (başlatılan ajanların listesi), yeniden inceleme olup olmadığı (evet — önceki karar X, YYYY-AA-GG tarihinde / hayır — ilk inceleme).
> - **Completeness (Eksiksizlik)**: [X/N bölüm mevcut; N, projenin `modes.workflow` ayarında REQUIRED olan bölüm sayısıdır]. Sadece bu seviyede REQUIRED olup eksik olan bölümleri listele. ADVISORY eksikleri ayrıca "`standard`'da tavsiye" olarak işaretle — eksik olarak listeleme.
>   - **`workflow: full` değilse N, 8 değildir.** Bu skill'in önceki kısmındaki seviye tablosu esastır: `full`'da 8, `standard`'da 5 (+ sistem sayısal kurallar tanımlıyorsa Formulas), `minimal`'da 0 zorunludur. Burada `/8`'i sabit kodlama: bir `standard` projesini "5/8, Player Fantasy, Formulas, Tuning Knobs eksik" diye raporlamak, projenin kendi yapılandırmasının gerekmediğini söylediği üç bölüm hakkında uyarı verir; bu da okuyucuyu incelemeyi görmezden gelmeye alıştırır.
> - **Dependency Graph (Bağımlılık Grafiği)**: beyan edilen her bağımlılığı ve GDD dosyasının diskte var olup olmadığını listele (✓ mevcut / ✗ BULUNAMADI — dosya henüz yok).
> - **Registry Values (Kayıt Defteri Değerleri)**: Aşama 3'teki tüm belge araması — aranan terimler, kaç satır yazdırdığı ve her çatışma satır numarasıyla. Aranacak bir şey yoksa bunu söyle: "Kayıt defteri girdisi veya ilgili GDD değeri yok: değerler çapraz kontrol edilmedi."
> - **Required Before Implementation (Uygulamadan Önce Gerekli)**: numaralı liste — sadece engelleyici sorunlar. Her madde kaynak ajanla etiketlenir.
> - **Recommended Revisions (Önerilen Revizyonlar)**: numaralı liste — önemli ama engelleyici değil. Kaynak etiketli.
> - **Specialist Disagreements (Uzman Anlaşmazlıkları)**: ajanların birbirleriyle veya ana incelemeyle anlaşamadığı durumlar. İki tarafı da sun — sessizce çözme.
> - **Nice-to-Have (Olsa İyi Olur)**: küçük iyileştirmeler, düşük öncelik.
> - **Senior Verdict [creative-director] (Kıdemli Karar)**: kreatif direktörün sentezi ve genel değerlendirmesi.
> - **Scope Signal (Kapsam Sinyali)**: uygulama kapsamını bağımlılık sayısına, formül sayısına, dokunulan sistemlere ve yeni ADR (Mimari Karar Kaydı) gerekip gerekmediğine göre tahmin et.
>   - **S** — tek sistem, formül yok, yeni ADR yok, <3 bağımlılık
>   - **M** — orta karmaşıklık, 1-2 formül, 3-6 bağımlılık
>   - **L** — çok sistemli entegrasyon, 3+ formül, yeni ADR gerektirebilir
>   - **XL** — kesişen (cross-cutting) konu, 5+ bağımlılık, muhtemelen birden çok yeni ADR
>   - Açıkça etiketle: "Kaba kapsam sinyali: M (yapımcı sprint planlamasından önce doğrulamalı)"
> - **Verdict (Karar)**: APPROVED / NEEDS REVISION / MAJOR REVISION NEEDED / NOT ASSESSED
>   - **İnceleme gerçekten yapılamadığında `NOT ASSESSED`.** Diğer üç karar tasarımın kalitesi hakkında iddialardır; yani her biri belgenin okunup yargılandığını öne sürer. Hedef belge yoksa, okunamıyorsa veya incelenen bölümler boşsa ya da bağlı olduğu bir belge eksik olduğu için kriterler uygulanamıyorsa bunun yerine `NOT ASSESSED` kullan. **Neyin mevcut olmadığını ve onu hangi skill'in ürettiğini belirt.**
>   - Burada tehlikeli varsayılan `APPROVED`'dır: girdisini bulamayan bir inceleme hiçbir şeyi onaylamamıştır ve bu karar aşağı akışta bir onay (sign-off) olarak kullanılır. Herhangi bir toplu değerlendirmede `NOT ASSESSED`, `APPROVED`'dan üstündür — iki revizyon kararından üstün değildir, çünkü bilinen bir sorun bilinmeyen bir sorundan daha fazla aksiyon alınabilirdir.

Bu skill salt okunurdur — Aşama 4 sırasında hiçbir dosya yazılmaz.

---

## Aşama 5: Sonraki Adımlar

TÜM kapanış etkileşimleri için `AskUserQuestion` kullan. Asla düz metin kullanma.

**İlk widget — sırada ne yapılacak:**

APPROVED ise (ilk geçişte, revizyon gerekmeden), doğrudan systems-index widget'ına, review-log widget'ına, ardından son kapanış widget'ına geç. Ayrı bir "ne yapılacak" widget'ı gösterme — son kapanış widget'ı sonraki adımları kapsar.

NOT ASSESSED ise hiçbir şey incelenmemiştir: hiçbir takip güncellemesi teklif etme ve doğrudan
son kapanış widget'ına git; eksik girdiyi üreten skill'i başa koy
(ör. var olmayan bir GDD için `/design-system [system]`).

NEEDS REVISION veya MAJOR REVISION NEEDED ise, seçenekleri bulgulardan oluştur:
- `[A] Revise the GDD now — address blocking items together` (Türkçesi: GDD'yi şimdi revize et — engelleyici maddeleri birlikte ele al)
- `[B] Stop here — revise in a separate session` (Türkçesi: Burada dur — ayrı bir oturumda revize et)
- `[C] Accept as-is and move on` (Türkçesi: Olduğu gibi kabul et ve devam et) — sadece her bulgu tavsiye niteliğindeyse ekle
  (Required Before Implementation boşsa). Herhangi bir engelleyici madde varsa sadece [A]
  ve [B]'yi sun.

**Kullanıcı [A] — Şimdi revize et'i seçerse:**

Tüm engelleyici maddeler üzerinde çalış; sadece sorunu GDD'den ve mevcut belgelerden tek başına çözemediğin yerlerde tasarım kararı sor. Herhangi bir düzenleme yapmadan önce tüm tasarım kararı sorularını tek bir çok sekmeli `AskUserQuestion` içinde grupla — her engelleyici için revizyonun ortasında tek tek araya girme.

Tüm revizyonlar tamamlandıktan sonra bir özet tablosu göster (engelleyici → uygulanan düzeltme) ve **revizyon sonrası kapanış widget'ı** için `AskUserQuestion` kullan:

- İstem: "Revisions complete — [N] blockers resolved. What next?" (Türkçesi: "Revizyonlar tamamlandı — [N] engelleyici çözüldü. Sırada ne var?")
- Mevcut bağlam (context) kullanımını not et: bağlam ~%50'nin üzerindeyse şunu ekle: "(Recommended: /clear before re-review — this session has used X% context. A full re-review runs 5 agents and needs clean context.)" (Türkçesi: "(Önerilen: yeniden incelemeden önce /clear — bu oturum bağlamın %X'ini kullandı. Tam bir yeniden inceleme 5 ajan çalıştırır ve temiz bağlam gerektirir.)")
- Seçenekler:
  - `[A] Re-review in a new session — run /design-review [doc-path] after /clear` (Türkçesi: Yeni bir oturumda yeniden incele — /clear'dan sonra /design-review [doc-path] çalıştır)
  - `[B] Accept revisions for now — mark In Review in the systems index; a re-review decides Approved` (Türkçesi: Revizyonları şimdilik kabul et — sistem dizininde In Review olarak işaretle; Approved kararını bir yeniden inceleme verir)
  - `[C] Move to next system — /design-system [next-system] (#N in design order)` (Türkçesi: Sonraki sisteme geç — tasarım sırasında #N)
  - `[D] Stop here` (Türkçesi: Burada dur)

Collaborative ve guided modlarında revizyon akışını asla düz metinle bitirme —
her zaman bu widget ile kapat. Autonomous modunda sonucu özetle ve
`log_decision` ile kaydet.

**İkinci widget — takip kayıtları (birleşik, APPROVED yolu için):**

Karar APPROVED olduğunda, iki takip güncellemesini toplu yapmak için `multiSelect: true` ile tek bir `AskUserQuestion` kullan:
- İstem: "Verdict: APPROVED. I can update the tracking records now. Select any you'd like me to complete:" (Türkçesi: "Karar: APPROVED. Takip kayıtlarını şimdi güncelleyebilirim. Tamamlamamı istediklerini seç:")
- Seçenekler:
  - `Update systems-index.md status to 'Approved' for [system]` (Türkçesi: [sistem] için systems-index.md durumunu 'Approved' olarak güncelle)
  - `Append approval entry to design/gdd/reviews/[doc-name]-review-log.md` (Türkçesi: onay girdisini review-log dosyasına ekle)

Review-log seçeneği seçilirse, aşağıdakiyle aynı biçimde ekle. Son kapanış widget'ını göstermeden önce seçilen her iki eylemi de gerçekleştir.

Karar NEEDS REVISION veya MAJOR REVISION NEEDED olduğunda, önceki gibi ayrı widget'lar kullan:

İkinci bir `AskUserQuestion` kullan:
- İstem: "May I update `design/gdd/systems-index.md` to mark [system] as [Needs Revision / In Review]?" (Türkçesi: "[sistem]'i [Needs Revision / In Review] olarak işaretlemek için `design/gdd/systems-index.md`'yi güncelleyebilir miyim?") — revizyonlar bekliyorken `Needs Revision` (tam olarak bu dize), revizyonlar uygulanıp yeniden inceleme beklenirken `In Review`. Bu istem asla `Approved` sunmaz: bir revizyon kararı onay değildir.
- Seçenekler: `[A] Yes — update it` / `[B] No — leave it as-is` (Türkçesi: [A] Evet — güncelle / [B] Hayır — olduğu gibi bırak)

Üçüncü bir `AskUserQuestion` kullan:
- İstem: "May I append this review summary to `design/gdd/reviews/[doc-name]-review-log.md`? This creates a revision history so future re-reviews can track what changed." (Türkçesi: "Bu inceleme özetini `design/gdd/reviews/[doc-name]-review-log.md` dosyasına ekleyebilir miyim? Bu, gelecekteki yeniden incelemelerin neyin değiştiğini takip edebilmesi için bir revizyon geçmişi oluşturur.")
- Seçenekler: `[A] Yes — append to review log` / `[B] No — skip` (Türkçesi: [A] Evet — inceleme günlüğüne ekle / [B] Hayır — atla)

Evet ise, şu biçimde bir girdi ekle:
```
## Review — [YYYY-MM-DD] — Verdict: [APPROVED / NEEDS REVISION / MAJOR REVISION NEEDED]
Review mode: [full / lean / solo] · Workflow: [full / standard / minimal]
Scope signal: [S/M/L/XL]
Specialists: [list]
Blocking items: [count] | Recommended: [count]
Summary: [2-3 sentence summary of key findings from creative-director verdict]
Prior verdict resolved: [Yes / No / First review]
Findings:
- [BLOCKING] [section]: [one-line finding]
- [RECOMMENDED] [section]: [one-line finding]
[output of: Bash: bash .claude/scripts/review-receipts.sh hash "[target-doc-path]" "design/registry/entities.yaml" ".claude/skills/design-review/SKILL.md" [every other file this review read for cross-document facts: the related GDDs in design/gdd/, design/gdd/game-concept.md or design/game-brief.md, the design/narrative/ files] — a file that does not exist prints `not stamped, no such file` and is left out]
```

> (Yukarıdaki günlük girdisi şablonunun açıklaması: inceleme tarihi ve kararı; inceleme modu ve workflow; kapsam sinyali; uzmanlar; engelleyici ve önerilen madde sayıları; creative-director kararından 2-3 cümlelik ana bulgu özeti; önceki kararın çözülüp çözülmediği (Evet / Hayır / İlk inceleme); bulgular — `[BLOCKING]` (engelleyici) ve `[RECOMMENDED]` (önerilen), bölüm adıyla tek satır; son satırda ise hedef belge, kayıt defteri, bu skill dosyası ve incelemenin belgeler arası olgular için okuduğu diğer tüm dosyalar (design/gdd/ içindeki ilgili GDD'ler, game-concept.md veya game-brief.md, design/narrative/ dosyaları) için `review-receipts.sh hash` komutunun çıktısı — var olmayan bir dosya `not stamped, no such file` yazdırır ve dışarıda bırakılır.)

Bulgu kuralları: her bulgu için bir satır, bulunduğu bölümün adıyla;
karar hiçbir bulgu taşımıyorsa `- none` yaz. Bu, revizyon geçmişini okuyan bir insan
için belgelemedir, skill'in geri okuduğu bir mekanizma değildir.

Hash satırı, Aşama 1'in bir sonraki çalışmada bayt bayt aynı bir yeniden incelemeyi
tespit etmek için okuduğu makbuzdur (receipt) — gerçekten güvenli olan tek atlama biçimi,
çünkü girdinin aynı olduğu kanıtlanabilir; sadece önceki bir geçiş tarafından yeterince
kapsandığına inanılmaz. İncelemenin okuduğu her dosyayı damgala: Aşama 1'in kontrolü, adını
anmasa da bir sonraki çalışmada damgalanmış her dosyayı karşılaştırır. Karar ne olursa olsun her zaman ekle —
daha önce incelemeden KALMIŞ değişmemiş bir belge, gereksiz bir yeniden incelemeyi
atlamanın en çok tasarruf sağladığı durumdur (önceki bulgular aynen geçerlidir).

---

**Son kapanış widget'ı — tüm dosya yazımları tamamlandıktan sonra her zaman göster:**

systems-index ve review-log widget'ları cevaplandıktan sonra proje durumunu kontrol et ve son bir `AskUserQuestion` göster:

Seçenekleri oluşturmadan önce şunları oku:
- `design/gdd/systems-index.md` — Status'u In Review veya Needs Revision olan herhangi bir sistemi bul (az önce incelenen hariç). Bölüm bölüm oku: başlıkları Grep aracıyla bul (desen `^#`, content modu) ve o aralıkları offset ve limit ile Read et.
- `/review-all-gdds`'i teklif etmeye değip değmeyeceğini belirlemek için `design/gdd/` içindeki `.md` dosyalarını say (game-concept.md, systems-index.md hariç) (≥2 GDD)
- Tasarım sırasında Status'u Not Started olan bir sonraki sistemi bul

Seçenek listesini dinamik olarak oluştur — sadece gerçekten sıradaki olan seçenekleri ekle:
- `[_] Run /design-review [other-gdd-path] — [system name] is still [In Review / Needs Revision]` (başka bir GDD'nin incelenmesi gerekiyorsa ekle) — (Türkçesi: [sistem adı] hâlâ [In Review / Needs Revision] durumunda)
- `[_] Run /consistency-check — verify this GDD's values don't conflict with existing GDDs` (≥1 başka GDD varsa her zaman ekle) — (Türkçesi: bu GDD'nin değerlerinin mevcut GDD'lerle çatışmadığını doğrula)
- `[_] Run /review-all-gdds — holistic design-theory review across all designed systems` (≥2 GDD varsa ekle) — (Türkçesi: tasarlanmış tüm sistemler genelinde bütünsel tasarım teorisi incelemesi)
- `[_] Run /design-system [next-system] — next in design order` (her zaman ekle, gerçek sistemin adını ver) — (Türkçesi: tasarım sırasında bir sonraki)
- `[_] Stop here` — (Türkçesi: Burada dur)

A, B, C… harflerini sadece eklenen seçeneklere ata. Hattı (pipeline) en çok ilerleten seçeneği `(recommended)` olarak işaretle.

Collaborative ve guided modlarında dosya yazımlarından sonra skill'i asla düz metinle
bitirme — her zaman bu widget ile kapat. Autonomous modunda bir sonraki
adımı yazdır ve `log_decision` ile kaydet.
