import { test,expect,type Page } from "@playwright/test";
import { openApp,resultText,srtFixture } from "./helpers";

function isMobileProject(name:string){
  return name==="chromium-mobile"||name==="webkit-mobile";
}

async function chooseSubtitleByTouch(page:Page){
  const chooserPromise=page.waitForEvent("filechooser");
  await page.locator("#drop-zone").tap();
  const chooser=await chooserPromise;
  const fixture=srtFixture("mobile-touch.srt");
  await chooser.setFiles({
    name:fixture.name,
    mimeType:fixture.mimeType,
    buffer:fixture.buffer
  });
  await expect(page.locator("#file-panel")).toBeVisible({timeout:60_000});
}

async function overflow(page:Page){
  return page.evaluate(()=>({
    horizontal:document.documentElement.scrollWidth-window.innerWidth,
    innerWidth:window.innerWidth,
    innerHeight:window.innerHeight,
    visualWidth:globalThis.visualViewport?.width??window.innerWidth,
    visualHeight:globalThis.visualViewport?.height??window.innerHeight
  }));
}

test.beforeEach(async({page},testInfo)=>{
  test.skip(!isMobileProject(testInfo.project.name),"mobile hardening runs on mobile projects");
  await openApp(page);
});

test("touch file flow and primary controls meet mobile target floor",async({page})=>{
  await chooseSubtitleByTouch(page);

  const quick=page.locator('.target-shortcut[data-target="vtt"]');
  await expect(quick).toBeVisible();
  await quick.tap();
  await expect(page.locator("#target-format")).toHaveValue("vtt");

  const quickBox=await quick.boundingBox();
  expect(quickBox).not.toBeNull();
  expect(quickBox!.height).toBeGreaterThanOrEqual(44);

  const convert=page.locator("#convert-button");
  const convertBox=await convert.boundingBox();
  expect(convertBox).not.toBeNull();
  expect(convertBox!.height).toBeGreaterThanOrEqual(44);

  await convert.tap();
  await expect(page.locator("#results .result-item")).toHaveCount(1,{timeout:60_000});
  expect(await resultText(page,"mobile-touch-converted")).toContain("WEBVTT");

  const save=page.locator("#results .download-link").first();
  const saveBox=await save.boundingBox();
  expect(saveBox).not.toBeNull();
  expect(saveBox!.height).toBeGreaterThanOrEqual(44);

  const targetFontSize=await page.locator("#target-format").evaluate(node=>getComputedStyle(node).fontSize);
  expect(Number.parseFloat(targetFontSize)).toBeGreaterThanOrEqual(16);

  const metrics=await overflow(page);
  expect(metrics.horizontal).toBeLessThanOrEqual(1);
  expect(metrics.visualWidth).toBeLessThanOrEqual(metrics.innerWidth+1);
});

test("portrait to landscape rotation keeps sticky actions inside the viewport",async({page})=>{
  await chooseSubtitleByTouch(page);
  const initial=page.viewportSize();
  expect(initial).not.toBeNull();

  await page.setViewportSize({
    width:Math.max(initial!.width,initial!.height),
    height:Math.min(initial!.width,initial!.height)
  });
  await page.waitForTimeout(150);

  const metrics=await overflow(page);
  expect(metrics.horizontal).toBeLessThanOrEqual(1);

  const row=page.locator(".action-row");
  await expect(row).toBeVisible();
  const rowBox=await row.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(rowBox!.x).toBeGreaterThanOrEqual(-1);
  expect(rowBox!.x+rowBox!.width).toBeLessThanOrEqual(metrics.innerWidth+1);
  expect(rowBox!.height).toBeLessThanOrEqual(120);

  for(const locator of [
    page.locator("#convert-button"),
    page.locator("#start-over-button")
  ]){
    const box=await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("mobile service worker serves cached shell offline and local conversion still works",async({page,context})=>{
  test.setTimeout(120_000);

  await expect.poll(
    ()=>page.evaluate(()=>Boolean(navigator.serviceWorker?.controller)),
    {timeout:30_000,intervals:[250,500,1000]}
  ).toBe(true);

  await context.setOffline(true);
  try{
    const cached=await page.evaluate(async()=>{
      const response=await fetch("./manifest.webmanifest",{cache:"reload"});
      return {ok:response.ok,status:response.status,text:await response.text()};
    });
    expect(cached.ok).toBe(true);
    expect(cached.status).toBe(200);
    expect(cached.text).toContain("Thiepn Convert");

    await chooseSubtitleByTouch(page);
    await page.locator("#target-format").selectOption("vtt");
    await page.locator("#convert-button").tap();
    await expect(page.locator("#results .result-item")).toHaveCount(1,{timeout:60_000});
    expect(await resultText(page,"mobile-touch-converted")).toContain("WEBVTT");
  }finally{
    await context.setOffline(false);
  }
});
