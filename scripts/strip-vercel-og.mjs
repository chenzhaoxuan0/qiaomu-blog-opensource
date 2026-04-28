/**
 * Strip @vercel/og WASM and JS bundles from the OpenNext output.
 * Next.js auto-bundles these even when unused, and they push the
 * Cloudflare Worker past the 3 MiB free-plan limit.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '.open-next')

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const patterns = [
  /node_modules\/next\/dist\/compiled\/@vercel\/og\//,
  /@vercel[\\/]og[\\/]/,
]

async function findAndRemove() {
  let removed = 0
  let bytes = 0
  const targets = new Set()

  for await (const file of walk(ROOT)) {
    const normalized = file.replace(/\\/g, '/')
    if (patterns.some(p => p.test(normalized))) {
      targets.add(file)
    }
  }

  // Also remove standalone WASM copies in server-functions
  for await (const file of walk(ROOT)) {
    const base = file.split(/[\\/]/).pop()
    if (base && (base === 'resvg.wasm' || base === 'yoga.wasm')) {
      targets.add(file)
    }
  }

  for (const file of targets) {
    try {
      const s = await stat(file)
      bytes += s.size
      await rm(file)
      removed++
      console.log(`  stripped ${file} (${(s.size / 1024).toFixed(0)} KiB)`)
    } catch {}
  }

  console.log(`\nStripped ${removed} files, freed ${(bytes / 1024).toFixed(0)} KiB`)
}

await findAndRemove()
