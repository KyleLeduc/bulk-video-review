import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

import '@presentation/assets/main.css'

import {
  addVideosUseCase,
  filterVideosUseCase,
  logger,
  updateThumbUseCase,
  updateVotesUseCase,
  videoSessionRegistry,
  wipeVideoDataUseCase,
} from '@infra/di/container'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
  VIDEO_SESSION_REGISTRY_KEY,
  WIPE_VIDEO_DATA_USE_CASE_KEY,
} from '@presentation/di/injectionKeys'

const app = createApp(App)

app.use(createPinia())
app.use(autoAnimatePlugin)

app.provide(ADD_VIDEOS_USE_CASE_KEY, addVideosUseCase)
app.provide(FILTER_VIDEOS_USE_CASE_KEY, filterVideosUseCase)
app.provide(LOGGER_KEY, logger)
app.provide(UPDATE_THUMB_USE_CASE_KEY, updateThumbUseCase)
app.provide(UPDATE_VOTES_USE_CASE_KEY, updateVotesUseCase)
app.provide(WIPE_VIDEO_DATA_USE_CASE_KEY, wipeVideoDataUseCase)
app.provide(VIDEO_SESSION_REGISTRY_KEY, videoSessionRegistry)

app.mount('#app')
