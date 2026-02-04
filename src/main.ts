import { vec3 } from "wgpu-matrix";
import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Mesh } from "./graphics/Mesh";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./scene/Camera";
import { Scene } from "./scene/Scene";
import shaderCode from "./shaders/solid.wgsl?raw";
import "./style.css";
import GUI from "lil-gui";
import { angle2Rad } from "./utils/math";
import { SolidColorMaterial } from "./materials/SolidColor";

async function main() {
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
  camera.position = vec3.create(1, 2, 2);
  scene.activeCamera = camera;

  // --- GUI Setup ---
  const gui = new GUI();
  const cameraFolder = gui.addFolder("Camera");
  const cameraConfig = {
    fov: 60,
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

  const basicShader = new Shader(
    engine.device!,
    "basic-shader",
    shaderCode,
  );
  const redMaterial = new SolidColorMaterial({ r: 0.8, g: 0.5, b: 0.3, label: 'red-material' });
  redMaterial.initialize(
    engine.device!,
    engine.format!,
    basicShader,
    renderer.cameraBindGroupLayout,
    renderer.modelBindGroupLayout,
  );
  const blueMaterial = new SolidColorMaterial({ r: 0.3, g: 0.5, b: 0.8, label: 'blue-material' });
  blueMaterial.initialize(
    engine.device!,
    engine.format!,
    basicShader,
    renderer.cameraBindGroupLayout,
    renderer.modelBindGroupLayout,
  );

  // 这是一个边长为 1 的立方体，中心在原点
  const vertices = new Float32Array([
    // Front face (z = 0.5)
    -0.5,
    -0.5,
    0.5, // 0: 左下前
    0.5,
    -0.5,
    0.5, // 1: 右下前
    0.5,
    0.5,
    0.5, // 2: 右上前
    -0.5,
    0.5,
    0.5, // 3: 左上前
    // Back face (z = -0.5)
    -0.5,
    -0.5,
    -0.5, // 4: 左下后
    0.5,
    -0.5,
    -0.5, // 5: 右下后
    0.5,
    0.5,
    -0.5, // 6: 右上后
    -0.5,
    0.5,
    -0.5, // 7: 左上后
  ]);
  const indices = new Uint16Array([
    // Front
    0,
    1,
    2,
    0,
    2,
    3,
    // Back
    5,
    4,
    7,
    5,
    7,
    6, // 注意背面顺序，使其朝外
    // Top
    3,
    2,
    6,
    3,
    6,
    7,
    // Bottom
    4,
    5,
    1,
    4,
    1,
    0,
    // Right
    1,
    5,
    6,
    1,
    6,
    2,
    // Left
    4,
    0,
    3,
    4,
    3,
    7,
  ]);
  const cubeMesh = new Mesh(vertices, indices);
  cubeMesh.initialize(engine.device!);

  const cube1 = new Object3D("Cube1", cubeMesh, blueMaterial);
  const cube2 = new Object3D("Cube2", cubeMesh, redMaterial);
  const cube3 = new Object3D("Cube3", cubeMesh, blueMaterial);
  cube1.transform.position = vec3.create(-1.0, 0.2, 0);
  cube3.transform.position = vec3.create(1.0, -0.1, 0);
  scene.add(cube1)
    .add(cube2)
    .add(cube3);

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
    cube1.transform.rotation[1] -= 0.001;
    cube3.transform.rotation[1] += 0.001;
    renderer.render(scene);
  };

  engine.start();
}

main();
