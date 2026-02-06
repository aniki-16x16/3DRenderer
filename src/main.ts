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
import type { Material } from "./graphics/Material";
import { initializeWhiteTexture } from "./textures/white";
import { OBJLoader } from "./loader/OBJLoader";

async function main() {
  let engine: Engine | null = null;
  try {
    engine = new Engine(document.getElementById("canvas") as HTMLCanvasElement);
    await engine.init();
  } catch (error) {
    console.error("Failed to initialize the engine:", error);
    return;
  }
  initializeWhiteTexture(engine.device!);

  const scene = new Scene();
  const camera = new Camera();
  camera.position = vec3.create(0, 2, 2);
  scene.activeCamera = camera;

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
  const matInitHelper = (mat: Material) => {
    mat.initialize(
      engine!.device!,
      engine!.format!,
      basicShader,
      renderer.cameraBindGroupLayout,
      renderer.modelBindGroupLayout,
    );
  };

  const bunnyMesh = await new OBJLoader().load("assets/obj/bunny_10k.obj");
  bunnyMesh.initialize(engine.device!);
  const bunnyMaterial = new PhongMaterial({
    color: [1, 1, 1],
  });
  matInitHelper(bunnyMaterial);
  const bunny = new Object3D("bunny", bunnyMesh, bunnyMaterial);
  scene.add(bunny);

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
    renderer.render(scene);
  };

  engine.start();
}

main();
