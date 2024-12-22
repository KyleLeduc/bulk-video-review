import type { MetadataEntity } from '../entities/Metadata'

export interface IMetadataRepository {
  getMetadata(id: string): Promise<MetadataEntity>
  getAllMetadata(): Promise<MetadataEntity[]>
  upsertMetadata(data: MetadataEntity): Promise<MetadataEntity>
  deleteMetadata(id: string): Promise<void>
}
