import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyToolCall, type Verdict } from './classifier.js'

const workspaceDir = '/home/dev/project/backend/workspace'

function cmd(command: string, allowNetwork = false): Verdict {
  return classifyToolCall(
    { task: 'test', plan: '', tool: 'run_command', input: { command } },
    { workspaceDir, allowNetwork },
  )
}

function file(tool: 'read_file' | 'write_file', path: string): Verdict {
  return classifyToolCall({ task: 'test', plan: '', tool, input: { path } }, { workspaceDir })
}

test('blocks the exact escape observed while testing the agent', () => {
  const find = cmd('ls -la ../.. && find ../.. -maxdepth 3 -name ".env*" 2>/dev/null')
  assert.equal(find.decision, 'block')
  assert.equal(find.scope, 'outside_workspace')

  const cat = cmd('cat ../../backend/.env')
  assert.equal(cat.decision, 'block')
  assert.equal(cat.scope, 'outside_workspace')
})

test('allows ordinary read-only work inside the workspace', () => {
  for (const command of ['ls -la', 'cat notes.md', 'cat notes.md | grep todo', 'find . -name "*.md"', 'npm test 2>&1 | tee out.txt', 'echo hi > /dev/null']) {
    assert.equal(cmd(command).decision, 'allow', command)
  }
})

test('marks writes as mutating but allows them inside the workspace', () => {
  const v = cmd('echo hello > notes.md')
  assert.equal(v.mutates, true)
  assert.equal(v.decision, 'allow')
  assert.equal(cmd('mkdir src && touch src/a.ts').decision, 'allow')
})

test('blocks absolute paths and home directory access', () => {
  assert.equal(cmd('cat /etc/passwd').decision, 'block')
  assert.equal(cmd('cat ~/.ssh/id_rsa').decision, 'block')
  assert.equal(cmd('cd').scope, 'outside_workspace')
  assert.equal(cmd('cd .. && ls').decision, 'block')
  assert.equal(cmd('cp notes.md --target-directory=../../x').decision, 'block')
})

test('allows absolute paths that stay inside the workspace', () => {
  assert.equal(cmd(`cat ${workspaceDir}/notes.md`).decision, 'allow')
})

test('does not treat a sibling directory with a shared prefix as inside', () => {
  assert.equal(cmd(`cat ${workspaceDir}-evil/secret`).decision, 'block')
})

test('blocks irreversible commands even inside the workspace', () => {
  for (const command of ['rm notes.md', 'rm -rf src', 'find . -name "*.log" -delete', 'git reset --hard', 'git clean -fd']) {
    const v = cmd(command)
    assert.equal(v.irreversible, true, command)
    assert.equal(v.decision, 'block', command)
  }
})

test('blocks privilege escalation', () => {
  const v = cmd('sudo ls')
  assert.equal(v.privileged, true)
  assert.equal(v.decision, 'block')
})

test('blocks network access unless explicitly allowed', () => {
  for (const command of ['curl https://example.com', 'npm install lodash', 'git pull', 'npx create-app x']) {
    const v = cmd(command)
    assert.equal(v.network, true, command)
    assert.equal(v.decision, 'block', command)
  }
  assert.equal(cmd('npm install lodash', true).decision, 'allow')
})

test('treats code it cannot see as unknown scope', () => {
  for (const command of [
    'echo $HOME',
    'cat $HOME/.ssh/id_rsa',
    'cat `echo /etc/passwd`',
    'ls $(pwd)/..',
    'bash -c "cat /etc/passwd"',
    'node -e "require(\'fs\').readFileSync(\'/etc/passwd\')"',
    'python3 -c "print(1)"',
    'eval ls',
    'find . -exec cat {} \\;',
    'ls | xargs cat',
  ]) {
    const v = cmd(command)
    assert.notEqual(v.scope, 'workspace', command)
    assert.equal(v.decision, 'block', command)
  }
})

test('does not let a newline hide a second command', () => {
  const v = cmd('ls\nrm notes.md')
  assert.equal(v.irreversible, true)
  assert.equal(v.decision, 'block')
})

test('sees through wrappers', () => {
  assert.equal(cmd('env FOO=1 rm notes.md').irreversible, true)
  assert.equal(cmd('timeout 5 curl https://example.com').network, true)
  assert.equal(cmd('nohup sudo ls').privileged, true)
})

test('classifies file tools by path', () => {
  assert.equal(file('read_file', 'notes.md').decision, 'allow')
  assert.equal(file('read_file', 'notes.md').mutates, false)
  assert.equal(file('write_file', 'notes.md').mutates, true)
  assert.equal(file('write_file', 'notes.md').decision, 'allow')
  assert.equal(file('read_file', '../../.env').decision, 'block')
  assert.equal(file('read_file', '/etc/passwd').decision, 'block')
})

test('blocks unknown tools and malformed input', () => {
  assert.equal(classifyToolCall({ task: '', plan: '', tool: 'delete_repo', input: {} }, { workspaceDir }).decision, 'block')
  assert.equal(classifyToolCall({ task: '', plan: '', tool: 'run_command', input: {} }, { workspaceDir }).decision, 'block')
  assert.equal(cmd('').decision, 'block')
})

test('leaves offTask undecided at Level 0', () => {
  assert.equal(cmd('ls').offTask, null)
})
