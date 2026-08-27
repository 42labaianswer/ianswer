'use client';

// src/app/p/[slug]/DirectoryClient.tsx
// Client Component · orquesta hero + filtros + grid + modal + FAB
//
// Recibe la company y todas las propiedades pre-fetcheadas desde el server.
// Maneja estado de filtros, modal abierto y derivación de propiedades visibles.

import { useMemo, useState } from 'react';
import DirectoryHero from './DirectoryHero';
import DirectoryFilters from './DirectoryFilters';
import PropertyCard from './PropertyCard';
import PropertyDetailModal from './PropertyDetailModal';
import WhatsAppFAB from './WhatsAppFAB';
import DirectoryFooter from './DirectoryFooter';
import type {
  PublicCompany,
  PublicProperty,
  DirectoryFiltersState,
} from './types';
import { DEFAULT_FILTERS } from './types';

interface Props {
  company: PublicCompany;
  properties: PublicProperty[];
}

export default function DirectoryClient({ company, properties }: Props) {
  const [filters, setFilters] = useState<DirectoryFiltersState>(DEFAULT_FILTERS);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Lista de colonias únicas para el filtro
  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.neighborhood) set.add(p.neighborhood);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es-MX'));
  }, [properties]);

  // Lista de tipos únicos para el filtro
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => set.add(p.property_type));
    return Array.from(set);
  }, [properties]);

  // Aplicar filtros
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      if (filters.operation !== 'all' && p.operation !== filters.operation) return false;
      if (filters.property_type !== 'all' && p.property_type !== filters.property_type) return false;
      if (filters.bedrooms_min !== null) {
        if (p.bedrooms === null || p.bedrooms < filters.bedrooms_min) return false;
      }
      if (filters.price_min !== null && p.price < filters.price_min) return false;
      if (filters.price_max !== null && p.price > filters.price_max) return false;
      if (filters.neighborhood !== null && p.neighborhood !== filters.neighborhood) return false;
      return true;
    });
  }, [properties, filters]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) ?? null,
    [properties, selectedPropertyId]
  );

  // CSS variables del branding (inyectadas al root)
  const brandingStyle: React.CSSProperties = {
    // Si la company no definió color primario, usamos un slate neutro
    ['--brand-primary' as string]: company.primary_color ?? '#0f172a',
    ['--brand-secondary' as string]: company.secondary_color ?? '#64748b',
  };

  return (
    <div
      className="min-h-screen bg-stone-50"
      style={brandingStyle}
    >
      <DirectoryHero company={company} />

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <DirectoryFilters
          filters={filters}
          onChange={setFilters}
          availableNeighborhoods={availableNeighborhoods}
          availableTypes={availableTypes}
          totalCount={properties.length}
          visibleCount={filteredProperties.length}
        />

        {filteredProperties.length === 0 ? (
          <EmptyState totalCount={properties.length} />
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={() => setSelectedPropertyId(property.id)}
              />
            ))}
          </div>
        )}
      </main>

      <DirectoryFooter company={company} />

      <WhatsAppFAB
        phoneE164={company.phone_e164}
        companyName={company.name}
      />

      {selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          company={company}
          onClose={() => setSelectedPropertyId(null)}
        />
      )}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ totalCount }: { totalCount: number }) {
  return (
    <div className="mt-16 flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-stone-100 p-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-stone-400"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-medium text-stone-900">
        Sin coincidencias
      </h3>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        {totalCount === 0
          ? 'Aún no hay propiedades publicadas en este directorio. Vuelve pronto.'
          : 'No hay propiedades que coincidan con los filtros seleccionados. Prueba ajustar las opciones.'}
      </p>
    </div>
  );
}