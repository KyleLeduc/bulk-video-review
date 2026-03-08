type PlayableVideoType = {
  mimeType: string
  extensions: string[]
}

const PLAYABLE_VIDEO_TYPE_CANDIDATES: PlayableVideoType[] = [
  {
    mimeType: 'video/mp4',
    extensions: ['.mp4', '.m4v'],
  },
  {
    mimeType: 'video/webm',
    extensions: ['.webm'],
  },
  {
    mimeType: 'video/ogg',
    extensions: ['.ogv', '.ogg'],
  },
  {
    mimeType: 'video/quicktime',
    extensions: ['.mov', '.qt'],
  },
  {
    mimeType: 'video/x-matroska',
    extensions: ['.mkv'],
  },
]

const normalizeMimeType = (value: string): string =>
  value.split(';')[0]?.trim().toLowerCase() ?? ''

const isGenericMimeType = (value: string): boolean =>
  value === '' ||
  value === 'application/octet-stream' ||
  value === 'binary/octet-stream'

const getFileExtension = (name: string): string => {
  const lastDotIndex = name.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ''
  }

  return name.slice(lastDotIndex).toLowerCase()
}

const createVideoProbe = (): HTMLVideoElement | null => {
  if (typeof document === 'undefined') {
    return null
  }

  return document.createElement('video')
}

export const getBrowserPlayableVideoTypes = (): PlayableVideoType[] => {
  const video = createVideoProbe()
  if (!video || typeof video.canPlayType !== 'function') {
    return []
  }

  return PLAYABLE_VIDEO_TYPE_CANDIDATES.filter(({ mimeType }) =>
    Boolean(video.canPlayType(mimeType)),
  )
}

export const getBrowserPlayableVideoAccept = (): string =>
  getBrowserPlayableVideoTypes()
    .flatMap(({ mimeType, extensions }) => [mimeType, ...extensions])
    .join(',')

export const isBrowserPlayableVideoFile = (file: File): boolean => {
  const playableTypes = getBrowserPlayableVideoTypes()
  if (!playableTypes.length) {
    return false
  }

  const normalizedMimeType = normalizeMimeType(file.type)
  if (!isGenericMimeType(normalizedMimeType)) {
    return playableTypes.some(
      ({ mimeType }) => mimeType === normalizedMimeType,
    )
  }

  const extension = getFileExtension(file.name)

  return playableTypes.some(({ extensions }) => extensions.includes(extension))
}
