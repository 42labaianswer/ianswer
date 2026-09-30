// src/app/p/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getPublicCompanyBySlug } from '../../../lib/publicCompany';

export const runtime = 'edge';
export const alt = 'Catálogo de propiedades';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
  params: { slug: string };
}

export default async function OpengraphImage({ params }: Props) {
  const { data: company } = await getPublicCompanyBySlug(params.slug, ['name', 'description', 'logo_url', 'primary_color']);

  // ... resto del código sin cambios
}