> Bu dosya `.claude\skills\ux-design\references\3-file-skeleton.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# /ux-design — Bölüm 3: Dosya İskeletini Oluştur

> `/ux-design`'ın bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözülen ayarlar ve sonraki başlıklarındaki kurallar burada da geçerlidir.

## 3. Dosya İskeletini Oluştur

**Bu dosyada:**

- UX Spesifikasyonu İskeleti (ekran veya akış)
- HUD Tasarımı İskeleti
- Etkileşim Kalıbı Kütüphanesi İskeleti
- Erişilebilirlik Gereksinimleri İskeleti

Kullanıcı onayladığında, çıktı dosyasını boş bölüm başlıklarıyla **hemen**
oluştur. Bu, artımlı yazmaların bir hedefi olmasını ve çalışmanın kesintilerden sağ çıkmasını sağlar.

Sor: "İskelet dosyasını `design/ux/[filename].md` konumunda oluşturabilir miyim?" — ancak
`accessibility` modunda yol `design/accessibility-requirements.md`'dir
(Bölüm 1'deki mod tablosuna bakın; kasıtlı olarak `design/ux/` altında değildir).

---

### UX Spesifikasyonu İskeleti (ekran veya akış)

```markdown
# UX Spec: [Screen/Flow Name]

> **Status**: In Design
> **Author**: [user + ux-designer]
> **Last Updated**: [today's date]
> **Journey Phase(s)**: [from context]
> **Platform Target**: [target platforms and input methods from 2h]
> **Template**: UX Spec

---

## Purpose & Player Need

[To be designed]

---

## Player Context on Arrival

[To be designed]

---

## Navigation Position

[To be designed]

---

## Entry & Exit Points

[To be designed]

---

## Layout Specification

### ASCII Wireframe

[To be designed]

### Layout Zones

[To be designed]

### Component Inventory

[To be designed]

### Information Hierarchy

[To be designed]

---

## States & Variants

[To be designed]

---

## Interaction Map

[To be designed]

---

## Data Requirements

[To be designed]

---

## Events Fired

[To be designed]

---

## Transitions & Animations

[To be designed]

---

## Input Method Completeness Checklist

[To be designed]

---

## Accessibility

[To be designed]

---

## Localization Considerations

[To be designed]

---

## Acceptance Criteria

[To be designed]

---

## Open Questions

[To be designed]
```

---

### HUD Tasarımı İskeleti

```markdown
# HUD Design

> **Status**: In Design
> **Author**: [user + ux-designer]
> **Last Updated**: [today's date]
> **Platform Targets**: [target platforms and input methods from 2h]
> **Template**: HUD Design

---

## HUD Philosophy

[To be designed]

---

## Information Architecture

### Full Information Inventory

[To be designed]

### Categorization

[To be designed]

---

## Layout Zones

[To be designed]

---

## HUD Element Specifications

[To be designed]

---

## HUD States by Gameplay Context

[To be designed]

---

## Information Hierarchy

[To be designed]

---

## Visual Budget

[To be designed]

---

## Feedback & Notification Systems

[To be designed]

---

## Platform Adaptation

[To be designed]

---

## Accessibility

[To be designed]

---

## Tuning Knobs

[To be designed]

---

## Acceptance Criteria

[To be designed]

---

## Open Questions

[To be designed]
```

---

### Etkileşim Kalıbı Kütüphanesi İskeleti

```markdown
# Interaction Pattern Library

> **Status**: In Design
> **Author**: [user + ux-designer]
> **Last Updated**: [today's date]
> **Template**: Interaction Pattern Library

---

## Overview

[To be designed]

---

## Pattern Catalog

[To be designed]

---

## Patterns

[Individual pattern entries added here as they are defined]

---

## Gaps & Patterns Needed

[To be designed]

---

## Open Questions

[To be designed]
```

---

### Erişilebilirlik Gereksinimleri İskeleti

Bölüm listesi `.claude/docs/templates/accessibility-requirements.md` ile aynıdır — şablona
bir bölüm eklenir veya çıkarılırsa, bu iskelet onu izler; tersi değil.

```markdown
# Accessibility Requirements

> **Status**: In Design
> **Author**: [user + ux-designer]
> **Last Updated**: [today's date]
> **Template**: Accessibility Requirements

## Accessibility Tier Definition

[To be designed]

---

## Visual Accessibility

[To be designed]

---

## Motor Accessibility

[To be designed]

---

## Cognitive Accessibility

[To be designed]

---

## Auditory Accessibility

[To be designed]

---

## Platform Accessibility API Integration

[To be designed]

---

## Per-Feature Accessibility Matrix

[To be designed]

---

## Accessibility Test Plan

[To be designed]

---

## Known Intentional Limitations

[To be designed]

---

## Audit History

[To be designed]

---

## External Resources

[To be designed]

---

## Open Questions

[To be designed]
```

> **Kapıya bağlı olan kısım seviye taahhüdüdür.** `gate-pre-production.md`, dosyanın
> *bir erişilebilirlik seviyesi taahhüt edilmiş olarak* var olmasını gerektirir ve
> `gate-production.md` bu seviyenin her önemli ekran spesifikasyonunda ele alındığını kontrol eder.
> Tier Definition bölümü hâlâ `[To be designed]` olan bir iskelet glob'u karşılar
> ama kapıyı karşılamaz — önce o bölümü yaz.

---

İskeleti yazdıktan sonra `production/session-state/active.md` dosyasını şunlarla güncelle:
- Task: Designing [screen/flow name] UX spec
- Current section: Starting (skeleton created)
- File: design/ux/[filename].md (veya `accessibility` modunda `design/accessibility-requirements.md`)

---
