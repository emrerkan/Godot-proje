// spatial_door_zone.gdshader — Kapının kilit açma bölgesi (TacticalDark, Door.gd).
// Yerde düz bir PlaneMesh üstüne çizilir: kesik çizgili dış çember + kilit açma ilerlemesi (saat yönünde dolan yay)
// + çok hafif iç zemin. Işıktan bağımsız (unshaded), karanlıkta da okunur.
// Hedef: Forward+ / masaüstü. Tek geçiş, doku okuması yok, dallanma yerine step/smoothstep.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms durum;
uniform float progress : hint_range(0.0, 1.0) = 0.0;          // kilit ilerlemesi (GameManager.door_unlock)
uniform float active : hint_range(0.0, 1.0) = 0.0;            // biri bölgede kilit açıyorsa 1 (nabız + parlaklık)

group_uniforms gorunum;
uniform vec4 ring_color : source_color = vec4(0.45, 0.95, 0.68, 0.55);   // fosfor (UITheme.SIGNAL)
uniform vec4 fill_color : source_color = vec4(1.0, 0.68, 0.25, 0.85);    // sodyum kehribarı (UITheme.ACCENT)
uniform float ring_width : hint_range(0.005, 0.1) = 0.025;    // dış çember kalınlığı (UV yarıçapı oranı)
uniform float arc_width : hint_range(0.01, 0.2) = 0.06;       // ilerleme yayı kalınlığı
uniform float dash_count : hint_range(4.0, 64.0) = 28.0;      // dış çemberdeki kesik sayısı
uniform float inner_alpha : hint_range(0.0, 0.3) = 0.05;      // iç zemin dolgusu
group_uniforms;

const float TAU_F = 6.28318530718;
const float RING_RADIUS = 0.47;      // dış çember (UV 0..0.5 yarıçap içinde, kenardan biraz içeride)
const float EDGE_SOFT = 0.006;       // kenar yumuşatma

void fragment() {
	vec2 p = UV - 0.5;
	float r = length(p);
	// Açı 0..1, üstten (−Z) başlayıp saat yönünde
	float ang = fract(atan(p.x, -p.y) / TAU_F + 1.0);

	// Dış kesikli çember
	float ring = smoothstep(ring_width + EDGE_SOFT, ring_width, abs(r - RING_RADIUS));
	float dash = step(0.35, fract(ang * dash_count));
	ring *= dash;

	// İlerleme yayı: çemberin hemen içinde, progress kadar dolu
	float arc_r = RING_RADIUS - ring_width - arc_width * 0.5 - 0.01;
	float arc = smoothstep(arc_width * 0.5 + EDGE_SOFT, arc_width * 0.5, abs(r - arc_r));
	arc *= step(ang, progress) * step(0.0001, progress);

	// İç zemin (bölge içi) — aktifken nabız atar
	float pulse = 0.5 + 0.5 * sin(TIME * 6.0);
	float inner = step(r, RING_RADIUS) * (inner_alpha + active * (0.04 + 0.05 * pulse));

	vec3 col = mix(ring_color.rgb, fill_color.rgb, active) * ring;
	float a = ring * mix(ring_color.a, 0.9, active);
	col = mix(col, fill_color.rgb, arc);
	a = max(a, arc * fill_color.a);
	col = mix(col, fill_color.rgb, step(0.0001, inner) * (1.0 - max(ring, arc)) * active);
	a = max(a, inner);

	ALBEDO = col;
	ALPHA = a;
}
