 

'use client';

// src/app/dashboard/crm/hubspot/page.tsx
// ----------------------------------------------------------------------------
// Sprint J.5 · Página de configuración HubSpot con Private App Token.
//
// 3 estados:
//   1. Sin addon activo    → paywall
//   2. Con addon sin conectar → instrucciones paso a paso + input de token
//   3. Conectado           → dashboard (métricas, sync, settings, disconnect)
// ----------------------------------------------------------------------------

import { useState, type ReactNode, type ElementType, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Zap,
  Lock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Users,
  Clock,
  ExternalLink,
  Settings,
  Unplug,
  Info,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../../../components/PageHeader';
import {
  useHubSpotIntegration,
  useHasHubSpotAddon,
  useConnectHubSpotWithToken,
  useSyncHubSpot,
  useDisconnectHubSpot,
  useUpdateHubSpotSettings,
} from '../../../../hooks/useHubSpotIntegration';
import IAnswerLoader from '../../../../components/IAnswerLoader'

export default function HubSpotConfigPage() {
  const { data: hasAddon, isLoading: loadingAddon } = useHasHubSpotAddon();
  const { data: integration, isLoading: loadingIntegration } = useHubSpotIntegration();
  const syncMut = useSyncHubSpot();
  const disconnectMut = useDisconnectHubSpot();

  if (loadingAddon || loadingIntegration) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <IAnswerLoader size={32} />
      </div>
    );
  }

  // ─── Paywall ──────────────────────────────────────────────────────────
  if (!hasAddon) {
    return <Paywall />;
  }

  // ─── No conectado: mostrar guía + input ───────────────────────────────
  if (!integration?.is_connected) {
    return <ConnectView />;
  }

  // ─── Conectado ────────────────────────────────────────────────────────
  return (
    <ConnectedDashboard
      integration={integration}
      onSync={() => syncMut.mutate()}
      syncing={syncMut.isPending}
      syncResult={syncMut.data}
      onDisconnect={() => disconnectMut.mutate()}
      disconnecting={disconnectMut.isPending}
    />
  );
}

// ─── Estado 1: PAYWALL ─────────────────────────────────────────────────────

function Paywall() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        eyebrow="INTEGRACIÓN"
        title="HubSpot CRM"
        description="Sincroniza tus contactos de HubSpot con iAnswer automáticamente."
      />
      <div className="mx-auto mt-12 max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
            <Lock className="h-7 w-7 text-orange-500" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-900">
            Activa la integración HubSpot
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Cada contacto que agregues a HubSpot aparece en iAnswer automáticamente
            y puede recibir mensajes de tu agente IA. Ideal si ya usas HubSpot como
            tu CRM principal.
          </p>
          <div className="mt-6 inline-flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-slate-900">$499</span>
            <span className="text-sm font-medium text-slate-500">MXN/mes</span>
          </div>
          <ul className="mt-6 space-y-2 text-left text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2} />
              <span>Sincronización cada 6 horas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2} />
              <span>Deduplicación automática por email + teléfono</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2} />
              <span>Origen marcado en cada contacto</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2} />
              <span>Sync manual bajo demanda</span>
            </li>
          </ul>
          <div className="mt-8 flex flex-col gap-2">
            <Link
              href="/dashboard/marketplace"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Activar desde marketplace
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              href="/dashboard/crm/clientes"
              className="text-xs text-slate-500 transition hover:text-slate-900"
            >
              Volver a contactos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Estado 2: CONNECT VIEW (instrucciones + input) ────────────────────────

function ConnectView() {
  const connectMut = useConnectHubSpotWithToken();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  function handleConnect() {
    const trimmed = token.trim();
    if (!trimmed) {
      toast.error('Pega tu Private App Token');
      return;
    }

    connectMut.mutate(trimmed, {
      onSuccess: (data) => {
        toast.success(`Conectado al portal HubSpot #${data.portal_id}`);
        setToken('');
      },
      onError: (err: Error & { code?: string }) => {
        toast.error(err.message);
      },
    });
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        eyebrow="INTEGRACIÓN"
        title="Conecta tu cuenta HubSpot"
        description="Genera un Private App Token en HubSpot y pégalo abajo."
      />

      <div className="mx-auto max-w-3xl space-y-5">
        {/* Instrucciones paso a paso */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
              <Zap className="h-5 w-5 text-orange-500" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Cómo generar tu Private App Token
              </h2>
              <p className="text-xs text-slate-500">Toma menos de 2 minutos</p>
            </div>
          </div>

          <ol className="space-y-4">
            <Step number={1} title="Entra a HubSpot Settings">
              Inicia sesión en tu cuenta de HubSpot y haz click en el ícono de
              engrane arriba a la derecha, o ve directo a{' '}
              <ExternalHubSpotLink href="https://app.hubspot.com/settings" label="hubspot.com/settings" />.
              Necesitas ser <strong>Super Admin</strong> de la cuenta para poder
              crear Private Apps.
            </Step>

            <Step number={2} title="Ve a Integrations → Private Apps">
              En el menú lateral izquierdo baja hasta <strong>Integrations</strong>{' '}
              y haz click en <strong>Private Apps</strong>. Después haz click en el
              botón <strong>&quot;Create a private app&quot;</strong> arriba a la derecha.
            </Step>

            <Step number={3} title="Pestaña Basic Info">
              <ul className="mt-1 space-y-1 text-xs">
                <li>• <strong>Name:</strong> iAnswer Sync</li>
                <li>• <strong>Description:</strong> Sincronización de contactos con iAnswer (opcional)</li>
                <li>• <strong>Logo:</strong> opcional</li>
              </ul>
            </Step>

            <Step number={4} title="Pestaña Scopes (esta es la parte importante)">
              Haz click en <strong>Scopes</strong> arriba. Ahora busca y marca
              exactamente estos dos permisos:
              <div className="mt-2 space-y-1.5">
                <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs">
                  <span className="text-emerald-600">✓</span>{' '}
                  <strong>crm.objects.contacts.read</strong>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs">
                  <span className="text-emerald-600">✓</span>{' '}
                  <strong>crm.schemas.contacts.read</strong>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Tip: usa el buscador arriba (&quot;Find a scope...&quot;) y escribe{' '}
                <code className="rounded bg-slate-100 px-1">contacts.read</code>{' '}
                para filtrar rápido.
              </p>
            </Step>

            <Step number={5} title="Crea el app">
              Haz click en <strong>Create app</strong> arriba a la derecha. HubSpot
              te va a mostrar un modal de confirmación &mdash; haz click en{' '}
              <strong>Continue creating</strong>.
            </Step>

            <Step number={6} title="Copia el Access Token">
              Ahora ves la pantalla del app creado. En la pestaña{' '}
              <strong>Auth</strong>, verás una sección{' '}
              <strong>&quot;Access token&quot;</strong> con un valor oculto que empieza con{' '}
              <code className="rounded bg-slate-100 px-1">pat-na1-</code> o similar.
              Haz click en <strong>Show token</strong> y luego en{' '}
              <strong>Copy</strong>. Ese es tu Private App Token.
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="text-[11px] text-amber-800">
                  <strong>Importante:</strong> guarda este token en un lugar seguro. HubSpot solo te lo
                  muestra completo una vez. Si lo pierdes puedes rotarlo desde el
                  mismo panel de HubSpot.
                </p>
              </div>
            </Step>

            <Step number={7} title="Pégalo aquí abajo">
              Vuelve a esta pantalla y pega el token en el campo de la siguiente sección.
            </Step>
          </ol>
        </div>

        {/* Input del token */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-slate-900">
              Pega tu Private App Token
            </h3>
          </div>

          <div className="relative">
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              rows={3}
              className={`w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                showToken ? 'font-mono' : 'font-mono tracking-widest'
              }`}
              style={showToken ? undefined : { WebkitTextSecurity: 'disc' } as CSSProperties}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-50 border border-slate-200"
            >
              {showToken ? (
                <>
                  <EyeOff className="h-3 w-3" strokeWidth={1.5} />
                  Ocultar
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" strokeWidth={1.5} />
                  Ver
                </>
              )}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            Guardamos el token de forma segura y solo lo usamos para leer tus
            contactos. Puedes revocarlo en cualquier momento desde HubSpot.
          </p>

          <button
            type="button"
            onClick={handleConnect}
            disabled={connectMut.isPending || !token.trim()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {connectMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validando token con HubSpot…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" strokeWidth={2} />
                Conectar HubSpot
              </>
            )}
          </button>

          {connectMut.error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" strokeWidth={2} />
                <p className="text-xs text-red-800">
                  {connectMut.error.message}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Estado 3: CONNECTED DASHBOARD ─────────────────────────────────────────

function ConnectedDashboard({
  integration,
  onSync,
  syncing,
  syncResult,
  onDisconnect,
  disconnecting,
}: {
  integration: NonNullable<ReturnType<typeof useHubSpotIntegration>['data']>;
  onSync: () => void;
  syncing: boolean;
  syncResult: { synced: number; updated: number; errors: number; message: string } | undefined;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const updateSettingsMut = useUpdateHubSpotSettings();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  function handleDisconnect() {
    if (!showDisconnectConfirm) {
      setShowDisconnectConfirm(true);
      return;
    }
    onDisconnect();
    setShowDisconnectConfirm(false);
  }

  const lastSyncText = integration.last_sync_at
    ? formatRelativeTime(integration.last_sync_at)
    : 'Nunca';

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        eyebrow="INTEGRACIÓN"
        title="HubSpot CRM · Conectado"
        description={`Portal HubSpot #${integration.hub_id ?? '?'}`}
        actions={
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                Sincronizar ahora
              </>
            )}
          </button>
        }
      />

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          icon={Users}
          label="Contactos sincronizados"
          value={integration.total_contacts_synced.toString()}
        />
        <StatCard
          icon={Clock}
          label="Último sync"
          value={lastSyncText}
          status={integration.last_sync_status}
        />
        <StatCard
          icon={CheckCircle2}
          label="Sync automático"
          value={integration.auto_sync_enabled ? 'Activo (cada 6h)' : 'Pausado'}
          statusColor={integration.auto_sync_enabled ? 'emerald' : 'amber'}
        />
      </div>

      {/* Resultado del último sync manual */}
      {syncResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Sincronización completada
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {syncResult.synced} nuevos · {syncResult.updated} actualizados
                {syncResult.errors > 0 && ` · ${syncResult.errors} errores`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Estado del último sync (si falló) */}
      {integration.last_sync_status === 'failed' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" strokeWidth={2} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">Última sync falló</p>
              <p className="mt-0.5 text-xs text-red-700">
                {integration.last_sync_message ?? 'Error desconocido'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <Section icon={Settings} title="Configuración">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Sincronización automática</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Cuando está activa, iAnswer trae contactos nuevos cada 6 horas.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateSettingsMut.mutate({
                  auto_sync_enabled: !integration.auto_sync_enabled,
                })
              }
              disabled={updateSettingsMut.isPending}
              role="switch"
              aria-checked={integration.auto_sync_enabled}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
                integration.auto_sync_enabled ? 'bg-emerald-500' : 'bg-slate-300'
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  integration.auto_sync_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" strokeWidth={1.5} />
              <div className="text-xs text-slate-600">
                <p className="font-medium text-slate-900">Dirección de sync</p>
                <p className="mt-1 leading-relaxed">
                  Actualmente solo se sincroniza <strong>HubSpot → iAnswer</strong> (pull).
                  Los cambios que hagas en iAnswer NO se envían a HubSpot.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Info conexión */}
      <Section icon={ExternalLink} title="Detalles de la conexión">
        <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoRow label="Portal HubSpot" value={integration.hub_id ?? '—'} />
          <InfoRow label="Cuenta conectada" value={integration.user_email ?? '—'} />
          <InfoRow
            label="Conectado desde"
            value={new Date(integration.connected_at).toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          />
          <InfoRow
            label="Método"
            value="Private App Token"
          />
        </dl>
      </Section>

      {/* Zona peligrosa */}
      <Section icon={Unplug} title="Desconectar" tone="danger">
        <p className="mb-3 text-sm text-slate-600">
          Al desconectar, iAnswer dejará de sincronizar contactos automáticamente.
          Los contactos ya importados permanecerán en tu CRM. Si además quieres
          invalidar el token completamente, debes ir a HubSpot Settings → Integrations
          → Private Apps y borrarlo desde ahí.
        </p>
        {showDisconnectConfirm ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="mb-3 text-sm font-medium text-red-900">
              ¿Seguro? Tendrás que volver a pegar tu token si quieres reconectar.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {disconnecting ? 'Desconectando…' : 'Sí, desconectar'}
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Unplug className="h-4 w-4" strokeWidth={1.5} />
            Desconectar HubSpot
          </button>
        )}
      </Section>
    </div>
  );
}

// ─── Sub-componentes de layout ─────────────────────────────────────────────

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
        {number}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <div className="mt-1 text-xs leading-relaxed text-slate-600">{children}</div>
      </div>
    </li>
  );
}

function ExternalHubSpotLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-orange-600 underline underline-offset-2 hover:text-orange-700"
    >
      {label}
      <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
    </a>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  tone = 'default',
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={`rounded-2xl border p-5 md:p-6 ${
        tone === 'danger' ? 'border-red-100 bg-white' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <Icon
          className={`h-4 w-4 ${tone === 'danger' ? 'text-red-500' : 'text-slate-500'}`}
          strokeWidth={1.5}
        />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  status,
  statusColor,
}: {
  icon: ElementType;
  label: string;
  value: string;
  status?: 'success' | 'partial' | 'failed' | null;
  statusColor?: 'emerald' | 'amber' | 'red';
}) {
  const color =
    statusColor ||
    (status === 'success'
      ? 'emerald'
      : status === 'partial'
      ? 'amber'
      : status === 'failed'
      ? 'red'
      : undefined);

  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${color ? colorClasses[color] : 'text-slate-400'}`}
          strokeWidth={1.5}
        />
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `Hace ${days} día${days === 1 ? '' : 's'}`;
  if (hours > 0) return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
  if (minutes > 0) return `Hace ${minutes} min`;
  return 'Ahora mismo';
}
