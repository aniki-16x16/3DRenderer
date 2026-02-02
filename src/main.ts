import { Engine } from "./core/Engine";
import { Transform } from "./core/Transform";
import { Material } from "./graphics/Material";
import { Mesh } from "./graphics/Mesh";
import { Shader } from "./graphics/Shader";
import { Camera } from "./scene/Camera";
import basicShaderCode from "./shaders/basic.wgsl?raw";
import "./style.css";
import { multiplyMatrices } from "./utils/math";

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

  const camera = new Camera();
  camera.position[2] = 5;
  camera.updateMatrix();
  engine!.onResize = (width, height) => {
    camera.aspect = width / height;
    camera.updateMatrix();
  };

  const transform = new Transform();
  const mvpBuffer = engine!.device!.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroupLayout = engine!.device!.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });
  const bindGroup = engine!.device!.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: mvpBuffer,
        },
      },
    ],
  });
  const pipelineLayout = engine!.device!.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const SQRT_3 = Math.sqrt(3);
  const mesh = new Mesh([
    (-0.5 / 2) * SQRT_3,
    -0.5 / 2,
    0.0, // V0
    (0.5 / 2) * SQRT_3,
    -0.5 / 2,
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
    pipelineLayout,
  );

  engine!.onRender = () => {
    transform.rotation[1] += 0.01;
    transform.updateMatrix();
    const mvp = multiplyMatrices([
      camera.getProjectionMatrix(),
      camera.getViewMatrix(),
      transform.getMatrix(),
    ]);
    engine!.device!.queue.writeBuffer(mvpBuffer, 0, new Float32Array(mvp));

    const textureView = engine!.context!.getCurrentTexture().createView();
    const commandEncoder = engine!.device!.createCommandEncoder();
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
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    engine!.device!.queue.submit([commandEncoder.finish()]);
  };
  engine!.start();
}

main();
