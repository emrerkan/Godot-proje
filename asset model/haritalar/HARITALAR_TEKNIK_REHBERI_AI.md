# TacticalDark — 4 Özel Harita İçin Yapay Zeka (AI) Entegrasyon ve Teknik Rehberi

Bu doküman, `haritalar` klasöründe bulunan **4 adet High-Poly `.glb` oyun haritasının** Godot 4.x (`Forward+` / `Compatibility`) projesine bir yapay zeka (AI ajan) veya geliştirici tarafından hatasız entegre edilmesi için hazırlanmıştır.

> **ÖNEMLİ KOORDİNAT SİSTEMİ NOTU:**
> Tüm `.glb` dosyaları Blender'dan **glTF 2.0 (Godot Y-Up)** standardında dışa aktarılmıştır. Bu dokümandaki tüm `[X, Y, Z]` koordinatları doğrudan **Godot 3D Dünya Koordinatlarıdır** (`Y` ekseni yüksekliktir, `X` Doğu/Batı, `Z` Güney/Kuzey düzlemidir).

---

## 1. Harita Dosyaları ve Kapasite Özeti

| # | Dosya Adı | Kök Düğüm (`Root Node`) Adı | Oyuncu Modu | Kart Adayı (`CardPoints`) | Kapı Adayı (`DoorPoints`) | Poligon (Triangle) |
| :-: | :--- | :--- | :---: | :---: | :---: | :---: |
| **1** | `Map1_Elcilik_Kompleksi_3v3v3v3.glb` | `Embassy_HighPoly_Palace` | **3v3v3v3** (Max 12 Kişi) | 10 Adet | 10 Adet | 54.492 |
| **2** | `Map2_Yeralti_Kuantum_Labirenti_5v5v5v5.glb` | `Quantum_Biotech_Labyrinth_HighPoly_Map` | **5v5v5v5** (Max 20 Kişi) | 12 Adet | 12 Adet | 171.028 |
| **3** | `Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5.glb` | `Desert_Canyon_Crash_HighPoly_Map` | **5v5v5v5** (Max 20 Kişi) | 12 Adet | 12 Adet | 49.352 |
| **4** | `Map4_Gece_Orman_Radar_Ussu_4v4v4v4.glb` | `Night_Forest_Radar_HighPoly_Map` | **4v4v4v4** (Max 16 Kişi) | 12 Adet | 12 Adet | 255.520 |

*Not: Her 4 haritada da 4 takımın her biri için **5'er adet** doğma noktası (toplam 20 `Node3D`) hazırdır. Haritanın maksimum oyuncu sınırına göre (ör. Map 1'de takım başı ilk 3 nokta, Map 4'te ilk 4 nokta, Map 2 ve 3'te 5 noktanın tamamı) kullanılır.*

---

## 2. Ortak Sahne Ağacı (`Scene Tree`) Hiyerarşisi

Her `.glb` dosyası Godot'ya eklendiğinde kök düğümün (`Root Node`) altında şu 4 standart oyun mantığı konteyneri (`Node3D`) bulunur:

```text
<Harita_Kok_Dugumu> (Node3D)
 ├── SpawnPoints (Node3D)          # 4 Takımın doğma grupları
 │    ├── <Takım_1_Grubu> (Node3D) # Altında 5 adet oyuncu doğma noktası (Node3D)
 │    ├── <Takım_2_Grubu> (Node3D)
 │    ├── <Takım_3_Grubu> (Node3D)
 │    └── <Takım_4_Grubu> (Node3D)
 ├── CardPoints (Node3D)           # 10 veya 12 adet rastgele kart doğma adayı (Node3D)
 │    ├── <Card_01> (Node3D)       # (Map 2 ve 4'te altında CardVisual_Keycard_XX mesh'i vardır)
 │    └── ...
 ├── DoorPoints (Node3D)           # 10 veya 12 adet rastgele çıkış kapısı adayı (Node3D)
 │    ├── DoorPoint_01 (Node3D)
 │    └── ...
 ├── WallLamps (Node3D)            # Işıklandırma grubu
 └── [Harita 3D Mesh Nesneleri]    # Duvarlar, zemin, araçlar, ağaçlar, Prop_CardPedestal_*, Prop_DoorBeacon_*
```

---

## 3. Karakter Spawnlama (`SpawnPoints`) Kuralları ve Kritik AI Notu

### ⚠️ KRİTİK KURAL 1: `.position` Yerine Mutlaka `.global_position` Kullanın!
* **Neden?**
  * `Map1` ve `Map3`'te takım grup düğümleri (`Team0..Team3`) `[0, 0, 0]` merkezindedir ve dünya koordinatları alt düğümlerde (`Team0_Spawn_1..5`) tutulur.
  * `Map2` ve `Map4`'te ise takım grup düğümleri (`Team1_Spawn..Team4_Spawn`) köşelerde (ör. `[-33, 0, -33]`) konumlandırılmıştır ve alt düğümler (`Team1_Spawn_P1..P5`) takım merkezine göre yerel ofset (`[-2.2, 0.25, -2.2]`) taşır.
  * Bu nedenle oyuncuyu doğururken **`spawn_node.global_position`** kullanıldığında **4 haritanın tamamında %100 doğru dünya koordinatı** elde edilir.

### ⚠️ KRİTİK KURAL 2: Düğüm İsimlerini Hardcode Etmek Yerine `get_children()` İndeksi Kullanın!
* `Map1` ve `Map3`'te takım düğümleri `Team0, Team1, Team2, Team3` olarak; `Map2` ve `Map4`'te ise `Team1_Spawn, Team2_Spawn, Team3_Spawn, Team4_Spawn` olarak adlandırılmıştır.
* Yapay zeka kod yazarken düğüm adına göre arama yapmak yerine doğrudan `SpawnPoints.get_children()[team_idx]` indekslemesini kullanmalıdır.

### Hazır GDScript — Evrensel Oyuncu Spawn Fonksiyonu:
```gdscript
# team_index: 0, 1, 2, 3 (4 Takım)
# player_slot: 0..4 (Takım içi oyuncu sırası, ör: 3v3v3v3'te 0..2, 4v4v4v4'te 0..3, 5v5v5v5'te 0..4)
func get_player_spawn_global_pos(map_root: Node3D, team_index: int, player_slot: int) -> Vector3:
	var spawn_points_root: Node3D = map_root.get_node_or_null("SpawnPoints")
	if not spawn_points_root:
		push_error("SpawnPoints düğümü bulunamadı!")
		return Vector3.ZERO
	
	var team_groups: Array[Node] = spawn_points_root.get_children()
	if team_index < 0 or team_index >= team_groups.size():
		return Vector3.ZERO
	
	var team_node: Node3D = team_groups[team_index]
	var slots: Array[Node] = team_node.get_children()
	if slots.is_empty():
		return team_node.global_position + Vector3(0.0, 0.5, 0.0)
	
	var target_slot: Node3D = slots[player_slot % slots.size()]
	# Karakterin zeminin içine gömülmemesi için Y ekseninde +0.5m güvenlik payı:
	return target_slot.global_position + Vector3(0.0, 0.5, 0.0)
```

---

## 4. Dinamik Kart Spawnlama (`CardPoints`) ve Görsel Kaide Yönetimi

Her haritada **1 adet erişim kartı (Keycard)** bulunur ancak bu kartın her maçta farklı bir yerde doğması için `CardPoints` altında **10 ila 12 adet aday nokta** (`Y = 1.15m` yüksekliğinde) yer alır.

### Sahnede Kart Yerlerini Gösteren Görsel Mesh'ler:
1. **`Prop_CardPedestal_01..12` (ve `Prop_CardHoloRing_01..12`):** Her kart aday noktasının tam altında (`Y = 0.48m`) bulunan metalik/neon kart terminali kaidesidir. Bu kaideler haritanın sabit dekoru olarak kalabilir; oyuncuya *"burası olası bir kart terminali noktasıdır"* bilgisini verir.
2. **`CardVisual_Keycard_01..12` (`Map2` ve `Map4`'te):** `CardSpawn_XX` düğümünün doğrudan alt çocuğudur (`MeshInstance3D`). Havada eğimli duran parlak yeşil 3B kart modelidir.

### Maç Başında Tek Bir Kart Noktasını Aktif Etme Mantığı:
* Maç başladığında (Sunucu/Host tarafında) `CardPoints.get_children()` listesinden rastgele **1 adet** düğüm seçilir.
* **Eğer oyunun kendi etkileşimli `Keycard.tscn` (`Area3D`) sahnesi varsa:**
  * Önce tüm `CardPoints` adaylarının altındaki örnek görsel kartlar (`CardVisual_Keycard_*`) gizlenir (`visible = false`).
  * Ardından seçilen `CardPoint` düğümünün `global_position` koordinatına oyunun gerçek `Keycard.tscn` objesi spawn edilir.

### Hazır GDScript — Rastgele Kart Seçimi ve Görsel Temizleme:
```gdscript
func spawn_random_keycard(map_root: Node3D, keycard_scene: PackedScene = null) -> Vector3:
	var card_root: Node3D = map_root.get_node_or_null("CardPoints")
	if not card_root or card_root.get_child_count() == 0:
		push_error("CardPoints bulunamadı!")
		return Vector3.ZERO
	
	var candidates: Array[Node] = card_root.get_children()
	var chosen_index: int = randi() % candidates.size()
	var chosen_node: Node3D = candidates[chosen_index]
	
	# Seçilmeyen adaylardaki görsel 3D kart mesh'lerini gizle:
	for i in range(candidates.size()):
		var c_node: Node3D = candidates[i]
		for child in c_node.get_children():
			if child is Node3D:
				# Eğer dışarıdan keycard_scene verildiyse hepsini gizle, verilmediyse sadece seçileni görünür bırak:
				child.visible = (keycard_scene == null and i == chosen_index)
	
	if keycard_scene:
		var card_instance: Node3D = keycard_scene.instantiate()
		map_root.add_child(card_instance)
		card_instance.global_position = chosen_node.global_position
	
	return chosen_node.global_position
```

---

## 5. Dinamik Çıkış Kapısı (`DoorPoints`) ve Çıkış Tabelaları (`Prop_DoorBeacon_*`)

Kartı alan takımın haritadan kaçış yapacağı **Çıkış Kapısı (Extraction Door)** da her maçta değişebilmesi için `DoorPoints` altında **10 ila 12 adet aday nokta** (`DoorPoint_01..12`) içerir.

* **Görsel İşaretçiler:** Her `DoorPoint_XX` noktasının üzerinde `Prop_DoorBeacon_XX` (veya `Map1`'de `Prop_ExitFrame_XX` / `Map4`'te `Prop_ExtractionGate_XX`) adında parlak kırmızı/kehribar çıkış tabelası bulunur.
* **Oyun İçi Öneri:**
  * Maç başında `DoorPoints.get_children()` içinden rastgele 1 (veya oyun moduna göre 2) çıkış kapısı seçilir.
  * Seçilen `DoorPoint_XX.global_position` noktasına oyunun **Çıkış Tetikleyicisi (`Area3D` - Extraction Zone)** yerleştirilir.
  * İstenirse sadece aktif olan kapının `Prop_DoorBeacon_XX` materyali **Yeşil Emisyon** rengine çevrilip diğer pasif kapıların tabelaları kapatılabilir.

```gdscript
func select_random_extraction_door(map_root: Node3D, extraction_area_scene: PackedScene = null) -> Node3D:
	var door_root: Node3D = map_root.get_node_or_null("DoorPoints")
	if not door_root or door_root.get_child_count() == 0:
		push_error("DoorPoints bulunamadı!")
		return null
	
	var doors: Array[Node] = door_root.get_children()
	var chosen_idx: int = randi() % doors.size()
	var chosen_door: Node3D = doors[chosen_idx]
	
	# Pasif kapıların kırmızı beacon ışıklarını gizle (sadece aktif kapı parlasın):
	var beacon_name: String = "Prop_DoorBeacon_%02d" % (chosen_idx + 1)
	for child in map_root.get_children():
		if child is MeshInstance3D and child.name.begins_with("Prop_DoorBeacon_"):
			child.visible = (child.name == beacon_name)
	
	if extraction_area_scene:
		var ext_zone: Node3D = extraction_area_scene.instantiate()
		map_root.add_child(ext_zone)
		ext_zone.global_position = chosen_door.global_position
	
	return chosen_door
```

---

## 6. Çarpışma (`CollisionShape3D`) ve FPS Optimizasyonu Kuralları

Bu 4 harita **High-Poly** olduğu için (`49.000` – `255.000` üçgen), Godot'da tüm mesh'lere körü körüne `create_trimesh_collision()` uygulamak gereksiz fizik (CPU) yükü oluşturur. Yapay zeka çarpışma oluştururken şu filtre kurallarını uygulamalıdır:

1. **Çarpışma EKLENMEMESİ Gereken Görsel/Dekoratif Mesh İsimleri (`No-Collision`):**
   * Ağaç yaprakları ve palmiye dalları: İsminde `Canopy`, `Needles`, `Frond` geçen mesh'ler (Ör: `OakTree_01_Canopy`, `PineTree_01_Needles`, `OasisPalm_1_Frond_0`). *Sadece ağaç gövdelerine (`_Trunk`) çarpışma verilmelidir!*
   * Su ve plazma havuzları: İsminde `Water`, `Pool`, `Basin` geçen mesh'ler.
   * İnce ışık/neon şeritleri ve hologramlar: İsminde `Neon`, `LED`, `Holo`, `CardVisual`, `Beacon`, `GlowRing`, `Pad_Team` geçen mesh'ler.
2. **Çarpışma EKLENMESİ Gereken Mesh'ler (`Trimesh` veya `Convex` Collision):**
   * Zemin/Arazi (`Terrain`, `Deck`, `Ground`, `Floor`, `Plaza`, `Driveway`, `Bridge`)
   * Duvarlar ve Sığınaklar (`Wall`, `Bulkhead`, `Quonset`, `Bunker`, `Hedge`, `Fuselage`, `Wing`)
   * Siper Objeleri ve Araçlar (`Column`, `CorinthianCol`, `Rock`, `Boulder`, `Mesa`, `Sandbag`, `Limousine`, `Humvee`, `SAM_Truck`, `BioPod`, `QuantumRack`, `Tokamak`, `FuelTank`, `Tree_.*_Trunk`)

### Hazır GDScript — Akıllı Otomatik Çarpışma Üretici:
```gdscript
const NO_COLLISION_KEYWORDS: Array[String] = [
	"Canopy", "Needles", "Frond", "Neon", "LED", "Holo",
	"CardVisual", "Beacon", "GlowRing", "Pad_Team", "Horn", "Screen"
]

func setup_smart_collisions(node: Node) -> void:
	if node is MeshInstance3D and node.mesh:
		var skip: bool = false
		for kw in NO_COLLISION_KEYWORDS:
			if kw in node.name:
				skip = true
				break
		if not skip:
			# Zemin, kavisli uçak gövdesi ve duvarlar için Trimesh statik çarpışma:
			node.create_trimesh_collision()
	
	for child in node.get_children():
		setup_smart_collisions(child)
```

---

## 7. Haritalara Özel Detaylar ve Koordinat Tabloları (Godot `[X, Y, Z]`)

### Harita 1: `Map1_Elcilik_Kompleksi_3v3v3v3.glb`
* **Kök Düğüm:** `Embassy_HighPoly_Palace`
* **Tavsiye Edilen Oyuncu Sayısı:** `3v3v3v3` (12 Kişi — Takım başı ilk 3 spawn noktası)
* **Mimari Özellikler:** H-Planlı Neoklasik Saray, Kuzeyde 3 katlı mermer şadırvan avlusu, Güneyde dairesel VIP araç yolu ve 2 zırhlı limuzin, Doğu ve Batı bahçelerinde Barok şimşir çit labirentleri, merkezde kuyruklu piyanolu Büyük Balo Salonu.
* **Takım Doğma Köşeleri (`global_position`):**
  * `Team0` (Kuzeybatı): `[-46.0, 0.2, -36.0]` çevresinde 5 nokta (`Team0_Spawn_1..5`)
  * `Team1` (Kuzeydoğu): `[46.0, 0.2, -36.0]` çevresinde 5 nokta (`Team1_Spawn_1..5`)
  * `Team2` (Güneybatı): `[-46.0, 0.2, 36.0]` çevresinde 5 nokta (`Team2_Spawn_1..5`)
  * `Team3` (Güneydoğu): `[46.0, 0.2, 36.0]` çevresinde 5 nokta (`Team3_Spawn_1..5`)
* **Kart Noktaları (`CardPoints` - 10 Adet):**
  * `CardPoint_01_Ballroom_Center`: `[0.0, 1.15, 0.0]` (Balo Salonu Merkezi)
  * `CardPoint_02_NW_Library`: `[-29.0, 1.15, -20.0]` (KB Kütüphane Kanadı)
  * `CardPoint_03_NE_ConsulSuite`: `[29.0, 1.15, -20.0]` (KD Konsolosluk Süiti)
  * `CardPoint_04_SW_Security`: `[-29.0, 1.15, 20.0]` (GB Güvenlik Odası)
  * `CardPoint_05_SE_Vault`: `[29.0, 1.15, 20.0]` (GD Kasa Dairesi)
  * `CardPoint_06_West_Gallery`: `[-29.0, 1.15, 0.0]` (Batı Sanat Galerisi)
  * `CardPoint_07_East_Archive`: `[29.0, 1.15, 0.0]` (Doğu Arşiv Odası)
  * `CardPoint_08_North_FountainColonnade`: `[0.0, 1.15, -18.0]` (Kuzey Şadırvan Revakı)
  * `CardPoint_09_South_Portico`: `[0.0, 1.15, 18.0]` (Güney VIP Giriş Portikosu)
  * `CardPoint_10_Fountain_East`: `[8.0, 1.15, -25.0]` (Şadırvan Doğu Yanı)
* **Çıkış Kapısı Noktaları (`DoorPoints` - 10 Adet):**
  * `DoorPoint_01..04`: `[0, 0.1, -37.2]`, `[0, 0.1, 37.2]`, `[-40.2, 0.1, 0]`, `[40.2, 0.1, 0]` (Dış bahçe ana kapıları)
  * `DoorPoint_05..10`: `[-29, 0.1, -27.2]`, `[29, 0.1, -27.2]`, `[-29, 0.1, 27.2]`, `[29, 0.1, 27.2]`, `[-16.2, 0.1, -18]`, `[16.2, 0.1, 18]` (Saray kanat çıkışları)

---

### Harita 2: `Map2_Yeralti_Kuantum_Labirenti_5v5v5v5.glb`
* **Kök Düğüm:** `Quantum_Biotech_Labyrinth_HighPoly_Map`
* **Tavsiye Edilen Oyuncu Sayısı:** `5v5v5v5` (20 Kişi)
* **Mimari Özellikler:** Yeraltı bazalt mağarası ve parlayan soğutma havuzu üzerinde yükselen sekizgen çok halkalı Sci-Fi Labirent. Merkezde 16 süperiletken bobinli **Tokamak Füzyon Reaktörü**, KB'de **Biyo-Staz Mutant Kapsülleri**, KD'de **Sıvı Soğutmalı Kuantum Sunucu Kabinleri**, GB'de **Parçacık Hızlandırıcı Tüpler**, GD'de **6 Eksenli Robotik Kollar**.
* **Takım Doğma Köşeleri (`global_position`):**
  * `Team1_Spawn` (Kuzeybatı - Mavi Platform): `[-33.0, 0.0, -33.0]` (Altında `Team1_Spawn_P1..P5`)
  * `Team2_Spawn` (Kuzeydoğu - Kırmızı Platform): `[33.0, 0.0, -33.0]` (Altında `Team2_Spawn_P1..P5`)
  * `Team3_Spawn` (Güneybatı - Yeşil Platform): `[-33.0, 0.0, 33.0]` (Altında `Team3_Spawn_P1..P5`)
  * `Team4_Spawn` (Güneydoğu - Sarı Platform): `[33.0, 0.0, 33.0]` (Altında `Team4_Spawn_P1..P5`)
* **Kart Noktaları (`CardPoints` - 12 Adet `CardSpawn_01..12`):**
  * Reaktör Çevresi: `[0, 1.15, -6.2]`, `[0, 1.15, 6.2]`
  * 4 Uzmanlık Sektörü Labirent İçi: `[-19, 1.15, -19]`, `[19, 1.15, -19]`, `[-19, 1.15, 19]`, `[19, 1.15, 19]`
  * Dış Koridor Kavşakları: `[0, 1.15, -29]`, `[0, 1.15, 29]`, `[29, 1.15, 0]`, `[-29, 1.15, 0]`, `[-10, 1.15, -20]`, `[10, 1.15, 20]`
* **Çıkış Kapısı Noktaları (`DoorPoints` - 12 Adet `DoorPoint_01..12`):**
  * Dış Sekizgen Hava Kilitleri: `[0, 0, -42]`, `[0, 0, 42]`, `[42, 0, 0]`, `[-42, 0, 0]`, `[-29.5, 0, -29.5]`, `[29.5, 0, -29.5]`, `[-29.5, 0, 29.5]`, `[29.5, 0, 29.5]`
  * İç Halka Güvenlik Kapıları: `[0, 0, -26.5]`, `[0, 0, 26.5]`, `[26.5, 0, 0]`, `[-26.5, 0, 0]`

---

### Harita 3: `Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5.glb`
* **Kök Düğüm:** `Desert_Canyon_Crash_HighPoly_Map`
* **Tavsiye Edilen Oyuncu Sayısı:** `5v5v5v5` (20 Kişi)
* **Mimari Özellikler:** BMesh ile şekillendirilmiş çöl kumulları ve çarpışma krateri; merkezde ikiye ayrılmış, içi gezilebilir **U-kesitli C-130 Hercules Kargo Uçağı Gövdesi** ve 4 turboprop motorlu kanatlar; çevrede **6 adet kemerli Quonset askeri hangar**, **4 Zırhlı Humvee**, kızıl kanyon kayaları ve vaha palmiyeleri.
* **Takım Doğma Köşeleri (`global_position`):**
  * `Team0` (Kuzeybatı): `[-54.0, 0.25, -42.0]` çevresinde 5 nokta (`Team0_Spawn_1..5`)
  * `Team1` (Kuzeydoğu): `[54.0, 0.25, -42.0]` çevresinde 5 nokta (`Team1_Spawn_1..5`)
  * `Team2` (Güneybatı): `[-54.0, 0.25, 42.0]` çevresinde 5 nokta (`Team2_Spawn_1..5`)
  * `Team3` (Güneydoğu): `[54.0, 0.25, 42.0]` çevresinde 5 nokta (`Team3_Spawn_1..5`)
* **Kart Noktaları (`CardPoints` - 12 Adet `CardPoint_01..12`):**
  * Uçak Gövdesi İçi (Ön ve Arka Kargo Bölmesi): `[-12.5, 1.15, 2.5]`, `[12.5, 1.15, -2.8]`
  * 6 Quonset Hangarı İçi: `[-38, 1.15, -30]`, `[38, 1.15, -30]`, `[-38, 1.15, 30]`, `[38, 1.15, 30]`, `[0, 1.15, -38]`, `[0, 1.15, 38]`
  * Enkaz Kanat & Humvee Siperleri: `[-20, 1.15, -12]`, `[20, 1.15, 12]`, `[-36, 1.15, 0]`, `[36, 1.15, 0]`
* **Çıkış Kapısı Noktaları (`DoorPoints` - 12 Adet `DoorPoint_01..12`):**
  * Kanyon Geçitleri: `[0, 0.2, -50]`, `[0, 0.2, 50]`, `[-58, 0.2, 0]`, `[58, 0.2, 0]`, `[-38, 0.2, -48]`, `[38, 0.2, -48]`, `[-38, 0.2, 48]`, `[38, 0.2, 48]`, `[-54, 0.2, -26]`, `[54, 0.2, -26]`, `[-54, 0.2, 26]`, `[54, 0.2, 26]`

---

### Harita 4: `Map4_Gece_Orman_Radar_Ussu_4v4v4v4.glb`
* **Kök Düğüm:** `Night_Forest_Radar_HighPoly_Map`
* **Tavsiye Edilen Oyuncu Sayısı:** `4v4v4v4` (16 Kişi — Takım başı ilk 4 spawn noktası)
* **Mimari Özellikler:** İçinden kıvrımlı akarsu ve 3 taktik köprü geçen gece ormanı vadisi; merkezde çok odalı **Radar & SAM Komuta Üssü** (64 segmentli parabolik radar çanağı + 2 adet 8x8 Mobil SAM Füze Kamyonu); KB'de **Sekizgen Pillbox Bunker & Kum Torbası Siperi**, KD'de **2 Jeodezik Radomlu Telemetri Kışlası**, GB'de **Kereste Fabrikası & Tomruk Yığınları**, GD'de **Sekizgen Helikopter Pisti (`H`) & Yakıt Tankları**; vadide 22 High-Poly Meşe + 20 High-Poly Çam/Ladin ağacı.
* **Takım Doğma Köşeleri (`global_position`):**
  * `Team1_Spawn` (Kuzeybatı): `[-36.0, 0.0, -34.0]` (Altında `Team1_Spawn_P1..P5`)
  * `Team2_Spawn` (Kuzeydoğu): `[36.0, 0.0, -34.0]` (Altında `Team2_Spawn_P1..P5`)
  * `Team3_Spawn` (Güneybatı): `[-36.0, 0.0, 34.0]` (Altında `Team3_Spawn_P1..P5`)
  * `Team4_Spawn` (Güneydoğu): `[36.0, 0.0, 34.0]` (Altında `Team4_Spawn_P1..P5`)
* **Kart Noktaları (`CardPoints` - 12 Adet `CardSpawn_01..12`):**
  * Merkez Radar Üssü Odaları: `[0, 1.15, 6.5]`, `[-8.5, 1.15, 0]`, `[8.5, 1.15, 0]`
  * KB Pillbox & KD Telemetri Odaları: `[-24, 1.15, -22]`, `[20, 1.15, -22]`, `[28, 1.15, -22]`
  * GB Kereste Fabrikası & GD Helipad: `[-24, 1.15, 19]`, `[-24, 1.15, 25]`, `[24, 1.15, 22]`
  * 3 Taktik Köprü Üzeri: `[-28, 1.15, -11.2]`, `[-14, 1.15, -9.2]`, `[28, 1.15, 11.2]`
* **Çıkış Kapısı Noktaları (`DoorPoints` - 12 Adet `DoorPoint_01..12`):**
  * Orman Sınır Geçitleri: `[0, 0, -38]`, `[0, 0, 38]`, `[44, 0, 0]`, `[-44, 0, 0]`, `[-24, 0, -35]`, `[24, 0, -35]`, `[-24, 0, 35]`, `[24, 0, 35]`
  * Merkez Üs Zırhlı Kapıları: `[0, 0, -11.2]`, `[0, 0, 11.2]`, `[-13.2, 0, 0]`, `[13.2, 0, 0]`

---

## 8. Kamera ve Işıklandırma (`WorldEnvironment` & `OmniLight3D`) Önerileri

1. **Taktik Kamera Açısı (`50° Top-Down`):**
   * Tüm duvarlar `3.0m` yüksekliğinde ve **tavansız (Open-Top)** olarak üretilmiştir.
   * Kamera karakteri takip ederken `rotation_degrees.x = -50` ila `-55` derece eğim ve `18m – 24m` yükseklik kullanıldığında tüm iç odalar, koridorlar ve uçak gövdesi içi hiçbir görüş engeli olmadan net görünür.
2. **Otomatik Oda/Koridor Aydınlatması:**
   * Haritalardaki neon şeritler, plazma reaktörü, kart halkaları ve kapı tabelaları kendi **Emisyon (`Emission`)** materyallerine sahiptir (`WorldEnvironment` içinde `Glow / Bloom` açıldığında parlarlar).
   * Ek olarak her `CardPoints` düğümünün `global_position + Vector3(0, 2.2, 0)` noktasına kod ile düşük enerjili (`energy = 1.2`, `omni_range = 12.0`, `shadow_enabled = false`) birer `OmniLight3D` eklenmesi, gölge maliyeti oluşturmadan tüm odaları sıcak ve okunaklı şekilde aydınlatacaktır.

