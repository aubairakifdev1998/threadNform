export class StoredFile {
  constructor(
    public readonly path: string,
    public readonly bucket: string,
    public readonly publicUrl: string | null,
    public readonly size: number | null,
    public readonly mimeType: string | null,
  ) {}
}
