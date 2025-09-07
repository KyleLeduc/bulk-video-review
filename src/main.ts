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

const app = createApp(App)

app.use(createPinia())
app.use(autoAnimatePlugin)

app.provide('addVideosUseCase', addVideosUseCase)
app.provide('eventPublisher', eventPublisher)
app.provide('filterVideosUseCase', filterVideosUseCase)
app.provide('logger', logger)
app.provide('updateThumbUseCase', updateThumbUseCase)
app.provide('updateVotesUseCase', updateVotesUseCase)
app.provide('videoQueryAdapter', videoQueryAdapter)
app.provide('wipeVideoDataUseCase', wipeVideoDataUseCase)

app.mount('#app')
