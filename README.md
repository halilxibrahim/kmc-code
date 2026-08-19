# kmc-code

LLM tabanlı bir coding agent aracı (Claude Code / Codex benzeri) — yavaş
yavaş, öğrenerek geliştiriliyor.

Güvenlik/güven mimarisi tasarım kararları için bkz. [`spec.md`](./spec.md).

## Yapı

- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS + Radix UI
- `backend/` — Node.js + TypeScript, WebSocket üzerinden agent event stream'i.
  LLM çağrıları OpenAI SDK ile OpenRouter üzerinden yapılıyor (varsayılan
  model: Qwen3.8 Max) — provider'a kilitlenmemek için OpenAI-uyumlu format
  kullanıyoruz, `MODEL` env değişkeniyle başka bir açık modele geçmek de
  mümkün.

## v0 kapsamı

Sandbox **yok**. Agent'a verilen `read_file` / `write_file` / `run_command`
tool'ları sadece `backend/workspace/` altındaki basit bir path-guard ile
sınırlı — bu gerçek bir güvenlik sınırı değil. Sadece toy/güvendiğin
projeler üzerinde çalıştır. Detaylar için `spec.md`.

## Çalıştırma

```bash
# Backend
cd backend
cp .env.example .env   # OPENROUTER_API_KEY'ini doldur
npm install
npm run dev             # ws://localhost:8787

# Frontend (ayrı bir terminalde)
cd frontend
npm install
npm run dev
```
