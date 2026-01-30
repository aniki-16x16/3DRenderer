import { Engine } from "./core/Engine";
import "./style.css";

async function main() {
  let engine: Engine | null = null;
  try {
    engine = new Engine(document.getElementById("canvas") as HTMLCanvasElement);
    await engine.init();
  } catch (error) {
    console.error("Failed to initialize the engine:", error);
  }

  engine!.resize();
  window.addEventListener("resize", () => engine!.resize());
  engine!.onRender = () => {
    const commandEncoder = engine!.device!.createCommandEncoder();
    const textureView = engine!.context!.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.end();

    engine!.device!.queue.submit([commandEncoder.finish()]);
  };
  engine!.start();
}

main();
