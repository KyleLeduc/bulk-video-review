import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

import '@presentation/assets/main.css'

import {
  addVideosUseCase,
  updateThumbUseCase,
  updateVotesUseCase,
  wipeVideoDataUseCase,
} from '@app'

const app = createApp(App)

app.use(createPinia())
app.use(autoAnimatePlugin)

app.provide('addVideosUseCase', addVideosUseCase)
app.provide('updateThumbUseCase', updateThumbUseCase)
app.provide('updateVotesUseCase', updateVotesUseCase)
app.provide('wipeVideoDataUseCase', wipeVideoDataUseCase)

app.mount('#app')
