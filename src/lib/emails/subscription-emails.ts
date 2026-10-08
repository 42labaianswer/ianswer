// src/lib/emails/subscription-emails.ts
// ----------------------------------------------------------------------------
// Avisos de suscripción. Stripe avisa por webhook
// y iAnswer manda el correo por Resend con el layout compartido — los correos
// automáticos de Stripe se quedan apagados para no duplicar avisos.
//
//   buildTrialEndingEmail    ← customer.subscription.trial_will_end (3 días antes)
//   buildPaymentFailedEmail  ← invoice.payment_failed
//   buildSubscriptionCanceledEmail ← customer.subscription.deleted
// ----------------------------------------------------------------------------

import { escapeHtml, plainTextFooter, renderEmailLayout, small, strong } from './layout';

type Built = { subject: string; html: string; text: string };

interface BaseParams {
  recipientEmail: string;
  planName: string;
  /** URL absoluta de /dashboard/plans. */
  plansUrl: string;
  appName?: string;
}

function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City',
  });
}

function reasonFor(appName: string, email: string) {
  return `Recibiste este correo porque tienes una suscripción de ${appName} asociada a ${email}.`;
}

// ─── Fin de prueba ─────────────────────────────────────────────────────────
export function buildTrialEndingEmail(p: BaseParams & { trialEndsAt: string | null }): Built {
  const appName = p.appName ?? 'iAnswer';
  const date = longDate(p.trialEndsAt);
  const when = date ? `el ${date}` : 'en 3 días';
  const subject = `Tu prueba gratuita de ${appName} termina ${date ? when : 'pronto'}`;
  const footerReason = reasonFor(appName, p.recipientEmail);

  const text = [
    `Tu prueba gratuita del plan ${p.planName} termina ${when}.`,
    ``,
    `Ese día se hará el primer cobro con el método de pago que registraste y tu`,
    `asistente seguirá funcionando sin interrupciones.`,
    ``,
    `Si quieres cambiar de plan o cancelar antes de que se cobre, entra aquí:`,
    p.plansUrl,
    ``,
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `Tu prueba del plan ${p.planName} termina ${when}. No tienes que hacer nada para continuar.`,
    title: 'Tu prueba gratuita está por terminar',
    introHtml: `Tu prueba del plan ${strong(escapeHtml(p.planName))} termina ${strong(escapeHtml(when))}. Ese día se hará el primer cobro con el método de pago que registraste y tu asistente seguirá funcionando sin interrupciones.`,
    highlight: { type: 'button', label: 'Revisar mi plan', href: p.plansUrl },
    notesHtml: [
      'No tienes que hacer nada para continuar.',
      small('Si quieres cambiar de plan o cancelar, hazlo antes de esa fecha para que no se realice el cobro.'),
    ],
    footerReason,
  });

  return { subject, html, text };
}

// ─── Pago fallido ──────────────────────────────────────────────────────────
export function buildPaymentFailedEmail(p: BaseParams & { amountLabel?: string | null; nextAttemptAt?: string | null }): Built {
  const appName = p.appName ?? 'iAnswer';
  const next = longDate(p.nextAttemptAt);
  const subject = `No pudimos cobrar tu plan de ${appName}`;
  const footerReason = reasonFor(appName, p.recipientEmail);
  const amount = p.amountLabel ? ` de ${p.amountLabel}` : '';

  const text = [
    `No pudimos procesar el cobro${amount} de tu plan ${p.planName}.`,
    ``,
    `Actualiza tu método de pago para que tu asistente siga respondiendo a tus clientes:`,
    p.plansUrl,
    ``,
    next ? `Volveremos a intentar el cobro el ${next}.` : `Volveremos a intentar el cobro en los próximos días.`,
    ``,
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `Actualiza tu método de pago para que tu asistente no se detenga.`,
    title: 'No pudimos procesar tu pago',
    introHtml: `El cobro${escapeHtml(amount)} de tu plan ${strong(escapeHtml(p.planName))} no se pudo completar. Actualiza tu método de pago para que tu asistente siga respondiendo a tus clientes.`,
    highlight: { type: 'button', label: 'Actualizar método de pago', href: p.plansUrl },
    notesHtml: [
      next
        ? `${strong('Nota:')} volveremos a intentar el cobro el ${escapeHtml(next)}.`
        : `${strong('Nota:')} volveremos a intentar el cobro en los próximos días.`,
      small('Si ya actualizaste tu tarjeta, puedes ignorar este correo.'),
    ],
    footerReason,
  });

  return { subject, html, text };
}

// ─── Suscripción cancelada ─────────────────────────────────────────────────
export function buildSubscriptionCanceledEmail(p: BaseParams): Built {
  const appName = p.appName ?? 'iAnswer';
  const subject = `Tu suscripción de ${appName} se canceló`;
  const footerReason = reasonFor(appName, p.recipientEmail);

  const text = [
    `Tu suscripción al plan ${p.planName} se canceló y ya no tienes acceso al panel de ${appName}.`,
    ``,
    `Tu información se conserva. Puedes reactivar un plan cuando quieras:`,
    p.plansUrl,
    ``,
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `Tu información se conserva. Reactiva un plan cuando quieras.`,
    title: 'Tu suscripción se canceló',
    introHtml: `Tu suscripción al plan ${strong(escapeHtml(p.planName))} se canceló y ya no tienes acceso al panel de ${escapeHtml(appName)}.`,
    highlight: { type: 'button', label: 'Reactivar un plan', href: p.plansUrl },
    notesHtml: [
      'Tu información y configuración se conservan.',
      small('Si crees que esto es un error, responde a este correo y te ayudamos.'),
    ],
    footerReason,
  });

  return { subject, html, text };
}
