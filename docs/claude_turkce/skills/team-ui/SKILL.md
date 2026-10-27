---
name: team-ui
description: "UI ekibini UX hattı (pipeline) boyunca yönetir — yazım, görsel tasarım, uygulama, inceleme, cilalama. /ux-design, /ux-review ve stüdyo şablonlarını kullanır."
argument-hint: "[UI feature description] [--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Agent, AskUserQuestion, TaskCreate, TaskGet, TaskList, TaskUpdate, Bash(bash "*/.claude/skills/team-ui/../../hooks/yaml-helper.sh" resolve_config *)
model: sonnet
---
> Bu dosya `.claude\skills\team-ui\SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# Team UI

Hiç argüman verilmemişse, herhangi bir ajan başlatmadan veya tasarım dosyası okumadan kullanım rehberini yazdır ve çık:
> Kullanım: `/team-ui [UI feature description] [--review full|lean|solo]` — yapılacak ekranı veya UI özelliğini tarif et (ör. `inventory screen`, `main menu`, `combat HUD`). Burada `AskUserQuestion` kullanma; rehberi doğrudan yazdır.

Bu skill çağrıldığında, UI ekibini yapılandırılmış bir hat (pipeline) boyunca yönet.

**Karar Noktaları:** Her aşama geçişinde, alt ajanın (subagent) önerilerini kullanıcıya
seçilebilir seçenekler olarak sunmak için `AskUserQuestion` kullan. Ajanın
tam analizini sohbete yaz, sonra kararı kısa etiketlerle kaydet.
`collaborative` modunda, bir sonraki aşamaya geçmeden önce kullanıcının onaylaması gerekir.
`guided` modunda hat, bir aşama BLOCKED (engellenmiş) olmadıkça otomatik ilerler;
`autonomous` modunda ise baştan sona çalışır ve her aşamanın sonucunu
`log_decision` ile kaydeder. `automation_always_ask` kategorilerindeki kararlar
(`is_always_ask_category` yardımcısı) moddan bağımsız olarak her zaman sorulur. Bkz.
`.claude/docs/automation-modes.md`.

## Aşama 0: Yapılandırmayı Çöz

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys review_mode,automation,team.size`

Yukarıda çözüldü — olduğu gibi kullan; `--review`, `review_mode`'u geçersiz kılar. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar.

`review_mode` direktör kapısının (director gate) derinliğini belirler, ve bu hattın direktör kapısı yoktur:
aşağıdaki hiçbir aşama, hangi `review_mode` olursa olsun CD-, TD-, PR- veya AD-PHASE-GATE başlatmaz. Bu hattın
aşama kapıları, hattın kendi karar noktalarıdır (aşağıda `team.size` altında tanımlanmıştır)
ve bu noktalarda çalışan ajanlar direktör kapıları değil, ekip üyeleridir.

`automation`, yukarıdaki Karar Noktaları notunu yönlendirir. Her modun hat davranışını nasıl değiştirdiği için yukarıdaki Karar Noktaları notuna ve
`.claude/docs/automation-modes.md` dosyasına bakın.

**`team.size`**: hangi ajanların aktif olduğu (review_mode kapı derinliğinden ve iş akışı dokümanlarından bağımsızdır).
- **`individual`** (varsayılan): `ui-programmer` + `ux-designer`. Diğer ajanlara bu ikisi üzerinden danışılır, ayrıca başlatılmazlar.
- **`small`**: + `accessibility-specialist` + `art-director`.
- **`studio`**: + motor UI uzmanı (engine UI specialist) + çekişmeli (adversarial) bir inceleme turu: Aşama 4'ün inceleyicilerine "işin bunun spesifikasyona uyduğunu onaylamak değil — nerede uymadığını bul" denir ve rapor bu turun yapıldığını belirtir.
`individual` seviyesinde gereken çekirdek-dışı bir ajan, bilgilendirici bir notla en yakın aktif çekirdek ajan üzerinden yönlendirilir. **"Aşama kapısı" (phase gate), bu hattın kendisinin listelediği bir `AskUserQuestion` karar noktasıyla biten herhangi bir aşama demektir** — yukarıdaki Karar Noktaları altındaki bir geçiş veya aşağıdaki hatta yazılmış bir **Kapı** adımı — **`automation` modu ne olursa olsun.** `guided` ve `autonomous` bir kapının nasıl geçildiğini değiştirir (otomatik ilerler veya `log_decision` ile kaydedilir), kapı olup olmadığını değil; bu yüzden aşağıdaki sınırlı istisnanın (3) numaralı koşulu her modda o noktada geçerlidir. "Yalnızca aşama kapıları" ile sınırlanmış bir ajan, sadece bu noktalarda başlatılır, başka hiçbir yerde değil. Bu aktif küme kapsamı aşağıdaki hattın tamamında geçerlidir: aktif kümenin dışındaki bir ajanı adlandıran her aşama, onu başlatmak yerine en yakın çekirdek ajan üzerinden yönlendirir.

**Adım 1'den önce aktif kümeyi duyur — daraltmanın asla sessiz olmasına izin verme.**
Herhangi bir şey başlatmadan önce, tek satırda bu çalıştırmanın gerçekte hangi ajanları
başlatacağını ve aşağıdaki hattın adını andığı ama çözülen `team.size` seviyesinde **başlatılmayacak**
olanları belirt. Örneğin:

> `Active set (team.size: <resolved>): <the agents listed for that size above>.`
> `Not spawned this run: <every other agent this pipeline names> — consulted`
> `through <nearest active core agent>. Raise team.size (or modes.rigor) to widen.`

Bunu bir örnekten değil, doğrudan yukarıdaki `team.size` listesinden ve bu dosyanın kendi
hattının adını andığı ajanlardan doldur. Her iki küme de orkestratöre göre değişir.

Aşağıdaki hat çok ajanlı bir yayılım (fan-out) gibi okunur ama gönderilen varsayılanda
bir veya iki ajandır — `team-release` on ajan sayar ve birini çalıştırır, `team-narrative`
beş aşamada altı ajan sayar ve yalnızca `writer`'ı çalıştırır. **Daraltma doğrudur**:
`team.size` titizlik (rigor) odaklıdır ve dar varsayılan, token tasarrufu kaldıracıdır.
Bu söylenmezse okuyucu, doğru şekilde daraltılmış bir çalıştırmayı
bozuk bir hattan ayıramaz; ve yukarıdaki ajan başına
"bilgilendirici bir notla en yakın çekirdek ajan üzerinden yönlendirilir" kuralı
yönlendirme anında devreye girer ve çalıştırmanın bütün olarak şeklini hiçbir zaman belirtmez.

Bu, bu dosyanın başka yerlerindeki atlanan-kontrol raporlamasıyla aynı kuraldır: **uygulanan ama hiç görünür kılınmayan bir kısıt,
çıktıyı okuyan kişi için, hiç uygulanmamış bir kısıttan
ayırt edilemez.**

## Ekip Bileşimi
- **ux-designer** — Kullanıcı akışları, wireframe'ler (tel kafes çizimler), erişilebilirlik, girdi yönetimi
- **ui-programmer** — UI çatısı, ekranlar, widget'lar, veri bağlama (data binding), uygulama
- **art-director** — Görsel stil, yerleşim cilası, art bible ile tutarlılık
- **engine UI specialist** — UI uygulama kalıplarını motora özgü en iyi uygulamalara göre doğrular (`project.yaml` içindeki `specialists.ui`; yoksa `.claude/docs/technical-preferences.md` içindeki `## Engine Specialists` bölümünün UI Specialist satırı)
- **accessibility-specialist** — Aşama 4'te erişilebilirlik uyumunu denetler

> **`specialists.ui: null` AYARLANMAMIŞ demektir.** Bunu yok sayılmış gibi ele al ve motor
> UI uzmanını atla; asla `null`'ı bir ajan adı olarak başlatma. v1.0 geçişi (migration),
> herhangi bir üye ayarlandığında tüm `specialists` bloğunu yazar, bu yüzden burada `null`
> olağandır — ve yapılandırma okuyucusu onu boş olmayan `"null"` dizesi olarak döndürür.

**Bu hattın kullandığı şablonlar:**
- `ux-spec.md` — Standart ekran/akış UX spesifikasyonu
- `hud-design.md` — HUD'a özgü UX spesifikasyonu
- `interaction-pattern-library.md` — Yeniden kullanılabilir etkileşim kalıpları
- `accessibility-requirements.md` — Taahhüt edilmiş erişilebilirlik seviyesi ve gereksinimleri

## Nasıl Görev Devredilir

Her ekip üyesini bir alt ajan olarak başlatmak için `Agent` aracını kullan:
- `subagent_type: ux-designer` — Kullanıcı akışları, wireframe'ler, erişilebilirlik, girdi yönetimi
- `subagent_type: ui-programmer` — UI çatısı, ekranlar, widget'lar, veri bağlama
- `subagent_type: art-director` — Görsel stil, yerleşim cilası, art bible tutarlılığı
- `subagent_type: [UI engine specialist]` — Motora özgü UI kalıbı doğrulaması (ör. unity-ui-specialist, ue-umg-specialist, godot-specialist)
- `subagent_type: accessibility-specialist` — Erişilebilirlik uyum denetimi

**Her ajana özet ver — bağlamı yığma.** Ortak girdileri **bir kez** oku ve damıtılmış bir özeti satır içinde ilet: her ajanın gerçekten ihtiyaç duyduğu satırları; zaten okuduğun bir doküman için asla dosya yolu verme (yol verilen bir ajan tüm dosyayı yeniden okur). Yalnızca senin okumadığın ve yalnızca o ajanın ihtiyaç duyduğu bir doküman için yol ver.

**Her ajan istemini bir dönüş sözleşmesiyle (return contract) bitir:** "Tam çıktını `[path]` konumuna yaz — bu adlandırılmış yol, aşağıdaki sınırlı istisna kapsamında senin yazma yetkindir, bu yüzden ayrı bir onay istemeden yaz. **Yalnızca** şunları döndür: (1) yazılan yol, (2) kararların ≤5 maddelik özeti, (3) varsa BLOCKED/CONCERNS maddeleri, her biri tek satır. Okuduğun dokümanları yeniden anlatma." Bu olmadan, bir ajan okuduğu her şeyi bu oturuma geri döndürür. **Uygulama dosyaları istisnadır:** kod veya varlık (asset) yazan bir ajan önce oluşturacağı veya değiştireceği dosyaları döndürür, ve dönüş sözleşmesi bunları ancak sen küme için bir kez sorduktan ve kullanıcı evet dedikten sonra adlandırır (Dosya Yazma Protokolü) — o yazmaları sınırlı istisna değil, o cevap yetkilendirir.

**`[path]` yerine gerçek bir yol koy.** Çalışma çıktıları (artifact)
`production/ui/[feature-name]/` altına gider; bu, Aşama 1b'nin `design/ux/[feature-name].md`
dosyasının kullandığı kısa addır (slug). Ajan başına bir dosya, böylece paralel Aşama 4 incelemeleri asla aynı dosyayı paylaşmaz:

| Aşama / ajan | Yazdığı yer |
|---|---|
| 2 art-director | `production/ui/[feature-name]/visual-design.md` |
| 3 engine UI specialist | `production/ui/[feature-name]/engine-notes.md` |
| 3 ui-programmer | kod kökü — tek uygulama sorusunun listelediği dosyalar (Dosya Yazma Protokolü), sınırlı istisnanın dışında |
| 4 ux-designer, art-director, accessibility-specialist | `production/ui/[feature-name]/review-[agent].md`, her biri için bir tane |

UX spesifikasyonunun kendisi (Aşama 1b) ve herhangi bir kalıp kütüphanesi güncellemesi `design/` altındadır,
sınırlı istisnanın dışındadır: `/ux-design` veya ajan, bunları yazmadan önce sorar.

> **Bu neden İşbirliği Protokolü'nü (Collaboration Protocol) ihlal etmiyor.** `CLAUDE.md`, bir ajanın Write/Edit öncesinde "Bunu [filepath] konumuna yazabilir miyim?" diye sormasını gerektirir. Burada başlatılan bir alt ajan sormadan **yazar**, ve bu bir gözden kaçırma değil, kasıtlı ve sınırlı bir istisnadır — `consistency-check`'in `active.md`'ye ekleme yapması için zaten verilmiş olan kararın aynısı. İstisna yalnızca üç koşulun hepsi doğru olduğunda geçerlidir: (1) yol, istemde **senin** adlandırdığın bir yoldur, yani kullanıcı aşamayı onayladığında hedefi de onaylamıştır; (2) `production/`, `docs/` veya `tests/` altında yeni bir çıktıdır, asla mevcut kaynak koda veya yapılandırmaya yapılan bir düzenleme değildir; (3) onu üreten aşamanın kendisi, hat ilerlemeden önce bir `AskUserQuestion` ile kapılanmıştır. Bu üçünün dışında ajan sormak zorundadır. **Bunu alt ajan başına sorarak "düzeltme"** — aşama başına ajan başına bir soru, bir orkestratörü kullanılamaz hale getirir; istisnanın var olma sebebi budur.

Hattın izin verdiği yerlerde bağımsız ajanları paralel başlat (ör. Aşama 4 inceleme ajanları aynı anda çalışabilir).

## Hat (Pipeline)

### Aşama 1a: Bağlam Toplama

Herhangi bir şey tasarlamadan önce oku ve sentezle. Her GDD'yi bölüm bölüm oku:
ihtiyaç duyduğun başlıkları Grep aracıyla bul (desen `^#`, content modu) ve bu
aralıkları offset ve limit ile Read et.
- `design/gdd/game-concept.md` — hedef platformlar ve hedef kitle (veya
  `rigor: minimal` seviyesinde onun yerini alan tek sayfalık özet `design/game-brief.md` —
  "Who it's for" satırı kitleyi verir; platform belirtmez)
- `design/player-journey.md` — oyuncunun bu ekrana ulaştığındaki durumu ve bağlamı
- Bu özellikle ilgili tüm GDD UI Requirements bölümleri
- `design/ux/interaction-patterns.md` — yeniden kullanılacak (yeniden icat edilmeyecek) mevcut kalıplar
- `design/accessibility-requirements.md` — taahhüt edilmiş erişilebilirlik seviyesi (Basic, Standard, Comprehensive veya Exemplary)

**Herhangi bir şey tasarlamadan önce yukarıdaki her dokümanın durumunu raporla.** Aşama 1a
beş girdi okur ve bunlardan herhangi biri eksik olabilir. Her birini
mevcut (present) veya YOK (ABSENT) olarak listele.

**`design/accessibility-requirements.md` sessizce geçilmemesi gereken dosyadır.**
Taahhüt edilmiş erişilebilirlik seviyesini taşır; **Aşama 3 buna göre uygular**
ve **Aşama 4 buna göre kapılar** ("taahhüt edilmiş erişilebilirlik seviyesine
uyumu doğrula … her ihlali engelleyici olarak işaretle"). Dosya yoksa seviye de yoktur,
yani o kapının bir ölçütü yoktur ve hiçbir şey kontrol etmeden geçer — var olmayan bir
standarttan yapılmış bir kapı, asla başarısız olamayan bir doğrulamayla (assertion) aynı biçimdedir.
Dosya yoksa:
- Bunu burada söyle ve ileriye taşı: **Aşama 4 şunu raporlamalıdır:
  `Accessibility: NOT ASSESSED — no committed tier (design/accessibility-requirements.md absent)`
  ve erişilebilirlik kapısını geçilmiş olarak RAPORLAMAMALIDIR.**
- ux-designer, hangi seviyeye göre tasarladığını açık bir varsayım olarak
  belirtir; böylece sonraki bir okuyucu bunun taahhüt edilmediğini, varsayıldığını görebilir.
- Seviyeyi belirlemek için `/ux-design accessibility` öner.

Bir konsept dokümanının (ne `design/gdd/game-concept.md` ne de
`design/game-brief.md`), `design/player-journey.md`'nin veya `design/ux/hud.md`'nin yokluğu
engelleyici değildir, ancak eksik olan her birini ux-designer'a ilettiğin özette
adlandır; böylece hangi bağlamdan yoksun olduklarını bilerek tasarlarlar, onu
tahmin etmeye çalışmazlar.

**`design/ux/interaction-patterns.md` yoksa**, eksikliği hemen görünür kıl:
> "interaction-patterns.md mevcut değil — yeniden kullanılacak mevcut kalıp yok."

Sonra şu seçeneklerle `AskUserQuestion` kullan:
- (a) Önce kalıp kütüphanesini kurmak için `/ux-design patterns` çalıştır, sonra devam et
- (b) Kalıp kütüphanesi olmadan devam et — ui-programmer oluşturulan tüm kalıpları yeni kabul edecek ve tamamlandığında her birini yeni bir `design/ux/interaction-patterns.md` dosyasına ekleyecek

Kalıpları yalnızca özellik adından veya GDD'den icat etme ya da varsayma. Kullanıcı (b)'yi seçerse, Aşama 3'te ui-programmer'a tüm kalıpları yeni kabul etmesini ve uygulama tamamlandığında bunları `design/ux/interaction-patterns.md` içinde belgelemesini açıkça söyle. Kalıp kütüphanesinin durumunu (oluşturuldu / yok / güncellendi) son özet raporunda belirt.

Bağlamı ux-designer için bir özette topla: oyuncu ne yapıyor, neye ihtiyacı var, hangi kısıtlar geçerli ve hangi mevcut kalıplar ilgili.

### Aşama 1b: UX Spesifikasyonu Yazımı

`ux-spec.md` şablonunu izleyerek `design/ux/[feature-name].md` dosyasını üretmek için `/ux-design [feature name]` skill'ini çağır VEYA doğrudan ux-designer'a devret.

HUD tasarlanıyorsa, `ux-spec.md` yerine `hud-design.md` şablonunu kullan.

> **Özel durumlarla ilgili notlar:**
> - Özellikle HUD tasarımı için `/ux-design`'ı `argument: hud` ile çağır (ör. `/ux-design hud`).
> - Etkileşim kalıbı kütüphanesi için, proje başında bir kez `/ux-design patterns` çalıştır ve sonraki aşamalarda yeni kalıplar eklendikçe güncelle.

Çıktı: Gerekli tüm spesifikasyon bölümleri doldurulmuş `design/ux/[feature-name].md`.

### Aşama 1c: UX İncelemesi

Spesifikasyon tamamlandıktan sonra `/ux-review design/ux/[feature-name].md` çağır.

**Kapı**: Karar APPROVED olana kadar Aşama 2'ye geçme. Karar NEEDS REVISION ise ux-designer, işaretlenen sorunları aynı spesifikasyonda gidermeli — spesifikasyon korunur ve revize edilir, asla atılmaz — ve incelemeyi yeniden çalıştırmalıdır. Kullanıcı bir NEEDS REVISION riskini açıkça kabul edip devam edebilir, ancak bu bilinçli bir karar olmalıdır — devam edip etmeyeceğini sormadan önce belirli endişeleri `AskUserQuestion` ile sun.

**NOT ASSESSED** kararı da aynı şekilde engeller ve kullanıcı onu da aynı şekilde geçersiz kılabilir. Çözümü bir revizyon değil, bir girdidir: `/ux-review`'un değerlendiremediği boyutları ve her biri için eksik girdiyi sun (ör. taahhüt edilmemiş bir seviye için `/ux-design accessibility`). İncelemeyi o girdi olmadan yeniden çalıştırmak aynı kararı döndürür, bu yüzden önce girdiyi üretmeyi teklif et.

Kullanıcı NEEDS REVISION veya NOT ASSESSED'i geçip devam ettiğinde, son rapor bu geçersiz kılmayı kaydeder: karar, açık bırakılan endişeler veya değerlendirilmemiş boyutlar ve kullanıcının devam etmeyi seçtiği.

### Aşama 2: Görsel Tasarım

**art-director**'a devret:
- Tam UX spesifikasyonunu (akışlar, wireframe'ler, etkileşim kalıpları, erişilebilirlik notları) incele — sadece wireframe görsellerini değil
- Art bible'dan görsel işlemi uygula: renkler, tipografi, boşluklar, animasyon stili
- Görsel tasarımın erişilebilirlik uyumunu koruduğunu kontrol et: renk kontrast oranlarını doğrula ve rengin asla durumun tek göstergesi olmadığını teyit et (şekil, metin veya ikon onu desteklemelidir)
- Sanat hattından gereken tüm varlık gereksinimlerini belirt: belirtilen boyutlarda ikonlar, arka plan dokuları, fontlar, dekoratif öğeler — kesin boyutlar ve format gereksinimleriyle
- Mevcut uygulanmış UI ekranlarıyla tutarlılığı sağla
- Çıktı: stil notları ve varlık listesi (asset manifest) içeren görsel tasarım spesifikasyonu

### Aşama 3: Uygulama

Uygulama başlamadan önce, UX spesifikasyonunu ve görsel tasarım spesifikasyonunu motora özgü uygulama rehberliği açısından incelemesi için **engine UI specialist**'i (`project.yaml` içindeki `specialists.ui`; yoksa `.claude/docs/technical-preferences.md` içindeki `## Engine Specialists` bölümünün UI Specialist satırı) başlat:
- Bu ekran için hangi motor UI çatısı kullanılmalı? (ör. Unity'de UI Toolkit vs UGUI, Godot'ta Control düğümleri vs CanvasLayer, Unreal'da UMG vs CommonUI)
- Önerilen yerleşim veya etkileşim kalıpları için motora özgü tuzaklar var mı?
- Motor için önerilen widget/düğüm yapısı nedir?
- Çıktı: ui-programmer başlamadan önce ona teslim edilecek motor UI uygulama notları

Hiçbir motor yapılandırılmamışsa bu adımı atla. **Bu çalıştırmanın çıktısına ``Engine validation: NOT ASSESSED — no engine configured (`engine.name` unset in `project.yaml`)`` kaydet.** Hiçbir şey söylemeyen atlanmış bir kontrol, geçmiş bir kontrolden ayırt edilemez; okuyucu motor rehberliğinin hiç aranmadığını anlayamaz.

**ui-programmer**'a devret:
- UI'ı UX spesifikasyonu ve görsel tasarım spesifikasyonuna göre uygula
- **`design/ux/interaction-patterns.md` içindeki kalıpları kullan** — zaten belirtilmiş kalıpları yeniden icat etme. Bir kalıp neredeyse uyuyor ama değişiklik gerekiyorsa, sapmayı not et ve ux-designer incelemesi için işaretle.
- **UI ASLA oyun durumuna (game state) sahip olmaz veya onu değiştirmez** — yalnızca gösterim; tüm oyuncu eylemleri için olay (event) yayınla
- Tüm metinler yerelleştirme sistemi üzerinden — sabit kodlanmış (hardcoded) oyuncuya dönük metin yok
- Her iki girdi yöntemini de destekle (klavye/fare VE gamepad)
- Erişilebilirlik özelliklerini `design/accessibility-requirements.md` içindeki taahhüt edilmiş seviyeye göre uygula
- Oyun durumuna veri bağlamayı kur
- **Uygulama sırasında yeni bir etkileşim kalıbı oluşturulursa** (yani kalıp kütüphanesinde henüz olmayan bir şey), uygulamayı tamamlandı olarak işaretlemeden önce onu `design/ux/interaction-patterns.md`'ye ekle
- Çıktı: uygulanmış UI özelliği

### Aşama 4: İnceleme (paralel)

Paralel olarak devret:
- **ux-designer**: Uygulamanın wireframe'lerle ve etkileşim spesifikasyonuyla eşleştiğini doğrula. Yalnızca klavye ve yalnızca gamepad ile gezinmeyi test et. Erişilebilirlik özelliklerinin doğru çalıştığını kontrol et.
- **art-director**: Art bible ile görsel tutarlılığı doğrula. Desteklenen minimum ve maksimum çözünürlüklerde kontrol et.
- **accessibility-specialist**: `design/accessibility-requirements.md` içinde belgelenen taahhüt edilmiş erişilebilirlik seviyesine uyumu doğrula. Her ihlali engelleyici olarak işaretle. **Bu dosya yoksa taahhüt edilmiş bir seviye yoktur, dolayısıyla bu kapının ölçütü yoktur: `Accessibility: NOT ASSESSED — no committed tier (design/accessibility-requirements.md absent)` raporla ve kapıyı geçilmiş olarak RAPORLAMA**. Aşama 1a'nın varsayılan olarak kaydettiği seviye neyse onu ileri taşı ve bunun varsayıldığını açıkça söyle.

Aşama 5'e geçmeden önce üç inceleme akışının da raporlaması gerekir.

### Aşama 5: Cilalama

- Tüm inceleme geri bildirimlerini ele al
- Animasyonların atlanabilir olduğunu ve oyuncunun hareket azaltma tercihlerine uyduğunu doğrula
- UI seslerinin ses olay sistemi üzerinden tetiklendiğini teyit et (doğrudan ses çağrısı yok)
- Desteklenen tüm çözünürlüklerde ve en-boy oranlarında test et
- **`design/ux/interaction-patterns.md`'nin güncel olduğunu doğrula** — bu özelliğin uygulanması sırasında yeni kalıplar eklendiyse, kütüphaneye eklendiklerini teyit et
- **Tüm HUD öğelerinin `design/ux/hud.md` içinde tanımlanan görsel bütçeye uyduğunu teyit et** (öğe sayısı, ekran bölgesi tahsisleri, maksimum opaklık değerleri)

## Hızlı Başvuru — Hangi Skill Ne Zaman Kullanılır

- `/ux-design` — Bir ekran, akış veya HUD için sıfırdan yeni bir UX spesifikasyonu yaz
- `/ux-review` — Tamamlanmış bir UX spesifikasyonunu uygulama öncesinde doğrula
- `/team-ui [feature]` — Konseptten cilalamaya kadar tam hat (`/ux-design` ve `/ux-review`'u dahili olarak çağırır)
- `/quick-design` — Tam yeni bir UX spesifikasyonu gerektirmeyen küçük UI değişiklikleri

## Hata Kurtarma Protokolü

**Önce çıktıyı doğrula.** Dönüş sözleşmesi bir yol adlandırdıysa, aşamayı
bitmiş saymadan önce o yolun var olduğunu kontrol et — **diskte olmayan adlandırılmış bir
çıktı, yanıt ne kadar akıcı okunursa okunsun başarısız bir aşamadır.** Bir ajan
koca bir aşamayı tüketip hiçbir şey yazmadan inandırıcı bir giriş metni döndürebilir;
bu ne BLOCKED, ne hata, ne de "tamamlanamıyor" olduğundan aşağıdaki tetikleyici
hiç devreye girmez. Karşılanmamış sözleşmeyi belirterek onu sürdür (resume); bağlam
genellikle hâlâ oradadır.

Başlatılan herhangi bir ajan BLOCKED, hata veya tamamlanamıyor döndürürse: **bunu
hemen görünür kıl, engellediği bir bağımlılığı geçip devam etme ve her zaman
kısmi bir rapor üret.** Atlanan bir ajanın bölümü adlandırılmış bir boşluk olarak kalır — asla kendi içeriğinle doldurma. Tam prosedür: `.claude/docs/error-recovery-protocol.md`.

Yaygın engelleyiciler:
- Girdi dosyası eksik (story bulunamadı, GDD yok) → onu oluşturan skill'e yönlendir
- ADR durumu Proposed → uygulama; karar verildiğinde `/architecture-decision accept ADR-NNNN` ile kabul et
- Kapsam çok büyük → `/create-stories` ile iki story'ye böl
- ADR ile story arasında çelişen talimatlar → çelişkiyi görünür kıl, tahmin etme

## Dosya Yazma Protokolü

Tüm dosya yazmaları (UX spesifikasyonları, etkileşim kalıbı kütüphanesi güncellemeleri, uygulama dosyaları)
alt ajanlara ve alt skill'lere devredilir. İkisi **farklı** kurallara uyar:

- **`Agent` ile başlatılan alt ajanlar** (ör. `ui-programmer`), yukarıda "Bu neden İşbirliği
  Protokolü'nü ihlal etmiyor" başlığı altında belgelenen **sınırlı
  istisnaya** uyar — yol senin adlandırdığın bir yoldur, çıktı `production/`,
  `docs/` veya `tests/` altında yenidir ve aşama bir `AskUserQuestion` ile kapılanmıştır. Bir alt ajan
  bu sınırlar içinde yazma başına soru **sormaz**; bunların dışında sormak zorundadır.
  **Uygulama dosyaları** (ui-programmer'ın kod kökü altındaki kodu) bu sınırların dışındadır:
  ui-programmer oluşturacağı veya değiştireceği dosyaları döndürür, sen küme için
  bir kez sorarsın ve evet cevabından sonra yazar.
- **Alt skill'ler** (`/ux-design`) alt ajan değildir ve istisna onlara uzanmaz.
  Normal İşbirliği Protokolü'ne uyarlar ve yazmadan önce sorarlar.

Bu orkestratör doğrudan dosya yazmaz.

## Çıktı

Şunları kapsayan bir özet rapor: UX spesifikasyonu durumu, UX inceleme kararı, görsel tasarım durumu, uygulama durumu, erişilebilirlik uyumu, girdi yöntemi desteği, etkileşim kalıbı kütüphanesi güncelleme durumu ve kalan sorunlar.

Karar: **COMPLETE** — UI özelliği tam hat üzerinden teslim edildi (UX spesifikasyonu → görsel → uygulama → inceleme → cilalama).

Erişilebilirlik kapısı (taahhüt edilmiş seviye yok) veya motor doğrulaması (yapılandırılmış
motor yok) NOT ASSESSED ise, karar her birini adlandırır — asla düz bir COMPLETE değil:

Karar: **COMPLETE — [accessibility | engine validation] NOT ASSESSED ([reason])** — UI özelliği teslim edildi; adı geçen kontrol çalıştırılamadı.

Karar: **BLOCKED** — hat durduruldu; durmadan önce engelleyiciyi ve aşamasını görünür kıl.

## Sonraki Adımlar

- Henüz onaylanmadıysa son spesifikasyon üzerinde `/ux-review` çalıştır.
- Story'leri kapatmadan önce UI uygulaması üzerinde `/code-review` çalıştır.
- Görsel veya ses cilalama turu gerekiyorsa `/team-polish` çalıştır.
