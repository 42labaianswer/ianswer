'use client';

// src/app/p/[slug]/PropertyCard.tsx
// Tarjeta de propiedad para el grid · foto principal + datos básicos + click → modal

import { BedDouble, Bath, Car, Maximize, MapPin } from 'lucide-react';
import type { PublicProperty } from './types';
import { formatPrice, propertyTypeLabel, operationLabel } from './types';

interface Props {
  property: PublicProperty;
  onClick: () => void;
}

export default function PropertyCard({ property, onClick }: Props) {
  const mainPhoto = property.photos[0] ?? null;
  const isApartada = property.status === 'apartada';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Imagen */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        {mainPhoto ? (
          <img
            src={mainPhoto}
            alt={property.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-stone-300">
            <Maximize className="h-12 w-12" strokeWidth={1} />
          </div>
        )}

        {/* Badge de operación arriba-izquierda */}
        <div className="absolute left-3 top-3">
          <span
            className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-900 shadow-sm backdrop-blur"
          >
            {operationLabel(property.operation)}
          </span>
        </div>

        {/* Badge "Apartada" arriba-derecha si aplica */}
        {isApartada && (
          <div className="absolute right-3 top-3">
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
              Apartada
            </span>
          </div>
        )}

        {/* Contador de fotos */}
        {property.photos.length > 1 && (
          <div className="absolute right-3 bottom-3">
            <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              {property.photos.length} fotos
            </span>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col p-4">
        {/* Tipo de propiedad */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          {propertyTypeLabel(property.property_type)}
        </p>

        {/* Título */}
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-stone-900">
          {property.title}
        </h3>

        {/* Ubicación */}
        {(property.neighborhood ?? property.city) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">
              {[property.neighborhood, property.city].filter(Boolean).join(', ')}
            </span>
          </p>
        )}

        {/* Atributos */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-600">
          {property.bedrooms !== null && property.bedrooms > 0 && (
            <Attribute icon={<BedDouble className="h-3.5 w-3.5" />}>
              {property.bedrooms} {property.bedrooms === 1 ? 'rec' : 'rec'}
            </Attribute>
          )}
          {property.bathrooms !== null && property.bathrooms > 0 && (
            <Attribute icon={<Bath className="h-3.5 w-3.5" />}>
              {property.bathrooms} {property.bathrooms === 1 ? 'baño' : 'baños'}
            </Attribute>
          )}
          {property.parking_spots !== null && property.parking_spots > 0 && (
            <Attribute icon={<Car className="h-3.5 w-3.5" />}>
              {property.parking_spots}
            </Attribute>
          )}
          {property.sqm_construction !== null && property.sqm_construction > 0 && (
            <Attribute icon={<Maximize className="h-3.5 w-3.5" />}>
              {property.sqm_construction} m²
            </Attribute>
          )}
        </div>

        {/* Precio (al final, sticky bottom) */}
        <div className="mt-4 flex items-end justify-between border-t border-stone-100 pt-3">
          <div>
            <p className="text-lg font-bold tracking-tight text-stone-900">
              {formatPrice(property.price, property.currency)}
            </p>
            {property.operation === 'renta' && (
              <p className="text-[10px] text-stone-500">por mes</p>
            )}
          </div>
          <span
            className="text-xs font-medium transition group-hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Ver detalle →
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Atributo con ícono ────────────────────────────────────────────────────
function Attribute({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1 text-stone-600">
      <span className="text-stone-400">{icon}</span>
      {children}
    </span>
  );
}