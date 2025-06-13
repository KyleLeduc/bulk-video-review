import type { VideoEntity } from '@domain/entities'
import type { MetadataEntity } from '@domain/entities'

export type VideoStorageDto = VideoEntity & MetadataEntity
