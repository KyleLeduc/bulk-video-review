fetch('/benchmark/capabilities', { cache: 'no-store' })
  .then(async (response) => {
    if (!response.ok || !(await response.json()).enabled)
      throw new Error('Benchmark unavailable')
    document.querySelector('#benchmark')!.textContent =
      'Benchmark enabled; controls pending.'
  })
  .catch(() => {
    document.querySelector('#benchmark')!.textContent = 'Benchmark unavailable'
  })
export {}
