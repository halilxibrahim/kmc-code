import 'dotenv/config'
import { WebSocketServer } from 'ws'
import { runAgentTurn } from './agent-loop.js'

const PORT = Number(process.env.PORT ?? 8787)

const wss = new WebSocketServer({ port: PORT })

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

console.log(`Agent backend (v0, sandbox yok) ws://localhost:${PORT} üzerinde dinliyor`)
