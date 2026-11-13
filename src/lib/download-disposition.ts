/**
 * Opzione di createSignedUrl per /api/download. Il comportamento predefinito è
 * lo scaricamento (`download: true`, Content-Disposition: attachment): vale per
 * ogni chiamante esistente, che non passa il parametro. L'apertura in linea
 * (anteprima nel browser) si chiede SOLO con `inline=1`, valore esatto: ogni
 * altro valore, anche vuoto o "true", resta scaricamento.
 *
 * Funzione pura: scripts/verify-download-disposition.mjs la prova senza avviare
 * l'app.
 */
export function signedUrlOptions(inlineParam: string | null): { download: true } | undefined {
  return inlineParam === '1' ? undefined : { download: true }
}
