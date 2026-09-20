import type { ConversionEstimate } from "../engines/Engine";
import type { ConversionEdge } from "../planner/ConversionGraph";
import type { DeviceProfile } from "./DeviceProfile";
import { getDeviceProfile } from "./DeviceProfile";

export interface RouteResourcePlan {
  streamingInput:boolean;
  streamingOutput:boolean;
  memoryBytes:number;
  workspaceBytes:number;
  largeFileMode:boolean;
  notes:string[];
}

export function estimateRouteResources(
  sourceBytes:number,
  edges:ConversionEdge[],
  estimates:ConversionEstimate[],
  profile:DeviceProfile=getDeviceProfile()
):RouteResourcePlan {
  let memoryBytes=32*1024*1024;
  let workspaceBytes=64*1024*1024;
  let streamingInput=true;
  let streamingOutput=true;
  const notes:string[]=[];

  estimates.forEach((estimate,index)=>{
    const edge=edges[index];
    const memory=estimate.memoryBytes??estimate.temporaryBytes;
    const workspace=estimate.workspaceBytes
      ??estimate.outputBytes
      ??Math.min(Math.max(sourceBytes,64*1024*1024),4*1024*1024*1024);

    memoryBytes=Math.max(memoryBytes,memory);
    workspaceBytes=Math.max(workspaceBytes,workspace);
    streamingInput=streamingInput&&(estimate.sourceAccess==="streaming"||Boolean(edge?.streaming));
    streamingOutput=streamingOutput&&(estimate.outputAccess==="streaming"||Boolean(edge?.streaming));
    notes.push(...estimate.notes);
  });

  const threshold=Math.min(256*1024*1024,Math.floor(profile.workingSetBudgetBytes*.35));
  return {
    streamingInput,
    streamingOutput,
    memoryBytes,
    workspaceBytes,
    largeFileMode:sourceBytes>=threshold,
    notes:[...new Set(notes)]
  };
}
