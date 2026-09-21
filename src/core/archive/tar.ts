export interface TarInput {
  blob:Blob;
  path:string;
  lastModified?:number|null;
}

const BLOCK=512;
const encoder=new TextEncoder();

function writeAscii(target:Uint8Array,offset:number,length:number,value:string):void{
  const bytes=encoder.encode(value);
  if(bytes.length>length) throw new Error("TAR_FIELD_TOO_LONG: Archive metadata exceeds USTAR field size.");
  target.set(bytes,offset);
}

function writeOctal(target:Uint8Array,offset:number,length:number,value:number):void{
  if(!Number.isSafeInteger(value)||value<0) throw new Error("TAR_VALUE_INVALID: Invalid numeric TAR metadata.");
  const text=value.toString(8);
  if(text.length>length-1) throw new Error("TAR_VALUE_TOO_LARGE: TAR numeric metadata exceeds USTAR limits.");
  writeAscii(target,offset,length,text.padStart(length-1,"0")+"\0");
}

function splitPath(path:string):{name:string;prefix:string}{
  const normalized=path.replaceAll("\\","/").replace(/^\/+|\/+$/g,"");
  if(!normalized) throw new Error("TAR_PATH_INVALID: Empty TAR path.");
  if(encoder.encode(normalized).length<=100) return {name:normalized,prefix:""};

  const slashes:number[]=[];
  for(let i=0;i<normalized.length;i++) if(normalized[i]==="/") slashes.push(i);
  for(let i=slashes.length-1;i>=0;i--){
    const at=slashes[i];
    const prefix=normalized.slice(0,at);
    const name=normalized.slice(at+1);
    if(encoder.encode(prefix).length<=155&&encoder.encode(name).length<=100){
      return {name,prefix};
    }
  }
  throw new Error("TAR_PATH_TOO_LONG: Path cannot be represented safely in USTAR.");
}

export function createUstarHeader(input:TarInput):Uint8Array{
  const {name,prefix}=splitPath(input.path);
  const header=new Uint8Array(BLOCK);
  writeAscii(header,0,100,name);
  writeOctal(header,100,8,0o644);
  writeOctal(header,108,8,0);
  writeOctal(header,116,8,0);
  writeOctal(header,124,12,input.blob.size);
  const seconds=Math.max(0,Math.floor((input.lastModified??Date.now())/1000));
  writeOctal(header,136,12,seconds);

  // Checksum is computed with this field filled with ASCII spaces.
  header.fill(0x20,148,156);
  header[156]="0".charCodeAt(0);
  writeAscii(header,257,6,"ustar\0");
  writeAscii(header,263,2,"00");
  writeAscii(header,265,32,"browser");
  writeAscii(header,297,32,"browser");
  if(prefix) writeAscii(header,345,155,prefix);

  let sum=0;
  for(const value of header) sum+=value;
  const checksum=sum.toString(8).padStart(6,"0")+"\0 ";
  writeAscii(header,148,8,checksum);
  return header;
}

export async function createUstar(files:TarInput[],signal?:AbortSignal):Promise<Blob>{
  if(!files.length) throw new Error("ARCHIVE_EMPTY: No files selected.");
  const parts:BlobPart[]=[];
  for(const input of files){
    signal?.throwIfAborted?.();
    const header=createUstarHeader(input);
    parts.push(header.buffer,input.blob);
    const padding=(BLOCK-(input.blob.size%BLOCK))%BLOCK;
    if(padding) parts.push(new Uint8Array(padding).buffer);
  }
  parts.push(new Uint8Array(BLOCK*2).buffer);
  return new Blob(parts,{type:"application/x-tar"});
}
