fetch('/benchmark/capabilities', { cache: 'no-store' })
  .then(async (response) => {
    const capabilities = response.ok ? await response.json() : null
    if (capabilities?.enabled !== true || capabilities.protocolVersion !== 2)
      throw new Error('Benchmark unavailable')
    const [{ createApp }, { default: View }] = await Promise.all([
      import('vue'),
      import('./VideoBenchmarkView.vue'),
    ])
    const capable =
      window.isSecureContext &&
      Boolean(
        navigator.locks && window.indexedDB && window.crypto?.randomUUID,
      ) &&
      typeof DataTransfer === 'function' &&
      typeof createImageBitmap === 'function' &&
      /Chrome\/|Edg\//.test(navigator.userAgent)
    createApp(View, { build: capabilities.build, capable }).mount('#benchmark')
  })
  .catch(() => {
    document.querySelector('#benchmark')!.textContent = 'Benchmark unavailable'
  })
export {}
