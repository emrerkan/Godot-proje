// spatial_player_sniper_range.gdshader — Sniper tek-vuruş çemberi yer işareti (TacticalDark, Player.gd).
// Yalnızca yerel Sniper oyuncusu için yerde ince bir çember çizer: çember içi tek atış, dışı mesafeyle azalan hasar.
// Hedef: Forward+ / masaüstü. Tek geçiş, doku okuması yok, dinamik dallanma yok (smoothstep/mix).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms gorunum;
uniform vec4 ring_color : source_color = vec4(0.96, 0.84, 0.18, 0.38);  // Sniper sarısı (CharacterSelect)
uniform float ring_width : hint_range(0.0005, 0.02) = 0.0022;           // çember yarı kalınlığı (UV)
uniform float inner_glow_width : hint_range(0.0, 0.06) = 0.014;         // çemberin iç kenarında hafif vurgu
uniform float inner_glow_alpha : hint_range(0.0, 0.3) = 0.06;
group_uniforms;

const float RING_RADIUS = 0.48;   // UV 0..0.5 içinde (Player.gd düzlem boyutu = radius * 2.0 / 0.96)
const float EDGE_SOFT = 0.0014;   // kenar yumuşatma (uzaktan titreşmesin)

void fragment() {
	vec2 p = UV - 0.5;
	float r = length(p);
	// İnce dış çizgi
	float ring = smoothstep(ring_width + EDGE_SOFT, ring_width, abs(r - RING_RADIUS));
	// Çemberin hemen iç tarafında çok hafif dolgu ipucu (hangi tarafın "iç" olduğunu sezdirir)
	float glow = smoothstep(RING_RADIUS - inner_glow_width, RING_RADIUS, r) * step(r, RING_RADIUS);

	ALBEDO = ring_color.rgb;
	ALPHA = max(ring * ring_color.a, glow * inner_glow_alpha);
}
