export function useDebounce(fn: Function, wait = 1000) {
  let timeout: NodeJS.Timeout

  const debouncedFn = (...args: any) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      fn(...args)
    }, wait)
  }

  return debouncedFn
}

export function useDebounceMaxWait(fn: Function, wait = 1000, maxWait = 3000) {
  // TODO Needs Testing
  let timeout: NodeJS.Timeout
  let lastCallTime = Date.now()

  const debouncedFn = (...args: any) => {
    const now = Date.now()
    if (lastCallTime - now < maxWait) {
      fn(...args)
      lastCallTime = Date.now()
    }
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      fn(...args)
    }, wait)
  }

  return debouncedFn
}
