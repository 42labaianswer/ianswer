'use client';

// src/app/p/[slug]/DirectoryFooter.tsx
// Footer mínimo · datos de contacto + Powered by iAnswer pequeño

import { Phone, Globe } from 'lucide-react';
import type { PublicCompany } from './types';

interface Props {
  company: PublicCompany;
}

export default function DirectoryFooter({ company }: Props) {
  return (
    <footer className="mt-20 border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Datos de la company */}
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            {company.logo_url && (
              <img
                src={company.logo_url}
                alt={`${company.name} logo`}
                className="h-8 w-8 rounded-md object-contain"
              />
            )}
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {company.name}
              </p>
              <p className="text-xs text-stone-500">Catálogo de propiedades</p>
            </div>
          </div>

          {/* Datos de contacto */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-stone-600 sm:justify-end">
            {company.phone_e164 && (
              <a
                href={`tel:${company.phone_e164}`}
                className="flex items-center gap-1.5 transition hover:text-stone-900"
              >
                <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                {formatPhone(company.phone_e164)}
              </a>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition hover:text-stone-900"
              >
                <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
          </div>
        </div>

        {/* Powered by iAnswer (chiquito) */}
        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-stone-100 pt-6 text-[10px] uppercase tracking-wider text-stone-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {company.name}. Todos los derechos reservados.
          </p>
          <p>
            Powered by{' '}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold tracking-normal text-stone-500 transition hover:text-stone-900"
            >
              iAnswer
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Helper: formatear teléfono E.164 a algo legible ────────────────────────
// +5219991234567 → +52 999 123 4567
function formatPhone(e164: string): string {
  const clean = e164.replace(/^\+/, '').replace(/\D/g, '');
  // Mexicano: 52 + 10 dígitos (a veces con 1 después del 52 para celular)
  if (clean.startsWith('52')) {
    const rest = clean.slice(2).replace(/^1/, ''); // Quita 521 o 52 prefix
    if (rest.length === 10) {
      return `+52 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
    }
  }
  return e164;
}