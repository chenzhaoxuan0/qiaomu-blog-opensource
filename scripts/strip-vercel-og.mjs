/**
 * Strip @vercel/og WASM and JS bundles from node_modules.
 * Next.js auto-bundles these even when unused, and wrangler
 * includes them during deploy, pushing the Worker past the
 * 3 MiB free-plan limit.
 *
 * Must run BEFORE `wrangler versions upload`.
 */
import { rm, stat, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const targets = [
  'node_modules/next/dist/compiled/@vercel/og',
]

const wasmNames = ['resvg.wasm', 'yoga.wasm']

async function* walk(dir) {
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) yield* walk(full)
      else yield full
    }
  } catch {}
}

async function findAndRemove() {
  let removed = 0
  let bytes = 0

  // Remove the entire @vercel/og directory from node_modules
  for (const rel of targets) {
    const dir = join(ROOT, rel)
    try {
      for await (const file of walk(dir)) {
        try {
          const s = await stat(file)
          bytes += s.size
          removed++
        } catch {}
      }
      await rm(dir, { recursive: true, force: true })
      console.log(`  removed ${rel}`)
    } catch (e) {
      console.log(`  skipped ${rel}: ${e.message}`)
    }
  }

  // Also scan .open-next for any embedded WASM files
  const openNextDir = join(ROOT, '.open-next')
  for await (const file of walk(openNextDir)) {
    const base = file.split(/[/\\]/).pop()
    if (base && wasmNames.includes(base)) {
      try {
        const s = await stat(file)
        bytes += s.size
        await rm(file)
        removed++
        console.log(`  stripped ${file} (${(s.size / 1024).toFixed(0)} KiB)`)
      } catch {}
    }
  }

  console.log(`\nStripped ${removed} files, freed ${(bytes / 1024).toFixed(0)} KiB`)
}

await findAndRemove()
