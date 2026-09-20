import type { BatchExecutionMode,BatchPipeline,PipelineStep } from "./types";

export interface PipelineInput {
  targetFormatId:string;
  quality:number;
  options:Record<string,unknown>;
  namingTemplate?:string;
  executionMode?:BatchExecutionMode;
  packageResults?:boolean;
}

function text(value:unknown):string {
  return typeof value==="string"?value.trim():"";
}

function number(value:unknown):number|undefined {
  return typeof value==="number"&&Number.isFinite(value)?value:undefined;
}

export function buildBatchPipeline(input:PipelineInput):BatchPipeline {
  const target=input.targetFormatId.trim();
  if(!target) throw new Error("BATCH_TARGET_REQUIRED: Choose a target format.");
  const quality=Math.max(.05,Math.min(1,Number.isFinite(input.quality)?input.quality:.82));
  const options={...input.options};
  const steps:PipelineStep[]=[];

  const sheetPolicy=text(options.sheetPolicy);
  const selectedSheet=text(options.selectedSheet);
  if(sheetPolicy){
    steps.push({
      kind:"select-sheet",
      label:sheetPolicy==="selected"&&selectedSheet
        ?"Select worksheet: "+selectedSheet
        :sheetPolicy==="all"?"Use all worksheets":"Use first worksheet"
    });
  }

  const selectedTable=text(options.selectedTable);
  if(selectedTable) steps.push({kind:"select-table",label:"Select table: "+selectedTable});

  const query=text(options.query);
  if(query) steps.push({kind:"filter",label:"Apply restricted local data query"});

  const maxDimension=number(options.maxDimension);
  if(maxDimension) steps.push({kind:"resize",label:"Resize longest edge to "+Math.round(maxDimension)+" px"});

  const targetBytes=number(options.targetBytes);
  if(targetBytes){
    const mb=targetBytes/(1024*1024);
    steps.push({kind:"compress",label:"Target approximately "+mb.toFixed(mb>=10?0:1)+" MB"});
  }

  const compressionLevel=number(options.compressionLevel);
  if(compressionLevel!=null){
    steps.push({kind:"compress",label:"Archive compression level "+Math.round(compressionLevel)});
  }

  const metadata=text(options.metadataPolicy);
  if(metadata&&metadata!=="preserve"){
    steps.push({
      kind:"metadata",
      label:metadata==="privacy"?"Apply privacy metadata policy":"Strip metadata where supported"
    });
  }

  if(quality<.999) steps.push({kind:"quality",label:"Quality "+Math.round(quality*100)+"%"});
  steps.push({kind:"convert",label:"Convert to "+target});

  const packageResults=input.packageResults??true;
  if(packageResults) steps.push({kind:"package",label:"Package multiple successful outputs as ZIP"});

  return {
    targetFormatId:target,
    quality,
    options,
    namingTemplate:(input.namingTemplate?.trim()||"{name}-converted"),
    executionMode:input.executionMode??"auto",
    packageResults,
    steps
  };
}

export function describePipeline(pipeline:BatchPipeline):string[] {
  return pipeline.steps.map(step=>step.label);
}

export function sanitizePipelineForStorage(pipeline:BatchPipeline):BatchPipeline {
  const options={...pipeline.options};
  for(const key of [
    "password","newPassword","inputPassword","outputPassword",
    "fonts","resources","referenceDocument","referenceDocumentName"
  ]) delete options[key];

  return {
    ...pipeline,
    options,
    steps:pipeline.steps.map(step=>({...step}))
  };
}
