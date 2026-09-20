import { inflateSync, strFromU8 } from "fflate";

export interface ZipEntryInfo {
  name:string;
  compressedSize:number;
  uncompressedSize:number;
  compressionMethod:number;
  localHeaderOffset:number;
  directory:boolean;
}

export interface ZipPackageIndex {
  entries:ZipEntryInfo[];
  expandedSize:number;
  compressedPayloadSize:number;
  suspicious:boolean;
  warnings:string[];
  getEntry(name:string):ZipEntryInfo|undefined;
  readText(name:string,maxBytes?:number):Promise<string|null>;
  readBytes(name:string,maxBytes?:number):Promise<Uint8Array|null>;
}

function safeName(name:string):boolean {
  if(name.startsWith("/")||name.startsWith("\\")||/^[A-Za-z]:[\\/]/.test(name)) return false;
  const normalized=name.replaceAll("\\","/");
  return !normalized.split("/").some(part=>part==="..");
}

function findEocd(bytes:Uint8Array):number {
  for(let i=bytes.length-22;i>=0;i--){
    if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06) return i;
  }
  return -1;
}

export async function openZipPackage(blob:Blob):Promise<ZipPackageIndex|null> {
  if(blob.size<22) return null;
  const tailSize=Math.min(blob.size,65557);
  const tailStart=blob.size-tailSize;
  const tail=new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const eocd=findEocd(tail);
  if(eocd<0) return null;

  const view=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  const totalEntries=view.getUint16(eocd+10,true);
  const centralSize=view.getUint32(eocd+12,true);
  const centralOffset=view.getUint32(eocd+16,true);

  if(totalEntries===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff){
    throw new Error("DOCUMENT_ZIP64_UNSUPPORTED: ZIP64 Office packages are not inspected in Phase 4.");
  }
  if(totalEntries>100_000) throw new Error("DOCUMENT_ENTRY_LIMIT: Package contains too many entries.");
  if(centralSize>64*1024*1024) throw new Error("DOCUMENT_DIRECTORY_LIMIT: ZIP central directory is unexpectedly large.");
  if(centralOffset+centralSize>blob.size) throw new Error("DOCUMENT_PACKAGE_CORRUPT: ZIP central directory points outside the file.");

  const central=new Uint8Array(await blob.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
  const entries:ZipEntryInfo[]=[];
  let offset=0,expandedSize=0,compressedPayloadSize=0;
  const warnings:string[]=[];
  let suspicious=false;

  while(offset+46<=central.length&&entries.length<totalEntries){
    const dv=new DataView(central.buffer,central.byteOffset+offset,central.byteLength-offset);
    if(dv.getUint32(0,true)!==0x02014b50) break;
    const method=dv.getUint16(10,true);
    const compressedSize=dv.getUint32(20,true);
    const uncompressedSize=dv.getUint32(24,true);
    const nameLength=dv.getUint16(28,true);
    const extraLength=dv.getUint16(30,true);
    const commentLength=dv.getUint16(32,true);
    const localHeaderOffset=dv.getUint32(42,true);
    const end=offset+46+nameLength+extraLength+commentLength;
    if(end>central.length) throw new Error("DOCUMENT_PACKAGE_CORRUPT: Truncated ZIP central directory.");
    const name=strFromU8(central.subarray(offset+46,offset+46+nameLength));
    if(!safeName(name)){
      suspicious=true;
      warnings.push("Unsafe package path detected: "+name);
    }
    const directory=name.endsWith("/");
    entries.push({name,compressedSize,uncompressedSize,compressionMethod:method,localHeaderOffset,directory});
    expandedSize+=uncompressedSize;
    compressedPayloadSize+=compressedSize;
    offset=end;
  }

  if(entries.length!==totalEntries) warnings.push("ZIP entry count did not match the central-directory declaration.");
  const ratio=compressedPayloadSize>0?expandedSize/compressedPayloadSize:expandedSize>0?Number.POSITIVE_INFINITY:1;
  if(expandedSize>8*1024*1024*1024||ratio>500){
    suspicious=true;
    warnings.push("Package expansion ratio/size is suspicious; conversion is blocked.");
  }
  if(suspicious) throw new Error("DOCUMENT_PACKAGE_UNSAFE: "+warnings.join(" "));

  const map=new Map(entries.map(entry=>[entry.name,entry]));

  async function readBytes(name:string,maxBytes=32*1024*1024):Promise<Uint8Array|null>{
    const entry=map.get(name);
    if(!entry||entry.directory) return null;
    if(entry.uncompressedSize>maxBytes) throw new Error("DOCUMENT_ENTRY_TOO_LARGE: "+name+" exceeds the selective inspection limit.");
    const headBytes=new Uint8Array(await blob.slice(entry.localHeaderOffset,entry.localHeaderOffset+30).arrayBuffer());
    if(headBytes.length<30) throw new Error("DOCUMENT_PACKAGE_CORRUPT: Truncated local header.");
    const header=new DataView(headBytes.buffer,headBytes.byteOffset,headBytes.byteLength);
    if(header.getUint32(0,true)!==0x04034b50) throw new Error("DOCUMENT_PACKAGE_CORRUPT: Invalid local ZIP header.");
    const fileNameLength=header.getUint16(26,true);
    const extraLength=header.getUint16(28,true);
    const dataStart=entry.localHeaderOffset+30+fileNameLength+extraLength;
    const compressed=new Uint8Array(await blob.slice(dataStart,dataStart+entry.compressedSize).arrayBuffer());
    let output:Uint8Array;
    if(entry.compressionMethod===0) output=compressed;
    else if(entry.compressionMethod===8) output=inflateSync(compressed);
    else throw new Error("DOCUMENT_COMPRESSION_UNSUPPORTED: ZIP method "+entry.compressionMethod+" is unsupported for inspection.");
    if(output.byteLength>maxBytes) throw new Error("DOCUMENT_ENTRY_TOO_LARGE: Inflated entry exceeds inspection limit.");
    return output;
  }

  return {
    entries,
    expandedSize,
    compressedPayloadSize,
    suspicious,
    warnings,
    getEntry:(name:string)=>map.get(name),
    readBytes,
    readText:async(name:string,maxBytes?:number)=>{
      const bytes=await readBytes(name,maxBytes);
      return bytes?strFromU8(bytes):null;
    }
  };
}

export async function detectPackagedDocument(blob:Blob):Promise<string|null>{
  try{
    const pkg=await openZipPackage(blob);
    if(!pkg) return null;
    const names=new Set(pkg.entries.map(entry=>entry.name));
    if(names.has("word/document.xml")) return names.has("word/vbaProject.bin")?"docm":"docx";
    if(names.has("ppt/presentation.xml")) return names.has("ppt/vbaProject.bin")?"pptm":"pptx";
    if(names.has("META-INF/container.xml")&&pkg.entries.some(entry=>entry.name.endsWith(".opf"))) return "epub";
    if(names.has("mimetype")){
      const mimetype=(await pkg.readText("mimetype",1024))?.trim();
      if(mimetype==="application/vnd.oasis.opendocument.text") return "odt";
      if(mimetype==="application/vnd.oasis.opendocument.presentation") return "odp";
    }
    return null;
  }catch{
    return null;
  }
}
