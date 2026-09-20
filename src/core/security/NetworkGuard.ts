export interface NetworkSnapshot {
  resources: Set<string>;
}

function resourceUrls(): Set<string> {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return new Set();
  return new Set(
    performance.getEntriesByType("resource")
      .map(entry => (entry as PerformanceResourceTiming).name)
  );
}

export class NetworkGuard {
  snapshot(): NetworkSnapshot {
    return { resources: resourceUrls() };
  }

  externalRequestsSince(snapshot: NetworkSnapshot): string[] {
    if (typeof location === "undefined") return [];
    return [...resourceUrls()]
      .filter(url => !snapshot.resources.has(url))
      .filter(url => {
        try {
          return new URL(url, location.href).origin !== location.origin;
        } catch {
          return true;
        }
      });
  }
}
