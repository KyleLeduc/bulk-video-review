export class ParsedVideoData {
  constructor(
    public readonly thumbUrl: string,
    public readonly id: string,
    public readonly duration: number,
    public readonly url: string,
  ) {}
}
