import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRef = 'dziesxjebfzvvzfejkdp'

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this script in an interactive terminal.'))
      return
    }

    process.stdout.write(prompt)
    let value = ''
    const previousRawMode = input.isRaw
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          input.setRawMode(previousRawMode ?? false)
          input.pause()
          process.stdout.write('\nCancelled.\n')
          reject(new Error('Cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          input.setRawMode(previousRawMode ?? false)
          input.pause()
          process.stdout.write('\n')
          resolve(value.trim())
          return
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += character
      }
    }

    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

let accessToken = ''
try {
  accessToken = await readHidden('Paste your Supabase personal access token (input hidden): ')
  if (!accessToken) throw new Error('No access token was entered.')

  const supabaseCli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url))
  const child = spawn(process.execPath, [supabaseCli,
    'functions', 'deploy', 'account-gateway',
    '--project-ref', projectRef,
    '--use-api',
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_TELEMETRY_DISABLED: 'true',
    },
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (exitCode !== 0) process.exitCode = typeof exitCode === 'number' ? exitCode : 1
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
} finally {
  accessToken = ''
}
