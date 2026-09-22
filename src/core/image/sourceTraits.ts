export interface CommonImageSourceTraits {
  metadata:boolean;
  animation:boolean;
  known:boolean;
}

async function read(blob:Blob,start:number,length:number):Promise<Uint8Array>{
  return new Uint8Array(await blob.slice(start,Math.min(blob.size,start+length)).arrayBuffer());
}

async function pngTraits(blob:Blob):Promise<CommonImageSourceTraits>{
  const signature=await read(blob,0,8);
  if(signature.length<8) return {metadata:false,animation:false,known:false};
  let offset=8;
  let metadata=false;
  let animation=false;
  const metadataChunks=new Set([
    "cHRM","gAMA","iCCP","sBIT","sRGB","bKGD","hIST","pHYs",
    "eXIf","tEXt","zTXt","iTXt","tIME"
  ]);

  for(let count=0;count<4096&&offset+12<=blob.size;count++){
    const header=await read(blob,offset,8);
    if(header.length<8) return {metadata,animation,known:false};
    const length=new DataView(header.buffer,header.byteOffset,header.byteLength).getUint32(0,false);
    const type=String.fromCharCode(header[4],header[5],header[6],header[7]);
    if(metadataChunks.has(type)) metadata=true;
    if(type==="acTL"||type==="fcTL"||type==="fdAT") animation=true;
    const next=offset+12+length;
    if(next>blob.size) return {metadata,animation,known:false};
    offset=next;
    if(type==="IEND") return {metadata,animation,known:true};
  }
  return {metadata,animation,known:false};
}

async function webpTraits(blob:Blob):Promise<CommonImageSourceTraits>{
  const first=await read(blob,0,12);
  if(first.length<12
    ||String.fromCharCode(...first.slice(0,4))!=="RIFF"
    ||String.fromCharCode(...first.slice(8,12))!=="WEBP"){
    return {metadata:false,animation:false,known:false};
  }

  let offset=12;
  let metadata=false;
  let animation=false;
  for(let count=0;count<4096&&offset+8<=blob.size;count++){
    const header=await read(blob,offset,8);
    if(header.length<8) return {metadata,animation,known:false};
    const type=String.fromCharCode(header[0],header[1],header[2],header[3]);
    const length=new DataView(header.buffer,header.byteOffset,header.byteLength).getUint32(4,true);
    if(type==="EXIF"||type==="XMP "||type==="ICCP") metadata=true;
    if(type==="ANIM"||type==="ANMF") animation=true;
    const next=offset+8+length+(length&1);
    if(next>blob.size) return {metadata,animation,known:false};
    offset=next;
  }
  return {metadata,animation,known:offset===blob.size};
}

async function jpegTraits(blob:Blob):Promise<CommonImageSourceTraits>{
  const limit=Math.min(blob.size,1024*1024);
  const bytes=await read(blob,0,limit);
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8){
    return {metadata:false,animation:false,known:false};
  }

  let offset=2;
  let metadata=false;
  while(offset+3<bytes.length){
    while(offset<bytes.length&&bytes[offset]!==0xff) offset++;
    while(offset<bytes.length&&bytes[offset]===0xff) offset++;
    if(offset>=bytes.length) break;
    const marker=bytes[offset++];
    if(marker===0xda||marker===0xd9) return {metadata,animation:false,known:true};
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7)) continue;
    if(offset+2>bytes.length) break;
    const length=(bytes[offset]<<8)|bytes[offset+1];
    if(length<2) return {metadata,animation:false,known:false};
    if(
      marker===0xe1||marker===0xe2||marker===0xed||marker===0xee||marker===0xfe
    ) metadata=true;
    offset+=length;
  }

  return {
    metadata,
    animation:false,
    known:blob.size<=limit
  };
}

export async function inspectCommonImageSourceTraits(
  blob:Blob,
  formatId:string|undefined
):Promise<CommonImageSourceTraits|undefined>{
  if(formatId==="png") return pngTraits(blob);
  if(formatId==="webp") return webpTraits(blob);
  if(formatId==="jpeg") return jpegTraits(blob);
  return undefined;
}
