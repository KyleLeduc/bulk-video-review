import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

import '@presentation/assets/main.css'

import {
  addVideosUseCase,
  eventPublisher,
  filterVideosUseCase,
  logger,
  updateThumbUseCase,
  updateVotesUseCase,
  videoQueryAdapter,
  wipeVideoDataUseCase,
} from '@infra/di/container'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
} from '@presentation/di/injectionKeys'

const app = createApp(App)

app.use(createPinia())
app.use(autoAnimatePlugin)

app.provide(ADD_VIDEOS_USE_CASE_KEY, addVideosUseCase)
app.provide('addVideosUseCase', addVideosUseCase)
app.provide('eventPublisher', eventPublisher)
app.provide(FILTER_VIDEOS_USE_CASE_KEY, filterVideosUseCase)
app.provide('filterVideosUseCase', filterVideosUseCase)
app.provide(LOGGER_KEY, logger)
app.provide('logger', logger)
app.provide(UPDATE_THUMB_USE_CASE_KEY, updateThumbUseCase)
app.provide('updateThumbUseCase', updateThumbUseCase)
app.provide(UPDATE_VOTES_USE_CASE_KEY, updateVotesUseCase)
app.provide('updateVotesUseCase', updateVotesUseCase)
app.provide('videoQueryAdapter', videoQueryAdapter)
app.provide('wipeVideoDataUseCase', wipeVideoDataUseCase)

app.mount('#app')
