import * as Comlink from "comlink";

export interface RawArchiveEntry {
  size:number;
  path:string;
  type:string;
  lastModified:number;
  fileData?:ArrayBuffer;
  fileName:string;
}

export class RawLibarchiveSession {
  private constructor(
    private readonly worker:Worker,
    private readonly client:any
  ) {}

  static async open(file:File,workerUrl:string):Promise<RawLibarchiveSession>{
    const worker=new Worker(workerUrl,{type:"module"});
    const RemoteClient:any=Comlink.wrap(worker);
    let readyResolve!:()=>void;
    const ready=new Promise<void>(resolve=>{readyResolve=resolve;});
    const client=await new RemoteClient(Comlink.proxy(()=>readyResolve()));
    await ready;

    let openResolve!:()=>void;
    const opened=new Promise<void>(resolve=>{openResolve=resolve;});
    await client.open(file,Comlink.proxy(()=>openResolve()));
    await opened;
    return new RawLibarchiveSession(worker,client);
  }

  async listFiles():Promise<RawArchiveEntry[]>{
    return await this.client.listFiles();
  }

  async hasEncryptedData():Promise<boolean|null>{
    return await this.client.hasEncryptedData();
  }

  async usePassword(password:string):Promise<void>{
    await this.client.usePassword(password);
  }

  async extractSingleFile(path:string):Promise<RawArchiveEntry|null>{
    return await this.client.extractSingleFile(path);
  }

  async close():Promise<void>{
    try{await this.client.close?.();}catch{}
    try{this.client[Comlink.releaseProxy]?.();}catch{}
    this.worker.terminate();
  }
}
