import "./styles.css";
import { App } from "./app/App";

function updateButton():HTMLButtonElement|null {
  return document.getElementById("update-button") as HTMLButtonElement|null;
}

let updateReloadRequested=false;

function offerUpdate(worker:ServiceWorker){
  const button=updateButton();
  if(!button) return;
  button.classList.remove("hidden");
  button.onclick=()=>{
    updateReloadRequested=true;
    button.disabled=true;
    button.textContent="Updating…";
    worker.postMessage({type:"SKIP_WAITING"});
  };
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  let reloading=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(reloading) return;
    if(globalThis.crossOriginIsolated&&!updateReloadRequested) return;
    reloading=true;
    location.reload();
  });

  try {
    const registration=await navigator.serviceWorker.register("./sw.js",{scope:"./"});

    if(registration.waiting&&navigator.serviceWorker.controller){
      offerUpdate(registration.waiting);
    }

    registration.addEventListener("updatefound",()=>{
      const installing=registration.installing;
      if(!installing) return;
      installing.addEventListener("statechange",()=>{
        if(installing.state==="installed"&&navigator.serviceWorker.controller){
          offerUpdate(installing);
        }
      });
    });

    await navigator.serviceWorker.ready;

    if(!globalThis.crossOriginIsolated
      &&!navigator.serviceWorker.controller
      &&!sessionStorage.getItem("coi-reload")){
      sessionStorage.setItem("coi-reload","1");
      location.reload();
    }
  } catch (error) {
    console.warn("Service worker registration failed.",error);
  }
}

await registerServiceWorker();
await new App().start();
performance.mark("convert:runtime-ready");
