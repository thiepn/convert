import type { ConversionEngine } from "./Engine";

export class EngineRegistry {
  private engines = new Map<string, ConversionEngine>();

  register(engine: ConversionEngine): void {
    if (this.engines.has(engine.id)) throw new Error("Duplicate engine: " + engine.id);
    this.engines.set(engine.id, engine);
  }

  async prepareAll(): Promise<void> {
    await Promise.all(this.all().map(engine => engine.prepare?.()));
  }

  get(id: string): ConversionEngine | undefined {
    return this.engines.get(id);
  }

  available(id: string): boolean {
    return this.engines.get(id)?.isAvailable() ?? false;
  }

  supports(id: string, from: string, to: string): boolean {
    const engine = this.engines.get(id);
    return Boolean(engine?.isAvailable() && engine.canConvert(from, to));
  }

  all(): ConversionEngine[] {
    return [...this.engines.values()];
  }

  dispose(): void {
    for(const engine of this.all()){
      try{engine.dispose();}
      catch(error){console.warn("Engine disposal failed:",engine.id,error);}
    }
  }
}
