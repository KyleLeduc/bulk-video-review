import type { ParsedVideo } from '@/types'
import { applyFilters, VideoMetadataService } from '@/application'
import { defineStore } from 'pinia'

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
      const filteredVideos = applyFilters(this.sortByPinned, {
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

    updateVotes(videoId: string, delta: number) {
      const video = this._videos.get(videoId)

      if (video) {
        const metadataService = VideoMetadataService.getInstance()
        metadataService
          .updateVotes(videoId, delta)
          .then((data) => {
            if (data) {
              video.votes = data.votes
            }
          })
          .catch((error) => {
            console.error('Failed to update video metadata:', error)
          })
      }
    },
  },
})
