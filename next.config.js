/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fija la raíz del workspace para Turbopack -- sin esto, Next.js sube
  // carpeta por carpeta buscando un lockfile y en la PC de Rubén encuentra
  // un pnpm-lock.yaml suelto en C:\Users\Usuario (fuera de este repo, de
  // otro proyecto), lo que dispara el warning "multiple lockfiles" y puede
  // resolver imports/paquetes con el directorio equivocado.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

module.exports = nextConfig
