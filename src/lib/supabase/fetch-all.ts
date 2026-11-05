/**
 * Legge TUTTE le righe di una query PostgREST a pagine. Una richiesta sola è
 * troncata in silenzio al tetto `max_rows` del progetto (default 1000): un
 * export che si fida di una sola richiesta consegna un file incompleto senza
 * nessun errore. La query passata DEVE avere un ordinamento stabile
 * (es. `.order('id')`), altrimenti le pagine possono ripetere o saltare righe.
 *
 * Il fallimento di una pagina ferma tutto e torna l'errore: mai un risultato
 * parziale presentato come completo.
 */
export const FETCH_ALL_PAGE_SIZE = 1000
// Argine contro un ciclo infinito (50 000 righe): oltre, è un errore, non un file troncato.
const MAX_PAGES = 50

type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null }

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string; code?: string } }> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const got = data ?? []
    rows.push(...got)
    if (got.length < pageSize) return { data: rows, error: null }
  }
  return { data: null, error: { message: `Troppe righe: oltre ${MAX_PAGES * pageSize}` } }
}
