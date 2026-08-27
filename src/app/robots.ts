 

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
      },
      {
        userAgent: 'Facebot',
        allow: '/',
      },
      {
        userAgent: 'facebookcatalog',
        allow: '/',
      },
      {
        userAgent: 'WhatsApp',
        allow: '/',
      }
    ],
    // Opcional, pero ayuda al SEO si tienes sitemap
  }
}
