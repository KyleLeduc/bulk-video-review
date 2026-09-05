/* eslint-env browser */
// Paste this whole file into DevTools in a disposable BVR profile.
// No file contents, names, storage or network access. Not shipped in the app.
;(() => {
  if (window.bvrVideoProbe) throw new Error('BVR probe already installed')
  let stopActive = null

  window.bvrVideoProbe = {
    arm() {
      if (stopActive) throw new Error('BVR probe already armed')
      let result = null
      let startedAt = 0
      let stoppedAt = Number.POSITIVE_INFINITY
      let previousFrameAt = 0
      let frameId = 0
      let observer = null

      const consumeLongTasks = (entries) => {
        for (const entry of entries) {
          // The selection handler can sit inside a task that began earlier.
          const overlapMs =
            Math.min(entry.startTime + entry.duration, stoppedAt) -
            Math.max(entry.startTime, startedAt)
          if (overlapMs <= 0) continue
          result.longTasks.count += 1
          result.longTasks.totalMs += overlapMs
          result.longTasks.maxMs = Math.max(result.longTasks.maxMs, overlapMs)
        }
      }
      const onVisibilityChange = () => {
        if (result && document.visibilityState !== 'visible')
          result.hiddenDuringRun = true
      }
      const onFrame = () => {
        const now = performance.now()
        result.animationFrames.count += 1
        result.animationFrames.maxGapMs = Math.max(
          result.animationFrames.maxGapMs,
          now - previousFrameAt,
        )
        previousFrameAt = now
        if (result.firstVisibleThumbnailMs === null) {
          const visible = [
            ...document.querySelectorAll('.card img.thumb'),
          ].some((image) => {
            const bounds = image.getBoundingClientRect()
            return (
              image.complete &&
              image.naturalWidth > 0 &&
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.bottom > 0 &&
              bounds.right > 0 &&
              bounds.top < window.innerHeight &&
              bounds.left < window.innerWidth
            )
          })
          if (visible) result.firstVisibleThumbnailMs = now - startedAt
        }
        frameId = window.requestAnimationFrame(onFrame)
      }
      const onSelection = (event) => {
        if (!event.target?.matches?.('input[type="file"]')) return
        document.removeEventListener('change', onSelection, true)
        startedAt = performance.now()
        previousFrameAt = startedAt
        const supported =
          window.PerformanceObserver?.supportedEntryTypes?.includes(
            'longtask',
          ) ?? false
        result = {
          elapsedMs: 0,
          firstVisibleThumbnailMs: null,
          hiddenDuringRun: document.visibilityState !== 'visible',
          longTasks: { supported, count: 0, totalMs: 0, maxMs: 0 },
          animationFrames: { count: 0, maxGapMs: 0 },
        }
        if (supported) {
          observer = new window.PerformanceObserver((list) =>
            consumeLongTasks(list.getEntries()),
          )
          observer.observe({ type: 'longtask' })
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        frameId = window.requestAnimationFrame(onFrame)
      }

      // Capture phase precedes the application's file-change handler.
      document.addEventListener('change', onSelection, true)
      stopActive = () => {
        stoppedAt = performance.now()
        document.removeEventListener('change', onSelection, true)
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.cancelAnimationFrame(frameId)
        if (observer) {
          consumeLongTasks(observer.takeRecords())
          observer.disconnect()
        }
        if (result) result.elapsedMs = stoppedAt - startedAt
        return result
      }
    },
    stop() {
      const stop = stopActive
      stopActive = null
      return stop ? stop() : null
    },
  }
})()
