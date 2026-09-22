const TAIL_PROBE=70*1024;

function contains(bytes:Uint8Array,sequence:number[]):boolean{
  outer:for(let i=0;i<=bytes.length-sequence.length;i++){
    for(let j=0;j<sequence.length;j++) if(bytes[i+j]!==sequence[j]) continue outer;
    return true;
  }
  return false;
}

async function head(file:Blob,length:number):Promise<Uint8Array>{
  return new Uint8Array(await file.slice(0,Math.min(file.size,length)).arrayBuffer());
}

async function tail(file:Blob,length=TAIL_PROBE):Promise<Uint8Array>{
  const start=Math.max(0,file.size-length);
  return new Uint8Array(await file.slice(start).arrayBuffer());
}

function riffDeclaredSize(bytes:Uint8Array):number|null{
  if(bytes.length<8) return null;
  return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)+8;
}

export async function sourceIntegrityWarnings(file:Blob,formatId:string|undefined):Promise<string[]>{
  if(!formatId) return [];
  const warnings:string[]=[];

  if(formatId==="jpeg"){
    const bytes=await tail(file,64*1024);
    if(file.size<4||!contains(bytes,[0xff,0xd9])){
      warnings.push("JPEG end marker was not found near the end of the file. The source may be truncated or damaged.");
    }
    return warnings;
  }

  if(formatId==="png"){
    const bytes=await tail(file,256);
    const iend=[0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82];
    if(file.size<20||!contains(bytes,iend)){
      warnings.push("PNG IEND marker was not found. The source may be truncated or incomplete.");
    }
    return warnings;
  }

  if(formatId==="gif"){
    const bytes=await tail(file,32);
    if(!bytes.length||bytes[bytes.length-1]!==0x3b){
      warnings.push("GIF trailer byte was not found at the end of the file. The source may be truncated.");
    }
    return warnings;
  }

  if(formatId==="webp"||formatId==="wav"){
    const bytes=await head(file,12);
    const declared=riffDeclaredSize(bytes);
    if(declared!=null&&declared>file.size){
      warnings.push(
        (formatId==="webp"?"WebP":"WAV")
        +" container declares "+declared+" bytes but only "+file.size+" bytes are present. The source is likely truncated."
      );
    }
    return warnings;
  }

  if(formatId==="pdf"){
    const bytes=await tail(file,8192);
    const text=new TextDecoder("latin1").decode(bytes);
    if(!text.includes("%%EOF")){
      warnings.push("PDF end-of-file marker was not found near the end. Repair mode may still recover the document.");
    }
    return warnings;
  }

  if(formatId==="zip"){
    const bytes=await tail(file);
    const eocd=[0x50,0x4b,0x05,0x06];
    const zip64=[0x50,0x4b,0x06,0x06];
    if(!contains(bytes,eocd)&&!contains(bytes,zip64)){
      warnings.push("ZIP central-directory terminator was not found near the end. The archive may be truncated or incomplete.");
    }
    return warnings;
  }

  if(formatId==="sqlite"){
    const bytes=await head(file,100);
    if(bytes.length<100){
      warnings.push("SQLite header is incomplete. The database is likely truncated.");
      return warnings;
    }
    let pageSize=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(16,false);
    if(pageSize===1) pageSize=65536;
    if(pageSize>=512&&file.size<pageSize){
      warnings.push("SQLite file is smaller than its declared first page. The database is likely truncated.");
    }
  }

  return warnings;
}
