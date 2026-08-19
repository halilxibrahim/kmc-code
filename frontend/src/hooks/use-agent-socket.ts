import { useCallback, useEffect, useRef, useState } from 'react'

export interface AgentEvent {
  type: string
  [key: string]: unknown
}

type ConnectionStatus = 'connecting' | 'open' | 'closed'

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? 'ws://localhost:8787'

// v0: basit bir hook. RTK Query / Zustand gibi bir state yönetimine
// geçip geçmeyeceğimize gerçek kullanımdan sonra karar veriyoruz (spec.md).
export function useAgentSocket() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const socket = new WebSocket(BACKEND_WS_URL)
    socketRef.current = socket

    socket.addEventListener('open', () => setStatus('open'))
    socket.addEventListener('close', () => setStatus('closed'))
    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data) as AgentEvent
        setEvents((prev) => [...prev, parsed])
      } catch {
        // JSON olmayan mesajları görmezden gel (v0)
      }
    })

    return () => socket.close()
  }, [])

  const send = useCallback((message: AgentEvent) => {
    socketRef.current?.send(JSON.stringify(message))
  }, [])

  return { status, events, send }
}
