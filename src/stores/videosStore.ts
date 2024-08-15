import type { ParsedVideo } from '@/types'
import { applyFilters } from '@/services'
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
    sortByPinned: ({ _videos }): ParsedVideo[] => {
      return [..._videos.values()].sort(
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
  },
})
