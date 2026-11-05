// special_tracer.gdshader — Özel silah mermisinin parlak kırmızı-beyaz izi (TacticalDark).
// Yazar: Shader/3D ajanı · UX: docs/ux/new-powers.md §11.3
//
// SpecialGunFx.build_tracer(): iki CylinderMesh (çekirdek + hale), Bullet'in arkasına (+Z) ~3 m uzanır.
// Baş (mermi ucu) en parlak, kuyruğa doğru %0'a söner. Çekirdek: beyaz-pembe, hale: eflatun, ikisi aynı shader.
// Işık YOK, gölge YOK, additive. Mermi 160 m/s: 3 m iz 60 FPS'te kesintisiz çizgi gibi görünür.
// Hedef: Forward+/Mobile/Compatibility. Tek geçiş, doku YOK, dallanma yok. Tek atış → fotosensitivite riski yok.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

group_uniforms renk;
uniform vec4 tracer_color : source_color = vec4(1.0, 0.93, 0.9, 1.0);
uniform float strength : hint_range(0.0, 2.0) = 1.0;           // çekirdek 1.0, hale ~0.45

group_uniforms sekil;
uniform float mesh_length = 3.0;                                // CylinderMesh.height ile AYNI olmalı
uniform float tail_power : hint_range(0.5, 4.0) = 1.6;          // yüksek = kuyruk daha hızlı söner
uniform float edge_power : hint_range(0.0, 6.0) = 1.5;          // yüksek = yumuşak kenar (hale için düşük)
uniform float head_soft : hint_range(0.0, 0.2) = 0.04;          // mermi ucunda yumuşak başlangıç (iz oranı)
group_uniforms;

varying float along;   // 0 = baş (mermi), 1 = kuyruk

void vertex() {
	// Silindir yerel +Y ucu (rotasyondan sonra -Z) = baş; mermi hareket yönüdür.
	along = 0.5 - VERTEX.y / mesh_length;
}

void fragment() {
	float tail = pow(clamp(1.0 - along, 0.0, 1.0), tail_power);
	float head = smoothstep(0.0, max(head_soft, 0.0001), along);
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float edge = pow(facing, edge_power);
	// blend_add: parlaklık doğrudan ALBEDO'da
	ALBEDO = tracer_color.rgb * strength * tail * head * edge;
}
