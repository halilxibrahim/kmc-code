import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAgentSocket, type LogEntry } from '@/hooks/use-agent-socket'
import { cn } from '@/lib/utils'

const EVENT_STYLE: Record<string, { label: string; className: string }> = {
  connected: { label: 'SYS', className: 'text-accent border-accent/40' },
  turn_start: { label: 'START', className: 'text-muted border-panel-border' },
  assistant_text: { label: 'AGENT', className: 'text-foreground border-panel-border' },
  tool_call: { label: 'CALL', className: 'text-warn border-warn/40' },
  tool_result: { label: 'OK', className: 'text-accent border-accent/40' },
  tool_error: { label: 'ERR', className: 'text-danger border-danger/40' },
  turn_end: { label: 'END', className: 'text-muted border-panel-border' },
  error: { label: 'ERR', className: 'text-danger border-danger/40' },
}

function statusMeta(status: 'connecting' | 'open' | 'closed') {
  if (status === 'open') return { text: 'ONLINE', dot: 'bg-accent', pulse: true }
  if (status === 'connecting') return { text: 'CONNECTING', dot: 'bg-warn', pulse: true }
  return { text: 'OFFLINE', dot: 'bg-danger', pulse: false }
}

function LogLine({ entry }: { entry: LogEntry }) {
  const meta = EVENT_STYLE[entry.event.type] ?? {
    label: entry.event.type.toUpperCase(),
    className: 'text-muted border-panel-border',
  }
  const { type, ...rest } = entry.event
  const hasPayload = Object.keys(rest).length > 0

  return (
    <div className="flex gap-3 border-b border-panel-border/60 px-4 py-2.5 text-xs">
      <span className="shrink-0 text-muted">{entry.time}</span>
      <span
        className={cn(
          'shrink-0 rounded-none border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider',
          meta.className,
        )}
      >
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        {typeof rest.text === 'string' ? (
          <p className="whitespace-pre-wrap text-foreground">{rest.text}</p>
        ) : hasPayload ? (
          <pre className="whitespace-pre-wrap break-all text-muted">
            {JSON.stringify(rest, null, 0)}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

function App() {
  const { status, log, send } = useAgentSocket()
  const [input, setInput] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const meta = statusMeta(status)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length])

  const handleSend = () => {
    if (!input.trim()) return
    send({ type: 'user_message', text: input })
    setInput('')
  }

  return (
    <div className="flex h-svh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-panel-border bg-panel md:flex">
        <div className="border-b border-panel-border px-4 py-4">
          <p className="text-[10px] tracking-[0.2em] text-muted">KMC-CODE</p>
          <p className="text-sm font-semibold text-foreground">AGENT CONSOLE</p>
        </div>
        <div className="space-y-4 px-4 py-4 text-xs">
          <div>
            <p className="mb-1 text-[10px] tracking-widest text-muted">STATUS</p>
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', meta.dot, meta.pulse && 'animate-pulse')} />
              <span className="text-foreground">{meta.text}</span>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] tracking-widest text-muted">MODEL</p>
            <p className="text-foreground">qwen/qwen3.8-max</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] tracking-widest text-muted">SCOPE</p>
            <p className="text-foreground">backend/workspace/</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] tracking-widest text-muted">SANDBOX</p>
            <p className="text-warn">NONE — v0</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] tracking-widest text-muted">EVENTS</p>
            <p className="text-foreground">{log.length}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-panel-border px-4 py-3 md:hidden">
          <span className="text-sm font-semibold">KMC-CODE // AGENT CONSOLE</span>
          <span className="flex items-center gap-2 text-xs">
            <span className={cn('h-2 w-2 rounded-full', meta.dot, meta.pulse && 'animate-pulse')} />
            {meta.text}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {log.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted">
              // bağlantı bekleniyor — event log burada akacak
            </p>
          ) : (
            log.map((entry) => <LogLine key={entry.id} entry={entry} />)
          )}
          <div ref={logEndRef} />
        </main>

        <footer className="border-t border-panel-border p-3">
          <div className="flex items-center gap-2 border border-panel-border bg-panel px-3 py-2">
            <span className="text-accent">{'>'}</span>
            <input
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="agent'a bir görev yaz..."
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleSend}
              className="rounded-none bg-accent text-background hover:bg-accent/90"
            >
              GÖNDER
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
