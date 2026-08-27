 

// src/hooks/useHubSpotIntegration.ts
// ----------------------------------------------------------------------------
// Sprint J.5 · Hooks HubSpot con modelo Private App Token.
//
// Cambios vs Sprint J (OAuth):
//   - QUITADO: useConnectHubSpot (que hacía window.location redirect a OAuth)
//   - AGREGADO: useConnectHubSpotWithToken (POST a /api/hubspot/connect con token)
//   - HubSpotIntegration type: sin refresh_token, sin expires_at
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface HubSpotIntegration {
  id: string;
  company_id: string;
  hub_id: string | null;
  hub_domain: string | null;
  user_email: string | null;
  scopes: string[] | null;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'partial' | 'failed' | null;
  last_sync_message: string | null;
  total_contacts_synced: number;
  auto_sync_enabled: boolean;
  sync_direction: 'pull' | 'push' | 'bidirectional';
  is_connected: boolean;
}

// ─── Query: estado de la integración ───────────────────────────────────────
export function useHubSpotIntegration() {
  return useQuery({
    queryKey: ['hubspot-integration'],
    queryFn: async (): Promise<HubSpotIntegration | null> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) return null;

      const { data, error } = await supabase
        .from('hubspot_integrations')
        .select(
          'id, company_id, hub_id, hub_domain, user_email, scopes, connected_at, last_sync_at, last_sync_status, last_sync_message, total_contacts_synced, auto_sync_enabled, sync_direction, access_token'
        )
        .eq('company_id', profile.company_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const { access_token, ...rest } = data;
      const isConnected = Boolean(access_token && access_token !== '');

      return {
        ...rest,
        is_connected: isConnected,
      } as HubSpotIntegration;
    },
    staleTime: 30 * 1000,
  });
}

// ─── Query: ¿tiene el addon activo? ────────────────────────────────────────
export function useHasHubSpotAddon() {
  return useQuery({
    queryKey: ['has-hubspot-addon'],
    queryFn: async (): Promise<boolean> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) return false;

      const { data, error } = await supabase.rpc('has_hubspot_sync_active', {
        p_company_id: profile.company_id,
      });

      if (error) {
        console.error('[useHasHubSpotAddon] error:', error);
        return false;
      }
      return data === true;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Mutación: conectar con Private App Token ──────────────────────────────
export function useConnectHubSpotWithToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (privateAppToken: string) => {
      const res = await fetch('/api/hubspot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ private_app_token: privateAppToken }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        // Preservar error_code para que la UI pueda mostrar mensajes específicos
        const err = new Error(data?.error ?? 'Error al conectar') as Error & {
          code?: string;
        };
        err.code = data?.error_code;
        throw err;
      }

      return data as {
        ok: true;
        portal_id: string;
        account_type?: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-integration'] });
    },
  });
}

// ─── Mutación: sincronizar ahora ───────────────────────────────────────────
export function useSyncHubSpot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hubspot/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error ?? data?.message ?? 'Error sincronizando');
      }

      return data as {
        ok: true;
        synced: number;
        updated: number;
        errors: number;
        message: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-integration'] });
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// ─── Mutación: desconectar ─────────────────────────────────────────────────
export function useDisconnectHubSpot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hubspot/disconnect', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? 'Error desconectando');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-integration'] });
    },
  });
}

// ─── Mutación: actualizar settings ─────────────────────────────────────────
export function useUpdateHubSpotSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: {
      auto_sync_enabled?: boolean;
      sync_direction?: 'pull' | 'push' | 'bidirectional';
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error('No autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) throw new Error('Sin company');

      const { error } = await supabase
        .from('hubspot_integrations')
        .update(patch)
        .eq('company_id', profile.company_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-integration'] });
    },
  });
}
