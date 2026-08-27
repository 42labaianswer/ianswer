'use client';

// src/app/p/[slug]/WhatsAppFAB.tsx
// Floating Action Button de WhatsApp · esquina inferior derecha
// Pre-carga mensaje genérico "vi tu directorio en línea"

import { MessageCircle } from 'lucide-react';
import { buildWhatsAppLink } from './types';

interface Props {
  phoneE164: string | null;
  companyName: string;
}

export default function WhatsAppFAB({ phoneE164, companyName }: Props) {
  if (!phoneE164) return null;

  const message = `Hola, vi el directorio en línea de ${companyName} y me gustaría recibir información.`;
  const link = buildWhatsAppLink(phoneE164, message);

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Contactar a ${companyName} por WhatsApp`}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl sm:bottom-8 sm:right-8"
    >
      <MessageCircle className="h-5 w-5 fill-white text-[#25D366]" strokeWidth={0} />
      <span className="hidden sm:inline">Chatear por WhatsApp</span>
    </a>
  );
}