# TacticalDark — Taktik Mühimmat & Mermi Modelleri Teknik Rehberi

Bu paket, **TacticalDark**'ın gece operasyonu ve karanlık taktik atmosferine ("Sodyum & Gece Operasyonu", 50° Top-Down kamera açısı) tam uyumlu olarak modellenmiş yüksek kaliteli 3D balistik mühimmat setini içerir.

---

## 1. Üretilen Modeller ve Dosya Listesi

Modeller `asset model/mermiler/` klasöründe yer almaktadır:

| Model Dosyası | Trus / Poly | Açıklama & Oyun İçi Kullanım Amacı |
|---|---|---|
| **`Mermi_OyunIci_Tracer_Scale.glb`** | ~1,200 | **`Bullet.tscn` İçin Optimize Edilmiş Uçan Mermi:** 50° yukarıdan bakan oyun kamerasında merminin gidişatının ve balistiğinin net izlenebilmesi için boyutlandırılmıştır. `-Z` eksenine bakar (Godot ileri yönü). Arkasında parlayan sodyum/turuncu askeri izli (tracer) yanma çekirdeği bulunur. |
| **`Mermi_Ucan_Tracer_Projectile.glb`** | ~1,200 | **1:1 Gerçek Ölçekli Uçan Çekirdek:** Sivri uçlu aerodinamik spitzer formu, boat-tail tabanı, bakır ceket ve arkada turuncu-sarı izli kor. `-Z` yönelimli. |
| **`Mermi_Tam_Fisek_762NATO.glb`** | ~2,100 | **Tam Fişek (7.62x51mm NATO):** Pirinç kovan (brass casing), dip tırnak kanalı (extractor groove), nikel kapsül (primer), kovan boğazı ve mermi çekirdeği. Haritada mühimmat sandıkları, loot drop veya UI envanter incelemeleri için. |
| **`Mermi_Bos_Kovan_762.glb`** | ~1,350 | **Boş Kovan (Spent Casing):** İçi boş kovan ağzı, iğne darbesi almış vuruk kapsül. Ateş edildiğinde silahtan fırlayan kovan parçacığı veya yerde biriken çatışma kalıntıları için. |
| **`Mermi_Taktik_Set_Showcase.glb`** | ~5,800 | Tüm modellerin neon halkalı taktik stand üzerinde sergilendiği birleşik 3D sahne modeli. |
| **`TacticalDark_Mermi_Showcase.blend`** | — | Blender 5.1 sahne dosyası (3 noktalı stüdyo aydınlatması, kameralar, PBR materyaller). |

---

## 2. Materyal ve Görsel Kimlik Özellikleri

1. **`Mat_Cartridge_Brass` (Pirinç Kovan):**
   - Metalik: `0.96`, Pürüzlülük: `0.18`.
   - Gerçek torna çizgilerini ve askeri pirinç alaşımını yansıtan zengin altın-sarı speküler parlaklık.
2. **`Mat_Bullet_Copper` (Bakır Mermi Ceketi):**
   - Metalik: `0.94`, Pürüzlülük: `0.19`.
   - Tombak/bakır kaplama kızıl-bronz aerodinamik spitzer gövde ve cannelure (sıkma) çizgisi.
3. **`Mat_Tracer_Glow` & `Mat_Tracer_Streak` (İzli Mermi Işıması):**
   - Emisyon Şiddeti: `15.0 - 18.0`.
   - Renk: Taktik sodyum kehribar / akkor turuncu (`1.0, 0.45, 0.02`).
   - Gece haritalarında (Orman, Liman, Karantina, Kuantum Laboratuvarı) ateş edildiğinde karanlık koridorları aydınlatarak gerçek bir gece çatışması hissi verir.

---

## 3. Godot 4 `Bullet.tscn` Entegrasyonu

Mevcut `scenes/weapons/Bullet.tscn` sahnesindeki beyaz ilkel küreyi (`SphereMesh`) gerçek taktik mermi modeliyle değiştirmek için:

1. `res://scenes/weapons/Bullet.tscn` sahnesini açın.
2. `MeshInstance3D` düğümünü silin veya gizleyin.
3. Yerine `res://asset model/mermiler/Mermi_OyunIci_Tracer_Scale.glb` sahnesini alt düğüm (child node) olarak ekleyin.
4. Modelin yerel rotasyonu `(0, 0, 0)` olduğunda mermi ucu doğrudan Godot'nun ileri vektörü olan **`-Z`** yönüne bakar; ek rotasyon ayarı yapılmasına gerek yoktur.

