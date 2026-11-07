# TacticalDark — Blender Harita Üretim Prompt'ları

Blender'da Python (bpy) ile harita üreten yapay zekaya verilecek prompt'lar.
Gerekçeler, doğrulama sonuçları ve oyuna ekleme adımları: [HARITA_URETIM_NOTLARI.md](HARITA_URETIM_NOTLARI.md).

**Kullanım:** Her harita için önce **Ortak Şartname**'yi, hemen altına **tek bir harita prompt'unu** yapıştır.

---

## Ortak Şartname (her haritanın başına)

```text
GÖREV: Blender 4.x için tek parça, baştan sona çalışan bir bpy Python betiği yaz. Betik aşağıdaki haritayı prosedürel olarak kursun, doğrulasın ve GLB olarak dışa aktarsın. Harita "TacticalDark" için: Godot 4, 4 takımlı (ör. 5v5v5v5) FFA, üstten 50° kameralı (oyuncunun 14 m üstünde, 12 m gerisinde) taktik nişancı. Harita çok karanlık, oyuncular el feneri kullanıyor. Amaç: kartı bulup çıkış noktasında 5 sn kilit açmak.

KOORDİNAT VE BİRİM
- 1 birim = 1 metre. Aşağıdaki tüm koordinatlar Godot [X, Y, Z] (Y yukarı, kuzey = -Z).
- Blender'a çevirmek için yardımcı fonksiyon kullan: gd(x,y,z) -> (x, -z, y).
- Harita merkezi dünya orijininde olsun. Kök Empty dışında tüm nesnelerde ölçek ve dönüşü uygula (apply), normalleri dışa çevir, negatif ölçek kullanma.

OYUNCU ÖLÇÜLERİ
- Kapsül yarıçapı 0.35 m, boyu 1.8 m. Mermi namludan yaklaşık 1.55 m yükseklikte doğar ve TAM YATAY gider (yukarı/aşağı nişan yok).
- 0.42 m'ye kadar basamak otomatik çıkılır, 0.95 m'ye kadar zıplanır, üstü aşılamaz.

KRİTİK YÜKSEKLİK KURALI
- Tüm oyun alanı tek seviyedir: yürünen zemin her yerde Y = -0.25 ile +0.25 arasında olsun. Yerdeki yumuşak dalgalanma da bu aralıkta kalsın.
- 0.25 m'den yüksek platform, çukur, ikinci kat, balkon, köprü altı geçit YOK. Sebep: daha yüksekteki oyuncunun mermisi alttakinin üstünden geçer, çukurdaki oyuncu da üstten vurulamaz.
- Engel sınıfları:
  a) Alçak: 0.5–0.95 m. Üstünden zıplanır, mermi durdurmaz. Rota kısayolu için.
  b) Tam siper: en az 1.9 m. Mermiyi ve hareketi keser.
  c) 1.0–1.8 m arası engel yapma.
- Duvarlar 3.0 m yüksek ve en az 0.4 m kalın, kapalı kutu geometri olsun (tek düzlem duvar YASAK, arkadan çarpışmaz).

ÜSTÜ AÇIK TASARIM
- Yürünen hiçbir yerin üstünde çatı veya çarpışmalı geometri olmasın. Binalar çatısız kesit gibi olsun.
- Üstte görünmesi gereken her şey (tente, ağaç tepesi, vinç kirişi, kablo, boru) adında "_Canopy" taşısın; oyun bunları çarpışmasız yapar ve oyuncuyu kapatınca saydamlaştırır.
- En yüksek nesne Y=9 m'yi geçmesin. En düşük geometri Y=-3 m'nin altına inmesin.

ALAN VE AKIŞ
- Harita dış ölçüsü prompt'taki değer olsun. HİÇBİR mesh bu dikdörtgenin dışına taşmasın: oyun tüm mesh'lerin sınır kutusunu oyun alanı ve mini harita kabul eder. Uzak dağ, gökyüzü küresi, arka plan yok.
- Zeminde delik olmasın (istisna: prompt suyu açıkça isterse). Kenarları 3-6 m yükseklikte kesintisiz çevre engeli kapatsın.
- Koridor en az 3.5 m, kapı açıklığı en az 2.2 m, her oda en az 2 çıkışlı olsun; çıkmaz sokak yapma.
- Tek hat görüş 45 m'yi geçmesin. En geç her 12-15 m'de tam siper olsun.
- Oyun noktaları dört takım için simetrik. Görsel detay simetriyi kırabilir ama spawn/kart/kapı rotaları eşit uzunlukta kalsın.
- Takım bölgelerini renkle veya platformla işaretleme. Pad_Team mesh'i oluşturma.

SAHNE AĞACI (isimler birebir)
<KokAdi> (Empty, kimlik dönüşümü)
├ SpawnPoints (Empty)
│  ├ Team0_Spawn … Team3_Spawn (bu sırayla; her birinde tam 5 çocuk Empty: Team0_Spawn_P1…P5)
├ CardPoints (Empty) → CardPoint_01…12 (Empty)
├ DoorPoints (Empty) → DoorPoint_01…12 (Empty)
├ WallLamps (boş Empty)
└ Geometry (Empty) → tüm mesh'ler
- Noktalar gerçek Empty olsun, altlarına mesh koyma. Yükseklikler: spawn Y=0.25, kart Y=1.15, kapı Y=0.1.
- 5 spawn dizilimi: merkez + (±1.7, ±1.7) ofsetleri. Çevresinde 4 m yarıçap düz ve engelsiz olsun.
- Kapı noktasında 3.5 m yarıçap düz, engelsiz ve en az 2 yönden erişilebilir olsun. Kapı modeli YAPMA, oyun kendi çizer.
- Kart noktasında 2 m yarıçap engelsiz olsun, altına Prop_CardPedestal_NN koy (yarıçap en fazla 0.4 m, yükseklik 0.45 m, hepsi aynı görünümde).
- Spawn, kart ve kapı noktalarının üstünde 3 m içinde çarpışmalı geometri olmasın.
- Güç noktası ve duvar lambası YAPMA; oyun bunları duvarlara göre otomatik üretir.

İSİMLENDİRME (oyun mesh adına bakarak çalışır, büyük/küçük harf duyarlı)
- Şu parçaları içeren mesh ÇARPIŞMASIZ olur: Canopy, Needles, Frond, Neon, LED, Holo, CardVisual, Beacon, GlowRing, Water, Pool, Basin, Screen, Glass, Light, Lamp, Horn, Pad_Team.
- Yani katı nesnelere bu kelimeleri KOYMA: "WaterTower", "StreetLight_Pole", "Glass_Wall", "Lighthouse" yanlış; içinden geçilir.
- Duvarda pencere boşluğu bırakma. Cam görünümü gerekiyorsa katı duvarın önüne ince dekor olarak ekle.
- Şu kelimeleri içeren mesh hiç saydamlaşmaz, sadece zemin benzerlerinde kullan: Terrain, Floor, Ground, Deck, Plaza, Driveway, Bridge.
- İsimler İngilizce, ASCII olsun; nokta, boşluk, "-col", "-noimp", ".001" olmasın. İki haneli sayı kullan (Wall_017).

MESH YAPISI
- Duvarları ve binaları TEK mesh'te birleştirme: her duvar 6–15 m'lik ayrı nesne olsun, çünkü kameradan oyuncuyu kapatan nesne bütünüyle saydamlaşır.
- Küçük dekorları (kablo, enkaz parçası, kapı kolu) bölge başına birleştir ve zemine yapışık, 0.4 m'den alçak tut.
- Bütçe: toplam 40.000–120.000 üçgen, en fazla yaklaşık 500 nesne, zemin 15.000 üçgenden az. Tekrarlanan nesnelerde linked mesh kullan. Silindirde 8–16 kenar yeterli.

MALZEME VE IŞIK
- Sadece Principled BSDF. Prosedürel doku düğümleri dışa aktarılmaz, kullanma: düz renk + roughness/metallic varyantları kullan, nesne bazında 3-4 renk tonu ile çeşitlilik sağla. İstersen 1024 px'e kadar image texture bake et.
- Baz renkler koyu-orta olsun (doğrusal 0.08–0.45) ki el feneri okunsun.
- Işık ve kamera nesnesi EKLEME.
- Emission SADECE küçük yüzeylerde olsun (şerit, tabela) ve gücü 2'yi geçmesin. Geniş yüzeyde (su, zemin, büyük panel) emission YASAK: oyuncu haritada el fenerine ihtiyaç duymalı.

BETİK SONU
1. Doğrulama raporu yazdır: üçgen ve nesne sayısı; dünya sınır kutusu (alan dışına taşma varsa hata); 5×4 spawn, 12 kart, 12 kapı sayımı; her kapının en yakın spawn'a mesafesi (en az 25 m); her kartın en yakın spawn'a mesafesi (en az 15 m); yasak kelime içeren katı nesneler; 3 m içinde üstü kapalı noktalar.
2. Üstten ortografik PNG önizleme kaydet (yeşil spawn, sarı kart, kırmızı kapı işaretli).
3. bpy.ops.export_scene.gltf(filepath=<prompt'taki ad>, export_format='GLB', export_yup=True, export_apply=True, export_lights=False, export_cameras=False, use_selection=False) ile GLB aktar.
Bu kuralların hepsi harita tarifinden önceliklidir. Çelişki görürsen kuralı uygula ve raporda belirt.
```

---

## 1. Çöl Kargo Uçağı Enkazı (5v5v5v5)

```text
HARİTA: Çöl Kargo Uçağı Enkazı. Kök: Desert_Crash_Map. Dosya: Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5.glb. Dış ölçü: 124×92 m (X ±62, Z ±46). Karakter: orta-uzak görüş hatları, kaya ve enkaz siperleri, orta bölgede sürekli çatışma. Gece vakti soğuk ay rengiyle yıkanmış kum.

ZEMİN: "Terrain_Sand" tek mesh, ±0.2 m hafif kum dalgası, koyu bej-gri. Etrafta "Rock_Perimeter_NN" kızıl kanyon kayaları 4-6 m ile kesintisiz çevre.

MERKEZ: İkiye bölünmüş nakliye uçağı. Gövde parçaları X[-26,-6] ve X[6,26], Z ekseninde 6 m genişlik, Z=0 hattında. Üstü açık U kesit, 3 m kalın kaburgalı yan duvarlar, iki uçları açık, her yan duvarda 2.4 m'lik 2 yırtık geçit. İç zemin Y=0.1 ("Fuselage_Floor"). Ortadaki X[-6,6] enkaz sahası: 1.9 m+ motor ve kanat parçaları, aralarından en az 3.5 m'lik 3 rota. Kuzey ve güneye uzanan kırık kanatlar 2 m+ yüksekliğe yığılmış ayrı siper parçaları olsun.

DÖRT ÇEYREK: Her çeyrekte (±36, ±18) merkezli 14×9 m üstü açık kemerli hangar iskeleti ("Quonset_Wall_NN"): uzun kenarlar 3 m duvar, iki kısa kenarda 4 m kapı; içinde 1.9 m kasa siperleri.
(±14, ±30) civarında kum torbası (0.9 m, alçak) ve Humvee (2 m, tam siper) kontrol noktası.
(0, ±22) çevresinde krater kenarı kaya kümeleri ve arka gövde parçaları (2-3 m), kart etrafı açık.
Uzun hatları kırmak için boş alanlara 6-8 adet 2-3 m kaya kümesi koy.

SPAWN (Team0→3): (-52,-38), (52,-38), (-52,38), (52,38). Her köşe kayalarla yarı kapalı küçük kamp (en az 2, en az 4 m genişlikte çıkış), çadır "Tent_Canopy" dekor.
KART: (±13, 0) uçak içi; (0, ±22) krater; (±36, ±18) hangarlar; (±14, ±30) kontrol noktaları. Tüm işaret kombinasyonları, toplam 12.
KAPI: (0, ±40), (±22, ±40), (±56, 0) kanyon geçidi cepleri; (±24, ±12) uçak kanadı çevresi açık alanlar. Tüm işaret kombinasyonları, toplam 12.
Bu noktaların çevresini genel kurallardaki gibi boş bırak.
EMISSION: Sadece uçağın kırmızı küçük acil şeritleri ("Neon_Strip_NN"), güç en fazla 1.5.
```

---

## 2. Karantina Hastanesi (3v3v3v3)

```text
HARİTA: Karantina Hastanesi. Kök: Quarantine_Hospital_Map. Dosya: Map5_Karantina_Hastanesi_3v3v3v3.glb. Dış ölçü: 92×68 m (X ±46, Z ±34). Karakter: yakın mesafe, kör köşeler, bıçak ve bomba haritası. Kirli beyaz-gri duvar, soluk yeşil koğuş, terk edilmiş ve bozuk.

ZEMİN: Tek seviye "Floor_NN" bölge başına ayrı mesh (koridor gri karo, koğuş soluk yeşil, yoğun bakım soluk mavi), hepsi Y=0. Dış kenar 3 m+ "Wall_Perimeter_NN".

PLAN: Merkezde yarıçapı 18 m yuvarlak triyaj rotundası (8 kenar yeterli), ortasında 4 m yarıçaplı, 2 m yüksekliğinde hemşire bankosu, rotunda duvarında 8 eşit dağıtılmış 3 m kapı. Rotundadan 4 yöne 5 m genişlikli ana koridorlar çıksın: X=0 hattı kuzey-güney, Z=0 hattı doğu-batı. Dört çeyreğin her biri 8–12 m boyutlu 3-4 oda + aralarında 3.5 m servis koridoru, her odada en az 2 kapı (2.2 m).
Çeyrek temaları: KB MR odası (MRI_Scanner 2 m, tam siper), KD ameliyathane (masa 0.9 m alçak; "SurgicalLamp_Canopy" üstte), GB yoğun bakım (ICUBed 0.7 m, paravan 2 m), GD morg ve bekleme salonu (dolap blokları 2 m, koltuk 0.8 m).

SPAWN (Team0→3): (-38,-28), (38,-28), (-38,28), (38,28). Dört köşede üstü açık ambulans avlusu, ambulans 2.2 m tam siper; her avludan koridora en az 2 çıkış.
KART: (0, ±13) rotunda içi; (±24, 0) doğu-batı koridor genişlemesi; (±26, ±13) dış koğuşlar; (±16, ±22) iç koğuşlar. Toplam 12.
KAPI: (0, ±29) ve (±10, ±29) kuzey/güney acil lobileri (Z=±24…±31 arası tam genişlik lobi, 3.5 m boşluk her noktada); (±41, 0) doğu/batı giriş; (±12, ±8) rotunda içi. Toplam 12. Rotunda içindeki banko bu noktaları kapatmasın.
Dekor: "Holo" kullanma, kırmızı haçlar ve yönlendirme şeritleri "HospitalRedCross_NN" / "ER_RedGuideLine_NN", düşük emission (en fazla 1.0).
```

---

## 3. Yeraltı Metro İstasyonu (4v4v4v4)

```text
HARİTA: Yeraltı Metro İstasyonu. Kök: Underground_Subway_Map. Dosya: Map6_Yeralti_Metro_Istasyonu_4v4v4v4.glb. Dış ölçü: 110×68 m (X ±55, Z ±34). Karakter: uzun doğu-batı hatları, kolonlu perondan tren vagonlarına kısa kesişler. Paslı beton, seramik karolar, sararmış tabelalar.

ZEMİN: Tek seviye. Ada peronu "Platform_Floor": X[-40,40], Z[-5,5], Y=0. Ray yatakları "TrackBed_Floor": Z[5,14] ve Z[-14,-5], Y=-0.2 (çukur DEĞİL, sadece 0.2 m basamak, otomatik aşılır); raylar 5 cm kabartma dekor. Yan holler "Hall_Floor": Z[14,34] ve Z[-34,-14], Y=0.

KOLONLAR: Peronda iki sıra, X boyunca her 8 m'de 0.8×0.8×3 m "Column_NN" (tam siper). Kolon yüzüne "SignScreen_NN" küçük tabela.

TRENLER: 4 üstü açık vagon, merkezleri (±17, ±10), X boyu 20 m, Z genişliği 5 m, duvar 2.6 m, her uzun yanda 2.2 m'lik 3 kapı boşluğu, uçlar açık, zemin Y=0 ("TrainCar_Floor_NN"), ayrı ayrı "SubwayCar_Wall_NN" duvar nesneleri. X[-7,7] arasında vagon yok, burası peron-hol geçişi.

HOL SINIRI: Z=±14'te duvar, en az 4 adet 4 m geçiş; geçişlerde 0.9 m turnike sıraları (alçak, zıplanır) ve yanında serbest 2.5 m yan koridor. Hollerde bilet gişesi blokları (2.5 m), reklam panoları ve bakım odaları (X=±24 civarında 8×8 m odalar, 2 kapılı).
DOĞU/BATI UÇ: X[40,55] aralığında tünel ağzı bakım salonu, Y=0 ile -0.2 arası; tüneller 6 m içerde katı duvarla biter.

SPAWN (Team0→3): (-45,-28), (45,-28), (-45,28), (45,28), köşe bilet holleri, her birinden en az 2 çıkış.
KART: (±22, 0) peron; (±14, ±10) vagon içi; (0, ±20) hol ortası; (±24, ±20) bakım odaları. Toplam 12.
KAPI: (±10, 0) ve (±32, 0) peron üstü (kolon sıraları arasında 3.5 m yarıçap boş; kolonları gerekiyorsa kaydır); (±50, 0) tünel salonu; (0, ±29), (±12, ±29) sokak merdiveni cepleri (merdiven dekor, tırmanılmaz katı duvar). Toplam 12.
EMISSION: Tabelalar ve ince tavan şeritleri "Neon_NN" en fazla 1.5; geniş panel yok.
```

---

## 4. Gece Orman Radar Üssü (4v4v4v4)

```text
HARİTA: Gece Orman Radar Üssü. Kök: Night_Forest_Radar_Map. Dosya: Map4_Gece_Orman_Radar_Ussu_4v4v4v4.glb. Dış ölçü: 112×84 m (X ±56, Z ±42). Karakter: organik, ağaç gövdesi siperli orman + merkezde sert köşeli askeri üs. Görüş kısa, pusu için ideal. Koyu yeşil, çamur, soğuk beton.

ZEMİN: "Terrain_Forest" ±0.2 m dalgalı, koyu toprak-yosun tonları. Çevre: "Rock_Perimeter_NN" kaya + çit, 3-5 m, kesintisiz.

MERKEZ ÜS: X[-20,20], Z[-14,14], "Base_Floor" beton Y=0, üstü açık, 3 m duvarlar. Her kenarda 2 adet 3.5 m geçit. İçeride komuta odası kuzey, sunucu odası güney (kartlar (0,±9)), doğu/batı ekipman odaları (kartlar (±14,0)), arada 4 m koridorlar. Avluda radar direği: "RadarMast" 1 m çap katı; çanak "RadarDish_Canopy" en fazla 8.5 m yükseklik, çarpışmasız. Üs köşe dışlarında mobil füze kamyonu (2.4 m tam siper) yer alsın, ama aşağıdaki kapı noktalarını kapatmasın.

DERE: Üssün doğu ve batısında X=±30 hattında (±1.5 m kıvrım), 3 m geniş, kuzey-güney akan sığ dere. Yatak Y=-0.2 ve Terrain'in parçası (delik yok). Üstünde "StreamWater_NN" Y=-0.1 görsel yüzey, emission YOK, düşük roughness. Üstünde 3 adet ahşap geçit "FootBridge_NN", Y=0.1, 4 m geniş.

DIŞ KUŞAK: 45–60 ağaç. Gövde "PineTree_NN_Trunk" / "OakTree_NN_Trunk" (yarıçap 0.35–0.6 m, katı), tepe "PineTree_NN_Needles" / "OakTree_NN_Canopy" (5–8 m yükseklik, çarpışmasız, linked mesh). Çalı "Shrub_NN_Canopy" dekor. Gövdeler arası en az 2.5 m. Kümeler arasında en az 3.5 m'lik rotalar olsun; her köşeden üsse 3 belirgin yol kalsın.
(±18, ±24) çevresinde 12×10 m ileri karakollar: KB sığınak, KD kışla, GB kereste atölyesi (tomruk yığını 2 m), GD yakıt tankı parkı ("FuelTank_NN" 2.5 m).
(±34, ±6) derenin dış yakasında kum torbası + jeneratör noktası.

SPAWN (Team0→3): (-46,-34), (46,-34), (-46,34), (46,34), yarıçapı 6 m orman açıklıkları, en az 2 patika çıkışı.
KART: (0, ±9); (±14, 0); (±34, ±6); (±18, ±24). Toplam 12.
KAPI: (0, ±36), (±16, ±36) kuzey-güney çit açıklıkları; (±51, 0) doğu-batı yol ağzı; (±24, ±13) üs köşesi dışı açıklıklar. Toplam 12. Bu noktaların 3.5 m içinde ağaç/kamyon olmasın.
EMISSION: Üs üzerindeki küçük kırmızı uyarı noktaları "BeaconLED_NN", en fazla 1.5. Başka parlayan yüzey yok.
```

---

## 5. Gece Konteyner Limanı (5v5v5v5)

```text
HARİTA: Gece Konteyner Limanı. Kök: Night_Container_Port_Map. Dosya: Map8_Gece_Konteyner_Limani_5v5v5v5.glb. Dış ölçü: 124×92 m (X ±62, Z ±46). Karakter: kuzeyde dar konteyner sokakları, güneyde su üstünden açık atış hatları + gemi güvertesi. Islak beton, paslı çelik, koyu renkli deniz.

ZEMİN: U-planlı rıhtım "Quay_Deck_NN" Y=0: kuzey blok Z[-46,8] tüm genişlik + doğu/batı kollar X[30,62] ve X[-62,-30], Z[8,46]. Rıhtım en az 2 m kalın kapalı kutu, yanları Y=-2'ye iner. Havuz alanı X[-30,30], Z[8,46] zeminsizdir: "Harbor_Water_Basin" tek mesh, Y=-1.5, koyu lacivert, emission YOK, çarpışmasız. Deniz alanında başka zemin yok (oyun orayı otomatik kapatır; mermi üstünden geçer).

GEMİ: Güverte "CargoShip_Deck" X[-20,20], Z[16,36], Y=0.2. Altında gövde "CargoShip_Hull" Y=-2…0.2 (yanları kapalı). Güverte kenarı "ShipRail_NN" 0.9 m. 4 geçit rampası ("ShipGangway_Deck_NN", 4 m geniş, Y 0→0.2): X=±25, Z=20 ve Z=32 (kollardan güverteye) + 2 kuzey rampası: X=±10, Z[8,16] (rıhtımdan güverteye). Güvertede 2.6 m konteyner yığınları ve kaptan köşkü bloğu (üstü açık, 3 m duvar); kart ve kapı noktaları çevresi açık.

KONTEYNER SAHASI (kuzey): Z[-36,-6]: 2.6 m oluklu konteynerler ("Container_NN", 12×2.5 m), 3 sıra, sokak genişliği en az 3.5 m, 4 tanesi iki ucu açık geçit tüneli olarak üstü açık yapılır. Renkler paslı kırmızı/mavi/yeşil ama koyu. Yığın üst üste en fazla 2 kat görünüm, iki kat toplam Y en fazla 5.2.
Z[-6,8] açık rıhtım şeridi: X=±15 civarında 2 dev vinç: 4 ayak ("Crane_Leg_NN" 1×1 m, katı) + üst kiriş "GantryCrane_NN_Canopy" Y en fazla 9, çarpışmasız. Bu şerit 1.9 m'lik beton blok ve kablo makaralarıyla kırılsın.
Kollar (X±30…62, Z 8…46): gümrük kulübesi, depo blokları (3 m), konteyner adacıkları.

SPAWN (Team0→3): (-52,-38), (52,-38), (-52,38), (52,38). Kuzey ikisi konteyner sevkiyat ofisi, güney ikisi kol ucu iskele; takım bölgesi renk işareti yok.
KART: (0,22), (-12,30), (12,30) güverte; (-15,-4), (15,-4) vinç altı; (-34,2), (34,2) kol başı; (-38,24), (38,24) kol ortası; (-36,-22), (36,-22) konteyner sahası; (0,-32) kuzey sokak. Toplam 12.
KAPI: (0,-40), (-24,-40), (24,-40) gümrük kapıları; (-56,0), (56,0) yan kapılar; (-24,0), (24,0) rıhtım şeridi; (-36,-12), (36,-12) saha kenarı; (-36,12), (36,12) kol başı; (0,32) gemi tahliye noktası. Toplam 12. Her birinde 3.5 m açık alan bırak.
EMISSION: Vinçte küçük ikaz şeritleri "Crane_Neon_NN" en fazla 1.5. Su ve büyük panel parlamaz.
```
