'use client'

import { useRef, useState, useTransition } from 'react'
import { addComment } from '@/app/(app)/manutenzioni/actions'

export function AddCommentForm({ itemId }: { itemId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await addComment(formData)
      if (result?.error) setError(result.error)
      else formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Aggiungi un commento…"
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
      />
      {error && <p className="text-xs text-semantic-red">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full border border-border rounded-xl py-2.5 text-sm font-medium text-text-secondary disabled:opacity-50 active:scale-[0.98] transition-transform"
      >
        {isPending ? 'Invio…' : 'Invia commento'}
      </button>
    </form>
  )
}
