 

'use client'
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Agenda } from '../types/database';
import { Calendar, Plus, Trash2 } from 'lucide-react';

export default function AgendaManager({ companyId }: { companyId: string }) {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [planLimits, setPlanLimits] = useState({ name: 'Cargando...', max_agendas: 0 });

  useEffect(() => {
    async function loadData() {
      // FIX: Accedemos al primer elemento del array de planes devuelto por el JOIN
      const { data: company } = await supabase
        .from('companies')
        .select(`
          plan_slug,
          plans (name, max_agendas)
        `)
        .eq('id', companyId)
        .single();

      if (company?.plans) {
        // Supabase devuelve plans como un objeto si usas .single() en el query principal 
        // pero TypeScript a veces lo ve como array. Forzamos la lectura segura:
        const planData = Array.isArray(company.plans) ? company.plans[0] : company.plans;
        setPlanLimits(planData as { name: string; max_agendas: number });
      }

      const { data: ags } = await supabase.from('agendas').select('*').eq('company_id', companyId);
      if (ags) setAgendas(ags);
    }
    loadData();
  }, [companyId]);

  const maxAgendas = planLimits.max_agendas;
  const isCentroSalud = maxAgendas > 3;

  return (
    <div className="p-8 bg-white rounded-3xl border border-slate-200 shadow-sm mt-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Gestión de {isCentroSalud ? 'Especialistas' : 'Consultorios'}
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Plan <span className="text-indigo-600 font-bold">{planLimits.name}</span>: {agendas.length} de {maxAgendas} permitidos.
          </p>
        </div>
        
        <button 
          disabled={agendas.length >= maxAgendas}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100"
        >
          <Plus size={18} /> Agregar {isCentroSalud ? 'Médico' : 'Sucursal'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agendas.map((agenda) => (
          <div key={agenda.id} className="p-5 border border-slate-100 bg-slate-50/30 rounded-2xl flex justify-between items-center group hover:border-indigo-100 transition-colors">
            <div>
              <h3 className="font-bold text-slate-800">{agenda.name}</h3>
              <p className="text-[10px] text-slate-400 font-mono mt-1">{agenda.google_calendar_id}</p>
            </div>
            <button className="text-slate-300 hover:text-red-500 p-2 transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        
        {agendas.length === 0 && (
          <div className="md:col-span-2 text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl">
             <Calendar size={32} className="mx-auto text-slate-200 mb-2" />
             <p className="text-sm font-medium text-slate-400">No hay registros aún.</p>
          </div>
        )}
      </div>
    </div>
  );
}
