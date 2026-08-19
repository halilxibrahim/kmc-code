# İlham Notu: Boris Cherny ve Claude Code'un Tasarım Felsefesi

> Bu doküman, Boris Cherny ve Claude Code'un ortaya çıkışı üzerine yapılmış
> röportaj/yazı dizisinin (Pragmatic Engineer, Lenny's Newsletter, Anthropic
> kaynakları) **Türkçe özeti/analizidir** — birebir çeviri değildir. Amaç,
> kendi coding tool projemiz için ilham alınabilecek tasarım prensiplerini
> çıkarmaktır.

## Kaynaklar

- Gergely Orosz, "Building Claude Code with Boris Cherny": <https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny>
- Gergely Orosz, "How Claude Code is built": <https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built>
- Lenny's Newsletter, "Head of Claude Code: What happens after coding is solved": <https://www.lennysnewsletter.com/p/head-of-claude-code-what-happens>
- Boris Cherny'nin özgeçmişi/profili: <https://www.linkedin.com/in/bcherny/>

## Kim bu adam?

Boris Cherny, Eylül 2024'te Anthropic'e "founding engineer" olarak katıldı ve
Claude Code'u yaratan, şu an başında olan kişi. Öncesinde Meta'da beş yıl
(Instagram'da Principal Engineer — Comet/Hack/GraphQL migrasyonlarına
liderlik), "Programming TypeScript" kitabının yazarı, UC San Diego mezunu.
Kariyerinin başında bir hedge fund'ta ve birkaç startup'ta çalışmış.

## Claude Code nasıl doğdu?

Büyük bir ürün planıyla değil, kişisel bir dogfooding projesi olarak: ilk
haftasında Claude'a terminalden basit bir şeyler yaptırmaya çalışırken bash
erişimi verince prototip ciddileşti. Bu prototip hızla Anthropic içinde
yayıldı — kamuya açık sürümden birkaç gün önce zaten şirket içi mühendislerin
yarısı kullanıyordu. Yani ürün-pazar uyumu bir ankette değil, gerçek, günlük
kullanımda kanıtlandı.

## Öne çıkan tasarım prensipleri

1. **Dogfooding, spec'ten önce gelir.** Büyük bir tasarım dokümanıyla
   başlamak yerine küçük, gerçek bir ihtiyacı çözen bir araçla başlayıp
   sürekli kendin kullanarak hızlı iterasyona sokmak.
2. **LLM'i bir IDE'ye gömmek yerine bir Unix aracı gibi tasarlamak.** Ham
   terminal erişimi, minimal arayüz, pipe'lar/hook'lar/eklentilerle
   bileşebilirlik. Klasik Unix felsefesi: bir şeyi iyi yap, düz metinle
   konuş, başka araçlarla bileşebil.
3. **"Önce en basit şeyi yap."** Karmaşık scaffolding veya arayüz kurmadan
   önce en yalın çözümü deneyip gerçek kullanımdan öğrenmek.
4. **Bugünün modeli için değil, yakın gelecekteki model için tasarlamak.**
   Modelin zayıflıklarını telafi etmek için karmaşık, modele özel
   heuristic'ler kurmak yerine, model geliştikçe aracın da otomatik olarak
   daha iyi çalışacağı genel/basit bir tasarım tercih etmek (Rich Sutton'ın
   "The Bitter Lesson" fikrine referansla: genel, ölçeklenebilir yöntemler
   uzun vadede modele özel el yapımı çözümleri geride bırakır).

## Hixie ile karşılaştırma ve bizim proje için çıkarım

`docs/ilham/llmdevsilo.md` dosyasındaki Hixie yaklaşımıyla ilginç bir zıtlık
var: Hixie aylarca kapsamlı bir tasarım dokümanı yazıp tek seferde büyük bir
implementasyon patlatan **spec-first** bir yaklaşım kullandı. Cherny ise
minimal bir araçla başlayıp gerçek kullanımla organik olarak büyüten,
aşırı ön-tasarımdan kaçınan bir yaklaşım izledi.

Kendi projemiz için ikisi de kullanılabilir, farklı katmanlarda:

- **Güvenlik/sandbox katmanı** gibi hata payının pahalı olduğu, sonradan
  değiştirmesi zor olan temel mimari kararlarda → Hixie'nin spec-first
  disiplini (önce kapsamlı düşün, sonra uygula).
- **Asıl aracın kullanıcı deneyimi / CLI-arayüz tasarımı** gibi hızlı
  öğrenmenin değerli olduğu yerlerde → Cherny'nin minimal araç + kendin
  kullan + gerçek kullanımdan öğren yaklaşımı.

Pratik bir kural: React frontend'imizin ilk versiyonunu olabildiğince yalın
tutup gerçekten kendimiz gündelik kullanarak geliştirmek, baştan büyük bir
UI/özellik seti tasarlamaya çalışmaktan muhtemelen daha sağlıklı bir başlangıç
olur.
