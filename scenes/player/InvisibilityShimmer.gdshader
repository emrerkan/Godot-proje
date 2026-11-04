// InvisibilityShimmer.gdshader — Görünmezlik "cam" titreşimi (TacticalDark, TakımGörünür / yer pickup'ı).
// Yazar: Shader/3D ajanı · UX: docs/ux/new-powers.md §5 + §11.2
//
// Kullanım:
//   - material_overlay olarak karakter gövdesi + tüfek/bıçak mesh'lerine (kullanan + takım arkadaşı görür).
//     Rakip bu efekti HİÇ görmez (Player.set_invisible rakipte mesh'i tamamen gizler).
//   - Powerup.gd INVIS pickup'ında doğrudan material_override (yarı saydam kristal küre).
//
// Görünüm: gövdenin kendi dokusu okunur kalır; üstüne düşük alfalı soğuk lavanta katman +
// kenarda fresnel parıltısı + dünya Y'sinde yukarıdan aşağı kayan TEK yatay tarama bandı.
// Gövdeyi gerçek alfa ile eritmez (paylaşılan malzeme önbelleği bozulmasın) — overlay'in kendi alfasıyla karışır.
//
// Hedef: Forward+ (masaüstü) ve Mobile/Compatibility uyumlu. Tek geçiş, doku okuması YOK, ekran okuması YOK,
// dallanma yok (smoothstep/mix). Maliyet: ~30 ALU / piksel, iGPU dostu.
// Varyant yok. Fotosensitivite: tarama ≤0.8 Hz, titreşim ~0.8 Hz ±%8 (3 Hz üstü hiçbir şey yok).
shader_type spatial;
render_mode unshaded, blend_mix, cull_back, depth_draw_never, shadows_disabled;

group_uniforms ortak;
uniform vec4 shimmer_color : source_color = vec4(0.78, 0.72, 1.0, 1.0); // soluk lavanta (doygun mor DEĞİL)
uniform float intensity : hint_range(0.0, 1.5) = 1.0;                    // kullanan ≈0.65, takım ≈1.0, bitişte +0.2

group_uniforms govde;
uniform float base_alpha : hint_range(0.0, 1.0) = 0.38;       // gövdenin üstüne düşen soğuk katmanın alfası (0.30–0.45)
uniform float base_dim : hint_range(0.0, 1.0) = 0.35;         // merkezde renk parlaklığı (koyu lavanta; kenarda 1.0'a çıkar)
uniform float peak_brightness : hint_range(0.2, 1.0) = 0.75;  // tepe parlaklık (HUD TEXT beyazının ~%70'i — gözü almasın)

group_uniforms fresnel;
uniform float fresnel_power : hint_range(0.5, 6.0) = 2.5;     // yüksek = ince kenar
uniform float edge_alpha : hint_range(0.0, 1.0) = 0.55;       // kenarda eklenen alfa (base_alpha ile ~0.9'a varır)

group_uniforms tarama;
uniform float sweep_period : hint_range(0.3, 6.0) = 2.4;      // dünya Y'sinde bant aralığı (m) — gövde boyundan (1.9 m) uzun: tek bant
uniform float scan_speed : hint_range(0.0, 0.8) = 0.7;        // geçiş/sn (≤0.8 Hz)
uniform float band_width : hint_range(0.02, 0.4) = 0.10;      // bant yarı kalınlığı, period oranı (~gövde boyunun %12'si)
uniform float band_alpha : hint_range(0.0, 1.0) = 0.30;       // bant alfa katkısı
uniform float band_brightness : hint_range(0.0, 1.0) = 0.6;   // bant parlaklığı (fresnel kenarından düşük kalmalı)

group_uniforms titresim;
uniform float pulse_hz : hint_range(0.0, 1.5) = 0.8;          // yavaş sinüs
uniform float pulse_depth : hint_range(0.0, 0.3) = 0.08;      // ±%8 yoğunluk
group_uniforms;

const float TAU_C = 6.28318530718;

varying vec3 world_pos;

void vertex() {
	// Dünya konumu: tarama bandı nesne uzayına değil DÜNYA Y'sine bağlı → duruş değişse de akış sürer,
	// gövde ve tüfek aynı fazda kayar (tek efekt gibi görünür). VERTEX iskelet skinning'inden sonradır.
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float ndv = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	float fres = pow(1.0 - ndv, fresnel_power);

	// Yavaş nefes: ±pulse_depth
	float pulse = 1.0 + pulse_depth * sin(TIME * TAU_C * pulse_hz);

	// Tek yatay bant; TIME artarken sabit faz noktası aşağı iner (yukarıdan aşağı akış).
	float phase = fract(world_pos.y / sweep_period + TIME * scan_speed);
	float band = 1.0 - smoothstep(0.0, band_width, abs(phase - 0.5));

	// Renk: merkezde koyu lavanta → kenar/bantta tam renk (renk dışı ayrıştırıcı: hareket + saydamlık)
	float lit = clamp(fres + band * band_brightness, 0.0, 1.0);
	ALBEDO = shimmer_color.rgb * mix(base_dim, 1.0, lit) * peak_brightness;

	float a = base_alpha + fres * edge_alpha + band * band_alpha;
	ALPHA = clamp(a * pulse * intensity, 0.0, 0.92);
}
