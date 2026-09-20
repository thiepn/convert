import { EngineRegistry } from "../engines/EngineRegistry";
import { FormatRegistry } from "../formats/FormatRegistry";
import type { ImageTraits } from "../image/types";
import type { ConversionEdge } from "./ConversionGraph";
import { ConversionGraph } from "./ConversionGraph";
import { analyzeLoss, type LossWarning } from "./LossAnalysis";

export interface ConversionRoute {
  edges: ConversionEdge[];
  score: number;
  warnings: LossWarning[];
}

function edgeScore(edge: ConversionEdge): number {
  return edge.qualityLoss * 1000
    + edge.metadataLoss.length * 25
    + edge.temporaryMultiplier * 5
    + (edge.streaming ? 0 : 12);
}

export class ConversionPlanner {
  constructor(
    private readonly graph: ConversionGraph,
    private readonly formats: FormatRegistry,
    private readonly engines: EngineRegistry
  ) {}

  availableTargets(sourceId: string): string[] {
    return [...new Set(
      this.graph.outgoing(sourceId)
        .filter(edge => this.engines.supports(edge.engineId, edge.from, edge.to))
        .map(edge => edge.to)
    )];
  }

  plan(
    sourceId: string,
    targetId: string,
    traits?: ImageTraits,
    forceProcessing = false
  ): ConversionRoute {
    const source = this.formats.get(sourceId);
    const target = this.formats.get(targetId);
    if (!source || !target) throw new Error("Unknown source or target format.");

    if (sourceId === targetId && forceProcessing) {
      const selfEdges = this.graph.outgoing(sourceId)
        .filter(edge => edge.to === targetId && this.engines.supports(edge.engineId, edge.from, edge.to))
        .sort((a, b) => edgeScore(a) - edgeScore(b));
      const edge = selfEdges[0];
      if (!edge) throw new Error("No local processing route is available on this browser.");
      return {
        edges: [edge],
        score: edgeScore(edge),
        warnings: analyzeLoss(source, target, [edge], traits)
      };
    }

    const queue: Array<{ id: string; edges: ConversionEdge[]; score: number }> = [{ id: sourceId, edges: [], score: 0 }];
    const best = new Map<string, number>([[sourceId, 0]]);

    while (queue.length) {
      queue.sort((a, b) => a.score - b.score);
      const current = queue.shift();
      if (!current) break;

      if (current.id === targetId) {
        return {
          edges: current.edges,
          score: current.score,
          warnings: analyzeLoss(source, target, current.edges, traits)
        };
      }

      for (const edge of this.graph.outgoing(current.id)) {
        if (!this.engines.supports(edge.engineId, edge.from, edge.to)) continue;
        const score = current.score + edgeScore(edge);
        if (score >= (best.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
        best.set(edge.to, score);
        queue.push({ id: edge.to, edges: [...current.edges, edge], score });
      }
    }

    throw new Error("No local conversion route is available on this browser.");
  }
}
