'use client';

// src/app/p/[slug]/PropertyDetailModal.tsx
// Modal con detalle completo · carrusel de fotos + datos + amenidades + WhatsApp

import { useEffect } from 'react';
import {
  X,
  BedDouble,
  Bath,
  Car,
  Maximize,
  MapPin,
  Layers,
  TreePine,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import PropertyImageCarousel from './PropertyImageCarousel';
import type { PublicCompany, PublicProperty } from './types';
import {
  formatPrice,
  propertyTypeLabel,
  operationLabel,
  buildWhatsAppLink,
} from './types';

interface Props {
  property: PublicProperty;
  company: PublicCompany;
  onClose: () => void;
}

export default function PropertyDetailModal({ property, company, onClose }: Props) {
  // Cerrar con ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Mensaje pre-cargado para WhatsApp con referencia a la propiedad
  const whatsappMessage = `Hola, vi en su directorio en línea la propiedad "${property.title}" y me interesa recibir más información.`;
  const whatsappLink = buildWhatsAppLink(company.phone_e164, whatsappMessage);
  const hasWhatsApp = !!company.phone_e164;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-modal-title"
    >
      <div
        className="relative flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar (sticky) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-md backdrop-blur transition hover:bg-white"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto">
          {/* Carrusel de fotos */}
          <PropertyImageCarousel
            photos={property.photos}
            title={property.title}
          />

          {/* Cuerpo */}
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {/* Operación + tipo + estado */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {operationLabel(property.operation)}
              </span>
              <span className="rounded-full border border-stone-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-700">
                {propertyTypeLabel(property.property_type)}
              </span>
              {property.status === 'apartada' && (
                <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Apartada
                </span>
              )}
            </div>

            {/* Título */}
            <h2
              id="property-modal-title"
              className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-3xl"
            >
              {property.title}
            </h2>

            {/* Ubicación */}
            {(property.address ?? property.neighborhood ?? property.city) && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.5} />
                <span>
                  {[
                    property.address,
                    property.neighborhood,
                    property.city,
                    property.state,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
            )}

            {/* Precio */}
            <div className="mt-5 flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
                {formatPrice(property.price, property.currency)}
              </p>
              {property.operation === 'renta' && (
                <p className="text-sm text-stone-500">/ mes</p>
              )}
            </div>

            {/* Grid de atributos */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {property.bedrooms !== null && property.bedrooms > 0 && (
                <AttrBox icon={<BedDouble />} label="Recámaras" value={String(property.bedrooms)} />
              )}
              {property.bathrooms !== null && property.bathrooms > 0 && (
                <AttrBox
                  icon={<Bath />}
                  label="Baños"
                  value={
                    property.half_bathrooms && property.half_bathrooms > 0
                      ? `${property.bathrooms} ½ ${property.half_bathrooms}`
                      : String(property.bathrooms)
                  }
                />
              )}
              {property.parking_spots !== null && property.parking_spots > 0 && (
                <AttrBox icon={<Car />} label="Estacionamientos" value={String(property.parking_spots)} />
              )}
              {property.sqm_construction !== null && property.sqm_construction > 0 && (
                <AttrBox
                  icon={<Maximize />}
                  label="Construcción"
                  value={`${property.sqm_construction} m²`}
                />
              )}
              {property.sqm_land !== null && property.sqm_land > 0 && (
                <AttrBox icon={<TreePine />} label="Terreno" value={`${property.sqm_land} m²`} />
              )}
              {property.levels !== null && property.levels > 0 && (
                <AttrBox icon={<Layers />} label="Niveles" value={String(property.levels)} />
              )}
            </div>

            {/* Descripción */}
            {property.description && (
              <div className="mt-7">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                  Descripción
                </h3>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-stone-700">
                  {property.description}
                </p>
              </div>
            )}

            {/* Amenidades */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="mt-7">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  Amenidades
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-700"
                    >
                      {amenity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA grande de WhatsApp */}
            {hasWhatsApp && (
              <div className="mt-8 sm:mt-10">
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white shadow-md transition hover:shadow-lg"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={2} />
                  Pedir informes por WhatsApp
                </a>
                <p className="mt-2 text-center text-xs text-stone-500">
                  Te responderá nuestro equipo o agente virtual con detalles, disponibilidad y opciones de financiamiento.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Caja de atributo ──────────────────────────────────────────────────────
function AttrBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center gap-1.5 text-stone-400">
        <span className="h-4 w-4">{icon}</span>
        <p className="text-[10px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}