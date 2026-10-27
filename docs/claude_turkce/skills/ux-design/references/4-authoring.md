> Bu dosya `.claude\skills\ux-design\references\4-authoring.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# /ux-design — Bölüm 4: Bölüm Bölüm Yazım

> `/ux-design`'ın bir parçasıdır. Bu dosyanın ne zaman okunacağını `SKILL.md` belirtir; orada
> çözülen ayarlar ve sonraki başlıklarındaki kurallar burada da geçerlidir.

## 4. Bölüm Bölüm Yazım

Her bölümü sırayla ele al. **Her bölüm için** şu döngüyü izle:

```
Context  ->  Questions  ->  Options  ->  Decision  ->  Draft  ->  Approval  ->  Write
```

1. **Bağlam (Context)**: Bu bölümün neleri içermesi gerektiğini belirt ve Aşama 2'de
   toplanan bağlamdan ilgili kısıtları görünür kıl.
2. **Sorular (Questions)**: Bu bölümün taslağını çıkarmak için gerekenleri sor. Sınırlı seçimler
   için `AskUserQuestion`, açık uçlu keşif için sohbet metni kullan.
3. **Seçenekler (Options)**: Tasarım seçimleri olduğunda, artıları/eksileriyle 2-4 yaklaşım sun.
   Gerekçeyi sohbette açıkla, sonra kararı kaydetmek için `AskUserQuestion` kullan.
4. **Karar (Decision)**: Kullanıcı bir yaklaşım seçer veya kendi yönlendirmesini verir.
5. **Taslak (Draft)**: Bölüm içeriğini inceleme için sohbette yaz. Geçici
   varsayımları açıkça işaretle.
6. **Onay (Approval)**: `AskUserQuestion` kullan:
   - "Bu, [bölüm adı] bölümünü doğru yansıtıyor mu?"
   - Seçenekler: "Evet — dosyaya yaz", "Küçük değişiklikler gerekiyor (aşağıda açıkla)", "Baştan düşünmek gerekiyor"
   Kullanıcı "Evet"i seçene kadar 7. adıma geçme.
7. **Yazma (Write)**: `AskUserQuestion` kullan: "[bölüm adı] bölümünü `[filepath]` konumuna yazabilir miyim?"
   - Seçenekler: "Evet, yaz", "Bekle — bir değişiklik daha"
   Onaylandığında, `[To be designed]` yer tutucusunu onaylanan içerikle değiştirmek için `Edit` kullan.

Her bölümü yazdıktan sonra `production/session-state/active.md` dosyasını güncelle.
