import { vec3 } from "wgpu-matrix";
import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./core/Camera";
import { Scene } from "./core/Scene";
import { OrbitControls } from "./controls/OrbitControls";
import pbrShaderCode from "./shaders/pbr.wgsl?raw";
import "./style.css";
import GUI from "lil-gui";
import { angle2Rad } from "./utils/math";
import { initializeWhiteTexture } from "./textures/white";
import { StandardLayouts } from "./graphics/StandardLayouts";
import { OBJLoader } from "./loader/OBJLoader";
import { shadowMaterial } from "./materials/Shadow";
import shadowShaderCode from "./shaders/shadow.wgsl?raw";
import { ParallelLight } from "./core/ParallelLight";
import { initializeNormalTexture } from "./textures/normal";
import { initializeSamplers } from "./graphics/Texture";
import { PBRMaterial } from "./materials/PBR";

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
  initializeSamplers(engine.device!);
  initializeWhiteTexture(engine.device!);
  initializeNormalTexture(engine.device!);
  shadowMaterial.initialize(
    engine.device!,
    engine.format!,
    new Shader(engine.device!, "shadow-shader", shadowShaderCode),
    StandardLayouts.shadowPassBindGroupLayout,
  );

  const scene = new Scene();
  const camera = new Camera();
  camera.position = vec3.create(0, 4, 8);
  camera.target = vec3.create(0, 0.5, 0);
  scene.activeCamera = camera;

  const lightRed = new ParallelLight([0.9, 0.2, 0.2], 3);
  const lightBlue = new ParallelLight([0.2, 0.2, 0.9], 2);
  const lightGreen = new ParallelLight([0.2, 0.9, 0.2], 5);
  lightRed.transform.position = vec3.create(1, 2, 2);
  lightBlue.transform.position = vec3.create(-2, 2, -1);
  lightGreen.transform.position = vec3.create(0, 0, -1);
  lightRed.target = vec3.create(0, 0.5, 0);
  lightBlue.target = vec3.create(0, 0.5, 0);
  lightGreen.target = vec3.zero();
  scene.add(lightRed).add(lightBlue).add(lightGreen);

  // 添加 OrbitControls
  const controls = new OrbitControls(camera, engine.canvas as HTMLElement);

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

  const renderer = new ForwardRenderer(engine, 3);

  const pbrShader = new Shader(engine.device!, "pbr-shader", pbrShaderCode);

  const bunnyMesh = await new OBJLoader().load("assets/obj/bunny_10k.obj");
  bunnyMesh.initialize(engine.device!);
  const roughnessLevels = [0.05, 0.25, 0.5, 0.75, 1.0];
  const metallicLevels = [0.0, 1.0];
  const columnSpacing = 1.3;
  const rowSpacing = 1.5;
  const bunnyObjects: Object3D[] = [];
  const bunnyMaterials: PBRMaterial[] = [];

  for (let row = 0; row < metallicLevels.length; row++) {
    for (let column = 0; column < roughnessLevels.length; column++) {
      const metallic = metallicLevels[row];
      const roughness = roughnessLevels[column];
      const material = new PBRMaterial({
        label: `PBR-m${metallic}-r${roughness}`,
        baseColor: [0.9, 0.9, 0.9, 1.0],
        metallic,
        roughness,
      });
      material.initialize(engine.device!, engine.format!, pbrShader);

      const bunny = new Object3D(
        `bunny-m${metallic}-r${roughness}`,
        bunnyMesh,
        material,
      );
      bunny.transform.position = vec3.create(
        (column - (roughnessLevels.length - 1) / 2) * columnSpacing,
        0,
        (row - (metallicLevels.length - 1) / 2) * rowSpacing,
      );
      bunny.initialize(engine.device!);
      scene.add(bunny);
      bunnyObjects.push(bunny);
      bunnyMaterials.push(material);
    }
  }

  const planeMesh = await new OBJLoader().load("assets/obj/plane.obj");
  planeMesh.initialize(engine.device!);
  const planeMaterial = new PBRMaterial({
    baseColor: [0.5, 0.5, 0.5, 1.0],
    metallic: 0,
    roughness: 1,
  });
  planeMaterial.initialize(engine.device!, engine.format!, pbrShader);
  const plane = new Object3D("plane", planeMesh, planeMaterial);
  plane.initialize(engine.device!);
  plane.transform.scale = vec3.create(10, 10, 10);
  scene.add(plane);

  engine.resize();
  camera.aspect = engine.canvas.width / engine.canvas.height;
  renderer.resize(engine.canvas.width, engine.canvas.height);
  const handleResize = () => {
    engine.resize();
    renderer.resize(engine.canvas.width, engine.canvas.height);
  };
  window.addEventListener("resize", handleResize);
  engine.onResize = (width, height) => {
    camera.aspect = width / height;
  };

  engine.onRender = () => {
    renderer.render(scene);
  };

  window.addEventListener(
    "beforeunload",
    () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.destroy();
      for (const bunny of bunnyObjects) bunny.destroy();
      plane.destroy();
      bunnyMesh.destroy();
      planeMesh.destroy();
      for (const material of bunnyMaterials) material.destroy();
      planeMaterial.destroy();
      shadowMaterial.destroy();
      gui.destroy();
      engine.destroy();
    },
    { once: true },
  );

  engine.start();
}

main();
