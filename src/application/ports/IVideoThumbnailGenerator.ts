export interface IVideoThumbnailGenerator {
  generateThumbnails(url: string, count?: number): Promise<string[]>
}
