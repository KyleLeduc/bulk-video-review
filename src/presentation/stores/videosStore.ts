import type { ParsedVideo } from '@domain/entities'
import { defineStore } from 'pinia'
import { toRaw } from 'vue'

import {
  addVideosUseCase,
  filterVideosUseCase,
  updateThumbUseCase,
  updateVotesUseCase,
  logger,
} from '@infra/di/container'

interface State {
  _videos: Map<string, ParsedVideo>
  _minDuration: number
}

export const useVideoStore = defineStore('videos', {
  state: (): State => {
    return {
      _videos: new Map<string, ParsedVideo>(),

      _minDuration: 0,
    }
  },
  getters: {
    sortByVotes: ({ _videos }): ParsedVideo[] => {
      return [..._videos.values()].sort(
        (a, b) => Number(b.votes) - Number(a.votes),
      )
    },
    sortByPinned(): ParsedVideo[] {
      return this.sortByVotes.sort(
        (a, b) => Number(b.pinned) - Number(a.pinned),
      )
    },

    filteredVideos(state): ParsedVideo[] {
      const filteredVideos = filterVideosUseCase.execute(this.sortByPinned, {
        minDuration: state._minDuration,
      })

      return filteredVideos
    },
  },

  actions: {
    addVideos(videos: ParsedVideo[]) {
      videos.forEach((video) => {
        this._videos.set(video.id, video)
      })
    },

    removeVideo(videoId: string) {
      this._videos.delete(videoId)
    },

    togglePinVideo(videoId: string) {
      const video = this._videos.get(videoId)

      if (video) video.pinned = !video.pinned
    },

    removeAllUnpinned() {
      const filteredVideos = new Map()
      this._videos.forEach((video) => {
        if (video.pinned) filteredVideos.set(video.id, video)
      })

      this._videos = filteredVideos
    },

    async updateVotes(videoId: string, delta: number) {
      const video = this._videos.get(videoId)
      if (!video) return
      try {
        const votes = await updateVotesUseCase.execute(videoId, delta)
        if (votes != null) {
          video.votes = votes
        }
      } catch (e) {
        logger.error('Failed to update votes', e)
      }
    },

    async addVideosFromFiles(files: FileList) {
      for await (const video of addVideosUseCase.execute(files)) {
        this.addVideos([video])
      }
    },

    async updateVideoThumbnails(id: string) {
      const existing = toRaw(this._videos.get(id))
      if (!existing) return
      const updated = await updateThumbUseCase.execute(existing)
      this._videos.set(id, updated)
    },
  },
})
