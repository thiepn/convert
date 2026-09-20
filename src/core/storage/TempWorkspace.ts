export class TempWorkspace {
  private constructor(
    private readonly jobsRoot: FileSystemDirectoryHandle,
    readonly jobId: string,
    private readonly jobRoot: FileSystemDirectoryHandle,
    private readonly releaseLock: (()=>void)|null
  ) {}

  private static lockManager():any {
    return (globalThis.navigator as any)?.locks;
  }

  private static async acquireJobLock(jobId:string):Promise<(()=>void)|null> {
    const locks=this.lockManager();
    if(!locks?.request) return null;

    let release:(()=>void)|null=null;
    let acquired=false;
    let ready!:()=>void;
    const readyPromise=new Promise<void>(resolve=>{ready=resolve;});
    const hold=new Promise<void>(resolve=>{release=resolve;});

    void locks.request("thiepn-convert-job-"+jobId,{mode:"exclusive"},async()=>{
      acquired=true;
      ready();
      await hold;
    }).catch(()=>ready());

    await readyPromise;
    return acquired?release:null;
  }

  static async cleanupOrphanedJobs(): Promise<number> {
    if (!navigator.storage?.getDirectory) return 0;
    const locks=this.lockManager();
    if(!locks?.request) return 0;

    try {
      const root=await navigator.storage.getDirectory();
      const app=await root.getDirectoryHandle("thiepn-convert",{create:true});
      const jobs=await app.getDirectoryHandle("jobs",{create:true});
      let removed=0;

      for await (const [name] of (jobs as any).entries()) {
        await locks.request(
          "thiepn-convert-job-"+name,
          {mode:"exclusive",ifAvailable:true},
          async(lock:any)=>{
            if(!lock) return;
            try{
              await jobs.removeEntry(name,{recursive:true});
              removed++;
            }catch{}
          }
        );
      }
      return removed;
    } catch {
      return 0;
    }
  }

  static async create(jobId: string): Promise<TempWorkspace | null> {
    if (!navigator.storage?.getDirectory) return null;
    const releaseLock=await this.acquireJobLock(jobId);
    try {
      const root = await navigator.storage.getDirectory();
      const app = await root.getDirectoryHandle("thiepn-convert", { create: true });
      const jobs = await app.getDirectoryHandle("jobs", { create: true });
      const job = await jobs.getDirectoryHandle(jobId, { create: true });
      return new TempWorkspace(jobs, jobId, job, releaseLock);
    } catch {
      releaseLock?.();
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
    this.releaseLock?.();
  }
}
