---
paths:
  - "design/gdd/**"
---

> Bu dosya `.claude/rules/design-docs.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# Tasarım Belgesi Kuralları

- 8 GDD (oyun tasarım belgesi) bölümü şunlardır: Overview (Genel Bakış), Player Fantasy (Oyuncu Fantezisi), Detailed Rules (Ayrıntılı Kurallar), Formulas (Formüller), Edge Cases (Uç Durumlar), Dependencies (Bağımlılıklar), Tuning Knobs (Ayar Düğmeleri), Acceptance Criteria (Kabul Kriterleri)
- **Kaç tanesinin zorunlu olduğu `modes.workflow`'a bağlıdır** — `full` seviyesinde 8'inin tümü, `standard` seviyesinde 5 tanesi (+ sistem **sayısal kurallar tanımlıyorsa** Formulas: oranlar, eğriler, eşikler, maliyetler, hasar, düşme ağırlıkları — bir dengeleme turunun ayarlayacağı her şey), `minimal` seviyesinde hiçbiri (orada tasarım kaydı `design/game-brief.md`'dir). Bir bölümü eksik diye işaretlemeden önce seviyeyi belirle; bkz. `.claude/docs/workflow-modes.md`
- **Formulas testi, sistemin ne olarak adlandırıldığına değil, neyi tanımladığına bakar.** Bir sistemin `systems-index.md` içindeki `Category` değeri bir ipucudur — `Gameplay`, `Economy` ve `Progression` neredeyse her zaman bu koşulu sağlar — ama asla testin kendisi değildir. Formulas'ı bir kategori belirtecine bağlama: `/map-systems`'in yazdığı kategoriler (`Core · Gameplay · Progression · Economy · Persistence · UI · Audio · Narrative · Meta`) `combat` ya da `AI` içermez; bunlar `Gameplay` *içindeki* örnek sistemlerdir. Bu kuralı belirten her yer aynı testi belirtmelidir.
- **Bölüm adı takma adı**: GDD şablonu ve `/design-system` bu bölümü `## Detailed Design` olarak yazar; tasarım standardı ise ona **Detailed Rules** der. Bunlar AYNI zorunlu bölümdür — iki başlığı da kabul et ve asla birini diğerine dönüştürerek yeniden yazma.
- Formüller değişken tanımlarını, beklenen değer aralıklarını ve örnek hesaplamaları içermelidir
- Uç durumlar sadece "düzgünce ele al" demekle yetinmemeli, ne olacağını açıkça belirtmelidir
- Bağımlılıklar çift yönlü olmalıdır — A sistemi B'ye bağımlıysa, B'nin belgesi A'dan bahsetmelidir
- Ayar düğmeleri güvenli aralıkları ve hangi oynanış yönünü etkilediklerini belirtmelidir
- Kabul kriterleri test edilebilir olmalıdır — bir QA test uzmanı geçti/kaldı sonucunu doğrulayabilmelidir
- Geçiştirme yok: "sistem iyi hissettirmeli" geçerli bir belirtim değildir
- Denge değerleri kaynak formüllerine ya da gerekçelerine bağlanmalıdır
- Tasarım belgeleri MUTLAKA adım adım yazılmalıdır: önce iskeleti oluştur, sonra
  bölümler arasında kullanıcı onayı alarak her bölümü tek tek doldur. Kararları kalıcı
  hale getirmek ve bağlamı (context) yönetmek için onaylanan her bölümü hemen dosyaya yaz
