// MenuOverlay.gdshader — Ana menü + lobi 3D arka planının üstündeki katman (TacticalDark).
// Amaç: UI okunabilirliği (vinyet + karartma), "Sis & Cam" kimliği için yavaşça süzülen duman katmanı
// ve çok hafif tarama çizgisi + gren. Hedef: Forward+ / masaüstü; tek geçiş, doku okuması yok.
shader_type canvas_item;

group_uniforms okunabilirlik;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.8;    // kenar karartması
uniform float dim_amount : hint_range(0.0, 1.0) = 0.12;          // tüm ekrana hafif karartma
uniform vec3 shade_color : source_color = vec3(0.012, 0.015, 0.02); // karartma rengi (UITheme.BG ailesi)

group_uniforms sis;
uniform vec3 fog_color : source_color = vec3(0.72, 0.77, 0.84);  // duman rengi (soğuk açık gri)
uniform float fog_strength : hint_range(0.0, 0.6) = 0.22;        // en yoğun yerdeki opaklık
uniform float fog_scale : hint_range(0.5, 8.0) = 2.4;            // duman bulutu boyutu (küçük = iri bulut)
uniform vec2 fog_drift = vec2(0.018, -0.006);                    // süzülme hızı (UV/sn)
uniform float fog_bottom_bias : hint_range(0.0, 1.0) = 0.6;      // duman ekranın altında daha yoğun

group_uniforms doku;
uniform float scanline_strength : hint_range(0.0, 0.2) = 0.03;   // tarama çizgisi koyuluğu
uniform float scanline_spacing_px : hint_range(2.0, 8.0) = 3.0;  // çizgi aralığı (piksel)
uniform float grain_strength : hint_range(0.0, 0.1) = 0.02;      // gren
group_uniforms;

// Performans: her piksel için 2 katman × oktav × 4 hash. 4 oktav menüde ~%25 FPS götürüyordu (iGPU, 1080p);
// duman yumuşak olduğu için ince oktavlar zaten seçilmiyor.
const int FBM_OCTAVES = 3;

// Ucuz hash + değer gürültüsü (doku okumadan)
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);  // yumuşak interpolasyon
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
			mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fraktal gürültü: her oktav 2× frekans, ½ genlik → bulut dokusu
float fbm(vec2 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < FBM_OCTAVES; i++) {
		sum += value_noise(p) * amp;
		p = p * 2.03 + vec2(17.1, 9.2);
		amp *= 0.5;
	}
	return sum;
}

void fragment() {
	// Vinyet: ekran oranına göre hafif elips (dikeyde 1.25×)
	vec2 c = (UV - 0.5) * vec2(1.0, 1.25);
	float vig = smoothstep(0.22, 0.85, length(c));
	float shade_a = dim_amount + vig * vignette_strength;

	// Duman: iki katman farklı hızda süzülür (paralaks), alt kısımda yoğunlaşır
	vec2 fuv = UV * vec2(fog_scale * 1.7, fog_scale);
	float f1 = fbm(fuv + TIME * fog_drift);
	float f2 = value_noise(fuv * 1.8 - TIME * fog_drift * 1.6 + vec2(4.0, 1.0));  // 2. katman tek oktav yeter (paralaks)
	float smoke = smoothstep(0.35, 0.8, f1 * 0.65 + f2 * 0.45);
	smoke *= mix(1.0, smoothstep(0.0, 1.0, UV.y), fog_bottom_bias);
	float fog_a = smoke * fog_strength;

	// Tarama çizgisi + gren (karartmaya eklenir, dallanmasız)
	shade_a += step(0.66, fract(FRAGCOORD.y / scanline_spacing_px)) * scanline_strength;
	shade_a += (hash12(FRAGCOORD.xy + fract(TIME) * 371.0) - 0.5) * 2.0 * grain_strength;
	shade_a = clamp(shade_a, 0.0, 1.0);

	// Önce duman, üstüne karartma (vinyet kenarda dumanı da koyultur)
	vec3 col = mix(fog_color, shade_color, shade_a / max(shade_a + fog_a, 0.0001));
	float a = clamp(shade_a + fog_a * (1.0 - shade_a), 0.0, 1.0);
	COLOR = vec4(col, a);
}
