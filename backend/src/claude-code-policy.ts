import { classifyToolCall, type ToolCallContext, type Verdict } from './classifier.js'

// Adapts the classifier to Claude Code's PreToolUse hook. The classifier
// reports facts; this file owns the Claude Code policy. Unlike our own agent,
// Claude Code has a permission prompt, so risky-but-common actions become
// "ask" instead of a hard block.
//
// It never returns "allow": that would bypass Claude Code's own permission
// rules. The guard can only add friction, never remove it.

export interface ClaudeCodeHookInput {
  session_id?: string
  cwd?: string
  scratchpad_dir?: string
  hook_event_name?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

export interface ClaudeCodeHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse'
    permissionDecision: 'deny' | 'ask'
    permissionDecisionReason: string
  }
}

export interface ClaudeCodeDecision {
  ctx: ToolCallContext
  verdict: Verdict
  // null: no opinion, Claude Code's normal permission flow applies.
  output: ClaudeCodeHookOutput | null
}

function toContext(toolName: string, input: Record<string, unknown>): ToolCallContext | null {
  const base = { task: '', plan: '' }
  switch (toolName) {
    case 'Bash':
      return { ...base, tool: 'run_command', input: { command: input.command } }
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return { ...base, tool: 'write_file', input: { path: input.file_path } }
    case 'NotebookEdit':
      return { ...base, tool: 'write_file', input: { path: input.notebook_path } }
    case 'Read':
      return { ...base, tool: 'read_file', input: { path: input.file_path } }
    default:
      return null
  }
}

function policy(verdict: Verdict): 'deny' | 'ask' | null {
  if (verdict.privileged || verdict.scope === 'outside_workspace') return 'deny'
  if (verdict.scope === 'unknown' || verdict.irreversible || verdict.network) return 'ask'
  return null
}

export function decideForClaudeCode(
  input: ClaudeCodeHookInput,
  projectDir = process.env.CLAUDE_PROJECT_DIR,
): ClaudeCodeDecision | null {
  if (input.hook_event_name && input.hook_event_name !== 'PreToolUse') return null
  const ctx = toContext(input.tool_name ?? '', input.tool_input ?? {})
  if (!ctx) return null

  const workspaceDir = projectDir ?? input.cwd ?? process.cwd()
  const verdict = classifyToolCall(ctx, {
    workspaceDir,
    cwd: input.cwd ?? workspaceDir,
    extraRoots: input.scratchpad_dir ? [input.scratchpad_dir] : [],
    // Network is a policy question here ("ask"), not a hard block.
    allowNetwork: true,
  })

  const decision = policy(verdict)
  const output: ClaudeCodeHookOutput | null = decision && {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: `kmc-guard (${verdict.classifier}): ${verdict.reasons.join('; ')}`,
    },
  }
  return { ctx, verdict, output }
}
