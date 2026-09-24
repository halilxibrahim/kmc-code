import path from 'node:path'
import { parse, type ParseEntry } from 'shell-quote'
import { WORKSPACE_DIR, isInside } from './workspace.js'

// Level 0 of the pre-execution classifier (see spec.md §8): deterministic rules,
// no model. Later levels (small LLM judge, fine-tuned model) must keep this
// exact interface so the agent loop never changes.

export type Scope = 'workspace' | 'outside_workspace' | 'unknown'

export interface Verdict {
  irreversible: boolean
  // null: rules cannot judge intent without understanding the task — Level 1+ territory.
  offTask: boolean | null
  mutates: boolean
  scope: Scope
  network: boolean
  privileged: boolean
  decision: 'allow' | 'block'
  reasons: string[]
  classifier: 'rules-v0'
}

export interface ToolCallContext {
  task: string
  plan: string
  tool: string
  input: Record<string, unknown>
}

export interface ClassifierOptions {
  // Boundary: anything outside it is "outside_workspace".
  workspaceDir?: string
  // Where relative paths are resolved from; may be a subdirectory of workspaceDir.
  cwd?: string
  // Extra directories that count as inside (e.g. a host's scratch dir).
  extraRoots?: string[]
  allowNetwork?: boolean
}

interface PathEnv {
  workspaceDir: string
  cwd: string
  extraRoots: string[]
}

interface Findings {
  irreversible: boolean
  mutates: boolean
  network: boolean
  privileged: boolean
  scope: Scope
  reasons: string[]
}

const MUTATING = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'ln',
  'tee', 'truncate', 'dd', 'shred', 'install', 'unlink', 'patch',
])
const IRREVERSIBLE = new Set(['rm', 'rmdir', 'shred', 'dd', 'truncate', 'unlink'])
const NETWORK = new Set([
  'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'netcat', 'telnet',
  'ftp', 'ping', 'dig', 'nslookup', 'host', 'npx',
])
const PRIVILEGED = new Set(['sudo', 'su', 'doas'])
const WRAPPERS = new Set(['env', 'nohup', 'nice', 'time', 'command', 'timeout', 'stdbuf'])
// These run code that is not visible in the command line itself.
const OPAQUE = new Set(['eval', 'exec', 'source', '.', 'xargs'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'])
const INLINE_CODE_FLAGS: Record<string, string[]> = {
  node: ['-e', '--eval', '-p', '--print'],
  deno: ['eval'],
  bun: ['-e', '--eval'],
  python: ['-c'],
  python3: ['-c'],
  perl: ['-e', '-E'],
  ruby: ['-e'],
  php: ['-r'],
}
const GIT_MUTATING = new Set([
  'add', 'commit', 'mv', 'rm', 'reset', 'checkout', 'switch', 'restore', 'merge',
  'rebase', 'cherry-pick', 'revert', 'stash', 'clean', 'apply', 'am', 'tag', 'branch', 'init',
])
const GIT_NETWORK = new Set(['push', 'pull', 'fetch', 'clone', 'ls-remote', 'submodule'])
const PKG_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const PKG_INSTALL = new Set(['install', 'i', 'ci', 'add', 'update', 'upgrade', 'remove', 'uninstall', 'rm'])
const SEGMENT_OPS = new Set(['||', '&&', ';', ';;', '|', '|&', '&', '(', ')', '<('])
const SAFE_DEVICES = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/zero', '/dev/random', '/dev/urandom'])
const SCOPE_RANK: Record<Scope, number> = { workspace: 0, unknown: 1, outside_workspace: 2 }

function emptyFindings(): Findings {
  return { irreversible: false, mutates: false, network: false, privileged: false, scope: 'workspace', reasons: [] }
}

function widenScope(f: Findings, scope: Scope, reason: string) {
  if (SCOPE_RANK[scope] > SCOPE_RANK[f.scope]) f.scope = scope
  f.reasons.push(reason)
}

function pathScope(token: string, env: PathEnv): Scope {
  if (SAFE_DEVICES.has(token)) return 'workspace'
  if (token.startsWith('~')) return 'outside_workspace'
  const resolved = path.resolve(env.cwd, token)
  const roots = [env.workspaceDir, ...env.extraRoots]
  return roots.some((root) => isInside(root, resolved)) ? 'workspace' : 'outside_workspace'
}

function looksLikePath(token: string): boolean {
  return token.includes('/') || token === '..' || token.startsWith('~')
}

function checkPathToken(f: Findings, token: string, env: PathEnv) {
  const candidates = [token]
  const eq = token.indexOf('=')
  if (eq !== -1) candidates.push(token.slice(eq + 1)) // --out=../x, FOO=/etc/x
  for (const candidate of candidates) {
    if (looksLikePath(candidate) && pathScope(candidate, env) === 'outside_workspace') {
      widenScope(f, 'outside_workspace', `path outside workspace: ${candidate}`)
    }
  }
}

function isFlagOrAssignment(token: string) {
  return token.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token) || /^\d+(\.\d+)?[smhd]?$/.test(token)
}

function analyzeSegment(f: Findings, tokens: string[]) {
  let i = 0
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++

  let program = tokens[i] !== undefined ? path.basename(tokens[i]) : undefined
  while (program && (WRAPPERS.has(program) || PRIVILEGED.has(program))) {
    if (PRIVILEGED.has(program)) {
      f.privileged = true
      f.reasons.push(`privilege escalation: ${program}`)
    }
    i++
    while (i < tokens.length && isFlagOrAssignment(tokens[i])) i++
    program = tokens[i] !== undefined ? path.basename(tokens[i]) : undefined
  }
  if (!program) return

  const args = tokens.slice(i + 1)
  const sub = args.find((a) => !a.startsWith('-'))

  if (program === 'cd' && (args.length === 0 || args[0] === '~')) {
    widenScope(f, 'outside_workspace', 'cd without a path goes to $HOME')
  }
  if (program === 'cd' && args[0] === '-') {
    widenScope(f, 'unknown', 'cd - jumps to an unknown previous directory')
  }

  if (MUTATING.has(program)) {
    f.mutates = true
    f.reasons.push(`mutating command: ${program}`)
  }
  if (IRREVERSIBLE.has(program) || program.startsWith('mkfs')) {
    f.irreversible = true
    f.reasons.push(`irreversible command: ${program}`)
  }
  if (NETWORK.has(program)) {
    f.network = true
    f.reasons.push(`network command: ${program}`)
  }
  if (OPAQUE.has(program)) {
    widenScope(f, 'unknown', `runs code not visible in the command line: ${program}`)
  }
  if (SHELLS.has(program) && args.includes('-c')) {
    widenScope(f, 'unknown', `inline shell code: ${program} -c`)
  }
  const inlineFlags = INLINE_CODE_FLAGS[program]
  if (inlineFlags && args.some((a) => inlineFlags.includes(a))) {
    widenScope(f, 'unknown', `inline interpreter code: ${program}`)
  }

  if (program === 'sed' && args.some((a) => a === '-i' || a.startsWith('-i') || a === '--in-place')) {
    f.mutates = true
    f.reasons.push('in-place edit: sed -i')
  }
  if (program === 'find') {
    if (args.includes('-delete')) {
      f.mutates = true
      f.irreversible = true
      f.reasons.push('find -delete')
    }
    if (args.some((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a))) {
      widenScope(f, 'unknown', 'find -exec runs arbitrary commands')
    }
  }

  if (program === 'git' && sub) {
    if (GIT_MUTATING.has(sub)) {
      f.mutates = true
      f.reasons.push(`mutating git command: git ${sub}`)
    }
    if (GIT_NETWORK.has(sub)) {
      f.network = true
      f.reasons.push(`network git command: git ${sub}`)
    }
    const destructive =
      (sub === 'reset' && args.includes('--hard')) ||
      (sub === 'clean' && args.some((a) => /^-[a-zA-Z]*f/.test(a))) ||
      (sub === 'push' && args.some((a) => a === '-f' || a.startsWith('--force'))) ||
      (sub === 'branch' && args.includes('-D'))
    if (destructive) {
      f.irreversible = true
      f.reasons.push(`destructive git operation: git ${sub}`)
    }
  }

  if (PKG_MANAGERS.has(program) && sub && PKG_INSTALL.has(sub)) {
    f.mutates = true
    f.network = true
    f.reasons.push(`dependency change downloads packages: ${program} ${sub}`)
  }
  if (PKG_MANAGERS.has(program) && sub === 'publish') {
    f.network = true
    f.irreversible = true
    f.reasons.push(`publishes a package: ${program} publish`)
  }
  if ((program === 'pip' || program === 'pip3') && sub && ['install', 'uninstall'].includes(sub)) {
    f.mutates = true
    f.network = true
    f.reasons.push(`dependency change downloads packages: ${program} ${sub}`)
  }
}

function analyzeCommand(command: string, env: PathEnv): Findings {
  const f = emptyFindings()

  if (!command.trim()) {
    widenScope(f, 'unknown', 'empty command')
    return f
  }
  // shell-quote silently expands unknown variables to "" — `cat $HOME/.ssh/id_rsa`
  // would look like `cat /.ssh/id_rsa`. Refuse to guess what an expansion resolves to.
  if (/`|\$[A-Za-z_0-9{(]/.test(command)) {
    widenScope(f, 'unknown', 'variable expansion or command substitution')
  }

  // shell-quote treats newlines as whitespace, which would turn a second command into an argument.
  const entries: ParseEntry[] = parse(command.replace(/\r?\n/g, ' ; '))

  let segment: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    if (typeof entry === 'string') {
      checkPathToken(f, entry, env)
      segment.push(entry)
      continue
    }
    if ('comment' in entry) continue
    if (entry.op === 'glob') {
      checkPathToken(f, entry.pattern, env)
      segment.push(entry.pattern)
      continue
    }

    if (SEGMENT_OPS.has(entry.op)) {
      analyzeSegment(f, segment)
      segment = []
      continue
    }

    // Redirections: the next token is a file (or a file descriptor / here-string).
    const target = entries[i + 1]
    if (entry.op === '>' || entry.op === '>>') {
      if (typeof target === 'string' && !SAFE_DEVICES.has(target)) {
        f.mutates = true
        f.reasons.push(`writes to file via redirect: ${target}`)
      }
    }
    if ((entry.op === '>&' || entry.op === '<&' || entry.op === '<<<') && typeof target === 'string') {
      i++ // fd number or here-string content, not a path
    }
  }
  analyzeSegment(f, segment)

  return f
}

function decide(f: Findings, allowNetwork: boolean): Verdict['decision'] {
  if (f.scope !== 'workspace') return 'block'
  if (f.privileged) return 'block'
  // No human-confirmation flow exists yet, so irreversible means blocked, not "ask".
  if (f.irreversible) return 'block'
  if (f.network && !allowNetwork) return 'block'
  return 'allow'
}

export function classifyToolCall(ctx: ToolCallContext, options: ClassifierOptions = {}): Verdict {
  const workspaceDir = path.resolve(options.workspaceDir ?? WORKSPACE_DIR)
  const env: PathEnv = {
    workspaceDir,
    cwd: path.resolve(options.cwd ?? workspaceDir),
    extraRoots: (options.extraRoots ?? []).map((root) => path.resolve(root)),
  }
  const allowNetwork = options.allowNetwork ?? process.env.AGENT_ALLOW_NETWORK === 'true'

  let f: Findings
  switch (ctx.tool) {
    case 'run_command': {
      const command = ctx.input.command
      f = typeof command === 'string'
        ? analyzeCommand(command, env)
        : { ...emptyFindings(), scope: 'unknown', reasons: ['missing command'] }
      break
    }
    case 'read_file':
    case 'write_file': {
      f = emptyFindings()
      const target = ctx.input.path
      if (typeof target !== 'string' || !target) {
        widenScope(f, 'unknown', 'missing path')
      } else if (pathScope(target, env) !== 'workspace') {
        widenScope(f, 'outside_workspace', `path outside workspace: ${target}`)
      }
      if (ctx.tool === 'write_file') {
        f.mutates = true
        f.reasons.push('writes a file')
      }
      break
    }
    default:
      f = { ...emptyFindings(), scope: 'unknown', reasons: [`unknown tool: ${ctx.tool}`] }
  }

  if (f.network && !allowNetwork) f.reasons.push('network access is disabled (AGENT_ALLOW_NETWORK)')

  return {
    irreversible: f.irreversible,
    offTask: null,
    mutates: f.mutates,
    scope: f.scope,
    network: f.network,
    privileged: f.privileged,
    decision: decide(f, allowNetwork),
    reasons: f.reasons,
    classifier: 'rules-v0',
  }
}
