# `.claude/` klasörü — Türkçe rehber ve değerlendirme

`.claude/` içindeki dosyalar **"Claude Code Game Studios"** adlı büyük bir şablondan indirilmiş. Şablon, bir oyun stüdyosunu
taklit eden onlarca agent ve skill'den oluşuyor; buraya bunların sadece bir kısmı gelmiş.
Bu klasörde her dosyanın **Türkçe okuma kopyası** var. Claude yine İngilizce asıllarını kullanır. Türkçe kopyalar
sadece senin ne işe yaradıklarını anlaman için.

## Türleri ne demek?

| Tür | Ne yapar | Nasıl çalışır |
|---|---|---|
| **Agent** (`agents/`) | Belirli bir uzmanlık rolü olan alt yardımcı (sanat yönetmeni, UI programcısı…) | Claude bir işi o role devrederken kullanır |
| **Rule** (`rules/`) | Belirli dosyalar düzenlenirken uyulacak kurallar | `paths:` ile eşleşen dosyalarda otomatik devreye girer |
| **Skill** (`skills/`) | Adım adım iş akışı (doküman yazma, inceleme…) | Sen `/skill-adı` yazınca ya da Claude gerekli görünce çalışır |

## Dosya dosya değerlendirme

| Dosya | Ne işe yarar | Bu projede kullanışlı mı? |
|---|---|---|
| `agents/art-director.md` | Görsel kimlik, renk paleti, sanat kitabı sahibi | **Kısmen.** Fikri kullanıldı: [docs/SANAT_KITABI.md](../SANAT_KITABI.md) yazıldı |
| `agents/ux-designer.md` | Ekran akışı, kullanıcı deneyimi | Kısmen — önce soru sorma yaklaşımı iyi |
| `agents/ui-programmer.md` | Menü/HUD kodlama kuralları | Kısmen — bazı ilkeler (UI oyun durumunu değiştirmez) zaten projede uygulanıyor |
| `agents/game-designer.md` | Oyun mekaniği/denge tasarımı | Kısmen — XP gibi sistemlerin dengelemesinde fikir verir |
| `agents/godot-shader-specialist.md` | Godot shader uzmanı | **Evet** — shader işlerinde kullanılabilir |
| `rules/shader-code.md` | `.gdshader` dosyaları için kod standartları | **Evet, aktif** — tüm `.gdshader` dosyalarına uygulanır. Yeni `MenuOverlay.gdshader` bu kurala göre yazıldı |
| `rules/ui-code.md` | UI kuralları (erişilebilirlik, yerelleştirme, gamepad) | **İçerik iyi ama devre dışı** — yolları (`src/ui/**`, Unity/Unreal) bizim `scenes/ui/` klasörümüzle eşleşmiyor. İlkeler SANAT_KITABI §7'ye taşındı |
| `rules/design-docs.md` | Tasarım dokümanı (GDD) bölüm kuralları | Şimdilik pasif — `design/gdd/` klasörü yok |
| `skills/art-bible` | Sanat kitabını bölüm bölüm, onay alarak yazdırır | Kullanılabilir, ama `design/` ve `production/` klasörlerini bekliyor. Kısa sürümü elle yazıldı |
| `skills/design-system` | Bir oyun sistemi için bölüm bölüm GDD yazdırır | Şablon klasörleri olmadan eksik çalışır |
| `skills/design-review` | Bir tasarım dokümanını inceler | Kısmen — OYUN_TASARIM_DOKUMANI.md'yi incelemek için denenebilir |
| `skills/ux-design` | Ekran/HUD için UX şartnamesi yazdırır | Şablon klasörleri olmadan eksik çalışır |
| `skills/ux-review` | UX şartnamesini erişilebilirlik vb. açısından denetler | Kısmen |
| `skills/team-ui` | Tüm UI ekibini (birden çok agent) sırayla çalıştırır | **Hayır, şimdilik** — burada olmayan başka agent'lara ve klasörlere bağlı |

## Neden çoğu "kısmen"?

Bu skill'ler şunları bekliyor ama projede yoklar:
- `design/` klasörü: `design/gdd/`, `design/art/`, `design/ux/` gibi alt klasörler.
- `production/` klasörü: `production/session-state/active.md` gibi dosyalar.
- `.claude/docs/` klasörü: şablonun yardımcı dokümanları.
- `project.yaml`: motor ve dil bilgisi.
- `docs/engine-reference/godot/`: Godot sürüm referansları.

Bunlar olmadan skill'ler çalışır ama sık sık "dosya bulunamadı" der ya da adımları atlar. İstersen şablonun eksik
parçalarını kurmayı değerlendirebiliriz. Ama bu tek kişilik bir proje için ağır bir süreç ekler: her bölüm için onay
istemek, birçok doküman yazmak gibi. Şu an daha pratik yol, bu dosyalardaki **iyi fikirleri** projenin kendi
dokümanlarına almak. Bunu yaptık: sanat kitabı, shader kuralları, erişilebilirlik notları.
