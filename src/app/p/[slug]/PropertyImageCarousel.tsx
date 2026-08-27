'use client';

// src/app/p/[slug]/PropertyImageCarousel.tsx
// Carrusel de imágenes · thumbnails + flechas + indicadores

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

interface Props {
  photos: string[];
  title: string;
}

export default function PropertyImageCarousel({ photos, title }: Props) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-stone-100">
        <div className="flex flex-col items-center gap-2 text-stone-400">
          <ImageOff className="h-10 w-10" strokeWidth={1} />
          <p className="text-xs uppercase tracking-wide">Sin foto</p>
        </div>
      </div>
    );
  }

  const next = () => setCurrent((c) => (c + 1) % photos.length);
  const prev = () => setCurrent((c) => (c - 1 + photos.length) % photos.length);

  return (
    <div className="bg-stone-100">
      {/* Imagen principal */}
      <div className="relative aspect-video w-full overflow-hidden">
        <img
          src={photos[current]}
          alt={`${title} · foto ${current + 1} de ${photos.length}`}
          className="h-full w-full object-cover"
        />

        {/* Flechas (solo si hay >1 foto) */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-md backdrop-blur transition hover:bg-white"
              aria-label="Foto anterior"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-md backdrop-blur transition hover:bg-white"
              aria-label="Siguiente foto"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </button>
          </>
        )}

        {/* Indicador inferior derecha */}
        {photos.length > 1 && (
          <div className="absolute right-3 bottom-3 rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            {current + 1} / {photos.length}
          </div>
        )}
      </div>

      {/* Thumbnails (solo si hay >1 foto) */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          {photos.map((photo, idx) => (
            <button
              key={`${photo}-${idx}`}
              type="button"
              onClick={() => setCurrent(idx)}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md transition ${
                idx === current
                  ? 'ring-2 ring-offset-2'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={
                idx === current
                  ? ({
                      ['--tw-ring-color' as string]: 'var(--brand-primary)',
                    } as React.CSSProperties)
                  : undefined
              }
              aria-label={`Foto ${idx + 1}`}
            >
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}