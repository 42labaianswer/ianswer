/**
 * Deja un teléfono como lo guarda WhatsApp (solo dígitos). Un número de 10
 * dígitos se toma como celular de México y se le antepone 521, igual que los
 * contactos que llegan por WhatsApp, para que coincida con su external_id.
 */
export function formatWhatsAppPhone(rawPhone: string) {
  let clean = rawPhone.replace(/\D/g, '')
  if (clean.length === 10) clean = '521' + clean
  return clean
}
