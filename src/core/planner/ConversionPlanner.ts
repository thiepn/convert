import { EngineRegistry } from "../engines/EngineRegistry";
import { FormatRegistry } from "../formats/FormatRegistry";
import type { ConversionEdge, RouteMode } from "./ConversionGraph";
import { ConversionGraph } from "./ConversionGraph";
import { analyzeLoss, type LossWarning } from "./LossAnalysis";

export interface ConversionRoute {
  edges:ConversionEdge[];
  score:number;
  warnings:LossWarning[];
}

function edgeScore(edge:ConversionEdge,preference?:"semantic"|"fidelity"):number {
  let score=(edge.baseCost??0)
    + edge.qualityLoss*1000
    + edge.metadataLoss.length*25
    + edge.temporaryMultiplier*5
    + (edge.streaming?0:8);

  if(preference&&edge.mode&&edge.mode!=="neutral"&&edge.mode!==preference){
    score+=300;
  }
  return score;
}

export class ConversionPlanner {
  constructor(
    private readonly graph:ConversionGraph,
    private readonly formats:FormatRegistry,
    private readonly engines:EngineRegistry
  ) {}

  availableTargets(sourceId:string):string[] {
    const targets=new Set<string>();
    const visited=new Set<string>([sourceId]);
    const queue=[sourceId];

    while(queue.length){
      const current=queue.shift()!;
      for(const edge of this.graph.outgoing(current)){
        if(!this.engines.supports(edge.engineId,edge.from,edge.to)) continue;
        targets.add(edge.to);
        if(!visited.has(edge.to)){
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    return [...targets];
  }

  plan(
    sourceId:string,
    targetId:string,
    preference?:"semantic"|"fidelity"
  ):ConversionRoute {
    const source=this.formats.get(sourceId);
    const target=this.formats.get(targetId);
    if(!source||!target) throw new Error("Unknown source or target format.");

    if(sourceId===targetId){
      const direct=this.graph.outgoing(sourceId)
        .filter(edge=>edge.to===targetId&&this.engines.supports(edge.engineId,edge.from,edge.to))
        .sort((a,b)=>edgeScore(a,preference)-edgeScore(b,preference))[0];
      if(!direct) throw new Error("No local conversion route is available on this browser.");
      return {
        edges:[direct],
        score:edgeScore(direct,preference),
        warnings:analyzeLoss(source,target,[direct])
      };
    }

    const queue:Array<{id:string;edges:ConversionEdge[];score:number}>=[{id:sourceId,edges:[],score:0}];
    const best=new Map<string,number>([[sourceId,0]]);

    while(queue.length){
      queue.sort((a,b)=>a.score-b.score);
      const current=queue.shift();
      if(!current) break;

      if(current.id===targetId){
        return {
          edges:current.edges,
          score:current.score,
          warnings:analyzeLoss(source,target,current.edges)
        };
      }

      for(const edge of this.graph.outgoing(current.id)){
        if(!this.engines.supports(edge.engineId,edge.from,edge.to)) continue;
        const score=current.score+edgeScore(edge,preference);
        if(score>=(best.get(edge.to)??Number.POSITIVE_INFINITY)) continue;
        best.set(edge.to,score);
        queue.push({id:edge.to,edges:[...current.edges,edge],score});
      }
    }

    throw new Error("No local conversion route is available on this browser.");
  }
}
