import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { residenceCreatorGate } from '@/lib/residence-input'
import { DRAFT_JSON_SCHEMA } from '@/lib/residence-draft'
import {
  DRAFT_MAX_OUTPUT_TOKENS,
  DRAFT_MODEL,
  DRAFT_SYSTEM_PROMPT,
  buildDraftUserMessage,
  gateErrorStatus,
  parseDraftRequestBody,
  parseDraftResponse,
} from '@/lib/residence-draft-request'

// Bozza di residenza da documento: riceve il TESTO già estratto dal browser
// (src/lib/pdf-text.ts) e restituisce la bozza normalizzata a tre stati.
//
// NESSUNA SCRITTURA: questa route non importa il service client e non chiama
// insert/update/rpc. Prima del clic "Crea residenza" non nasce nulla in DB,
// quindi nulla per residenti, email, inviti o cron. La creazione resta
// createResidence → czero_create_residence_with_units.
//
// Solo super_admin (come /admin/residences/new). La logica pura sta in
// src/lib/residence-draft-request.ts, provata da verify:resdraftroute.

export const runtime = 'nodejs'
export const maxDuration = 120

// TERZA copia identica di classify-document:105 e extract-document:189
// (backlog V2: modulo condiviso). Errori del servizio, mai del documento.
function isServiceUnavailableError(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500)
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) console.error('[residence-draft] errore lettura sessione', authError)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  // Stessa lettura e stesso gate della creazione: un error è un guasto
  // tecnico (500), mai "Permessi insufficienti".
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) console.error('[residence-draft] lettura profilo fallita', profileErr)
  const gate = residenceCreatorGate(profile, profileErr)
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gateErrorStatus(gate.error) })
  }

  const parsedBody = parseDraftRequestBody(await req.json().catch(() => null))
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status })
  }
  const { text } = parsedBody

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error('[residence-draft] ANTHROPIC_API_KEY assente o vuota — servizio non disponibile')
    return NextResponse.json({ error: 'Servizio di analisi non disponibile', cause: 'service_unavailable' }, { status: 503 })
  }

  try {
    const anthropic = new Anthropic()
    const response = await anthropic.messages.create(
      {
        model: DRAFT_MODEL,
        max_tokens: DRAFT_MAX_OUTPUT_TOKENS,
        thinking: { type: 'disabled' },
        system: [{ type: 'text', text: DRAFT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: {
          format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> },
        },
        messages: [{ role: 'user', content: buildDraftUserMessage(text) }],
      },
      { maxRetries: 1, timeout: 90_000 },
    )

    console.log('[ai-usage]', JSON.stringify({
      route: 'residence-draft',
      chars_sent: text.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      stop_reason: response.stop_reason,
    }))

    const result = parseDraftResponse(response)
    if (!result.ok) {
      console.error('[residence-draft] risposta non utilizzabile', { cause: result.cause })
      return NextResponse.json({ error: result.error, cause: result.cause }, { status: 502 })
    }
    return NextResponse.json({ draft: result.draft })
  } catch (err) {
    console.error('[residence-draft] chiamata AI fallita', err)
    if (isServiceUnavailableError(err)) {
      return NextResponse.json({ error: 'Servizio di analisi non disponibile, riprova', cause: 'service_unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Errore nell\'analisi del documento, riprova' }, { status: 500 })
  }
}
