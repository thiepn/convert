export interface FitsCard {
  key:string;
  value:string|null;
  comment:string|null;
}

function parseValue(raw:string):{value:string|null;comment:string|null}{
  let inQuote=false;
  let slash=-1;
  for(let i=0;i<raw.length;i++){
    if(raw[i]==="'") inQuote=!inQuote;
    if(raw[i]==="/"&&!inQuote){slash=i;break;}
  }
  const value=(slash>=0?raw.slice(0,slash):raw).trim()||null;
  const comment=(slash>=0?raw.slice(slash+1):"").trim()||null;
  return {value,comment};
}

export function parseFitsHeader(bytes:Uint8Array,maxCards=20_000):FitsCard[] {
  if(bytes.byteLength<80) throw new Error("FITS_HEADER_INVALID: File is too small.");
  const decoder=new TextDecoder("ascii");
  const cards:FitsCard[]=[];
  const limit=Math.min(bytes.byteLength,maxCards*80);

  for(let offset=0;offset+80<=limit;offset+=80){
    const card=decoder.decode(bytes.subarray(offset,offset+80));
    const key=card.slice(0,8).trim();
    if(key==="END") return cards;
    if(!key) continue;

    if(card[8]==="="){
      const parsed=parseValue(card.slice(10));
      cards.push({key,value:parsed.value,comment:parsed.comment});
    }else{
      const text=card.slice(8).trim();
      cards.push({key,value:text||null,comment:null});
    }
  }

  throw new Error("FITS_HEADER_INVALID: END card was not found within the guarded header limit.");
}
