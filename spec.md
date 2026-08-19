# spec.md — Güvenlik & Güven Mimarisi Spesifikasyonu (v0.1)

> Bu doküman projenin **ana spesifikasyon dosyasıdır**. Amaç: kod yazmaya
> başlamadan önce, agent'a (LLM tabanlı coding tool'umuza) vereceğimiz
> yetkilerin ne gibi riskler taşıdığını sistematik olarak düşünmek —
> Hixie'nin `llmdevsilo` tasarım notlarından ve Claude Code'un (Boris
> Cherny) tasarım felsefesinden ilham alarak.
>
> Mimari henüz netleşmedi (backend dili, sandbox teknolojisi, tek makine mi
> çoklu istemci mi — hâlâ açık). Bu doküman o kararları vermeden önce
> "hangi tehditlere karşı tasarlıyoruz" sorusunu netleştirmek için var.

## 0. Bu spec'in kapsamı ve iki referans zihniyet

Bu doküman iki farklı, birbirini tamamlayan zihniyetten besleniyor:

- **Hixie (spec-first disiplin):** Kod yazmadan önce, sistemin her
  davranışını ve sınır durumunu (edge case) kağıt üzerinde düşünmek.
  Güvenlik-kritik, sonradan değiştirmesi pahalı olan kararlar (sandbox
  sınırları, güven sınırları) bu disiplinle ele alınmalı.
- **Boris Cherny (minimalizm + dogfooding):** "Önce en basit şeyi yap",
  bugünün varsayımlarına aşırı bağlı, gereksiz karmaşık bir sistem
  tasarlamamak. Bu yüzden bu spec **sadece güven/güvenlik katmanını**
  kapsıyor — UI, özellik listesi, teknoloji seçimi gibi konulara
  girmiyor; onlar ayrı, daha yalın ve iteratif kararlar olarak
  ilerleyecek.

Aşağıdaki adımlar, önceki konuşmalarımızda çıkardığımız tehdit modelleme
sürecinin (capability listesi → en kötü senaryo → güven sınırları →
saldırgan hedefi → gerçek vakalar → kendi sistemine saldırı) bu projeye
uygulanmış hali.

---

## 1. Yetenekler (Capabilities)

Mimari netleşmeden önce, agent'a **muhtemelen** vereceğimiz yetenekleri
genel düzeyde listeliyoruz. Her yeni yetenek eklendiğinde bu liste
güncellenmeli.

| # | Yetenek | Açıklama |
|---|---|---|
| C1 | Dosya okuma (Read) | Proje dizinindeki dosyaları okuyabilme |
| C2 | Dosya yazma/düzenleme (Write/Edit) | Proje dizinine yazabilme, mevcut dosyaları değiştirebilme |
| C3 | Komut çalıştırma (Bash/Exec) | Derleyici, test runner, paket yöneticisi gibi programları çalıştırabilme |
| C4 | Ağ erişimi (Network) | Bağımlılık indirme, dış API çağrısı, web araması |
| C5 | LLM sağlayıcısıyla iletişim | Prompt + kod içeriğinin Anthropic/OpenAI/yerel model API'sine gönderilmesi |
| C6 | Oturum/geçmiş saklama | Konuşma geçmişi, dosya diff'leri gibi verinin diskte tutulması |
| C7 | Kimlik bilgisi erişimi | API anahtarları, `.env` gibi sırlara erişim (gerekiyorsa) |
| C8 | Çoklu istemci / uzaktan bağlantı *(ileride, opsiyonel)* | Harness'e başka bir cihazdan (telefon vb.) bağlanabilme — Silo'dan ilham |

---

## 2. Her yetenek için "en kötü senaryo"

| Yetenek | En kötü senaryo |
|---|---|
| C1 – Read | Proje dizinindeki bir sır dosyası (`.env`, ssh key, credential) LLM'in context'ine girer, konuşma geçmişinde veya LLM sağlayıcısına giden istekte istemeden taşınır. |
| C2 – Write | Manipüle edilmiş (prompt injection içeren) bir bağımlılık veya dosya içeriği, LLM'i kandırıp proje içine sinsice backdoor/kötü amaçlı kod yazdırır — fark edilmeden commit'lenebilir. |
| C3 – Bash/Exec | Keyfi kod çalıştırma = potansiyel tam sistem ele geçirme: disk silme, ters kabuk (reverse shell) açma, kaynakları tüketme (kripto madenciliği), diğer projelere/dosyalara sızma. |
| C4 – Network | Prompt injection ile tetiklenen veri sızdırma (secrets'ı dış sunucuya gönderme), DNS tünelleme, typosquatting/dependency-confusion paketlerinin indirilmesi. |
| C5 – LLM iletişimi | Gönderilen kod/prompt içeriğinin sağlayıcı tarafında loglanması veya trafiğin ele geçirilmesi (MITM) — özellikle kapalı kaynak, hassas bir proje için risk. |
| C6 – Oturum saklama | Geçmişte kalan sırların diskte düz metin (plaintext) olarak saklanması, başka bir process/kullanıcı tarafından okunması. |
| C7 – Kimlik bilgisi erişimi | Yanlış yapılandırmayla sırların sandbox'a mount edilip LLM'in görüş alanına girmesi. |
| C8 – Çoklu istemci | Zayıf bir eşleştirme (pairing) mekanizması, yetkisiz bir cihazın harness'e bağlanıp tam kontrolü ele geçirmesine izin verir. |

---

## 3. Güven sınırları (Trust Boundaries)

```
┌─────────────────────────────────────────────────────────────┐
│  Kullanıcının host makinesi              (EN YÜKSEK GÜVEN)   │
│                                                               │
│   ┌───────────────────────────────────────────────────┐     │
│   │  Harness / backend süreç                            │     │
│   │  - LLM isteklerini yönetir                          │     │
│   │  - sandbox'ı kurar/yıkar                            │     │
│   │  - sır/kimlik bilgisi burada tutulur (sandbox'ta değil) │
│   │                                                      │     │
│   │   ┌─────────────────────────────────────────┐      │     │
│   │   │  Sandbox (agent'ın fiilen çalıştığı yer)  │      │     │
│   │   │  - "varsayılan düşman" olarak ele alınır  │      │     │
│   │   │  - C1, C2, C3 burada gerçekleşir          │      │     │
│   │   │  - dışarıyla tek bağlantısı: proxy (C4)   │      │     │
│   │   └─────────────────────────────────────────┘      │     │
│   └───────────────────────────────────────────────────┘     │
└───────────────┬───────────────────────────┬─────────────────┘
                │ (C5: API çağrısı)          │ (C4: proxy üzerinden,
                ▼                            │  allow-list'li)
      ┌──────────────────┐                   ▼
      │ LLM sağlayıcısı    │        ┌──────────────────────┐
      │ (Anthropic/OpenAI/ │        │ İnternet / 3. parti    │
      │  yerel model)      │        │ bağımlılıklar          │
      │ AYRI GÜVEN SINIRI  │        │ GÜVENİLMEZ             │
      └──────────────────┘        └──────────────────────┘

  (İleride, C8 aktifse: ayrı bir güven sınırı olarak "uzak istemciler"
   — telefon/başka makine — eklenecek; pairing + asimetrik anahtarla
   kimlik doğrulaması gerektirir.)
```

**Kural:** Sandbox içinden host'a veya host'tan LLM sağlayıcısına giden
her veri akışı, bu sınırı **bilinçli ve kontrollü** şekilde geçmeli — hiçbir
akış "varsayılan olarak açık" olmamalı.

---

## 4. Saldırganın hedefi — sadece mekanizma değil, amaç

Bir güvenlik önlemi tasarlarken "hangi mekanizmayı engelliyorum" değil,
"saldırganın asıl amacı ne" sorusunu sormak daha kalıcı bir koruma sağlar
— çünkü mekanizmalar değişir, amaçlar değişmez. Olası saldırgan hedefleri:

1. **Sızdırma (exfiltration):** Sırları, kaynak kodu, kullanıcı verisini
   dışarı çıkarmak. *(En olası ve en tehlikeli hedef — C1, C4, C5, C6, C7
   bu hedefe hizmet edebilir.)*
2. **Kalıcılık / arka kapı (persistence):** CI/CD pipeline'ına, git
   hook'larına, bağımlılık dosyalarına sinsice kod eklemek — tespit
   edilmeden uzun süre erişim sağlamak. *(C2, C3 bu hedefe hizmet eder.)*
3. **Yıkım (sabotage):** Diski silmek, repoyu bozmak, veri kaybına yol
   açmak. *(C2, C3.)*
4. **Kaynak istismarı (resource abuse):** API kotasını/parayı tüketmek,
   sandbox'ı kripto madenciliği için kullanmak. *(C3, C4.)*
5. **Yanal hareket (lateral movement):** Sandbox'tan host'a, ya da (çoklu
   istemci mimarisinde) bir kullanıcıdan diğerine sıçramak. *(C3, C8.)*

Her yeni özellik/yetenek eklerken sorulacak soru: **"Bu, saldırganın
yukarıdaki beş hedeften hangisine hizmet edebilir?"**

---

## 5. Gerçek vakalar (referans — literatürden)

Bunlar rastgele değil, bilinen başarısızlık sınıflarının örnekleri.
Ayrıntılar için kaynaklara bakınız, burada sadece hangi hedefe karşılık
geldiği not edilmiştir:

- **Coding agent'ların ortam değişkenlerindeki/dosyalardaki sırları
  istemeden dışarı sızdırması** — Hedef 1 (sızdırma) örneği.
- **Bir coding agent'ın kullanıcı isteği dışı bir diski silmesi** — Hedef
  3 (yıkım) örneği; genelde aşırı/yanlış yorumlanmış bir komuttan
  kaynaklanır.
- **"Lethal trifecta" (Simon Willison):** Bir agent aynı anda (a) özel
  veriye erişebiliyor, (b) güvenilmeyen içerik işliyor, (c) dışarıyla
  iletişim kurabiliyorsa, sızdırma riski neredeyse kaçınılmaz hale gelir.
  Kaynak: <https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/>
- **OWASP GenAI/LLM Top 10 (2026):** Prompt injection ve "excessive
  agency" (agent'a gereğinden fazla yetki verilmesi) en üst sıralarda.
  Kaynak: <https://genai.owasp.org/>
- **llmdevsilo tasarım notları** (bu repodaki `docs/ilham/` altında daha
  önce özetlenmişti — bkz. git geçmişi): sandbox + proxy + allow-list
  yaklaşımının somut bir uygulaması.

---

## 6. Kendi sistemimize saldırı — DOKÜMANTASYON, UYGULAMA DEĞİL

> **Önemli not:** Bu bölümde **gerçek bir saldırı gerçekleştirmiyoruz.**
> Mimari (sandbox teknolojisi, backend, vb.) henüz seçilmediği için
> saldırılacak çalışan bir sistem yok. Aşağıdaki liste, mimari
> netleştiğinde ve ilk implementasyon yapıldığında kullanılacak bir
> **self red-team soru listesi / checklist**'tir — canlı bir belge olarak
> güncellenecek, şimdilik sadece hangi soruları sormamız gerektiğini not
> ediyoruz.

İleride, sandbox çalışır hale geldiğinde sorulacak sorular:

- [ ] Sandbox'a verilen dizinden symlink/path-traversal ile host'taki
      başka bir dosyaya erişilebiliyor mu?
- [ ] Ağ erişimi kapalıyken bile DNS sorguları üzerinden veri
      sızdırılabiliyor mu (DNS tunneling)?
- [ ] Konuşma/işlem logları herhangi bir yerde sırları düz metin olarak
      tutuyor mu?
- [ ] (C8 aktifse) Eşleştirme (pairing) kodu kaba kuvvetle (brute-force)
      denenebilir mi, kod ne kadar sürede/deneme ile kırılabilir?
- [ ] Bağımlılık indirme sırasında dependency-confusion / typosquatting
      saldırılarına karşı bir kontrol var mı?
- [ ] Sandbox process'i, host'un CPU/bellek/disk kaynaklarını sınırsız
      tüketebiliyor mu (resource exhaustion / DoS)?
- [ ] LLM'e giden her istekte, o an sandbox'ta *olmaması gereken* bir sır
      yanlışlıkla context'e girmiş mi (ör. yanlış mount, yanlış env var)?

Bu liste, gerçek bir güvenlik incelemesi/pentest yapılacağı zaman
başlangıç noktası olarak kullanılacak — şu an için sadece "unutmamamız
gereken sorular" olarak kayıt altına alınmıştır.

---

## 7. Açık sorular / sonraki adımlar

Bu spec bilinçli olarak şu kararları **vermiyor** (Boris Cherny'nin "önce
en basit şeyi yap" ilkesi gereği, henüz erken):

- Sandbox teknolojisi ne olacak? (Docker, gVisor, Firecracker, ya da daha
  basit bir process-isolation mı?)
- Backend hangi dilde yazılacak?
- Tek makine mi, yoksa Silo'daki gibi harness/UI ayrımı + çoklu istemci
  mi olacak?
- Ağ politikası: varsayılan tamamen kapalı mı, yoksa baştan bir
  allow-list mi tanımlanacak?

Bu sorular, mimari netleştikçe bu dosyaya eklenecek yeni bölümlerde
cevaplanacak.
