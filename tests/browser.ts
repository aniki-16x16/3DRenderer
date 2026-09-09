import { Application } from "../src/app/Application";
import { Scene } from "../src/core/Scene";
import { Camera } from "../src/core/Camera";
import { Object3D } from "../src/core/Object3D";
import { ParallelLight } from "../src/core/ParallelLight";
import { PBRMaterial } from "../src/materials/PBR";
import { PhongMaterial } from "../src/materials/Phong";
import { SolidColorMaterial } from "../src/materials/SolidColor";
import { OBJLoader } from "../src/loader/OBJLoader";

async function run() {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const app = await Application.create(canvas);
  const device = app.engine.device!;
  const errors: string[] = [];
  device.addEventListener("uncapturederror", event => errors.push(event.error.message));
  const results: string[] = [];
  try {
    const mesh = await new OBJLoader().load("/assets/obj/plane.obj");
    const materials = [
      new PBRMaterial({ baseColor: [1, 1, 1, 1], metallic: 0, roughness: 0.5 }),
      new PhongMaterial({ color: [1, 1, 1] }),
      new SolidColorMaterial({ r: 1, g: 1, b: 1 }),
    ];
    const scene = new Scene();
    scene.activeCamera = new Camera();
    const object = new Object3D("test", mesh, materials[0]);
    scene.add(object);
    for (const material of materials) {
      object.material = material;
      for (const count of [0, 1, 3, 1, 0, 5]) {
        scene.lights = Array.from({ length: count }, () => new ParallelLight());
        device.pushErrorScope("validation");
        app.renderer.render(scene);
        await device.queue.onSubmittedWorkDone();
        const error = await device.popErrorScope();
        if (error) throw new Error(`${material.TAG}/${count}: ${error.message}`);
      }
      results.push(`${material.TAG}: 0 → 1 → 3 → 1 → 0 → 5 光源通过`);
    }
    device.pushErrorScope("validation");
    scene.remove(object);
    app.renderer.resources.releaseUnused(scene);
    scene.add(object);
    canvas.width = 400;
    app.renderer.render(scene);
    await device.queue.onSubmittedWorkDone();
    const error = await device.popErrorScope();
    if (error) throw new Error(error.message);
    results.push("移除、回收、重新加入、调整尺寸通过");
    if (errors.length) throw new Error(errors.join("\n"));
  } finally { app.destroy(); app.destroy(); }
  results.push("重复销毁通过");
  document.querySelector("pre")!.textContent = "PASS\n" + results.join("\n");
}
run().catch(error => {
  document.querySelector("pre")!.textContent = `FAIL\n${error.stack ?? error}`;
  console.error(error);
});
