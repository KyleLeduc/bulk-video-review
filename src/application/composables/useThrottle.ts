/**
 *
 * @param fn The function to be called
 * @param wait How long to wait before calling it again
 */
export function useThrottle(fn: Function, wait = 100) {
  let shouldWait = false
  let lastArgs: any
  let count = 0

  /**
   * wraps the provided function
   * called after the wait timer
   */
  const timeoutFn = () => {
    if (lastArgs == null) {
      /** stop recursion once throttle hasn't been called during timeout */

      /** clears the wait timeout */
      shouldWait = false
    } else {
      /** if lastFn still exists, call the function */
      fn(...lastArgs)
      console.log('timeout', count)
      count++
      /** clear lastFn to end the recursion */
      lastArgs = null
      setTimeout(timeoutFn, wait)
    }
  }

  return (...args: any) => {
    if (shouldWait) {
      /** If function was called within wait, save the last call */
      lastArgs = args
      return
    }

    /** call the function with the arguments */
    /** call it on the first press */
    fn(...args)
    console.log('timeout', count)
    count++
    /** tell it to wait */
    shouldWait = true

    /** starts timer to call the function after the wait */
    setTimeout(timeoutFn, wait)
  }
}

export function useThrottleTyped<T extends (...args: any[]) => T>(
  fn: T,
  wait = 100,
) {
  let shouldWait = false
  let lastArgs: any
  let count = 0

  /**
   * wraps the provided function
   * called after the wait timer
   */
  const timeoutFn = () => {
    if (lastArgs == null) {
      /** stop recursion once throttle hasn't been called during timeout */

      /** clears the wait timeout */
      shouldWait = false
    } else {
      /** if lastFn still exists, call the function */
      fn(...lastArgs)
      console.log('timeout', count)
      count++
      /** clear lastFn to end the recursion */
      lastArgs = null
      setTimeout(timeoutFn, wait)
    }
  }

  return (...args: Parameters<T>) => {
    if (shouldWait) {
      /** If function was called within wait, save the last call */
      lastArgs = args
      return
    }

    /** call the function with the arguments */
    /** call it on the first press */
    fn(...args)
    console.log('timeout', count)
    count++
    /** tell it to wait */
    shouldWait = true

    /** starts timer to call the function after the wait */
    setTimeout(timeoutFn, wait)
  }
}
