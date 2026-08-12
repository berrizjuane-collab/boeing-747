import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const evidenceDir = path.resolve(process.argv[2] ?? 'artifacts/final-visuals')
const reportPath = path.join(evidenceDir, 'visual-qa-report.json')
const videoPath = path.join(evidenceDir, 'meridian-complete-tour.webm')
const report = JSON.parse(await readFile(reportPath, 'utf8'))
const samples = report.videoTimeline?.samples

if (!Array.isArray(samples) || samples.length < 2) {
  throw new Error(`${reportPath} does not contain a usable video timeline`)
}

for (let index = 1; index < samples.length; index += 1) {
  if (samples[index].progress < samples[index - 1].progress || samples[index].seconds <= samples[index - 1].seconds) {
    throw new Error(`Video timeline is not strictly chronological at sample ${index}`)
  }
}

const clips = [
  { name: 'clip-01-exterior.mp4', start: 0.01, end: 0.3, duration: 6 },
  { name: 'clip-02-threshold.mp4', start: 0.38, end: 0.56, duration: 6 },
  { name: 'clip-03-interior-outro.mp4', start: 0.58, end: 0.96, duration: 7 },
]

function sampleAtOrAfter(progress) {
  return samples.find((sample) => sample.progress >= progress) ?? samples.at(-1)
}

const summary = []
for (const clip of clips) {
  const startSample = sampleAtOrAfter(clip.start)
  const endSample = sampleAtOrAfter(clip.end)
  const sourceDuration = endSample.seconds - startSample.seconds
  if (sourceDuration <= 0) throw new Error(`${clip.name} resolved to an empty source interval`)

  const speedFactor = clip.duration / sourceDuration
  const outputPath = path.join(evidenceDir, clip.name)
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      startSample.seconds.toFixed(3),
      '-i',
      videoPath,
      '-an',
      '-vf',
      `trim=start=0:duration=${sourceDuration.toFixed(3)},` +
        `setpts=${speedFactor.toFixed(10)}*(PTS-STARTPTS),fps=30`,
      '-c:v',
      'libx264',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${clip.name}: ${result.stderr || result.stdout || `exit ${result.status}`}`)
  }

  summary.push({
    name: clip.name,
    progress: [clip.start, clip.end],
    sourceSeconds: [startSample.seconds, endSample.seconds],
    outputDuration: clip.duration,
  })
}

console.log(JSON.stringify(summary, null, 2))
