// ============================================================
// CasaZero — hook di risoluzione per gli script di verifica che importano
// sorgenti TypeScript con `node --experimental-strip-types`.
// ------------------------------------------------------------
// PERCHE' ESISTE: il type stripping di Node esegue un .ts, ma la risoluzione
// dei moduli resta quella ESM: un import relativo SENZA estensione
// (`import { pluralize } from './pluralize'`, forma normale in tutto src/,
// risolta da tsc/Next con moduleResolution bundler) fallisce con
// ERR_MODULE_NOT_FOUND. Gli script precedenti non lo incontravano perché
// document-classification.ts ha solo `import type`, cancellati dallo
// stripping. Piegare la libreria (import './pluralize.ts', o una copia
// inline della pluralizzazione) violerebbe rispettivamente lo stile del
// repo e la regola "pluralizzazione via helper" di CLAUDE.md: la
// concessione sta qui, nello strumento di verifica, non nel sorgente.
//
// COSA FA: per un import relativo senza estensione, il cui importatore è
// un .ts sotto src/, prova prima `<specifier>.ts`; se non esiste lascia
// fare alla risoluzione normale. Nient'altro.
//
// USO (in testa a uno script, PRIMA del primo `await import` di un .ts):
//   import { register } from 'node:module'
//   register('./ts-resolve-hooks.mjs', import.meta.url)
// ============================================================
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier)
  const parentIsTs = typeof context.parentURL === 'string' && context.parentURL.endsWith('.ts')
  if (isRelative && !hasExtension && parentIsTs) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate.href, context)
    }
  }
  return nextResolve(specifier, context)
}
