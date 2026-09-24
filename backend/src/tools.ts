import { readFile, writeFile } from 'node:fs/promises'
import { execa } from 'execa'
import type OpenAI from 'openai'
import { WORKSPACE_DIR, resolveInWorkspace } from './workspace.js'

// v0 — SANDBOX YOK. Her tool çağrısı önce classifier.ts'ten (rules-v0)
// geçiyor; buradaki path-guard ikinci bir savunma katmanı. İkisi de
// gerçek bir güvenlik sınırı DEĞİL (bkz. spec.md §8) — toy/güvendiğin
// projeler dışında kullanma.

export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Workspace içindeki bir dosyanın içeriğini okur.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace köküne göre göreli yol' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Workspace içinde bir dosyaya içerik yazar (üzerine yazar).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace köküne göre göreli yol' },
          content: { type: 'string', description: 'Dosyaya yazılacak içerik' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Workspace dizininde bir kabuk komutu çalıştırır.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Çalıştırılacak komut (örn. "npm test")' },
        },
        required: ['command'],
      },
    },
  },
]

export async function executeTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case 'read_file': {
      const filePath = resolveInWorkspace(input.path as string)
      return await readFile(filePath, 'utf-8')
    }
    case 'write_file': {
      const filePath = resolveInWorkspace(input.path as string)
      await writeFile(filePath, input.content as string, 'utf-8')
      return `Yazıldı: ${input.path}`
    }
    case 'run_command': {
      const { stdout, stderr, exitCode } = await execa(input.command as string, {
        shell: true,
        cwd: WORKSPACE_DIR,
        reject: false,
      })
      return `exit_code: ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`
    }
    default:
      throw new Error(`Bilinmeyen tool: ${name}`)
  }
}
