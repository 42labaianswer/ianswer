 

'use client'

// ============================================================================
// src/components/public/FAQAccordion.tsx
// ----------------------------------------------------------------------------
// Acordeón de preguntas frecuentes con animación. Solo un item abierto a la vez.
// ============================================================================

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

interface Props {
  items: FAQItem[]
}

export default function FAQAccordion({ items }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <div className="divide-y divide-slate-200 bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx
        return (
          <div key={idx}>
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors"
            >
              <p className="font-black text-slate-900 text-sm md:text-base">
                {item.question}
              </p>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-6 pb-5 -mt-1 text-sm text-slate-600 leading-relaxed font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                {item.answer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
