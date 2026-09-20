declare module "pandoc-wasm" {
  export interface PandocResult {
    stdout:string;
    stderr:string;
    warnings:Array<Record<string,unknown>>;
    files:Record<string,string|Blob>;
    mediaFiles:Record<string,Blob>;
  }
  export function convert(
    options:Record<string,unknown>,
    stdin:string|null,
    files:Record<string,string|Blob>
  ):Promise<PandocResult>;
  export function query(options:Record<string,unknown>):Promise<unknown>;
}
