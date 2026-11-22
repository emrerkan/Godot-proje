// spatial_fx_explosion.gdshader — patlama alevi ve yükselen koyu duman parçacığı (ExplosionFx.gd). Forward+.
// İki mod (uniform is_fire):
//   is_fire = 1.0 → düzensiz kıvrılan alev dili (parlak beyaz-sarı çekirdek, turuncu-kızıl saçaklı kenar, yüksek emisyon)
//   is_fire = 0.0 → yoğun kıvrılan taktik patlama dumanı (patlama ışığı ve fenerden aydınlanır + yumuşak iç gölge + derinlik yumuşatma)
// Derinlik dokusuyla duvar/zemin kesişimi yumuşatılır → düz kesim çizgisi oluşmaz.
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, specular_disabled, shadows_disabled;

uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform float is_fire = 0.0;           // 1.0 = alev topu, 0.0 = koyu patlama dumanı
uniform float density = 0.85;
uniform float emission_floor = 0.22;   // karanlıkta dumanın silueti seçilsin, aşırı parlamasın
uniform float light_gain = 1.15;
uniform float soft_dist = 0.65;        // zemin/duvar kesişim yumuşatma mesafesi (m)
uniform float camera_pull = 0.22;

varying float v_age;
varying vec2 v_off;

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

void vertex() {
	v_age = clamp(INSTANCE_CUSTOM.y, 0.0, 1.0);
	float s = float(INSTANCE_ID) * 11.73 + 3.17;
	v_off = vec2(hash11(s), hash11(s + 2.41));
	float ang = INSTANCE_CUSTOM.x;
	mat4 mat_world = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	mat_world = mat_world * mat4(
		vec4(cos(ang), -sin(ang), 0.0, 0.0),
		vec4(sin(ang),  cos(ang), 0.0, 0.0),
		vec4(0.0,       0.0,      1.0, 0.0),
		vec4(0.0,       0.0,      0.0, 1.0));
	float sc = length(MODEL_MATRIX[0].xyz);
	mat_world[3].xyz += normalize(CAMERA_POSITION_WORLD - mat_world[3].xyz) * sc * camera_pull;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat_world * mat4(
		vec4(sc, 0.0, 0.0, 0.0),
		vec4(0.0, sc, 0.0, 0.0),
		vec4(0.0, 0.0, sc, 0.0),
		vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float age = v_age;
	vec2 base = v_off * 7.0;

	// İki oktav zıt yönlü kıvrılan gürültü: alevde hızlı çalkantı, dumanda ağır yuvarlanma
	float spd = mix(0.22, 0.65, is_fire);
	float n1 = texture(noise_tex, UV * 0.68 + base + vec2(age * spd, -age * spd * 0.7)).r;
	float n2 = texture(noise_tex, UV * 1.55 + base.yx + vec2(-age * spd * 1.3, age * spd * 0.9)).r;
	float n = n1 * 0.58 + n2 * 0.42;

	// Saçaklı, organik sınır — yuvarlak disk veya kare kenar görünmez
	float edge = (1.0 - smoothstep(0.0, 1.0, r + (n - 0.5) * 0.95 + (n2 - 0.5) * 0.45)) * (1.0 - smoothstep(0.68, 1.0, r));
	float dens = edge * (0.18 + n * 1.35);

	// Yaşlandıkça tutam tutam aşınarak dağılma
	float thr = mix(0.12 + 0.50 * age, 0.16 + 0.68 * age, is_fire);
	float a = smoothstep(thr, thr + 0.48, dens) * COLOR.a * density;

	// Yumuşak parçacık: duvar/zemin kesişiminde sert çizgiyi siler
	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 vp = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	float scene_z = -vp.z / vp.w;
	a *= clamp((scene_z + VERTEX.z) / soft_dist, 0.0, 1.0);

	// Alev: yoğun çekirdek kor beyaz-sarı, dış kıvrımlar turuncu-kızıl
	// Duman: yoğun iç kısım koyu is, ince kıvrımlar hafif açık kül tonu
	float shade = mix(mix(1.18, 0.58, smoothstep(0.25, 0.80, n)), 1.0 + dens * 0.9, is_fire);
	vec3 col = COLOR.rgb * shade;

	ALBEDO = col * (1.0 - is_fire);
	EMISSION = col * mix(emission_floor, 2.4, is_fire);
	ALPHA = clamp(a, 0.0, 1.0);
}

void light() {
	// Duman patlama ışığı + oyuncu fenerleriyle hacimli aydınlanır; alev kendi ışığını yayar
	float wrap = clamp(0.58 + 0.42 * dot(NORMAL, LIGHT), 0.0, 1.0);
	DIFFUSE_LIGHT += ATTENUATION * LIGHT_COLOR * wrap * light_gain * (1.0 - is_fire) / PI;
}
