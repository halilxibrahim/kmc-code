import { fileURLToPath } from 'node:url'
import { decideForClaudeCode, type ClaudeCodeHookInput } from './claude-code-policy.js'
import { logDecision } from './decision-log.js'

// Claude Code PreToolUse hook entry point: JSON in on stdin, decision out on
// stdout. Run `node dist/claude-code-hook.js --print-config` for setup.

const MATCHER = 'Bash|Write|Edit|MultiEdit|NotebookEdit|Read'

function printConfig() {
  const script = fileURLToPath(new URL('../dist/claude-code-hook.js', import.meta.url))
  const config = {
    hooks: {
      PreToolUse: [
        {
          matcher: MATCHER,
          hooks: [{ type: 'command', command: `node "${script}"`, timeout: 10 }],
        },
      ],
    },
  }
  console.log(JSON.stringify(config, null, 2))
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

function ask(reason: string) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `kmc-guard: ${reason}`,
    },
  }))
}

async function main() {
  if (process.argv.includes('--print-config')) {
    printConfig()
    return
  }

  let input: ClaudeCodeHookInput
  try {
    input = JSON.parse(await readStdin())
  } catch {
    // Neither silently allow nor hard-block on our own bug: let the human decide.
    ask('could not parse hook input')
    return
  }

  const result = decideForClaudeCode(input)
  if (!result) return

  await logDecision(result.ctx, result.verdict, {
    source: 'claude-code',
    session_id: input.session_id,
    cwd: input.cwd,
    tool_name: input.tool_name,
  })
  if (result.output) process.stdout.write(JSON.stringify(result.output))
}

main().catch((error) => {
  ask(`internal error: ${error instanceof Error ? error.message : String(error)}`)
})
