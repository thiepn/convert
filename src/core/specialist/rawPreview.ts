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
