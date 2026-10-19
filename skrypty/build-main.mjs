// Budowanie procesu głównego Electrona: TypeScript (src/main, src/preload) → dist-electron, plus sekret
// klienta Google (src/main/google-secret.cjs — poza repozytorium) obok skompilowanego kodu, jeśli jest.
// node skrypty/build-main.mjs [--watch]
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const secret = () => {
  const from = path.join(root, 'src', 'main', 'google-secret.cjs')
  if (!fs.existsSync(from)) return
  fs.mkdirSync(path.join(root, 'dist-electron', 'main'), { recursive: true })
  fs.copyFileSync(from, path.join(root, 'dist-electron', 'main', 'google-secret.cjs'))
}
if (process.argv.includes('--watch')) {
  secret()
  spawn(process.execPath, [tsc, '-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'], { cwd: root, stdio: 'inherit' })
} else {
  fs.rmSync(path.join(root, 'dist-electron'), { recursive: true, force: true })
  const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.main.json'], { cwd: root, stdio: 'inherit' })
  if (r.status) process.exit(r.status)
  secret()
}
