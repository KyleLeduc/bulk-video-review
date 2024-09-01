import type { MetadataEntity } from '../entities/Metadata'

export interface IMetadataRepository {
  getMetadata(id: string): Promise<MetadataEntity>
  upsertMetadata(data: MetadataEntity): Promise<MetadataEntity>
}
