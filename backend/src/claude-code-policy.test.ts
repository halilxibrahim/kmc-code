import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideForClaudeCode, type ClaudeCodeHookInput } from './claude-code-policy.js'

const project = '/home/dev/my-app'
const scratchpad = '/tmp/claude-1000/-home-dev-my-app/abc/scratchpad'

function decide(toolName: string, toolInput: Record<string, unknown>, cwd = project) {
  const input: ClaudeCodeHookInput = {
    hook_event_name: 'PreToolUse',
    cwd,
    scratchpad_dir: scratchpad,
    tool_name: toolName,
    tool_input: toolInput,
  }
  return decideForClaudeCode(input, project)?.output?.hookSpecificOutput.permissionDecision ?? null
}

test('denies reading secrets outside the project', () => {
  assert.equal(decide('Bash', { command: 'cat ../other-project/.env' }), 'deny')
  assert.equal(decide('Bash', { command: 'cat ~/.ssh/id_rsa' }), 'deny')
  assert.equal(decide('Read', { file_path: '/home/dev/.aws/credentials' }), 'deny')
  assert.equal(decide('Write', { file_path: '/etc/hosts', content: 'x' }), 'deny')
})

test('denies privilege escalation', () => {
  assert.equal(decide('Bash', { command: 'sudo rm -rf node_modules' }), 'deny')
})

test('asks instead of blocking risky but common actions', () => {
  assert.equal(decide('Bash', { command: 'rm -rf dist' }), 'ask')
  assert.equal(decide('Bash', { command: 'npm install zod' }), 'ask')
  assert.equal(decide('Bash', { command: 'git push --force' }), 'ask')
  assert.equal(decide('Bash', { command: 'echo $NODE_ENV' }), 'ask')
})

test('stays silent on ordinary work so Claude Code permissions apply unchanged', () => {
  assert.equal(decide('Bash', { command: 'npm test' }), null)
  assert.equal(decide('Bash', { command: 'git status' }), null)
  assert.equal(decide('Read', { file_path: `${project}/src/index.ts` }), null)
  assert.equal(decide('Edit', { file_path: `${project}/src/index.ts`, old_string: 'a', new_string: 'b' }), null)
})

test('resolves relative paths from the current subdirectory, not the project root', () => {
  assert.equal(decide('Bash', { command: 'cat ../README.md' }, `${project}/src`), null)
  assert.equal(decide('Bash', { command: 'cat ../../.env' }, `${project}/src`), 'deny')
})

test("treats Claude Code's scratchpad as inside", () => {
  assert.equal(decide('Bash', { command: `echo notes > ${scratchpad}/plan.md` }), null)
})

test('never returns allow', () => {
  for (const command of ['ls', 'npm test', 'cat package.json']) {
    assert.notEqual(decide('Bash', { command }), 'allow')
  }
})

test('has no opinion on tools it does not map', () => {
  assert.equal(decideForClaudeCode({ hook_event_name: 'PreToolUse', cwd: project, tool_name: 'Grep', tool_input: {} }, project), null)
  assert.equal(decideForClaudeCode({ hook_event_name: 'PostToolUse', cwd: project, tool_name: 'Bash', tool_input: { command: 'ls' } }, project), null)
})
