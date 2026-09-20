import {
  ConsoleStdout,
  Directory,
  File,
  OpenFile,
  PreopenDirectory,
  WASI
} from "@bjorn3/browser_wasi_shim";

type RuntimeResult={
  stdout:string;
  stderr:string;
  warnings:Array<Record<string,unknown>>;
  files:Record<string,string|Blob>;
  mediaFiles:Record<string,Blob>;
};

function blobFromBytes(bytes:Uint8Array,type="application/octet-stream"):Blob{
  const buffer=new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer],{type});
}

export async function createPandocRuntime(wasmBinary:ArrayBuffer){
  const args=["pandoc.wasm","+RTS","-H64m","-RTS"];
  const env:string[]=[];
  const fileSystem=new Map<string,any>();
  const fds=[
    new OpenFile(new File(new Uint8Array(),{readonly:true})),
    ConsoleStdout.lineBuffered(()=>{}),
    ConsoleStdout.lineBuffered(()=>{}),
    new PreopenDirectory("/",fileSystem)
  ];
  const wasi=new WASI(args,env,fds,{debug:false});
  const {instance}=await WebAssembly.instantiate(wasmBinary,{
    wasi_snapshot_preview1:wasi.wasiImport
  });
  const exports=instance.exports as any;
  wasi.initialize(instance);
  exports.__wasm_call_ctors();

  const view=()=>new DataView((exports.memory as WebAssembly.Memory).buffer);
  const argcPtr=exports.malloc(4);
  view().setUint32(argcPtr,args.length,true);
  const argv=exports.malloc(4*(args.length+1));
  for(let i=0;i<args.length;i++){
    const encoded=new TextEncoder().encode(args[i]);
    const ptr=exports.malloc(encoded.length+1);
    new Uint8Array((exports.memory as WebAssembly.Memory).buffer,ptr,encoded.length).set(encoded);
    view().setUint8(ptr+encoded.length,0);
    view().setUint32(argv+4*i,ptr,true);
  }
  view().setUint32(argv+4*args.length,0,true);
  const argvPtr=exports.malloc(4);
  view().setUint32(argvPtr,argv,true);
  exports.hs_init_with_rtsopts(argcPtr,argvPtr);

  async function addFile(filename:string,data:string|Blob,readonly:boolean){
    const bytes=typeof data==="string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(await data.arrayBuffer());
    fileSystem.set(filename,new File(bytes,{readonly}));
  }

  async function convert(
    options:Record<string,unknown>,
    stdin:string|null,
    suppliedFiles:Record<string,string|Blob>
  ):Promise<RuntimeResult>{
    const optionText=JSON.stringify(options);
    const optionBytes=new TextEncoder().encode(optionText);
    const optionPtr=exports.malloc(optionBytes.length);
    new Uint8Array((exports.memory as WebAssembly.Memory).buffer,optionPtr,optionBytes.length).set(optionBytes);

    fileSystem.clear();
    const stdinFile=new File(new Uint8Array(),{readonly:true});
    const stdoutFile=new File(new Uint8Array(),{readonly:false});
    const stderrFile=new File(new Uint8Array(),{readonly:false});
    const warningsFile=new File(new Uint8Array(),{readonly:false});
    fileSystem.set("stdin",stdinFile);
    fileSystem.set("stdout",stdoutFile);
    fileSystem.set("stderr",stderrFile);
    fileSystem.set("warnings",warningsFile);

    const files={...suppliedFiles};
    const known=new Set(["stdin","stdout","stderr","warnings"]);
    for(const [name,data] of Object.entries(files)){
      await addFile(name,data,true);
      known.add(name);
    }

    const outputName=typeof options["output-file"]==="string"?options["output-file"]:null;
    const extractMedia=typeof options["extract-media"]==="string"?options["extract-media"]:null;
    if(outputName){
      await addFile(outputName,new Blob(),false);
      known.add(outputName);
    }
    if(extractMedia&&extractMedia.endsWith(".zip")){
      await addFile(extractMedia,new Blob(),false);
      known.add(extractMedia);
    }
    if(stdin){
      stdinFile.data=new TextEncoder().encode(stdin);
    }

    exports.convert(optionPtr,optionBytes.length);

    if(outputName){
      const output=fileSystem.get(outputName);
      if(output?.data?.length){
        files[outputName]=blobFromBytes(output.data);
      }
    }
    if(extractMedia){
      const archive=fileSystem.get(extractMedia);
      if(archive?.data?.length){
        files[extractMedia]=blobFromBytes(archive.data,"application/zip");
      }
    }

    const mediaFiles:Record<string,Blob>={};
    const collect=(map:Map<string,any>,prefix:string)=>{
      for(const [name,entry] of map.entries()){
        const path=prefix?prefix+"/"+name:name;
        if(entry instanceof Directory){
          collect(entry.contents,path);
        }else if(!known.has(path)&&entry?.data?.length){
          const blob=blobFromBytes(entry.data);
          files[path]=blob;
          mediaFiles[path]=blob;
        }
      }
    };
    collect(fileSystem,"");

    const decoder=new TextDecoder("utf-8");
    const rawWarnings=decoder.decode(warningsFile.data);
    let warnings:Array<Record<string,unknown>>=[];
    if(rawWarnings){
      try{warnings=JSON.parse(rawWarnings);}catch{}
    }

    return {
      stdout:decoder.decode(stdoutFile.data),
      stderr:decoder.decode(stderrFile.data),
      warnings,
      files,
      mediaFiles
    };
  }

  return {convert};
}
