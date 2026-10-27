---
name: ux-design
description: "Bir ekran, akış veya HUD için bölüm bölüm UX spesifikasyonu yazımı. Bağlam sağlamak için oyuncu yolculuğunu okur; ayrıca proje genelinde erişilebilirlik."
argument-hint: "[screen/flow name] or 'hud' or 'patterns' or 'accessibility'"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash "*/.claude/skills/ux-design/../../hooks/yaml-helper.sh" resolve_config *)
model: sonnet
---
> Bu dosya `.claude\skills\ux-design\SKILL.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

!`bash "${CLAUDE_SKILL_DIR}/../../hooks/yaml-helper.sh" resolve_config --keys automation,workflow,docs.density`

Yukarıda çözüldü — olduğu gibi kullan. Blok yoksa →
`.claude/docs/config-resolution.md` içindeki varsayılanlar.

# UX Design

Bu skill çağrıldığında:

Her `AskUserQuestion` çağrısı `.claude/docs/automation-modes.md`'ye uyar
(collaborative her zaman sorar · guided yalnızca büyük kararlarda · autonomous kaydeder ve devam eder;
`automation_always_ask` kategorileri her zaman sorulur).

**Yazım rehberliği**: aşağıdaki iskeletler kendi kendine yeterlidir — doğrudan onlardan
yaz. Bir bölüm derinlik gerektirdiğinde (çözümlü örnekler, kalıp katalogları,
erişilebilirlik ölçütleri), ilgili rehberde bulunur:

| Üretilen | Rehber |
|---|---|
| UX spesifikasyonu | `.claude/docs/templates/guidance/ux-spec-guide.md` |
| HUD tasarımı | `.claude/docs/templates/guidance/hud-design-guide.md` |
| Etkileşim kalıpları | `.claude/docs/templates/guidance/interaction-pattern-library-guide.md` (üç konu dosyasına yönlendirir) |
| Erişilebilirlik gereksinimleri | `.claude/docs/templates/guidance/accessibility-requirements-guide.md` |

**Bir rehberi bölüm bölüm yükle, asla tamamını değil** — her biri bölümlere göre düzenlenmiştir ve
şablonlardaki işaretçiler okunacak tam bölümü adlandırır.

**`workflow`** (bkz. `.claude/docs/workflow-modes.md`):
- `full` — her ekran için bir UX spesifikasyonu gereklidir.
- `standard` — yalnızca çekirdek ekranlar (ana menü, HUD, birincil oyun döngüsü).
- `minimal` — gerekli değil. Yine de gönüllü olarak çalıştırılabilir.

**`docs.density`** — bölüm başına *derinliği* kontrol eder; `workflow` ise
hangi ekranların spesifikasyonunun yazılacağını kontrol eder. `modes.rigor` ikisini birlikte ayarlar; yalnızca
derinliği değiştirmek için `docs.density`'yi açıkça ayarla: `terse` (varsayılan, `rigor: minimal` ile) = wireframe açıklamaları +
etkileşim maddeleri; `balanced` = wireframe'ler + akışların paragraf açıklamaları
(`rigor: standard`); `thorough` = kullanıcı araştırması özetleri ve
alternatif akış değerlendirmeleri dahil tam metin. Yazdığın her bölüme uygula.

## 1. Argümanları Ayrıştır ve Modu Belirle

Argümana göre dört yazım modu vardır:

| Argüman | Mod | Çıktı dosyası |
|----------|------|-------------|
| `hud` | HUD tasarımı | `design/ux/hud.md` |
| `patterns` | Etkileşim kalıbı kütüphanesi | `design/ux/interaction-patterns.md` |
| `accessibility` | Proje genelinde erişilebilirlik gereksinimleri | `design/accessibility-requirements.md` |
| Başka herhangi bir değer (ör. `main-menu`, `inventory`) | Bir ekran veya akış için UX spesifikasyonu | `design/ux/[argument].md` |
| Argüman yok | Kullanıcıya sor | (aşağıya bakın) |

> **`accessibility`, `design/ux/` dışına yazan tek moddur.** Çıktısı
> tek bir ekranın spesifikasyonu değil, ekran başına spesifikasyonların başvurduğu proje genelinde bir standarttır —
> `.claude/docs/workflow-catalog.yaml`, Pre-Production ve
> Polish kapıları ve `/architecture-review` hepsi
> `design/accessibility-requirements.md` dosyasını tam olarak bu yolda kontrol eder. Onu `design/ux/` altına
> "toparlamaya" kalkma: bu kontrollerin her biri eşleşmeyi bırakır ve
> Technical Setup → Pre-Production kapısı geçilemez hale gelir.

**Hiç argüman verilmemişse**, başarısız olma — bunun yerine sor. `AskUserQuestion` kullan:
- "Bugün ne tasarlıyoruz?"
  - Seçenekler: "Belirli bir ekran veya akış (adını ben vereceğim)", "Oyun HUD'u", "Etkileşim kalıbı kütüphanesi", "Proje genelinde erişilebilirlik gereksinimleri", "Emin değilim — karar vermeme yardım et"

Kullanıcı "adını ben vereceğim" seçeneğini seçerse veya bir ekran adı yazarsa, dosya adı için onu kebab-case'e
dönüştür (ör. "Main Menu", `main-menu` olur).

---

## 2. Bağlam Topla (Okuma Aşaması)

**Şimdi `references/2-gather-context.md` dosyasını oku ve ona uy** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında sohbet sıkıştırıldıysa (compaction) veya sürdürüldüyse tekrar oku.

## 3. Dosya İskeletini Oluştur

**Şimdi `references/3-file-skeleton.md` dosyasını oku ve ona uy** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında sohbet sıkıştırıldıysa veya sürdürüldüyse tekrar oku.

## 4. Bölüm Bölüm Yazım

**Şimdi `references/4-authoring.md` dosyasını oku ve ona uy** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında sohbet sıkıştırıldıysa veya sürdürüldüyse tekrar oku.

### Bölüm rehberliği — aktif mod için TEK dosyayı oku

Bölüm başına yazım rehberliği her mod için kendi dosyasında bulunur. **Aşama 4'e
ulaştığında, yalnızca Bölüm 1'de çözülen modla eşleşen dosyayı oku; diğer ikisini
asla yükleme.**

| Mod | Rehberlik dosyası |
|------|---------------|
| UX Spec (ekran veya akış) | `references/sections-ux-spec.md` |
| HUD Design | `references/sections-hud.md` |
| Interaction Pattern Library | `references/sections-patterns.md` |
| Accessibility Requirements | `.claude/docs/templates/guidance/accessibility-requirements-guide.md` |

> Erişilebilirlik rehberliği bu skill'in `references/` klasörü yerine `templates/guidance/` altında
> bulunur, çünkü belgelediği şablon
> (`.claude/docs/templates/accessibility-requirements.md`) `/ux-review` ve kapı dosyaları
> tarafından da kullanılır. Aynı kural geçerlidir: yalnızca yazdığın bölümü kapsayan
> kısmı yükle, asla dosyanın tamamını değil.

O dosyanın yazmanı söylediği her şeye `docs.density`'yi (Bölüm 1) uygula — bu,
hangi bölümlerin var olduğunu değil, her bölümün derinliğini kontrol eder.

## 5. Çapraz Referans Kontrolü

**Şimdi `references/5-crossref-handoff.md` dosyasını oku ve ona uy** — bu aşamanın adımları burada değil, o dosyadadır. Bu aşama sırasında sohbet sıkıştırıldıysa veya sürdürüldüyse tekrar oku.

## 7. Kurtarma ve Sürdürme

Oturum kesintiye uğrarsa (sıkıştırma, çökme, yeni oturum):

1. `production/session-state/active.md` dosyasını oku — mevcut ekranı
   ve hangi bölümlerin tamamlandığını kaydeder.
2. `design/ux/[filename].md` dosyasını oku — gerçek içeriği olan bölümler bitmiştir;
   `[To be designed]` içeren bölümlerin hâlâ çalışılması gerekir.
3. Bir sonraki tamamlanmamış bölümden devam et — tamamlananları yeniden tartışmaya gerek yok.

Artımlı (incremental) yazmanın önemli olmasının sebebi budur: onaylanan her bölüm her türlü
kesintiden sağ çıkar.

---

## 8. Uzman Ajan Yönlendirmesi

Bu skill birincil ajan olarak `ux-designer`'ı kullanır (frontmatter'da ayarlı).
Belirli alt konular için ek bağlam veya koordinasyon gerekebilir:

| Konu | Koordine edilecek |
|-------|----------------|
| Görsel estetik, renk, yerleşim hissi | `art-director` — UX spesifikasyonu bölgeleri tanımlar; sanat ise nasıl göründüklerini tanımlar |
| Uygulanabilirlik (motor kısıtları) | `ui-programmer` — bileşen envanterini kesinleştirmeden önce |
| Oynanış verisi gereksinimleri | `game-designer` — veri sahipliği belirsiz olduğunda |
| UI'da görünen anlatı/lore | `narrative-director` — atmosfer metinleri (flavor text), eşya adları, lore panelleri için |
| Erişilebilirlik seviyesi kararları | Bu oturum tarafından kaydedilir (`/ux-design accessibility`; seviyeyi kullanıcı seçer), `accessibility-specialist`'in tanımladığı ve denetlediği ölçütlere göre — bir gereksinimin ölçütü belirsiz olduğunda ona danış |

`Agent` aracıyla başka bir ajana görev devrederken:
- Şunları sağla: ekran adı, oyun konsepti özeti, uzman girdisi gerektiren belirli soru
- Ajan analizi bu oturuma döndürür
- Bu oturum ajanın çıktısını kullanıcıya sunar
- Kullanıcı karar verir; bu oturum dosyaya yazar
- Ajanlar doğrudan dosyaya YAZMAZ — tüm dosya yazmaları bu oturuma aittir

---

## İşbirlikçi Protokol

**`collaborative` modunda (varsayılan).** `guided` ve `autonomous` modları için
`.claude/docs/automation-modes.md` içindeki mod başına kurallara bakın — aşağıdaki adımlar
evrensel olarak geçerli olanı değil, collaborative modun gerektirdiğini anlatır.

Bu skill her adımda işbirlikçi tasarım ilkesine uyar:

1. Her bölüm için **Soru -> Seçenekler -> Karar -> Taslak -> Onay**
2. Her karar noktasında **AskUserQuestion** (Açıkla -> Kaydet kalıbı):
   - Aşama 2: "Başlamaya hazır mıyız, yoksa daha fazla bağlam mı gerekiyor?"
   - Aşama 3: "İskeleti oluşturabilir miyim?"
   - Aşama 4 (her bölüm): tasarım soruları, yaklaşım seçenekleri, taslak onayı
   - Aşama 5: "Çapraz referans kontrolü çalıştırılsın mı? Sırada ne var?"
3. İskeletten önce ve her bölüm yazımından önce **"[filepath] konumuna yazabilir miyim?"**
4. **Artımlı yazma**: Her bölüm onaydan hemen sonra dosyaya yazılır
5. **Oturum durumu güncellemeleri**: Her bölüm yazımından sonra

**Estetik konusunda saygı**: Yerleşim veya görsel seçimler kişisel zevke kaldığında,
seçenekleri sun ve sor. Bir yerleşimi "standart" olduğu için seçme — her zaman
teyit et. Yaratıcı direktör kullanıcıdır.

**Çelişkileri görünür kılma**: Bir GDD gereksinimi ile mevcut ekran alanı
çeliştiğinde, çelişkiyi görünür kıl ve çözüm seçenekleri sun. Bir gereksinimi asla sessizce
düşürme. Yerleşimi işaretlemeden asla sessizce genişletme.

Tam spesifikasyonu **asla** otomatik üretip olup bitmiş bir şey (fait accompli) olarak sunma.
Kullanıcı onayı olmadan **asla** bir bölüm yazma.
Mevcut onaylanmış bir UX spesifikasyonuyla çelişkiyi işaretlemeden **asla** çelişme.
Kararların nereden geldiğini (GDD gereksinimleri, oyuncu yolculuğu, kullanıcı seçimleri) **her zaman** göster.

Karar: **COMPLETE** — UX spesifikasyonu bölüm bölüm yazıldı ve onaylandı.

---

## Önerilen Sonraki Adımlar

- Bu spesifikasyonu uygulama hattına girmeden önce doğrulamak için `/ux-review [filename]` çalıştır
- Kalan ekranları veya akışları tasarlamaya devam etmek için `/ux-design [next-screen]` çalıştır
- Tüm önemli ekranların onaylanmış UX spesifikasyonları olduğunda `/gate-check production` çalıştır
