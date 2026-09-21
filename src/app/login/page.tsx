 

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Mail, Lock, Building2, Sparkles, Eye, EyeOff } from 'lucide-react'
import IAnswerLoader from '../../components/IAnswerLoader'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Capturar parámetros desde URL (signup=1, plan=growth, template=salud)
  const urlPlanSlug    = searchParams.get('plan')
  const urlTemplate    = searchParams.get('template')
  const urlSignupFlag  = searchParams.get('signup') === '1'

  // Si vienen de la landing pública (?signup=1), arrancar en modo registro
  const [isLogin, setIsLogin] = useState(!urlSignupFlag)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // Visibilidad de contraseñas
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [platform, setPlatform] = useState<any>({ logo_url: '', icon_url: '' })
  const [themeColors, setThemeColors] = useState({ bgHeader: '#134e4a', accent: '#3ecf8e' })
  const [isPlatformLoading, setIsPlatformLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [platRes, tplRes] = await Promise.all([
          supabase.from('platform_settings').select('logo_url, icon_url').single(),
          supabase.from('templates').select('id, theme_color, accent_color').eq('is_active', true).order('display_order')
        ])
        
        if (platRes.data) setPlatform(platRes.data)
        if (tplRes.data && tplRes.data.length >= 3) {
          setThemeColors({
            bgHeader: tplRes.data[2].theme_color || '#134e4a',
            accent: tplRes.data[2].accent_color || '#3ecf8e'
          })
        }
      } catch (error) {
        console.error('Error cargando diseño', error)
      } finally {
        setIsPlatformLoading(false)
      }
    }
    loadData()
  }, [])

  const authMutation = useMutation({
    mutationFn: async () => {
      // VALIDACIONES FRONTEND (Evita el Error 422)
      if (!isLogin) {
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
        if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.')
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error('Credenciales incorrectas.')
        return { needsEmailConfirmation: false }
      } else {
        // emailRedirectTo explícito: sin esto, Supabase arma el link de
        // confirmación con el "Site URL" configurado en su dashboard (que en
        // el proyecto de pruebas sigue en el default http://localhost:3000),
        // sin importar en qué dominio esté corriendo la app (preview o prod).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
          }
        })
        if (error) throw new Error(error.message)

        // Guardar plan/template seleccionados para que OnboardingBootstrap
        // los aplique cuando la company del usuario sea creada en el onboarding
        if (typeof window !== 'undefined') {
          if (urlPlanSlug)  localStorage.setItem('signup_pending_plan',     urlPlanSlug)
          if (urlTemplate)  localStorage.setItem('signup_pending_template', urlTemplate)
        }

        // Si el proyecto de Supabase requiere confirmar el correo, signUp no
        // regresa sesión (data.session === null) aunque el usuario sí se
        // haya creado — hay que avisarle que revise su correo, no mandarlo
        // directo al dashboard (ahí no tiene sesión y lo regresaría a /login).
        return { needsEmailConfirmation: !data.session }
      }
    },
    onSuccess: (result) => {
      if (!isLogin && result?.needsEmailConfirmation) {
        toast.success('Cuenta creada. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.', { duration: 6000 })
        setIsLogin(true)
        return
      }
      toast.success(isLogin ? '¡Bienvenido de vuelta!' : 'Cuenta creada con éxito')
      router.push('/dashboard')
    },
    onError: (error: Error) => toast.error(error.message)
  })

  if (isPlatformLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <IAnswerLoader size={40} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 font-sans relative overflow-hidden">
      
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-[0.03]" style={{ backgroundColor: themeColors.bgHeader }} />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-[0.03]" style={{ backgroundColor: themeColors.bgHeader }} />

      <div className="w-full max-w-[420px] relative z-10">
        
        <div className="flex flex-col items-center mb-8 text-center cursor-pointer" onClick={() => router.push('/')}>
          <div className="flex items-center gap-3 mb-6">
            {platform.icon_url ? (
              <img src={platform.icon_url} alt="Icon" className="h-11 w-auto object-contain rounded-xl shadow-sm bg-white p-1.5 border border-slate-200" />
            ) : (
              <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-md" style={{ backgroundColor: themeColors.bgHeader }}>
                <Building2 size={22} />
              </div>
            )}
            
            {platform.logo_url && (
              <img src={platform.logo_url} alt="Logo" className="max-h-8 w-auto object-contain" />
            )}
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
            {isLogin ? 'Inicia Sesión' : 'Crea tu Cuenta'}
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Gestión de agendas y automatizaciones.
          </p>

          {/* Badge plan preseleccionado (cuando viene de landing pública) */}
          {!isLogin && (urlPlanSlug || urlTemplate) && (
            <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 bg-lime-50 border border-lime-200 rounded-full">
              <Sparkles size={12} className="text-lime-600" />
              <span className="text-xs font-bold text-slate-700">
                {urlPlanSlug && `Plan ${urlPlanSlug.charAt(0).toUpperCase() + urlPlanSlug.slice(1)} · `}
                {urlTemplate && `${urlTemplate.charAt(0).toUpperCase() + urlTemplate.slice(1)} · `}
                7 días gratis
              </span>
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-200/60">
          <form onSubmit={(e) => { e.preventDefault(); authMutation.mutate() }} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:bg-white transition-all text-sm font-semibold text-slate-800" 
                  style={{ '--tw-ring-color': themeColors.bgHeader } as React.CSSProperties}
                  placeholder="ejemplo@correo.com"
                  required 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:bg-white transition-all text-sm font-semibold text-slate-800" 
                  style={{ '--tw-ring-color': themeColors.bgHeader } as React.CSSProperties}
                  placeholder="••••••••"
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isLogin && (
                <div className="text-right">
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              )}
            </div>

            {!isLogin && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:bg-white transition-all text-sm font-semibold text-slate-800" 
                    style={{ '--tw-ring-color': themeColors.bgHeader } as React.CSSProperties}
                    placeholder="••••••••"
                    required={!isLogin} 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={authMutation.isPending} 
              className="w-full text-white py-4 rounded-2xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 mt-6 disabled:opacity-50 hover:brightness-110"
              style={{ backgroundColor: themeColors.bgHeader }}
            >
              {authMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : (isLogin ? 'Entrar al Panel' : 'Crear Cuenta')}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <button 
              type="button" 
              onClick={() => {
                setIsLogin(!isLogin)
                setPassword('')
                setConfirmPassword('')
              }} 
              className="text-xs font-bold transition-colors hover:opacity-80"
              style={{ color: themeColors.bgHeader }}
            >
              {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes credenciales? Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
