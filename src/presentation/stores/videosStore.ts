import type { ParsedVideo } from '@domain/entities'
import { defineStore } from 'pinia'
import { computed, inject, reactive, ref, toRaw } from 'vue'
import type {
  AddVideosFromFilesUseCase,
  FilterVideosUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
} from '@app/usecases'
import type { ILogger } from '@app/ports'
import type { VideoImportItem } from '@domain/valueObjects'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
} from '@presentation/di/injectionKeys'

function resolveDependency<T>(dependency: T | undefined, name: string): T {
  if (!dependency) {
    throw new Error(`${name} dependency is missing`)
  }

  return dependency
}

export const useVideoStore = defineStore('videos', () => {
  const addVideosUseCase = resolveDependency<AddVideosFromFilesUseCase>(
    inject(ADD_VIDEOS_USE_CASE_KEY),
    'AddVideosUseCase',
  )

  const filterVideosUseCase = resolveDependency<FilterVideosUseCase>(
    inject(FILTER_VIDEOS_USE_CASE_KEY),
    'FilterVideosUseCase',
  )

  const updateThumbUseCase = resolveDependency<UpdateVideoThumbnailsUseCase>(
    inject(UPDATE_THUMB_USE_CASE_KEY),
    'UpdateVideoThumbnailsUseCase',
  )

  const updateVotesUseCase = resolveDependency<UpdateVideoVotesUseCase>(
    inject(UPDATE_VOTES_USE_CASE_KEY),
    'UpdateVideoVotesUseCase',
  )

  const logger = resolveDependency<ILogger>(inject(LOGGER_KEY), 'Logger')

  const videoMap = reactive(new Map<string, ParsedVideo>())
  const minDuration = ref(0)
  const maxDuration = ref(0)
  const searchQuery = ref('')

  function revokeVideoUrl(url: string) {
    if (!url.startsWith('blob:')) {
      return
    }

    const revoke = (
      URL as unknown as { revokeObjectURL?: (url: string) => void }
    ).revokeObjectURL
    if (typeof revoke !== 'function') {
      return
    }

    try {
      revoke(url)
    } catch (error) {
      logger.error('Failed to revoke object URL', error)
    }
  }

  const sortByVotes = computed<ParsedVideo[]>(() =>
    Array.from(videoMap.values()).sort(
      (a, b) => Number(b.votes) - Number(a.votes),
    ),
  )

  const sortByPinned = computed<ParsedVideo[]>(() =>
    [...sortByVotes.value].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
  )

  const filteredVideos = computed<ParsedVideo[]>(() => {
    const minDurationFilter =
      minDuration.value > 0 ? minDuration.value * 60 : undefined
    const maxDurationFilter =
      maxDuration.value > 0 ? maxDuration.value * 60 : undefined
    const normalizedSearchQuery = searchQuery.value.trim() || undefined

    return filterVideosUseCase.execute({
      videos: sortByPinned.value,
      options: {
        minDurationSeconds: minDurationFilter,
        maxDurationSeconds: maxDurationFilter,
        searchQuery: normalizedSearchQuery,
      },
    })
  })

  function addVideos(videos: ParsedVideo[]) {
    videos.forEach((video) => {
      const existing = toRaw(videoMap.get(video.id))
      if (existing) {
        revokeVideoUrl(video.url)
        return
      }

      videoMap.set(video.id, video)
    })
  }

  function removeVideo(videoId: string) {
    const existing = toRaw(videoMap.get(videoId))
    if (existing) {
      revokeVideoUrl(existing.url)
    }

    videoMap.delete(videoId)
  }

  function togglePinVideo(videoId: string) {
    const video = videoMap.get(videoId)

    if (video) {
      video.pinned = !video.pinned
    }
  }

  function removeAllUnpinned() {
    const pinnedVideos = Array.from(videoMap.entries()).filter(
      ([, video]) => video.pinned,
    )

    Array.from(videoMap.values())
      .filter((video) => !video.pinned)
      .forEach((video) => {
        revokeVideoUrl(video.url)
      })

    videoMap.clear()

    pinnedVideos.forEach(([id, video]) => {
      videoMap.set(id, video)
    })
  }

  async function updateVotes(videoId: string, delta: number) {
    const video = videoMap.get(videoId)
    if (!video) {
      return
    }

    try {
      const votes = await updateVotesUseCase.execute(videoId, delta)
      if (votes != null) {
        video.votes = votes
      }
    } catch (error) {
      logger.error('Failed to update votes', error)
    }
  }

  async function addVideosFromFiles(files: FileList) {
    const items: VideoImportItem[] = Array.from(files).map((file) => ({ file }))

    for await (const video of addVideosUseCase.execute(items)) {
      addVideos([video])
    }
  }

  async function updateVideoThumbnails(id: string) {
    const existing = toRaw(videoMap.get(id))
    if (!existing) {
      return
    }

    const updated = await updateThumbUseCase.execute(existing)
    videoMap.set(id, updated)
  }

  function setMinDuration(value: number) {
    minDuration.value = value >= 0 ? value : 0
  }

  function setMaxDuration(value: number) {
    maxDuration.value = value >= 0 ? value : 0
  }

  function setSearchQuery(value: string) {
    searchQuery.value = value
  }

  return {
    minDuration,
    maxDuration,
    searchQuery,
    filteredVideos,
    sortByPinned,
    sortByVotes,
    addVideos,
    addVideosFromFiles,
    removeVideo,
    removeAllUnpinned,
    setMinDuration,
    setMaxDuration,
    setSearchQuery,
    togglePinVideo,
    updateVideoThumbnails,
    updateVotes,
  }
})
