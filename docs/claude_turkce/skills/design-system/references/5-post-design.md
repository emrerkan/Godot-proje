# /design-system — Aşama 5: Tasarım Sonrası Doğrulama

> Bu dosya `.claude\skills\design-system\references\5-post-design.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> `/design-system`'in bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözümlenen ayarlar ve sonraki başlıklarının altındaki kurallar burada da geçerlidir.

## 5. Tasarım Sonrası Doğrulama

**Bu dosyada:**

- 5-pre: Summary'yi Yaz
- 5a: Öz Kontrol
- 5a-bis: Kreatif Direktör Temel İlke İncelemesi
- 5b: Varlık Kayıt Defterini Güncelle
- 5c: Tasarım İncelemesi Öner
- 5d: Sistem Dizinini Güncelle
- 5e: Oturum Durumunu Güncelle
- 5f: Sonraki Adımları Öner

Tüm bölümler yazıldıktan sonra:

### 5-pre: Summary'yi Yaz

`## Summary` bölümünü ve onun `> **Quick reference**` satırını şimdi yaz — tasarım
var olduktan sonra, böylece özet niyetleri değil gerçek içeriği damıtır. Bu
**her kademede** çalışır, `standard` ve gönüllü bir `minimal` GDD dahil: Summary,
sonraki bir skill'in 20 GDD'yi tarayıp hangilerini tam okuyacağına karar vermesini sağlayan şeydir
(`/create-epics`, `/architecture-review`, `/review-all-gdds` hepsi onu grep'ler), dolayısıyla
onsuz bir GDD bu tüketicileri sessizce tam okumaya geri zorlar.

- **Summary gövdesi**: 2–3 cümle — bu sistem nedir, oyuncu için ne yapar,
  bu oyunda neden var. Jargon yok; GDD'yi görmemiş bir okuyucu, bunun kendi
  işiyle ilgili olup olmadığını öğrenebilmelidir.
- **Quick reference**: `Layer` ve `Priority` sistem dizininden
  (`design/gdd/systems-index.md`); `Key deps` az önce yazılan Dependencies bölümünden
  (sistem adları veya `None`).

İskeletteki `[To be designed]` Summary yer tutucusunu değiştir. Sonra diğer her bölümde
olduğu gibi bölüm döngüsünün Write adımını uygula.

### 5a: Öz Kontrol

Tamamlanmış GDD'yi dosyadan geri oku (konuşma hafızasından değil — doğruluğun kaynağı
dosyadır). Bu adım GDD'nin tamamını gerektirir: başlıklarına göre aralıklar halinde oku
(Grep aracıyla bulunur: desen `^#`, content modu), çünkü 40 KB'ı aşan bir tüm-dosya
Read reddedilir. Şunları doğrula:
- `## Summary` ve Quick reference satırı doldurulmuş (yer tutucu değil)
- **Bu sistemin etkin kademesinde zorunlu olan** her bölümde gerçek içerik var
  (yer tutucu değil) — §1: `full`'da 8, `standard`'da 5 + koşullu Formulas,
  gönüllü `minimal`'de 5. Sabit 8 sayısına göre doğrulama yapma: `full`'un
  altında bu, doğru yazılmış bir GDD'yi eksik olarak raporlar
- Formüller tanımlanmış değişkenlere atıfta bulunuyor
- Uç durumların çözümleri var
- Bağımlılıklar arayüzleriyle birlikte listelenmiş
- Kabul kriterleri test edilebilir

### 5a-bis: Kreatif Direktör Temel İlke İncelemesi

**İnceleme modu kontrolü** — CD-GDD-ALIGN'ı başlatmadan önce uygula:
- `solo` → atla. Not: "CD-GDD-ALIGN atlandı — Solo modu." Adım 5b'ye geç.
- `lean` → atla (bir PHASE-GATE değil). Not: "CD-GDD-ALIGN atlandı — Lean modu." Adım 5b'ye geç.
- `full` → normal şekilde başlat.

GDD'yi sonlandırmadan önce, **CD-GDD-ALIGN** kapısını (`.claude/docs/director-gates/cd-gdd-align.md`) kullanarak `Agent` ile `creative-director`'ı başlat.

İlet: tamamlanmış GDD dosya yolu, oyun temel ilkeleri (`design/gdd/game-concept.md` veya `design/gdd/game-pillars.md` dosyasından; ikisi de yoksa `design/game-brief.md` dosyasının tanıtım (pitch) ve "ne hissediyorlar" satırı), MDA estetik hedefi ve GDD'nin Player Fantasy bölümü — ya da bu kademe onu yazmadıysa, bunu belirt.

Kararı `director-gates.md` içindeki standart kurallara göre ele al.
`Revise flagged items` durumunda veya bir REJECT'i çözmek için, işaretlenen her bölüm
bölüm döngüsünü yeniden çalıştırır — uzmanına o bölümün inceleme modu kontrolünün
söylediği şekilde danışılır — ve onu yazan Edit'ten önce kendi "Approve the [Section Name]
section?" widget'ı ile yeniden onaylanır; sonra `REVISED [date]` kaydedilir.
Bir `NOT ASSESSED` cevabı asla onay değildir: eksik girdiyi belirt, sonra
onu sağlayıp kapıyı yeniden çalıştır ya da `NOT ASSESSED` olarak kaydet.
Çözümden sonra kararı GDD Status başlığına kaydet:
`> **Creative Director Review (CD-GDD-ALIGN)**: APPROVED [date] / CONCERNS (accepted) [date] / REVISED [date] / NOT ASSESSED [date] — [missing input]`

---

### 5b: Varlık Kayıt Defterini Güncelle

Tamamlanmış GDD'yi kayda geçirilmesi gereken sistemler arası gerçekler için tara:
- İstatistikleri veya düşürdükleri (drop) eşyalar olan adlandırılmış varlıklar (düşmanlar, NPC'ler, boss'lar)
- Değerleri, ağırlıkları veya kategorileri olan adlandırılmış eşyalar
- Tanımlı değişkenleri ve çıktı aralıkları olan adlandırılmış formüller
- Birden fazla yerde değeriyle atıfta bulunulan adlandırılmış sabitler

**Önce kayıt defterinin var olduğunu kontrol et** — §2a onu *"varsa"* okur ve bu
adım aynı korumaya ihtiyaç duyar. `standard` ve altında dosya çoğu zaman
yoktur ve olmayan bir yola karşı yapılan grep hiçbir şey döndürmez; bu da
"henüz hiçbir aday kayıtlı değil" durumundan ayırt edilemez:

- **Yok** — bunu söyle ve oluşturulup oluşturulmayacağını sor:
  *"`design/registry/entities.yaml` mevcut değil. Bu [N] girdiyle
  oluşturabilir miyim?"* Kullanıcı reddederse 5b'yi atla ve kayıt defterinin
  yazılmadığını söyle — atlamayı temiz bir geçiş olarak değerlendirme.
- **Var ama boş** — her liste `[]` veya tek eşleşmeler yorum blokları içinde.
  Var olarak kabul et, adayları kaydet, ama hangi durumu bulduğunu söyle:
  *"kayıt defteri var ve boş — [N] girdinin hepsi yeni."*
  Gelen şablonun yorumları, `design/gdd/inventory.md` dosyasına atıfta bulunan ve
  gerçekçi görünen değerlere sahip (`base_inventory_slots: 20`,
  `gold_carry_limit: 9999`) tam biçimlendirilmiş örnekler içerir, bu yüzden §2a'nın kayıt defteri
  grep'leri boş bir kayıt defterinde **yorum satırları** döndürür — ve §2d de bu uydurma
  sayıları kullanıcıya *"Bu değerler kilitlidir."* diye sunar. Girdileri yorum içindeki
  bir örnekle değil, her zaman aktif bir `entities:`/`items:`/`formulas:`/`constants:`
  anahtarı altında eşleştir.
- **Var** — her aday için zaten kayıtlı olup olmadığını kontrol et:

```
Grep pattern="  - name: [candidate_name]" path="design/registry/entities.yaml"
```

Bir özet sun:
```
Registry candidates from this GDD:
  NEW (not yet registered):
    - [entity_name] [entity]: [attribute]=[value], [attribute]=[value]
    - [item_name] [item]: [attribute]=[value], [attribute]=[value]
    - [formula_name] [formula]: variables=[list], output=[min–max]
  ALREADY REGISTERED (referenced_by will be updated):
    - [constant_name] [constant]: value=[N] ← matches registry ✅
```

Sor: "`design/registry/entities.yaml` dosyasını bu [N] yeni girdiyle güncelleyebilir
ve mevcut girdiler için `referenced_by` alanını güncelleyebilir miyim?" (Dosya yoksa
ve kullanıcı oluşturulmasını onayladıysa, ifade *güncelleme* değil *oluşturma* olur ve
birleştirilecek `referenced_by` dizileri yoktur.)

Evet ise: yeni girdileri ekle ve `referenced_by` dizilerini güncelle. Mevcut
`value` / öznitelik alanlarını, önce bir çelişki olarak ortaya koymadan asla değiştirme.

Yazdıktan sonra `bash .claude/scripts/registry.sh validate` komutunu çalıştır ve devam etmeden
önce bu yazımın eklediği veya değiştirdiği bir girdiyle ilgili her satırı düzelt (bir DUPLICATE,
STATUS veya LAYOUT satırı ya da adını verdiği bir yol için PATH_MISSING satırı); diğer
girdilerle ilgili satırları sorulmadan düzeltmek yerine kullanıcıya bildir. Script
yoksa veya hiçbir şey yazdırmıyorsa, kayıt defteri kontrolünün çalışmadığını söyle, sonra
yazdığın girdileri dosyanın başlığındaki kurallara göre yeniden oku.

### 5c: Tasarım İncelemesi Öner

Bir tamamlanma özeti sun:

> **GDD Tamamlandı: [System Name]**
> - Yazılan bölümler: [liste]
> - Geçici varsayımlar: [tasarlanmamış bağımlılıklar hakkındaki varsayımları listele]
> - Bulunan sistemler arası çelişkiler: [liste veya "yok"]

> **Bu GDD'yi doğrulamak için yeni bir Claude Code oturumu açın ve şunu çalıştırın:**
> `/design-review design/gdd/[system-name].md`
>
> **`/design-review`'u asla `/design-system` ile aynı oturumda çalıştırmayın.** İnceleyen
> agent, yazım bağlamından bağımsız olmalıdır. Burada çalıştırmak tüm tasarım geçmişini
> devralır ve bağımsız eleştiriyi imkânsız kılar.

**`/design-review`'u aynı oturum içinde çalıştırmayı ASLA önerme.** Kullanıcıyı her zaman yeni bir pencereye yönlendir.

### 5d: Sistem Dizinini Güncelle

GDD tamamlandıktan sonra (ve isteğe bağlı olarak incelendikten sonra):

**Önce sistem dizininin var olduğunu kontrol et.** §2a onu `minimal`'de atlar çünkü o
kademede hiç yazılmaz ve bu adım §5b ile aynı korumaya ihtiyaç duyar. Bu en çok,
`system_overrides` yükseltmesi olan `minimal` bir projede önemlidir; orada etkin kademe
`standard` veya `full`'dur ve §5'teki başka hiçbir şey dosyanın olmayabileceğini ima etmez.

- **Yok** — bunu tek satırda söyle (*"bu iş akışı kademesinde `design/gdd/systems-index.md`
  yok; güncellenecek bir şey yok"*) ve §5e'ye geç. Bir tane oluşturmayı **önerme**:
  o dosya `/map-systems`'e aittir ve burada yazılacak bir taslak, tam olarak tek bir
  sistemi listeleyen bir sistem dizini olurdu.
- **Var** — devam et:

- Sistem dizinini bölüm bölüm oku: ihtiyacın olan başlıkları
  Grep aracıyla bul (desen `^#`, content modu) ve o aralıkları
  offset ve limit ile Read et
- Hedef sistemin satırını güncelle:
  - design-review çalıştırıldıysa ve karar APPROVED ise: Status → "Approved"
  - design-review çalıştırıldıysa ve karar NEEDS REVISION veya MAJOR REVISION NEEDED ise: Status → "Needs Revision" (tam olarak bu metin — `/design-review` "In Review" durumunu yalnızca revizyonlar uygulandıktan sonra ayarlar)
  - design-review atlandıysa: Status → "Designed" (inceleme bekliyor)
  - Kullanıcı "Önce kendim inceleyeceğim" seçeneğini seçtiyse: Status → "Designed"
  - Design Doc: `design/gdd/[system-name].md` dosyasına bağlantı
- Progress Tracker sayılarını güncelle

Sor: "Sistem dizinini `design/gdd/systems-index.md` konumunda güncelleyebilir miyim?"

### 5e: Oturum Durumunu Güncelle

`production/session-state/active.md` dosyasını şunlarla güncelle:
- Task: [system-name] GDD
- Status: Complete (veya design-review çalıştırıldıysa In Review)
- File: design/gdd/[system-name].md
- Sections: [gerçekten yazılan bölümleri adlarıyla listele] — **asla sabit bir
  sayı değil**; §5a `/8`'e göre doğrulamayı yasaklar ve aynı mantık onu kaydetmek
  için de geçerlidir. `full`'un altında doğru yazılmış bir GDD'nin 8'den az bölümü vardır
  ve oturum durumuna "8'inin hepsi yazıldı" yazmak, sonraki okuyucunun tamamlanmış
  bir GDD'yi eksik sanmasına yol açar
- Next: [tasarım sırasından bir sonraki sistemi öner]

### 5f: Sonraki Adımları Öner

`AskUserQuestion` kullan:
- "Sırada ne var?"
  - Seçenekler:
    - "`/consistency-check` çalıştır — bu GDD'nin değerlerinin mevcut GDD'lerle çelişmediğini doğrula (bir sonraki sistemi tasarlamadan önce önerilir)"
    - "Bir sonraki sistemi tasarla ([next-in-order])" — tasarlanmamış sistemler kaldıysa
    - "İnceleme bulgularını düzelt" — design-review sorun işaretlediyse
    - "Bu oturum için burada dur"
    - "`/gate-check` çalıştır" — yeterli sayıda MVP sistemi tasarlandıysa

---
