# /design-system — Aşama 2: Bağlam Topla

> Bu dosya `.claude\skills\design-system\references\2-gather-context.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> `/design-system`'in bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözümlenen ayarlar ve sonraki başlıklarının altındaki kurallar burada da geçerlidir.

## 2. Bağlam Topla (Okuma Aşaması)

**Bu dosyada:**

- 2a: Zorunlu Okumalar
- 2b: Bağımlılık Okumaları
- 2c: İsteğe Bağlı Okumalar
- 2d: Bağlam Özetini Sun
- 2e: Teknik Uygulanabilirlik Ön Kontrolü

Kullanıcıya herhangi bir şey sormadan **önce** ilgili tüm bağlamı oku. Bu, skill'in
gelişigüzel (ad-hoc) tasarıma göre birincil avantajıdır — bilgilenmiş olarak gelir. Her GDD'yi ve ADR'yi
(Mimari Karar Kaydı) bölüm bölüm oku: ihtiyacın olan başlıkları Grep aracıyla bul (desen `^#`, content
modu) ve o aralıkları offset ve limit ile Read et.

### 2a: Zorunlu Okumalar

> **`minimal` kademede** (bu kademede design-system gönüllüdür): oyun konsepti yerine
> `design/game-brief.md` dosyasını oku ve **sistem dizini okumasını atla** —
> `minimal`'de ne `game-concept.md` ne de `systems-index.md` mevcuttur.
> Özetteki (brief) ilgili MVP özelliğinden ve onun temel döngüsünden (core loop) yola çıkarak yaz.
>
> **Bu not, bu sistemin etkin kademesine değil PROJE kademesine bağlıdır.**
> İkisi, `workflow_overrides.system_overrides` bir sistemi `minimal` bir projenin
> üzerine çıkardığında farklılaşır — `.claude/docs/settings-guidance.md` bu
> yapılandırmayı override'ın var olma nedeni olarak tanıtır ("derin bir sistemi yükselt").
> O iki dosya *proje* `minimal` olduğu için yoktur; *bu sistemi* `standard` veya `full`'a
> yükseltmek onları oluşturmaz. Dolayısıyla `minimal` bir projede bu dalı
> **override edilmiş bir sistem için bile** izle ve özeti (brief) oku.
>
> Sonraki her şeyi yine etkin kademe yönetir — zorunlu bölüm kümesi (§1),
> iskelet (§3), bölüm döngüsü (§4) ve §5a. Burada yalnızca zorunlu-*okumalar*
> dalı proje kademesini izler.
>
> **Sonra `Category`, `Layer` ve `Priority` değerlerini özetten bir kez, burada türet.**
> Sonraki altı adım az önce atladığın sistem dizinine bağlıdır — §2e'nin motor
> alanı (engine domain), Section A ve Section B'nin önerilen seçenekleri, Visual/Audio
> ZORUNLU tablosu, §6 uzman yönlendirmesi ve §5-pre'nin Quick reference satırı — ve hiçbirinin
> dizin-yok dalı yoktur. Override edilmiş bir sistem bu altısının hepsine `standard`
> veya `full` kademede ulaşır, bu yüzden "dizini atla" onları hiç girdisiz bırakır.
> Bunun yerine özetten türet:
>
> - **`Category`** — `templates/systems-index.md` içindeki dokuz kategoriden biri
>   (`Core · Gameplay · Progression · Economy · Persistence · UI · Audio ·
>   Narrative · Meta`); özetin sistemin *ne yaptığı* hakkında söylediğine göre seçilir.
> - **`Layer`** — başka sistemler ona bağımlıysa `Foundation`, değilse `Feature`.
> - **`Priority`** — özetin yapım sırası (build order) onu listeliyorsa `MVP`, değilse `Post-MVP`.
>
> Üçünü de çalışmanın geri kalanı boyunca taşı ve dizinin cevabıymış gibi kullan.
> §5-pre'nin Quick reference satırında **onları çıkarım olarak işaretle** (*"Category: Gameplay
> (özetten çıkarıldı — bu kademede sistem dizini yok)"*), böylece sonraki bir okuyucu
> bir türetmeyi dizine kayıtlı bir gerçek sanmaz. Onları tutmak için bir sistem dizini
> **yazma**: o dosya `/map-systems`'e aittir (§5d).
>
> Bu kural olmasaydı, override edilmiş bir sistem `full`'a çözümlenir, aşağıdaki
> hızlı-başarısız (fail-fast) okumalara düşer ve ilk adımında *"No game concept
> found. Run `/brainstorm` first"* hatasıyla durur.

- **Oyun konsepti**: `design/gdd/game-concept.md` dosyasını oku — yoksa başarısız ol:
  > "Oyun konsepti bulunamadı. Önce `/brainstorm` çalıştırın."
- **Sistem dizini**: `design/gdd/systems-index.md` dosyasını oku — yoksa başarısız ol:
  > "Sistem dizini bulunamadı. Sistemlerinizi haritalamak için önce `/map-systems` çalıştırın."
- **Hedef sistem**: Sistemi dizinde bul. Listelenmemişse uyar:
  > "[system-name] sistem dizininde yok. Eklemek ister misiniz, yoksa
  > dizin dışı bir sistem olarak mı tasarlayalım?"
- **Varlık kayıt defteri (entity registry)**: `design/registry/entities.yaml` varsa, bu
  sistemin sahip olduğu girdileri ve ona atıfta bulunan girdileri, her birini bütün olarak listele:
  ```
  bash .claude/scripts/registry.sh slice design/gdd/[system-name].md
  ```
  `referenced_by:` bir blok listedir (anahtar ve yolları ayrı satırlardadır), bu yüzden
  yolu grep ile aramak satırı bulur ama ona sahip olan girdiyi bulmaz; `slice` ise
  listesi ne kadar uzun olursa olsun sahibi olan girdiyi yazdırır. Bunları bağlamda
  **bilinen gerçekler** olarak tut — diğer GDD'lerin zaten belirlediği ve bu GDD'nin
  çelişmemesi gereken değerler.
- **Hata günlüğü (reflexion log)**: Varsa `docs/consistency-failures.md` dosyasını oku.
  Domain alanı bu sistemin kategorisiyle eşleşen girdileri çıkar. Bunlar
  tekrarlayan çelişki desenleridir — kullanıcının bu alanda daha önce nerede hata yapıldığını
  bilmesi için bunları Aşama 2d bağlam özetinde "Geçmiş hata desenleri" başlığı altında sun.

### 2b: Bağımlılık Okumaları

Sistem dizininden şunları belirle:
- **Yukarı akış (upstream) bağımlılıkları**: Bu sistemin bağımlı olduğu sistemler (bu sistemin
  saygı göstermesi gereken kararlar).
- **Aşağı akış (downstream) bağımlıları**: Bu sisteme bağımlı olan sistemler (bu sistemin
  karşılaması gereken beklentiler).

Var olan her bağımlılık GDD'si için **yalnızca sistemler arası sözleşmeyi taşıyan dört bölümü**
oku — GDD'nin tamamını değil:
```
Grep pattern="^## ([0-9]+\. )?(Dependencies|Formulas|Edge Cases|Tuning Knobs)" glob="design/gdd/[dep].md" output_mode="content" -A 20
```
- Temel arayüzler ve veri akışı (Dependencies'ten)
- Bu sistemin çıktılarına atıfta bulunan formüller
- Bu sistemin davranışını varsayan uç durumlar
- Bu sisteme girdi sağlayan ayar düğmeleri (tuning knobs)

Bunların çoğu zaten `entities.yaml` içindedir (2a'da yüklendi) — kayıt defterinin
`formula_map`/`constant_map` alanları sahip olunan değerleri `source:` bilgileriyle taşır. Önce kayıt
defterini kullan; bölüm grep'i onun içermediklerini tamamlar.

### 2c: İsteğe Bağlı Okumalar

- **Oyun temel ilkeleri (pillars)**: Varsa `design/gdd/game-pillars.md` dosyasını oku
- **Mevcut GDD**: Varsa `design/gdd/[system-name].md` dosyasını oku (kaldığın yerden devam et,
  sıfırdan yeniden başlama)
- **İlgili sistemler**: "tematik olarak ilgili" sistemleri aramak için `design/gdd/*.md`'yi
  glob'layıp okuma — bunun için belirleyici bir vekil ölçüt yoktur ve kayıt defterinin
  yerini almak için var olduğu okuma tam olarak budur. `entities.yaml` (2a) ilgili bir GDD'nin
  sağlayacağı sistemler arası gerçekleri zaten tutar. Belirli bir örtüşme biliniyorsa,
  onu yukarıdaki gibi bir bağımlılık olarak ele al ve bölüm grep'i yap; aksi halde
  kayıt defterine güven.

### 2d: Bağlam Özetini Sun

Tasarım çalışmasına başlamadan önce kullanıcıya kısa bir özet sun:

> **Tasarlanan: [System Name]**
> - Öncelik: [dizinden] | Katman: [dizinden]
> - Bağımlı olduğu: [liste; hangilerinin GDD'si var, hangileri tasarlanmamış belirt]
> - Ona bağımlı olanlar: [liste; hangilerinin GDD'si var, hangileri tasarlanmamış belirt]
> - Saygı gösterilecek mevcut kararlar: [bağımlılık GDD'lerinden temel kısıtlar]
> - Temel ilke uyumu: [bu sistemin öncelikli olarak hizmet ettiği ilke(ler)]
> - **Bilinen sistemler arası gerçekler (kayıt defterinden):**
>   - [entity_name]: [attribute]=[value], [attribute]=[value] ([source GDD]'ye ait)
>   - [item_name]: [attribute]=[value], [attribute]=[value] ([source GDD]'ye ait)
>   - [formula_name]: değişkenler=[list], çıktı=[min–max] ([source GDD]'ye ait)
>   - [constant_name]: [value] [unit] ([source GDD]'ye ait)
>   *(Bu değerler kilitlidir — bu GDD farklı değerlere ihtiyaç duyarsa, yazmadan önce
>   çelişkiyi ortaya koy. Sessizce farklı sayılar kullanma.)*
>
> İlgili kayıt defteri girdisi yoksa: "Bilinen sistemler arası gerçekler" bölümünü çıkar.

Yukarı akış bağımlılıklarından herhangi biri tasarlanmamışsa uyar:
> "[dependency] için henüz bir GDD yok. Arayüzü hakkında varsayımlarda
> bulunmamız gerekecek. Önce onu tasarlamayı düşünün, ya da beklenen
> sözleşmeyi tanımlayıp geçici (provisional) olarak işaretleyebiliriz."

### 2e: Teknik Uygulanabilirlik Ön Kontrolü

Kullanıcıdan tasarıma başlamasını istemeden önce motor bağlamını yükle ve tasarımı
şekillendirecek kısıtları veya bilgi boşluklarını ortaya çıkar.

**Adım 1 — Bu sistem için motor alanını (engine domain) belirle:**
Sistemin kategorisini (systems-index.md'den) bir motor alanına eşle:

`systems-index.md` dosyasının `Category` sütununa bağlıdır. `templates/systems-index.md`'nin
tanımladığı dokuz kategorinin hepsi burada yer alır; bir kategori birkaç motor alanına
yayılıyorsa, sistemin gerçekte ne yaptığına uyan satırı seç ve hangisini seçtiğini söyle.

| `Category` | Motor Alanı |
|-----------|--------------|
| `Gameplay` | Dövüş / çarpışma / hareket için **Physics**; yapay zekâ ve yol bulma için **Navigation**; motor yüzeyi olmayan, yalnızca kural içeren sistemler için **Scripting** |
| `Core` | **Core** — sahne yönetimi, durum, kaynak yükleme; kontroller ve tuş atamaları için **Input** |
| `UI` | UI |
| `Audio` | Audio |
| `Narrative` | Scripting — diyalog, görevler, ara sahneler |
| `Progression` | Scripting — kayıtla ilişkili kural mantığı, ayrılmış alan yok |
| `Economy` | Scripting — veri ve kural mantığı, ayrılmış alan yok |
| `Persistence` | Core — kaydet/yükle, ayarlar, serileştirme |
| `Meta` | Core — analitik, eğitimler (tutorial), erişilebilirlik altyapısı |

> Animation, Rendering ve Networking kendi kategorisi olmayan motor alanlarıdır:
> bunlara ihtiyaç duyan bir sistem `Gameplay` veya `Core` olacaktır. Hangi satırdan
> girmiş olursan ol, referansını okuduğun alanın adını belirt.

**Adım 2 — Motor bağlamını oku (varsa):**
- Motoru ve sürümünü belirle: `project.yaml` dosyasından `engine.name` ve `engine.version` değerlerini oku. Her alanı bağımsız olarak çözümle — anahtarı yoksa veya boşsa (`project.yaml`'da `engine:` bloğu olmadığı durum dahil), `.claude/docs/technical-preferences.md` dosyasına geri dön (`[TO BE CONFIGURED]` değeri ayarlanmamış demektir)
- Motor yapılandırılmışsa `docs/engine-reference/[engine]/VERSION.md` dosyasını oku
- Varsa `docs/engine-reference/[engine]/modules/[domain].md` dosyasını oku.
  **Yoksa, bunu adıyla belirt** — *"`docs/engine-reference/[engine]/modules/` altında
  `[domain]` için motor referansı yok; uygulanabilirlik sabitlenmiş motor sürümüne göre
  kontrol edilmedi"* — ve bunu §5-pre'ye taşı. Burada sessizce atlamak, çalışıp
  hiçbir sorun bulmamış bir uygulanabilirlik kontrolünden ayırt edilemez;
  `.claude/rules/skill-authoring.md` 3 numaralı yükümlülük tam da bu hatayı
  önlemek için vardır.

  > **Bu nadir bir dal değildir.** Yukarıdaki alan tablosu dokuz kategoriden beşi için
  > `Scripting` ve `Core` gösterir (`Narrative`, `Progression`, `Economy`
  > → Scripting; `Persistence`, `Meta` → Core), ayrıca `Gameplay` ve `Core` altında
  > birer alt satır. Godot referansı `animation, audio, input,
  > navigation, networking, physics, rendering, ui` ile gelir — **`scripting.md` ve
  > `core.md` yoktur**. Yani `Gameplay` dışı sistemlerin çoğu her seferinde bu
  > olmayan-dosya dalına düşer: bunu her seferinde raporla.
- Alanla ilgili girdiler için `docs/engine-reference/[engine]/breaking-changes.md` dosyasını oku
- Filtreleyeceğin alanı öğrenmek için her ADR'yi okumadan, alana uyan ADR'leri bul —
  önce Domain alanını grep'le, sonra yalnızca eşleşenleri oku:
  ```
  Grep pattern="\*\*Domain\*\*" glob="docs/architecture/adr-*.md" output_mode="content"
  ```
  Yalnızca Domain'i bu sistemin kategorisiyle eşleşen ADR'leri oku (`## Decision`
  ve `## Engine Compatibility` bölümlerini); geri kalanını atla.

**Adım 3 — Uygulanabilirlik Özetini Sun:**

Motor referans dokümanları varsa, tasarıma başlamadan önce sun:

```
## Technical Feasibility Brief: [System Name]
Engine: [name + version]
Domain: [domain]

### Known Engine Capabilities (verified for [version])
- [capability relevant to this system]
- [capability 2]

### Engine Constraints That Will Shape This Design
- [constraint from engine-reference or existing ADR]

### Knowledge Gaps (verify before committing to these)
- [post-cutoff feature this design might rely on — mark HIGH/MEDIUM risk]

### Existing ADRs That Constrain This System
- ADR-XXXX: [decision summary] — means [implication for this GDD]
  (or "None yet")
```

Motor referans dokümanları yoksa (motor henüz yapılandırılmamışsa), kısa bir not göster:
> "Henüz motor yapılandırılmadı — teknik uygulanabilirlik kontrolü atlanıyor. Henüz
> yapmadıysanız mimariye geçmeden önce `/setup-engine` çalıştırın."

**Adım 4 — Devam etmeden önce sor:**

`AskUserQuestion` kullan:
- "Başlamadan önce eklenecek bir kısıt var mı, yoksa bunlar not edilmiş halde devam edelim mi?"
  - Seçenekler: "Bunlar not edilmiş halde devam et", "Önce bir kısıt ekle", "Motor dokümanlarını kontrol etmem gerekiyor — burada duraklat"

---

`AskUserQuestion` kullan:
- "[system-name] tasarımına başlamaya hazır mısın?"
  - Seçenekler: "Evet, başlayalım", "Önce daha fazla bağlam göster", "Önce bir bağımlılığı tasarla"

---
