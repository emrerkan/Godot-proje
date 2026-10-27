# /design-system — Aşama 3: Dosya İskeletini Oluştur

> Bu dosya `.claude\skills\design-system\references\3-file-skeleton.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

> `/design-system`'in bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözümlenen ayarlar ve sonraki başlıklarının altındaki kurallar burada da geçerlidir.

## 3. Dosya İskeletini Oluştur

**Bu dosyada:**

- Çözümlenen kademede hangi bölümlerin iskelete konacağı
- GDD iskeleti
- Dosyanın yazılması, ardından oturum durumu güncellemesi

Kullanıcı onayladığında, boş bölüm başlıklarıyla GDD dosyasını **hemen** oluştur.
Bu, artımlı yazımların bir hedefi olmasını sağlar.

**Yalnızca çözümlenen kademede zorunlu olan bölümleri iskelete koy** (§1):
`standard` kademede Player Fantasy ve Tuning Knobs'u çıkar (Formulas'ı ise yalnızca
sistem hiçbir sayısal kural tanımlamıyorsa — bkz. §1; kategori bir ipucudur, test değil);
`full` kademede 8'inin hepsini iskelete koy.
**Yalnızca §1'in çıkarılmış olarak belirttiği bölümler atlanır** — onlar için boş
`[To be designed]` yer tutucuları bırakma. Şablondaki diğer her bölüm, §4'ün henüz
karar vermediği bölümler de dahil, yer tutucusuyla iskelete konur.
Bu cümle yukarıdaki üç kademe çıkarımını (Player Fantasy, Tuning
Knobs ve sayısal kural olmadığında Formulas) yönetir, başka hiçbir şeyi değil: isteğe bağlı
göründüğü için bir bölümü çıkarma izni değildir ve §4, §3'ün hiç oluşturmadığı bir
bölümü dolduramaz.

`.claude/docs/templates/game-design-document.md` dosyasındaki şablon yapısını kullan:

```markdown
# [System Name]

> **Status**: In Design
> **Author**: [user + agents]
> **Last Updated**: [today's date]
> **Last Verified**: [today's date]
> **Implements Pillar**: [from context]

## Summary

[To be designed]

> **Quick reference** — Layer: `[Foundation | Core | Feature | Presentation]` · Priority: `[MVP | Vertical Slice | Alpha | Full Vision]` · Key deps: `[System names or "None"]`

## Overview

[To be designed]

## Player Fantasy

[To be designed]

## Detailed Design

### Core Rules

[To be designed]

### States and Transitions

[To be designed]

### Interactions with Other Systems

[To be designed]

## Formulas

[To be designed]

## Edge Cases

[To be designed]

## Dependencies

[To be designed]

## Tuning Knobs

[To be designed]

## Visual/Audio Requirements

[To be designed]

## Game Feel

[To be designed]

## UI Requirements

[To be designed]

## Cross-References

[To be designed]

## Acceptance Criteria

[To be designed]

## Open Questions

[To be designed]
```

Sor: "İskelet dosyasını `design/gdd/[system-name].md` konumunda oluşturabilir miyim?"

Kullanıcı reddederse: Şu mesajla dur:
> "Karar: **BLOCKED** — iskelet oluşturma reddedildi. Sonraki tüm aşamalar iskelet dosyasını temel aldığından, tasarım oturumu bu dosya olmadan devam edemez. Dosyayı oluşturmaya hazır olduğunuzda `/design-system [system]` komutunu yeniden çalıştırın."
Section A'ya geçme.

Yazdıktan sonra `production/session-state/active.md` dosyasını güncelle:
- Dosyanın var olup olmadığını kontrol etmek için Glob kullan.
- **Yoksa**: oluşturmak için **Write** aracını kullan. Var olmayabilecek bir dosyada asla Edit deneme.
- **Zaten varsa**: ilgili alanları güncellemek için **Edit** aracını kullan.

Dosya içeriği:
- Task: Designing [system-name] GDD
- Current section: Starting (skeleton created)
- File: design/gdd/[system-name].md

---
