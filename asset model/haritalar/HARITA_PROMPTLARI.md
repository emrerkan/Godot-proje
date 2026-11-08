# TacticalDark — Blender Harita Üretim Prompt'ları (v2 — gerçekçi)

Blender'da Python (bpy) ile harita üreten yapay zekaya verilecek prompt'lar.
Gerekçeler, doğrulama sonuçları ve oyuna ekleme adımları: [HARITA_URETIM_NOTLARI.md](HARITA_URETIM_NOTLARI.md).

**Kullanım:** Her harita için önce **Ortak Şartname**'yi, hemen altına **tek bir harita prompt'unu** yapıştır.
Çok uzun gelirse iki adımda ver: önce "1. AŞAMA: yerleşim + çarpışma", sonra aynı sohbette "2. AŞAMA: malzeme + detay + dışa aktarım".

> **v1 → v2:** v1 şartnamesi düz renk, 8–16 kenarlı silindir ve 40–120 bin üçgen istediği için sonuç aşırı low-poly
> ve dokusuz çıktı (ör. çölde düz kahverengi zemin). v2 gerçek PBR dokular, bake edilmiş eskime, kenar pahları, zemin decal'leri,
> serpiştirilmiş detaylar ve daha yüksek bütçe ister. Oynanış kuralları (yükseklik, isimler, noktalar) değişmedi.

---

## Ortak Şartname (her haritanın başına)

```text
GÖREV: Blender 4.x için baştan sona çalışan bir bpy Python betiği yaz. Betik aşağıdaki haritayı kursun, doğrulasın ve dışa aktarsın. Harita "TacticalDark" için: Godot 4 (Forward+), 4 takımlı FFA, üstten 50° kameralı (oyuncunun 14 m üstünde, 12 m gerisinde) taktik nişancı. Gece, çok karanlık; oyuncular el feneri kullanıyor. Amaç: kartı bulup çıkış noktasında 5 sn kilit açmak.

GÖRSEL HEDEF (EN ÖNEMLİ)
- Gerçekçi, AAA taktik oyun görünümü: Escape from Tarkov / Ready or Not / Battlefield seviyesinde malzeme kalitesi, üstten bakış. Low-poly, düz renk, "oyuncak" görünüm KESİNLİKLE kabul edilmez.
- Gerçekçiliği üç şey verir, üçü de zorunlu:
  1) GERÇEK PBR DOKULAR (fotogrametri tabanlı, tile edilebilir): albedo + normal + roughness (+ varsa AO/metal). Düz renkli malzeme sadece çok küçük parçalarda (vida, kablo) kabul edilir.
  2) KATMANLI YÜZEY: hiçbir geniş yüzey tek doku olmasın. Zemin en az 3 malzeme bölgesi + geçişleri örten decal'ler; duvarlar/araçlar kir, pas, çizik, toz katmanlarıyla eskitilmiş.
  3) GEOMETRİ DETAYI: her sert kenarda pah (Bevel 1–3 cm, 2 segment, harden normals); silüet detayları (kaburga, perçin sırası, kapak, anten, kırık kenar, sarkan kablo); zemine serpiştirilmiş taş, kırıntı, ot, çöp.
- Kamera oyuncuyu ~25×15 m'lik alanda gösterir (1080p'de ~75 piksel/metre). Doku yoğunluğu en az 512 piksel/metre olsun; zemin dokuları 2–4 m'de bir tekrar etsin ve tekrar belli olmasın (aşağıda).

DOKU KAYNAĞI
- Betiğin başında TEX_DIR değişkeni olsun (varsayılan: .blend dosyasının yanında "textures"). Her malzeme seti için alt klasör: TEX_DIR/<set_adi>/ içinde *_Color/_albedo, *_Normal (OpenGL), *_Roughness, isteğe bağlı *_AO/_Metalness dosyaları; betik bunları dosya adındaki anahtar kelimeyle bulsun.
- İnternet erişimin varsa CC0 kaynaklardan (ambientCG.com, polyhaven.com — ikisi de CC0) 2K JPG setleri indirip TEX_DIR'e koyan bir yardımcı fonksiyon yaz; erişim yoksa eksik setlerin listesini ve arama terimlerini yazdır ve o setler için 3. maddedeki bake yedeğine düş. Kullanılan her setin adını ve kaynağını TEX_DIR/CREDITS.txt'ye yaz.
- Dokusu bulunamayan malzeme için yedek: Cycles'ta prosedürel shader (Noise/Voronoi/Musgrave + renk rampası + Bump) kur ve 2048×2048 albedo/roughness/normal olarak BAKE et. Prosedürel düğüm DOĞRUDAN dışa aktarılmaz; dışa aktarımda her malzeme sadece Image Texture → Principled BSDF yapısında olmalı.
- Kahraman nesneler (uçak gövdesi, gemi, tren, araçlar, ana binalar) için: Smart UV Project (ada boşluğu 0.02), tile dokuyu temel al, üstüne kenar aşınması (Geometry > Pointiness veya AO maskesi), kir birikmesi (AO), pas lekeleri (Noise maskesi) katmanlarını karıştır ve nesne başına 2048 atlas olarak bake et (albedo + roughness + normal; yüksek detaylı bevel/perçin normalini de bu normale işle).
- Tekrarı kırma: zemin malzemelerinde aynı dokunun iki farklı ölçekte karışımını bake etme şansın yoksa, tekrarı decal'ler ve serpiştirilmiş detaylarla kır; ayrıca UV'yi bölge başına rastgele döndür/kaydır.
- Renk: dokuların kendi rengi korunsun ama genel ton koyu-orta kalsın (albedo ortalaması doğrusal 0.08–0.4); gece haritası el feneriyle okunur, tamamen siyah da olmasın.

DECAL VE SERPİŞTİRME
- Decal: zeminin 1–2 cm üstünde ince düzlemler (alfa maskeli PNG doku; glTF alphaMode = MASK olacak şekilde kur, BLEND değil). Ad "…_Decal_NN". Kullan: lastik izi, ayak izi, yağ/yanık lekesi, kum birikintisi, çatlak, su birikintisi, boya şeridi, kir akıntısı (duvar diplerinde), mermi izi kümeleri. Haritada en az 150 decal.
- Serpiştirme: küçük taş, çakıl, enkaz kırıntısı, kâğıt/çöp, kovan, cıvata, dal parçası; 0.4 m'den alçak. Geometry Nodes ile dağıt, sonra Realize Instances + 20×20 m'lik parçalar halinde birleştir. Ad "…_Scatter_NN". Spawn/kart/kapı noktalarının 1.5 m yakınına koyma.
- Ot/kuru çalı öbekleri: kesişen alfa maskeli kartlar (3–4 düzlem), ad "…_Grass_NN", 0.6 m'den alçak.
- Decal, Scatter, Grass adlı nesneler oyunda çarpışmasızdır; oyuncunun takılacağı her şey (kaya, varil, kasa) bu adları TAŞIMASIN.

KOORDİNAT VE BİRİM
- 1 birim = 1 metre. Tüm koordinatlar Godot [X, Y, Z] (Y yukarı, kuzey = -Z). Blender'a çevirmek için: gd(x,y,z) -> (x, -z, y).
- Harita merkezi dünya orijininde. Kök Empty dışında tüm nesnelerde ölçek/dönüş uygulanmış (apply) olsun, normaller dışa baksın, negatif ölçek olmasın.

OYUNCU ÖLÇÜLERİ VE OYNANIŞ (görsellik için ihlal edilemez)
- Kapsül yarıçapı 0.35 m, boy 1.8 m. Mermi ~1.55 m yükseklikten TAM YATAY gider.
- 0.42 m'ye kadar basamak otomatik çıkılır, 0.95 m'ye kadar zıplanır.
- YÜKSEKLİK: yürünen zemin her yerde Y = -0.25…+0.25. Görsel zenginlik zemin dokusu/normal/decal/serpiştirme ile verilir; GERÇEK yükseklik farkı ile verilmez. Büyük kum tepeleri, kaya yığınları, set ve şevler SADECE yürünmez alanlarda (çevre, en az 3 m yüksek, oyuncunun çıkamayacağı) olabilir. Platform, çukur, ikinci kat, balkon YOK.
- Engel sınıfları: alçak 0.5–0.95 m (zıplanır, mermi geçer) · tam siper ≥ 1.9 m · 1.0–1.8 m arası yapma.
- Çarpışmalı duvarlar ≥ 0.4 m kalın, kapalı hacim (tek düzlem duvar yok). Duvar yüksekliği 3 m (yıkık görünüm için üst kenar 2.6–3.4 m arası düzensiz olabilir ama 2.4 m'nin altına inmesin).
- ÇARPIŞMA = GÖRÜNÜŞ: oyun her görünür mesh'ten trimesh çarpışma üretir. Bu yüzden detaylı nesnelerin pürüzlü parçaları (sarkan kablo, ince boru, çıkıntılı anten) ya "_Canopy"/"_Scatter" adlı ayrı nesne olsun ya da gövdeye 5 cm'den fazla çıkmasın; aksi halde oyuncu görünmez çıkıntıya takılır.

ÜSTÜ AÇIK TASARIM
- Yürünen yerin üstünde çatı/çarpışmalı geometri olmaz. Binalar çatısız kesit; çatı kenarları kırık, kirişler açıkta.
- Üstte görünen her şey (tente, ağaç tepesi, vinç kirişi, kablo, boru köprüsü, çatı iskeleti) adında "_Canopy" taşısın (çarpışmasız, oyuncuyu kapatınca saydamlaşır).
- En yüksek nesne Y ≤ 9 m, en alçak geometri Y ≥ -3 m.

ALAN VE AKIŞ
- Dış ölçü prompt'taki değer. HİÇBİR mesh (decal, su, ağaç tepesi dahil) bu dikdörtgenin dışına taşmasın; uzak dağ, gökyüzü küresi, arka plan yok — oyun tüm mesh'lerin sınır kutusunu oyun alanı ve mini harita kabul eder.
- Kenarlar 3–6 m kesintisiz yürünmez çevre engeli (kayalık, duvar, yığın) — gerçekçi görünmeli, düz kutu duvar değil.
- Koridor ≥ 3.5 m, kapı açıklığı ≥ 2.2 m, her oda ≥ 2 çıkış, çıkmaz sokak yok. Tek hat görüş ≤ 45 m; en geç 12–15 m'de bir tam siper.
- Oyun noktaları dört takım için simetrik; görsel detay simetriyi kırsın (aynı nesneyi aynalama, varyasyonlu yerleştir).
- Takım bölgesi renk/platformla işaretlenmez, Pad_Team mesh'i yok.

SAHNE AĞACI (isimler birebir)
<KokAdi> (Empty, kimlik dönüşümü)
├ SpawnPoints (Empty) → Team0_Spawn … Team3_Spawn (bu sırayla; her birinde tam 5 çocuk Empty: Team0_Spawn_P1…P5)
├ CardPoints (Empty) → CardPoint_01…12 (Empty)
├ DoorPoints (Empty) → DoorPoint_01…12 (Empty)
├ WallLamps (boş Empty)
└ Geometry (Empty) → tüm mesh'ler (alt gruplar serbest: Geometry/Walls, Geometry/Props …)
- Noktalar gerçek Empty, altlarına mesh yok. Spawn Y=0.25, kart Y=1.15, kapı Y=0.1.
- Spawn dizilimi: merkez + (±1.7, ±1.7); çevresi 4 m düz ve engelsiz.
- Kapı noktası: 3.5 m yarıçap düz, engelsiz, ≥ 2 yönden erişilir; kapı modeli YAPMA (oyun çizer). Zemin decal'i serbest.
- Kart noktası: 2 m engelsiz, altında Prop_CardPedestal_NN (yarıçap ≤ 0.4 m, yükseklik 0.45 m, hepsi aynı, detaylı: metal kasa, kablo girişi, aşınmış boya).
- Spawn/kart/kapı noktalarının 3 m üstünde çarpışmalı geometri yok.
- Güç noktası ve lamba YAPMA (oyun otomatik üretir).

İSİMLENDİRME (oyun mesh adına bakar, büyük/küçük harf duyarlı)
- ÇARPIŞMASIZ olan parçalar: Canopy, Needles, Frond, Neon, LED, Holo, CardVisual, Beacon, GlowRing, Water, Pool, Basin, Screen, Glass, Light, Lamp, Horn, Pad_Team, Decal, Scatter, Grass.
- Katı nesneye bu kelimeleri KOYMA ("WaterTower", "StreetLight_Pole", "Glass_Wall", "Lighthouse", "GrassyRock" yanlış).
- Duvarda pencere boşluğu bırakma; cam/pencere görünümü katı duvarın önünde ince dekor olsun.
- Saydamlaşmayan zemin adları: Terrain, Floor, Ground, Deck, Plaza, Driveway, Bridge — sadece zeminlerde kullan.
- İsimler İngilizce ASCII; nokta, boşluk, "-col", "-noimp", ".001" yok. İki haneli sayı (Wall_017).

MESH YAPISI VE BÜTÇE
- Duvar/bina parçaları 6–15 m'lik ayrı nesneler (kameradan oyuncuyu kapatan nesne bütünüyle saydamlaşır).
- Bütçe: toplam 350.000–700.000 üçgen; kahraman nesne 20.000–80.000; zemin 30.000–60.000 (0.5 m ızgara + hafif mikro dalga, Y aralığı korunarak); silindirlerde 24–48 kenar; nesne sayısı ≤ 900 (serpiştirme/decal parça birleştirmeyle). Tekrarlanan nesnelerde linked mesh.
- Malzeme seti ≤ 30, dokular 2048 (zemin ana dokusu 2048, küçük propsda 1024), albedo JPG kalite 90, normal/roughness PNG veya JPG.
- Işık ve kamera nesnesi EKLEME. Emission sadece küçük yüzeylerde, güç ≤ 2 (geniş parlayan yüzey yok).

BETİK SONU
1. Doğrulama raporu: üçgen/nesne/malzeme/doku sayısı ve toplam doku boyutu; düz renkli (dokusuz) malzeme listesi (küçük parça dışında hata say); dünya sınır kutusu (alan dışı taşma = hata); 5×4 spawn, 12 kart, 12 kapı sayımı; kapı-en yakın spawn (≥ 25 m), kart-en yakın spawn (≥ 15 m); yürünebilir zeminde Y aralığı dışı yüz; yasak kelimeli katı nesneler; noktaların 3 m üstünde çarpışmalı geometri; alphaMode'u MASK olmayan decal/grass malzemeleri.
2. Önizleme: (a) üstten ortografik PNG, noktalar işaretli; (b) oyun kamerasından (50° eğim, 14 m yükseklik, 12 m geride) EEVEE ile 3 farklı noktada 1920×1080 render, sahneye sadece önizleme için geçici ay ışığı + el feneri spot ışığı ekleyip render sonrası SİL.
3. Dışa aktarım: bpy.ops.export_scene.gltf(filepath=<prompt'taki .gltf adı>, export_format='GLTF_SEPARATE', export_texture_dir='textures', export_image_format='AUTO', export_yup=True, export_apply=True, export_lights=False, export_cameras=False, use_selection=False). (Dokular ayrı dosya kalır → GitHub 100 MB sınırına takılmaz, haritalar arası doku paylaşılabilir.)
Bu kurallar harita tarifinden önceliklidir; çelişki görürsen kuralı uygula ve raporda belirt.
```

---

## 1. Çöl Kargo Uçağı Enkazı (5v5v5v5)

```text
HARİTA: Çöl Kargo Uçağı Enkazı. Kök: Desert_Crash_Map. Dosya: Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5.gltf. Dış ölçü: 124×92 m (X ±62, Z ±46). Karakter: orta-uzak görüş hatları, kaya ve enkaz siperleri, orta bölgede sürekli çatışma. Ay ışığında soğuk tonlu çöl, sıcak tonlu kızıl kayalar.

MALZEME SETLERİ (arama terimleri): ince dalgalı kum (sand ripples / desert sand), sıkışmış kuru toprak-çakıl (dry ground gravel), çatlamış kuru çamur (cracked mud), katmanlı kızıl kumtaşı (red sandstone cliff), yuvarlak çöl kayası (desert rock), boyalı askeri metal + pas (painted metal / rusted metal), alüminyum gövde paneli (aluminium panels), oluklu galvaniz sac (corrugated metal), kanvas çadır (canvas fabric), kum torbası (sandbag / burlap), lastik (rubber tire), yanık metal (burnt metal).

ZEMİN: "Terrain_Sand", 3 malzeme bölgesi: ana alan kum dalgası; uçak çevresinde ve araç yollarında sıkışmış çakıllı toprak; krater ve kayalık diplerinde çatlak kuru çamur. Bölge sınırları düzensiz (gürültülü), geçişler kum birikintisi decal'leriyle örtülü. Mikro dalga ±0.15 m.
Decal'ler: uçağın sürüklendiği 60 m'lik yanık-kazınmış iz, Humvee lastik izleri (kesişen, yarı silinmiş), ayak izi patikaları, yağ ve yakıt lekeleri, yanık patlama izleri, rüzgârın duvar diplerine yığdığı kum.
Serpiştirme: çakıl ve küçük taşlar (her yerde, yoğunluğu değişken), uçaktan kopmuş alüminyum parçaları, perçinler, kablo parçaları, boş kovan kümeleri, kuru dal. Kuru çalı ve sert çöl otu öbekleri (Grass), kaya diplerinde yoğun.

ÇEVRE: "Rock_Perimeter_NN" katmanlı kızıl kumtaşı kayalıkları, 4–7 m, yatay tabakalı, aşınmış, dipleri döküntü taşlı (displace + decimate, gerçek kaya silüeti). Kayalık eteklerinde yürünmez kum yığınları.

MERKEZ — KARGO UÇAĞI (kahraman nesne): dört motorlu askeri nakliye uçağı, ikiye kırılmış. Gövde parçaları X[-26,-6] ve X[6,26], Z ekseninde 6 m genişlik, Z=0 hattında. Gövde: üstü yırtılarak açılmış U kesit (çatısız), iç kaburgalar ve kirişler açıkta, perçin sıraları, panel çizgileri, gri askeri boya üstünde kum aşınması, kırık kenarlar düzensiz ve ezik (boolean + noise), sarkan kablo demetleri (_Canopy değil, gövdeye yapışık). Yan duvar ~3 m, her yanda 2.4 m'lik 2 yırtık geçit, uçlar açık. İç zemin Y=0.1 "Fuselage_Floor" (kargo rayları, bağlama halkaları, devrilmiş kargo paletleri 1.9 m + bağlama kayışları). Kokpit burnu batı parçanın ucunda ezilmiş, camlar kırık (camsız çerçeve). Kuyruk dikmesi doğu parçanın ucunda yan yatmış (yürünmez, ≤ 6 m).
X[-6,6] enkaz sahası: yanmış motor nasel'leri (pervane kanatları bükülmüş), kanat kökü parçaları, iniş takımı tekerlekleri; hepsi ≥ 1.9 m; aralarında ≥ 3.5 m'lik 3 rota. Kırık kanatlar kuzey ve güneye uzanır, kanat ucu kuma gömülü, yakıt sızıntısı decal'leri.

DÖRT ÇEYREK: (±36, ±18) merkezli 14×9 m kemerli askeri hangar iskeleti ("Quonset_Wall_NN"): oluklu sac, çatısı çökmüş (sadece kemer kaburgaları "_Canopy" olarak üstte), uzun kenarlar 3 m duvar, kısa kenarlarda 4 m kapı; içinde ahşap ve metal kasalar (1.9 m+), devrilmiş raf, yakıt varilleri, kamuflaj ağı (_Canopy).
(±14, ±30): kum torbası mevzisi (0.9 m, torbalar tek tek modellenmiş, kirli, yer yer yırtık ve kum dökülmüş) + Humvee (2 m, detaylı: lastikler, kapılar, anten, toz katmanı, kurşun delikleri), sis bombası kutuları, telsiz kasası.
(0, ±22): çarpma krateri kenarı, dışa savrulmuş kaya kümeleri ve arka gövde parçaları (2–3 m), kart çevresi açık.
Uzun hatları kırmak için 8–10 doğal kaya kümesi (2–3 m, gerçek kaya silüeti, dipleri kumla gömülü).

SPAWN (Team0→3): (-52,-38), (52,-38), (-52,38), (52,38). Her köşe kayalıklara yaslanmış küçük askeri kamp: kanvas çadır (çatısı "Tent_Canopy"), kamp masası, su bidonları, jeneratör; ≥ 2 çıkış (≥ 4 m).
KART: (±13, 0) uçak içi; (0, ±22) krater; (±36, ±18) hangarlar; (±14, ±30) kontrol noktaları. Tüm işaret kombinasyonları, toplam 12.
KAPI: (0, ±40), (±22, ±40), (±56, 0) kanyon geçidi cepleri; (±24, ±12) uçak kanadı çevresi açık alanlar. Tüm işaret kombinasyonları, toplam 12.
EMISSION: Sadece uçakta birkaç küçük kırmızı acil ışığı şeridi ("Neon_Strip_NN"), güç ≤ 1.5.
```

---

## 2. Karantina Hastanesi (3v3v3v3)

```text
HARİTA: Karantina Hastanesi. Kök: Quarantine_Hospital_Map. Dosya: Map5_Karantina_Hastanesi_3v3v3v3.gltf. Dış ölçü: 92×68 m (X ±46, Z ±34). Karakter: yakın mesafe, kör köşeler, bıçak ve bomba haritası. Terk edilmiş, aceleyle boşaltılmış, karantina çökmüş.

MALZEME SETLERİ: kirli vinil/karo hastane zemini (hospital floor tiles / linoleum), soluk yeşil koğuş linoleumu, kirli beyaz sıva ve boya dökülmesi (plaster wall peeling paint), seramik duvar karosu (white wall tiles), paslanmaz çelik (brushed steel), boyalı metal (painted metal chipped), dış asfalt ve beton (asphalt, concrete), naylon branda (plastic sheeting), ahşap kapı.

ZEMİN: Tek seviye, bölge başına ayrı "Floor_NN" (koridor karo, koğuş yeşil linoleum, yoğun bakım soluk mavi, avlu asfalt). Dış kenar "Wall_Perimeter_NN" dış cephe: sıva dökülmüş tuğla, yağmur akıntısı lekeleri.
Decal'ler: su birikintileri, kurumuş kan lekeleri (koyu, abartısız), sürüklenme izleri, sedye tekerlek izleri, dağılmış kâğıtlar, karantina sarı-siyah yer bantları, duvar diplerinde küf ve kir, kırık cam parçaları (yerde), biyolojik tehlike şablon boyaları.
Serpiştirme: ilaç kutuları, eldivenler, şırınga, kâğıt, sıva parçaları, kırık tavan karosu parçaları.

PLAN: Merkezde yarıçapı 18 m yuvarlak triyaj rotundası (en az 32 kenar), ortasında 4 m yarıçaplı, 2 m yüksekliğinde hemşire bankosu (bilgisayar ekranları "Screen", dosya yığınları); rotunda duvarında 8 eşit dağıtılmış 3 m kapı, kapı kasaları ve kırık çift kanatlı kapılar. Rotundadan 4 yöne 5 m genişlikli ana koridorlar (X=0 kuzey-güney, Z=0 doğu-batı); koridor duvarlarında sedye koruma bantları, el dezenfektanı kutuları, yönlendirme tabelaları, karantina naylonu ile kapatılmış geçitler (naylon görsel, geçit açık kalır).
Dört çeyrek, 8–12 m boyutlu 3–4 oda + 3.5 m servis koridoru, her oda ≥ 2 kapı (2.2 m):
KB MR odası: MRI_Scanner (2 m, detaylı halka gövde, masa), kontrol odası camı (katı duvar + cam dekor).
KD ameliyathane: ameliyat masaları (0.9 m), tavan lambası "SurgicalLamp_Canopy", alet tepsileri, anestezi cihazı (1.9 m).
GB yoğun bakım: ICUBed (0.7 m, çarşaf ve yastık modelli), monitör direkleri, katlanır paravanlar (2 m, kumaş).
GD morg + bekleme salonu: morg dolap blokları (2 m, paslanmaz çelik kapaklı), bekleme koltuk sıraları (0.8 m), devrilmiş otomatlar (1.9 m).

SPAWN (Team0→3): (-38,-28), (38,-28), (-38,28), (38,28). Dört köşede üstü açık ambulans avlusu: ambulans (2.2 m, detaylı, kapıları açık, kirli), karantina çadırı ("Tent_Canopy"), bariyerler; ≥ 2 çıkış.
KART: (0, ±13) rotunda içi; (±24, 0) doğu-batı koridor genişlemesi; (±26, ±13) dış koğuşlar; (±16, ±22) iç koğuşlar. Toplam 12.
KAPI: (0, ±29) ve (±10, ±29) kuzey/güney acil lobileri (Z=±24…±31 tam genişlik lobi, her noktada 3.5 m boşluk); (±41, 0) doğu/batı giriş; (±12, ±8) rotunda içi. Toplam 12. Banko bu noktaları kapatmasın.
EMISSION: kırmızı haçlar "HospitalRedCross_NN", yer şeritleri "ER_RedGuideLine_NN", acil çıkış tabelaları; güç ≤ 1.0.
```

---

## 3. Yeraltı Metro İstasyonu (4v4v4v4)

```text
HARİTA: Yeraltı Metro İstasyonu. Kök: Underground_Subway_Map. Dosya: Map6_Yeralti_Metro_Istasyonu_4v4v4v4.gltf. Dış ölçü: 110×68 m (X ±55, Z ±34). Karakter: uzun doğu-batı hatları, kolonlu perondan vagonlara kısa kesişler. Eski, nemli, terk edilmiş istasyon.

MALZEME SETLERİ: kirli seramik metro karosu (subway tiles), granit/terrazzo peron zemini (terrazzo floor), ıslak beton (wet concrete), ray balastı çakıl (gravel ballast), paslı çelik ray, ahşap/beton travers, boyalı metal vagon gövdesi (painted metal train / graffiti), paslanmaz çelik (turnike), sarı uyarı şeridi (tactile paving).

ZEMİN: Ada peronu "Platform_Floor" X[-40,40], Z[-5,5], Y=0 (terrazzo, kenarda sarı kabartmalı uyarı şeridi). Ray yatakları "TrackBed_Floor" Z[5,14] ve Z[-14,-5], Y=-0.2 (çukur değil; balast çakılı, travers ve raylar 5 cm kabartma). Yan holler "Hall_Floor" Z[14,34] ve Z[-34,-14], Y=0.
Decal'ler: su birikintileri ve tavandan damlama lekeleri, duvar diplerinde küf, grafiti (duvar ve vagonlarda), sakız/kir lekeleri, kırık karo izleri, yağ lekeleri ray yatağında.
Serpiştirme: çöp, gazete, plastik şişe, karo kırıkları, balast taşları peron kenarında.

KOLONLAR: peronda iki sıra, X boyunca her 8 m'de 0.8×0.8×3 m "Column_NN" (karo kaplı, köşeleri kırık, alt kısmı kirli), yüzlerinde "SignScreen_NN" küçük dijital tabela, bazıları kırık.

TRENLER (kahraman nesne): 4 üstü açık vagon, merkezleri (±17, ±10), X boyu 20 m, Z genişliği 5 m, duvar 2.6 m. Gerçekçi metro vagonu: kayar kapı panelleri (her uzun yanda 2.2 m'lik 3 kapı boşluğu, kapı kanatları yarı açık yanda), oturma sıraları (0.5 m), tutunma direkleri (ince, gövdeye 5 cm kurala uygun ya da "_Canopy" tavan tutunma barları), dış gövdede grafiti ve kir, tekerlek bojileri görünür. Zemin Y=0 "TrainCar_Floor_NN", duvarlar ayrı "SubwayCar_Wall_NN". X[-7,7] arasında vagon yok.

HOL SINIRI: Z=±14'te duvar, en az 4 adet 4 m geçiş; geçişlerde 0.9 m paslanmaz turnike sıraları (zıplanır) + yanında serbest 2.5 m yan koridor. Hollerde bilet gişesi blokları (2.5 m, kırık camlı), bilet otomatları, reklam panoları (yırtık afişler), bakım odaları (X=±24 civarında 8×8 m, 2 kapılı; içinde elektrik panoları, kablo makaraları, alet dolapları).
DOĞU/BATI UÇ: X[40,55] tünel ağzı bakım salonu (Y 0 ile -0.2 arası), tüneller 6 m içerde çökmüş beton ve iskele ile kapalı (katı).

SPAWN (Team0→3): (-45,-28), (45,-28), (-45,28), (45,28), köşe bilet holleri, her birinden ≥ 2 çıkış.
KART: (±22, 0) peron; (±14, ±10) vagon içi; (0, ±20) hol ortası; (±24, ±20) bakım odaları. Toplam 12.
KAPI: (±10, 0) ve (±32, 0) peron üstü (kolon sıraları arasında 3.5 m yarıçap boş; gerekirse kolonları kaydır); (±50, 0) tünel salonu; (0, ±29), (±12, ±29) sokak merdiveni cepleri (merdiven dekor, katı duvarla biter). Toplam 12.
EMISSION: tabelalar ve birkaç sağlam floresan şerit "Neon_NN", güç ≤ 1.5.
```

---

## 4. Gece Orman Radar Üssü (4v4v4v4)

```text
HARİTA: Gece Orman Radar Üssü. Kök: Night_Forest_Radar_Map. Dosya: Map4_Gece_Orman_Radar_Ussu_4v4v4v4.gltf. Dış ölçü: 112×84 m (X ±56, Z ±42). Karakter: organik, ağaç gövdesi siperli orman + merkezde sert köşeli askeri üs. Görüş kısa, pusu için ideal. Nemli, çamurlu, soğuk.

MALZEME SETLERİ: orman zemini yaprak + toprak (forest floor leaves), çamur (mud), yosunlu toprak (moss ground), çam iğnesi örtüsü (pine needles ground), ağaç kabuğu çam ve meşe (pine bark, oak bark), yosunlu kaya (mossy rock), askeri beton (concrete bunker), boyalı askeri metal (olive drab painted metal), kum torbası, ahşap kereste (wood planks), paslı yakıt tankı.

ZEMİN: "Terrain_Forest", 4 malzeme bölgesi: yaprak örtülü orman zemini, ağaç diplerinde çam iğnesi, patikalarda ve üs çevresinde çamur, kaya etrafında yosun. Mikro dalga ±0.15 m.
Decal'ler: araç ve bot izleri (çamurda), su birikintileri, düşmüş yaprak kümeleri, kırık dallar, üs betonunda yağ lekeleri ve çatlaklar.
Serpiştirme: dal, kozalak, taş, yaprak kümeleri. Ot, eğrelti ve çalı öbekleri (Grass/…_Canopy), ağaç diplerinde yoğun.

ÇEVRE: "Rock_Perimeter_NN" yosunlu kaya + sık ağaç gövdesi + eski tel örgü çit, 3–5 m, kesintisiz, yürünmez.

MERKEZ ÜS: X[-20,20], Z[-14,14], "Base_Floor" çatlak beton Y=0, üstü açık, 3 m beton duvarlar (kalıp izleri, akıntı lekeleri, askeri şablon yazılar). Her kenarda 2 adet 3.5 m geçit (sürgülü tel kapı yarı açık). İçeride: komuta odası kuzey (masalar, harita panosu, telsiz rafları), sunucu odası güney (kabinler 2 m, kablo kanalları), doğu/batı ekipman odaları (raf, kasa, jeneratör); arada 4 m koridorlar. Avluda radar direği "RadarMast" (1 m çap, kafes detaylı ama çarpışma gövdesi sade silindir; kafes "_Canopy"), çanak "RadarDish_Canopy" ≤ 8.5 m. Üs köşe dışlarında mobil füze kamyonu (2.4 m, detaylı, kamuflaj ağı "_Canopy") — kapı noktalarını kapatmasın.

DERE: üssün doğu ve batısında X=±30 hattında (±1.5 m kıvrım), 3 m geniş, kuzey-güney akan sığ dere. Yatak Y=-0.2, Terrain'in parçası (delik yok), çakıllı ve çamurlu, kenarlarında taşlar. Üstünde "StreamWater_NN" Y=-0.1 görsel yüzey (koyu, yansıtıcı, düşük roughness, emission yok). 3 ahşap geçit "FootBridge_NN" (Y=0.1, 4 m geniş, tahtalar tek tek, eskimiş).

DIŞ KUŞAK: 50–70 ağaç, en az 4 farklı model (2 çam, 2 meşe) + rastgele ölçek/dönüş. Gövde "PineTree_NN_Trunk" / "OakTree_NN_Trunk" (yarıçap 0.35–0.6 m, gerçek kabuk dokulu, kök çıkıntıları gövdeye yapışık ≤ 5 cm), tepe "PineTree_NN_Needles" / "OakTree_NN_Canopy" (5–8 m, alfa maskeli yaprak kartları, hacimli; düz top/koni değil), linked mesh. Gövdeler arası ≥ 2.5 m; kümeler arası ≥ 3.5 m rotalar; her köşeden üsse 3 belirgin patika (çamur bölgesi).
(±18, ±24) çevresinde 12×10 m ileri karakollar: KB beton sığınak (atış delikleri, kum torbaları), KD ahşap kışla (çatısız, ranzalar), GB kereste atölyesi (tomruk yığını 2 m, testere tezgâhı), GD yakıt tankı parkı ("FuelTank_NN" 2.5 m, paslı).
(±34, ±6): derenin dış yakasında kum torbası mevzisi + jeneratör.

SPAWN (Team0→3): (-46,-34), (46,-34), (-46,34), (46,34), 6 m yarıçaplı orman açıklıkları (devrik ağaç, kamp ateşi kalıntısı), ≥ 2 patika çıkışı.
KART: (0, ±9); (±14, 0); (±34, ±6); (±18, ±24). Toplam 12.
KAPI: (0, ±36), (±16, ±36) kuzey-güney çit açıklıkları; (±51, 0) doğu-batı yol ağzı; (±24, ±13) üs köşesi dışı açıklıklar. Toplam 12. Bu noktaların 3.5 m içinde ağaç/kamyon yok.
EMISSION: üs üzerinde küçük kırmızı uyarı ışıkları "BeaconLED_NN", güç ≤ 1.5. Başka parlayan yüzey yok.
```

---

## 5. Gece Konteyner Limanı (5v5v5v5)

```text
HARİTA: Gece Konteyner Limanı. Kök: Night_Container_Port_Map. Dosya: Map8_Gece_Konteyner_Limani_5v5v5v5.gltf. Dış ölçü: 124×92 m (X ±62, Z ±46). Karakter: kuzeyde dar konteyner sokakları, güneyde su üstünden açık atış hatları + gemi güvertesi. Islak, yağmur sonrası, endüstriyel.

MALZEME SETLERİ: ıslak beton rıhtım (wet concrete), asfalt (asphalt), oluklu konteyner metali + boya + pas (shipping container / corrugated painted metal rust), gemi güvertesi boyalı çelik (ship deck painted steel), paslı çelik (rusted steel), kauçuk usturmaça (rubber fender), halat (rope), sarı-siyah uyarı boyası (hazard stripes), ahşap palet (wood pallet).

ZEMİN: U-planlı rıhtım "Quay_Deck_NN" Y=0: kuzey blok Z[-46,8] tüm genişlik + doğu/batı kollar X[30,62] ve X[-62,-30], Z[8,46]. Rıhtım ≥ 2 m kalın kapalı kutu, yanları Y=-2'ye iner; rıhtım kenarında beton bordür, usturmaçalar, babalar (0.6 m), demir merdiven izleri (dekor). Yüzey: ıslak beton + asfalt şeritleri, sarı şerit çizgileri.
Havuz X[-30,30], Z[8,46] zeminsiz: "Harbor_Water_Basin" tek mesh Y=-1.5, koyu, yansıtıcı (düşük roughness, normal map dalga), emission YOK, çarpışmasız.
Decal'ler: su birikintileri (geniş, yansıtıcı), yağ lekeleri, forklift ve tır lastik izleri, pas akıntıları (konteyner diplerinde), yer işaretleri (numaralı park yerleri, sarı çizgiler), kırık beton yamaları.
Serpiştirme: zincir parçaları, cıvata, palet tahtası, halat parçaları, çöp.

GEMİ (kahraman nesne): güverte "CargoShip_Deck" X[-20,20], Z[16,36], Y=0.2 (boyalı çelik, kaynak dikişleri, pas akıntıları, yürüme yolu boyası, ambar kapakları). Altında gövde "CargoShip_Hull" Y=-2…0.2 (yanları kapalı, su hattında pas ve yosun). Güverte kenarı "ShipRail_NN" 0.9 m (korkuluk direkleri tek tek). 4 geçit rampası "ShipGangway_Deck_NN" (4 m geniş, Y 0→0.2, kaymaz sac): X=±25, Z=20 ve Z=32 + 2 kuzey rampası X=±10, Z[8,16]. Güvertede 2.6 m konteyner yığınları (bağlama çubukları), vinç kaidesi, kaptan köşkü bloğu (üstü açık, 3 m duvar, lumbuz detaylı); kart ve kapı çevresi açık.

KONTEYNER SAHASI (kuzey): Z[-36,-6]: oluklu konteynerler ("Container_NN", 12×2.5 m, kapı kolları, kilit çubukları, firma logosu olmayan seri numarası şablonları, boya solması, ezik ve pas — her konteyner farklı renk tonu ve eskime). 3 sıra, sokak ≥ 3.5 m, 4 tanesi iki ucu açık geçit tüneli (üstü açık). Yığın görünüşü en fazla 2 kat (Y ≤ 5.2).
Z[-6,8] açık rıhtım şeridi: X=±15 civarında 2 dev rıhtım vinci: 4 ayak "Crane_Leg_NN" (1×1 m çarpışma gövdesi, kafes detay "_Canopy"), üst kiriş "GantryCrane_NN_Canopy" Y ≤ 9; ayak tekerlek bojileri ve raylar. Şerit 1.9 m'lik beton bloklar, kablo makaraları, forkliftler (2 m) ile kırılsın.
Kollar (X±30…62, Z 8…46): gümrük kulübesi (çatısız), depo blokları (3 m), konteyner adacıkları, palet yığınları.

SPAWN (Team0→3): (-52,-38), (52,-38), (-52,38), (52,38). Kuzey ikisi konteyner sevkiyat ofisi önü, güney ikisi kol ucu iskele; takım rengi işareti yok.
KART: (0,22), (-12,30), (12,30) güverte; (-15,-4), (15,-4) vinç altı; (-34,2), (34,2) kol başı; (-38,24), (38,24) kol ortası; (-36,-22), (36,-22) konteyner sahası; (0,-32) kuzey sokak. Toplam 12.
KAPI: (0,-40), (-24,-40), (24,-40) gümrük kapıları; (-56,0), (56,0) yan kapılar; (-24,0), (24,0) rıhtım şeridi; (-36,-12), (36,-12) saha kenarı; (-36,12), (36,12) kol başı; (0,32) gemi tahliye noktası. Toplam 12. Her birinde 3.5 m açık alan.
EMISSION: vinçte küçük ikaz ışıkları "Crane_Neon_NN", güç ≤ 1.5. Su ve büyük panel parlamaz.
```
