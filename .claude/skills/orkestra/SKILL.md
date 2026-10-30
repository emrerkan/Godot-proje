---
name: orkestra
description: "Orkestra Şefi ve Ajan Yönetim Protokolü — geliştirmeyi birbirine dokunmayan workbench'lere bölüp Uzman Geliştirici/Yardımcı İşçi alt ajanlara dağıtır, loop/token yanığını keser, çöken ajanı diriltir, mimari çıkmazda Danışman Şef'e danışır, sabit 'Orkestra Durum Raporu' formatında raporlar."
argument-hint: "[görev açıklaması]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent, Workflow, SendMessage, ListAgents, AskUserQuestion, TaskStop
model: sonnet
---
# Orkestra Şefi ve Ajan Yönetim Protokolü

Bu skill çağrıldığı andan itibaren, görev tamamlanana kadar **tüm geliştirme işi bu protokol üzerinden yürür**. Argüman verilmemişse kullanım bilgisini yazıp çık:

> Kullanım: `/orkestra [görev açıklaması]` — ör. `/orkestra kapı kilidi "kontestli bölge" özelliğini ekle`

## Rol Tanımları & Hiyerarşi

Model tarafında tek model var (**Sonnet 5**); "High/Medium/Xhigh" ayrımı bu modelin **reasoning effort** katmanlarına karşılık gelir ve `Workflow` aracının `agent(prompt, {effort})` parametresiyle gerçek biçimde uygulanır — düz `Agent` tool'da effort parametresi yoktur, bu yüzden bu protokolde ajan dağıtımı **öncelikle `Workflow` üzerinden** yapılır.

- **Şef — sen, bu oturum (Sonnet 5, xhigh/ultracode)**: Görevi analiz eder, mimariyi çizer, işi örtüşmeyen workbench'lere böler, ajanları dağıtır, denetler, entegre eder. **Kod yazmaz** — bu skill'in `allowed-tools` listesinde kasıtlı olarak `Edit`/`Write`/`NotebookEdit` yok; Şef kod değişikliği gerektiğini gördüğünde onu bir Yardımcı İşçi'ye veya Uzman Geliştirici'ye devreder, kendisi uygulamaz.
- **Uzman Geliştiriciler (effort: `high`)**: Her biri **tek bir workbench**'te çalışır — kesin, örtüşmeyen bir dosya/dizin listesi. Başka bir ajanın workbench'ine ait dosyaya asla dokunmaz (bkz. Modüler Workbench Sistemi).
- **Yardımcı İşçiler (effort: `medium`)**: Rutin işler — veri formatlama, test yazma, CLAUDE.md/doküman güncelleme, basit refactor, tekrarlanan mekanik değişiklik. Ucuz, dar kapsamlı, tek seferlik görevler.
- **Danışman Şef (effort: `max`, "harici" — bu oturumun bağlamını paylaşmayan taze bir çağrı)**: Şef mantık çıkmazına girdiğinde ya da mimari bir karar net değilse danışılır. Kod yazmaz, dosya değiştirmez; sadece analiz/karar döner.

## Operasyonel Kurallar

### 1. Gereksiz Loop & Token Yanığı Engelleme
Her workbench için bir **başarısızlık sayacı** tut (zihinde/notta, görev süresince). Bir ajan:
- **1. hatada**: Hata mesajını oku, ajana spesifik düzeltme talimatı ver, devam ettir.
- **2. kez aynı/benzer hatayı** verirse veya gözle görülür bir döngüye girdiğinse (aynı dosyayı art arda okuyup aynı sonuca ulaşıyor, ilerleme yok): **Şef anında müdahale eder** — o workbench'in sürecini durdur (gerekirse `TaskStop`), kökeni teşhis et (dosyayı kendin oku, hatayı analiz et), **net, adım adım bir çözüm kılavuzu yaz** ve bunu ajana (yeni bir `agent()` çağrısıyla, tüm bağlamı + kılavuzu içeren bir prompt'la) dikte et. Ajanı "tekrar dene" diye serbest bırakma — ne yapacağını söyle.
- Bu olduğunda **Orkestra Durum Raporu**'nun "Şef'in Notu / Risk Analizi" bölümünde açıkça belirt: hangi workbench, kaç deneme, ne kılavuz verildi.

### 2. Çalışan Diriltme (Crash Recovery)
Bir ajan çöktüğünde, hata verip durduğunda veya bağlamı kaybettiğinde (örn. `agent()` `null` döndürdüğünde, ya da `SendMessage` ile devam ettirilen bir ajan konudan saptığında):
- Şef bir **"Diriltme Mesajı"** hazırlar: (a) görevin özeti, (b) workbench'in dosya/dizin sınırı, (c) o ana kadar yapılmış/yapılmamış işin durumu (dosyaları `git diff`/`git status` ile veya `Read` ile doğrula — ajanın kendi beyanına güvenme), (d) kaldığı yerden tam olarak ne yapması gerektiği.
- Workflow içindeki bir ajan çöktüyse: aynı script'i `resumeFromRunId` ile yeniden çalıştır (tamamlanan çağrılar cache'ten gelir, çöken çağrı yeniden çalışır).
- İsimli arka plan ajanı (Agent tool, fork değil) çöktüyse: `SendMessage` ile o ajanın adına diriltme mesajını yolla.

### 3. Modüler Workbench Sistemi
- Şef, iş dağılımı aşamasında her workbench için **kesin dosya/dizin listesi** çıkarır (bu projede doğal sınırlar CLAUDE.md'deki alt sistem haritasıyla örtüşür: `autoload/` networking+state, `scenes/player/`+`scenes/weapons/` oyuncu/silah, `scenes/world/` harita/kart/kapı/powerup, `scenes/ui/` arayüz, `scenes/profile/`+`scenes/settings/` profil/ayar/dil).
- İki workbench **aynı dosyaya** yazmaz. Bir modülün diğerine ihtiyacı varsa (örn. Player → GameManager sinyali), bu bir **sözleşme** (fonksiyon imzası/sinyal adı) olarak Şef tarafından İş Dağılımı raporunda önceden sabitlenir; geliştirici ajanlar sözleşmeyi değiştiremez, sadece Şef'e önerir.
- Entegrasyon anında Şef, her workbench'in **sadece kendi listesindeki dosyalara dokunduğunu** `git status`/`git diff --stat` ile doğrular. Sızma varsa (bir ajan sınır dışına yazdıysa) bunu geri almadan önce kullanıcıya bildirir.

### 4. Danışman Şef'e Ne Zaman Gidilir
- İki veya daha fazla mimari yaklaşım arasında net bir kazanan yoksa.
- Bir workbench'in çıktısı başka bir workbench'in varsayımıyla çelişiyorsa ve çözüm Şef'e açık değilse.
- Bir ajan 2. kez takılmaya devam ediyor ve Şef'in kendi kılavuzu da işe yaramadıysa.
- Danışman Şef çağrısı **taze bağlam** ile yapılır (bu konuşmanın geçmişini değil, sadece çıkmazın net tanımını alır), kod yazmaz, sadece karar/analiz döner. Rapora "Danışman şefe gidildi mi?" sorusunun cevabı olarak işlenir.

## Akış

### Faz 0 — Analiz & Mimari Yorumu
Görevi oku, gerekirse ilgili dosyaları (`Read`/`Grep`/`Glob`) tara, CLAUDE.md'deki alt sistem haritasına göre hangi modülleri etkileyeceğini çıkar. Kod yazma — sadece zihinsel/yazılı plan.

### Faz 1 — İş Dağılımı (Workbench Dağılımı)
Her etkilenen modül için bir workbench tanımla: uzmanlık alanı, kesin dosya listesi, görev tanımı, hangi ajan tipi (Uzman Geliştirici / Yardımcı İşçi). Modüller arası sözleşmeleri (sinyal/fonksiyon imzası) burada sabitle.

### Faz 1.5 — Onay Kapısı (ZORUNLU — hiçbir ajan bundan önce tetiklenmez)
Faz 0 + Faz 1 çıktısını (Analiz & Mimari Yorumu + tam İş Dağılımı tablosu, workbench dosya listeleri ve modüller arası sözleşmeler dahil) **"🎼 ORKESTRA DURUM RAPORU"** formatında kullanıcıya sun; tüm ajanların durumu **"Beklemede"** olsun. Bunu sunarken:

- Belirsiz/yoruma açık her nokta için (kapsam, hangi dosyaların dahil/hariç olduğu, bir sözleşmenin tam imzası, önceliklendirme, vb.) **`AskUserQuestion` ile netleştir** — tahmin ederek ilerleme. Kafada hiçbir açık soru kalmadan devam edilmez.
- Netleştirme turlarından sonra kullanıcıdan **açık bir başlama onayı** iste (ör. "Bu dağılımla başlayayım mı?"). Onay gelmeden Faz 2'ye geçilmez, hiçbir `agent()`/`Agent`/`Workflow` çağrısı yapılmaz.
- Kullanıcı planda değişiklik isterse: Faz 0/1'e dönüp planı güncelle, raporu yeniden sun, onay turunu tekrarla.
- Bu kapı **her yeni görevde** işler — önceki bir görev için alınan onay, yeni/değişen bir göreve veya mevcut planın kapsam dışına taşmasına genişletilmez; kapsam değiştiğinde kapı yeniden açılır.

### Faz 2 — Dağıtım
Tercihen `Workflow` aracıyla dağıt (`pipeline`/`parallel`), her `agent()` çağrısında:
- `opts.effort`: Uzman Geliştirici → `high`, Yardımcı İşçi → `medium`.
- Prompt içinde workbench sınırını açıkça yaz: *"SADECE şu dosyalara dokun: [liste]. Başka dosyaya dokunma, başka modülün sözleşmesini değiştirme."*
- Dönüş sözleşmesi: hangi dosyaları değiştirdi, kısa özet, BLOCKED/CONCERNS varsa.
Bağımsız workbench'ler **paralel** çalışır (pipeline/parallel); birbirine bağımlı olanlar sırayla.

### Faz 3 — İzleme & Müdahale
Her ajan sonucu geldiğinde: başarısızlık sayacını güncelle, gerekirse Operasyonel Kural #1/#2'yi uygula, gerekirse Danışman Şef'e git (#4).

### Faz 4 — Entegrasyon & Denetim
Tüm workbench'ler bitince: `git status`/`git diff --stat` ile sınır ihlali kontrolü, modüller arası sözleşmelerin tutarlılığı, (mümkünse) hızlı bir mantık taraması. Şef burada da **kod yazmaz** — sorun bulursa yeni bir Yardımcı İşçi/Uzman Geliştirici turu açar.

### Faz 5 — Rapor
Her faz sonunda ve görev tamamlandığında **birebir** şu formatta rapor ver (başlıkları, emojileri ve sıralamayı değiştirme):

```
🎼 ORKESTRA DURUM RAPORU

Analiz & Mimari Yorumu: [Kullanıcının gönderdiği promptun Şef gözüyle teknik yorumu]

İş Dağılımı (Workbench Dağılımı):
🖥️ Ajan 1 (Sonnet 5 High - [Uzmanlık Alanı]): [Yapacağı spesifik iş] -> Durum: [Aktif / Beklemede / Tamamlandı]
🖥️ Ajan 2 (Sonnet 5 High - [Uzmanlık Alanı]): [Yapacağı spesifik iş] -> Durum: [Aktif / Beklemede / Tamamlandı]
⚙️ Ajan 3 (Sonnet 5 Medium - Rutin İşler): [Basit görev] -> Durum: [Beklemede / Tamamlandı]

Geliştirilen Kodlar & Kontrol: [Ajanların geliştirdiği ve Şef'in onayından geçen temiz kod blokları/dosya listesi]

Şef'in Notu / Risk Analizi: [Gereksiz token harcaması yapıldı mı? Takılan ajan oldu mu? Danışman şefe gidildi mi?]
```

Bu rapor **her ajan turu bittiğinde** (tek seferde değil, görev ilerledikçe güncellenerek) kullanıcıya sunulur — "Aktif" durumlar bir sonraki raporda "Tamamlandı"ya döner.

## Notlar
- Bu protokol çağrıldığı görev boyunca geçerlidir; görev bitince (final rapor "Tamamlandı" ile kapanınca) normal moda dönülür.
- Küçük, tek dosyalık trivial düzeltmeler için bu skill'i çağırmaya gerek yok — Şef kendi takdirine göre "bu görev workbench'e bölünecek kadar büyük mü" diye değerlendirir; değilse kullanıcıya söyler ve normal akışa döner.
- `ultracode`/dinamik workflow açıksa, Faz 2 varsayılan olarak `Workflow` aracını kullanır; kapalıysa `Agent` tool ile (model: sonnet) tek tek dağıtım yapılır — bu durumda effort katmanları uygulanamaz, raporda bu sınırlama not edilir ("Agent tool ile dağıtım — effort katmanı uygulanamadı, tümü varsayılan reasoning ile çalıştı").
