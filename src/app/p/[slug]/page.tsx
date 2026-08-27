// src/app/p/[slug]/page.tsx
// Server Component · entrada del directorio público
//
// [HOTFIX v2 · 2026-06-28] Cambios:
//   1. `cookies()` ahora se hace con `await` (cambio breaking de Next.js 15:
//      cookies/headers/params/searchParams retornan Promise).
//   2. Se eliminó el factory function `getServerSupabase()` y se hace inline
//      en cada función async, siguiendo el patrón usado en el resto del
//      proyecto (consistencia con webhooks, route handlers, etc.).
//   3. params también es Promise<{ slug }> en Next 15 → se hace await.
//
// Flujo:
//   1. Resuelve la company por su slug
//   2. Verifica gating via RPC has_public_directory_active
//   3. Carga propiedades en estado "disponible" o "apartada"
//   4. Renderiza el DirectoryClient con todos los datos pre-fetcheados

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import DirectoryClient from './DirectoryClient';
import NotAvailable from './NotAvailable';
import type { PublicCompany, PublicProperty } from './types';

// En Next.js 15, params es Promise.
interface PageProps {
  params: Promise<{ slug: string }>;
}

// Revalidación cada 5 minutos para que cambios en propiedades aparezcan
// rápido sin reconstruir todo en cada visita.
export const revalidate = 300;

// ─── Metadata dinámica (SEO + Open Graph) ────────────────────────────────────
export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const { slug } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const { data: company } = await supabase
    .from('companies')
    .select('name, description, logo_url, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!company) {
    return { title: 'Directorio no encontrado' };
  }

  const title = `${company.name} · Directorio de propiedades`;
  const description = company.description
    ? `${company.description} Explora todas las propiedades disponibles de ${company.name}.`
    : `Explora todas las propiedades disponibles de ${company.name}. Encuentra tu próximo espacio.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: company.name,
      images: company.logo_url ? [{ url: company.logo_url }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// ─── Página principal ───────────────────────────────────────────────────────
export default async function PublicDirectoryPage({ params }: PageProps) {
  const { slug } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  // 1. Resolver company por slug
  const { data: companyRow, error: companyError } = await supabase
    .from('companies')
    .select(`
      id,
      slug,
      name,
      description,
      logo_url,
      primary_color,
      secondary_color,
      phone_e164,
      website
    `)
    .eq('slug', slug)
    .maybeSingle();

  if (companyError) {
    console.error('[directorio] Error cargando company:', companyError);
    notFound();
  }

  if (!companyRow) {
    notFound();
  }

  const company = companyRow as PublicCompany;

  // 2. Verificar gating del addon vía RPC (server-side, no bypassable)
  // La RPC vive en database/24_properties_public_directory_addon.sql y hace
  // JOIN entre company_addons (status=active) y addons (feature_flag on).
  const { data: hasAccessRaw, error: rpcError } = await supabase
    .rpc('has_public_directory_active', { p_company_id: company.id });

  if (rpcError) {
    console.error('[directorio] Error verificando addon:', rpcError);
    // Por seguridad, ante error de RPC, bloqueamos acceso (fail-closed).
    return <NotAvailable company={company} />;
  }

  const hasActiveAddon = hasAccessRaw === true;

  if (!hasActiveAddon) {
    return <NotAvailable company={company} />;
  }

  // 3. Cargar propiedades públicas (estados disponibles o apartadas)
  // FIX 2026-07-13: el .select() pedía columnas que NO existen en el esquema
  // real (slug, operation, neighborhood, postal_code, half_bathrooms,
  // sqm_construction, sqm_land, levels, amenities). En PostgREST, pedir una
  // columna inexistente hace fallar TODA la query → 0 propiedades, aunque
  // estuvieran publicadas. Aquí se usan las columnas reales con alias para que
  // el shape que espera el cliente (PublicProperty) se conserve.
  const { data: propertiesRows, error: propertiesError } = await supabase
    .from('properties')
    .select(`
      id,
      company_id,
      title,
      slug:public_slug,
      operation:operation_type,
      property_type,
      price,
      currency,
      address,
      neighborhood:zone,
      city,
      state,
      bedrooms,
      bathrooms,
      parking_spots,
      sqm_construction:area_built_m2,
      sqm_land:area_total_m2,
      amenities:features,
      description,
      photos,
      status,
      created_at,
      updated_at
    `)
    .eq('company_id', company.id)
    .in('status', ['disponible', 'apartada'])
    .order('created_at', { ascending: false });

  if (propertiesError) {
    console.error('[directorio] Error cargando propiedades:', propertiesError);
  }

  // Normaliza al shape PublicProperty. Campos que no existen en el esquema
  // (postal_code, half_bathrooms, levels) se rellenan con null. Los enums se
  // mapean al set que el cliente entiende.
  const properties: PublicProperty[] = (propertiesRows ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    slug: row.slug ?? null,
    operation: normalizeOperation(row.operation),
    property_type: normalizePropertyType(row.property_type),
    price: row.price ?? 0,
    currency: row.currency === 'USD' ? 'USD' : 'MXN',
    address: row.address ?? null,
    neighborhood: row.neighborhood ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postal_code: null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    half_bathrooms: null,
    parking_spots: row.parking_spots ?? null,
    sqm_construction: row.sqm_construction ?? null,
    sqm_land: row.sqm_land ?? null,
    levels: null,
    amenities: normalizeAmenities(row.amenities),
    description: row.description ?? null,
    photos: normalizePhotos(row.photos),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })) as PublicProperty[];

  return <DirectoryClient company={company} properties={properties} />;
}

// ─── Helpers de normalización ───────────────────────────────────────────────

// El esquema real usa operation_type con 4 valores; el cliente entiende 2.
function normalizeOperation(raw: unknown): 'venta' | 'renta' {
  if (raw === 'renta' || raw === 'renta_temporal') return 'renta';
  return 'venta'; // venta, preventa, o cualquier otro → venta
}

// El esquema real usa 'depto' y otros tipos que el cliente no mapea.
function normalizePropertyType(
  raw: unknown
): 'casa' | 'departamento' | 'terreno' | 'oficina' | 'local' {
  switch (raw) {
    case 'casa':
    case 'quinta':
      return 'casa';
    case 'depto':
    case 'departamento':
      return 'departamento';
    case 'terreno':
      return 'terreno';
    case 'oficina':
      return 'oficina';
    case 'local':
    case 'bodega':
      return 'local';
    default:
      return 'casa';
  }
}

function normalizePhotos(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    // Caso legacy: una sola URL en string plano
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      return [raw];
    }
  }
  return [];
}

function normalizeAmenities(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      return null;
    }
  }
  return null;
}