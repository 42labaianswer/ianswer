'use client';

// src/app/p/[slug]/DirectoryHero.tsx
// Hero del directorio · logo + nombre + tagline + descripción

import { Building2 } from 'lucide-react';
import type { PublicCompany } from './types';

interface Props {
  company: PublicCompany;
}

export default function DirectoryHero({ company }: Props) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={`${company.name} logo`}
              className="h-10 w-10 rounded-lg object-contain sm:h-12 sm:w-12"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white sm:h-12 sm:w-12"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.5} />
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Catálogo de propiedades
            </p>
            <p className="text-sm font-semibold text-stone-900 sm:text-base">
              {company.name}
            </p>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-8 max-w-3xl sm:mt-12">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
            Encuentra tu próximo espacio,{' '}
            <em
              className="not-italic"
              style={{ color: 'var(--brand-primary)' }}
            >
              en un solo lugar.
            </em>
          </h1>
          {company.description && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-stone-600 sm:mt-6 sm:text-lg">
              {company.description}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}