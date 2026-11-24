// Regla del candado de Campañas (la usa hooks/useCampaignAccess).

/** true = bloqueado: el plan no trae marketing y no hay saldo comprado. Sin el dato del plan (base vieja) no bloquea. */
export function campaignsLocked(planCap: number | null | undefined, creditsLeft: number): boolean {
  if (planCap === null || planCap === undefined) return false
  return planCap <= 0 && creditsLeft <= 0
}
