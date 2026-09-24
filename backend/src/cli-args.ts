export type CliCommand =
  | { kind: 'help' }
  | { kind: 'interactive'; workspace?: string }
  | { kind: 'run'; task: string; workspace?: string }
  | { kind: 'serve'; port: number; workspace?: string }
  | { kind: 'error'; message: string }

export const DEFAULT_PORT = 8787

export const HELP = `kmc — a minimal coding agent

Usage:
  kmc                      start an interactive session
  kmc <task...>            run a single task and exit
  kmc serve [--port <n>]   serve the agent over WebSocket for other clients
                           (web UI, desktop, ...) — default port ${DEFAULT_PORT}

Options:
  --workspace <dir>        directory the agent may work in
                           (default: backend/workspace — there is no sandbox yet,
                           so pointing this at a real project is your call)
  -h, --help               show this help

Interactive commands:
  /help                    show this help
  /exit                    quit`

export function parseArgs(argv: string[]): CliCommand {
  let workspace: string | undefined
  let port: number | undefined
  const positionals: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') return { kind: 'help' }

    const [flag, inlineValue] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg, undefined]
    if (flag === '--workspace' || flag === '--port') {
      const value = inlineValue ?? argv[++i]
      if (value === undefined || value === '') return { kind: 'error', message: `${flag} needs a value` }
      if (flag === '--workspace') {
        workspace = value
      } else {
        port = Number(value)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return { kind: 'error', message: `invalid port: ${value}` }
        }
      }
      continue
    }
    if (arg.startsWith('-')) return { kind: 'error', message: `unknown option: ${arg}` }
    positionals.push(arg)
  }

  if (positionals[0] === 'serve' && positionals.length === 1) {
    return { kind: 'serve', port: port ?? DEFAULT_PORT, workspace }
  }
  if (port !== undefined) return { kind: 'error', message: '--port only applies to `kmc serve`' }
  if (positionals.length === 0) return { kind: 'interactive', workspace }
  return { kind: 'run', task: positionals.join(' '), workspace }
}
