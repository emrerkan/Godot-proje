// canvas_ui_menu_beam.gdshader — TacticalDark ana menü (MainMenu.gd OYNA alt menüsü)
// Amaç: fare bir maddenin üstüne gelince "el feneriyle oraya tutuyormuşuz" izlenimi: maddenin arkasında
// sıcak beyaz fener izi (parlak merkez + soluk dış halka) + ışıkta süzülen toz zerreleri. `intensity` 0 → 1 tween'lenir.
// Toplamsal karışım — sadece aydınlatır; dikdörtgen maddeden geniş tutulur, kenarlarda tamamen söner.
// Hedef: Forward+ (canvas, renderer bağımsız). Bütçe: doku okuması yok, ~40 ALU; aynı anda en fazla 1-2 madde parlak.
shader_type canvas_item;
render_mode blend_add;

group_uniforms beam;
uniform float intensity : hint_range(0.0, 1.0) = 0.0;          // 0 = sönük, 1 = fener tam üstünde
uniform vec4 light_color : source_color = vec4(1.0, 0.92, 0.78, 1.0);  // sıcak akkor fener ışığı
uniform vec2 spot_center = vec2(0.62, 0.5);                    // iz merkezi (UV) — sağa yaslı yazının üstü
uniform vec2 spot_radius = vec2(0.42, 0.62);                   // elips yarıçapları (UV)
uniform float hot_strength : hint_range(0.0, 1.0) = 0.8;      // parlak merkez payı
uniform float spill_strength : hint_range(0.0, 1.0) = 0.35;    // dış halka payı
uniform float light_alpha : hint_range(0.0, 1.0) = 0.6;       // ışığın toplam görünürlüğü
group_uniforms;

group_uniforms dust;
uniform float dust_cell_px = 26.0;                             // zerre ızgarası (ekran pikseli) — küçük = yoğun
uniform float dust_density : hint_range(0.0, 1.0) = 0.45;      // hücrelerin ne kadarında zerre var
uniform float dust_alpha : hint_range(0.0, 1.0) = 0.8;
uniform vec2 dust_drift_px = vec2(6.0, -9.0);                  // süzülme hızı (piksel/sn) — yukarı/sağa
group_uniforms;

const float FLICKER_DEPTH = 0.06;    // fener titremesi genliği
const float SPECK_SIZE_PX = 1.6;     // zerre yarıçapı

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Tek katman toz: her hücrede (olasılıkla) bir zerre, rastgele konum + kendi hızında parıldama.
// Dallanma yok: zerre olmayan hücreler step() ile sıfırlanır.
float dust(vec2 px, float cell, float t) {
	vec2 g = (px + dust_drift_px * t) / cell;
	vec2 id = floor(g);
	float h = hash(id);
	vec2 p = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.8 + 0.1;
	float d = length(fract(g) - p) * cell;
	float twinkle = 0.5 + 0.5 * sin(t * (1.5 + h * 3.0) + h * 40.0);
	return step(1.0 - dust_density, h) * smoothstep(SPECK_SIZE_PX, 0.0, d) * twinkle;
}

void fragment() {
	// Elips içinde normalleştirilmiş uzaklık (0 = merkez, 1 = kenar)
	float r = length((UV - spot_center) / spot_radius);
	float hot = smoothstep(0.55, 0.0, r);
	float spill = smoothstep(1.0, 0.45, r);
	float flicker = 1.0 - FLICKER_DEPTH + FLICKER_DEPTH * sin(TIME * 13.0) * sin(TIME * 7.3);
	float light = (hot * hot_strength + spill * spill_strength) * flicker;

	// İki ölçekte toz — sadece ışık lekesinin içinde görünür
	float specks = dust(FRAGCOORD.xy, dust_cell_px, TIME)
		+ 0.6 * dust(FRAGCOORD.xy * 1.7 + 50.0, dust_cell_px * 1.3, TIME * 0.7);
	specks *= smoothstep(0.95, 0.2, r);

	float a = (light * light_alpha + specks * dust_alpha) * intensity;
	COLOR = vec4(light_color.rgb * a, a);
}
