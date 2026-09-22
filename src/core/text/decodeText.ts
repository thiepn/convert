export type TextEncoding="utf-8"|"utf-16le"|"utf-16be";

export async function detectTextEncoding(blob:Blob):Promise<TextEncoding>{
  const bytes=new Uint8Array(await blob.slice(0,3).arrayBuffer());
  if(bytes.length>=2&&bytes[0]===0xff&&bytes[1]===0xfe) return "utf-16le";
  if(bytes.length>=2&&bytes[0]===0xfe&&bytes[1]===0xff) return "utf-16be";
  return "utf-8";
}

export async function readTextBlob(blob:Blob):Promise<{text:string;encoding:TextEncoding}>{
  const encoding=await detectTextEncoding(blob);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const text=new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/,"");
  return {text,encoding};
}
