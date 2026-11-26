// Convierte un audio (p. ej. las notas de voz .ogg/Opus de WhatsApp) a MP3 en
// el navegador: se decodifica con Web Audio y se codifica con lamejs. Mono a
// 64 kbps basta para voz y deja archivos chicos.

const KBPS = 64
const BLOQUE = 1152 // muestras por frame MP3
// decodeAudioData remuestrea a la tasa del contexto; 44.1 kHz es una de las
// que acepta lamejs (no acepta 96 kHz, que algunos equipos usan por defecto).
export const MP3_SAMPLE_RATE = 44100

/** Mezcla los canales a mono y pasa de float [-1, 1] a enteros de 16 bits. */
export function mezclarAMonoInt16(canales: Float32Array[]): Int16Array {
  const largo = canales[0]?.length ?? 0
  const mono = new Int16Array(largo)
  for (let i = 0; i < largo; i++) {
    let s = 0
    for (const c of canales) s += c[i]
    s /= canales.length
    mono[i] = Math.max(-1, Math.min(1, s)) * 0x7fff
  }
  return mono
}

/** Codifica muestras mono de 16 bits a MP3. lamejs se carga aparte, bajo demanda. */
export async function codificarMp3(mono: Int16Array, sampleRate: number): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const encoder = new Mp3Encoder(1, sampleRate, KBPS)
  const partes: BlobPart[] = []
  for (let i = 0; i < mono.length; i += BLOQUE) {
    const frame = encoder.encodeBuffer(mono.subarray(i, i + BLOQUE))
    if (frame.length) partes.push(new Uint8Array(frame))
  }
  const final = encoder.flush()
  if (final.length) partes.push(new Uint8Array(final))
  return new Blob(partes, { type: 'audio/mpeg' })
}

/** Decodifica cualquier audio que entienda el navegador y lo convierte a MP3. */
export async function audioAMp3(datos: ArrayBuffer): Promise<{ mp3: Blob; duracion: number }> {
  const ctx = new AudioContext({ sampleRate: MP3_SAMPLE_RATE })
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(datos)
  } finally {
    void ctx.close()
  }
  const canales = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const mp3 = await codificarMp3(mezclarAMonoInt16(canales), audio.sampleRate)
  return { mp3, duracion: audio.length / audio.sampleRate }
}

export async function audioUrlToMp3(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo leer el audio (${res.status})`)
  return (await audioAMp3(await res.arrayBuffer())).mp3
}

/** Nombre del archivo descargado: audio-AAAAMMDD-HHMM.mp3 con la fecha del mensaje. */
export function nombreAudioMp3(fecha?: string | null): string {
  const d = fecha ? new Date(fecha) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `audio-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mp3`
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
