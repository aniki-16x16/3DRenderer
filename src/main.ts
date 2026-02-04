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

  const scene = new Scene();
  const camera = new Camera();
  camera.position[2] = 2;
  scene.activeCamera = camera;

  const renderer = new ForwardRenderer(engine);

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

  const obj1 = (() => {
    const mesh = new Mesh([-0.5, -0.7, 0.0, 0.3, -0.2, 0.0, -0.1, 0.5, 0.0]);
    mesh.initialize(engine.device!);
    const actor = new Object3D("Triangle1", mesh, basicMaterial);
    return actor;
  })();
  const obj2 = (() => {
    const mesh = new Mesh([-0.6, 0.1, -0.1, 0.7, -0.4, -0.1, 0.4, 0.6, -0.1]);
    mesh.initialize(engine.device!);
    const actor = new Object3D("Triangle2", mesh, basicMaterial);
    return actor;
  })();
  scene.add(obj1);
  scene.add(obj2);

  engine.resize();
  camera.aspect = engine.canvas.width / engine.canvas.height;
  renderer.resize(engine.canvas.width, engine.canvas.height);
  window.addEventListener("resize", () => {
    engine.resize();
    renderer.resize(engine.canvas.width, engine.canvas.height);
  });
  engine.onResize = (width, height) => {
    camera.aspect = width / height;
  };

  engine.onRender = () => {
    obj1.transform.rotation[2] += 0.01;
    obj2.transform.rotation[1] += 0.01;
    renderer.render(scene);
  };

  engine.start();
}

main();
