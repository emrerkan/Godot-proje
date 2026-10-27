---
paths:
  - "src/ui/**"
  - "Assets/**/{UI,Ui,ui}/**/*.cs"
  - "Source/**/{UI,Ui,ui}/**/*.{h,cpp}"
---

> Bu dosya `.claude/rules/ui-code.md` dosyasının Türkçe çevirisidir. Claude'un kullandığı asıl dosya İngilizce olandır; bu kopya sadece okumak içindir.

# Arayüz (UI) Kodu Kuralları

- Arayüz oyun durumuna ASLA sahip olmamalı ve onu doğrudan değiştirmemelidir — sadece gösterir, değişiklik istemek için komutlar/olaylar kullanır
- Tüm arayüz metinleri yerelleştirme sisteminden geçmelidir — kullanıcıya görünen hiçbir metin koda gömülmez
- Tüm etkileşimli öğeler için hem klavye/fare HEM DE oyun kumandası (gamepad) girdisini destekle
- Tüm animasyonlar atlanabilir olmalı ve kullanıcının hareket/erişilebilirlik tercihlerine saygı göstermelidir
- Arayüz sesleri doğrudan değil, ses olay sistemi (audio event system) üzerinden tetiklenir
- Arayüz oyun iş parçacığını (game thread) asla bloke etmemelidir
- Ölçeklenebilir metin ve renk körlüğü modları isteğe bağlı değil, zorunludur
- Tüm ekranları desteklenen minimum ve maksimum çözünürlüklerde test et
