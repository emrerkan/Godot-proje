# /design-system — Aşama 4: Bölüm Bölüm Tasarım

> Bu dosya `.claude\skills\design-system\references\4-section-design.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> `/design-system`'in bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözümlenen ayarlar ve sonraki başlıklarının altındaki kurallar burada da geçerlidir.

## 4. Bölüm Bölüm Tasarım

**Bu dosyada:**

- Bölüm Döngüsü
- Bölüme Özel Rehberlik
- Section A: Overview (Genel Bakış)
- Section B: Player Fantasy (Oyuncu Fantezisi)
- Section C: Detailed Design (Ayrıntılı Tasarım — Temel Kurallar, Durumlar, Etkileşimler)
- Section D: Formulas (Formüller)
- Section E: Edge Cases (Uç Durumlar)
- Section F: Dependencies (Bağımlılıklar)
- Section G: Tuning Knobs (Ayar Düğmeleri)
- Section H: Acceptance Criteria (Kabul Kriterleri)
- İsteğe Bağlı Bölümler: Visual/Audio, Game Feel, UI Requirements, Cross-References, Open Questions

**Yalnızca çözümlenen kademede zorunlu olan bölümleri yaz** (§1). `standard` kademede
gezinti A (Overview), C (Detailed Design), E (Edge Cases),
F (Dependencies), H (Acceptance Criteria) bölümlerini kapsar — artı sistem sayısal kurallar
tanımlıyorsa D (Formulas) (bkz. §1; kategori bir ipucudur, test değil); B (Player Fantasy) ve
G (Tuning Knobs) atlanır, `workflow_overrides.tuning_knobs: true` G'yi zorlamadıkça.
`full` kademede sekizinin hepsini (A–H) gez. `minimal` kademede GDD isteğe bağlıdır — gönüllü
olarak yazıyorsan standart kümeyi gez. Herhangi bir `system_overrides.<system>` kademesi
§1'de çözümlenen kademeye zaten katılmıştır.

Zorunlu her bölümü sırayla ele al. **Her bölüm için** şu döngüyü izle:

### Bölüm Döngüsü

```
Context  ->  Questions  ->  Options  ->  Decision  ->  Draft  ->  Approval  ->  Write
```

1. **Bağlam (Context)**: Bu bölümün neleri içermesi gerektiğini belirt ve onu kısıtlayan,
   bağımlılık GDD'lerinden gelen ilgili kararları ortaya çıkar.

2. **Sorular (Questions)**: Bu bölüme özgü açıklayıcı sorular sor. Sınırlı seçenekli
   sorular için `AskUserQuestion`, açık uçlu keşif için sohbet metni kullan.

3. **Seçenekler (Options)**: Bölüm tasarım tercihleri içeriyorsa (sadece belgeleme değilse),
   artıları/eksileriyle 2-4 yaklaşım sun. Gerekçeyi sohbet metninde açıkla,
   ardından kararı almak için `AskUserQuestion` kullan.

4. **Karar (Decision)**: Kullanıcı bir yaklaşım seçer veya kendi yönlendirmesini verir.

5. **Taslak (Draft)**: Bölüm içeriğini inceleme için sohbet metninde yaz. Tasarlanmamış
   bağımlılıklar hakkındaki geçici varsayımları işaretle.

6. **Onay (Approval)**: Çözümlenen `modes.automation` moduna göre
   (`.claude/docs/automation-modes.md`):

   **`collaborative` modunda**: Taslaktan hemen sonra — AYNI yanıt içinde —
   `AskUserQuestion` kullan. **ASLA düz metin kullanma. ASLA bu adımı
   atlama.**
   - Soru: "Approve the [Section Name] section?"
   - Seçenekler: `[A] Approve — write it to file` / `[B] Make changes — describe what to fix` / `[C] Start over`

   **Taslak ve onay widget'ı tek bir yanıtta BİRLİKTE görünmek ZORUNDADIR.
   Taslak widget olmadan görünürse, kullanıcı ilerleme yolu olmayan boş bir
   istemde kalır — bu, collaborative modda bir protokol ihlalidir.**

   **`guided` modunda**: Taslaktan hemen sonra, neye karar verildiğinin tek satırlık
   kısa bir özetiyle bölümü yaz. Bölüm başına widget'ı atla;
   çok bölümlü yazım kuralı (bölüm başına onay yok) geçerlidir.

   **`autonomous` modunda**: Bölümü doğrudan yaz ve
   `Decision point: Approve [Section Name] section`,
   `Chosen: [A] Approve`, `Category: minor` ile `log_decision` çağır.

7. **Yazma (Write)**: Yer tutucuyu onaylanan içerikle değiştirmek için Edit aracını kullan.
   **KRİTİK**: Benzersizliği sağlamak için `old_string` içine her zaman bölüm başlığını
   dahil et — asla yalnızca `[To be designed]` ile eşleştirme, çünkü birden çok bölüm aynı
   yer tutucuyu kullanır ve Edit aracı benzersiz bir eşleşme gerektirir. Şu deseni kullan:
   ```
   old_string: "## [Section Name]\n\n[To be designed]"
   new_string: "## [Section Name]\n\n[approved content]"
   ```
   Yazımı teyit et.

8. **Kayıt defteri çelişki kontrolü** (yalnızca Section C ve D — Detailed Design ve Formulas):
   Yazdıktan sonra, bölüm içeriğini kayıt defterinde görünen varlık adları, eşya adları, formül
   adları ve sayısal sabitler için tara. Her eşleşme için:
   - Az önce yazılan değeri kayıt defteri girdisiyle karşılaştır.
   - Farklıysa: bir sonraki bölüme başlamadan önce **çelişkiyi hemen ortaya koy**.
     Sessizce devam etme.
     > "Kayıt defteri çelişkisi: [name], [source GDD] içinde [registry_value] olarak kayıtlı.
     > Bu bölüm az önce [new_value] yazdı. Hangisi doğru?"
   - Yeniyse (kayıt defterinde yoksa): kayıt defterine eklenmek üzere aday olarak işaretle
     (Aşama 5'te ele alınacak).

Her bölümü yazdıktan sonra `production/session-state/active.md` dosyasını tamamlanan
bölümün adıyla güncelle. Dosyanın var olup olmadığını kontrol etmek için Glob kullan —
yoksa oluşturmak için Write, varsa güncellemek için Edit kullan.

### Bölüme Özel Rehberlik

Her bölümün kendine özgü tasarım hususları vardır ve uzman agent'lardan fayda görebilir:

**Atlanan her başlatma (spawn) duyurulur.** Aşağıda bir bölümün inceleme modu kontrolü
uzmanını atladığında — `solo` kadar `lean` modda da — o bölümün notunu çalıştığı modla
birlikte yazdır, örn. "`creative-director` danışılmadı — Lean modu.
Üretimden önce elle inceleyin." Uzmanı olmadan taslağı çıkarılan bir bölüm, hangi mod
atlamış olursa olsun, bunu çıktıda belirtmelidir.

---

### Section A: Overview

**Amaç**: Bir yabancının okuyup anlayabileceği tek bir paragraf.

**Widget'ı oluşturmadan önce önerilen seçenekleri türet**: Sistemin kategorisini ve katmanını sistem dizininden oku (Aşama 2'den zaten bağlamda), sonra her sekme için önerilen seçeneği belirle:
- **Framing sekmesi**: `Category` sütununa bağlıdır (`Core · Gameplay · Progression · Economy · Persistence · UI · Audio · Narrative · Meta`). Oyuncuya dönük — `Gameplay`, `UI`, `Audio`, `Narrative` → `[C] Both` önerilir. Dahili — `Core`, `Persistence`, `Meta` → `[A]` önerilir. Karma — `Economy`, `Progression` → `[C] Both`. **Layer ve Category uyuşmadığında eşitlik bozucu** (yaygın durum `Foundation` katmanındaki bir `Gameplay` sistemidir): **Category kazanır** — çerçeveleme bölümün *ne hakkında* olduğunu anlatır ve oyuncuya dönük bir sistem bağımlılık grafiğinde nerede durursa dursun oyuncuya dönük kalır.
- **ADR ref sekmesi**: `docs/architecture/adr-*.md` dosyalarını glob'la ve herhangi bir ADR'nin GDD Requirements bölümünde sistem adını grep'le. Eşleşen bir ADR bulunursa → `[A] Yes — cite the ADR` önerilir. Bulunmazsa → `[B] No` önerilir.
- **Fantasy sekmesi**: Foundation/Infrastructure katmanı → `[B] No` önerilir. Diğer tüm kategoriler → `[A] Yes` önerilir.

Her sekmede uygun seçenek metninin sonuna `(Recommended)` ekle.

**Çerçeveleme soruları (taslaktan ÖNCE sor)**: Çok sekmeli bir widget ile `AskUserQuestion` kullan:
- Sekme "Framing" — "Genel bakış bu sistemi nasıl çerçevelemeli?" Seçenekler: `[A] As a data/infrastructure layer (technical framing)` / `[B] Through its player-facing effect (design framing)` / `[C] Both — describe the data layer and its player impact`
- Sekme "ADR ref" — "Genel bakış bu sistem için mevcut ADR'ye atıfta bulunmalı mı?" Seçenekler: `[A] Yes — cite the ADR for implementation details` / `[B] No — keep the GDD at pure design level`
- Sekme "Fantasy" — "Bu sistemin belirtmeye değer bir oyuncu fantezisi var mı?" Seçenekler: `[A] Yes — players feel it directly` / `[B] No — pure infrastructure, players feel what it enables`

Taslağı şekillendirmek için cevapları kullan. **`collaborative` modunda bu soruları
kendin cevaplayıp otomatik taslak ÇIKARMA** — widget görünmek zorundadır. `guided`
ve `autonomous` modlarında bu KÜÇÜK bir çerçeveleme kararıdır: yukarıda türetilen önerilen
seçeneği seç, tek satırda belirt ve devam et (önerileri önceden türetmenin bütün
amacı budur). Bu, bölüm gezintisindeki her "taslaktan ÖNCE sor" widget'ı için geçerlidir,
yalnızca bunun için değil.

**Sorulacak sorular**:
- Bu sistem tek cümleyle nedir?
- Oyuncu onunla nasıl etkileşime girer? (aktif/pasif/otomatik)
- Bu sistem neden var — o olmasa oyun neyi kaybederdi?

**Çapraz kontrol**: Açıklamanın sistem dizininin onu tanımlama biçimiyle uyumlu olduğunu
kontrol et. Tutarsızlıkları işaretle.

**Tasarım ve uygulama sınırı**: Overview soruları davranış düzeyinde kalmalıdır —
sistemin *nasıl inşa edildiği* değil, *ne yaptığı*. Overview sırasında uygulama
soruları çıkarsa (örn. "Bu bir Autoload singleton mı yoksa sinyal veriyolu (signal bus)
mu kullanmalı?"), bunları "→ ADR'ye dönüşür" olarak not et ve devam et. Uygulama desenleri
GDD'ye değil `/architecture-decision`'a aittir. GDD davranışı anlatır; ADR ise
bunu başarmak için kullanılan teknik yaklaşımı anlatır.

---

### Section B: Player Fantasy

**Amaç**: Duygusal hedef — oyuncunun ne *hissetmesi* gerektiği.

**Widget'ı oluşturmadan önce önerilen seçeneği türet**: Sistemin kategorisini ve katmanını Aşama 2 bağlamından oku:
`Category` sütununa bağlıdır (`Core · Gameplay · Progression · Economy · Persistence · UI · Audio · Narrative · Meta`):
- Oyuncuya dönük — `Gameplay`, `UI`, `Audio`, `Narrative` → `[A] Direct` önerilir
- Dahili — `Core`, `Persistence`, `Meta` → `[B] Indirect` önerilir
- Karma — `Economy`, `Progression` → `[C] Both` önerilir

**Layer ve Category uyuşmadığında Category kazanır** — yukarıdaki Framing sekmesiyle
aynı eşitlik bozucu.

Uygun seçenek metninin sonuna `(Recommended)` ekle.

**Çerçeveleme sorusu (taslaktan ÖNCE sor)**: `AskUserQuestion` kullan:
- Soru: "Bu sistem oyuncunun doğrudan etkileşime girdiği bir şey mi, yoksa dolaylı olarak deneyimlediği bir altyapı mı?"
- Seçenekler: `[A] Direct — player actively uses or feels this system` / `[B] Indirect — player experiences the effects, not the system` / `[C] Both — has a direct interaction layer and infrastructure beneath it`

Player Fantasy bölümünü uygun şekilde çerçevelemek için cevabı kullan. Cevabı varsayma.

**Sorulacak sorular**:
- Bu hangi duyguya veya güç fantezisine hizmet ediyor?
- Hangi referans oyunlar bu hissi kusursuz yakalıyor? Bu hissi özellikle ne yaratıyor?
- Bu "etkileşime girmeyi sevdiğin bir sistem" mi, yoksa "fark etmediğin bir altyapı" mı?

**Çapraz kontrol**: Oyunun temel ilkeleriyle (pillars) uyumlu olmalıdır. Sistem bir ilkeye
hizmet ediyorsa, ilgili ilke metnini alıntıla.

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Bir not ekle: "`creative-director` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu YÜKSEK uygulama riskli bir bölüm değilse (yalnızca Section D ve H) atla. Diğer bölümler için taslağı agent olmadan çıkar.
- `full` → aşağıda anlatıldığı gibi başlat.

**Agent'a devretme (ZORUNLU)**: Çerçeveleme cevabı verildikten sonra ama taslaktan önce,
`Agent` ile `creative-director`'ı başlat:
- Ver: sistem adı, çerçeveleme cevabı (doğrudan/dolaylı/ikisi), oyunun temel ilkeleri, kullanıcının bahsettiği referans oyunlar, oyun konsepti özeti
- Sor: "Bu sistem için Player Fantasy'yi şekillendir. Hangi duyguya veya güç fantezisine hizmet etmeli? Hangi oyuncu anına dayanmalıyız? Oyunun yerleşik hissine hangi ton ve dil uyar? Spesifik ol — bana 2-3 aday çerçeveleme ver."
- creative-director'ın çerçevelemelerini topla ve taslakla birlikte kullanıcıya sun.

**Önce `creative-director`'a danışmadan Section B'nin taslağını ÇIKARMA.** Çerçeveleme
cevabı bize fantezinin *ne tür* olduğunu söyler; creative-director ise *nasıl
anlatılacağını* şekillendirir — ton, dil, dayanılacak belirli oyuncu anı.

---

### Section C: Detailed Design (Core Rules, States, Interactions)

**Amaç**: Bir programcının soru sormadan uygulayabileceği, belirsizliği olmayan bir spesifikasyon.

Bu genellikle en büyük bölümdür. Alt bölümlere ayır:

1. **Core Rules (Temel Kurallar)**: Temel mekanikler. Sıralı süreçler için numaralı kurallar,
   özellikler için madde işaretleri kullan.
2. **States and Transitions (Durumlar ve Geçişler)**: Sistemin durumları varsa, her durumu ve
   her geçerli geçişi haritala. Bir tablo kullan.
3. **Interactions with Other Systems (Diğer Sistemlerle Etkileşimler)**: Her bağımlılık için
   (yukarı ve aşağı akış), hangi verinin girdiğini, hangisinin çıktığını ve arayüzün kime ait
   olduğunu belirt.

**Sorulacak sorular**:
- Bu sistemin tipik bir kullanımını adım adım anlat
- Oyuncunun karşılaştığı karar noktaları nelerdir?
- Oyuncu neleri YAPAMAZ? (Kısıtlar, yetenekler kadar önemlidir)

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Onları adıyla belirten bir not ekle: "`[the Section 6 routing table's Primary and Supporting Agents for this category]` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu YÜKSEK uygulama riskli bir bölüm değilse (yalnızca Section D ve H) atla. Diğer bölümler için taslağı agent olmadan çıkar.
- `full` → aşağıda anlatıldığı gibi başlat.

**Agent'a devretme (ZORUNLU)**: Section C'nin taslağını çıkarmadan önce, `Agent` ile uzman agent'ları paralel olarak başlat:
- Sistem kategorisini yönlendirme tablosunda (bu skill'in 6. Bölümü) bul
- Bu kategori için listelenen Birincil Agent'ı VE Destekleyici Agent(lar)ı başlat
- Her agent'a ver: sistem adı, oyun konsepti özeti, temel ilke kümesi, bağımlılık GDD alıntıları, üzerinde çalışılan belirli bölüm
- Taslaktan önce bulgularını topla
- Agent'lar arasındaki görüş ayrılıklarını `AskUserQuestion` ile kullanıcıya sun
- Taslağı yalnızca uzman görüşü alındıktan sonra çıkar

**Önce uygun uzmanlara danışmadan Section C'nin taslağını ÇIKARMA.** Kuralları ve mekanikleri inceleyen bir `systems-designer`, ana oturumun yakalayamayacağı tasarım boşluklarını yakalar.

**Çapraz kontrol**: Listelenen her etkileşim için, bağımlılık GDD'sinin belirttiğiyle
eşleştiğini doğrula. Bir bağımlılık bir değer veya formül tanımlıyorsa ve bu
sistem farklı bir şey bekliyorsa, çelişkiyi işaretle.

---

### Section D: Formulas

**Amaç**: Değişkenleri tanımlanmış, aralıkları belirtilmiş ve uç durumları not edilmiş
her matematiksel formül.

**Tamamlama Yönlendirmesi — her formüle daima tam olarak bu yapıyla başla:**

```
The [formula_name] formula is defined as:

`[formula_name] = [expression]`

**Variables:**
| Variable | Type | Range | Source | Description |
|----------|------|-------|--------|-------------|
| [name] | float/int | [min–max] | data file / calculated / constant | [what it represents] |

**Output Range:** [min] to [max] under normal play; [behaviour at extremes]
**Example:** [worked example with real numbers]
```

`[Formula TBD]` YAZMA ve bir formülü değişken tablosu olmadan düzyazıyla anlatma.
Değişkenleri tanımlanmamış bir formül tahmin yürütmeden uygulanamaz.

> **Bu sütunlar `templates/guidance/game-design-document-guide.md` ile birebir
> eşleşir; yeniden adlandırma.** `Source` sütunu, kodlama standartlarındaki
> *"oynanış değerleri veri odaklı (harici yapılandırma) olmalıdır, asla koda
> gömülmemelidir"* kuralını tasarım dokümanına taşır — `data file` olarak işaretlenen
> bir değişken bir ayar düğmesidir, `constant` olarak işaretlenen ise bilinçli bir istisnadır,
> ve bu ayrım bir `Symbol` sütunu altında görünmez olur. Bir sembol işe yarıyorsa,
> onu ifadenin kendisine koy.

**Sorulacak sorular**:
- Bu sistemin yaptığı temel hesaplamalar nelerdir?
- Ölçekleme doğrusal mı, logaritmik mi, yoksa basamaklı mı olmalı?
- Oyunun başında/ortasında/sonunda çıktı aralıkları ne olmalı?

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Bir not ekle: "`systems-designer` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu YÜKSEK uygulama riskli bir bölüm değilse (yalnızca Section D ve H) atla. Diğer bölümler için taslağı agent olmadan çıkar.
- `full` → aşağıda anlatıldığı gibi başlat.

**Agent'a devretme (ZORUNLU)**: Herhangi bir formül veya denge değeri önermeden önce, `Agent` ile uzman agent'ları paralel olarak başlat:
- **Her zaman `systems-designer`'ı başlat**: Section C'deki Temel Kuralları, kullanıcıdan gelen ayar hedeflerini, bağımlılık GDD'lerinden denge bağlamını ver. Değişken tabloları ve çıktı aralıklarıyla formüller önermelerini iste.
- **Ekonomi/maliyet sistemleri için ayrıca `economy-designer`'ı başlat**: yerleştirme maliyetlerini, yükseltme maliyeti niyetini ve ilerleme hedeflerini ver. Maliyet eğrilerini ve oranlarını doğrulamalarını iste.
- Uzmanların önerilerini inceleme için `AskUserQuestion` ile kullanıcıya sun
- Kararı kullanıcı verir; dosyaya ana oturum yazar
- **Uzman görüşü olmadan formül değerleri veya denge sayıları UYDURMA.** Denge tasarımı uzmanlığı olmayan bir kullanıcı ham sayıları değerlendiremez — uzmanların gerekçelerine ihtiyaç duyar.

**Çapraz kontrol**: Bir bağımlılık GDD'si çıktısı bu sisteme giren bir formül tanımlıyorsa,
ona açıkça atıfta bulun. Yeniden icat etme — bağla.

---

### Section E: Edge Cases

**Amaç**: Olağandışı durumları açıkça ele almak, böylece hataya (bug) dönüşmesinler.

**Tamamlama Yönlendirmesi — her uç durumu şu biçimde yaz:**
- **Eğer [koşul]**: [tam sonuç]. [açık değilse gerekçe]

Örnek (terminolojiyi oyunun alanına uyarla):
- **Eğer [kaynak], [koruyucu koşul] aktifken 0'a ulaşırsa**: koşul bitene kadar minimumda tut, sonra sonucu uygula.
- **Eğer iki [tetikleyici/olay] aynı anda tetiklenirse**: [tanımlı öncelik sırası] içinde çözümle; eşitliklerde [tanımlı eşitlik bozma kuralı] kullanılır.

"Uygun şekilde ele al" gibi belirsiz girdiler YAZMA — her biri tam koşulu ve tam
çözümü belirtmelidir. Çözümü olmayan bir uç durum açık bir tasarım sorusudur,
bir spesifikasyon değil.

**Sorulacak sorular**:
- Sıfırda ne olur? Maksimumda? Aralık dışı değerlerde?
- İki kural aynı anda uygulanırsa ne olur?
- Oyuncu istenmeyen bir etkileşim bulursa ne olur? (Bozuk/istismarcı stratejileri (degenerate strategies) belirle)

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Bir not ekle: "`systems-designer` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu YÜKSEK uygulama riskli bir bölüm değilse (yalnızca Section D ve H) atla. Diğer bölümler için taslağı agent olmadan çıkar.
- `full` → aşağıda anlatıldığı gibi başlat.

**Agent'a devretme (ZORUNLU)**: Uç durumları kesinleştirmeden önce `Agent` ile `systems-designer`'ı başlat. Ver: tamamlanmış Section C ve D; formül ve kural uzayından ana oturumun gözden kaçırmış olabileceği uç durumları belirlemelerini iste. Anlatı (narrative) sistemleri için ayrıca `narrative-director`'ı başlat. Bulgularını sun ve kullanıcıya hangilerinin dahil edileceğini sor.

**Çapraz kontrol**: Uç durumları bağımlılık GDD'lerine karşı kontrol et. Bir bağımlılık
bu sistemin ihlal edebileceği bir taban, tavan veya çözüm kuralı tanımlıyorsa, işaretle.

---

### Section F: Dependencies

**Amaç**: Her sistem bağlantısını yönü ve niteliğiyle haritalamak.

Bu bölüm bağlam toplama aşamasından kısmen önceden doldurulmuştur. Sistem dizinindeki
bilinen bağımlılıkları sun ve sor:
- Kaçırdığım bağımlılıklar var mı?
- Her bağımlılık için belirli veri arayüzü nedir?
- Hangi bağımlılıklar katı (sistem onsuz çalışamaz), hangileri esnek
  (onunla zenginleşir ama onsuz da çalışır)?

**Çapraz kontrol**: Bu bölüm iki yönlü olarak tutarlı olmalıdır. Bu sistem
"Combat'a bağımlı" diyorsa, Combat GDD'si de "[bu sistem] tarafından bağımlı olunur" demelidir.
Tek yönlü bağımlılıkları düzeltilmek üzere işaretle.

---

### Section G: Tuning Knobs

**Amaç**: Tasarımcının ayarlayabileceği her değer, güvenli aralıkları ve uç davranışlarıyla.

**Sorulacak sorular**:
- Tasarımcılar hangi değerleri kod değişikliği olmadan ayarlayabilmeli?
- Her düğme için, çok yüksek ayarlanırsa ne bozulur? Çok düşükse?
- Hangi düğmeler birbiriyle etkileşir? (A'yı değiştirmek B'yi anlamsız kılar)

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Düğmeleri Section D'nin değişken tablosundan kendin türet. Bir not ekle: "`systems-designer` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → Section D, düğmeleri etkileşen bir formül tanımlamadıkça (birini değiştirmek diğerini etkisiz kılıyorsa) atla.
- `full` → aşağıda anlatıldığı gibi devret.

**Agent'a devretme**: Formüller karmaşıksa, formül değişkenlerinden ayar düğmelerini
türetmesi için `systems-designer`'a devret.

> Bu devretme, Section D'nin korumasının bir `solo` çalışmasına zaten atlamasını
> söylediği aynı agent olan `systems-designer`'ı belirtir. Yukarıdaki koruma olmasaydı,
> `solo` formüller için uzmanı atlar, sonra aynı formüllerden türetilen düğmeler için
> ona danışırdı.

**Çapraz kontrol**: Bir bağımlılık GDD'si bu sistemi etkileyen ayar düğmeleri listeliyorsa,
onlara burada atıfta bulun. Yinelenen düğmeler oluşturma — doğruluğun kaynağını göster.

---

### Section H: Acceptance Criteria

**Amaç**: Sistemin tasarlandığı gibi çalıştığını kanıtlayan test edilebilir koşullar.

**Tamamlama Yönlendirmesi — her kriteri Given-When-Then (Verilen-Olduğunda-O Zaman) biçiminde yaz:**
- **GIVEN** [başlangıç durumu], **WHEN** [eylem veya tetikleyici], **THEN** [ölçülebilir sonuç]

Örnek (terminolojiyi oyunun alanına uyarla):
- **GIVEN** [başlangıç durumu], **WHEN** [oyuncu eylemi veya sistem tetikleyicisi], **THEN** [belirli, ölçülebilir sonuç].
- **GIVEN** [bir kısıt aktif], **WHEN** [oyuncu bir eylem dener], **THEN** [gösterilen geri bildirim ve eylem sonucu].

En azından şunları dahil et: Section C'deki her temel kural için bir kriter ve Section D'deki
her formül için bir kriter. "Sistem tasarlandığı gibi çalışır" YAZMA — her kriter bir QA
test uzmanı tarafından GDD okunmadan bağımsız olarak doğrulanabilir olmalıdır.

> **Section D yazılmadıysa** (sistem hiçbir sayısal kural tanımlamadığı için bu kademede
> Formulas isteğe bağlıysa), kapsanacak formül yoktur ve kriterler yalnızca Section C'den
> gelir — sessizce daha az kriter yazmak yerine bunu tek satırda belirt.
> **Section D atlandıysa ama Section C bir nicelik belirtiyorsa** — bir oran, eşik,
> maliyet veya eğri — bu, §1 testinin sonradan karşılanması demektir: dur, kullanıcıya
> bu sistem için Formulas'ın zorunlu olduğunu söyle ve kriterleri kesinleştirmeden önce
> onu yaz. Bir kriter, GDD'nin hiç tanımlamadığı bir sayıyı doğrulayamaz.
>
> **Bu yükseltme yalnızca `standard` kademede geçerlidir.** §1'in *koşullu*
> Formulas testini yeniden çalıştırır ve §1 bu koşulu `minimal`'de tamamen devre dışı
> bırakır — *"koşullu Formulas kuralı minimal'de YENİDEN uygulanmaz"*. `minimal`'de bir
> Section C niceliği beklenen bir şeydir ve Formulas'ı geri **getirmez**: değeri
> uygulanabilir kalması için Core Rules içinde satır içi belirt ve devam et.
> `full`'da Section D koşulsuz zorunludur, dolayısıyla bu durum ortaya çıkamaz. Bu kapsam
> olmadan okunursa, iki kural bir oran tanımlayan her `minimal` sistem için — ki bunların
> çoğu böyledir — birbiriyle çelişir.

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Bir not ekle: "`qa-lead` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu YÜKSEK uygulama riskli bir bölüm değilse (yalnızca Section D ve H) atla. Diğer bölümler için taslağı agent olmadan çıkar.
- `full` → aşağıda anlatıldığı gibi başlat.

**Agent'a devretme (ZORUNLU)**: Kabul kriterlerini kesinleştirmeden önce `Agent` ile `qa-lead`'i başlat. Ver: tamamlanmış GDD bölümleri C, D, E; kriterlerin bağımsız olarak test edilebilir olduğunu ve tüm temel kuralları ve formülleri kapsadığını doğrulamalarını iste. Boşlukları veya test edilemeyen kriterleri kullanıcıya sun.

**Sorulacak sorular**:
- Bunun çalıştığını kanıtlayan minimum test kümesi nedir?
- Bu sisteme hangi performans bütçesi ayrılıyor? (kare süresi (frame time), bellek)
- Bir QA test uzmanı ilk olarak neyi kontrol ederdi?

**Çapraz kontrol**: Yalnızca bu sistemi tek başına değil, sistemler arası etkileşimlerin
çalıştığını doğrulayan kriterler de ekle.

---

### Optional Sections: Visual/Audio, Game Feel, UI Requirements, Cross-References, Open Questions

Bu beşi, §1'in sekizi arasında **olmayan** şablon bölümleridir. Kademe tarafından değil,
burada yönetilirler: §1'in kademe listeleri *zorunlu* kümeyi belirler,
bu blok ise geri kalanını bağımsız olarak belirler. Bu nedenle buraya bir bölüm eklemek
bir kademenin bölüm sayısını asla değiştirmez.

Visual/Audio ve Game Feel bazı kategoriler için **ZORUNLUDUR** — isteğe bağlı değil.
Sormadan önce gereklilik seviyesini belirle:

**`systems-index.md` dosyasının `Category` sütununa bağlıdır** —
`templates/systems-index.md`'nin tanımladığı dokuz değer. Dokuzunun her biri aşağıda
tam olarak bir kez geçer, dolayısıyla hiçbir şey açıkta kalmaz:

**Visual/Audio şunlar için ZORUNLUDUR (mecburi — atlamayı önerme):**
- `Gameplay` — dövüş, yapay zekâ, gizlilik (stealth), hareket, etkileşim: oyuncunun sonuçlandığını
  gördüğü her şey
- `UI` — HUD, menüler, envanter ekranları, diyalog arayüzü
- `Narrative` — diyalog, görevler, ara sahneler, lore aktarımı
- `Audio` — tanımı gereği

> **`Gameplay` bu listeye aittir.** `/map-systems`'in dövüş, yapay zekâ ve harekete
> atadığı kategoridir — çoğu aksiyon oyununda en büyük gruptur.

Zorunlu sistemler için: bu bölümün taslağını çıkarmadan önce **`Agent` ile `art-director`'ı başlat**. Ver: sistem adı, oyun konsepti, oyunun temel ilkeleri, varsa sanat kitabının (art bible) 1–4. bölümleri. Şunları belirtmelerini iste: (1) bu sistemin olayları için VFX ve görsel geri bildirim gereksinimleri, (2) animasyon veya görsel stil kısıtları, (3) bu sisteme en doğrudan uygulanan sanat kitabı ilkeleri. Çıktılarını sun; görsel sistemler için bu bölümü `[To be designed]` olarak BIRAKMA.

**İnceleme modu kontrolü** (başlatmadan önce uygula):
- `solo` → bu agent başlatmasını atla. Bölümün taslağını uzman olmadan çıkar. Bir not ekle: "`art-director` danışılmadı — Solo modu. Üretimden önce elle inceleyin."
- `lean` → bu sistemin görsel geri bildirimi merkezi değilse (olaylarını oyuncunun oynamak için okuduğu bir `Gameplay` veya `UI` sistemi) atla. Aksi halde taslağı agent olmadan çıkar.
- `full` → yukarıda anlatıldığı gibi başlat.

> Bu blok, yukarıdaki başlatma zorunlu olarak ifade edilmiş olsa bile (*"bu bölümü
> `[To be designed]` olarak BIRAKMA"*) geçerlidir. `director-gates.md`'nin *"solo
> → hiçbir yerde direktör kapısı yok"* kuralı uzman başlatmalarını değil, direktör
> **kapılarını** yönetir; dolayısıyla bu başlatmayı o belirlemez — bu blok belirler.

**Game Feel, `Gameplay` ve `UI` için ZORUNLUDUR (mecburi — atlamayı önerme)** —
sistemlerini oyuncunun doğrudan kullandığı, tepki hızı (responsiveness), ağırlık ve keskinliğin
cila değil tasarım hedefi olduğu kategoriler. Diğer yedi kategori için isteğe bağlıdır.
Şablonun rehberi bu noktayı kendisi savunur: his *"animasyon bütçelerini, girdi işleme
mimarisini ve hitbox zamanlamasını belirler. His hedeflerini uygulamadan sonra sonradan
eklemek pahalıdır."*

**Cross-References, Dependencies bölümü başka bir GDD'nin adını verdiğinde ZORUNLUDUR.**
Kural kategoriye bağlı değil, türetilmiştir: bu doküman herhangi bir yerde başka bir sistemin
mekaniğine, değerine veya kuralına atıfta bulunuyorsa, o atıf tabloya aittir. Dependencies
hiçbir şeyin adını vermiyorsa, yer tutucuyu bırakmak yerine *"Yok — bu sistem başka hiçbir
GDD'ye atıfta bulunmuyor"* yaz. `/review-all-gdds` Aşama 2c, bu tablo varsa onu okur.

Kalan beş kategori — `Core`, `Progression`, `Economy`,
`Persistence`, `Meta` — için Visual/Audio isteğe bağlıdır: isteğe bağlı bölümleri
zorunlu bölümlerden sonra öner.

> **`minimal`'de hiçbir şeyi zorlama.** §1, gönüllü bir `minimal` GDD'nin *"tam olarak
> 5 standart bölüm"* olduğunu söyler; bu, Visual/Audio veya Game Feel'i zorunlu kılan bir
> kategori kuralıyla çelişir. §1 kazanır: `minimal`'de ikisi de isteğe bağlıya düşer ve
> kümenin tamamı aşağıdaki widget'tan geçer.

`AskUserQuestion` kullan:
- "Bu iş akışı kademesinin zorunlu bölümleri tamamlandı. Kalan şablon bölümlerinden
  hangilerini tanımlamak istersin?"
  - Seçenekler: "Hepsi", "Sadece Cross-References ve açık sorular", "Atla — bunları sonra eklerim"
  - Soruda yalnızca hâlâ bekleyenleri listele: Visual/Audio, Game
    Feel, UI Requirements, Cross-References, Open Questions; bu sistemin kategorisinin veya
    bağımlılıklarının yukarıda zaten zorunlu kıldıkları **hariç**. Kuralların az önce zorunlu
    kıldığı bir bölümü atlamayı önermek, zorunlu bir bölümün atlanmasına yol açan şeydir.
  - **Önerilen seçenek**: Sistemin herhangi bir bağımlılığı, UI yüzeyi veya oyuncuya dönük
    geri bildirimi varsa "Hepsi"; aksi halde "Sadece Cross-References ve açık sorular".
    `autonomous` modun seçim yapabilmesi için işaretlenmiş bir öneriye ihtiyacı vardır:
    öneri olmadan, gözetimsiz bir çalışmanın seçebileceği bir şey yoktur ve atlar.

  Burada bir bölüm sayısı **belirtme**. Zorunlu küme kademeye bağlıdır
  (§1: `full`'da 8, `standard`'da 5 + koşullu Formulas, gönüllü `minimal`'de 5),
  bu yüzden sabit bir "8 zorunlu bölüm tamamlandı" ifadesi `full`'un altındaki her çalışmada
  yanlıştır — `standard` kademedeki bir kullanıcıya, 6 bölüm yazılmışken 8 bölüm var olduğunu söyler.

**Visual/Audio** için (zorunlu olmayan sistemler): Ayrıntı gerekiyorsa `art-director` ve `audio-director` ile koordine ol. GDD aşamasında çoğu zaman kısa bir not yeterlidir.

> **Asset Spec İşareti**: Visual/Audio bölümü gerçek içerikle yazıldıktan sonra bu bildirimi çıktıla:
> "📌 **Asset Spec** — Visual/Audio gereksinimleri tanımlandı. Sanat kitabı onaylandıktan sonra, bu bölümden varlık başına görsel açıklamalar, boyutlar ve üretim istemleri (prompt) oluşturmak için `/asset-spec system:[system-name]` çalıştırın."

**UI Requirements** için: Karmaşık UI sistemlerinde `ux-designer` ile koordine ol.
Bu bölümü yazdıktan sonra, gerçek içerik içerip içermediğini kontrol et (yalnızca
`[To be designed]` veya bu sistemin UI'ı olmadığına dair bir not değil). Gerçek
UI gereksinimleri varsa, bu işareti hemen çıktıla:

> **📌 UX İşareti — [System Name]**: Bu sistemin UI gereksinimleri var. Aşama 4'te
> (Ön Üretim / Pre-Production), epic'leri yazmadan **önce** bu sistemin katkıda bulunduğu
> her ekran veya HUD öğesi için bir UX spesifikasyonu oluşturmak üzere `/ux-design` çalıştırın.
> UI'a atıfta bulunan hikâyeler (stories) GDD'ye doğrudan değil, `design/ux/[screen].md`
> dosyasına atıfta bulunmalıdır.
>
> Sistem dizinini güncellerseniz bunu bu sistem için orada not edin.

**Open Questions** için: Tasarım sırasında ortaya çıkıp tam olarak çözülmemiş her şeyi
kaydet. Her sorunun bir sahibi ve hedef çözüm tarihi olmalıdır.

---
