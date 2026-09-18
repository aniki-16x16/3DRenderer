import { vec3 } from "wgpu-matrix";
import GUI from "lil-gui";
import { Scene, type SceneContext } from "../scene/Scene";
import { Object3D } from "../scene/Object3D";
import { Camera } from "../scene/Camera";
import { OrbitControls } from "../controls/OrbitControls";
import { angle2Rad } from "../utils/math";
import { OBJLoader } from "../assets/loaders/OBJLoader";
import { DirectionalLight } from "../scene/DirectionalLight";
import { PBRMaterial } from "../materials/PBR";

/** 当前 PBR 兔子阵列演示：内容、交互和 GUI 一起保存在此代码场景。 */
export class PBRScene extends Scene {
  constructor() {
    super("PBR 材质演示");
  }

  protected override async setup({ canvas, signal }: SceneContext) {
    const scope = this.scope;
    const camera = new Camera();
    camera.position = vec3.create(0, 4, 8);
    camera.target = vec3.create(0, 0.5, 0);
    this.activeCamera = camera;

    const light = new DirectionalLight([1, 1, 1], 1);
    light.transform.position = vec3.create(1, 2, 2);
    light.target = vec3.create(0, 0.5, 0);
    this.add(light);

    // 添加 OrbitControls
    const controls = new OrbitControls(camera, canvas);
    scope.adopt(controls, () => controls.dispose());

    // --- GUI Setup ---
    const gui = scope.own(new GUI({ title: this.name }));
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
    const outputFolder = gui.addFolder("Output");
    this.output.exposure = 3;
    outputFolder.add(this.output, "exposure", 0, 10, 0.1).name("Exposure");

    const bunnyMesh = await new OBJLoader().load("/assets/obj/bunny_10k.obj", signal);
    signal.throwIfAborted();
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

        const bunny = new Object3D(`bunny-m${metallic}-r${roughness}`, bunnyMesh, material);
        bunny.transform.position = vec3.create(
          (column - (roughnessLevels.length - 1) / 2) * columnSpacing,
          0,
          (row - (metallicLevels.length - 1) / 2) * rowSpacing,
        );
        this.add(bunny);
      }
    }

    const planeMesh = await new OBJLoader().load("/assets/obj/plane.obj", signal);
    signal.throwIfAborted();
    const planeMaterial = new PBRMaterial({
      baseColor: [0.5, 0.5, 0.5, 1.0],
      metallic: 0,
      roughness: 1,
    });
    const plane = new Object3D("plane", planeMesh, planeMaterial);
    plane.transform.scale = vec3.create(10, 10, 10);
    this.add(plane);
  }
}
