import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAgentSocket } from '@/hooks/use-agent-socket'

function App() {
  const { status, events, send } = useAgentSocket()
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    send({ type: 'user_message', text: input })
    setInput('')
  }

  return (
    <div className="mx-auto flex h-svh max-w-2xl flex-col p-4">
      <header className="flex items-center justify-between border-b border-input pb-3">
        <h1 className="text-lg font-medium">kmc-code — agent v0</h1>
        <span className="text-xs text-accent-foreground/70">
          backend: {status}
        </span>
      </header>

      <main className="flex-1 space-y-2 overflow-y-auto py-4">
        {events.length === 0 && (
          <p className="text-sm text-accent-foreground/60">
            Henüz mesaj yok. Backend'e bağlandığında agent event'leri burada
            listelenecek.
          </p>
        )}
        {events.map((event, i) => (
          <pre
            key={i}
            className="rounded-md bg-accent p-2 text-xs text-accent-foreground"
          >
            {JSON.stringify(event, null, 2)}
          </pre>
        ))}
      </main>

      <footer className="flex gap-2 border-t border-input pt-3">
        <input
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Agent'a bir görev yaz..."
        />
        <Button onClick={handleSend}>Gönder</Button>
      </footer>
    </div>
  )
}

export default App
