import { EngineRegistry } from "../engines/EngineRegistry";
import { FormatRegistry } from "../formats/FormatRegistry";
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
    + (edge.streaming ? 0 : 8);
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
        .filter(edge => this.engines.available(edge.engineId))
        .map(edge => edge.to)
    )];
  }

  plan(sourceId: string, targetId: string): ConversionRoute {
    const source = this.formats.get(sourceId);
    const target = this.formats.get(targetId);
    if (!source || !target) throw new Error("Unknown source or target format.");

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
          warnings: analyzeLoss(source, target, current.edges)
        };
      }

      for (const edge of this.graph.outgoing(current.id)) {
        if (!this.engines.available(edge.engineId)) continue;
        const score = current.score + edgeScore(edge);
        if (score >= (best.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
        best.set(edge.to, score);
        queue.push({ id: edge.to, edges: [...current.edges, edge], score });
      }
    }

    throw new Error("No local conversion route is available on this browser.");
  }
}
