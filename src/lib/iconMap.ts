 

// ============================================================================
// src/lib/iconMap.ts
// ----------------------------------------------------------------------------
// Mapea nombre de icono (string) a componente lucide-react. Usado por el CMS
// cuando el icono se guarda como texto en la DB.
// ============================================================================

import {
  Bot, Calendar, CreditCard, Users, MessageSquare, BellRing,
  Sparkles, Building2, Stethoscope, HeartPulse, Activity,
  ClipboardList, ShieldCheck, Zap, Laptop, BarChart3,
  Home, Utensils, UserSquare, Megaphone, ListChecks, Tag,
  Bell, Clock, Layers, PackageOpen, BookOpen, Rocket,
  Phone, Mail, MapPin, ArrowRight, Check, Globe,
  Settings, Plug, Eye, EyeOff, LayoutGrid, type LucideIcon
} from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  Bot, Calendar, CreditCard, Users, MessageSquare, BellRing,
  Sparkles, Building2, Stethoscope, HeartPulse, Activity,
  ClipboardList, ShieldCheck, Zap, Laptop, BarChart3,
  Home, Utensils, UserSquare, Megaphone, ListChecks, Tag,
  Bell, Clock, Layers, PackageOpen, BookOpen, Rocket,
  Phone, Mail, MapPin, ArrowRight, Check, Globe,
  Settings, Plug, Eye, EyeOff, LayoutGrid
}

export function getIcon(name?: string | null, fallback: LucideIcon = Sparkles): LucideIcon {
  if (!name) return fallback
  return ICON_MAP[name] || fallback
}
