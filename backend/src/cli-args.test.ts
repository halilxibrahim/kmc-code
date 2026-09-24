import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PORT, parseArgs } from './cli-args.js'

test('no arguments starts an interactive session', () => {
  assert.deepEqual(parseArgs([]), { kind: 'interactive', workspace: undefined })
})

test('positional words become a single task, quoted or not', () => {
  assert.deepEqual(parseArgs(['fix the failing test']), { kind: 'run', task: 'fix the failing test', workspace: undefined })
  assert.deepEqual(parseArgs(['fix', 'the', 'failing', 'test']), { kind: 'run', task: 'fix the failing test', workspace: undefined })
})

test('serve with default and custom port', () => {
  assert.deepEqual(parseArgs(['serve']), { kind: 'serve', port: DEFAULT_PORT, workspace: undefined })
  assert.deepEqual(parseArgs(['serve', '--port', '9000']), { kind: 'serve', port: 9000, workspace: undefined })
  assert.deepEqual(parseArgs(['serve', '--port=9000']), { kind: 'serve', port: 9000, workspace: undefined })
})

test('--workspace works in both forms and with every mode', () => {
  assert.deepEqual(parseArgs(['--workspace', '../app']), { kind: 'interactive', workspace: '../app' })
  assert.deepEqual(parseArgs(['--workspace=../app', 'list files']), { kind: 'run', task: 'list files', workspace: '../app' })
  assert.deepEqual(parseArgs(['serve', '--workspace', 'x']), { kind: 'serve', port: DEFAULT_PORT, workspace: 'x' })
})

test('"serve" followed by more words is a task, not the serve command', () => {
  assert.deepEqual(parseArgs(['serve', 'the', 'files']), { kind: 'run', task: 'serve the files', workspace: undefined })
})

test('help wins wherever it appears', () => {
  assert.equal(parseArgs(['--help']).kind, 'help')
  assert.equal(parseArgs(['serve', '-h']).kind, 'help')
})

test('rejects bad input with a message instead of guessing', () => {
  for (const argv of [['--workspace'], ['--port', 'abc', 'serve'], ['serve', '--port', '70000'], ['--port', '9000'], ['--verbose']]) {
    assert.equal(parseArgs(argv).kind, 'error', argv.join(' '))
  }
})
