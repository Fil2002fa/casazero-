// Fonte di verità unica per il limite dimensione della foto residenza.
// Importata sia dalla validazione client (ResidencePhotoUpload.tsx) sia dalla rete
// di sicurezza server (updateResidencePhoto in actions.ts), così i due controlli non
// divergono. Allineato al bucket 'residence-photos' (migration 014: 5242880 = 5 MB)
// e al bodySizeLimit delle Server Actions (next.config.ts).
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
