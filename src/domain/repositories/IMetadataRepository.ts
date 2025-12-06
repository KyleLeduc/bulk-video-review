import type { MetadataEntity } from '../entities'

export interface IMetadataRepository {
  getMetadata(id: string): Promise<MetadataEntity | undefined>
  getAllMetadata(): Promise<MetadataEntity[]>
  upsertMetadata(data: MetadataEntity): Promise<MetadataEntity>
  deleteMetadata(id: string): Promise<void>
}
