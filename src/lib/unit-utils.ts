export function unitHasNoActiveAccount(members: { ended_at: string | null }[]): boolean {
  return members.length === 0 || !members.some(m => m.ended_at === null)
}
