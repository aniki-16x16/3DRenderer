import { vec3 } from "wgpu-matrix";
import { Engine } from "./core/Engine";
import { Object3D } from "./core/Object3D";
import { Mesh } from "./graphics/Mesh";
import { Shader } from "./graphics/Shader";
import { ForwardRenderer } from "./renderer/ForwardRenderer";
import { Camera } from "./scene/Camera";
import { Scene } from "./scene/Scene";
import { OrbitControls } from "./scene/OrbitControls";
import shaderCode from "./shaders/phong.wgsl?raw";
import "./style.css";
import GUI from "lil-gui";
import { angle2Rad } from "./utils/math";
import { createRepeatNormals } from "./utils/mesh";
import { PhongMaterial } from "./materials/Phong";

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
  const redMaterial = new PhongMaterial({
    label: "red-material",
    color: [0.8, 0.2, 0.2],
    specColor: [1.0, 1.0, 1.0],
  });
  redMaterial.initialize(
    engine.device!,
    engine.format!,
    basicShader,
    renderer.cameraBindGroupLayout,
    renderer.modelBindGroupLayout,
  );
  const blueMaterial = new PhongMaterial({
    label: "blue-material",
    color: [0.2, 0.2, 0.8],
    specColor: [1.0, 1.0, 1.0],
  });
  blueMaterial.initialize(
    engine.device!,
    engine.format!,
    basicShader,
    renderer.cameraBindGroupLayout,
    renderer.modelBindGroupLayout,
  );

  // 1. 位置数据 (24 个顶点, 每个面 4 个)
  const positions = new Float32Array([
    // Front face (z = 0.5)
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back face (z = -0.5)
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
    // Top face (y = 0.5)
    -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
    // Bottom face (y = -0.5)
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // Right face (x = 0.5)
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    // Left face (x = -0.5)
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  ]);

  // 2. 法线数据 (对应上面的 24 个顶点)
  const normals = new Float32Array([
    ...createRepeatNormals([0, 0, 1], 4), // Front
    ...createRepeatNormals([0, 0, -1], 4), // Back
    ...createRepeatNormals([0, 1, 0], 4), // Top
    ...createRepeatNormals([0, -1, 0], 4), // Bottom
    ...createRepeatNormals([1, 0, 0], 4), // Right
    ...createRepeatNormals([-1, 0, 0], 4), // Left
  ]);

  // 3. 索引数据 (每个面 2 个三角形, 012 230 模式)
  // 注意：现在的索引是基于 0-23 的，不再是 0-7
  // prettier-ignore
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // Front
    4, 5, 6, 4, 6, 7, // Back
    8, 9, 10, 8, 10, 11, // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23, // Left
  ]);
  const cubeMesh = new Mesh(positions, indices, normals);
  cubeMesh.initialize(engine.device!);

  const cube1 = new Object3D("Cube1", cubeMesh, blueMaterial);
  const cube2 = new Object3D("Cube2", cubeMesh, redMaterial);
  cube2.transform.position = vec3.create(2.0, 0.2, 0);
  scene.add(cube1).add(cube2);

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
    cube2.transform.rotation[0] += 0.001;
    renderer.render(scene);
  };

  engine.start();
}

main();
