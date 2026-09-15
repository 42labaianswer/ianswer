 

'use client';

// src/app/dashboard/services/page.tsx
// ----------------------------------------------------------------------------
// Sprint I · CRUD del catálogo de servicios de la company.
// Lista + drawer crear/editar + delete con confirm.
//
// [HOTFIX 2026-06-28] Correcciones de TypeScript:
//   - PageHeader no acepta prop `icon`; se quita.
//   - PageHeader usa `actions` (plural), no `action`.
//   - Se importan FormEvent y ReactNode explícitamente de React.
// ----------------------------------------------------------------------------

import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Briefcase,
  Clock,
  Tag as TagIcon,
  X,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import {
  useServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  type Service,
  type ServiceDraft,
} from '../../../hooks/useServices';
import PageHeader from '../../../components/PageHeader';
import { useConfirm } from '../../../hooks/useConfirm';

const CURRENCY_OPTIONS: Array<'MXN' | 'USD'> = ['MXN', 'USD'];

export default function ServicesCatalogPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  // Cargar company del profile actual
  useEffect(() => {
    async function loadCompany() {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        setLoadingCompany(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();
      setCompanyId(profile?.company_id ?? null);
      setLoadingCompany(false);
    }
    loadCompany();
  }, []);

  const { data: services, isLoading } = useServices(companyId);
  const createMut = useCreateService(companyId);
  const updateMut = useUpdateService(companyId);
  const deleteMut = useDeleteService(companyId);

  // Filtro de búsqueda
  const filteredServices =
    services?.filter((s) => {
      if (!search.trim()) return true;
      const haystack = `${s.name} ${s.description ?? ''} ${s.category ?? ''} ${s.bot_keywords.join(' ')}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    }) ?? [];

  function handleOpenCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function handleOpenEdit(service: Service) {
    setEditing(service);
    setDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setEditing(null);
  }

  async function handleToggleActive(service: Service) {
    try {
      await updateMut.mutateAsync({
        id: service.id,
        patch: { is_active: !service.is_active },
      });
      toast.success(service.is_active ? 'Servicio desactivado' : 'Servicio activado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    }
  }

  async function handleDelete(service: Service) {
    const ok = await confirm(
      `¿Eliminar el servicio "${service.name}"? Esta acción no se puede deshacer y eliminará todas las asignaciones a miembros del equipo.`,
      { title: 'Eliminar servicio', danger: true, confirmText: 'Eliminar' }
    );
    if (!ok) {
      return;
    }
    try {
      await deleteMut.mutateAsync(service.id);
      toast.success('Servicio eliminado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  // ─── Loading initial ────────────────────────────────────────────────────
  if (loadingCompany) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="p-6 text-sm text-slate-600">
        No se pudo cargar la información de la empresa.
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        eyebrow="CATÁLOGO"
        title="Servicios"
        description="Define los servicios que ofreces. Después puedes asignar quién atiende cada uno desde el perfil de cada miembro del equipo."
        actions={
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo servicio
          </button>
        }
      />

      {/* Búsqueda */}
      {(services?.length ?? 0) > 0 && (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar servicio…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : services?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <Briefcase className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Aún no tienes servicios
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Crea tu primer servicio para que el bot pueda derivar clientes al miembro correcto.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Crear primer servicio
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredServices.map((service) => (
            <li
              key={service.id}
              className={`rounded-xl border bg-white p-4 transition ${
                service.is_active
                  ? 'border-slate-200 hover:border-slate-300'
                  : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {service.name}
                  </h3>
                  {service.category && (
                    <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {service.category}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleActive(service)}
                  className="flex-shrink-0 text-slate-400 transition hover:text-slate-900"
                  title={service.is_active ? 'Desactivar' : 'Activar'}
                >
                  {service.is_active ? (
                    <ToggleRight className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
                  ) : (
                    <ToggleLeft className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>

              {service.description && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                  {service.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {service.duration_minutes && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.5} />
                    {service.duration_minutes} min
                  </span>
                )}
                {service.default_price !== null && (
                  <span>
                    ${service.default_price.toLocaleString('es-MX')} {service.currency}
                  </span>
                )}
              </div>

              {service.bot_keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {service.bot_keywords.slice(0, 4).map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
                    >
                      <TagIcon className="h-2.5 w-2.5" strokeWidth={1.5} />
                      {kw}
                    </span>
                  ))}
                  {service.bot_keywords.length > 4 && (
                    <span className="text-[10px] text-slate-400">
                      +{service.bot_keywords.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(service)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Edit2 className="h-3 w-3" strokeWidth={1.5} />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(service)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Drawer create/edit */}
      {drawerOpen && (
        <ServiceDrawer
          service={editing}
          onClose={handleCloseDrawer}
          onSubmit={async (draft) => {
            try {
              if (editing) {
                await updateMut.mutateAsync({ id: editing.id, patch: draft });
                toast.success('Servicio actualizado');
              } else {
                await createMut.mutateAsync(draft);
                toast.success('Servicio creado');
              }
              handleCloseDrawer();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Error al guardar');
            }
          }}
          isPending={createMut.isPending || updateMut.isPending}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

// ─── Drawer create/edit ───────────────────────────────────────────────────
interface DrawerProps {
  service: Service | null;
  onClose: () => void;
  onSubmit: (draft: ServiceDraft) => Promise<void>;
  isPending: boolean;
}

function ServiceDrawer({ service, onClose, onSubmit, isPending }: DrawerProps) {
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [duration, setDuration] = useState<string>(
    service?.duration_minutes !== undefined && service?.duration_minutes !== null
      ? String(service.duration_minutes)
      : ''
  );
  const [price, setPrice] = useState<string>(
    service?.default_price !== undefined && service?.default_price !== null
      ? String(service.default_price)
      : ''
  );
  const [currency, setCurrency] = useState<'MXN' | 'USD'>(service?.currency ?? 'MXN');
  const [category, setCategory] = useState(service?.category ?? '');
  const [keywords, setKeywords] = useState(service?.bot_keywords.join(', ') ?? '');
  const [isActive, setIsActive] = useState(service?.is_active ?? true);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    const parsedDuration = duration.trim() ? parseInt(duration, 10) : null;
    if (parsedDuration !== null && (isNaN(parsedDuration) || parsedDuration <= 0)) {
      toast.error('La duración debe ser un número positivo');
      return;
    }

    const parsedPrice = price.trim() ? parseFloat(price) : null;
    if (parsedPrice !== null && (isNaN(parsedPrice) || parsedPrice < 0)) {
      toast.error('El precio no es válido');
      return;
    }

    const parsedKeywords = keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      duration_minutes: parsedDuration,
      default_price: parsedPrice,
      currency,
      category: category.trim() || null,
      bot_keywords: parsedKeywords,
      is_active: isActive,
      display_order: service?.display_order ?? 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {service ? 'Editar servicio' : 'Nuevo servicio'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 transition hover:text-slate-900"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Nombre" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Consulta general"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                autoFocus
              />
            </Field>

            <Field label="Descripción">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe brevemente en qué consiste el servicio"
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración (minutos)">
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="30"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </Field>
              <Field label="Categoría">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ej. Consulta médica"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Precio default">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </Field>
              </div>
              <Field label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'MXN' | 'USD')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Palabras clave para el bot"
              helpText="Separa con comas. El bot las usa para identificar este servicio cuando un cliente lo solicita en lenguaje natural."
            >
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="limpieza, profilaxis, pulir dientes"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </Field>

            <div>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <span className="text-sm text-slate-700">
                  Servicio activo (visible para el bot y para asignar a miembros)
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" strokeWidth={1.5} />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-component: Field wrapper con label uniforme ───────────────────────
function Field({
  label,
  children,
  required,
  helpText,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {helpText && <p className="mt-1 text-[11px] text-slate-500">{helpText}</p>}
    </div>
  );
}
