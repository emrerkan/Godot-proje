// canvas_ui_loading_beam.gdshader — Yükleme perdesinin arka planı (TacticalDark, LoadingScreen.gd).
// Zifiri karanlıkta ekranın altından yavaşça sağa-sola tarayan bir el feneri konisi: ışık değdiği yerde taktik ızgarayı
// ve havada süzülen toz zerreciklerini açığa çıkarır (oyunun "karanlık + fener" kimliği). Üstüne MenuOverlay (duman/vinyet).
// Hedef: Forward+ / masaüstü, tam ekran tek geçiş; doku okuması yok, dallanma yerine smoothstep/step/mix.
shader_type canvas_item;

group_uniforms fener;
uniform vec3 beam_color : source_color = vec3(1.0, 0.86, 0.62);   // sıcak fener ışığı (UITheme.ACCENT'e yakın, daha soluk)
uniform float beam_strength : hint_range(0.0, 1.0) = 0.3;        // koninin kendi parlaklığı (hava saçılması)
uniform float beam_half_angle : hint_range(0.05, 0.8) = 0.32;     // koni yarı açısı (rad)
uniform float beam_reach : hint_range(0.3, 2.0) = 1.25;           // ışığın sönmeden ulaştığı mesafe (ekran yüksekliği)
uniform float sweep_amount : hint_range(0.0, 1.2) = 0.55;         // tarama genliği (rad)
uniform float sweep_speed : hint_range(0.0, 2.0) = 0.32;          // tarama hızı (rad/sn)
uniform vec2 origin = vec2(0.5, 1.12);                            // fenerin konumu (UV; ekranın biraz altı)

group_uniforms zemin;
uniform vec3 base_color : source_color = vec3(0.045, 0.052, 0.06); // UITheme.BG
uniform vec3 grid_color : source_color = vec3(0.75, 0.8, 0.88);
uniform float grid_px : hint_range(16.0, 160.0) = 56.0;           // ızgara aralığı (piksel)
uniform float grid_line_px : hint_range(0.5, 3.0) = 1.0;          // çizgi kalınlığı (piksel)
uniform float grid_strength : hint_range(0.0, 1.0) = 0.22;        // ışık altındaki ızgara görünürlüğü
uniform float floor_strength : hint_range(0.0, 1.0) = 0.12;       // ışığın zemine düşen yumuşak havuzu

group_uniforms toz;
uniform float dust_px : hint_range(4.0, 40.0) = 14.0;             // toz hücre boyu (piksel) — her hücrede en fazla bir zerre
uniform float dust_density : hint_range(0.0, 1.0) = 0.06;         // zerre olan hücre oranı
uniform float dust_strength : hint_range(0.0, 2.0) = 0.9;
uniform vec2 dust_drift = vec2(6.0, -10.0);                       // süzülme (piksel/sn)
group_uniforms;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void fragment() {
	vec2 px = FRAGCOORD.xy;
	// En-boy oranı düzeltmesi: açı ve mesafe ekran yüksekliği biriminde
	vec2 aspect = vec2(1.0 / SCREEN_PIXEL_SIZE.x * SCREEN_PIXEL_SIZE.y, 1.0);
	vec2 d = (UV - origin) * aspect;
	float dist = length(d);
	// Fener yukarı bakar (−y); sin dalgası + yavaş ikinci dalga → mekanik olmayan tarama
	float sweep = sin(TIME * sweep_speed) * sweep_amount + sin(TIME * sweep_speed * 0.37 + 1.3) * sweep_amount * 0.25;
	float ang = atan(d.x, -d.y) - sweep;
	float cone = smoothstep(beam_half_angle, beam_half_angle * 0.35, abs(ang));
	float falloff = smoothstep(beam_reach, 0.0, dist);
	float light = cone * falloff;

	// Izgara: piksel tabanlı ince çizgiler, sadece ışıkta görünür
	vec2 g = abs(fract(px / grid_px + 0.5) - 0.5) * grid_px;
	float grid = 1.0 - smoothstep(0.0, grid_line_px, min(g.x, g.y));

	// Toz: hücre başına bir zerre, yavaş süzülür, hafif kıpırdar; sadece konide parlar
	vec2 dp = px + TIME * dust_drift;
	vec2 cell = floor(dp / dust_px);
	float h = hash12(cell);
	vec2 spot = (vec2(hash12(cell + 7.1), hash12(cell + 3.7)) - 0.5) * dust_px * 0.6;
	float dd = length(fract(dp / dust_px) * dust_px - dust_px * 0.5 - spot);
	float twinkle = 0.6 + 0.4 * sin(TIME * (1.5 + h * 3.0) + h * 40.0);
	float dust = step(1.0 - dust_density, h) * smoothstep(1.6, 0.0, dd) * twinkle;

	vec3 col = base_color;
	col += beam_color * light * (beam_strength + floor_strength * (1.0 - dist));
	col += grid_color * grid * grid_strength * light;
	col += beam_color * dust * dust_strength * light;
	COLOR = vec4(col, 1.0);
}
