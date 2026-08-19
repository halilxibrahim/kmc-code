import { useCallback, useEffect, useRef, useState } from 'react'

export interface AgentEvent {
  type: string
  [key: string]: unknown
}

export interface LogEntry {
  id: number
  time: string
  event: AgentEvent
}

type ConnectionStatus = 'connecting' | 'open' | 'closed'

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? 'ws://localhost:8787'

// v0: basit bir hook. RTK Query / Zustand gibi bir state yönetimine
// geçip geçmeyeceğimize gerçek kullanımdan sonra karar veriyoruz (spec.md).
export function useAgentSocket() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [log, setLog] = useState<LogEntry[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    const socket = new WebSocket(BACKEND_WS_URL)
    socketRef.current = socket

    socket.addEventListener('open', () => setStatus('open'))
    socket.addEventListener('close', () => setStatus('closed'))
    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data) as AgentEvent
        const entry: LogEntry = {
          id: nextId.current++,
          time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
          event: parsed,
        }
        setLog((prev) => [...prev, entry])
      } catch {
        // JSON olmayan mesajları görmezden gel (v0)
      }
    })

    return () => socket.close()
  }, [])

  const send = useCallback((message: AgentEvent) => {
    socketRef.current?.send(JSON.stringify(message))
  }, [])

  return { status, log, send }
}
