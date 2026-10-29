// spatial_door_beam.gdshader — Çıkış noktasından yükselen tahliye ışık sütunu (TacticalDark, Door.gd).
// Açık uçlu CylinderMesh üstüne toplamalı (additive) çizilir: yukarı doğru söner, kenarlar (silüet) yumuşak,
// içinden yukarı kayan ince parlak bantlar "buradan çıkılır" hissi verir. Kilit açılırken kehribar + hızlı akış.
// Hedef: Forward+ / masaüstü. Tek geçiş, doku okuması yok, derinlik yazmaz, dallanma yok.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms durum;
uniform float active : hint_range(0.0, 1.0) = 0.0;            // biri kilit açıyorsa 1

group_uniforms gorunum;
uniform vec4 idle_color : source_color = vec4(0.45, 0.95, 0.68, 1.0);    // fosfor (UITheme.SIGNAL)
uniform vec4 active_color : source_color = vec4(1.0, 0.68, 0.25, 1.0);   // sodyum kehribarı (UITheme.ACCENT)
uniform float intensity : hint_range(0.0, 2.0) = 1.0;         // genel parlaklık
uniform float band_count : hint_range(1.0, 20.0) = 6.0;       // sütun boyunca bant sayısı
uniform float band_speed : hint_range(0.0, 3.0) = 0.35;       // bantların yükselme hızı (sütun boyu/sn; aktifken ×3)
uniform float band_sharpness : hint_range(0.5, 0.99) = 0.86;  // bant inceliği (yüksek = ince)
uniform float band_strength : hint_range(0.0, 2.0) = 0.9;     // bantların gövdeye göre ek parlaklığı
group_uniforms;

const float ACTIVE_SPEED_MULT = 3.0;
const float ACTIVE_BOOST = 0.6;      // aktifken parlaklık artışı

void fragment() {
	// CylinderMesh UV.y: 0 = üst, 1 = alt (zemin)
	float h = 1.0 - UV.y;                                  // 0 zemin → 1 tepe
	float height_fade = pow(1.0 - h, 2.2) * smoothstep(0.0, 0.04, h);
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float edge_fade = facing * facing;
	float speed = band_speed * mix(1.0, ACTIVE_SPEED_MULT, active);
	float band = smoothstep(band_sharpness, 1.0, fract(h * band_count - TIME * speed));
	float glow = (0.55 + band * band_strength) * height_fade * edge_fade;
	vec3 col = mix(idle_color.rgb, active_color.rgb, active);
	ALBEDO = col * intensity * (1.0 + ACTIVE_BOOST * active) * glow;
}
