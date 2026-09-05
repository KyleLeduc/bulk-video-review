fetch('/benchmark/capabilities', { cache: 'no-store' })
  .then(async (response) => {
    if (!response.ok || !(await response.json()).enabled)
      throw new Error('Benchmark unavailable')
    document.querySelector('#trial')!.textContent =
      'Isolated trial host enabled.'
  })
  .catch(() => {
    document.querySelector('#trial')!.textContent = 'Benchmark unavailable'
  })
export {}
