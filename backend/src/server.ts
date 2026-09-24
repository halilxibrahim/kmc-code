import { WebSocketServer } from 'ws'
import { runAgentTurn } from './agent-loop.js'

// `kmc serve`: exposes the same agent core over WebSocket so other clients
// (the web UI today, desktop/IDE later) can sit on top of the CLI.
export function startServer({ port, host }: { port: number; host: string }) {
  const wss = new WebSocketServer({ port, host })

  wss.on('connection', (socket) => {
    const emit = (event: Record<string, unknown>) => socket.send(JSON.stringify(event))

    emit({ type: 'connected' })

    socket.on('message', async (raw) => {
      let message: { type: string; text?: string }
      try {
        message = JSON.parse(raw.toString())
      } catch {
        emit({ type: 'error', message: 'Geçersiz JSON mesajı' })
        return
      }

      if (message.type === 'user_message' && message.text) {
        try {
          await runAgentTurn(message.text, emit)
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error)
          emit({ type: 'error', message: text })
        }
      }
    })
  })

  return new Promise<WebSocketServer>((resolve, reject) => {
    wss.once('listening', () => resolve(wss))
    wss.once('error', reject)
  })
}
