 

'use client';

// src/app/forgot-password/page.tsx
// ----------------------------------------------------------------------------
// Página pública: el usuario ingresa su email para recibir el link de reset.
// Estilo consistente con /login.
// ----------------------------------------------------------------------------
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import IAnswerLoader from '../../components/IAnswerLoader'
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [platform, setPlatform] = useState<{ name?: string; logo_url?: string; icon_url?: string }>({});
  const [themeColors, setThemeColors] = useState({
    bgHeader: '#134e4a',
    accent: '#3ecf8e',
  });
  const [isPlatformLoading, setIsPlatformLoading] = useState(true);

  useEffect(() => {
    async function loadDesign() {
      try {
        const [platRes, tplRes] = await Promise.all([
          supabase.from('platform_settings').select('name, logo_url, icon_url').single(),
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
        console.error('[forgot-password] error cargando diseño', err);
      } finally {
        setIsPlatformLoading(false);
      }
    }
    loadDesign();
  }, []);

  const requestMutation = useMutation({
    mutationFn: async (emailValue: string) => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue }),
      });
      // La respuesta puede llegar vacía/incompleta si la función del servidor
      // se corta antes de terminar (ej. timeout de Vercel bajo alta latencia) --
      // en ese caso res.json() lanzaría 'Unexpected end of JSON input' crudo.
      let data: { ok?: boolean; error?: string; message?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          'El servidor tardó demasiado en responder. Intenta de nuevo en unos segundos.'
        );
      }
      if (!res.ok) {
        throw new Error(data?.error ?? 'Error enviando solicitud');
      }
      return data as { ok: true; message: string };
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isPlatformLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <IAnswerLoader size={40} />
      </div>
    );
  }

  // ─── Vista de éxito ──────────────────────────────────────────────────────
  if (submitted) {
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
            Revisa tu correo
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            Si <strong className="text-slate-900">{email}</strong> está registrado en  {platform.name || 'Plataforma'},
            recibirás un enlace para restablecer tu contraseña en los próximos minutos.
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            El enlace expira en 1 hora. Revisa también tu carpeta de spam.
          </p>
          <div className="mt-8 flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Volver al inicio de sesión
            </Link>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setEmail('');
              }}
              className="text-xs text-slate-500 transition hover:text-slate-900"
            >
              ¿No recibiste el correo? Inténtalo con otro email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Formulario ──────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6 font-sans">
      <div
        className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-96 w-96 rounded-full opacity-[0.03] blur-[120px]"
        style={{ backgroundColor: themeColors.bgHeader }}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        {/* Logo */}
        {platform.logo_url && (
          <div className="mb-6 flex justify-center">
            <img
              src={platform.logo_url}
              alt=" {platform.name || 'Plataforma'}"
              className="h-10 object-contain"
            />
          </div>
        )}

        <h1 className="text-center text-xl font-semibold text-slate-900">
          ¿Olvidaste tu contraseña?
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!requestMutation.isPending) {
              requestMutation.mutate(email);
            }
          }}
          className="mt-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Correo electrónico
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.5}
              />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                autoFocus
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={requestMutation.isPending || !email}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar enlace de recuperación'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
