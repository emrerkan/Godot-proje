> Bu dosya `.claude\skills\ux-design\references\2-gather-context.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# /ux-design — Bölüm 2 ve 2b: Bağlam Toplama ve Sonradan Uyarlama (Retrofit) Tespiti

> `/ux-design`'ın bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözülen ayarlar ve sonraki başlıklarındaki kurallar burada da geçerlidir.

## 2. Bağlam Topla (Okuma Aşaması)

**Bu dosyada:**

- 2a: Zorunlu Okumalar
- 2b: Oyuncu Yolculuğu
- 2c: GDD UI Gereksinimleri
- 2d: Mevcut UX Spesifikasyonları
- 2e: Etkileşim Kalıbı Kütüphanesi
- 2f: Art Bible
- 2g: Erişilebilirlik Gereksinimleri
- 2h: Girdi Yöntemi (Proje Yapılandırmasından)
- 2i: Bağlam Özetini Sun

Kullanıcıya herhangi bir şey sormadan **önce** ilgili tüm bağlamı oku. Skill'in değeri
bilgili olarak gelmesinden kaynaklanır. Her GDD'yi ve art bible'ı bölüm bölüm oku:
ihtiyaç duyduğun başlıkları Grep aracıyla bul (desen `^#`, content modu) ve bu
aralıkları offset ve limit ile Read et.

### 2a: Zorunlu Okumalar

- **Oyun konsepti**: `design/gdd/game-concept.md` dosyasını oku — veya `rigor: minimal`
  seviyesinde onun yerini alan tek sayfalık özet `design/game-brief.md` — ikisi de yoksa uyar:
  > "Oyun konsepti bulunamadı. UX tasarlamadan önce oyunun temelini oluşturmak için
  > önce `/brainstorm` çalıştır."
  > Kullanıcı isterse yine de devam et.

### 2b: Oyuncu Yolculuğu

Varsa `design/player-journey.md` dosyasını oku. İlgili her bölüm için şunları çıkar:
- Bu ekran yolculuğun hangi aşama(lar)ında görünüyor?
- Oyuncunun bu ekrana geldiğindeki duygusal durumu nedir?
- Bu ekran yolculukta hangi oyuncu ihtiyacına hizmet ediyor?
- Bu ekran (yolculuk haritasındaki) hangi kritik anları sunuyor?

Oyuncu yolculuğu dosyası yoksa, eksikliği not et ve devam et:
> "`design/player-journey.md` konumunda oyuncu yolculuğu haritası bulunamadı. Onsuz tasarlamak,
> oyuncu bağlamı hakkında varsayımlar yapacağımız anlamına gelir. Bu spesifikasyonun taslağı
> çıkarıldıktan sonra bir oyuncu yolculuğu oturumu yapmayı düşün."

Ayrıca UX spesifikasyonunun Open Questions bölümüne şunu ekle:
> "Oyuncu yolculuğu haritası henüz oluşturulmadı. Bu ekranın oyuncu bağlamını belirlemek için onu `.claude/docs/templates/player-journey.md` şablonundan yaz."

> **Kullanıcıya bunu oluşturmak için "`/ux-design` Aşama 2b'yi çalıştır" deme.** Aşama 2b
> bu adımın kendisidir — dosyayı *okuyan* adım. Bu çözüm önerisi döngüseldir: kullanıcıyı
> eksikliği az önce raporlayan kontrole geri gönderir. `design/player-journey.md`
> dosyasını hiçbir skill yazmaz; şablonundan elle yazılır.

### 2c: GDD UI Gereksinimleri

`design/gdd/*.md` için Glob yap ve `UI Requirements` bölümleri için grep yap. UI Requirements
bölümü bu ekrana adıyla veya kategorisiyle atıfta bulunan her GDD'yi oku.

Bu GDD UI Gereksinimleri, bu spesifikasyonun **gereksinim girdisidir**. Bunları
spesifikasyonun karşılaması gereken kısıtlar listesi olarak topla.

HUD tasarlanıyorsa, **her** sistemin UI Gereksinimlerine ihtiyacın var — HUD
hepsini bir araya toplar. Her GDD'yi tek tek açmak yerine tek bir taramayla topla:

```
Grep pattern="^#+ .*UI Requirements" glob="design/gdd/*.md" output_mode="content" -A 20
```

Önce paydayı belirle (`design/gdd/*.md` için glob yap, **N**'yi say) ve eşleşme
sayısını buna göre kontrol et. Yalnızca sistem GDD'lerini say: `game-concept.md`,
`systems-index.md`, `game-pillars.md`, `gameplay-tags.md`, `entity-registry.md`,
`fixture-swap-ledger.md`, `sound-bible.md` ve herhangi bir `gdd-cross-review-*.md` de
orada bulunur, ama bunlar sistem değildir ve toplanacak UI'ları yoktur.
**UI Requirements bölümü olmayan bir GDD, UI ihtiyacı olmayan bir GDD
değildir** — bu bölümden daha eski olabilir. Eşleşmeyenleri listele ve onları
HUD'un gereksinim kümesinden çıkarmadan önce gerçekten arayüzsüz (headless) olduklarını
kullanıcıyla teyit et; bir sistemin göstergesini sessizce atlayan bir HUD,
bu toplamanın önlemek için var olduğu tam başarısızlıktır.

### 2d: Mevcut UX Spesifikasyonları

`design/ux/*.md` için Glob yap ve hangi ekranların zaten spesifikasyonu olduğunu not et. Mevcut
ekrana bağlanacak veya mevcut ekrandan bağlanılacak ekranlar için, bu spesifikasyonun
eşleşmesi gereken giriş ve çıkış noktalarını bulmak üzere navigasyon/akış bölümlerini oku.

### 2e: Etkileşim Kalıbı Kütüphanesi

`design/ux/interaction-patterns.md` varsa, kalıp kataloğu dizinini oku
(kalıp adları ve tek satırlık açıklamalarının listesi). Kalıpların tam
ayrıntılarını okuma — yalnızca kataloğu. Bu sana hangi kalıpların zaten var olduğunu söyler,
böylece onları yeniden icat etmek yerine onlara atıfta bulunabilirsin.

### 2f: Art Bible

`design/art/art-bible.md` dosyasını kontrol et. Bulunursa görsel yön (visual direction)
bölümünü oku. UX yerleşimi zaten yapılmış estetik taahhütlerle uyumlu olmalıdır.

### 2g: Erişilebilirlik Gereksinimleri

`design/accessibility-requirements.md` dosyasını kontrol et. Bulunursa oku. Spesifikasyon
orada taahhüt edilen erişilebilirlik seviyesini karşılamalıdır.

### 2h: Girdi Yöntemi (Proje Yapılandırmasından)

`project.yaml` içindeki `platform` bloğunu oku; `project.yaml`'da `platform` bloğu yoksa,
`.claude/docs/technical-preferences.md` içindeki `## Input & Platform` bölümüne geri dön.
Bu değerleri skill boyunca kullanmak üzere sakla — Interaction Map'i yönlendirirler ve
erişilebilirlik gereksinimlerine bilgi sağlarlar:

- **Primary Input (Birincil Girdi)** — `platform.primary_input` — bu oyun için baskın girdi
- **Gamepad Support (Gamepad Desteği)** — `platform.gamepad_support` — Full / Partial / None
- **Touch Support (Dokunmatik Desteği)** — `platform.touch_support` — Full / Partial / None
- **Target Platforms (Hedef Platformlar)** — `platform.targets` — güvenli alan (safe zone) ve en-boy oranı kararları için
- **Input Methods (Girdi Yöntemleri)** — desteklenen yöntemler kümesi. `project.yaml`'dan
  okurken türet: `targets` içinde `PC` veya `Web` varsa klavye/fare;
  gamepad desteği Full/Partial ise gamepad; dokunmatik desteği
  Full/Partial ise dokunmatik; artı birincil girdi. 
  `technical-preferences.md`'ye geri dönüldüğünde, onun açık Input Methods alanını kullan.

İki kaynak da yapılandırılmamışsa, bir kez sor:
> "Girdi yöntemleri henüz yapılandırılmamış. Bu oyun neyi hedefliyor?"
> Seçenekler: "Yalnızca Klavye/Fare", "Yalnızca Gamepad", "İkisi de (PC + Konsol)", "Dokunmatik (mobil)", "Hepsi"
>
> (Bunu kalıcı olarak kaydetmek ve bir daha sorulmamak için `/setup-engine` çalıştır.)

Cevabı bu oturumun geri kalanı için sakla. Bölüm başına veya ekran başına tekrar
**sorma**.

### 2i: Bağlam Özetini Sun

Herhangi bir tasarım çalışmasından önce kullanıcıya kısa bir özet sun:

> **Tasarlanan: [Ekran/Akış Adı]**
> - Mod: [UX Spec / HUD Design / Pattern Library]
> - Yolculuk aşama(lar)ı: [player-journey.md'den, veya "bilinmiyor — yolculuk haritası yok"]
> - Bu spesifikasyonu besleyen GDD gereksinimleri: [sayı ve adlar, veya "bulunamadı"]
> - Spesifikasyonu zaten yazılmış ilgili ekranlar: [liste, veya "henüz yok"]
> - Kullanılabilir bilinen kalıplar: [sayı, veya "henüz kalıp kütüphanesi yok"]
> - Erişilebilirlik seviyesi: [gereksinimler dokümanından, veya "henüz tanımlanmadı"]
> - Girdi yöntemleri: [`project.yaml` platform bloğundan türetilmiş, veya "yukarıda soruldu"]

Sonra sor: "Başlamadan önce okumam gereken başka bir şey var mı, yoksa devam edelim mi?"

---

## 2b. Sonradan Uyarlama (Retrofit) Modu Tespiti

Bir iskelet oluşturmadan önce, hedef çıktı dosyasının zaten var olup olmadığını kontrol et.

Aşama 1'de çözülen çıktı yolu için Glob yap — `design/ux/[filename].md`, veya
`accessibility` modunda `design/accessibility-requirements.md`.

**Dosya varsa — retrofit modu:**
- Dosyanın tamamını oku
- Beklenen her bölüm için, gövdenin gerçek içeriği olup olmadığını (bir `[To be designed]` yer tutucusundan fazlası) veya boş/yer tutucu olup olmadığını kontrol et
- Kullanıcıya bir bölüm durum özeti sun:

> "`design/ux/[filename].md` konumunda mevcut bir UX spesifikasyonu bulundu. Zaten yapılmış olanlar şunlar:
>
> | Bölüm | Durum |
> |---------|--------|
> | Purpose & Player Need | [Complete / Empty / Placeholder] |
> | Player Context on Arrival | ... |
> | Navigation Position | ... |
> | Entry & Exit Points | ... |
> | Layout Specification | ... |
> | States & Variants | ... |
> | Interaction Map | ... |
> | Data Requirements | ... |
> | Events Fired | ... |
> | Transitions & Animations | ... |
> | Input Method Completeness Checklist | ... |
> | Accessibility | ... |
> | Localization Considerations | ... |
> | Acceptance Criteria | ... |
> | Open Questions | ... |
>
> (Satırlar, aktif mod için iskeletin kendi `##` başlıklarıdır — yukarıdaki liste
> UX spesifikasyonu modudur; HUD ve erişilebilirlik modları kendi iskeletlerinin başlıklarını listeler.)
>
> Yalnızca tamamlanmamış [N] bölüm üzerinde çalışacağım — mevcut içeriğin üzerine yazılmayacak."

- Bölüm 3'ü (iskelet oluşturma) atla — dosya zaten var
- Aşama 4'te (Bölüm Yazımı), yalnızca Durumu Empty veya Placeholder olan bölümler üzerinde çalış
- Yeni bir iskelet oluşturmak yerine yer tutucuları yerinde doldurmak için `Edit` kullan

**Dosya yoksa — sıfırdan yazım modu:**
Normal şekilde Aşama 3'e (Dosya İskeletini Oluştur) geç.

---
