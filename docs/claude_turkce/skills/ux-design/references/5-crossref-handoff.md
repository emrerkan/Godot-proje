> Bu dosya `.claude\skills\ux-design\references\5-crossref-handoff.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# /ux-design — Bölüm 5 ve 6: Çapraz Referans Kontrolü ve Teslim

> `/ux-design`'ın bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözülen ayarlar ve sonraki başlıklarındaki kurallar burada da geçerlidir.

## 5. Çapraz Referans Kontrolü

Spesifikasyonu incelemeye hazır olarak işaretlemeden önce şu kontrolleri çalıştır:

**1. GDD gereksinim kapsamı**: Bu ekrana atıfta bulunan her GDD UI Gereksiniminin
bu spesifikasyonda karşılık gelen bir öğesi var mı? Eksikleri sun.

**2. Kalıp kütüphanesi uyumu**: Bu spesifikasyonda kullanılan tüm etkileşim kalıplarına
adıyla atıfta bulunuluyor mu? Bu spesifikasyon oturumu sırasında yeni bir kalıp icat edildiyse,
kalıp kütüphanesine eklenmek üzere işaretle:
`AskUserQuestion` kullan:
- "Bu spesifikasyon, henüz kalıp kütüphanesinde olmayan [kalıp adı] kalıbını kullanıyor. Ne yapalım?"
- Seçenekler: "Şimdi kalıp kütüphanesine ekle", "Eksik olarak işaretle ve devam et", "Atla — bu kalıp tek seferlik"

**3. Navigasyon tutarlılığı**: Bu spesifikasyondaki giriş/çıkış noktaları, ilgili
spesifikasyonlardaki navigasyon haritasıyla eşleşiyor mu? Uyuşmazlıkları işaretle.

**4. Erişilebilirlik kapsamı**: Spesifikasyon, `design/accessibility-requirements.md`
içinde taahhüt edilen erişilebilirlik seviyesini ele alıyor mu? Almıyorsa açık soruları işaretle.

**5. Boş durumlar**: Veriye bağlı her öğenin tanımlanmış bir boş durumu (empty state) var mı?
Olmayanları işaretle.

Kontrol sonuçlarını sun:
> **Çapraz Referans Kontrolü: [Ekran Adı]**
> - GDD gereksinimleri: [M'den N tanesi kapsandı / hepsi kapsandı]
> - Kütüphaneye eklenecek yeni kalıplar: [liste veya "yok"]
> - Navigasyon uyuşmazlıkları: [liste veya "yok"]
> - Erişilebilirlik eksikleri: [liste veya "yok"]
> - Eksik boş durumlar: [liste veya "yok"]

---

## 6. Teslim (Handoff)

Tüm bölümler onaylanıp yazıldığında:

### 6a: Oturum Durumunu Güncelle

`production/session-state/active.md` dosyasını şunlarla güncelle:
- Task: [screen-name] UX spec
- Status: Complete (veya In Review)
- File: design/ux/[filename].md
- Sections: All written
- Next: [öneri]

### 6b: Sonraki Adımı Öner

Seçenekleri sunmadan önce açıkça belirt:

> "Bu spesifikasyon, uygulama hattına girmeden önce `/ux-review` ile doğrulanmalıdır.
> Production kapısı (`/gate-check production`), `workflow: full` seviyesinde
> tüm önemli ekran spesifikasyonlarının `/ux-review`'dan geçmiş olmasını gerektirir
> (`standard` seviyesinde önerilir)."

Sonra `AskUserQuestion` kullan:
- "`/ux-review [filename]` şimdi mi çalıştırılsın, yoksa önce başka bir şey mi yapalım?"
  - Seçenekler:
    - "`/ux-review`'u şimdi çalıştır — bu spesifikasyonu doğrula"
    - "Önce başka bir ekran tasarla, sonra tüm spesifikasyonları birlikte incele"
    - "Etkileşim kalıbı kütüphanesini bu spesifikasyondaki yeni kalıplarla güncelle"
    - "Bu oturum için burada dur"

Kullanıcı "Önce başka bir ekran tasarla" seçeneğini seçerse bir not ekle: "Hatırlatma:
`/gate-check production` çalıştırmadan önce tamamlanan tüm spesifikasyonlar üzerinde `/ux-review` çalıştır."

### 6c: İlgili Spesifikasyonları Çapraz Bağla

Başka UX spesifikasyonları bu ekrana bağlanıyor veya bu ekrandan bağlanılıyorsa, hangilerinin
bu spesifikasyona atıfta bulunması gerektiğini not et. Bu dosyaları sormadan düzenleme — yalnızca adlarını ver.

---
