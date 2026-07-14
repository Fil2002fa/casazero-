/*
 * SMONTATO PER DEMO — nessun consumatore (vedi commit "commenti: smonta la
 * sezione dalla UI per la demo"). La feature era write-only verso
 * l'amministrazione: nessuna vista admin legge i commenti e nessuna notifica
 * viene inviata. Riattivazione post customer discovery, quando sarà deciso se
 * il commento è un thread tra vicini o un canale verso l'amministrazione.
 * Tabella comments, RLS e server action addComment sono rimaste in piedi.
 */
import { createClient } from '@/lib/supabase/server'
import { AddCommentForm } from './AddCommentForm'
import { MessageSquare } from 'lucide-react'

export async function CommentsSection({ itemId }: { itemId: string }) {
  const supabase = await createClient()

  const { data: rawComments } = await supabase
    .from('comments')
    .select('id, body, created_at, profiles(full_name)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })

  type Comment = {
    id: string
    body: string
    created_at: string
    profiles: { full_name: string | null } | null
  }
  const comments = (rawComments ?? []) as unknown as Comment[]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-text-secondary" strokeWidth={1.6} />
        <h2 className="text-sm font-medium text-text-primary">
          Commenti {comments.length > 0 && `(${comments.length})`}
        </h2>
      </div>

      {comments.length === 0 && (
        <p className="text-sm text-text-secondary">Nessun commento ancora.</p>
      )}

      <div className="space-y-2">
        {comments.map(c => (
          <div key={c.id} className="bg-surface rounded-xl border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-text-primary">
                {c.profiles?.full_name ?? 'Utente'}
              </span>
              <span className="text-xs text-text-secondary">
                {new Date(c.created_at).toLocaleDateString('it-IT', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>

      <AddCommentForm itemId={itemId} />
    </div>
  )
}
