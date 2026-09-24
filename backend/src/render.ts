import { styleText } from 'node:util'

// Terminal rendering of agent events. Same event stream the web UI consumes.

const MAX_RESULT_LINES = 12

type Event = Record<string, unknown> & { type: string }

function badge(label: string, color: 'yellow' | 'green' | 'red' | 'gray') {
  return styleText(['bold', color], label.padEnd(5))
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const { command, path } = input as Record<string, unknown>
  if (typeof command === 'string') return command
  if (typeof path === 'string') return path
  return JSON.stringify(input)
}

function truncate(text: string): string {
  const lines = text.trimEnd().split('\n')
  if (lines.length <= MAX_RESULT_LINES) return lines.join('\n')
  const hidden = lines.length - MAX_RESULT_LINES
  return [...lines.slice(0, MAX_RESULT_LINES), `… ${hidden} more line${hidden === 1 ? '' : 's'}`].join('\n')
}

function indent(text: string): string {
  return text.split('\n').map((line) => `      ${line}`).join('\n')
}

export function renderEvent(event: Event): string | null {
  switch (event.type) {
    case 'assistant_text':
      return `\n${String(event.text)}\n`
    case 'tool_call':
      return `${badge('CALL', 'yellow')} ${event.name} ${styleText('dim', summarizeInput(event.input))}`
    case 'tool_blocked':
      return `${badge('BLOCK', 'red')} ${(event.reasons as string[]).join('; ')}`
    case 'tool_result':
      return `${badge('OK', 'green')}\n${styleText('dim', indent(truncate(String(event.result))))}`
    case 'tool_error':
      return `${badge('ERR', 'red')} ${String(event.error)}`
    case 'error':
      return `${badge('ERR', 'red')} ${String(event.message)}`
    case 'turn_end':
      return event.stop_reason === 'max_steps_exceeded'
        ? styleText('yellow', '(stopped: step limit reached)')
        : null
    default:
      return null
  }
}
