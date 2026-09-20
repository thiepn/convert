import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";
import { parseMesh,writeMesh } from "../../core/specialist/mesh";
import { assertMemoryBackedSource } from "../../core/performance/Budget";

const FORMATS=new Set(["obj","stl","ply"]);
const MIME:Record<string,string>={
  obj:"model/obj",
  stl:"model/stl",
  ply:"application/octet-stream"
};

export class MeshEngine implements ConversionEngine{
  readonly id="mesh-compat";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return typeof TextDecoder!=="undefined"&&typeof TextEncoder!=="undefined";}
  canConvert(from:string,to:string):boolean{return FORMATS.has(from)&&FORMATS.has(to);}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    const memoryBytes=Math.max(64*1024*1024,source.size*6);
    return {
      temporaryBytes:memoryBytes,memoryBytes,
      workspaceBytes:Math.max(32*1024*1024,source.size*1.5),
      outputBytes:null,sourceAccess:"buffered",outputAccess:"buffered",
      notes:["Mesh conversion materializes triangle geometry in memory."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("MESH_ROUTE_UNSUPPORTED: Unsupported mesh route.");
    assertMemoryBackedSource(request.source.size,"mesh conversion",6,320*1024*1024);

    request.onProgress?.(.15,"Parsing mesh geometry");
    const mesh=parseMesh(new Uint8Array(await request.source.arrayBuffer()),request.sourceFormatId);
    if(mesh.vertices.length>6_000_000||mesh.triangles.length>4_000_000){
      throw new Error("MESH_COMPLEXITY_LIMIT: Mesh exceeds the guarded vertex/triangle limit.");
    }
    if(request.signal.aborted) throw new DOMException("Mesh conversion cancelled.","AbortError");
    request.onProgress?.(.72,"Writing triangle mesh");
    const bytes=writeMesh(mesh,request.targetFormatId);
    const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
    const warnings=[
      "Phase 7 mesh conversion preserves triangle positions only. Materials, textures, normals, UVs, colors, scene hierarchy, animation, and CAD semantics are not preserved."
    ];
    if(request.sourceFormatId==="ply") warnings.push("Only ASCII PLY input is supported in Phase 7.");
    return {
      blob:new Blob([copy.buffer],{type:MIME[request.targetFormatId]??"application/octet-stream"}),
      warnings,
      details:{vertices:mesh.vertices.length,triangles:mesh.triangles.length}
    };
  }

  dispose():void{}
}
