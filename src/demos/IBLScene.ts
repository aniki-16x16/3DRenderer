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

export class IBLScene extends Scene {
  constructor() {
    super("IBL 场景演示");
  }

  private sphere: Object3D | null = null;

  protected override async setup({ canvas, signal, textures }: SceneContext) {
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
    outputFolder.add(this.output, "exposure", 0, 10, 0.1).name("Exposure");

    const [sphereMesh, planeMesh, environmentTexture] = await Promise.all([
      new OBJLoader().load("/assets/obj/icosphere.obj", signal),
      new OBJLoader().load("/assets/obj/plane.obj", signal),
      textures.loadImage("/assets/texture/panorama.jpg", { colorSpace: "srgb" }, signal),
    ]);
    signal.throwIfAborted();
    this.environment = environmentTexture;

    const material = new PBRMaterial({
      baseColor: [0.9, 0.9, 0.9, 1.0],
      metallic: 1,
      roughness: 0,
    });
    const materialFolder = gui.addFolder("Material");
    materialFolder.add(material, "metallic", 0, 1, 0.1);
    materialFolder.add(material, "roughness", 0, 1, 0.01);

    const sphere = new Object3D("sphere", sphereMesh, material);
    sphere.transform.position = vec3.create(0, 1, 0);
    this.sphere = sphere;
    this.add(sphere);

    signal.throwIfAborted();
    const planeMaterial = new PBRMaterial({
      baseColor: [0.5, 0.5, 0.5, 1.0],
      metallic: 0,
      roughness: 1,
    });
    const plane = new Object3D("plane", planeMesh, planeMaterial);
    plane.transform.scale = vec3.create(10, 10, 10);
    plane.transform.rotation = vec3.create(0, 0, 0.01);
    this.add(plane);
  }

  update(_deltaSeconds: number, _elapsedSeconds: number): void {
    this.sphere!.transform.rotation = vec3.create(0, -_elapsedSeconds * 0.1, 0);
  }
}
