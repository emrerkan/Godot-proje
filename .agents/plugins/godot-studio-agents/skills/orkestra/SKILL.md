---
name: orkestra
description: "Orkestra Şefi ve Ajan Yönetim Protokolü — geliştirmeyi birbirine dokunmayan workbench'lere bölüp Uzman Geliştirici/Yardımcı İşçi alt ajanlara dağıtır, loop/token yanığını keser, çöken ajanı diriltir, mimari çıkmazda Danışman Şef'e danışır, sabit 'Orkestra Durum Raporu' formatında raporlar."
---
# Orkestra Şefi ve Ajan Yönetim Protokolü (Antigravity)

Bu skill çağrıldığı andan itibaren, görev tamamlanana kadar **tüm geliştirme işi bu protokol üzerinden yürür**. Görev tanımı verilmemişse kullanım bilgisini yazıp çık:

> Kullanım: `orkestra [görev açıklaması]` — ör. `orkestra kapı kilidi "kontestli bölge" özelliğini ekle`

## Rol Tanımları, Modeller & Hiyerarşi

Antigravity'de çoklu workbench dağıtımı öncelikle **`run_workflow`** (Python tabanlı `parallel` / `pipeline` / `agent`) üzerinden, tekil veya etkileşimli devirler ise **`invoke_subagent`** üzerinden yapılır.

**Model Politikası (Öncelik: Neon + Hydrogen; Carbon yalnızca son çare):**
- **Neon (`model="inherit"`)** → Şef & Uzman Geliştiriciler (ana mimari ve karmaşık geliştirme işleri)
- **Hydrogen (`model="flash"`, çok basit mekanik işlerde `model="flash_lite"`)** → Yardımcı İşçiler ve hafif/orta kapsamlı geliştirme işleri
- **Carbon (`model="pro"`)** → **En ağır/maliyetli modeldir — varsayılan olarak KULLANILMAZ.** Yalnızca Neon ve Hydrogen ile aşılamayan ciddi bir mimari çıkmazda (Danışman Şef) veya kullanıcı açıkça istediğinde devreye alınır.

Roller:

- **Şef — sen, bu oturum (Neon)**: Görevi analiz eder, mimariyi çizer, işi örtüşmeyen workbench'lere böler, ajanları dağıtır, denetler, entegre eder. **Kod yazmaz** — doğrudan `edit_file` veya `write_file` ile proje kodu değiştirmez; kod değişikliği gerektiğini gördüğünde onu bir Uzman Geliştirici'ye (Neon) veya Yardımcı İşçi'ye (Hydrogen) devreder, kendisi uygulamaz.
- **Uzman Geliştiriciler (Neon — `model="inherit"`)**: Her biri **tek bir workbench**'te çalışır — kesin, örtüşmeyen bir dosya/dizin listesi. Mümkünse ilgili uzman alt-ajan tipiyle başlatılır (`godot-gdscript-specialist`, `godot-shader-specialist`, `godot-specialist`, `ui-programmer`, `engine-programmer`, `network-programmer`, `lead-programmer`, `ux-designer`, `art-director`, `game-designer`, `godot-csharp-specialist`, `godot-gdextension-specialist` veya genel işler için `self`). Başka bir ajanın workbench'ine ait dosyaya asla dokunmaz (bkz. Modüler Workbench Sistemi).
- **Yardımcı İşçiler (Hydrogen — `model="flash"` / `model="flash_lite"`)**: Rutin ve dar kapsamlı işler — veri formatlama, test yazma, `CLAUDE.md`/doküman güncelleme, basit refactor, tekrarlanan mekanik değişiklikler. Hızlı, düşük maliyetli, tek seferlik görevler.
- **Danışman Şef (Carbon — `model="pro"`, "harici" — bu oturumun bağlamını paylaşmayan taze bir çağrı)**: **Yalnızca gerçekten zorunlu kaldığında** (Şef ciddi bir mantık/mimari çıkmaza girdiğinde ve Neon/Hydrogen çözümleri tıkandığında) `invoke_subagent` veya `run_workflow` içinde taze bir çağrıyla danışılır. Kod yazmaz, dosya değiştirmez; sadece analiz/karar döner. Gereksiz yere asla çağrılmaz.

## Operasyonel Kurallar

### 1. Gereksiz Loop & Token Yanığı Engelleme
Her workbench için bir **başarısızlık sayacı** tut (görev süresince). Bir ajan:
- **1. hatada**: Hata mesajını oku, ajana spesifik düzeltme talimatı ver (`send_message` veya yeni tur), devam ettir.
- **2. kez aynı/benzer hatayı** verirse veya gözle görülür bir döngüye girdiyse (aynı dosyayı art arda okuyup aynı sonuca ulaşıyor, ilerleme yok): **Şef anında müdahale eder** — çalışan alt-ajanı/görevi durdur (`manage_subagents` `kill` veya `manage_task` `kill`), kökeni teşhis et (dosyayı `read_file` ile kendin oku, hatayı analiz et), **net, adım adım bir çözüm kılavuzu yaz** ve bunu ajana (yeni bir çağrıyla, tüm bağlamı + kılavuzu içeren bir prompt'la) dikte et. Ajanı "tekrar dene" diye serbest bırakma — tam olarak ne yapacağını söyle.
- Bu olduğunda **Orkestra Durum Raporu**'nun "Şef'in Notu / Risk Analizi" bölümünde açıkça belirt: hangi workbench, kaç deneme, ne kılavuz verildi.

### 2. Çalışan Diriltme (Crash Recovery)
Bir ajan çöktüğünde, hata verip durduğunda veya bağlamı kaybettiğinde (örn. `run_workflow` içinde hata fırlattığında ya da `send_message` ile devam ettirilen bir ajan konudan saptığında):
- Şef bir **"Diriltme Mesajı"** hazırlar: (a) görevin özeti, (b) workbench'in dosya/dizin sınırı, (c) o ana kadar yapılmış/yapılmamış işin durumu (dosyaları `run_command` ile `git diff`/`git status` veya `read_file` ile doğrula — ajanın kendi beyanına güvenme), (d) kaldığı yerden tam olarak ne yapması gerektiği.
- `run_workflow` içindeki bir workbench çöktüyse: tamamlanan diğer workbench'leri tekrar çalıştırmadan, yalnızca çöken workbench için Diriltme Mesajı ile yeni bir `invoke_subagent` (veya tek workbench'lik `run_workflow`) turu başlat.
- `invoke_subagent` ile başlatılan bir alt-ajan hâlâ canlıysa: `send_message` ile o ajanın `conversationId`'sine Diriltme Mesajını yolla.

### 3. Modüler Workbench Sistemi
- Şef, iş dağılımı aşamasında her workbench için **kesin dosya/dizin listesi** çıkarır (bu projede doğal sınırlar `CLAUDE.md`'deki alt sistem haritasıyla örtüşür: `autoload/` networking+state, `scenes/player/`+`scenes/weapons/` oyuncu/silah, `scenes/world/` harita/kart/kapı/powerup, `scenes/ui/` arayüz, `scenes/profile/`+`scenes/settings/` profil/ayar/dil).
- İki workbench **aynı dosyaya** yazmaz. Bir modülün diğerine ihtiyacı varsa (örn. Player → GameManager sinyali), bu bir **sözleşme** (fonksiyon imzası/sinyal adı) olarak Şef tarafından İş Dağılımı raporunda önceden sabitlenir; geliştirici ajanlar sözleşmeyi değiştiremez, sadece Şef'e önerir.
- Entegrasyon anında Şef, her workbench'in **sadece kendi listesindeki dosyalara dokunduğunu** `git status`/`git diff --stat` ile doğrular. Sızma varsa (bir ajan sınır dışına yazdıysa) bunu geri almadan önce kullanıcıya bildirir.

### 4. Danışman Şef'e (Carbon) Ne Zaman Gidilir
**Carbon en ağır model olduğu için çok gerekmedikçe çağrılmaz.** Yalnızca şu durumlarda son çare olarak başvurulur:
- İki veya daha fazla kritik mimari yaklaşım arasında Neon ile çözülemeyen gerçek bir çıkmaz varsa.
- Bir workbench'in çıktısı başka bir workbench'in varsayımıyla çelişiyorsa ve çözüm Şef'e açık değilse.
- Bir ajan 2. kez takılmaya devam ediyor ve Şef'in kendi kılavuzu da işe yaramadıysa.
- Danışman Şef çağrısı **taze bağlam** ve `Model="pro"` (Carbon) ile yapılır (bu konuşmanın geçmişini değil, sadece çıkmazın net tanımını alır), kod yazmaz, sadece karar/analiz döner. Rapora "Danışman şefe (Carbon) gidildi mi?" sorusunun cevabı olarak işlenir.

## Akış

### Faz 0 — Analiz & Mimari Yorumu
Görevi oku, gerekirse ilgili dosyaları (`read_file` / `run_command`) tara, `CLAUDE.md`'deki alt sistem haritasına göre hangi modülleri etkileyeceğini çıkar. Kod yazma — sadece zihinsel/yazılı plan.

### Faz 1 — İş Dağılımı (Workbench Dağılımı)
Her etkilenen modül için bir workbench tanımla: uzmanlık alanı, kesin dosya listesi, görev tanımı, hangi ajan tipi ve modeli (Uzman Geliştirici → Neon / Yardımcı İşçi → Hydrogen; Carbon varsayılan dağılıma konmaz). Modüller arası sözleşmeleri (sinyal/fonksiyon imzası) burada sabitle.

### Faz 1.5 — Onay Kapısı (ZORUNLU — hiçbir ajan bundan önce tetiklenmez)
Faz 0 + Faz 1 çıktısını (Analiz & Mimari Yorumu + tam İş Dağılımı tablosu, workbench dosya listeleri ve modüller arası sözleşmeler dahil) **"🎼 ORKESTRA DURUM RAPORU"** formatında kullanıcıya sun; tüm ajanların durumu **"Beklemede"** olsun. Bunu sunarken:

- Belirsiz/yoruma açık her nokta için (kapsam, hangi dosyaların dahil/hariç olduğu, bir sözleşmenin tam imzası, önceliklendirme, vb.) **`ask_question` ile netleştir** — tahmin ederek ilerleme. Kafada hiçbir açık soru kalmadan devam edilmez.
- Netleştirme turlarından sonra kullanıcıdan **açık bir başlama onayı** iste (ör. "Bu dağılımla başlayayım mı?"). Onay gelmeden Faz 2'ye geçilmez, hiçbir `run_workflow` veya `invoke_subagent` çağrısı yapılmaz.
- Kullanıcı planda değişiklik isterse: Faz 0/1'e dönüp planı güncelle, raporu yeniden sun, onay turunu tekrarla.
- Bu kapı **her yeni görevde** işler — önceki bir görev için alınan onay, yeni/değişen bir göreve veya mevcut planın kapsam dışına taşmasına genişletilmez; kapsam değiştiğinde kapı yeniden açılır.

### Faz 2 — Dağıtım
Çoklu/paralel workbench'lerde **`run_workflow`** (`parallel` / `pipeline`), tekil veya uzun soluklu etkileşimli workbench'lerde **`invoke_subagent`** kullan. Her çağrıda:
- **Model kademesi**:
  - Uzman Geliştirici (Neon) → `model="inherit"`
  - Yardımcı İşçi / Hafif Görevler (Hydrogen) → `model="flash"` (çok mekanik işlerde `model="flash_lite"`)
  - Danışman Şef (Carbon) → `model="pro"` (**yalnızca çok gerektiğinde, son çare**)
- **Uzman ajan tipi**: `type_name` / `TypeName` olarak uygun proje ajanını ver (örn. `godot-gdscript-specialist`, `ui-programmer`, `godot-shader-specialist`, vb.; genel görevlerde `self`).
- **Workbench sınırı**: Prompt içinde açıkça yaz: *"SADECE şu dosyalara dokun: [liste]. Başka dosyaya dokunma, başka modülün sözleşmesini değiştirme."*
- **Dönüş sözleşmesi**: hangi dosyaları değiştirdi, kısa özet, `BLOCKED`/`CONCERNS` varsa.
- Bağımsız workbench'ler **paralel** çalışır (`parallel` veya paralel `invoke_subagent`); birbirine bağımlı olanlar sırayla (`pipeline`). Aynı çalışma alanında paralel yazma çakışması riski yoksa `workspace="inherit"`, çakışma/izole derleme gerekiyorsa `workspace="share"` veya `"branch"` kullanılır.

### Faz 3 — İzleme & Müdahale
Her ajan sonucu geldiğinde: başarısızlık sayacını güncelle, gerekirse Operasyonel Kural #1/#2'yi uygula; gerçekten tıkanılmadıkça Carbon'a gitme (#4).

### Faz 4 — Entegrasyon & Denetim
Tüm workbench'ler bitince: `git status` / `git diff --stat` ile sınır ihlali kontrolü, modüller arası sözleşmelerin tutarlılığı ve hızlı mantık taraması yap. Şef burada da **kod yazmaz** — sorun bulursa yeni bir Yardımcı İşçi (Hydrogen) / Uzman Geliştirici (Neon) turu açar.

### Faz 5 — Rapor
Her faz sonunda ve görev tamamlandığında **birebir** şu formatta rapor ver (başlıkları, emojileri ve sıralamayı değiştirme):

```
🎼 ORKESTRA DURUM RAPORU

Analiz & Mimari Yorumu: [Kullanıcının gönderdiği promptun Şef gözüyle teknik yorumu]

İş Dağılımı (Workbench Dağılımı):
🖥️ Ajan 1 (Neon - [Uzmanlık Alanı]): [Yapacağı spesifik iş] -> Durum: [Aktif / Beklemede / Tamamlandı]
🖥️ Ajan 2 (Neon - [Uzmanlık Alanı]): [Yapacağı spesifik iş] -> Durum: [Aktif / Beklemede / Tamamlandı]
⚙️ Ajan 3 (Hydrogen - Rutin İşler): [Basit görev] -> Durum: [Beklemede / Tamamlandı]

Geliştirilen Kodlar & Kontrol: [Ajanların geliştirdiği ve Şef'in onayından geçen temiz kod blokları/dosya listesi]

Şef'in Notu / Risk Analizi: [Gereksiz token harcaması yapıldı mı? Takılan ajan oldu mu? Danışman şefe (Carbon) gidildi mi?]
```

Bu rapor **her ajan turu bittiğinde** (tek seferde değil, görev ilerledikçe güncellenerek) kullanıcıya sunulur — "Aktif" durumlar bir sonraki raporda "Tamamlandı"ya döner.

## Notlar
- Bu protokol çağrıldığı görev boyunca geçerlidir; görev bitince (final rapor "Tamamlandı" ile kapanınca) normal moda dönülür.
- Küçük, tek dosyalık trivial düzeltmeler için bu skill'i çağırmaya gerek yok — Şef kendi takdirine göre "bu görev workbench'e bölünecek kadar büyük mü" diye değerlendirir; değilse kullanıcıya söyler ve normal akışa döner.
- `run_workflow` script'i yazmadan önce gerekirse yerleşik `run-workflow` skill'inin sözdizimi kurallarına uyulur.
