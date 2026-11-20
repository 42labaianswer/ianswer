// src/lib/emails/usage-emails.ts
// ----------------------------------------------------------------------------
// Aviso por correo cuando una empresa llega al 80% o al 100% de un contador
// del periodo (respuestas de IA, recordatorios o marketing). Lo manda
// /api/cron/usage-alerts con las filas pendientes de usage_alerts.
// ----------------------------------------------------------------------------

import { escapeHtml, plainTextFooter, renderEmailLayout, small, strong } from './layout';

export type UsageMetric = 'ai_replies' | 'reminders' | 'campaign_messages';

type Built = { subject: string; html: string; text: string };

export interface UsageAlertEmailParams {
  recipientEmail: string;
  companyName: string;
  metric: UsageMetric;
  threshold: 80 | 100;
  used: number;
  limit: number;
  /** Fin del periodo (ISO): cuándo se reinicia el contador. */
  periodEnd: string | null;
  /** URL absoluta de /dashboard/plans. */
  plansUrl: string;
  appName?: string;
}

const LABELS: Record<UsageMetric, string> = {
  ai_replies: 'respuestas de IA',
  reminders: 'recordatorios',
  campaign_messages: 'mensajes de marketing',
};

const AT_LIMIT: Record<UsageMetric, string> = {
  ai_replies: 'Tu asistente dejó de contestar y las conversaciones nuevas pasan a tu equipo.',
  reminders: 'Los recordatorios de cita quedaron en pausa.',
  campaign_messages: 'Ya no se pueden enviar más campañas.',
};

const NEAR_LIMIT: Record<UsageMetric, string> = {
  ai_replies: 'Al llegar al 100%, tu asistente deja de contestar y las conversaciones nuevas pasan a tu equipo.',
  reminders: 'Al llegar al 100%, los recordatorios de cita se pausan.',
  campaign_messages: 'Al llegar al 100%, ya no se podrán enviar más campañas.',
};

function n(v: number): string {
  return v.toLocaleString('es-MX');
}

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', timeZone: 'America/Mexico_City',
  });
}

export function buildUsageAlertEmail(p: UsageAlertEmailParams): Built {
  const appName = p.appName ?? 'iAnswer';
  const label = LABELS[p.metric];
  const reset = longDate(p.periodEnd);
  const untilReset = reset ? ` hasta el ${reset}, cuando se reinicia tu periodo` : ' hasta que se reinicie tu periodo';
  const atLimit = p.threshold === 100;

  const subject = atLimit
    ? `Se acabaron tus ${label} del periodo`
    : `Llevas el 80% de tus ${label}`;
  const usage = `Usaste ${n(p.used)} de ${n(p.limit)} ${label} de este periodo.`;
  const consequence = atLimit ? `${AT_LIMIT[p.metric]} Así seguirá${untilReset}.` : NEAR_LIMIT[p.metric];
  const action = 'Puedes sumar más con un complemento o subir de plan.';
  const footerReason = `Recibiste este correo porque administras la cuenta de ${p.companyName} en ${appName}.`;

  const text = [
    usage,
    '',
    consequence,
    action,
    '',
    p.plansUrl,
    '',
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `${usage} ${consequence}`,
    title: atLimit ? `Se acabaron tus ${label}` : `Llevas el 80% de tus ${label}`,
    introHtml: `Usaste ${strong(n(p.used))} de ${strong(n(p.limit))} ${escapeHtml(label)} de este periodo. ${escapeHtml(consequence)}`,
    highlight: { type: 'button', label: 'Ver mi plan', href: p.plansUrl },
    notesHtml: [
      escapeHtml(action),
      ...(p.metric === 'ai_replies' ? [small('Los mensajes que manda una persona desde el inbox no cuentan.')] : []),
    ],
    footerReason,
  });

  return { subject, html, text };
}
