'use client'

// Muestra "no incluido en tu plan" en lugar de la página cuando la ruta está
// bloqueada para el plan de la empresa (ver lib/planLocks). Los admins de
// plataforma ven la página, con un aviso de que el plan no la incluye.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock, ArrowRight } from 'lucide-react'
import { useEntitlements } from '../hooks/useEntitlements'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { planLockFor } from '../lib/planLocks'

export default function PlanLockGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: ent } = useEntitlements()
  const isAdmin = useIsAdmin()
  const lock = planLockFor(pathname, ent?.features as Record<string, boolean | undefined> | undefined)

  if (!lock) return <>{children}</>

  if (isAdmin === true) {
    return (
      <>
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs font-bold text-amber-900">
          <Lock size={14} className="text-amber-700 shrink-0" />
          {lock.name} no está en el plan de esta cuenta. La ves porque eres admin.
        </div>
        {children}
      </>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center animate-rise-in motion-reduce:animate-none">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-(--ia-accent)/10 text-(--ia-accent) mb-4">
          <Lock size={22} />
        </span>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">{lock.name} no está en tu plan</h1>
        <p className="text-sm text-slate-500 font-medium leading-relaxed mt-2">{lock.description}</p>
        <Link
          href="/dashboard/plans"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 px-6 py-3 rounded-xl bg-(--ia-accent) text-white text-sm font-bold hover:brightness-110 transition"
        >
          Mejorar plan <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  )
}
