import { Metadata } from 'next'
import LegalPage from '../../../../components/public/LegalPage'
import { loadLegalConfig } from '../../../../lib/legalConfig'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await loadLegalConfig()
  return {
    title: `Licencias de terceros · ${brandName}`,
    description: `Software de código abierto que ${brandName} usa y sus licencias.`
  }
}

const enlace = 'text-lime-700 font-bold hover:underline'

export default async function LicenciasPage() {
  const { brandName } = await loadLegalConfig()

  return (
    <LegalPage
      title="Licencias de terceros"
      description={`${brandName} usa software de código abierto. Aquí se listan los componentes que se envían a tu navegador bajo licencias que piden aviso.`}
      effectiveDate="26 de noviembre de 2026"
      sections={[
        {
          id: 'lamejs',
          title: 'lamejs (codificador MP3)',
          body: (
            <>
              <p>
                Para descargar las notas de voz en MP3, el panel convierte el audio en tu navegador con{' '}
                <strong>@breezystack/lamejs</strong>, una versión en JavaScript del codificador{' '}
                <a href="https://lame.sourceforge.io/" target="_blank" rel="noopener noreferrer" className={enlace}>LAME</a>.
              </p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Licencia: <strong>GNU Lesser General Public License v3.0 (LGPL-3.0)</strong>.</li>
                <li>
                  Texto de la licencia:{' '}
                  <a href="https://www.gnu.org/licenses/lgpl-3.0.html" target="_blank" rel="noopener noreferrer" className={enlace}>LGPL-3.0</a>
                  {' '}y la{' '}
                  <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer" className={enlace}>GPL-3.0</a>
                  {' '}que la complementa.
                </li>
                <li>
                  Código fuente:{' '}
                  <a href="https://github.com/shijinyu/lamejs" target="_blank" rel="noopener noreferrer" className={enlace}>github.com/shijinyu/lamejs</a>
                  {' '}(basado en{' '}
                  <a href="https://github.com/zhuker/lamejs" target="_blank" rel="noopener noreferrer" className={enlace}>github.com/zhuker/lamejs</a>).
                </li>
                <li>Versión usada: 1.2.7, sin modificaciones.</li>
              </ul>
              <p className="mt-3">
                La biblioteca se carga como un archivo independiente del resto de {brandName}, solo cuando descargas un audio, y
                puede reemplazarse por otra versión compatible sin cambiar nuestro código.
              </p>
            </>
          )
        }
      ]}
    />
  )
}
