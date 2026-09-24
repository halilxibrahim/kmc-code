import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { ToolCallContext, Verdict } from './classifier.js'

// Every classifier decision is appended here as JSONL. This is the future
// training set for a Level 2 (fine-tuned) classifier — see spec.md §8.
// Gitignored: task/plan/command text can contain sensitive data (spec.md C6).
const LOG_FILE = path.resolve(process.env.DECISION_LOG ?? './logs/tool-decisions.jsonl')

export async function logDecision(ctx: ToolCallContext, verdict: Verdict) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...ctx, verdict }) + '\n'
  try {
    await mkdir(path.dirname(LOG_FILE), { recursive: true })
    await appendFile(LOG_FILE, line, 'utf-8')
  } catch (error) {
    console.error('decision log yazılamadı:', error)
  }
}
