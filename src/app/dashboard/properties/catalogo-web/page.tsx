 

'use client';

// src/app/dashboard/properties/catalogo-web/page.tsx
// ----------------------------------------------------------------------------
// Sprint H.5 · Panel de configuración del Catálogo Web (Directorio Público).
//
// Permite al usuario:
//   - Ver y copiar su link público (/p/{slug})
//   - Cambiar el slug
//   - Subir/cambiar logo (bucket 'branding')
//   - Editar nombre público, tagline, descripción
//   - Configurar colores primary/secondary
//   - Setear teléfono de WhatsApp y website
//
// Si el addon NO está activo, muestra un paywall con CTA al marketplace.
// ----------------------------------------------------------------------------

import { useState, useEffect, useRef, type ChangeEvent, type ElementType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Upload,
  ImageIcon,
  Palette,
  Phone,
  Link as LinkIcon,
  Save,
  Lock,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../../../components/PageHeader';
import {
  usePublicDirectoryConfig,
  useHasPublicDirectoryAddon,
  useUpdatePublicDirectoryConfig,
  useUploadCompanyLogo,
} from '../../../../hooks/usePublicDirectoryConfig';
import IAnswerLoader from '../../../../components/IAnswerLoader'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || '';

const PRESET_COLORS = [
  '#0f172a', // Slate-900
  '#134e4a', // Teal-900
  '#1e3a8a', // Blue-900
  '#7c2d12', // Orange-900
  '#581c87', // Purple-900
  '#831843', // Pink-900
  '#365314', // Lime-900
  '#0c4a6e', // Sky-900
];

export default function CatalogoWebConfigPage() {
  const { data: config, isLoading } = usePublicDirectoryConfig();
  const { data: hasAddon, isLoading: loadingAddon } = useHasPublicDirectoryAddon();
  const updateMut = useUpdatePublicDirectoryConfig();
  const uploadMut = useUploadCompanyLogo();

  // Estado local del form (se hidrata desde config)
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0f172a');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [phoneE164, setPhoneE164] = useState('');
  const [website, setWebsite] = useState('');
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hidratar estado al cargar config
  useEffect(() => {
    if (!config) return;
    setSlug(config.slug ?? '');
    setDescription(config.description ?? '');
    setTagline(config.tagline ?? '');
    setPrimaryColor(config.primary_color ?? '#0f172a');
    setSecondaryColor(config.secondary_color ?? '#64748b');
    setPhoneE164(config.phone_e164 ?? '');
    setWebsite(config.website ?? '');
  }, [config]);

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading || loadingAddon) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <IAnswerLoader size={32} />
      </div>
    );
  }

  // ─── Paywall: no tiene addon activo ───────────────────────────────────
  if (!hasAddon) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader
          eyebrow="CATÁLOGO WEB"
          title="Directorio Público"
          description="Una página whitelabel con todo tu inventario para compartir en redes y campañas."
        />

        <div className="mx-auto max-w-2xl mt-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <Lock className="h-7 w-7 text-slate-500" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              Activa el Catálogo Web
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Una página whitelabel estilo Futura Capital con todo tu inventario,
              filtros por zona/precio/recámaras, botón directo a WhatsApp y URL
              bonita para compartir en redes.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900">$299</span>
              <span className="text-sm font-medium text-slate-500">MXN/mes</span>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/dashboard/marketplace"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Activar desde marketplace
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link
                href="/dashboard/properties"
                className="text-xs text-slate-500 transition hover:text-slate-900"
              >
                Volver a propiedades
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Tiene addon: render del config ───────────────────────────────────

  const publicUrl = slug ? `${PUBLIC_BASE_URL}/p/${slug}` : '';

  async function handleCopyUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  function handleLogoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMut.mutate(file, {
      onSuccess: () => {
        toast.success('Logo subido correctamente');
        // Reset input para permitir re-subir el mismo archivo
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  async function handleSaveAll() {
    try {
      await updateMut.mutateAsync({
        slug,
        description,
        tagline,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        phone_e164: phoneE164,
        website,
      });
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  const hasUnsavedChanges =
    config &&
    (slug !== (config.slug ?? '') ||
      description !== (config.description ?? '') ||
      tagline !== (config.tagline ?? '') ||
      primaryColor !== (config.primary_color ?? '#0f172a') ||
      secondaryColor !== (config.secondary_color ?? '#64748b') ||
      phoneE164 !== (config.phone_e164 ?? '') ||
      website !== (config.website ?? ''));

  return (
    <div className="space-y-5 p-4 md:p-6 pb-32">
      <PageHeader
        eyebrow="CATÁLOGO WEB"
        title="Configuración del directorio público"
        description="Personaliza cómo se ve tu catálogo público y dónde vive tu link."
        actions={
          publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              Ver mi catálogo
            </a>
          ) : null
        }
      />

      {/* ─── Bloque: Link público ─────────────────────────────────────── */}
      <Section
        icon={LinkIcon}
        title="Tu link público"
        description="Este es el URL donde se renderiza tu catálogo. Compártelo en redes, campañas y bio."
      >
        <div className="space-y-3">
          <div className="flex items-stretch gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex flex-1 items-center gap-2 px-2 text-sm">
              <Globe className="h-4 w-4 flex-shrink-0 text-slate-400" strokeWidth={1.5} />
              <span className="truncate font-mono text-slate-700">
                {publicUrl || 'Define tu slug abajo para generar el link'}
              </span>
            </div>
            {publicUrl && (
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 border border-slate-200"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Copiar
                  </>
                )}
              </button>
            )}
          </div>

          <Field
            label="Slug (parte después de /p/)"
            helpText="Solo letras minúsculas, números y guiones. Ej. casas-merida, futura-capital."
          >
            <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
              <span className="flex items-center bg-slate-50 px-3 text-xs text-slate-500 border-r border-slate-300">
                {PUBLIC_BASE_URL.replace(/^https?:\/\//, '')}/p/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                placeholder="tu-marca"
                className="flex-1 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none"
                maxLength={50}
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* ─── Bloque: Identidad visual ─────────────────────────────────── */}
      <Section
        icon={ImageIcon}
        title="Identidad visual"
        description="Tu logo aparece como header de la página pública y en las previsualizaciones al compartir."
      >
        <div className="space-y-4">
          {/* Logo preview + upload */}
          <Field label="Logo">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {config?.logo_url ? (
                  <img
                    src={config.logo_url}
                    alt="Logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {uploadMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Subiendo…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" strokeWidth={1.5} />
                      {config?.logo_url ? 'Cambiar logo' : 'Subir logo'}
                    </>
                  )}
                </button>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  PNG, JPG, SVG o WebP. Máximo 2MB. Recomendado: fondo transparente.
                </p>
              </div>
            </div>
          </Field>

          <Field
            label="Nombre de marca (display)"
            helpText='Este es el "${config?.name}" que se muestra en el header del directorio. Para cambiarlo, ve a Configuración general.'
          >
            <input
              type="text"
              value={config?.name ?? ''}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </Field>

          <Field
            label="Tagline (frase corta debajo del logo)"
            helpText="Opcional. Máximo 80 caracteres."
          >
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={80}
              placeholder="Ej. Tu próximo hogar te espera en Mérida"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </Field>

          <Field
            label="Descripción"
            helpText="Aparece como meta description en buscadores y al compartir en redes."
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Inmobiliaria especializada en residencial premium en Mérida. Casas, departamentos y terrenos en venta y renta."
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </Field>
        </div>
      </Section>

      {/* ─── Bloque: Colores ──────────────────────────────────────────── */}
      <Section
        icon={Palette}
        title="Colores"
        description="Personaliza los colores de tu directorio para que combine con tu marca."
      >
        <div className="space-y-4">
          <ColorPickerField
            label="Color primario"
            value={primaryColor}
            onChange={setPrimaryColor}
            helpText="Usado en botones, links activos y acentos."
          />
          <ColorPickerField
            label="Color secundario"
            value={secondaryColor}
            onChange={setSecondaryColor}
            helpText="Usado en texto descriptivo y elementos sutiles."
          />
        </div>
      </Section>

      {/* ─── Bloque: Contacto ─────────────────────────────────────────── */}
      <Section
        icon={Phone}
        title="Contacto"
        description="El botón flotante de WhatsApp del catálogo lleva a este número."
      >
        <div className="space-y-4">
          <Field
            label="WhatsApp (formato E.164 sin +)"
            helpText="Solo dígitos. Para México agrega 52 + 1 + 10 dígitos. Ej. 5219991234567"
          >
            <input
              type="tel"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value.replace(/\D/g, ''))}
              placeholder="5219991234567"
              maxLength={15}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </Field>

          <Field
            label="Sitio web"
            helpText="Opcional. URL completa incluyendo https://"
          >
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://tu-inmobiliaria.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </Field>
        </div>
      </Section>

      {/* ─── Bottom bar: Save ─────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-sm md:left-64">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {hasUnsavedChanges ? (
              <>
                <AlertCircle
                  className="h-4 w-4 flex-shrink-0 text-amber-500"
                  strokeWidth={1.5}
                />
                <span className="text-slate-700">Tienes cambios sin guardar</span>
              </>
            ) : (
              <>
                <Check
                  className="h-4 w-4 flex-shrink-0 text-emerald-500"
                  strokeWidth={2}
                />
                <span className="text-slate-500">Todo guardado</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={updateMut.isPending || !hasUnsavedChanges}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" strokeWidth={1.5} />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ElementType;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-4.5 w-4.5 text-slate-700" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  helpText,
  children,
}: {
  label: string;
  helpText?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
      {helpText && <p className="mt-1 text-[11px] text-slate-500">{helpText}</p>}
    </div>
  );
}

function ColorPickerField({
  label,
  value,
  onChange,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helpText?: string;
}) {
  return (
    <Field label={label} helpText={helpText}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#0f172a"
          className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={`h-7 w-7 rounded-md border-2 transition ${
                value.toLowerCase() === preset.toLowerCase()
                  ? 'border-slate-900 scale-110'
                  : 'border-slate-200 hover:border-slate-400'
              }`}
              style={{ backgroundColor: preset }}
              aria-label={`Color ${preset}`}
            />
          ))}
        </div>
      </div>
    </Field>
  );
}
