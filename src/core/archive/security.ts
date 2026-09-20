import { getDeviceProfile } from "../performance/DeviceProfile";
import type { ArchiveEntryInfo } from "./types";

export interface ArchiveSafetyAssessment {
  safe:boolean;
  normalized:ArchiveEntryInfo[];
  expandedSize:number;
  duplicatePaths:string[];
  warnings:string[];
}

export function normalizeArchivePath(input:string):string {
  if(input.includes("\0")) throw new Error("ARCHIVE_PATH_UNSAFE: NUL byte in entry path.");
  let path=input.replaceAll("\\","/").replace(/^\.\//,"");
  if(path.startsWith("/")||/^[A-Za-z]:\//.test(path)){
    throw new Error("ARCHIVE_PATH_UNSAFE: Absolute archive path is blocked.");
  }
  if(path.length>4096) throw new Error("ARCHIVE_PATH_UNSAFE: Entry path is too long.");
  const parts=path.split("/").filter(part=>part!==""&&part!==".");
  if(parts.some(part=>part==="..")){
    throw new Error("ARCHIVE_PATH_UNSAFE: Parent-directory traversal is blocked.");
  }
  path=parts.join("/");
  if(!path) throw new Error("ARCHIVE_PATH_UNSAFE: Empty entry path.");
  return path;
}

export function assessArchiveEntries(
  entries:ArchiveEntryInfo[],
  sourceBytes:number,
  options:{maxEntries?:number;maxExpandedBytes?:number;maxRatio?:number}={}
):ArchiveSafetyAssessment {
  const maxEntries=options.maxEntries??100_000;
  const maxExpandedBytes=options.maxExpandedBytes??16*1024*1024*1024;
  const maxRatio=options.maxRatio??1000;

  if(entries.length>maxEntries){
    throw new Error("ARCHIVE_ENTRY_LIMIT: Archive contains too many entries.");
  }

  let expandedSize=0;
  const normalized:ArchiveEntryInfo[]=[];
  const exact=new Set<string>();
  const folded=new Map<string,string>();
  const duplicatePaths:string[]=[];
  const warnings:string[]=[];

  for(const entry of entries){
    const path=normalizeArchivePath(entry.path);
    const size=Math.max(0,Number(entry.size)||0);
    expandedSize+=size;
    if(!Number.isSafeInteger(expandedSize)||expandedSize>maxExpandedBytes){
      throw new Error("ARCHIVE_EXPANDED_LIMIT: Declared expanded archive size exceeds the safety limit.");
    }

    if(exact.has(path)) duplicatePaths.push(path);
    exact.add(path);

    const key=path.toLocaleLowerCase("en-US");
    const prior=folded.get(key);
    if(prior&&prior!==path){
      warnings.push("Case-colliding entries detected: "+prior+" / "+path);
    }else{
      folded.set(key,path);
    }

    normalized.push({...entry,path,name:path.split("/").pop()||entry.name});
  }

  const ratio=sourceBytes>0?expandedSize/sourceBytes:(expandedSize>0?Number.POSITIVE_INFINITY:1);
  if(expandedSize>64*1024*1024&&ratio>maxRatio){
    throw new Error("ARCHIVE_BOMB_SUSPECTED: Declared expansion ratio is unsafe.");
  }
  if(duplicatePaths.length){
    warnings.push(duplicatePaths.length+" duplicate archive path(s) detected. Extraction keeps separate download results rather than overwriting files.");
  }
  if(ratio>200){
    warnings.push("Very high declared compression ratio: "+ratio.toFixed(0)+"×.");
  }

  return {safe:true,normalized,expandedSize,duplicatePaths,warnings};
}

export function assertExtractionBudget(expandedSize:number,fileCount:number):void {
  const profile=getDeviceProfile();
  if(expandedSize>profile.maxArchiveExpandedBytes){
    throw new Error(
      "ARCHIVE_EXTRACTION_BUDGET: Extract-all would materialize more than "
      +Math.floor(profile.maxArchiveExpandedBytes/(1024*1024))+" MiB on this "+profile.tier+" device. Select fewer entries."
    );
  }
  if(fileCount>profile.maxArchiveFiles){
    throw new Error("ARCHIVE_EXTRACTION_BUDGET: Too many files for one browser extraction result on this device.");
  }
}
