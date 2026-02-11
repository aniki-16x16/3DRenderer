import { vec3 } from "wgpu-matrix";
import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./core/Camera";
import { Scene } from "./core/Scene";
import { OrbitControls } from "./controls/OrbitControls";
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
import { ParallelLight } from "./core/ParallelLight";
import { initializeNormalTexture } from "./textures/normal";
import { Texture } from "./graphics/Texture";

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
  initializeNormalTexture(engine.device!);
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

  const cubeMesh = await new OBJLoader().load("assets/obj/cube.obj");
  cubeMesh.initialize(engine.device!);
  const normalTexture = new Texture("normal-texture");
  await normalTexture.load(engine.device!, "assets/texture/wave_normal.png");
  const cubeMaterial = new PhongMaterial({
    color: [1.0, 1.0, 1.0],
    normalTexture,
  });
  cubeMaterial.initialize(engine.device!, engine.format!, basicShader);
  const cube = new Object3D("cube", cubeMesh, cubeMaterial);
  cube.transform.position = vec3.create(0, 1.0, 0);
  cube.initialize(engine.device!);
  scene.add(cube);

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
    const time = performance.now() * 0.0001;
    vec3.copy(
      vec3.create(Math.cos(time) * 5, 3, Math.sin(time) * 5),
      light.transform.position,
    );
    renderer.render(scene);
  };

  engine.start();
}

main();
