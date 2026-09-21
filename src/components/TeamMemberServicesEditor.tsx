 

'use client';

// src/components/TeamMemberServicesEditor.tsx
// ----------------------------------------------------------------------------
// Sprint I · Editor de asignaciones SÍ/NO de servicios por miembro del equipo.
// Se monta dentro del TeamDrawer, en una sección colapsable al final.
//
// Tres estados visuales por servicio:
//   - Sin definir (gris, neutral, default)
//   - SÍ ofrece (verde, check)
//   - NO ofrece (rojo, x)
// ----------------------------------------------------------------------------

import { useState } from 'react';
import {
  Check,
  X,
  Minus,
  Loader2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Info,
  StickyNote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMemberServices,
  useSetMemberServiceState,
  useUpdateMemberServiceNotes,
  getAssignmentState,
  type MemberServiceRow,
  type ServiceAssignmentState,
} from '../hooks/useTeamMemberServices';
import IAnswerLoader from './IAnswerLoader'

interface Props {
  teamMemberId: string;
  /**
   * Indica si el sistema ya tiene servicios creados. Si es false, mostramos
   * un CTA para ir a crearlos en lugar de un editor vacío.
   */
  hasServicesInCatalog: boolean;
  /** Callback para navegar al catálogo. */
  onNavigateToCatalog?: () => void;
  /** Por defecto la sección arranca cerrada para no abrumar el drawer. */
  defaultOpen?: boolean;
}

export default function TeamMemberServicesEditor({
  teamMemberId,
  hasServicesInCatalog,
  onNavigateToCatalog,
  defaultOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const { data: rows, isLoading, error } = useMemberServices(teamMemberId);
  const setState = useSetMemberServiceState(teamMemberId);
  const updateNotes = useUpdateMemberServiceNotes(teamMemberId);

  // Conteo para el badge del header
  const yesCount = rows?.filter((r) => r.offered === true).length ?? 0;
  const noCount = rows?.filter((r) => r.offered === false).length ?? 0;

  function handleSetState(row: MemberServiceRow, target: ServiceAssignmentState) {
    setState.mutate(
      {
        serviceId: row.service_id,
        state: target,
        assignmentId: row.assignment_id,
        notes: row.notes,
      },
      {
        onError: (err: Error) => toast.error(err.message),
      }
    );
  }

  function handleStartEditNotes(row: MemberServiceRow) {
    if (!row.assignment_id) {
      toast.error('Primero asigna SÍ o NO antes de agregar notas.');
      return;
    }
    setEditingNotesFor(row.assignment_id);
    setNotesDraft(row.notes ?? '');
  }

  function handleSaveNotes(assignmentId: string) {
    updateNotes.mutate(
      { assignmentId, notes: notesDraft },
      {
        onSuccess: () => {
          setEditingNotesFor(null);
          setNotesDraft('');
          toast.success('Notas guardadas');
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  }

  // ─── Header colapsable ───────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          <Briefcase className="h-4 w-4 text-slate-600" strokeWidth={1.5} />
          <span className="text-sm font-medium text-slate-900">
            Servicios que ofrece
          </span>
          {(yesCount > 0 || noCount > 0) && (
            <span className="flex items-center gap-1.5 text-xs">
              {yesCount > 0 && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                  {yesCount} SÍ
                </span>
              )}
              {noCount > 0 && (
                <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
                  {noCount} NO
                </span>
              )}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
        )}
      </button>

      {!isOpen && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Define qué servicios SÍ ofrece este miembro y cuáles NO. El bot lo usará
          para derivar a los clientes al especialista correcto.
        </p>
      )}

      {/* ─── Contenido expandido ──────────────────────────────────────── */}
      {isOpen && (
        <div className="border-t border-slate-100 p-4">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <IAnswerLoader size={20} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
              Error cargando servicios: {error.message}
            </div>
          )}

          {/* Catálogo vacío */}
          {!isLoading && !error && (!rows || rows.length === 0) && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              {hasServicesInCatalog ? (
                <p className="text-sm text-slate-600">
                  No hay servicios activos en el catálogo. Activa al menos uno.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-700">
                    Primero crea el catálogo de servicios de tu negocio.
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Ahí defines qué servicios ofreces (consulta, limpieza, etc.).
                    Después aquí puedes decir cuáles atiende cada miembro.
                  </p>
                  {onNavigateToCatalog && (
                    <button
                      type="button"
                      onClick={onNavigateToCatalog}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      Ir al catálogo de servicios
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Lista de servicios con tri-estado */}
          {!isLoading && !error && rows && rows.length > 0 && (
            <>
              {/* Leyenda */}
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <Info className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" strokeWidth={1.5} />
                <span>
                  <strong className="text-slate-700">Sin definir</strong> = el bot
                  puede considerarlo · <strong className="text-emerald-700">SÍ</strong> =
                  derivar prioritariamente aquí · <strong className="text-red-700">NO</strong> =
                  nunca derivar
                </span>
              </div>

              <ul className="space-y-2">
                {rows.map((row) => {
                  const state = getAssignmentState(row);
                  const isEditingNotes = editingNotesFor === row.assignment_id;
                  return (
                    <li
                      key={row.service_id}
                      className="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Info del servicio */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {row.service_name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                            {row.service_category && (
                              <span>{row.service_category}</span>
                            )}
                            {row.duration_minutes && (
                              <span>{row.duration_minutes} min</span>
                            )}
                            {row.default_price !== null && (
                              <span>
                                $
                                {row.default_price.toLocaleString('es-MX', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tri-estado: Sin / SÍ / NO */}
                        <div
                          className="inline-flex flex-shrink-0 overflow-hidden rounded-lg border border-slate-200"
                          role="radiogroup"
                          aria-label={`Asignación de ${row.service_name}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSetState(row, 'unset')}
                            disabled={setState.isPending}
                            aria-pressed={state === 'unset'}
                            title="Sin definir"
                            className={`flex h-8 w-9 items-center justify-center transition ${
                              state === 'unset'
                                ? 'bg-slate-100 text-slate-900'
                                : 'bg-white text-slate-400 hover:bg-slate-50'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetState(row, 'yes')}
                            disabled={setState.isPending}
                            aria-pressed={state === 'yes'}
                            title="SÍ ofrece este servicio"
                            className={`flex h-8 w-9 items-center justify-center border-l border-slate-200 transition ${
                              state === 'yes'
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetState(row, 'no')}
                            disabled={setState.isPending}
                            aria-pressed={state === 'no'}
                            title="NO ofrece este servicio"
                            className={`flex h-8 w-9 items-center justify-center border-l border-slate-200 transition ${
                              state === 'no'
                                ? 'bg-red-500 text-white'
                                : 'bg-white text-slate-400 hover:bg-red-50 hover:text-red-600'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <X className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>

                      {/* Notas (solo si está asignado) */}
                      {row.assignment_id && (
                        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                          {!isEditingNotes && (
                            <button
                              type="button"
                              onClick={() => handleStartEditNotes(row)}
                              className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 transition hover:text-slate-900"
                            >
                              <StickyNote className="h-3 w-3" strokeWidth={1.5} />
                              {row.notes ? (
                                <span className="line-clamp-1">{row.notes}</span>
                              ) : (
                                <span>Agregar nota (ej. "solo casos leves")</span>
                              )}
                            </button>
                          )}
                          {isEditingNotes && (
                            <div className="space-y-2">
                              <textarea
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                placeholder="Ej. solo casos leves, solo niños, solo viernes…"
                                rows={2}
                                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    row.assignment_id && handleSaveNotes(row.assignment_id)
                                  }
                                  disabled={updateNotes.isPending}
                                  className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  {updateNotes.isPending ? 'Guardando…' : 'Guardar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNotesFor(null);
                                    setNotesDraft('');
                                  }}
                                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
