export interface EmbeddedJpeg {
  offset:number;
  length:number;
  bytes:Uint8Array;
}

export function findLargestEmbeddedJpeg(source:Uint8Array):EmbeddedJpeg|null {
  let start=-1;
  let bestStart=-1;
  let bestEnd=-1;

  for(let i=0;i+2<source.length;i++){
    if(start<0&&source[i]===0xff&&source[i+1]===0xd8&&source[i+2]===0xff){
      start=i;
      i+=2;
      continue;
    }
    if(start>=0&&source[i]===0xff&&source[i+1]===0xd9){
      const end=i+2;
      if(end-start>bestEnd-bestStart){
        bestStart=start;
        bestEnd=end;
      }
      start=-1;
      i+=1;
    }
  }

  if(bestStart<0||bestEnd<=bestStart) return null;
  return {
    offset:bestStart,
    length:bestEnd-bestStart,
    bytes:source.slice(bestStart,bestEnd)
  };
}


export interface EmbeddedJpegLocation {
  offset:number;
  length:number;
}

export async function findLargestEmbeddedJpegInBlob(
  source:Blob,
  chunkBytes=8*1024*1024,
  signal?:AbortSignal
):Promise<EmbeddedJpegLocation|null> {
  const size=source.size;
  const chunk=Math.max(64*1024,Math.floor(chunkBytes));
  let activeStart=-1;
  let bestStart=-1;
  let bestEnd=-1;

  for(let offset=0;offset<size;offset+=chunk){
    signal?.throwIfAborted?.();
    const ownedStart=offset;
    const ownedEnd=Math.min(size,offset+chunk);
    const readStart=Math.max(0,ownedStart-2);
    const readEnd=Math.min(size,ownedEnd+2);
    const bytes=new Uint8Array(await source.slice(readStart,readEnd).arrayBuffer());

    for(let global=ownedStart;global<ownedEnd;global++){
      const i=global-readStart;
      if(activeStart<0
        &&i+2<bytes.length
        &&bytes[i]===0xff&&bytes[i+1]===0xd8&&bytes[i+2]===0xff){
        activeStart=global;
        continue;
      }
      if(activeStart>=0
        &&i+1<bytes.length
        &&bytes[i]===0xff&&bytes[i+1]===0xd9){
        const end=global+2;
        if(end-activeStart>bestEnd-bestStart){
          bestStart=activeStart;
          bestEnd=end;
        }
        activeStart=-1;
      }
    }
  }

  return bestStart>=0&&bestEnd>bestStart
    ?{offset:bestStart,length:bestEnd-bestStart}
    :null;
}
