import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Material } from "./graphics/Material";
import { Mesh } from "./graphics/Mesh";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./scene/Camera";
import { Scene } from "./scene/Scene";
import basicShaderCode from "./shaders/basic.wgsl?raw";
import "./style.css";

async function main() {
  // 1. 初始化引擎
  let engine: Engine | null = null;
  try {
    engine = new Engine(document.getElementById("canvas") as HTMLCanvasElement);
    await engine.init();
  } catch (error) {
    console.error("Failed to initialize the engine:", error);
    return;
  }

  // 2. 创建场景组件
  const scene = new Scene();
  const camera = new Camera();
  camera.position[2] = 5;
  scene.activeCamera = camera;

  // 渲染器
  const renderer = new ForwardRenderer(engine);

  // 3. 创建资源: Mesh, Shader, Material
  const SQRT_3 = Math.sqrt(3);
  const triangleMesh = new Mesh([
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
  triangleMesh.initialize(engine.device!);
  const basicShader = new Shader(
    engine.device!,
    "basic-shader",
    basicShaderCode,
  );

  const basicMaterial = new Material("basic-material");
  basicMaterial.initialize(
    engine.device!,
    engine.format!,
    basicShader,
    renderer.cameraBindGroupLayout, // Group 0
    renderer.modelBindGroupLayout, // Group 2
  );

  // 4. 创建物体
  const triangleActor = new Object3D("Triangle", triangleMesh, basicMaterial);
  scene.add(triangleActor);

  // 5. 事件处理
  engine.resize();
  window.addEventListener("resize", () => {
    engine!.resize();
  });

  engine.onResize = (width, height) => {
    camera.aspect = width / height;
  };

  // 6. 渲染循环
  engine.onRender = () => {
    // 旋转三角形
    const rotation = triangleActor.transform.rotation;
    triangleActor.transform.setRotation(
      rotation[0],
      rotation[1],
      rotation[2] + 0.01,
    );
    renderer.render(scene);
  };

  engine.start();
}

main();
