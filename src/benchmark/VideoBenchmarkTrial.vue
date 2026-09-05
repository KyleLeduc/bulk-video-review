<script setup lang="ts">
import { ref, watch } from 'vue'
import { useVideoStore } from '../presentation/stores/videosStore'
import type { DatabaseConnection } from '../infrastructure/database/DatabaseConnection'
import type { createVideoServices } from '../infrastructure/di/createVideoServices'
import { VideoPreviewRepository } from '../infrastructure/repository/VideoPreviewRepository'
import { pipelineSettled, type TrialResult } from './videoBenchmarkHost'
import {
  validateMeasurements,
  validateReport,
  validateTerminalReport,
  validPreviewTimestamps,
  type TrialConfiguration,
  type BuildIdentity,
} from '../shared/benchmark/videoBenchmarkProtocol'
import reference from '../shared/benchmark/referenceFixtures.json'

const props = defineProps<{
  connection: DatabaseConnection
  services: ReturnType<typeof createVideoServices>
  configuration: TrialConfiguration
  build: BuildIdentity
}>()
const store = useVideoStore()
const label = ref('Ready for isolated trial')
const expected = {
  ...reference.expected,
  acceptedBytes: reference.files.reduce((total, file) => total + file.bytes, 0),
}

async function run(files: File[]): Promise<TrialResult> {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  store.setIngestionConcurrencyOverride(props.configuration.foreground)
  store.setThumbnailConcurrencyOverride(props.configuration.previews)
  let hidden = document.hidden
  const visibility = () => {
    hidden ||= document.hidden
  }
  document.addEventListener('visibilitychange', visibility)
  label.value = 'Running ingestion and background previews…'
  const start = performance.now()
  try {
    await store.addVideosFromFiles(transfer.files)
    if (!pipelineSettled(store.displayedIngestionSession)) {
      await new Promise<void>((resolve, reject) => {
        const stop = watch(
          () =>
            [
              pipelineSettled(store.displayedIngestionSession),
              store.displayedIngestionSession?.status,
            ] as const,
          ([settled, status]) => {
            if (settled) {
              stop()
              resolve()
            } else if (status === 'failed') {
              stop()
              reject(new Error('Ingestion failed'))
            }
          },
          { flush: 'sync' },
        )
      })
    }
    const wallMs = performance.now() - start
    label.value = 'Timing complete; checking persisted outputs…'
    const report = store.createDisplayedIngestionRunReport()
    const errors: string[] = []
    try {
      errors.push(
        ...validateTerminalReport(report, props.configuration.cache, expected),
        ...validateReport(report, props.configuration.cache, expected),
        ...validateMeasurements(report, props.configuration, expected),
      )
    } catch {
      errors.push('Missing or malformed terminal report')
    }
    const outputErrors: string[] = []
    const previews = new VideoPreviewRepository(props.connection)
    const images: Blob[] = []
    let frames = 0
    let imageBytes = 0
    let persistedCount = 0
    try {
      const persisted = await props.services.videoQueryAdapter.getAllVideos()
      persistedCount = persisted.length
      if (
        persisted.length !== expected.supported ||
        store.allVideos.length !== expected.supported
      )
        outputErrors.push('Persisted video count mismatch')
      for (const video of store.allVideos) {
        const saved = persisted.find((item) => item.id === video.id)
        if (
          !saved ||
          saved.thumb !== video.thumb ||
          saved.duration !== video.duration ||
          saved.votes !== 0 ||
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        )
          outputErrors.push('Persisted metadata mismatch')
        if (!saved?.thumb.startsWith('data:image/jpeg;base64,'))
          outputErrors.push('Invalid persisted JPEG primary thumbnail')
        const storedFrames = await previews.getFrames(video.id)
        if (storedFrames.length !== 9 || video.previewFrames.length !== 9)
          outputErrors.push('Persisted preview count mismatch')
        if (
          !validPreviewTimestamps(
            storedFrames.map((frame) => frame.timestampSeconds),
            video.duration,
          )
        )
          outputErrors.push(
            'Preview timestamps differ from DOM selection targets',
          )
        for (const frame of storedFrames) {
          frames++
          if (
            !Number.isFinite(frame.timestampSeconds) ||
            frame.timestampSeconds > video.duration ||
            frame.width <= 0 ||
            frame.height <= 0 ||
            !(frame.blob instanceof Blob) ||
            frame.blob.type !== 'image/jpeg' ||
            !frame.blob.size
          )
            outputErrors.push('Invalid preview descriptor')
          try {
            const bitmap = await createImageBitmap(frame.blob)
            try {
              if (
                bitmap.width !== frame.width ||
                bitmap.height !== frame.height
              )
                outputErrors.push('Decoded preview dimensions mismatch')
            } finally {
              bitmap.close()
            }
          } catch {
            outputErrors.push('Preview image failed to decode')
          }
          imageBytes += frame.blob.size
          if (imageBytes <= 16 * 1024 * 1024) images.push(frame.blob)
        }
      }
    } catch {
      outputErrors.push('Persisted output inspection failed')
    }
    if (frames !== expected.supported * 9)
      outputErrors.push('Total preview count mismatch')
    if (imageBytes > 16 * 1024 * 1024) {
      images.length = 0
      outputErrors.push(
        'Inspection image limit exceeded; complete counts retained',
      )
    }
    if (hidden) errors.push('Document became hidden')
    errors.push(...outputErrors)
    label.value = errors.length
      ? 'Trial invalid; evidence retained'
      : 'Trial complete; outputs checked'
    return {
      row: {
        configuration: props.configuration,
        build: props.build,
        status: errors.length ? 'failed' : 'passed',
        cleanup: 'pending',
        hidden,
        wallMs,
        report,
        outputs: {
          valid: outputErrors.length === 0,
          videos: persistedCount,
          frames,
          errors: outputErrors,
        },
        errors,
      },
      images,
    }
  } finally {
    document.removeEventListener('visibilitychange', visibility)
  }
}

function close() {
  for (const video of [...store.allVideos]) store.removeVideo(video.id)
  store.$dispose()
  props.connection.close()
}
defineExpose({ run, close })
</script>
<template>
  <p role="status">
    Repeat {{ configuration.repetition }} · DOM
    {{ configuration.foreground }}/{{ configuration.previews }} ·
    {{ configuration.cache === 'cold' ? 'fresh' : 'cached' }} · {{ label }}
  </p>
</template>
