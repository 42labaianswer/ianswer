// src/app/p/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'edge';
export const alt = 'Catálogo de propiedades';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
  params: { slug: string };
}

export default async function OpengraphImage({ params }: Props) {
  // ✅ Ahora con await
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: company } = await supabase
    .from('companies')
    .select('name, description, logo_url, primary_color')
    .eq('slug', params.slug)
    .maybeSingle();

  // ... resto del código sin cambios
}