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

    return filterVideosUseCase.execute(sortByPinned.value, {
      minDuration: minDurationFilter,
    })
  })

  function addVideos(videos: ParsedVideo[]) {
    videos.forEach((video) => {
      videoMap.set(video.id, video)
    })
  }

  function removeVideo(videoId: string) {
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
    for await (const video of addVideosUseCase.execute(files)) {
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

  return {
    minDuration,
    filteredVideos,
    sortByPinned,
    sortByVotes,
    addVideos,
    addVideosFromFiles,
    removeVideo,
    removeAllUnpinned,
    setMinDuration,
    togglePinVideo,
    updateVideoThumbnails,
    updateVotes,
  }
})
