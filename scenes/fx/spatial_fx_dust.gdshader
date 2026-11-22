// spatial_fx_dust.gdshader — hareket tozu parçacığı (DustEmitter.gd çizim geçişi). TacticalDark, Forward+.
// Bütçe (Iris Xe hedefi): parça başına 2 gürültü + 1 derinlik örneği, dallanma yok; patlama başına ≤10 quad.
// Amaç: tek tek yuvarlak disk değil, birbirine karışan YUMUŞAK, DÜZENSİZ toz/duman tutamı.
//  - Billboard shader içinde (parçacık billboard'u + ParticleProcessMaterial açısı INSTANCE_CUSTOM.x).
//  - Gürültü dokusu (DustEmitter önbelleği, seamless): her parçacık farklı ofset (INSTANCE_ID + yayıcı tohumu),
//    ömür boyunca yavaş kayar → kenar düzensiz, içi bulutlu.
//  - Yaşlandıkça yoğunluk eşiği yükselir → düz sönme yerine tutam tutam incelir.
//  - Yumuşak parçacık: derinlik dokusuyla zemine yaklaşınca söner (sert kesişim çizgisi yok).
//  - IŞIKLI (fener/hale aydınlatır), saçılım benzeri sarmalı ışık; karanlıkta minik emisyon tabanı.
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, specular_disabled, shadows_disabled;

uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform vec3 dust_color : source_color = vec3(0.66, 0.60, 0.52);
uniform float emission_floor = 0.06;   // tam karanlıkta çok soluk seçilsin
uniform float light_gain = 1.0;
uniform float density = 1.0;
uniform float soft_dist = 0.9;         // zemine bu kadar (m) yaklaşınca tamamen söner
uniform float camera_pull = 0.5;       // quad'ı kameraya doğru (boy × bu) çek → zemine gömülmez

// Yayıcı başına (DustEmitter set_instance_shader_parameter) — malzeme kopyalanmaz
instance uniform float size_mult = 1.0;
instance uniform float seed = 0.0;

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
	float s = seed * 13.17 + float(INSTANCE_ID) * 7.31;
	v_off = vec2(hash11(s), hash11(s + 1.73));
	float ang = INSTANCE_CUSTOM.x;
	mat4 mat_world = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	mat_world = mat_world * mat4(vec4(cos(ang), -sin(ang), 0.0, 0.0), vec4(sin(ang), cos(ang), 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	float sc = length(MODEL_MATRIX[0].xyz) * size_mult;
	// Yere yakın doğan parçacığın alt yarısı zemine gömülmesin: kameraya doğru yarıçap kadar çekilir
	// (ekrandaki konum/boy neredeyse değişmez, dünya derinliği öne gelir; kalan kesişimi soft_dist yumuşatır)
	mat_world[3].xyz += normalize(CAMERA_POSITION_WORLD - mat_world[3].xyz) * sc * camera_pull;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat_world * mat4(vec4(sc, 0.0, 0.0, 0.0), vec4(0.0, sc, 0.0, 0.0), vec4(0.0, 0.0, sc, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float age = v_age;
	vec2 base = v_off * 9.0;
	// İki oktav, farklı yönlere yavaş kayar (kıvrılan duman hissi)
	float n1 = texture(noise_tex, UV * 0.6 + base + vec2(age * 0.16, -age * 0.11)).r;
	float n2 = texture(noise_tex, UV * 1.4 + base.yx + vec2(-age * 0.27, age * 0.19)).r;
	float n = n1 * 0.62 + n2 * 0.38;
	// Düzensiz sınır: yarıçap gürültüyle bozulur, kenar geniş ve yumuşak
	// Kenar ince oktavla (n2) ayrıca kemirilir → tüylü, kıvrık sınır
	// Son çarpan: quad köşeleri her durumda sıfır (gürültü kenarı içeri çekse bile kare kenar görünmez)
	float edge = (1.0 - smoothstep(0.0, 1.0, r + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35)) * (1.0 - smoothstep(0.7, 1.0, r));
	// İç yoğunluk gürültüyle güçlü dalgalanır → topaklar ve aralar (düz pamuk top değil)
	float dens = edge * (0.15 + n * 1.25);
	// Yaşla aşınma: eşik yükselir → tutamlar incelir (düz sönme değil)
	float thr = 0.08 + 0.42 * age;
	float a = smoothstep(thr, thr + 0.8, dens);
	a *= COLOR.a * density;
	// Yumuşak parçacık (zemin/duvar kesişimi)
	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 vp = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	float scene_z = -vp.z / vp.w;
	a *= clamp((scene_z + VERTEX.z) / soft_dist, 0.0, 1.0);
	// Yoğun topaklar biraz koyu (sahte iç gölge), ince yerler açık → hacim hissi
	vec3 col = dust_color * COLOR.rgb * mix(1.15, 0.7, smoothstep(0.3, 0.8, n));
	ALBEDO = col;
	ALPHA = clamp(a, 0.0, 1.0);
	EMISSION = col * emission_floor;
}

void light() {
	// Toz ışığı saçar: yüzey normaline az bağlı (arkadan gelen ışıkta da aydınlansın)
	float wrap = clamp(0.6 + 0.4 * dot(NORMAL, LIGHT), 0.0, 1.0);
	DIFFUSE_LIGHT += ATTENUATION * LIGHT_COLOR * wrap * light_gain / PI;
}
