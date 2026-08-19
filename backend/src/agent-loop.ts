import Anthropic from '@anthropic-ai/sdk'
import { executeTool, toolDefinitions } from './tools.js'

const anthropic = new Anthropic() // ANTHROPIC_API_KEY env değişkeninden okur

const SYSTEM_PROMPT = `Sen bir coding agent'sın. Kullanıcının verdiği görevi
tamamlamak için read_file, write_file ve run_command tool'larını
kullanabilirsin. Her adımda ne yaptığını kısaca açıkla.`

export type AgentEventEmitter = (event: Record<string, unknown>) => void

// Basit agentic loop: LLM'e mesajları gönder, tool_use gelirse çalıştır,
// sonucu geri besle, model durana kadar tekrar et.
export async function runAgentTurn(userMessage: string, emit: AgentEventEmitter) {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  emit({ type: 'turn_start' })

  // v0'da sonsuz döngüye karşı basit bir üst sınır
  for (let step = 0; step < 20; step++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )

    for (const block of response.content) {
      if (block.type === 'text') {
        emit({ type: 'assistant_text', text: block.text })
      }
    }

    if (toolUses.length === 0) {
      emit({ type: 'turn_end', stop_reason: response.stop_reason })
      return
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      emit({ type: 'tool_call', name: toolUse.name, input: toolUse.input })
      try {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        )
        emit({ type: 'tool_result', name: toolUse.name, result })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: String(result),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        emit({ type: 'tool_error', name: toolUse.name, error: message })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Hata: ${message}`,
          is_error: true,
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }

  emit({ type: 'turn_end', stop_reason: 'max_steps_exceeded' })
}
