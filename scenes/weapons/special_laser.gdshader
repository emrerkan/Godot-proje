// special_laser.gdshader — Özel silah hazırken tüfek ucundan çıkan ince kırmızı-eflatun lazer (TacticalDark).
// Yazar: Shader/3D ajanı · UX: docs/ux/new-powers.md §11.3
//
// SpecialGunFx.build_laser(): CylinderMesh (açık uçlu), Muzzle'dan -Z'ye ~30 m. Işık YOK, gölge YOK.
// Görünüm: ince (dünya 0.044 m ≈ 2 px), additive; ortası açık pembe çekirdek (facing), kenarı yumuşak;
// son %30'da lineer sönüm (sert bitiş yok); yavaş nefes α 0.45↔0.65 (≤1.2 Hz).
// Hedef: Forward+/Mobile/Compatibility. Tek geçiş, doku YOK, dallanma yok. Çok oyunculu: oyuncu başına 1 draw call.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms renk;
uniform vec4 beam_color : source_color = vec4(1.0, 0.12, 0.12, 1.0);   // INFO[SPECIAL_GUN].color
uniform vec4 core_color : source_color = vec4(1.0, 0.72, 0.68, 1.0);   // ortadaki enerji şeridi
uniform float brightness : hint_range(0.0, 2.0) = 1.0;

group_uniforms nabiz;
uniform float alpha_min : hint_range(0.0, 1.0) = 0.45;
uniform float alpha_max : hint_range(0.0, 1.0) = 0.65;
uniform float pulse_hz : hint_range(0.0, 1.2) = 1.0;                   // ≤1.2 Hz, titreme YOK

group_uniforms sonum;
uniform float mesh_length = 30.0;                                       // CylinderMesh.height ile AYNI olmalı (SpecialGunFx ayarlar)
uniform float fade_start : hint_range(0.0, 1.0) = 0.7;                 // bu orandan sonra uca doğru söner
uniform float near_fade : hint_range(0.0, 0.1) = 0.01;                 // namlu dibinde yumuşak başlangıç (~0.3 m)
uniform float core_sharpness : hint_range(1.0, 8.0) = 3.0;             // yüksek = ince çekirdek
group_uniforms;

const float TAU_C = 6.28318530718;

varying float along;   // 0 = namlu, 1 = uzak uç

void vertex() {
	// Silindir yerel Y'de ±height/2 yayılır; +Y ucu (rotasyondan sonra -Z) uzak uçtur.
	along = VERTEX.y / mesh_length + 0.5;
}

void fragment() {
	float far_fade = 1.0 - smoothstep(fade_start, 1.0, along);
	float near = smoothstep(0.0, near_fade, along);
	float pulse = mix(alpha_min, alpha_max, 0.5 + 0.5 * sin(TIME * TAU_C * pulse_hz));
	// Tüp ortası kameraya dönükken facing≈1: çekirdek rengi + kenara doğru yumuşak sönüm
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float core = pow(facing, core_sharpness);
	float edge = smoothstep(0.0, 0.6, facing);
	vec3 col = mix(beam_color.rgb, core_color.rgb, core);
	// blend_add: alfa çarpanı rengin içine gömüldü (ALPHA kullanılmıyor)
	ALBEDO = col * pulse * far_fade * near * edge * brightness;
}
