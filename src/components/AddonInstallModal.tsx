 

'use client'

// src/components/AddonInstallModal.tsx
// ----------------------------------------------------------------------------
// Sprint AA · Modal de instalación animado para addons.
//
// Muestra una secuencia de "instalando en tu plataforma..." con pasos que se
// van completando, y al final un check de éxito. Da la sensación de que el
// addon se instaló en tiempo real. Al cerrarse, dispara onComplete para que
// la página refresque el estado.
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, Zap } from 'lucide-react'
import { getIcon } from '../lib/iconMap'

interface Step {
  label: string
  duration: number
}

const STEPS: Step[] = [
  { label: 'Verificando tu plan', duration: 700 },
  { label: 'Activando la función', duration: 900 },
  { label: 'Configurando en tu plataforma', duration: 800 },
  { label: 'Listo para usar', duration: 600 },
]

export default function AddonInstallModal({
  addonName,
  addonIcon,
  accentColor = '#4f46e5',
  onComplete,
}: {
  addonName: string
  addonIcon: string
  accentColor?: string
  onComplete: () => void
}) {
  const [currentStep, setCurrentStep] = useState(0)
  const [done, setDone] = useState(false)
  const Icon = getIcon(addonIcon)

  useEffect(() => {
    let mounted = true
    let stepIndex = 0

    function runStep() {
      if (!mounted) return
      if (stepIndex >= STEPS.length) {
        setDone(true)
        // Pequeña pausa en el check final antes de cerrar
        setTimeout(() => {
          if (mounted) onComplete()
        }, 900)
        return
      }
      setCurrentStep(stepIndex)
      const duration = STEPS[stepIndex].duration
      stepIndex += 1
      setTimeout(runStep, duration)
    }

    runStep()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Cabecera con el ícono del addon */}
        <div
          className="px-6 pt-8 pb-6 flex flex-col items-center text-center"
          style={{ background: `linear-gradient(180deg, ${accentColor}12 0%, transparent 100%)` }}
        >
          <div className="relative mb-4">
            {/* Anillo animado */}
            {!done && (
              <div
                className="absolute inset-0 rounded-2xl animate-ping opacity-20"
                style={{ backgroundColor: accentColor }}
              />
            )}
            <div
              className="relative h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-500"
              style={{ backgroundColor: done ? '#10b981' : accentColor, transform: done ? 'scale(1.05)' : 'scale(1)' }}
            >
              {done ? <Check size={30} strokeWidth={3} /> : <Icon size={28} />}
            </div>
          </div>

          <h3 className="text-lg font-black text-slate-900">
            {done ? '¡Instalado!' : 'Instalando'}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{addonName}</p>
        </div>

        {/* Pasos */}
        <div className="px-6 pb-6 space-y-2.5">
          {STEPS.map((step, i) => {
            const isActive = i === currentStep && !done
            const isComplete = done || i < currentStep
            return (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                  style={{
                    backgroundColor: isComplete ? '#10b981' : isActive ? accentColor : '#e2e8f0',
                  }}
                >
                  {isComplete ? (
                    <Check size={13} className="text-white" strokeWidth={3} />
                  ) : isActive ? (
                    <Loader2 size={13} className="text-white animate-spin" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  )}
                </div>
                <span
                  className={`text-sm transition-colors duration-300 ${
                    isComplete ? 'text-slate-900 font-medium' : isActive ? 'text-slate-900 font-bold' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer con mensaje de éxito */}
        {done && (
          <div className="px-6 pb-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 text-emerald-700">
              <Sparkles size={15} />
              <span className="text-sm font-bold">Ya puedes usarlo</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
