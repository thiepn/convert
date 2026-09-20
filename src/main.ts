import "./styles.css";
import { App } from "./app/App";

async function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller && !sessionStorage.getItem("coi-reload")) {
      sessionStorage.setItem("coi-reload", "1");
      location.reload();
    }
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}

await registerServiceWorker();
await new App().start();
