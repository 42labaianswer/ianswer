import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MP3_SAMPLE_RATE, audioUrlToMp3, codificarMp3, descargarBlob, mezclarAMonoInt16, nombreAudioMp3,
} from './audioToMp3'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const tono = (segundos: number, rate = MP3_SAMPLE_RATE) =>
  Float32Array.from({ length: segundos * rate }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5)

/** Cuenta los frames MPEG-1 Layer III válidos recorriendo sus cabeceras. */
function framesMp3(bytes: Uint8Array, rate: number) {
  const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  let frames = 0
  for (let i = 0; i < bytes.length - 2;) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      const kbps = KBPS[bytes[i + 2] >> 4]
      if (kbps) {
        frames++
        i += Math.floor((144 * kbps * 1000) / rate) + ((bytes[i + 2] >> 1) & 1)
        continue
      }
    }
    i++
  }
  return frames
}

describe('mezclarAMonoInt16', () => {
  it('promedia los canales y escala a 16 bits', () => {
    const mono = mezclarAMonoInt16([Float32Array.from([1, 0, -1]), Float32Array.from([0, 0, -1])])
    expect(Array.from(mono)).toEqual([16383, 0, -32767])
  })

  it('recorta valores fuera de [-1, 1]', () => {
    expect(Array.from(mezclarAMonoInt16([Float32Array.from([2, -3])]))).toEqual([32767, -32767])
  })

  it('sin canales devuelve un arreglo vacío', () => {
    expect(mezclarAMonoInt16([])).toHaveLength(0)
  })
})

describe('codificarMp3', () => {
  it('2 s de audio dan un MP3 de ~2 s a 64 kbps', async () => {
    const blob = await codificarMp3(mezclarAMonoInt16([tono(2)]), MP3_SAMPLE_RATE)
    expect(blob.type).toBe('audio/mpeg')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const segundos = (framesMp3(bytes, MP3_SAMPLE_RATE) * 1152) / MP3_SAMPLE_RATE
    expect(segundos).toBeGreaterThan(1.9)
    expect(segundos).toBeLessThan(2.2)
    expect((bytes.length * 8) / 2 / 1000).toBeCloseTo(64, -1)
  })
})

describe('audioUrlToMp3', () => {
  const stubAudioContext = (canales: Float32Array[]) => {
    const close = vi.fn().mockResolvedValue(undefined)
    class FakeAudioContext {
      constructor(public opts: { sampleRate: number }) {}
      decodeAudioData = vi.fn().mockResolvedValue({
        numberOfChannels: canales.length,
        sampleRate: MP3_SAMPLE_RATE,
        getChannelData: (i: number) => canales[i],
      })
      close = close
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    return { close }
  }

  it('descarga, decodifica y devuelve un MP3', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    const { close } = stubAudioContext([tono(1), tono(1)])
    const blob = await audioUrlToMp3('https://x/audio.ogg')
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBeGreaterThan(0)
    expect(close).toHaveBeenCalled()
  })

  it('falla si el audio no se puede leer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(audioUrlToMp3('https://x/no.ogg')).rejects.toThrow('404')
  })
})

describe('nombreAudioMp3', () => {
  it('usa la fecha del mensaje', () => {
    const d = new Date(2026, 10, 26, 9, 5)
    expect(nombreAudioMp3(d.toISOString())).toBe('audio-20261126-0905.mp3')
  })

  it('sin fecha usa la actual', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4))
    expect(nombreAudioMp3()).toBe('audio-20260102-0304.mp3')
  })
})

describe('descargarBlob', () => {
  it('crea un enlace con el nombre, lo pulsa y libera la URL', () => {
    vi.useFakeTimers()
    const a = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const appendChild = vi.fn()
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild } })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')

    descargarBlob(new Blob(['x']), 'audio.mp3')
    expect(a.download).toBe('audio.mp3')
    expect(a.href).toBe('blob:x')
    expect(appendChild).toHaveBeenCalledWith(a)
    expect(a.click).toHaveBeenCalled()
    expect(a.remove).toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
