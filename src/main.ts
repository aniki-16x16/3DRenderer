import { Application } from "./app/Application";
import { vec3 } from "wgpu-matrix";
import { Object3D } from "./core/Object3D";
import { Camera } from "./core/Camera";
import { Scene } from "./core/Scene";
import { OrbitControls } from "./controls/OrbitControls";
import "./style.css";
import GUI from "lil-gui";
import { angle2Rad } from "./utils/math";
import { OBJLoader } from "./loader/OBJLoader";
import { ParallelLight } from "./core/ParallelLight";
import { PBRMaterial } from "./materials/PBR";

let disposed = false;
let currentApp: Application | undefined;
import.meta.hot?.dispose(() => {
  disposed = true;
  currentApp?.destroy();
});

async function main() {
  const canvas = document.getElementById("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas");
  const app = await Application.create(canvas);
  if (disposed) { app.destroy(); return; }
  currentApp = app;
  const { engine, scope } = app;
  const cleanup = () => app.destroy();
  window.addEventListener("pagehide", cleanup, { once: true });
  scope.defer(() => window.removeEventListener("pagehide", cleanup));
  try {
    const scene = new Scene();
    const camera = new Camera();
    camera.position = vec3.create(0, 4, 8);
    camera.target = vec3.create(0, 0.5, 0);
    scene.activeCamera = camera;

    const light = new ParallelLight([1, 1, 1], 1);
    light.transform.position = vec3.create(1, 2, 2);
    light.target = vec3.create(0, 0.5, 0);
    scene.add(light);

    // 添加 OrbitControls
    const controls = new OrbitControls(camera, engine.canvas);
    scope.adopt(controls, () => controls.dispose());

    // --- GUI Setup ---
    const gui = scope.own(new GUI());
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

    const bunnyMesh = await new OBJLoader().load("assets/obj/bunny_10k.obj");
    if (scope.destroyed) return;
    const roughnessLevels = [0.05, 0.25, 0.5, 0.75, 1.0];
    const metallicLevels = [0.0, 1.0];
    const columnSpacing = 1.3;
    const rowSpacing = 1.5;

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
        scene.add(bunny);
      }
    }

    const planeMesh = await new OBJLoader().load("assets/obj/plane.obj");
    if (scope.destroyed) return;
    const planeMaterial = new PBRMaterial({
      baseColor: [0.5, 0.5, 0.5, 1.0],
      metallic: 0,
      roughness: 1,
    });
    const plane = new Object3D("plane", planeMesh, planeMaterial);
    plane.transform.scale = vec3.create(10, 10, 10);
    scene.add(plane);

    app.start(scene);
  } catch (error) {
    app.destroy();
    throw error;
  }
}

main().catch((error) => console.error("Application failed:", error));
