// src/app/p/[slug]/types.ts
// Tipos compartidos entre el server component y los client components
// del directorio público de propiedades.

export interface PublicCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  phone_e164: string | null; // WhatsApp number en formato E.164: +5219991234567
  website: string | null;
}

export type PropertyOperation = 'venta' | 'renta';
export type PropertyType = 'casa' | 'departamento' | 'terreno' | 'oficina' | 'local';
export type PropertyStatus = 'disponible' | 'apartada' | 'vendida' | 'rentada' | 'borrador';

export interface PublicProperty {
  id: string;
  company_id: string;
  title: string;
  slug: string | null;
  operation: PropertyOperation;
  property_type: PropertyType;
  price: number;
  currency: 'MXN' | 'USD';

  // Ubicación
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;

  // Atributos físicos
  bedrooms: number | null;
  bathrooms: number | null;
  half_bathrooms: number | null;
  parking_spots: number | null;
  sqm_construction: number | null;
  sqm_land: number | null;
  levels: number | null;

  // Amenidades y descripción
  amenities: string[] | null; // jsonb array
  description: string | null;

  // Multimedia
  photos: string[]; // jsonb array de URLs

  status: PropertyStatus;
  created_at: string;
  updated_at: string;
}

export interface DirectoryFiltersState {
  operation: PropertyOperation | 'all';
  property_type: PropertyType | 'all';
  bedrooms_min: number | null;
  price_min: number | null;
  price_max: number | null;
  neighborhood: string | null;
}

export const DEFAULT_FILTERS: DirectoryFiltersState = {
  operation: 'all',
  property_type: 'all',
  bedrooms_min: null,
  price_min: null,
  price_max: null,
  neighborhood: null,
};

// Helpers para WhatsApp links
export function buildWhatsAppLink(phoneE164: string | null, message: string): string {
  if (!phoneE164) return '#';
  // Remueve el "+" inicial; wa.me espera dígitos puros
  const cleanPhone = phoneE164.replace(/^\+/, '').replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

// Formateo de precio
export function formatPrice(price: number, currency: 'MXN' | 'USD'): string {
  const formatter = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  return formatter.format(price);
}

// Label del tipo de propiedad
export function propertyTypeLabel(type: PropertyType): string {
  const map: Record<PropertyType, string> = {
    casa: 'Casa',
    departamento: 'Departamento',
    terreno: 'Terreno',
    oficina: 'Oficina',
    local: 'Local',
  };
  return map[type];
}

export function operationLabel(op: PropertyOperation): string {
  return op === 'venta' ? 'Venta' : 'Renta';
}