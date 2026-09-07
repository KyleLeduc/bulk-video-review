declare const __BVR_BUILD_IDENTITY__: {
  revision: string | null
  dirty: boolean | null
  source: string
}

export const BUILD_IDENTITY =
  typeof __BVR_BUILD_IDENTITY__ === 'undefined'
    ? { revision: null, dirty: null, source: 'unknown' }
    : __BVR_BUILD_IDENTITY__
