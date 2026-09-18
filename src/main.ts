import { Application } from "./app/Application";
import { FrameRateMonitor } from "./debug/FrameRateMonitor";
import { IBLScene } from "./demos/IBLScene";
import "./style.css";

let disposed = false;
let currentApp: Application | undefined;
import.meta.hot?.dispose(() => {
  disposed = true;
  currentApp?.destroy();
});

async function main() {
  const canvas = document.getElementById("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas");
  const app = await Application.create(canvas);
  if (disposed) {
    app.destroy();
    return;
  }
  currentApp = app;
  const cleanup = () => app.destroy();
  window.addEventListener("pagehide", cleanup, { once: true });
  app.scope.defer(() => window.removeEventListener("pagehide", cleanup));
  // 启动时选择一个代码场景；场景负责自己的内容与 GUI。
  const frameRateMonitor = app.scope.own(new FrameRateMonitor());
  await app.start(new IBLScene(), (elapsedSeconds) =>
    frameRateMonitor.recordFrame(elapsedSeconds * 1000),
  );
}

main().catch((error) => {
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.error("Application failed:", error);
});
