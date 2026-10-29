// spatial_door_zone.gdshader — Çıkış (tahliye) noktasının yer işareti (TacticalDark, Door.gd).
// Yerde düz bir PlaneMesh üstüne: ince kesintisiz çember ("O" — kullanıcı) + ortada yukarı akan üç ok (çıkış işareti).
// Oklar dünya yukarısına değil düzlemin -Z'sine bakar (ekranda yukarı); sırayla yanıp kayarak "buradan çık" der.
// Biri kilit açarken her şey kehribara döner, oklar hızlanır. Işıktan bağımsız (unshaded), karanlıkta da okunur.
// Hedef: Forward+ / masaüstü. Tek geçiş, doku okuması yok, dallanma yerine step/smoothstep/mix.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms durum;
uniform float progress : hint_range(0.0, 1.0) = 0.0;          // kullanılmıyor (Door.gd uyumluluğu için duruyor)
uniform float active : hint_range(0.0, 1.0) = 0.0;            // biri bölgede kilit açıyorsa 1 (renk + hız + nabız)

group_uniforms gorunum;
uniform vec4 ring_color : source_color = vec4(0.45, 0.95, 0.68, 0.6);    // fosfor (UITheme.SIGNAL)
uniform vec4 active_color : source_color = vec4(1.0, 0.68, 0.25, 0.9);   // sodyum kehribarı (UITheme.ACCENT)
uniform float ring_width : hint_range(0.001, 0.05) = 0.006;   // çember yarı kalınlığı (UV; 3 m yarıçapta ~4 cm)
uniform float pulse_speed : hint_range(0.0, 12.0) = 6.0;      // aktifken nabız hızı (rad/sn)
uniform float pulse_amount : hint_range(0.0, 1.0) = 0.35;     // aktifken nabzın alfa genliği

group_uniforms oklar;
uniform float chevron_size : hint_range(0.02, 0.2) = 0.12;    // bir okun yarı genişliği (UV; ~0.77 m)
uniform float chevron_width : hint_range(0.002, 0.03) = 0.011; // ok çizgisi yarı kalınlığı (UV)
uniform float chevron_gap : hint_range(0.02, 0.2) = 0.1;      // oklar arası dikey mesafe (UV)
uniform float chevron_speed : hint_range(0.0, 4.0) = 0.8;     // sıralı yanıp sönme hızı (tur/sn; aktifken ×2.5)
uniform float chevron_alpha : hint_range(0.0, 1.0) = 0.8;
group_uniforms;

const float RING_RADIUS = 0.47;      // çember (UV 0..0.5 yarıçap içinde — Door.gd düzlem boyutu buna göre)
const float EDGE_SOFT = 0.004;       // kenar yumuşatma (titreşmesin)
const float CHEVRON_COUNT = 3.0;
const float ACTIVE_SPEED_MULT = 2.5;

// "^" şeklinde ok: tepe (0, top), kollar 45° aşağı. p: ok merkezine göre (y aşağı pozitif = UV.y)
float chevron(vec2 p, float top) {
	vec2 q = vec2(abs(p.x), p.y - top);
	// 45° çizgi y = x boyunca uzaklık, sadece kol uzunluğu içinde
	float d = abs(q.y - q.x) * 0.7071;
	float along = step(q.x, chevron_size) * step(0.0, q.y + chevron_width);
	return smoothstep(chevron_width + EDGE_SOFT, chevron_width, d) * along;
}

void fragment() {
	vec2 p = UV - 0.5;
	float r = length(p);
	float ring = smoothstep(ring_width + EDGE_SOFT, ring_width, abs(r - RING_RADIUS));

	// Üç ok: alttan üste (UV.y azalan = ekranda yukarı) sırayla parlar
	float speed = chevron_speed * mix(1.0, ACTIVE_SPEED_MULT, active);
	float chev = 0.0;
	for (float i = 0.0; i < CHEVRON_COUNT; i += 1.0) {
		float top = chevron_gap * (1.0 - i) - chevron_size * 0.5;   // i=0 alt, i=2 üst
		float phase = fract(TIME * speed - i / CHEVRON_COUNT);
		float glow = 0.35 + 0.65 * smoothstep(0.6, 1.0, 1.0 - phase) ;
		chev = max(chev, chevron(p, top) * glow);
	}

	float pulse = 1.0 - pulse_amount * active * (0.5 + 0.5 * sin(TIME * pulse_speed));
	float base_a = mix(ring_color.a, active_color.a, active);
	ALBEDO = mix(ring_color.rgb, active_color.rgb, active);
	ALPHA = max(ring * base_a * pulse, chev * chevron_alpha);
}
