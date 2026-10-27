---
name: art-bible
description: "Sanat İncilini (Art Bible) yaz — varlık (asset) üretimini kapılayan görsel kimlik. /map-systems'ten önce çalıştır."
argument-hint: "[--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Agent, AskUserQuestion, Bash(bash "*/.claude/skills/art-bible/../../hooks/yaml-helper.sh" resolve_config *)
model: sonnet
---

> Bu dosya `.claude/skills/art-bible/SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys review_mode,automation,workflow,docs.density`

Yukarıda çözümlendi — olduğu gibi kullan; `--review`, `review_mode`'u geçersiz kılar. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar.

# Sanat İncili (Art Bible)


## Aşama 0: Argümanları Ayrıştır ve Bağlamı Kontrol Et


Tam kontrol kalıbı için `.claude/docs/director-gates.md` dosyasına bak. Tek tek kapı (gate) tanımları `.claude/docs/director-gates/[gate-id].md` içinde durur — başlatılan ajan kendi kapı dosyasını okur; üst oturumda (parent session) onu okuma.


Her `AskUserQuestion` çağrısı `.claude/docs/automation-modes.md` kurallarına uyar
(collaborative her zaman sorar · guided sadece büyük kararlarda sorar · autonomous kaydeder ve devam eder;
`automation_always_ask` kategorileri her zaman sorulur).

**`docs.density`** — bölüm başına *derinliği* kontrol eder; `workflow` ise hangi bölümlerin
var olacağını kontrol eder. `modes.rigor` ikisini birlikte ayarlar; sadece derinliği değiştirmek için
`docs.density`'yi açıkça ayarla: `terse` (varsayılan, `rigor: minimal` üzerinden) = her bölüm kısıtlar +
referanslardan oluşan madde işaretli bir liste; `balanced` = her görsel seçimi açıklayan paragraflar
(`rigor: standard`); `thorough` = stil keşifleri, referanslar ve her seçim için gerekçe içeren tam düzyazı.
Yazdığın her bölüme bunu uygula.

**`workflow`** (bkz. `.claude/docs/workflow-modes.md`):
- `full` — 9 sanat incili bölümünün tamamı zorunludur.
- `standard` — sadece projede görsel varlık hikâyeleri (visual asset stories) varsa zorunludur;
  zorunlu olduğunda en az 1–4 arası bölümler gerekir. `workflow_overrides.art_bible_strict:
  true`, seviyeden bağımsız olarak 9 bölümün tamamını zorunlu kılar.
- `minimal` — zorunlu değildir. Yine de isteğe bağlı olarak çalıştırılabilir.

`design/gdd/game-concept.md` dosyasını oku — ya da `rigor: minimal`'da onun yerini alan tek sayfalık
özet `design/game-brief.md`'yi. Bölüm bölüm oku: ihtiyacın olan başlıkları Grep aracıyla bul
(desen `^#`, content modu) ve o aralıkları offset ve limit ile Read et. İkisi de yoksa şu mesajla başarısız ol:
> "No game concept found. Run `/brainstorm` first — the art bible is authored after the game concept is approved."
> (Türkçesi: "Oyun konsepti bulunamadı. Önce `/brainstorm` çalıştır — sanat incili, oyun konsepti onaylandıktan sonra yazılır.")

game-concept.md'den şunları çıkar (özetten ise: çalışma adı, tanıtım cümlesi (pitch), "Kimin için /
ne hissediyorlar" satırı ve "Sanat ve ses yönü" satırı — özette sütunlar, Görsel
Kimlik Çapası veya platform yoktur):
- Oyun adı (çalışma adı)
- Çekirdek fantezi (core fantasy) ve asansör tanıtımı (elevator pitch)
- Oyun sütunları (game pillars) (hepsi)
- Varsa **Visual Identity Anchor** (Görsel Kimlik Çapası) bölümü (brainstorm Aşama 4'teki art-director çıktısından)
- Hedef platform (belirtilmişse)

**Sonradan tamamlama (retrofit) modu tespiti**: `design/art/art-bible.md` için Glob yap. Dosya varsa,
durum tablosunu **belgeyi okumadan** oluştur — sadece *eksik* bölümleri yazacaksın,
dolayısıyla tamamlanmış olanları yüklemek tam olarak dokunmayacağın şeyi yüklemek demektir:

```
Grep pattern="^## " path="design/art/art-bible.md" output_mode="content" -n
Grep pattern="\[To be designed\]|\[TBD\]|\[To be written\]|^_?TODO" path="design/art/art-bible.md" output_mode="content" -n
```

- İlk grep bölüm başlıklarını ve satır numaralarını verir — art arda gelen başlıklar
  arasındaki fark o bölümün boyutudur.
- İkincisi yer tutucu (placeholder) işaretlerini ve nereye düştüklerini verir.
- Bir bölüm, bir sonraki başlığa kadar anlamlı bir mesafesi varsa ve içinde yer tutucu
  işareti yoksa **Complete** (Tamamlanmış); aralığına bir işaret düşüyorsa **Placeholder** (Yer tutucu);
  art arda gelen başlıklar bitişikse **Empty** (Boş) sayılır.
- İki grep bir bölümü gerçekten belirsiz bırakırsa, *sadece o bölümün* satır aralığını
  `Read(offset, limit)` ile oku — asla dosyanın tamamını değil.
- Bir bölüm durum tablosu oluştur:

```
Section | Status
--------|--------
1. Visual Identity Statement | [Complete / Empty / Placeholder]
2. Mood & Atmosphere | ...
3. Shape Language | ...
4. Color System | ...
5. Character Design Direction | ...
6. Environment Design Language | ...
7. UI/HUD Visual Direction | ...
8. Asset Standards | ...
9. Reference Direction | ...
```

- Bu tabloyu kullanıcıya sun:
  > "Found existing art bible at `design/art/art-bible.md`. [N] sections are complete, [M] need content. I'll work on the incomplete sections only — existing content will not be touched."
  > (Türkçesi: "`design/art/art-bible.md` konumunda mevcut bir sanat incili bulundu. [N] bölüm tamamlanmış, [M] bölümün içeriğe ihtiyacı var. Sadece eksik bölümler üzerinde çalışacağım — mevcut içeriğe dokunulmayacak.")
- Sadece Durumu Empty veya Placeholder olan bölümler üzerinde çalış. Zaten tamamlanmış bölümleri yeniden yazma.

Dosya yoksa, bu sıfırdan bir yazım oturumudur. Onaylanan ilk bölüm, dosyayı
`.claude/docs/templates/art-bible.md` şablonundan oluşturur; şablondaki dokuz `## N. Name`
başlığı, retrofit modunun okuduğu başlıklardır — önce sor:
"May I create `design/art/art-bible.md` from the art bible template?" (Türkçesi: "`design/art/art-bible.md` dosyasını sanat incili şablonundan oluşturabilir miyim?")
Ardından onaylanan her bölüm kendi `[To be designed]` satırını `Edit` ile değiştirir;
başlıkları şablondaki gibi koru.

**Bir bölümün onayı, yazımını da belirler.** Her bölüm, onaylama seçeneği `[A] Lock this in and write it to
design/art/art-bible.md` olan bir `AskUserQuestion` ile onaylanır (Bölüm 1'in tam seçenek listesi aşağıdadır).
Bu seçeneği seçmek o bölümü yazma onayıdır; ister sıfırdan ister retrofit olsun, hiçbir bölüm bu onay olmadan yazılmaz.

Varlık standardı kısıtları için performans bütçelerini ve motoru çıkar: `project.yaml`'dan `performance.*` ve `engine.name` değerlerini oku; eksik veya boş olan her anahtar için (`project.yaml`'da hiç `performance` veya `engine` bloğu olmadığı durum dahil) `.claude/docs/technical-preferences.md` dosyasına geri dön.

---

## Aşama 1: Çerçeveleme

Herhangi bir şey yazmadan önce oturum bağlamını sun ve iki soru sor:

İki sekmeli bir `AskUserQuestion` kullan:
- **"Scope"** (Kapsam) sekmesi — "Which sections need to be authored today?" (Bugün hangi bölümlerin yazılması gerekiyor?)
  Seçenekler: `Full bible — all 9 sections` / `Visual identity core (sections 1–4 only)` / `Asset standards only (section 8)` / `Resume — fill in missing sections`

  **Çözümlenen `workflow` seviyesinin gerçekten gerektirdiği seçeneği
  (Recommended) olarak işaretle ve nedenini söyle** — seviye bunu zaten belirliyor ve kullanıcının
  cevap vermek için seviye tablosunu bilmesi gerekmemeli:
  - `full` → **Full bible** — bu seviyede 9 bölümün hepsi zorunludur.
  - `standard` → **Visual identity core (sections 1–4 only)** — bir sanat incili hiç gerekiyorsa
    belgelenmiş asgari budur. Şunu söyle: "Sections 1–4
    are what `standard` requires; 5–9 are available if you want them." (Türkçesi: "1–4 arası bölümler `standard`'ın gerektirdiğidir; 5–9 istersen mevcuttur.")
  - `minimal` → sanat incili gerekmez. Sormadan önce bunu söyle ve varsayılan olarak 9'a gitmek yerine
    1–4 arası bölümleri "istersen faydalı" seçenek olarak sun.
  - `workflow_overrides.art_bible_strict: true` → seviyeden bağımsız olarak **Full bible**.

  Bu, bu skill'deki en büyük maliyet kolu: yazılan her bölüm bir uzman ajan başlatma
  (spawn) gerektirir; dolayısıyla seviyenin 4 bölüm istediği yerde 9 bölüm yazmak, aşağı akışta
  hiçbir şeyin kontrol etmeyeceği çıktılar için çalışmayı iki katından fazla uzatır.
- **"References"** (Referanslar) sekmesi — "Do you have reference games, films, or art that define the visual direction?" (Görsel yönü tanımlayan referans oyunların, filmlerin veya sanat eserlerinin var mı?)
  (Serbest metin — kullanıcının belirli adlar yazmasına izin ver. Burada hazır seçenek SUNMA.)

game-concept.md'de bir Visual Identity Anchor bölümü varsa, bunu belirt:
> "Found a visual identity anchor from brainstorm: '[anchor name] — [one-line rule]'. I'll use this as the foundation for the art bible."
> (Türkçesi: "Brainstorm'dan bir görsel kimlik çapası bulundu: '[çapa adı] — [tek satırlık kural]'. Bunu sanat incilinin temeli olarak kullanacağım.")

**Sadece seçilen kapsamdaki bölümleri yaz.** Aşama 2–4 yalnızca kapsam içindeki
bölümleri çalıştırır — `Resume` için retrofit tablosundaki Empty ve Placeholder satırları —
ve diğer her bölümü ve hiç bölümü kalmayan her aşamayı atlar.
Aşama 6, bu çalışmada yazılmayan her bölümü ve nedenini belirtir.

---

## Aşama 2: Görsel Kimlik Temeli (Bölüm 1–4)

Bu dört bölüm çekirdek görsel dili tanımlar. **Diğer tüm bölümler bunlardan türer.** Bir sonrakine geçmeden önce her birini yaz ve dosyaya kaydet.

> **Bu aşama için ajan başlatma politikası.** Bölüm 1 tek başına devredilir — temel
> niteliktedir ve kullanıcı, başka herhangi bir şey onun üzerine kurulmadan önce çapa yönleri
> arasında seçim yapar. Ardından Bölüm 2–4 üç değil **tek** bir `art-director`
> çağrısıyla devredilir: aynı ajan aynı girdileri alır (Görsel
> Kimlik Beyanı + sütunlar) ve ruh hali, şekil ve renk birbirine bağımlıdır —
> bir sanat yönetmeni bunları ayrı ayrı değil birlikte tanımlar. Ayrı çağrılar,
> ajandan az önce yazdığı şekil dilini bilmeden renk hakkında akıl yürütmesini isterdi.
>
> **Bu, uzman katılımının azaltılması değildir** — her bölüm hâlâ
> uzman tarafından yazılır; `.claude/docs/effects-map.md`'nin sanat incili devrinin zorunlu
> olduğu hakkındaki vurgusu da tam olarak budur. Aynı üç bölüm için üç yerine tek çağrıdır.
> Bölüm başına kullanıcı onayı ve hemen dosyaya yazma değişmez.

### Bölüm 1: Görsel Kimlik Beyanı (Visual Identity Statement)

**Hedef**: Görsel belirsizliği çözen tek satırlık bir görsel kural ve onu destekleyen 2–3 ilke.

game-concept.md'den gelen bir görsel çapa varsa: onu sun ve sor:
- "Build directly from this anchor?" (Doğrudan bu çapa üzerine mi kuralım?)
- "Revise it before expanding?" (Genişletmeden önce revize edelim mi?)
- "Start fresh with new options?" (Yeni seçeneklerle sıfırdan mı başlayalım?)

**Ajan devri (ZORUNLU)**: `Agent` ile `art-director` başlat:
- Sağla: oyun konsepti (asansör tanıtımı, çekirdek fantezi), tüm sütun seti, hedef platform, Aşama 1 çerçevelemesinden gelen referans oyunlar/sanat, varsa görsel çapa
- Sor: "Draft a Visual Identity Statement for this game. Provide: (1) a one-line visual rule that could resolve any visual decision ambiguity, (2) 2–3 supporting visual principles, each with a one-sentence design test ('when X is ambiguous, this principle says choose Y'). Anchor all principles directly in the stated pillars — each principle must serve a specific pillar. (From a one-page brief, which has no pillars, anchor them in its pitch and "what they feel" line.)"
  (Türkçesi: "Bu oyun için bir Görsel Kimlik Beyanı taslağı hazırla. Şunları sağla: (1) herhangi bir görsel karar belirsizliğini çözebilecek tek satırlık bir görsel kural, (2) her biri tek cümlelik bir tasarım testi içeren ('X belirsiz olduğunda, bu ilke Y'yi seç der') 2–3 destekleyici görsel ilke. Tüm ilkeleri doğrudan belirtilen sütunlara bağla — her ilke belirli bir sütuna hizmet etmeli. (Sütunu olmayan tek sayfalık bir özetten çalışıyorsan, ilkeleri onun tanıtım cümlesine ve "ne hissediyorlar" satırına bağla.)")

art-director'ın taslağını kullanıcıya sun. `AskUserQuestion` kullan:
- Seçenekler: `[A] Lock this in and write it to design/art/art-bible.md` / `[B] Revise the one-liner` / `[C] Revise a supporting principle` / `[D] Describe my own direction`
  (Türkçesi: [A] Bunu kesinleştir ve design/art/art-bible.md'ye yaz / [B] Tek satırı revize et / [C] Bir destekleyici ilkeyi revize et / [D] Kendi yönümü tarif edeyim)

Onaylanan bölümü hemen dosyaya yaz.

### Bölüm 2: Ruh Hali ve Atmosfer (Mood & Atmosphere)

**Hedef**: Oyun durumuna göre duygusal hedefler — bir aydınlatma sanatçısının üzerinde çalışabileceği kadar somut.

Her büyük oyun durumu için (ör. keşif, çatışma, zafer, yenilgi, menüler — bu oyunun durumlarına uyarla) şunları tanımla:
- Birincil duygu/ruh hali hedefi
- Aydınlatma karakteri (günün saati, renk sıcaklığı, kontrast seviyesi)
- Atmosferik tanımlayıcılar (3–5 sıfat)
- Enerji seviyesi (çılgınca / ölçülü / düşünceli / vb.)

**Bölüm 2–4 için ajan devri — tek çağrı, burada yapılır.** Kesinleşmiş Görsel Kimlik Beyanı ve sütun setiyle
`Agent` üzerinden `art-director` başlat ve üç bölümün hepsini tek bir talimatla iste:

1. **Ruh hali ve atmosfer** — "Define mood and atmosphere targets for each major game state in this game. Be specific — 'dark and foreboding' is not enough. Name the exact emotional target, the lighting character (warm/cool, high/low contrast, time of day direction), and at least one visual element that carries the mood. Each game state must feel visually distinct from the others."
   (Türkçesi: "Bu oyundaki her büyük oyun durumu için ruh hali ve atmosfer hedeflerini tanımla. Somut ol — 'karanlık ve uğursuz' yeterli değil. Tam duygusal hedefi, aydınlatma karakterini (sıcak/soğuk, yüksek/düşük kontrast, günün saati yönü) ve ruh halini taşıyan en az bir görsel öğeyi belirt. Her oyun durumu diğerlerinden görsel olarak ayrışmalı.")
2. **Şekil dili** — "Define the shape language for this game. Connect each shape principle back to the visual identity statement and a specific game pillar. Explain what these shape choices communicate to the player emotionally."
   (Türkçesi: "Bu oyunun şekil dilini tanımla. Her şekil ilkesini görsel kimlik beyanına ve belirli bir oyun sütununa bağla. Bu şekil seçimlerinin oyuncuya duygusal olarak ne ilettiğini açıkla.")
3. **Renk sistemi** — "Design the color system for this game. Every semantic color assignment must be explained — why does this color mean danger/safety/reward in this world? Identify which color pairs might fail colorblind players and specify what backup cues are needed."
   (Türkçesi: "Bu oyunun renk sistemini tasarla. Her anlamsal renk ataması açıklanmalı — bu renk bu dünyada neden tehlike/güvenlik/ödül anlamına geliyor? Hangi renk çiftlerinin renk körü oyuncular için başarısız olabileceğini belirle ve hangi yedek ipuçlarının gerektiğini belirt.")

Üçünün **birbiriyle tutarlı** olmasını şart koş — palet ruh hali hedeflerine ve şekil hiyerarşisine
hizmet etmeli — ve her biri ayrı ayrı onaylanıp yazılabilsin diye üç ayrı etiketli blok halinde döndürülmesini iste.

Ardından **Bölüm 2**'yi kullanıcıya sun, onaylat ve Bölüm 3'e geçmeden önce hemen dosyaya yaz.
Üçünü birden sunma: toplu işlem (batching) devirde yapılır, incelemede değil.

### Bölüm 3: Şekil Dili (Shape Language)

**Hedef**: Bu oyunun dünyasını görsel olarak tutarlı ve ayırt edilebilir kılan geometrik söz dağarcığı.

Şunları kapsa:
- Karakter silüet felsefesi (küçük resim (thumbnail) boyutunda ne kadar okunabilir? Her arketip için ayırt edici özellik?)
- Ortam geometrisi (köşeli/kavisli/organik/geometrik — hangisi baskın ve neden?)
- UI şekil grameri (UI dünya estetiğini yansıtıyor mu, yoksa ayrı bir HUD dili mi?)
- Kahraman şekiller ve destekleyici şekiller (gözü ne çeker, ne geride kalır?)

**Taslak kaynağı**: Bölüm 2 altında yapılan Bölüm 2–4 devri — onun döndürdüğü
şekil dili bloğunu kullan. Tekrar ajan başlatma.

Onaylanan bölümü hemen dosyaya yaz.

### Bölüm 4: Renk Sistemi (Color System)

**Hedef**: Hem estetik hem iletişim ihtiyaçlarına hizmet eden, eksiksiz ve üretilebilir bir palet sistemi.

Şunları kapsa:
- Birincil palet (rolleriyle 5–7 renk — sadece hex kodları değil, her rengin bu dünyada ne anlama geldiği)
- Anlamsal renk kullanımı (kırmızı neyi iletir? Altın? Mavi? Beyaz? Renk söz dağarcığını oluştur)
- Biyom veya bölge başına renk sıcaklığı kuralları (oyunda ayrı bölgeler varsa)
- UI paleti (dünya paletinden farklı olabilir — farkı açıkça tanımla)
- Renk körlüğü güvenliği: hangi anlamsal renklerin şekil/ikon/ses yedeğine ihtiyacı var

**Taslak kaynağı**: Bölüm 2 altında yapılan Bölüm 2–4 devri — onun döndürdüğü
renk sistemi bloğunu kullan. Tekrar ajan başlatma.

Onaylanan bölümü hemen dosyaya yaz.

---

## Aşama 3: Üretim Kılavuzları (Bölüm 5–8)

Bu bölümler görsel kimliği somut üretim kurallarına dönüştürür. Bir dış kaynak (outsourcing) ekibinin ek bilgilendirme olmadan takip edebileceği kadar somut olmalıdırlar.

### Bölüm 5: Karakter Tasarım Yönü (Character Design Direction)

**Bölüm 5–6 için ajan devri — tek çağrı, burada yapılır.** Her iki bölüm de
**aynı girdiyle aynı ajana** (`sections 1–4`) ihtiyaç duyar; ikinci bir çağrı sadece
tüm görsel kimliği yeniden göndermek olurdu. `art-director`'ı 1–4 arası bölümlerle
bir kez başlat ve ikisini birden iste:

1. **Karakter tasarım yönü** — "Cover: visual archetype for the player character (if any), distinguishing feature rules per character type (how do players tell enemies/NPCs/allies apart at a glance?), expression/pose style targets (stiff/expressive/realistic/exaggerated), and LOD philosophy (how much detail is preserved at game camera distance?)."
   (Türkçesi: "Şunları kapsa: oyuncu karakteri için görsel arketip (varsa), karakter tipine göre ayırt edici özellik kuralları (oyuncular düşmanları/NPC'leri/müttefikleri bir bakışta nasıl ayırt eder?), ifade/poz stili hedefleri (katı/ifadeli/gerçekçi/abartılı) ve LOD felsefesi (oyun kamerası mesafesinde ne kadar detay korunur?).")
2. **Ortam tasarım dili** — "Cover: architectural style and its relationship to the world's culture/history, texture philosophy (painted vs. PBR vs. stylized — why this choice for this game?), prop density rules (sparse/dense — what drives the choice per area type?), and environmental storytelling guidelines (what visual details should tell the story without text?)."
   (Türkçesi: "Şunları kapsa: mimari stil ve dünyanın kültürü/tarihiyle ilişkisi, doku felsefesi (boyanmış mı, PBR mı, stilize mi — bu oyun için neden bu seçim?), dekor nesnesi (prop) yoğunluğu kuralları (seyrek/yoğun — bölge tipine göre seçimi ne belirler?) ve çevresel hikâye anlatımı yönergeleri (hangi görsel detaylar hikâyeyi metinsiz anlatmalı?).")

Karakterlerin ve ortamların **birbirine karşı okunabilir** olmasını şart koş — bir
karakter silüeti, aynı talimatın tanımladığı ortam doku yoğunluğuna karşı okunabilmeli.
İki ayrı etiketli blok döndürülsün.

Önce **Bölüm 5**'i sun, onaylat, dosyaya yaz, sonra Bölüm 6.

### Bölüm 6: Ortam Tasarım Dili (Environment Design Language)

**Taslak kaynağı**: Bölüm 5 altında yapılan Bölüm 5–6 devri — onun döndürdüğü
ortam bloğunu kullan. Tekrar ajan başlatma.

Onaylanan bölümü dosyaya yaz.

### Bölüm 7: UI/HUD Görsel Yönü (UI/HUD Visual Direction)

**Ajan devri**: Paralel olarak başlat:
- **`art-director`**: UI için görsel stil — diegetik (oyun dünyasının içinde) ve ekran-uzayı (screen-space) HUD karşılaştırması, tipografi yönü (font kişiliği, kalınlık, boyut hiyerarşisi), ikonografi stili (düz/dış hatlı/illüstrasyon/fotogerçekçi), UI öğeleri için animasyon hissi
- **`ux-designer`**: UX uyum kontrolü — görsel yön, bu oyunun gerektirdiği etkileşim kalıplarını destekliyor mu? Sanat yönü ile okunabilirlik/erişilebilirlik ihtiyaçları arasındaki çatışmaları işaretle.

İkisini de topla. Çatışırlarsa (ör. art-director ayrıntılı diegetik UI istiyor ama ux-designer bunun çatışma okunabilirliğini düşüreceğini işaretliyor), çatışmayı her iki tarafın pozisyonuyla açıkça ortaya koy. Sessizce ÇÖZME — kullanıcının karar vermesi için `AskUserQuestion` kullan.

Onaylanan bölümü dosyaya yaz.

### Bölüm 8: Varlık Standartları (Asset Standards)

**Ajan devri**: Paralel olarak başlat:
- **`art-director`**: Dosya formatı tercihleri, adlandırma kuralı yönü, doku çözünürlüğü kademeleri, LOD seviyesi beklentileri, dışa aktarma (export) ayarları felsefesi
- **`technical-artist`**: Motora özgü katı kısıtlar — varlık kategorisi başına poligon sayısı bütçeleri, doku bellek sınırları, malzeme yuvası (material slot) sayıları, içe aktarıcı (importer) kısıtları, performans bütçelerinden gelen her şey (`project.yaml`'daki `performance.*`, yoksa `.claude/docs/technical-preferences.md`)

Herhangi bir sanat tercihi teknik bir kısıtla çatışırsa (ör. art-director 4K doku istiyor ama performans bütçesi mobil için 2K gerektiriyor), çatışmayı her iki pozisyonla açıkça ortaya koy — ideal standart ve kısıtlı standart, ve aradaki ödünleşim (tradeoff). Sessizce ÇÖZME — kullanıcının seçmesi için `AskUserQuestion` kullan (seçenekler: ideal standart, kısıtlı standart veya ikisini de belgele ve varlık bazında muhakemeye bırak). Varlık standartlarındaki belirsizlik, üretim maliyetlerinin doğduğu yerdir.

Onaylanan bölümü dosyaya yaz.

---

## Aşama 4: Referans Yönü (Bölüm 9)

**Hedef**: Her kaynaktan neyin alınacağı ve neyden kaçınılacağı konusunda net olan, özenle seçilmiş bir referans seti.

**Ajan devri**: Tamamlanmış 1–8 arası bölümlerle `Agent` üzerinden `art-director` başlat. Sor: "Compile a reference direction for this game. Provide 3–5 reference sources (games, films, art styles, or specific artists). For each: name it, specify exactly what visual element to draw from it (not 'the general aesthetic' — a specific technique, color choice, or compositional rule), and specify what to explicitly avoid or diverge from (to prevent the 'trying to copy X' reading). References should be additive — no two references should be pointing in exactly the same direction."
(Türkçesi: "Bu oyun için bir referans yönü derle. 3–5 referans kaynak sağla (oyunlar, filmler, sanat stilleri veya belirli sanatçılar). Her biri için: adını ver, ondan tam olarak hangi görsel öğenin alınacağını belirt ('genel estetik' değil — belirli bir teknik, renk seçimi veya kompozisyon kuralı) ve açıkça neyden kaçınılacağını veya neyden ayrılınacağını belirt ('X'i kopyalamaya çalışıyor' algısını önlemek için). Referanslar birbirini tamamlamalı — hiçbir iki referans tam olarak aynı yönü göstermemeli.")

Onaylanan bölümü dosyaya yaz.

---

## Aşama 5: Sanat Yönetmeni Onayı (Art Director Sign-Off)

**İnceleme modu kontrolü** — AD-ART-BIBLE'ı başlatmadan önce uygula:
- `solo` → atla. Not düş: "AD-ART-BIBLE skipped — Solo mode." Ardından atlamayı kaydet
  (aşağıda) ve Aşama 6'ya geç.
- `lean` → atla (bir PHASE-GATE değil). Not düş: "AD-ART-BIBLE skipped — Lean mode."
  Ardından atlamayı kaydet (aşağıda) ve Aşama 6'ya geç.
- `full` → normal şekilde başlat.

Her iki atlama durumunda da "May I record the skipped sign-off in
`design/art/art-bible.md`'s header?" (Türkçesi: "Atlanan onayı `design/art/art-bible.md` başlığına kaydedebilir miyim?") diye sor ve evet cevabında başlıktaki
`> **Art Director Sign-Off (AD-ART-BIBLE)**: [Not yet reviewed]` satırını
`> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED [date] — [solo|lean] mode`
ile değiştir — kapı her iki biçimi de kaydedilmiş bir onay olarak kabul eder.

Tüm bölümler tamamlandıktan sonra (veya Aşama 1'deki kapsamlı set tamamlandıktan sonra), **AD-ART-BIBLE** kapısını (`.claude/docs/director-gates/ad-art-bible.md`) kullanarak `Agent` üzerinden `art-director` başlat.

Şunları ilet: sanat incili yolu (`design/art/art-bible.md`); oyun sütunları ve çekirdek
fantezi; platform ve performans kısıtları (`project.yaml`'dan `platform.*` ve
`performance.*`, yoksa `.claude/docs/technical-preferences.md`); ve görsel kimlik çapası.
Aşama 0 tek sayfalık özeti okuduysa, onun tanıtım cümlesini ve "ne hissediyorlar" satırını
sütunlar ve fantezi olarak, "Sanat ve ses yönü" satırını da çapa olarak ilet.

Kararı `director-gates.md` içindeki standart kurallara göre ele al.
`Revise flagged items` durumunda veya bir REJECT'i çözmek için, bölümün kendi uzmanı
— `art-director`, Bölüm 7 için `ux-designer` ile ve Bölüm 8 için `technical-artist` ile —
işaretlenen her bölümü yeniden taslak haline getirir; bu bölüm de `REVISED [date]` kaydedilmeden
önce diğer bölümler gibi sunulur, onaylanır ve yazılır.
`NOT ASSESSED` cevabı asla bir onay değildir: eksik girdiyi adlandır, ardından
onu sağlayıp kapıyı yeniden çalıştır veya `NOT ASSESSED` olarak kaydet.
Kararı sanat incilinin durum başlığına kaydet:
`> **Art Director Sign-Off (AD-ART-BIBLE)**: APPROVED [date] / CONCERNS (accepted) [date] / REVISED [date] / NOT ASSESSED [date] — [missing input]`

---

## Aşama 6: Kapanış

Önce, dokuz bölümden bu çalışmada yazılmayan her birini ve nedenini belirt — seçilen
kapsamın dışında mı, yoksa zaten tamamlanmış mı — ör. *"Not authored this run: sections
5–9 (outside the chosen scope; `standard` requires 1–4)."* (Türkçesi: "Bu çalışmada yazılmadı: 5–9 arası bölümler (seçilen kapsamın dışında; `standard` 1–4'ü gerektirir).")
Bölüm 4'ten sonra duran bir çalışma, bitmiş bir incil gibi görünmemelidir.

Sonraki adımları sunmadan önce proje durumunu kontrol et:
- `design/gdd/systems-index.md` var mı? → map-systems yapılmış, o seçeneği atla
- Bir motor yapılandırılmış mı — `project.yaml`'da `engine.name` var mı, veya `.claude/docs/technical-preferences.md`'de yapılandırılmış bir Engine alanı (`[TO BE CONFIGURED]` değil) var mı? → setup-engine yapılmış, o seçeneği atla
- `design/gdd/` herhangi bir `*.md` dosyası içeriyor mu? → design-system çalıştırılmış, o seçeneği atla
- `design/gdd/gdd-cross-review-*.md` var mı? → review-all-gdds yapılmış
- GDD'ler var mı (yukarıdaki kontrol)? → /consistency-check seçeneğini ekle

Sonraki adımlar için `AskUserQuestion` kullan. Sadece yukarıdaki durum kontrolüne göre gerçekten sıradaki olan seçenekleri ekle:

`workflow: minimal`'da havuz `/create-stories` (henüz hikâye yoksa) veya
`/dev-story [next story]` artı Burada dur seçeneğinden oluşur — aşağıdaki GDD/mimari havuzu
yalnızca `standard`/`full` içindir.

**Seçenek havuzu — sadece henüz yapılmamışsa ekle:**
- `[_] Run /map-systems — decompose the concept into systems before writing GDDs` (systems-index.md varsa atla) — (Türkçesi: GDD'leri yazmadan önce konsepti sistemlere ayrıştır)
- `[_] Run /setup-engine — configure the engine (asset standards may need revisiting after engine is set)` (motor yapılandırılmışsa atla) — (Türkçesi: motoru yapılandır; motor ayarlandıktan sonra varlık standartlarının yeniden gözden geçirilmesi gerekebilir)
- `[_] Run /design-system — start the first GDD` (herhangi bir GDD varsa atla) — (Türkçesi: ilk GDD'yi başlat)
- `[_] Run /review-all-gdds — cross-GDD consistency check (required before Technical Setup gate)` (gdd-cross-review-*.md varsa atla) — (Türkçesi: GDD'ler arası tutarlılık kontrolü; Teknik Kurulum kapısından önce zorunlu)
- `[_] Run /asset-spec — generate per-asset visual specs and AI generation prompts from approved GDDs` (GDD'ler varsa ekle) — (Türkçesi: onaylı GDD'lerden varlık başına görsel şartnameler ve yapay zekâ üretim istemleri oluştur)
- `[_] Run /consistency-check — scan existing GDDs against the art bible for visual direction conflicts` (GDD'ler varsa ekle) — (Türkçesi: mevcut GDD'leri görsel yön çatışmaları için sanat inciline karşı tara)
- `[_] Run /create-architecture — author the master architecture document (next Technical Setup step)` — (Türkçesi: ana mimari belgesini yaz; bir sonraki Teknik Kurulum adımı)
- `[_] Stop here` — (Türkçesi: Burada dur)

A, B, C… harflerini sadece gerçekten eklenen seçeneklere ata. Hattı (pipeline) en mantıklı şekilde ilerleten seçeneği `(recommended)` olarak işaretle.

> **Her zaman ekle** (yalnızca `standard`/`full`) `/create-architecture` ve Burada dur seçeneklerini — sanat incili tamamlandıktan sonra bunlar her zaman geçerli sonraki adımlardır.

---

## İşbirliği Protokolü (Collaborative Protocol)

**`collaborative` modunda (varsayılan) geçerlidir.** `guided` ve
`autonomous` modları için `.claude/docs/automation-modes.md` dosyasına bak — aşağıdaki kurallar
collaborative modun neyi gerektirdiğini anlatır, evrensel davranışı değil.

Her bölüm şu akışı izler: **Soru → Seçenekler → Karar → Taslak (art-director ajanından) → Onay → Dosyaya yaz**

- Hiçbir bölümün taslağını asla kendin hazırlama — her bölümün içeriği
  ilgili uzmandan gelir. Bir devir birden fazla bölümü kapsayabilir (2–4 tek
  çağrıyı paylaşır, 5–6 da öyle), ancak hiçbir bölüm bir ajanın değil de
  orkestratörün kendi muhakemesiyle yazılamaz.
- Her bölümü onaydan hemen sonra dosyaya yaz — **yazımları veya onayları**
  toplu yapma. Toplu işlem sadece devir çağrısı için geçerlidir; kullanıcı yine de
  her seferinde bir bölüm görür, onaylar ve kaydeder.
- Tüm ajan anlaşmazlıklarını kullanıcıya göster — art-director ile technical-artist arasındaki çatışmaları asla sessizce çözme
- Sanat incili bir kısıt belgesidir: görsel tutarlılık karşılığında gelecekteki kararları kısıtlar. Her bölüm, çözüm uzayını verimli bir şekilde daraltıyormuş gibi hissettirmelidir.

---

## Önerilen Sonraki Adımlar

Sanat incili onaylandıktan sonra:
- GDD'leri yazmadan önce konsepti oyun sistemlerine ayrıştırmak için `/map-systems` çalıştır
- Motor henüz yapılandırılmadıysa `/setup-engine` çalıştır (motor seçiminden sonra varlık standartlarının yeniden gözden geçirilmesi gerekebilir)
- Sistem başına GDD yazmaya başlamak için `/design-system [first-system]` çalıştır
- GDD'ler oluştuktan sonra onları sanat incilinin görsel kurallarına karşı doğrulamak için `/consistency-check` çalıştır
- Ana mimari belgesini üretmek için `/create-architecture` çalıştır
