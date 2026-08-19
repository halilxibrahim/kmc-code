# CLAUDE.md

Bu dosya, bu repoda çalışan her Claude Code oturumunun (bulut ya da local
fark etmez) otomatik okuduğu proje hafızasıdır. Amaç: yeni bir oturum
açıldığında sıfırdan anlatmaya gerek kalmadan "nerede kaldık" sorusunun
cevabını vermek.

## Proje nedir

LLM tabanlı bir coding agent tool'u (Claude Code / Codex benzeri)
geliştiriliyor — sahibi frontend ağırlıklı bir geliştirici, backend ve
agent mimarisini bu proje üzerinden öğrenerek ilerliyor. Yaklaşım: küçük,
çalışan bir v0'dan başlayıp adım adım büyütmek (bkz. "Tasarım felsefesi").

## Önce oku

1. **`spec.md`** — güvenlik/güven mimarisi spesifikasyonu: yetenekler, en
   kötü senaryolar, güven sınırları, saldırgan hedefleri, self red-team
   checklist. Herhangi bir yeni yetenek/tool eklerken önce buraya bakılmalı
   ve güncellenmelidir.
2. **`README.md`** — çalıştırma talimatları.

## Tasarım felsefesi (neden böyle kararlar alındı)

İki referans zihniyetten besleniyoruz:

- **Hixie (llmdevsilo projesi) — spec-first disiplin:** Güvenlik-kritik
  kararlar (sandbox, güven sınırları) kod yazmadan önce kağıt üzerinde
  düşünülür. `spec.md` bunun ürünü.
- **Boris Cherny (Claude Code) — minimalizm + dogfooding:** "Önce en basit
  şeyi yap", bugünün varsayımlarına aşırı bağlı karmaşık sistemler
  kurmamak. v0'ın küçük tutulmasının sebebi bu.

## Şu anki mimari kararlar ve gerekçeleri

| Karar | Ne seçildi | Neden |
|---|---|---|
| Backend dili | Node.js + TypeScript (Rust değil) | Sahibi TS biliyor; Rust'a geçiş ileride, sandbox/exec katmanı netleştiğinde düşünülecek (Codex CLI de aynı sırayla gitti: önce TS, sonra kritik kısmı Rust'a taşıdı) |
| LLM sağlayıcısı | OpenRouter üzerinden Qwen3.8 Max (Anthropic değil) | Maliyet — Anthropic'e göre input aynı, output ~%40 ucuz; ayrıca provider-agnostic mimari hedefi (OpenAI-uyumlu `chat.completions` formatı kullanılıyor, `MODEL` env değişkeniyle model değişimi kod değişikliği gerektirmiyor) |
| Frontend state yönetimi | Basit bir `useAgentSocket` hook'u (RTK Query değil, henüz) | v0'da RTK/Zustand kararı bilinçli olarak ertelendi, gerçek kullanımdan sonra karar verilecek |
| UI bileşenleri | Radix primitives + cva, elle kuruldu | shadcn CLI'ın `ui.shadcn.com` isteği bu ortamın ağ politikasınca engellenmişti; component.json hazır, `npx shadcn add` local'de sorunsuz çalışmalı |
| Sandbox | **Yok** | v0 kapsamı dışında, bkz. spec.md §7 açık sorular |

## v0'ın kapsamı ve bilinen sınırlar

- 3 tool: `read_file`, `write_file`, `run_command` — hepsi sadece
  `backend/workspace/` altında, basit bir path-guard ile (gerçek bir
  güvenlik sınırı DEĞİL, sadece yanlışlıkla dışına çıkmayı zorlaştırıyor)
- **Konuşma hafızası yok** — her `user_message`, `agent-loop.ts` içinde
  sıfırdan bir mesaj listesiyle başlıyor, önceki turu hatırlamıyor. Bu şu
  an bilinen en büyük eksik.
- Codebase keşif tool'u yok (glob/grep gibi) — agent sadece kendisine
  verilen dosya adını okuyabiliyor, "projede ne var" diye bakamıyor
- Backend, WebSocket üzerinden (`ws://localhost:8787`) frontend'e event
  stream'i gönderiyor (`connected`, `turn_start`, `assistant_text`,
  `tool_call`, `tool_result`, `tool_error`, `turn_end`)

## Konuşulan ama henüz karara bağlanmayan seçenekler

Sıradaki adım için üç yön konuşuldu, öncelik henüz netleşmedi:

1. Konuşma hafızası eklemek (backend'de oturum/socket bazlı mesaj geçmişi
   saklamak) — muhtemelen en öncelikli
2. Codebase keşif tool'u eklemek (basit bir `list_files`/glob)
3. `WORKSPACE_DIR`'ı gerçek proje köküne çevirmek — **bilerek riskli**,
   sandbox olmadan gerçek koda yazma/komut çalıştırma yetkisi vermek
   demek, spec.md'nin C2/C3 riskini tam devreye sokuyor

## Notlar

- `.env` dosyaları asla commit'lenmez (`.gitignore`'da), her ortamda
  (local, bulut) ayrı ayrı `.env.example`'dan kopyalanıp doldurulmalı.
- Repoda ayrıca `docs/ilham/` altında Hixie ve Boris Cherny üzerine
  yazılmış Türkçe özet/analiz notları vardı; içerikleri `spec.md`'ye
  taşındıktan sonra o dosyalar kaldırıldı — güncel referans artık
  `spec.md`.
