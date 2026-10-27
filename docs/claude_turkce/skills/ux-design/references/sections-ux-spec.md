> Bu dosya `.claude\skills\ux-design\references\sections-ux-spec.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> Bölüm yazım rehberliği; `/ux-design` tarafından YALNIZCA AKTİF MOD için yüklenir.
> Diğer ikisini asla yükleme — her çağrıda tek bir mod geçerlidir.

# Bölüm Rehberliği — UX Spesifikasyonu Modu

**Bu dosyada:**

- Bölüm A: Amaç ve Oyuncu İhtiyacı
- Bölüm B: Varıştaki Oyuncu Bağlamı
- Bölüm B2: Navigasyon Konumu
- Bölüm B3: Giriş ve Çıkış Noktaları
- Bölüm C: Yerleşim Spesifikasyonu
- Bölüm D: Durumlar ve Varyantlar
- Bölüm E: Etkileşim Haritası
- Bölüm E2: Tetiklenen Olaylar
- Bölüm E3: Geçişler ve Animasyonlar
- Bölüm F: Veri Gereksinimleri
- Bölüm F2: Girdi Yöntemi Bütünlük Kontrol Listesi
- Bölüm G: Erişilebilirlik
- Bölüm H: Yerelleştirme Değerlendirmeleri
- Bölüm I: Kabul Kriterleri

#### Bölüm A: Amaç ve Oyuncu İhtiyacı (Purpose & Player Need)

Bu bölüm temeldir. Diğer her karar buradan doğar.

**Sorulacak sorular**:
- "Bu ekran hangi oyuncu hedefine hizmet ediyor? Oyuncu burada ne YAPMAYA çalışıyor?"
- "Bu ekran olmasaydı veya kullanımı zor olsaydı ne ters giderdi?"
- "Şu cümleyi tamamla: 'Oyuncu bu ekrana ___ isteğiyle gelir.' "

Aşama 2'de toplanan oyuncu yolculuğu bağlamıyla çapraz kontrol yap. Belirtilen amaç
yolculuk aşaması ve duygusal durumla uyumlu olmalıdır.

---

#### Bölüm B: Varıştaki Oyuncu Bağlamı (Player Context on Arrival)

**Sorulacak sorular**:
- "Oyuncu bu ekranla oyunun hangi noktasında ilk kez karşılaşıyor?"
- "Bu ekrana ulaşmadan hemen önce ne yapıyorlardı?"
- "Tasarım hangi duygusal durumu varsaymalı? (sakin, stresli, meraklı, zaman baskısı altında)"
- "Oyuncular bu ekrana kendi istekleriyle mi geliyor, yoksa oyun tarafından mı gönderiliyorlar?"

Oyuncu yolculuğu dokümanı varsa, bunu yolculuk aşamalarıyla eşleştirmeyi teklif et.

---

#### Bölüm B2: Navigasyon Konumu (Navigation Position)

Bu ekran oyunun navigasyon hiyerarşisinde nerede duruyor? Bu tek paragraflık bir yön bulma haritasıdır — tam bir akış diyagramı değil.

**Sorulacak sorular**:
- "Bu ekrana ana menüden mi, duraklatma menüsünden mi, oynanış içinden mi, yoksa başka bir ekrandan mı erişiliyor?"
- "Üst düzey bir hedef mi (her zaman erişilebilir) yoksa bağlama bağlı mı (yalnızca belirli durumlarda erişilebilir)?"
- "Oyuncu bu ekrana oyunda birden fazla yerden ulaşabilir mi?"

Şöyle sun: "Bu ekranın yeri: [kök] → [üst] → [bu ekran]" artı varsa alternatif giriş yolları.

---

#### Bölüm B3: Giriş ve Çıkış Noktaları (Entry & Exit Points)

Oyuncunun bu ekrana gelebileceği ve bu ekrandan ayrılabileceği her yolu haritala.

**Sorulacak sorular**:
- "Bir oyuncunun bu ekrana ulaşabileceği tüm yollar neler?" (Her tetikleyiciyi listele: tuş basımı, oyun olayı, başka bir ekrandan yönlendirme vb.)
- "Oyuncu çıkmak için ne yapabilir? Çıktığında ne olur?" (Geri tuşu, onay eylemi, zaman aşımı, oyun olayı)
- "Tek yönlü çıkışlar var mı — oyuncunun baştan başlamadan bu ekrana geri dönemediği?"

İki tablo olarak sun:

| Giriş Kaynağı | Tetikleyici | Oyuncunun taşıdığı bağlam |
|---|---|---|
| [ekran/olay] | [nasıl] | [geldiklerinde sahip oldukları durum/veri] |

| Çıkış Hedefi | Tetikleyici | Notlar |
|---|---|---|
| [ekran/olay] | [nasıl] | [geri alınamaz durum değişiklikleri] |

---

#### Bölüm C: Yerleşim Spesifikasyonu (Layout Specification)

Bu en büyük ve en etkileşimli bölümdür. Alt bölümler halinde ele al:

**Alt bölüm 1 — Bilgi Hiyerarşisi** (bunu herhangi bir yerleşimden önce belirle):
- Kullanıcıdan bu ekranın iletmesi gereken her bilgi parçasını listelemesini iste.
- Sonra maddeleri sıralamasını iste: "Oyuncunun ilk görmesi gereken en önemli tek şey
  nedir? İkincisi nedir? Hemen görünür olmak yerine keşfedilebilecek olan nedir?"
- Bölgelere geçmeden önce ortaya çıkan hiyerarşiyi onay için sun.

**Alt bölüm 2 — Yerleşim Bölgeleri**:
- Bilgi hiyerarşisine dayanarak kaba ekran bölgeleri öner (başlık, içerik
  alanı, eylem çubuğu, kenar çubuğu vb.).
- Her biri için gerekçesiyle 2-3 bölge düzeni sun. Oyun konseptinden toplanan
  platform ve girdi bağlamına atıfta bulun.
- Seçimi kaydetmek için `AskUserQuestion` kullan:
  - "Hangi bölge düzeni en iyi uyuyor?"
  - Seçenekler: [az önce sunduğun 2-3 adlandırılmış düzen] + "Hiçbiri — özel bir düzen oluştur"

**Alt bölüm 3 — Bileşen Envanteri**:
- Her bölge için içerdiği UI bileşenlerini listele. Her bileşen için şunları not et:
  - Bileşen türü (düğme, liste, kart, istatistik göstergesi, giriş alanı vb.)
  - Gösterdiği içerik
  - Etkileşimli olup olmadığı
  - Kütüphanedeki mevcut bir kalıbı kullanıyorsa (kalıp adıyla atıfta bulun)
  - Yeni bir kalıp getiriyorsa (daha sonra kütüphaneye eklenmek üzere işaretle)

**Alt bölüm 4 — ASCII Wireframe**:
- Bölge yerleşimine ve bileşen listesine dayalı bir ASCII wireframe üretmeyi teklif et.
- `AskUserQuestion` kullan: "Bu spesifikasyonun parçası olarak bir ASCII wireframe ister misin?"
  - Seçenekler: "Evet, bir tane ekle", "Hayır, ayrı bir dosya ekleyeceğim"
- Evet ise, wireframe'i önce sohbette üret. Dosyaya yazmadan önce
  geri bildirim iste.

---

#### Bölüm D: Durumlar ve Varyantlar (States & Variants)

Kullanıcıyı mutlu yolun (happy path) ötesini düşünmeye yönlendir.

**Sorulacak sorular** (bunları birer birer ele al):
- "Bir oyuncu bu ekranı ilk kez gördüğünde, henüz hiç veri yokken nasıl görünüyor?
  (boş durum)"
- "Bir şeyler ters gittiğinde ne oluyor — bir hata, başarısız bir eylem, eksik bir
  kaynak? (hata durumu)"
- "Bu ekranda hiç yükleme beklemesi oluyor mu? Oluyorsa ne gösteriyor? (yükleme durumu)"
- "Bu ekranın gösterdiğini değiştiren oyuncu ilerleme durumları var mı? Örneğin
  kilitli içerik, premium içerik veya eğitim modu katmanları?"
- "Bu ekran desteklenen herhangi bir platformda farklı davranıyor mu? (platform varyantı)"

Toplanan durumları onay için bir tablo olarak sun:

| Durum / Varyant | Tetikleyici | Ne Değişir |
|-----------------|---------|--------------|
| Varsayılan (Default) | Normal yükleme | — |
| Boş (Empty) | Kullanılabilir veri yok | [içerik alanı açıklaması] |
| [vb.] | [tetikleyici] | [değişiklikler] |

---

#### Bölüm E: Etkileşim Haritası (Interaction Map)

Layout Specification'da belirlenen her etkileşimli bileşen için şunları tanımla:
- Eylem (dokunma, tıklama, basma, basılı tutma, kaydırma, sürükleme)
- Onu tetikleyen platform girdi(ler)i (fare tıklaması, gamepad A, klavye Enter)
- Anlık geri bildirim (görsel, işitsel, dokunsal (haptic))
- Sonuç (navigasyon hedefi, durum değişikliği, veri yazma)

Aşama 2h'de çözülen girdi yöntemlerini kullan — kullanıcıya
tekrar sorma. Bunları baştan belirt: "Etkileşimler şunlar için haritalanıyor:
[Aşama 2h'de çözülen Input Methods]. [Gamepad Support] gamepad desteği kapsanıyor."

Hepsini birden istemek yerine bileşenleri birer birer ele al.
Navigasyon eylemleri için (başka bir ekrana gitme), hedefin mevcut bir
UX spesifikasyonuyla eşleştiğini doğrula veya onu bir spesifikasyon bağımlılığı olarak not et.

---

#### Bölüm E2: Tetiklenen Olaylar (Events Fired)

Interaction Map'teki her oyuncu eylemi için, oyunun veya analitik sisteminin tetiklemesi gereken karşılık gelen olayı belgele — veya hiçbiri geçerli değilse açıkça "olay yok" diye not et.

**Sorulacak sorular**:
- "Her eylem için oyun bir analitik olayı mı tetiklemeli, bir oyun durumu değişikliği mi, yoksa ikisini birden mi?"
- "Olay TETİKLEMEMESİ gereken eylemler var mı — ve bu kasıtlı bir seçim mi?"

Interaction Map ile yan yana bir tablo olarak sun:

| Oyuncu Eylemi | Tetiklenen Olay | Yük (Payload) / Veri |
|---|---|---|
| [eylem] | [EventName] veya yok | [olayla iletilen veri] |

Kalıcı oyun durumunu (kayıt verisi, ilerleme, ekonomi) değiştiren her eylemi işaretle — bunlar mimari ekibinin açık ilgisini gerektirir.

---

#### Bölüm E3: Geçişler ve Animasyonlar (Transitions & Animations)

Ekranın nasıl girip çıktığını ve durum değişikliklerine nasıl tepki verdiğini belirt.

**Sorulacak sorular**:
- "Bu ekran nasıl beliriyor? (yavaşça belirme, sağdan kayma, anında açılma, düğmeden büyüyerek)"
- "Nasıl kapanıyor? (yavaşça kaybolma, geri kayma, kesme)"
- "Animasyon gerektiren ekran içi durum geçişleri var mı? (yükleme göstergesi, başarı durumu, hata parlaması)"
- "Hareket tutmasına (motion sickness) yol açabilecek bir animasyon var mı — ve oyunun azaltılmış hareket seçeneği var mı?"

Asgari gereksinimler:
- Ekran giriş geçişi
- Ekran çıkış geçişi
- Ekranın birden fazla durumu varsa en az bir durum değişikliği animasyonu

---

#### Bölüm F: Veri Gereksinimleri (Data Requirements)

Aşama 2'de toplanan GDD UI Requirements bölümleriyle çapraz kontrol yap.

Ekranın gösterdiği her bilgi parçası için sor:
- "Bu veri nereden geliyor? Hangi sistem ona sahip?"
- "Bu ekranın veriyi geri yazması gerekiyor mu, yoksa salt okunur mu?"
- "Bu verinin herhangi biri zamana duyarlı veya gerçek zamanlı mı? (can çubukları, bekleme süresi sayaçları)"

UI'ın oyun durumuna sahip olması veya onu yönetmesi gereken her durumu mimari bir
endişe olarak işaretle. UX spesifikasyonları UI'ın neye ihtiyaç duyduğunu tanımlar; verinin nasıl
iletileceğini dikte etmez. Bu bir mimari karardır.

Veri gereksinimlerini bir tablo olarak sun:

| Veri | Kaynak Sistem | Okuma / Yazma | Notlar |
|------|--------------|--------------|-------|
| [madde] | [sistem] | Okuma | — |
| [madde] | [sistem] | Yazma | [varsa endişe] |

---

#### Bölüm F2: Girdi Yöntemi Bütünlük Kontrol Listesi (Input Method Completeness Checklist)

Spesifikasyonun **Platform Target** satırındaki her girdi yöntemi için bir kontrol listesi bloğu —
klavye, gamepad, fare, dokunmatik; bu oyunun desteklemediği yöntemlerin bloklarını çıkar ve
bunu belirt. Maddeleri `.claude/docs/templates/ux-spec.md` dosyasının 11. bölümünden al
(ulaşılabilirlik (reachability), tab/d-pad sırası, görünür
odak, modallar için odak tuzağı, Esc/geri davranışı, tıklama hedefi boyutları, kontrolcü
bağlantısının kopması). Bir maddeyi yalnızca yukarıdaki Interaction Map onu zaten belirtiyorsa işaretle;
işaretlenmemiş bir madde açık bir uygulama sorusudur — işaretlemek yerine onu Open
Questions altında listele.

---

#### Bölüm G: Erişilebilirlik (Accessibility)

Varsa `design/accessibility-requirements.md` ile çapraz kontrol yap.

Bu ekran için ux-designer ajanının standart kontrol listesini gözden geçir:
- Tüm etkileşimli öğeler boyunca yalnızca klavyeyle gezinme yolu
- Gamepad gezinme sırası (uygulanabilirse)
- Metin kontrastı ve okunabilir minimum font boyutları
- Renkten bağımsız iletişim (hiçbir bilgi yalnızca renkle aktarılmaz)
- Metin dışı öğeler için ekran okuyucu değerlendirmeleri
- Azaltılmış hareket alternatifi gerektiren her türlü hareket veya animasyon

Bu proje için hiçbir erişilebilirlik seviyesi tanımlanmamışsa, eksikliği UX spesifikasyonunun Open Questions bölümünde not et:
> "Erişilebilirlik seviyesi henüz tanımlanmadı — başlangıç çizgisi olarak WCAG-AA'yı değerlendir. Bunun herhangi bir aşama kapısını engelleyip engellemediğini görmek için `/gate-check` çalıştır."
Sonra durmadan bir sonraki bölüme geç.

---

#### Bölüm H: Yerelleştirme Değerlendirmeleri (Localization Considerations)

Metin çevrildiğinde bu ekranın davranışını etkileyen kısıtları belgele.

**Sorulacak sorular**:
- "Bu ekrandaki en uzun metin öğeleri hangileri? Yerleşime sığan maksimum karakter sayısı nedir?"
- "Metin uzunluğunun yerleşim açısından kritik olduğu öğeler var mı — ör. tek satırda kalması gereken bir düğme etiketi?"
- "Yerele özgü biçimlendirme gerektiren sayı, tarih veya para birimi gösteren öğeler var mı?"

Not: %40'lık bir metin genişlemesinin (İngilizceden Almancaya veya Fransızcaya çevirilerde yaygındır) yerleşimi bozacağı her öğeyi işaretlemeyi hedefle. Bunları yerelleştirme mühendisi için YÜKSEK ÖNCELİKLİ olarak işaretle.

---

#### Bölüm I: Kabul Kriterleri (Acceptance Criteria)

Bir QA test uzmanının başka hiçbir tasarım dokümanını okumadan doğrulayabileceği en az 5 belirli, test edilebilir kriter yaz. Bunlar `/story-done` için geçti/kaldı koşulları olur.

**Format**: Onay kutuları kullan. Her kriter bir insan test uzmanı tarafından doğrulanabilir olmalıdır:

```
- [ ] Screen opens within [X]ms from [trigger]
- [ ] [Element] displays correctly at [minimum] and [maximum] values
- [ ] [Navigation action] correctly routes to [destination screen]
- [ ] Error state appears when [condition] and shows [specific message or icon]
- [ ] Keyboard/gamepad navigation reaches all interactive elements in logical order
- [ ] [Accessibility requirement] is met — e.g., "all interactive elements have focus indicators"
```

(Örnek kriterlerin anlamı: ekran [tetikleyici]den itibaren [X] ms içinde açılır; [öğe] [minimum] ve [maksimum] değerlerde doğru görünür; [navigasyon eylemi] doğru şekilde [hedef ekran]a yönlendirir; hata durumu [koşul] olduğunda görünür ve [belirli mesaj veya ikon] gösterir; klavye/gamepad gezinmesi tüm etkileşimli öğelere mantıklı sırayla ulaşır; [erişilebilirlik gereksinimi] karşılanır — ör. "tüm etkileşimli öğelerin odak göstergesi var".)

**Asgari gereksinimler**:
- 1 performans kriteri (yükleme/açılma süresi)
- 1 navigasyon kriteri (en az bir giriş veya çıkış yolu doğrulanmış)
- 1 hata/boş durum kriteri
- 1 erişilebilirlik kriteri (taahhüt edilen seviyeye göre)
- Bu ekranın temel amacına özgü 1 kriter

Teyit etmek için `AskUserQuestion` kullan:
- "Bu kabul kriterleri, QA sürecin için bu ekranı 'bitmiş' yapacak şeyleri kapsıyor mu?"
- Seçenekler: "Evet — bunlar sağlam", "Bir kriter daha ekle", "Birini kaldır veya yeniden ifade et"
