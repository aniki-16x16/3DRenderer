import { Engine } from "./core/Engine";
import { Material } from "./graphics/Material";
import { Mesh } from "./graphics/Mesh";
import { Shader } from "./graphics/Shader";
import basicShaderCode from "./shaders/basic.wgsl?raw";
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

  const mesh = new Mesh([
    -0.5,
    -0.5,
    0.0, // V0
    0.5,
    -0.5,
    0.0, // V1
    0.0,
    0.5,
    0.0, // V2
  ]);
  const material = new Material("basic-material");
  mesh.initialize(engine!.device!);
  material.initialize(
    engine!.device!,
    engine!.format!,
    new Shader(engine!.device!, "basic-shader", basicShaderCode),
  );
  engine!.onRender = () => {
    const commandEncoder = engine!.device!.createCommandEncoder();
    const textureView = engine!.context!.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(material.pipeline!);
    renderPass.setVertexBuffer(0, mesh.vertexBuffer!);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    engine!.device!.queue.submit([commandEncoder.finish()]);
  };
  engine!.start();
}

main();
