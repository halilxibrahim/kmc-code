import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripVTControlCharacters } from 'node:util'
import { renderEvent } from './render.js'

function plain(event: Record<string, unknown> & { type: string }) {
  const out = renderEvent(event)
  return out === null ? null : stripVTControlCharacters(out)
}

test('shows the command or path of a tool call', () => {
  assert.match(plain({ type: 'tool_call', name: 'run_command', input: { command: 'ls -la' } })!, /CALL\s+run_command ls -la/)
  assert.match(plain({ type: 'tool_call', name: 'read_file', input: { path: 'notes.md' } })!, /CALL\s+read_file notes\.md/)
})

test('shows why a call was blocked', () => {
  assert.match(plain({ type: 'tool_blocked', name: 'run_command', reasons: ['path outside workspace: ../.env'] })!, /BLOCK\s+path outside workspace: \.\.\/\.env/)
})

test('truncates long tool output', () => {
  const result = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const out = plain({ type: 'tool_result', name: 'run_command', result })!
  assert.match(out, /line 12/)
  assert.doesNotMatch(out, /line 13\b/)
  assert.match(out, /18 more lines/)
})

test('stays quiet for lifecycle events', () => {
  for (const type of ['connected', 'turn_start']) assert.equal(renderEvent({ type }), null)
  assert.equal(renderEvent({ type: 'turn_end', stop_reason: 'stop' }), null)
  assert.match(plain({ type: 'turn_end', stop_reason: 'max_steps_exceeded' })!, /step limit/)
})
