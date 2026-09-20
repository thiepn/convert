import type { FormatDefinition } from "../formats/types";
import type { ConversionEdge } from "./ConversionGraph";

export interface LossWarning { code:string; message:string; }

export function analyzeLoss(source:FormatDefinition,target:FormatDefinition,edges:ConversionEdge[]):LossWarning[] {
  const warnings:LossWarning[]=[];
  if (source.capabilities.alpha && !target.capabilities.alpha) {
    warnings.push({code:"ALPHA_LOSS",message:target.name+" cannot preserve transparency; transparent pixels require a background."});
  }
  if (source.capabilities.animation && !target.capabilities.animation) {
    warnings.push({code:"ANIMATION_LOSS",message:target.name+" is static; animated input will require frame selection."});
  }
  if (source.capabilities.multiplePages && !target.capabilities.multiplePages && !target.capabilities.animation) {
    warnings.push({code:"PAGE_LOSS",message:target.name+" cannot represent multiple TIFF/HEIF pages as a single output image."});
  }
  if (source.capabilities.hdr && !target.capabilities.hdr) {
    warnings.push({code:"HDR_LOSS",message:target.name+" may require high-dynamic-range content to be reduced to an SDR-compatible representation."});
  }
  if (source.capabilities.vector && !target.capabilities.vector) {
    warnings.push({code:"VECTOR_RASTERIZATION",message:"Vector input will be rasterized at its rendered dimensions."});
  }
  const metadata=[...new Set(edges.flatMap(edge=>edge.metadataLoss))];
  if (metadata.length) {
    warnings.push({code:"METADATA_LOSS",message:"This route cannot currently preserve: "+metadata.join(", ")+"."});
  }
  const quality=edges.reduce((sum,edge)=>sum+edge.qualityLoss,0);
  if (quality>0) warnings.push({code:"LOSSY_ROUTE",message:"The selected target can use lossy encoding. Enable lossless mode where supported if exact pixel preservation is required."});
  return warnings;
}
