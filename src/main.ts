import "./styles.css";
import { App } from "./app/App";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (!navigator.serviceWorker.controller && !sessionStorage.getItem("coi-reload")) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem("coi-reload")) return;
        sessionStorage.setItem("coi-reload", "1");
        location.reload();
      }, { once: true });
    }
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}

await registerServiceWorker();
await new App().start();
