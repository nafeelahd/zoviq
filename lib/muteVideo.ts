import type { FFmpeg as FFmpegInstance } from '@ffmpeg/ffmpeg'

export async function muteVideo(file: File): Promise<File> {
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ])
  const ffmpeg: FFmpegInstance = new FFmpeg()
  const inputExtension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'video'
  const inputName = `input.${inputExtension}`
  const outputName = 'muted.mp4'

  try {
    const baseUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const result = await ffmpeg.exec([
      '-i', inputName,
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-an',
      '-movflags', '+faststart',
      outputName,
    ])
    if (result !== 0) throw new Error('Could not mute this video format')

    const output = await ffmpeg.readFile(outputName)
    if (typeof output === 'string') throw new Error('Video processing returned an invalid file')
    const outputBuffer = output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength
    ) as ArrayBuffer
    const mutedFile = new File([outputBuffer], file.name.replace(/\.[^.]+$/, '') + '-muted.mp4', {
      type: 'video/mp4',
    })
    if (!mutedFile.size) throw new Error('The muted video is empty')
    return mutedFile
  } finally {
    await ffmpeg.terminate()
  }
}
