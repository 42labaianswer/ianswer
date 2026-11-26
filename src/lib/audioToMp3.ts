// Convierte un audio (p. ej. las notas de voz .ogg/Opus de WhatsApp) a MP3 en
// el navegador: se decodifica con Web Audio y se codifica con lamejs. Mono a
// 64 kbps basta para voz y deja archivos chicos.

const KBPS = 64
const BLOQUE = 1152 // muestras por frame MP3

export async function audioUrlToMp3(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo leer el audio (${res.status})`)
  const datos = await res.arrayBuffer()

  // decodeAudioData remuestrea a la tasa del contexto; 44.1 kHz es una de las
  // que acepta lamejs (no acepta 96 kHz, que algunos equipos usan por defecto).
  const ctx = new AudioContext({ sampleRate: 44100 })
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(datos)
  } finally {
    void ctx.close()
  }

  // Mezcla a mono y pasa de float [-1, 1] a enteros de 16 bits.
  const largo = audio.length
  const mono = new Int16Array(largo)
  const canales = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  for (let i = 0; i < largo; i++) {
    let s = 0
    for (const c of canales) s += c[i]
    s /= canales.length
    mono[i] = Math.max(-1, Math.min(1, s)) * 0x7fff
  }

  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const encoder = new Mp3Encoder(1, audio.sampleRate, KBPS)
  const partes: BlobPart[] = []
  for (let i = 0; i < largo; i += BLOQUE) {
    const frame = encoder.encodeBuffer(mono.subarray(i, i + BLOQUE))
    if (frame.length) partes.push(new Uint8Array(frame))
  }
  const final = encoder.flush()
  if (final.length) partes.push(new Uint8Array(final))
  return new Blob(partes, { type: 'audio/mpeg' })
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
