export interface InputSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  stream(): ReadableStream<Uint8Array>;
  slice(start?: number, end?: number): Blob;
}

export class BrowserFileSource implements InputSource {
  constructor(private readonly file: File) {}

  get name(): string { return this.file.name; }
  get size(): number { return this.file.size; }
  get type(): string { return this.file.type; }

  stream(): ReadableStream<Uint8Array> {
    return this.file.stream();
  }

  slice(start?: number, end?: number): Blob {
    return this.file.slice(start, end);
  }
}
