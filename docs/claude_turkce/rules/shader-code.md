---
paths:
  - "assets/shaders/**"
  - "**/*.gdshader"
  - "Assets/**/*.{shader,hlsl,cginc,compute,shadergraph}"
  - "Shaders/**"
  - "**/*.{usf,ush}"
---

> Bu dosya `.claude/rules/shader-code.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# Gölgelendirici (Shader) Kodu Standartları

Görsel kaliteyi, performansı ve platformlar arası uyumluluğu korumak için tüm
motorlardaki tüm gölgelendirici dosyaları bu standartlara uymalıdır.

## Adlandırma Kuralları
- Dosya adlandırması: `[type]_[category]_[name].[ext]`
  - `spatial_env_water.gdshader` (Godot)
  - `SG_Env_Water` (Unity Shader Graph)
  - `M_Env_Water` (Unreal Material)
- Malzemenin amacını belirten açıklayıcı adlar kullan
- Motorun gölgelendirici türünü ön ek olarak kullan — Godot'da `spatial_`, `canvas_`, `particles_`,
  `post_`; Unity'de `SG_` (Shader Graph); Unreal'da `M_`, `MI_` (örnek/instance), `MF_` (fonksiyon)

## Kod Kalitesi
- Tüm uniform'lar/parametreler açıklayıcı adlara ve uygun ipuçlarına (hint) sahip olmalıdır
- İlgili parametreleri grupla (Godot: `group_uniforms`, Unity: `[Header]`, Unreal: Category)
- Açık olmayan hesaplamalara yorum ekle (özellikle yoğun matematik içeren bölümlere)
- Sihirli sayı (magic number) yok — adlandırılmış sabitler ya da belgelenmiş uniform değerleri kullan
- Her gölgelendirici dosyasının en üstüne yazar ve amaç bilgisini içeren bir yorum ekle

## Performans Gereksinimleri
- Her gölgelendirici için hedef platformu ve karmaşıklık bütçesini belgele
- Uygun hassasiyet kullan: tam hassasiyetin gerekmediği yerlerde mobilde `half`/`mediump`
- Fragment gölgelendiricilerinde doku örneklemelerini en aza indir
- Fragment gölgelendiricilerinde dinamik dallanmadan kaçın — `step()`, `smoothstep()` ve
  `mix()` (Godot, GLSL) ya da `lerp()` (HLSL: Unity, Unreal) kullan
- Döngüler içinde doku okuması yok
- Bulanıklık efektleri için iki geçişli yaklaşım (önce yatay, sonra dikey)

## Platformlar Arası
- Gölgelendiricileri minimum özellikli hedef donanımda test et
- Daha düşük kalite seviyeleri için yedek/basitleştirilmiş sürümler sağla
- Gölgelendiricinin hangi render hattını (render pipeline) hedeflediğini belgele (Forward/Deferred, URP/HDRP, Forward+/Mobile/Compatibility)
- Farklı render hatlarına ait gölgelendiricileri aynı dizinde karıştırma

## Varyant Yönetimi
- Gölgelendirici varyantlarını en aza indir — her varyant ayrı derlenmiş bir gölgelendiricidir
- Tüm anahtar kelimeleri/varyantları ve amaçlarını belgele
- Derleme boyutunu küçültmek için mümkün olduğunda özellik ayıklama (feature stripping) kullan
- Gölgelendirici başına toplam varyant sayısını kaydet ve izle
