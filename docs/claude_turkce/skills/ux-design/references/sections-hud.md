> Bu dosya `.claude\skills\ux-design\references\sections-hud.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> Bölüm yazım rehberliği; `/ux-design` tarafından YALNIZCA AKTİF MOD için yüklenir.
> Diğer ikisini asla yükleme — her çağrıda tek bir mod geçerlidir.

# Bölüm Rehberliği — HUD Tasarımı Modu

**Bu dosyada:**

- Bölüm A: HUD Felsefesi
- Bölüm B: Bilgi Mimarisi
- Bölüm C: Yerleşim Bölgeleri
- Bölüm D: HUD Öğesi Spesifikasyonları
- Bölüm E–L: HUD Durumları, Bilgi Hiyerarşisi, Görsel Bütçe, Geri Bildirim ve Bildirim, Platform Uyarlaması, Erişilebilirlik, Ayar Düğmeleri, Kabul Kriterleri

HUD tasarımı, UX spesifikasyonu modundan farklı bir sıra izler. Felsefeyle başla;
bilgi mimarisi tamamlanana kadar yerleşime dokunma.

#### Bölüm A: HUD Felsefesi

Kullanıcıdan, oyunun ekrandaki bilgiyle ilişkisini 1-2 cümleyle
tarif etmesini iste.

Yardımcı olması için çerçeveleme örnekleri sun:
- "Neredeyse HUD'suz — atmosfer engelsiz bir sürükleyicilik gerektirir (ör. Hollow Knight, Firewatch)"
- "Minimal ama mevcut — yalnızca kritik bilgi görünür, geri kalan her şey bağlamsal (ör. Dark Souls)"
- "Bilgi yoğun — karar için gerekli tüm veriler her zaman görünür (ör. Diablo IV, StarCraft II)"
- "Uyarlanabilir — HUD yoğunluğu çatışma durumuna, keşif moduna, menülere tepki verir (ör. God of War)"

Bu felsefe, sonraki her HUD kararı için tasarım kısıtı haline gelir.
Önerilen bir öğe belirtilen felsefeyle çelişirse, o çelişkiyi görünür kıl.

---

#### Bölüm B: Bilgi Mimarisi

Bunu herhangi bir yerleşim çalışmasından önce tamamla. Atlama.

**Adım 1 — Tam bilgi envanteri**:
Aşama 2'de toplanan GDD UI Requirements bölümlerindeki tüm bilgileri çek.
Tam listeyi sun: "Bunlar, oyun sistemlerinin ekranda oyuncuya iletmeleri gerektiğini
söyledikleri şeylerin tamamı."

**Adım 2 — Kategorilendirme**:
Her madde için kullanıcıdan onu kategorilendirmesini iste:

| Kategori | Açıklama |
|----------|-------------|
| **Must Show (Mutlaka Göster)** | Her zaman görünür, oyuncu temel kararlar için buna ihtiyaç duyar |
| **Contextual (Bağlamsal)** | Yalnızca ilgili olduğunda görünür (çatışmada, etkileşimli bir nesnenin yakınında vb.) |
| **On Demand (İstek Üzerine)** | Oyuncu aktif olarak istemelidir (açma/kapama, tuşu basılı tutma) |
| **Hidden (Gizli)** | Dünya/ses aracılığıyla iletilir, asla ekranda metin olarak değil |

Maddeleri hepsini birden değil, 3-4'lük gruplar halinde ele almak için `AskUserQuestion` kullan.
Bu, HUD'daki en sonuç doğurucu tasarım kararıdır — acele etme.

**Çelişki kontrolü**: Bilgi felsefesi (Bölüm A) "neredeyse HUD'suz" diyorsa
ama Must Show listesi uzuyorsa, çelişkiyi açıkça görünür kıl:
> "Mevcut Must Show listesinde [N] madde var. Bu, HUD'suz felsefeyle
> çelişebilir. Seçenekler: Must Show listesini azaltmak, felsefeyi revize etmek veya
> HUD'un keşifte olmadığı, çatışmada bulunduğu karma bir yaklaşım tanımlamak."

---

#### Bölüm C: Yerleşim Bölgeleri

Yerleşim bölgelerini ancak bilgi mimarisi onaylandıktan sonra tasarla.

Yerleşimi şunlara dayandır:
- Hangi maddelerin Must Show olduğu (kalıcı bölge kararlarını bunlar belirler)
- Oynanış sırasında oyuncunun dikkatinin doğal olarak nereye gittiği (aksiyon oyunlarında ekranın ortası,
  strateji oyunlarında köşeler)
- Platform ve en-boy oranı hedefleri

2-3 bölge düzeni sun. HUD felsefesine ve Bölüm B'deki
kategorilendirmeye dayalı gerekçe ekle.

---

#### Bölüm D: HUD Öğesi Spesifikasyonları

Yerleşimdeki her öğe için şunları belirt:
- Öğe adı ve kategorisi (Must Show / Contextual / On Demand)
- Gösterilen içerik
- Görsel biçim (çubuk, sayı, ikon, sayaç, harita)
- Güncelleme davranışı (gerçek zamanlı, olay güdümlü, oyuncu sorgulamalı)
- Bağlamsal tetikleyici (her zaman görünür değilse)
- Animasyon davranışı (azaldığında nabız gibi atıyor mu? Yavaşça beliriyor mu? Sertçe mi giriyor?)

Öğe öğe çalış. Durum göstergeleri, kaynak çubukları veya bekleme süresi (cooldown) göstergeleri için
ilgili kalıplar varsa etkileşim kalıbı kütüphanesine atıfta bulun.

---

#### Bölüm E–L: HUD Durumları, Bilgi Hiyerarşisi, Görsel Bütçe, Geri Bildirim ve Bildirim, Platform Uyarlaması, Erişilebilirlik, Ayar Düğmeleri, Kabul Kriterleri

Bunlar UX spesifikasyonunun States, Interaction ve Accessibility bölümlerine paraleldir.
İhtiyacın olan rehberlik aşağıdadır — **`sections-ux-spec.md`'yi yükleme; her çağrıda tek bir mod
dosyası geçerlidir.** HUD için şu şekilde uygula.

**Oynanış Bağlamına Göre HUD Durumları (zaman içindeki durumlar).** En azından
keşif, çatışma, diyalog/ara sahne ve duraklatılmış durumları kapsa — `/ux-review` dördünü
de kontrol eder. Mutlu yolun (happy path) ötesinde, oynanış ortasında HUD'u neyin değiştirdiğini
yakala ve onay için bir tablo olarak sun:

| Durum / Varyant | Tetikleyici | Ne Değişir |
|-----------------|---------|--------------|
| Varsayılan (Default) | Normal oyun | — |
| Düşük kaynak (Low-resource) | Can/mermi vb. eşiğin altında | [öğe nabız gibi atar, renk değiştirir, …] |
| Boş / veri yok (Empty / no-data) | Öğenin gösterecek bir şeyi yok | [gizli veya yer tutucu] |
| [vb.] | [tetikleyici] | [değişiklikler] |

Özellikle şunu sor: oynanış ortasında HUD yoğunluğunun değişmesine ne sebep oluyor
(çatışma vs. keşif), ve her geçişte ne kayboluyor, nabız gibi atıyor veya sertçe beliriyor?

**Bilgi Hiyerarşisi.** HUD Element Specifications içindeki her öğeye bir
öncelik seviyesi ver — MUST KEEP (mutlaka kalsın), SHOULD KEEP (kalması iyi olur), CAN HIDE (gizlenebilir) veya ALWAYS HIDE (her zaman gizle) — gerekçesiyle birlikte,
ve gizlendiğinde bilgisini neyin taşıdığını (bir ses, oyun dünyası içi (diegetic) bir işaret veya
hiçbir şey). Bu, aşağıdaki Görsel Bütçe'nin öğeleri düşürme sırasıdır.

**Görsel Bütçe.** Aynı anda görünebilecek maksimum HUD öğesi sayısını ve
HUD'un kaplayabileceği maksimum ekran payını belirt; ayrıca bir durum bunu aşacaksa
önce hangi öğelerin düşürüleceğini belirt.

**Geri Bildirim ve Bildirim Sistemleri.** Her geçici bildirim türü için bir satır
(eşya alma, XP kazanma, görev güncellemesi, başarım) — tetikleyen sistem, ekran konumu,
süre, aynı anda maksimum sayı, öncelik ve **kuyruk davranışı**: ikisi aynı anda
geldiğinde ne olur, hangileri çatışma sırasında bekletilir ve hangileri asla kuyruğa alınmaz.
`/ux-review`, her bildirimin kuyruk/öncelik davranışının tanımlandığını kontrol eder.

**Platform Uyarlaması.** Mobil/konsol farklı öğe boyutları veya konumları gerektiriyor mu?
Platform başına geçersiz kılmaları not et — dokunma hedefleri, güvenli alan boşlukları (safe-area insets) ve
belirli bir platformda herhangi bir öğenin yer değiştirip değiştirmediği veya kaldırılıp kaldırılmadığı.

**Erişilebilirlik.** Varsa `design/accessibility-requirements.md` ile çapraz kontrol yap,
sonra HUD için şu kontrol listesini gözden geçir:
- Etkileşimli her HUD öğesi için gamepad/klavye odak sırası
- Oynanış mesafesinde metin kontrastı ve okunabilir minimum font boyutları
- Renkten bağımsız iletişim (hiçbir durum yalnızca renkle aktarılmaz — düşük can
  işareti yalnızca kırmızı olmamalıdır)
- Nabız gibi atan/yanıp sönen her HUD animasyonu için azaltılmış hareket alternatifi
- Metin dışı göstergeler için ekran okuyucu değerlendirmeleri

Bu proje için hiçbir erişilebilirlik seviyesi tanımlanmamışsa, eksikliği HUD
tasarımının Open Questions bölümünde not et (WCAG-AA makul bir başlangıç çizgisidir) ve
durmadan devam et.

**Ayar Düğmeleri (Tuning Knobs).** Oyuncunun ayarlayabileceği her HUD ayarını listele — genel ölçek,
opaklık, öğe başına göster/gizle, altyazı boyutu — aralığı ve varsayılan değeriyle birlikte.

**Kabul Kriterleri.** Bir QA test uzmanının başka bir doküman okumadan doğrulayabileceği
en az 5 onay kutulu kriter — `/story-done` HUD story'lerini bunlara göre kapatır.
En azından şunları kapsa: her hedef platformda güvenli alan kenar boşlukları, yukarıdaki her
oynanış bağlamında doğru öğeler, görsel bütçe (keşifte ve çatışmada ekran payı),
taahhüt edilen seviye için bir erişilebilirlik kriteri ve bildirim kuyruklama.
`.claude/docs/templates/hud-design.md` dosyasının 12. bölümünde
çözümlü örnekler var.
