export class ParsedVideoData {
  constructor(
    public readonly id: string,
    public readonly thumbUrls: string[] = [],
    public thumbUrl: string = '',
    public duration: number = 0,
    public url: string = '',
  ) {}
}
