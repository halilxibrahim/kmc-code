import OpenAI from 'openai'
import { executeTool, toolDefinitions } from './tools.js'

// OpenRouter, OpenAI ile aynı Chat Completions formatını kullanıyor —
// bu yüzden sadece baseURL + apiKey değiştirerek provider'ı takas ettik.
// Model'i değiştirmek de artık MODEL env değişkeniyle, kod değişmeden
// mümkün (spec.md'deki "sağlayıcıya kilitlenmeme" hedefi).
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:5173',
    'X-Title': 'kmc-code agent v0',
  },
})

const MODEL = process.env.MODEL ?? 'qwen/qwen3.8-max'

const SYSTEM_PROMPT = `Sen bir coding agent'sın. Kullanıcının verdiği görevi
tamamlamak için read_file, write_file ve run_command tool'larını
kullanabilirsin. Her adımda ne yaptığını kısaca açıkla.`

export type AgentEventEmitter = (event: Record<string, unknown>) => void

// Basit agentic loop: LLM'e mesajları gönder, tool_calls gelirse çalıştır,
// sonucu geri besle, model durana kadar tekrar et.
export async function runAgentTurn(userMessage: string, emit: AgentEventEmitter) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  emit({ type: 'turn_start' })

  // v0'da sonsuz döngüye karşı basit bir üst sınır
  for (let step = 0; step < 20; step++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      tools: toolDefinitions,
      messages,
    })

    const choice = response.choices[0]
    const message = choice.message

    messages.push(message)

    if (message.content) {
      emit({ type: 'assistant_text', text: message.content })
    }

    const toolCalls = message.tool_calls ?? []

    if (toolCalls.length === 0) {
      emit({ type: 'turn_end', stop_reason: choice.finish_reason })
      return
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') continue

      const { name, arguments: rawArgs } = toolCall.function
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(rawArgs)
      } catch {
        // model geçersiz JSON üretti — boş input ile devam et, tool kendi hata versin
      }

      emit({ type: 'tool_call', name, input })

      let content: string
      let isError = false
      try {
        content = String(await executeTool(name, input))
      } catch (error) {
        content = `Hata: ${error instanceof Error ? error.message : String(error)}`
        isError = true
      }

      emit(isError ? { type: 'tool_error', name, error: content } : { type: 'tool_result', name, result: content })

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content,
      })
    }
  }

  emit({ type: 'turn_end', stop_reason: 'max_steps_exceeded' })
}
