import fs from "node:fs";
import { describe,expect,it } from "vitest";

describe("Phase 10 release contract",()=>{
  it("pins the production package to v1.0.1",()=>{
    const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
    expect(pkg.version).toBe("1.0.1");
  });

  it("keeps production CSP local-only for network connections",()=>{
    const html=fs.readFileSync("index.html","utf8");
    const csp=html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1]??"";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/(?:^|\s)(?:ws:|wss:)/);
    expect(csp).not.toMatch(/connect-src[^;]*(?:https?:)/);
  });

  it("ships the minimum accessible recovery and progress surfaces",()=>{
    const html=fs.readFileSync("index.html","utf8");
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="start-over-button"');
  });

  it("uses explicit service-worker update activation",()=>{
    const sw=fs.readFileSync("public/sw.js","utf8");
    expect(sw).toContain('type==="SKIP_WAITING"');
    const install=sw.match(/self\.addEventListener\("install"[\s\S]*?\n}\);/)?.[0]??"";
    expect(install).not.toContain("skipWaiting");
  });

  it("has install identity and file-launch metadata",()=>{
    const manifest=JSON.parse(fs.readFileSync("public/manifest.webmanifest","utf8"));
    expect(manifest.id).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({src:"icon-192.png",sizes:"192x192",type:"image/png"}),
      expect.objectContaining({src:"icon-512.png",sizes:"512x512",type:"image/png"})
    ]));
    expect(manifest.file_handlers.length).toBeGreaterThan(0);
  });
});
