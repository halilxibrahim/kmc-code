import path from 'node:path'
import { fileURLToPath } from 'node:url'

// src/ and dist/ both sit directly under backend/, so '..' is backend/ from either.
// Paths are anchored here, not to the cwd: the CLI can be run from any directory.
export const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url))

export function fromBackend(p: string): string {
  return path.resolve(BACKEND_DIR, p)
}
