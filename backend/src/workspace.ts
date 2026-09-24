import path from 'node:path'

export const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR ?? './workspace')

// path.relative instead of startsWith: "/work/space-evil".startsWith("/work/space") is true.
export function isInside(dir: string, target: string): boolean {
  const rel = path.relative(dir, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function resolveInWorkspace(relativePath: string, workspaceDir = WORKSPACE_DIR): string {
  const resolved = path.resolve(workspaceDir, relativePath)
  if (!isInside(workspaceDir, resolved)) {
    throw new Error(`Reddedildi: '${relativePath}' workspace dizininin dışına çıkıyor.`)
  }
  return resolved
}
