import { test,expect } from "@playwright/test";
import { openApp,srtFixture } from "./helpers";

test("production shell is isolated, local-only, and free of horizontal overflow",async({page},testInfo)=>{
  const external:string[]=[];
  const consoleErrors:string[]=[];
  page.on("request",request=>{
    const url=new URL(request.url());
    if(url.origin!=="http://127.0.0.1:4173") external.push(request.url());
  });
  page.on("console",message=>{
    if(message.type()==="error") consoleErrors.push(message.text());
  });

  await openApp(page);
  expect(await page.evaluate(()=>globalThis.crossOriginIsolated)).toBe(true);
  expect(external).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await expect(page.locator("#runtime-status")).toContainText(/ready|degraded/i);
  await expect(page.locator("#update-button")).toBeHidden();

  if(/mobile/i.test(testInfo.project.name)){
    const chooserPromise=page.waitForEvent("filechooser");
    await page.locator("#drop-zone").press("Enter");
    const chooser=await chooserPromise;
    await chooser.setFiles({
      name:"keyboard.srt",
      mimeType:"application/x-subrip",
      buffer:srtFixture("keyboard.srt").buffer
    });
    await expect(page.locator("#file-panel")).toBeVisible();
    const run=page.locator("#convert-button");
    const box=await run.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x+box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport?.width??10000);
  }
});

test("Pages-like host becomes cross-origin isolated through the service worker fallback",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="chromium","fallback certification is run once in Chromium");
  await page.goto("http://127.0.0.1:4174/",{waitUntil:"domcontentloaded"});

  await expect.poll(async()=>{
    try{
      return await page.evaluate(()=>({
        isolated:globalThis.crossOriginIsolated,
        controlled:Boolean(navigator.serviceWorker?.controller)
      }));
    }catch{
      return {isolated:false,controlled:false};
    }
  },{timeout:60_000,intervals:[250,500,1000]}).toEqual({isolated:true,controlled:true});

  await expect(page.locator("#drop-zone")).toBeVisible();
  await expect(page.locator("#runtime-status")).not.toHaveText(/Probing/i,{timeout:120_000});
});
