 
import { loadPlatformBranding } from '../lib/siteSettings'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { supabase } from "../lib/supabase";
import Providers from "../components/Providers";
import ThemeScript from "../components/ThemeScript";
  const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma'
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Datos frescos + sin bloqueo de bots (soluciona el 403 en redes sociales)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await supabase
    .from('platform_settings')
    .select('name, description, favicon_url, icon_url, og_image_url, logo_url')
    .eq('id', 1)
    .single();

  const titleFromDb = data?.name || "{brandName}";
  const descFromDb = data?.description || "Asistente IA conversacional para tu negocio.";

  const faviconUrl = data?.favicon_url || data?.icon_url || data?.logo_url || "";
  const appleIconUrl = data?.icon_url || data?.logo_url || "";
  const ogImageUrl = data?.og_image_url || data?.logo_url || "";

  return {
    title: {
      default: titleFromDb,
      template: `%s | ${titleFromDb}`,
    },
    description: descFromDb,
    icons: faviconUrl ? {
      icon: [
        {
          url: faviconUrl,
          type: faviconUrl.includes('.ico') ? 'image/x-icon' : 'image/png',
        }
      ],
      shortcut: [faviconUrl],
      apple: [appleIconUrl],
    } : undefined,
    openGraph: {
      title: titleFromDb,
      description: descFromDb,
      siteName: titleFromDb,
      images: ogImageUrl ? [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          width: 1200,
          height: 630,
          alt: titleFromDb
        }
      ] : [],
      locale: 'es_MX',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: titleFromDb,
      description: descFromDb,
      images: ogImageUrl ? [ogImageUrl] : [],
    }
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
        <meta name="facebook-domain-verification" content="wyxknrv6ais452d4bqn7recm3pwz8w" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
