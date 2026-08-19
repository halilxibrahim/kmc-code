# İlham Notu: llmdevsilo (Silo)

> Bu doküman, Hixie'nin `llmdevsilo` (kısaca "Silo") projesini duyuran blog yazısının
> **Türkçe özeti/analizidir** — birebir çeviri değildir. Orijinal yazı telif hakkına
> tabi olduğu için burada yalnızca fikirler ve mimari yaklaşım özetlenmiştir. Tam
> metin için kaynaklara bakınız.

## Kaynaklar

- Orijinal blog yazısı ve proje: <https://github.com/Hixie/llmdevsilo>
- Tasarım dokümanı: <https://github.com/Hixie/llmdevsilo/blob/main/docs/DESIGN.md>
- Ek dokümantasyon: <https://github.com/Hixie/llmdevsilo/tree/main/docs>
- "Normalization of deviance in AI" (arka plandaki güvenlik motivasyonu): <https://embracethered.com/blog/posts/2025/the-normalization-of-deviance-in-ai/>

## Çözülen problem

Bir coding agent'a (Claude Code, Codex vb. gibi) derleyici/test çalıştırma yetkisi
verirken iki kötü seçenek var:

1. Her komutu elle onaylamak → yorucu, zamanla dikkatsizleşme ("prompt fatigue").
2. LLM'in kendi çalıştırdığı komutları kendisinin denetlemesine güvenmek → kırılgan,
   "model modeli izliyor" güvenliği; küçük sapmaların birikip felakete dönüşme riski var
   (bkz. "normalization of deviance" yazısı).

Silo'nun amacı: LLM'e gerçek bir dev ortamı ve internet erişimi vermek ama bunu
**gerçek sandbox sınırlarıyla** güvenli hale getirmek — modelin iyi niyetine
güvenmeden.

## Nasıl inşa edildi

Yazar aylarca bir tasarım dokümanı yazmış, sonra bunu tek seferde Anthropic'in
Fable modeline (1M bağlam penceresi, "Ultracode" modu) verip "Bu tasarımı
`~/dev/llmdevsilo/` içinde uygula, tamamlanana kadar durmadan devam et" promptunu
yazmış. ~2 saat ve ~2 milyon token'da (~10$ maliyet) sistemin tamamı tek seferde
(one-shot) çalışır durumda ortaya çıkmış. Kozmetik sorunlar (küçük pencerede taşma,
self-signed sertifika uyarıları vb.) dışında baştan sona işlevselmiş.

## Mimari

- **Harness (çekirdek süreç):** Masaüstü uygulaması bir "harness" oturumu başlatır;
  bir dizin ve bir LLM modeli belirtilir (Anthropic REST, OpenAI REST/WebSocket veya
  yerel model destekleniyor).
- **Sandbox izolasyonu:** Belirtilen dizin bir disk image'ine kilitlenip sandbox
  içine mount edilir. macOS'ta `sandbox-exec`, Linux'ta gVisor kullanılıyor.
  LLM'e Read/Write/Bash gibi araçlar veriliyor ama sadece bu sandbox içinde
  çalışabiliyor; yerel dosya sistemine erişimi yok, sadece verilen dizine ve
  izin verilen birkaç sistem binary'sine (`/usr/bin` gibi) erişimi var. Ayrıca
  bir scratch (geçici) dizin de sağlanıyor.
- **Ağ erişimi varsayılan olarak kapalı.** Açılırsa harness, sandbox'a bir HTTP
  proxy üzerinden erişim veriyor. Proxy TLS'i destekliyor: sandbox içine geçici
  bir root CA enjekte edilip sertifikalar anlık (on the fly) üretiliyor. gVisor
  altında DNS de proxy'leniyor — sadece izin listesindeki alan adları çözülebiliyor.
- **UI, harness'ten tamamen ayrı bir katman.** Harness bir makinede çalışabilir,
  başka bir cihazdan (telefon dahil) bağlanılabilir. Flutter tabanlı bir
  masaüstü/mobil/web istemci ve Rust tabanlı bir terminal istemcisi mevcut.
  Yeni istemci eklemek için mevcut istemciden bir eşleştirme (pairing) kodu
  alınıyor; ardından asimetrik anahtar çiftleriyle güvenli yeniden bağlanma
  sağlanıyor.

## Sınırlamalar (yazarın kendi ifadeleriyle)

1. **Denetlenmemiş kod:** Kodun tamamı LLM tarafından yazıldı, henüz güvenlik
   denetiminden geçmedi. Güvenlik-kritik kısımlar Rust'ta ve yazar Rust'a hakim
   değil.
2. **Maliyet:** Yerel model kullanılmıyorsa API maliyeti abonelik planlarından çok
   daha pahalı (ilk one-shot inşa ~100-150$'a mal olurdu).
3. **Ağ erişimi = sandbox içi güvenlik kaybı:** Sandbox dışındaki her şey
   sızıntıya karşı korunsa da, ağ erişimine izin verilirse sandbox *içindeki*
   her şey (kaynak kod dahil) artık güvenli değil. Açık kaynak olmayan bir proje
   geliştiriyorsanız bu önemli bir husus.

## Bizim proje için çıkarımlar

Kendi coding tool'umuz (Claude Code / Codex benzeri, React frontend'li) için bu
proje üç temel mimari soruyu net şekilde ortaya koyuyor:

1. **Çalıştırma yetkisi:** LLM'e komut çalıştırma yetkisini nasıl vereceğiz —
   sandbox mı (gVisor, Docker, vb.), onay prompt'u mu, yoksa ikisinin karışımı mı?
2. **UI / backend ayrımı:** UI'ı backend'den ("harness") ayırmak, React frontend'in
   sadece bir istemci olup arkada ayrı bir sürece bağlanmasını mümkün kılar —
   bu ileride masaüstü/mobil istemci eklemeyi kolaylaştırır.
3. **Ağ erişimi kontrolü:** Varsayılan olarak kapalı, ihtiyaç halinde proxy
   üzerinden açılan bir ağ erişimi modeli, güvenlik ile kullanışlılık arasında
   iyi bir denge sağlıyor.

Backend dilini şimdiden seçmemize gerek yok — bu üç kararı (özellikle sandbox
teknolojisini) netleştirdikçe dil seçimi de şekillenecek.
