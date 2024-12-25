import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

import '@presentation/assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(autoAnimatePlugin)

app.mount('#app')
