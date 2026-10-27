> Bu dosya `.claude\skills\ux-design\references\sections-patterns.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> Bölüm yazım rehberliği; `/ux-design` tarafından YALNIZCA AKTİF MOD için yüklenir.
> Diğer ikisini asla yükleme — her çağrıda tek bir mod geçerlidir.

# Bölüm Rehberliği — Etkileşim Kalıbı Kütüphanesi Modu


Kalıp kütüphanesi yazımı doğrusal değil, eklemeli ve katalog güdümlüdür.

#### Aşama 1: Mevcut Kalıpları Katalogla

`design/ux/*.md` için Glob yap (`interaction-patterns.md` hariç) ve her spesifikasyonun
Component Inventory ve Interaction Map bölümlerini oku. Kullanılan her etkileşim
kalıbını çıkar.

Çıkarılan listeyi sun: "Mevcut UX spesifikasyonlarına göre, bu kalıplar oyunda zaten
kullanılıyor:"
- [Kalıp adı]: [ekran], [ekran] içinde kullanılıyor
- [vb.]

Sor: "Var olduğunu bildiğin ama henüz mevcut spesifikasyonlarda olmayan kalıplar var mı? Ek
olanları şimdi listele."

---

#### Aşama 2: Her Kalıbı Resmileştir

Her kalıp için (mevcut veya yeni) şunları belgele:

```markdown
### [Pattern Name]

**Category**: Navigation / Input / Feedback / Data Display / Modal / Overlay / [other]
**Used In**: [list of screens]

**Description**: [One paragraph explaining what this pattern is and when to use it]

**Specification**:
- [Component behavior]
- [Input mapping]
- [Visual/audio feedback]
- [Accessibility requirements for this pattern]

**When to Use**: [Conditions where this pattern is appropriate]
**When NOT to Use**: [Conditions where another pattern is more appropriate]

**Reference**: [Screenshot path or ASCII example, if available]
```

(Şablon alanları: Kategori; Kullanıldığı Yerler; Açıklama — bu kalıbın ne olduğunu ve ne zaman kullanılacağını anlatan bir paragraf; Spesifikasyon — bileşen davranışı, girdi eşlemesi, görsel/işitsel geri bildirim, bu kalıp için erişilebilirlik gereksinimleri; Ne Zaman Kullanılır; Ne Zaman KULLANILMAZ — başka bir kalıbın daha uygun olduğu koşullar; Referans — varsa ekran görüntüsü yolu veya ASCII örneği.)

Kalıpları gruplar halinde ele al. `AskUserQuestion` kullan:
- "Bu kalıpları nasıl ele almak istersin?"
- Seçenekler: "İlk grubun taslağını mevcut spesifikasyonlardan çıkar (daha hızlı)", "Onları tek tek tanımla (daha fazla kontrol)", "En çok kullanılan kalıpla başla"

---

#### Aşama 3: Eksikleri Belirle

Bilinen kalıpları katalogladıktan sonra sor:
- "Bu kütüphanede henüz olmayan kalıplara ihtiyaç duyacak planlanmış ekranlar veya
  etkileşimler var mı?"
- "Mevcut spesifikasyonlarda birbiriyle tutarsız hissettiren ve birleştirilmesi
  gereken kalıplar var mı?"

Takip için eksikleri Gaps bölümünde belgele.
