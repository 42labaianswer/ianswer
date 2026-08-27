'use client';

// src/app/p/[slug]/NotAvailable.tsx
// Vista cuando la company existe pero NO tiene el addon properties_public_directory activo
// Mensaje neutro, sin pistas de billing al visitante. Si es el dueño, sabe qué hacer.

import { Lock } from 'lucide-react';
import type { PublicCompany } from './types';

interface Props {
  company: PublicCompany;
}

export default function NotAvailable({ company }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12 sm:px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
          <Lock className="h-7 w-7 text-stone-400" strokeWidth={1.5} />
        </div>
        <h1 className="mt-6 text-xl font-semibold text-stone-900 sm:text-2xl">
          Este directorio no está disponible
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          El catálogo público de <span className="font-medium text-stone-900">{company.name}</span> no está disponible en este momento.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Si eres el administrador, activa el addon <em>Directorio Público de Propiedades</em> desde tu panel de iAnswer para habilitar esta página.
        </p>

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block text-[10px] uppercase tracking-wider text-stone-400 transition hover:text-stone-700"
        >
          Powered by iAnswer
        </a>
      </div>
    </div>
  );
}