#!/usr/bin/env node
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { styleText } from 'node:util'
import { config } from 'dotenv'
import { HELP, parseArgs } from './cli-args.js'
import { fromBackend } from './paths.js'
import { renderEvent } from './render.js'

config({ path: fromBackend('.env'), quiet: true })

const command = parseArgs(process.argv.slice(2))

if (command.kind === 'help') {
  console.log(HELP)
  process.exit(0)
}
if (command.kind === 'error') {
  console.error(`kmc: ${command.message}\n\n${HELP}`)
  process.exit(2)
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error(`kmc: OPENROUTER_API_KEY is not set — add it to ${fromBackend('.env')}`)
  process.exit(1)
}

// Must happen before the agent modules load: they read these at import time.
if (command.workspace) process.env.WORKSPACE_DIR = path.resolve(process.cwd(), command.workspace)

const { runAgentTurn } = await import('./agent-loop.js')
const { WORKSPACE_DIR } = await import('./workspace.js')

const emit = (event: Record<string, unknown>) => {
  const out = renderEvent(event as Record<string, unknown> & { type: string })
  if (out) console.log(out)
}

async function runTask(task: string): Promise<boolean> {
  try {
    await runAgentTurn(task, emit)
    return true
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    return false
  }
}

if (command.kind === 'serve') {
  const { startServer } = await import('./server.js')
  // Loopback only: anything that can reach this port can drive the agent.
  const host = '127.0.0.1'
  await startServer({ port: command.port, host })
  console.log(`kmc serve — ws://${host}:${command.port} (workspace: ${WORKSPACE_DIR}, no sandbox)`)
} else if (command.kind === 'run') {
  process.exitCode = (await runTask(command.task)) ? 0 : 1
} else {
  console.log(styleText('dim', `kmc — workspace: ${WORKSPACE_DIR} (no sandbox). /help for commands, /exit to quit.`))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.on('SIGINT', () => rl.close())

  while (true) {
    let line: string
    try {
      line = await rl.question(styleText('cyan', '\n> '))
    } catch {
      break // input closed (Ctrl+C / Ctrl+D / end of piped input)
    }
    const task = line.trim()
    if (!task) continue
    if (task === '/exit' || task === '/quit') break
    if (task === '/help') {
      console.log(HELP)
      continue
    }
    await runTask(task)
  }
  rl.close()
}
