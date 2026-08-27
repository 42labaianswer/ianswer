'use client';

// src/app/p/[slug]/DirectoryFilters.tsx
// Chips de filtros minimalistas estilo Futura · operación / tipo / colonia / recámaras / precio

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { DirectoryFiltersState, PropertyType } from './types';
import { DEFAULT_FILTERS, propertyTypeLabel } from './types';

interface Props {
  filters: DirectoryFiltersState;
  onChange: (filters: DirectoryFiltersState) => void;
  availableNeighborhoods: string[];
  availableTypes: string[];
  totalCount: number;
  visibleCount: number;
}

export default function DirectoryFilters({
  filters,
  onChange,
  availableNeighborhoods,
  availableTypes,
  totalCount,
  visibleCount,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = <K extends keyof DirectoryFiltersState>(
    key: K,
    value: DirectoryFiltersState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const resetAll = () => onChange(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.operation !== 'all' ||
    filters.property_type !== 'all' ||
    filters.bedrooms_min !== null ||
    filters.price_min !== null ||
    filters.price_max !== null ||
    filters.neighborhood !== null;

  return (
    <section className="pt-8 sm:pt-10">
      {/* Conteo + toggle avanzado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          <span className="font-semibold text-stone-900">{visibleCount}</span>
          {' '}
          {visibleCount === 1 ? 'propiedad' : 'propiedades'}
          {hasActiveFilters && totalCount !== visibleCount && (
            <span className="text-stone-400"> · de {totalCount}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAll}
              className="flex items-center gap-1 text-xs font-medium text-stone-500 transition hover:text-stone-900"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Limpiar filtros
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            {showAdvanced ? 'Ocultar filtros' : 'Más filtros'}
          </button>
        </div>
      </div>

      {/* Chips primarios: operación */}
      <div className="mt-4 flex flex-wrap gap-2">
        <ChipGroup>
          <Chip
            active={filters.operation === 'all'}
            onClick={() => update('operation', 'all')}
            label="Todas"
          />
          <Chip
            active={filters.operation === 'venta'}
            onClick={() => update('operation', 'venta')}
            label="Venta"
          />
          <Chip
            active={filters.operation === 'renta'}
            onClick={() => update('operation', 'renta')}
            label="Renta"
          />
        </ChipGroup>

        <Divider />

        <ChipGroup>
          <Chip
            active={filters.property_type === 'all'}
            onClick={() => update('property_type', 'all')}
            label="Cualquier tipo"
          />
          {availableTypes.map((t) => (
            <Chip
              key={t}
              active={filters.property_type === t}
              onClick={() => update('property_type', t as PropertyType)}
              label={propertyTypeLabel(t as PropertyType)}
            />
          ))}
        </ChipGroup>
      </div>

      {/* Filtros avanzados */}
      {showAdvanced && (
        <div className="mt-5 grid gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Recámaras */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              Recámaras mínimas
            </label>
            <select
              value={filters.bedrooms_min ?? ''}
              onChange={(e) =>
                update(
                  'bedrooms_min',
                  e.target.value === '' ? null : parseInt(e.target.value, 10)
                )
              }
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 transition focus:border-stone-500 focus:outline-none"
            >
              <option value="">Cualquiera</option>
              <option value="1">1 o más</option>
              <option value="2">2 o más</option>
              <option value="3">3 o más</option>
              <option value="4">4 o más</option>
              <option value="5">5 o más</option>
            </select>
          </div>

          {/* Precio mínimo */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              Precio mínimo (MXN)
            </label>
            <input
              type="number"
              value={filters.price_min ?? ''}
              onChange={(e) =>
                update(
                  'price_min',
                  e.target.value === '' ? null : parseInt(e.target.value, 10)
                )
              }
              placeholder="Sin mínimo"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 transition focus:border-stone-500 focus:outline-none"
            />
          </div>

          {/* Precio máximo */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              Precio máximo (MXN)
            </label>
            <input
              type="number"
              value={filters.price_max ?? ''}
              onChange={(e) =>
                update(
                  'price_max',
                  e.target.value === '' ? null : parseInt(e.target.value, 10)
                )
              }
              placeholder="Sin máximo"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 transition focus:border-stone-500 focus:outline-none"
            />
          </div>

          {/* Colonia */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              Colonia
            </label>
            <select
              value={filters.neighborhood ?? ''}
              onChange={(e) =>
                update('neighborhood', e.target.value === '' ? null : e.target.value)
              }
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 transition focus:border-stone-500 focus:outline-none"
            >
              <option value="">Todas</option>
              {availableNeighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Componentes internos ──────────────────────────────────────────────────
function ChipGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
        active
          ? 'text-white shadow-sm'
          : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
      }`}
      style={
        active
          ? {
              backgroundColor: 'var(--brand-primary)',
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="hidden h-5 w-px bg-stone-200 sm:inline-block" />;
}