import { vec3 } from "wgpu-matrix";
import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./scene/Camera";
import { Scene } from "./scene/Scene";
import { OrbitControls } from "./scene/OrbitControls";
import shaderCode from "./shaders/phong.wgsl?raw";
import "./style.css";
import GUI from "lil-gui";
import { angle2Rad } from "./utils/math";
import { PhongMaterial } from "./materials/Phong";
import { initializeWhiteTexture } from "./textures/white";
import { StandardLayouts } from "./graphics/StandardLayouts";
import { OBJLoader } from "./loader/OBJLoader";
import { shadowMaterial } from "./materials/Shadow";
import shadowShaderCode from "./shaders/shadow.wgsl?raw";
import { ParallelLight } from "./scene/ParallelLight";

async function main() {
  let engine: Engine | null = null;
  try {
    engine = new Engine(document.getElementById("canvas") as HTMLCanvasElement);
    await engine.init();
    StandardLayouts.initialize(engine.device!);
  } catch (error) {
    console.error("Failed to initialize the engine:", error);
    return;
  }
  initializeWhiteTexture(engine.device!);
  StandardLayouts.initialize(engine.device!);
  shadowMaterial.initialize(
    engine.device!,
    engine.format!,
    new Shader(engine.device!, "shadow-shader", shadowShaderCode),
    StandardLayouts.lightBindGroupLayout,
  );

  const scene = new Scene();
  const camera = new Camera();
  const light = new ParallelLight();
  camera.position = vec3.create(0, 2, 2);
  scene.activeCamera = camera;
  scene.activeLight = light;

  // 添加 OrbitControls
  new OrbitControls(camera, engine.canvas as HTMLElement);

  // --- GUI Setup ---
  const gui = new GUI();
  const cameraFolder = gui.addFolder("Camera");
  const cameraConfig = {
    fov: 45,
  };
  camera.fov = angle2Rad(cameraConfig.fov);
  cameraFolder
    .add(cameraConfig, "fov", 0, 179)
    .name("FOV")
    .onChange((v: number) => {
      camera.fov = angle2Rad(v);
    });
  cameraFolder.add(camera, "near", 0.1, 1).name("Near");
  cameraFolder.add(camera, "far", 1, 100).name("Far");

  const renderer = new ForwardRenderer(engine);

  const basicShader = new Shader(engine.device!, "basic-shader", shaderCode);

  const bunnyMesh = await new OBJLoader().load("assets/obj/bunny_10k.obj");
  bunnyMesh.initialize(engine.device!);
  const bunnyMaterial = new PhongMaterial({
    color: [1, 1, 1],
  });
  bunnyMaterial.initialize(engine.device!, engine.format!, basicShader);
  const bunny = new Object3D("bunny", bunnyMesh, bunnyMaterial);
  bunny.initialize(engine.device!);
  const bunny2 = new Object3D("bunny2", bunnyMesh, bunnyMaterial);
  bunny2.initialize(engine.device!);
  bunny2.transform.position = vec3.create(0.6, 0, 0.6);
  bunny2.transform.rotation[1] = Math.PI / 4;
  scene.add(bunny);
  scene.add(bunny2);

  const planeMesh = await new OBJLoader().load("assets/obj/plane.obj");
  planeMesh.initialize(engine.device!);
  const planeMaterial = new PhongMaterial({
    color: [0.5, 0.5, 0.5],
  });
  planeMaterial.initialize(engine.device!, engine.format!, basicShader);
  const plane = new Object3D("plane", planeMesh, planeMaterial);
  plane.initialize(engine.device!);
  plane.transform.scale = vec3.create(10, 1, 10);
  scene.add(plane);

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
    const time = performance.now() * 0.0005;
    vec3.copy(
      vec3.create(Math.cos(time) * 5, 5, Math.sin(time) * 5),
      light.position,
    );
    renderer.render(scene);
  };

  engine.start();
}

main();
