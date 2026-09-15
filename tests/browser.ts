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
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
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
    device.pushErrorScope("validation");
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = imageCanvas.height = 2;
    const imageContext = imageCanvas.getContext("2d")!;
    imageContext.fillStyle = "red";
    imageContext.fillRect(0, 0, 2, 2);
    const loaded = await app.textures.loadImage(imageCanvas.toDataURL(), { colorSpace: "srgb" });
    const replacement = app.textures.createSolid([0, 255, 0, 255], { colorSpace: "srgb" });
    const phong = materials[1] as PhongMaterial;
    object.material = phong;
    scene.environment = loaded;
    phong.texture = loaded;
    app.renderer.render(scene);
    const originalGroup = phong.bindGroup;
    phong.texture = replacement;
    app.renderer.render(scene);
    if (phong.bindGroup === originalGroup) throw new Error("Texture replacement did not refresh binding");
    scene.remove(object);
    app.renderer.resources.releaseUnused(scene);
    if (loaded.destroyed || replacement.destroyed) throw new Error("Scene collection destroyed borrowed texture");
    app.renderer.render(scene);
    scene.add(object);
    phong.texture = null;
    app.renderer.render(scene);
    scene.environment = null;
    await device.queue.onSubmittedWorkDone();
    app.textures.release(loaded);
    app.textures.release(replacement);
    const textureError = await device.popErrorScope();
    if (textureError) throw new Error(textureError.message);
    results.push("图片加载、换图、空场景环境引用、回收后重建及默认纹理恢复通过");
    if (errors.length) throw new Error(errors.join("\n"));
  } finally {
    app.destroy();
    app.destroy();
  }
  results.push("重复销毁通过");
  document.querySelector("pre")!.textContent = "PASS\n" + results.join("\n");
}
run().catch((error) => {
  document.querySelector("pre")!.textContent = `FAIL\n${error.stack ?? error}`;
  console.error(error);
});
