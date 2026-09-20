export class TempWorkspace {
  private constructor(
    private readonly jobsRoot: FileSystemDirectoryHandle,
    readonly jobId: string,
    private readonly jobRoot: FileSystemDirectoryHandle
  ) {}

  static async create(jobId: string): Promise<TempWorkspace | null> {
    if (!navigator.storage?.getDirectory) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const app = await root.getDirectoryHandle("thiepn-convert", { create: true });
      const jobs = await app.getDirectoryHandle("jobs", { create: true });
      const job = await jobs.getDirectoryHandle(jobId, { create: true });
      return new TempWorkspace(jobs, jobId, job);
    } catch {
      return null;
    }
  }

  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    return this.jobRoot.getFileHandle(name, { create: true });
  }

  async writeBlob(name: string, blob: Blob): Promise<void> {
    const file = await this.getFileHandle(name);
    const writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
  }

  async readBlob(name: string): Promise<File> {
    const file = await this.jobRoot.getFileHandle(name);
    return file.getFile();
  }

  async cleanup(): Promise<void> {
    try {
      await this.jobsRoot.removeEntry(this.jobId, { recursive: true });
    } catch {}
  }
}
