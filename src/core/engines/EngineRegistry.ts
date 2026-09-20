import type { ConversionEngine } from "./Engine";

export class EngineRegistry {
  private engines = new Map<string, ConversionEngine>();

  register(engine: ConversionEngine): void {
    if (this.engines.has(engine.id)) throw new Error("Duplicate engine: " + engine.id);
    this.engines.set(engine.id, engine);
  }

  get(id: string): ConversionEngine | undefined {
    return this.engines.get(id);
  }

  available(id: string): boolean {
    return this.engines.get(id)?.isAvailable() ?? false;
  }

  all(): ConversionEngine[] {
    return [...this.engines.values()];
  }

  dispose(): void {
    this.all().forEach(engine => engine.dispose());
  }
}
