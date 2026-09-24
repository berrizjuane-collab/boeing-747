import { spawn } from 'node:child_process'

// Strips SGR colour codes. Under GitHub Actions `CI` is set, picocolors turns
// colour on even for a piped stdout, and Vite prints `\x1b[1mLocal\x1b[22m:`:
// a plain `includes('Local:')` then never matches and the harness waits
// forever — which is how every CI runtime job ran into its 60-minute cancel.
const ANSI = /\x1b\[[0-9;]*m/g

/**
 * Starts `vite preview` (or dev with `dev: true`) and resolves once it is
 * listening. Rejects if the server exits, errors or is not ready in time,
 * so a broken start fails the job instead of hanging it.
 */
export async function startQaServer({ port = 4173, dev = false, extraArgs = [], timeoutMs = 60000 } = {}) {
  const args = ['node_modules/vite/bin/vite.js', ...(dev ? [] : ['preview']), ...extraArgs, '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  const server = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } })
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`QA server not ready after ${timeoutMs} ms:\n${output}`)), timeoutMs)
    const onData = (data) => {
      output += data.toString()
      if (output.replace(ANSI, '').includes('Local:')) { clearTimeout(timer); resolve() }
    }
    server.stdout.on('data', onData)
    server.stderr.on('data', (data) => { output += data.toString() })
    server.on('error', (error) => { clearTimeout(timer); reject(error) })
    server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`QA server exited ${code}:\n${output}`)) })
  })
  return server
}
