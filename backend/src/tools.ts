import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import type OpenAI from 'openai'

// v0 — SANDBOX YOK. spec.md'deki C1/C2/C3 riskleri burada henüz
// hiçbir şekilde azaltılmıyor. Sadece WORKSPACE_DIR altındaki
// dosyalarla sınırlamaya çalışan basit bir path-guard var; bu
// gerçek bir güvenlik sınırı DEĞİL, sadece yanlışlıkla dizin dışına
// çıkmayı zorlaştıran bir önlem. Toy/güvendiğin projeler dışında
// kullanma.
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR ?? './workspace')

function resolveInWorkspace(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_DIR, relativePath)
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    throw new Error(
      `Reddedildi: '${relativePath}' workspace dizininin dışına çıkıyor.`,
    )
  }
  return resolved
}

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

export { WORKSPACE_DIR }
