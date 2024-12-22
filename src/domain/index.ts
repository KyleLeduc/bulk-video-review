import { storeNames } from './constants'
import type { IMetadataRepository } from './repositories/IMetadataRepository'
import type { MetadataEntity } from './entities/Metadata'
import type { VideoEntity } from './entities/Video'
import type { IVideoRepository } from './repositories/IVideoRepository'
import { FileVideoParser } from './services/FileVideoParser'

export { storeNames }
export type { IMetadataRepository, MetadataEntity }
export type { IVideoRepository, VideoEntity }
export { FileVideoParser }

import type { Thumbs } from './valueObjects/Thumbs'
import type { ParsedVideo } from './entities/ParsedVideo'
import type { VideoStorageDto } from './entities/VideoStorageDto'

export type { Thumbs, ParsedVideo, VideoStorageDto }
