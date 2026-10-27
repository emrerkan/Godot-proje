# /design-system — Aşama 1: Argümanları Ayrıştır ve Doğrula

> Bu dosya `.claude\skills\design-system\references\1-parse-arguments.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> `/design-system`'in bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözümlenen ayarlar ve sonraki başlıklarının altındaki kurallar burada da geçerlidir.

## 1. Argümanları Ayrıştır ve Doğrula

**Bu dosyada:**

- `docs.density`
- Sistem adı verilmedi: bir sonrakini sistem dizini seçer
- Retrofit modunu algıla
- Bu sistem için `workflow` ve her kademede `## Summary`

Tam kontrol deseni için `.claude/docs/director-gates.md` dosyasına bak. Tek tek kapı (gate) tanımları `.claude/docs/director-gates/[gate-id].md` içinde bulunur — başlatılan agent kendi kapı dosyasını okur; bunu ana oturumda okuma.


Her `AskUserQuestion` çağrısı `.claude/docs/automation-modes.md` kurallarına uyar
(collaborative her zaman sorar · guided sadece büyük kararlarda sorar · autonomous kaydeder ve devam eder;
`automation_always_ask` kategorileri her zaman soru sorar).

**`docs.density`** — bölüm başına *derinliği* kontrol eder; `workflow` ise hangi bölümlerin
var olacağını kontrol eder. `modes.rigor` ikisini birlikte ayarlar; yalnızca derinliği
değiştirmek için `docs.density` değerini açıkça ayarla: `terse` (varsayılan, `rigor: minimal` ile) = madde işaretleri, bölüm başına 2–5 satır,
gerekçe ve girişleri atla; `balanced` = hafif gerekçeli paragraflar
(`rigor: standard`); `thorough` = gerekçe, örnekler ve değerlendirilen alternatiflerle
tam düzyazı. Yazdığın her bölüme bunu uygula. Zorunlu yapılar (Formulas değişken
tablosu, Given-When-Then kabul kriterleri) her yoğunlukta doğruluk gereksinimidir —
`terse` çevredeki metni kısaltır, gerekli yapının kendisini asla kısaltmaz.

Bir sistem adı veya retrofit yolu **zorunludur**. Eksikse:

1. `design/gdd/systems-index.md` dosyasının var olup olmadığını kontrol et.
2. Varsa: oku, durumu "Not Started" (veya eşdeğeri) olan en yüksek öncelikli sistemi bul ve `AskUserQuestion` kullan:
   - Soru: "Tasarım sıranızdaki bir sonraki sistem **[system-name]** ([priority] | [layer]). Tasarlamaya başlansın mı?"
   - Seçenekler: `[A] Yes — design [system-name]` / `[B] Pick a different system` / `[C] Stop here`
   - [A] ise: o sistem adıyla devam et. [B] ise: hangi sistemin tasarlanacağını sor (düz metin). [C] ise: çık.
3. Sistem dizini yoksa şu mesajla başarısız ol:
   > "Kullanım: `/design-system <system-name>` — örn. `/design-system movement`
   > Ya da mevcut bir GDD'deki boşlukları doldurmak için: `/design-system retrofit design/gdd/[system-name].md`
   > Sistem dizini bulunamadı. Sistemlerinizi haritalamak ve tasarım sırasını almak için önce `/map-systems` çalıştırın."

**Retrofit modunu algıla:**
Argüman `retrofit` ile başlıyorsa veya argüman `design/gdd/` içindeki mevcut bir `.md`
dosyasının yoluysa, **retrofit moduna** (sonradan tamamlama modu) gir:

1. Mevcut GDD dosyasını oku. Bölüm bölüm oku: başlıkları
   Grep aracıyla bul (desen `^#`, content modu) ve o aralıkları
   offset ve limit ile Read et.
2. 8 **olası** bölümden hangilerinin mevcut olduğunu belirle (bölüm başlıklarını tara):
   Overview, Player Fantasy, Detailed Design/Rules, Formulas,
   Edge Cases, Dependencies, Tuning Knobs, Acceptance Criteria.
   **Bunlardan hangilerinin *zorunlu* olduğu etkin kademeye bağlıdır** (§1) —
   `standard` kademede sadece 5'i zorunludur, matematik içeren kategoriler için artı Formulas;
   Player Fantasy ve Tuning Knobs ise **tasarım gereği** atlanır. Eksik bir bölümü sadece
   kademe onu gerektiriyorsa boşluk olarak raporla; aksi halde eklenebilir olarak listele.
   Burada 8'inin hepsini zorunlu saymak, her `standard` projede tasarım gereği eksik olan
   iki bölümü boşluk olarak raporlar.
3. Hangi bölümlerin sadece yer tutucu metin içerdiğini belirle (`[To be designed]` veya
   eşdeğeri — boş, tek satır ya da açıkça eksik).
4. Herhangi bir şey yapmadan önce kullanıcıya sun:
   ```
   ## Retrofit: [System Name]
   File: design/gdd/[filename].md

   Sections already written (will not be touched):
   ✓ [section name]
   ✓ [section name]

   Missing or incomplete sections (will be authored):
   ✗ [section name] — missing
   ✗ [section name] — placeholder only
   ```
5. Sor: "Eksik [N] bölümü doldurayım mı? Mevcut içeriğin hiçbirini değiştirmeyeceğim."
6. Evet ise: **Aşama 2'ye (Bağlam Topla)** normal şekilde geç, ama **Aşama 3'te**
   iskelet oluşturmayı atla (dosya zaten var) ve **Aşama 4'te** zaten tamamlanmış
   bölümleri atla. Bölüm döngüsünü sadece eksik/tamamlanmamış bölümler için çalıştır.
7. **Mevcut bölüm içeriğinin üzerine asla yazma.** Sadece `[To be designed]`
   yer tutucularını veya boş bölüm gövdelerini değiştirmek için Edit aracını kullan.

Retrofit modunda DEĞİLSEN, dosya adı için sistem adını kebab-case'e normalize et
(örn. "combat system" → `combat-system`).

**Bu sistem için `workflow`** (`.claude/docs/workflow-modes.md` uyarınca) — blok bu sistem
için bir `system_overrides` satırı listeliyorsa onu kullan, yoksa proje değerini.

Çözümlenen kademe (tier), hangi GDD bölümlerinin **zorunlu** olduğunu belirler (§4'te uygulanır).
**`## Summary` her kademede zorunludur ve 8 bölümden biri değildir** — §5-pre onu koşulsuz
yazar (*"Bu her kademede çalışır"*). Aşağıdaki kademe listeleri onu tekrar etmez ve
yalnızca bir kademe listesine göre kontrol edilen bir GDD, Summary olmadan da geçerdi —
oysa bu, `/review-all-gdds`'in ve kademeli yükleme yapan okuyucuların bağımlı olduğu tek bölümdür.
Aşağıdaki her listeyi "`## Summary`, artı:" şeklinde oku.
- `full` — 8 bölümün tamamı
- `standard` — Overview, Detailed Design, Edge Cases, Dependencies, Acceptance
  Criteria (5 zorunlu); **Formulas koşullu** — sistem **sayısal kurallar tanımladığında**
  zorunludur: oranlar, eğriler, eşikler, maliyetler, hasar, düşme (drop)
  ağırlıkları veya bir denge (balance) çalışmasında ayarlanacak herhangi bir değer. Yalnızca sistem
  böyle hiçbir değer tanımlamıyorsa isteğe bağlıdır. **`systems-index.md` içindeki `Category`
  bir ipucudur, test değil** — `Gameplay`, `Economy` ve `Progression` sistemleri neredeyse her zaman
  bu kapsama girer; sayısal bir kural tanımlayan bir `Core`, `UI` veya `Persistence` sistemi de
  girer. Detailed Design motorun sabiti olmayan bir nicelik belirtiyorsa, Formulas zorunludur.
  **Player Fantasy ve Tuning Knobs atlanır**, `workflow_overrides` onları zorlamadıkça
  (`tuning_knobs: true` Tuning Knobs'u zorlar)

  > **Bunu bir kategori sözcüğüne bağlama.** "Kategori combat / economy / progression / AI"
  > gibi bir test, `/map-systems`'in yazmadığı sözcükleri eşler —
  > `templates/systems-index.md` kategorileri `Core ·
  > Gameplay · Progression · Economy · Persistence · UI · Audio · Narrative ·
  > Meta` olarak tanımlar ve **combat ile AI'ı `Gameplay` altında örnek sistemler olarak** listeler.
  > Şablonun söylediği şekilde kategorilendirilmiş bir dövüş sistemi bu dördünden hiçbirine
  > uymaz ve Formulas, ona en çok ihtiyaç duyması muhtemel sistem için düşürülürdü.
- `minimal` — GDD zorunlu değildir (oyun özeti (game brief) onun yerini alır). `minimal`
  kademede gönüllü olarak çağrılırsa, tam olarak 5 standart bölümü yaz (Overview,
  Detailed Design, Edge Cases, Dependencies, Acceptance Criteria) — koşullu
  Formulas kuralı `minimal`'de YENİDEN uygulanmaz — ve kullanıcıya bu iş akışı
  seviyesinde GDD'nin isteğe bağlı olduğunu söyle.

Retrofit modu bundan etkilenmez — kademeden bağımsız olarak eksik olan bölümleri doldurur.

---
