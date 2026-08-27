 

'use client';

// src/app/reset-password/page.tsx
// ----------------------------------------------------------------------------
// Página pública: el usuario llega aquí desde el link del email.
// Supabase ya estableció una sesión temporal de tipo PASSWORD_RECOVERY al
// procesar el token del link, así que aquí solo necesitamos:
//   1. Esperar el evento PASSWORD_RECOVERY (o detectar sesión válida)
//   2. Mostrar form de nueva contraseña + confirmación
//   3. Llamar supabase.auth.updateUser({ password })
//   4. Redirigir a /dashboard
// ----------------------------------------------------------------------------

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type FlowState = 'loading' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [flowState, setFlowState] = useState<FlowState>('loading');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [platform, setPlatform] = useState<{ logo_url?: string; icon_url?: string }>({});
  const [themeColors, setThemeColors] = useState({
    bgHeader: '#134e4a',
    accent: '#3ecf8e',
  });

  // ─── Cargar branding ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadDesign() {
      try {
        const [platRes, tplRes] = await Promise.all([
          supabase.from('platform_settings').select('logo_url, icon_url').single(),
          supabase
            .from('templates')
            .select('theme_color, accent_color')
            .eq('is_active', true)
            .order('display_order'),
        ]);
        if (platRes.data) setPlatform(platRes.data);
        if (tplRes.data && tplRes.data.length >= 3) {
          setThemeColors({
            bgHeader: tplRes.data[2].theme_color || '#134e4a',
            accent: tplRes.data[2].accent_color || '#3ecf8e',
          });
        }
      } catch (err) {
        console.error('[reset-password] error cargando diseño', err);
      }
    }
    loadDesign();
  }, []);

  // ─── Detectar sesión PASSWORD_RECOVERY ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Cuando Supabase procesa el link de recovery, dispara el evento
    // PASSWORD_RECOVERY y establece una sesión temporal.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        setFlowState('ready');
      } else if (event === 'SIGNED_IN' && session) {
        // Si ya hay sesión válida (ej. usuario refrescó la página después de
        // que Supabase procesó el token), también permitimos cambiar password.
        setFlowState('ready');
      }
    });

    // Fallback: verificar sesión actual por si el evento ya pasó
    const timeoutId = setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setFlowState('ready');
      } else {
        // No hay sesión y el evento PASSWORD_RECOVERY no llegó.
        // El link probablemente expiró o ya se usó.
        setFlowState('invalid');
      }
    }, 1500);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // ─── Mutación: actualizar contraseña ───────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }
      if (password !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden.');
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setFlowState('success');
      // Redirigir después de 2 segundos para que el usuario lea el mensaje
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // ─── Vistas según estado ───────────────────────────────────────────────

  if (flowState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
      </div>
    );
  }

  if (flowState === 'invalid') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6 font-sans">
        <div
          className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-96 w-96 rounded-full opacity-[0.03] blur-[120px]"
          style={{ backgroundColor: themeColors.bgHeader }}
        />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="h-7 w-7 text-amber-600" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-center text-xl font-semibold text-slate-900">
            Enlace inválido o expirado
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            El enlace para restablecer tu contraseña ya no es válido. Esto puede pasar
            por dos razones:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="text-slate-400">•</span>
              <span>El enlace expiró (válido por 1 hora).</span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">•</span>
              <span>El enlace ya se usó una vez.</span>
            </li>
          </ul>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Solicitar un nuevo enlace
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (flowState === 'success') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6 font-sans">
        <div
          className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-96 w-96 rounded-full opacity-[0.03] blur-[120px]"
          style={{ backgroundColor: themeColors.bgHeader }}
        />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-center text-xl font-semibold text-slate-900">
            Contraseña actualizada
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            Tu nueva contraseña se guardó correctamente. Te llevamos al dashboard…
          </p>
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Form de nueva contraseña (flowState === 'ready') ──────────────────
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6 font-sans">
      <div
        className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-96 w-96 rounded-full opacity-[0.03] blur-[120px]"
        style={{ backgroundColor: themeColors.bgHeader }}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        {platform.logo_url && (
          <div className="mb-6 flex justify-center">
            <img src={platform.logo_url} alt="iAnswer" className="h-10 object-contain" />
          </div>
        )}

        <h1 className="text-center text-xl font-semibold text-slate-900">
          Crea tu nueva contraseña
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          Elige una contraseña de al menos 6 caracteres. No la compartas con nadie.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!updateMutation.isPending) {
              updateMutation.mutate();
            }
          }}
          className="mt-6 space-y-4"
        >
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Nueva contraseña
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.5}
              />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                autoFocus
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Confirmar contraseña
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.5}
              />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                aria-label={
                  showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {password && confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>
          )}

          <button
            type="submit"
            disabled={
              updateMutation.isPending ||
              !password ||
              !confirmPassword ||
              password !== confirmPassword
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Actualizar contraseña'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
