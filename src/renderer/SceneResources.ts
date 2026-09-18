import { ResourceScope } from "../utils/ResourceScope";
import type { TextureResources } from "../assets/TextureResources";
import type { Scene } from "../scene/Scene";
import { Material } from "../materials/Material";
import { Shader } from "../gpu/Shader";
import { modelLayout } from "./layouts/BufferLayouts";

const owners = new WeakMap<object, SceneResources>();

/** Renderer 接管首次提交的 Mesh/Material/Object；纹理始终借用，不参与场景回收。 */
export class SceneResources {
  private scope = new ResourceScope();
  private initialized = new WeakSet<object>();
  private owned = new Set<{ destroy(): void }>();
  private shaders = new Map<string, Shader>();
  private shaderOverrides = new WeakMap<Material, string>();
  private readonly modelData = modelLayout.create();
  private device: GPUDevice;
  private format: GPUTextureFormat;

  private textures: TextureResources;

  constructor(device: GPUDevice, format: GPUTextureFormat, textures: TextureResources) {
    this.textures = textures;
    this.device = device;
    this.format = format;
  }

  setShaderSource(material: Material, code: string) {
    if (this.scope.destroyed) throw new Error("SceneResources has been destroyed");
    if (this.initialized.has(material)) throw new Error("Set shader before first render");
    this.shaderOverrides.set(material, code);
  }

  private ensureInitialized<T extends { destroy(): void }>(resource: T, initialize: () => void) {
    if (this.initialized.has(resource)) return;
    const owner = owners.get(resource);
    if (owner && owner !== this)
      throw new Error("Resource already belongs to another renderer; create a separate instance");
    owners.set(resource, this);
    this.owned.add(resource);
    this.scope.adopt(resource, () => {
      try {
        resource.destroy();
      } finally {
        owners.delete(resource);
        this.owned.delete(resource);
        this.initialized.delete(resource);
      }
    });
    initialize();
    this.initialized.add(resource);
  }

  prepare(scene: Scene) {
    if (this.scope.destroyed) throw new Error("SceneResources has been destroyed");
    const preparedMaterials = new Set<Material>();
    for (const object of scene.objects) {
      const { mesh, material } = object;
      if (!mesh || !material) continue;
      this.ensureInitialized(mesh, () => mesh.initialize(this.device));
      if (!preparedMaterials.has(material)) {
        material.prepareResources(this.device, this.textures);
        this.ensureInitialized(material, () => {
          const code = this.shaderOverrides.get(material) ?? material.shaderSource;
          if (code === undefined)
            throw new Error(`Register a shader for ${material.label} before rendering`);
          let shader = this.shaders.get(code);
          if (!shader) {
            shader = new Shader(this.device, material.label, code);
            this.shaders.set(code, shader);
          }
          material.initialize(this.device, this.format, shader);
        });
        material.syncUniforms(this.device);
        preparedMaterials.add(material);
      }
      this.ensureInitialized(object, () => object.initialize(this.device));
      // 每对象每帧上传一次，阴影和主场景 Pass 共同读取。
      modelLayout.write(this.modelData, { matrix: object.transform.getMatrix() });
      this.device.queue.writeBuffer(object.modelBuffer!, 0, this.modelData);
    }
  }

  /** 场景批量移除后可显式回收；仍被此场景引用的共享资源继续保留。 */
  releaseUnused(scene: Scene) {
    const used = new Set<object>();
    for (const object of scene.objects) {
      used.add(object);
      if (object.mesh) used.add(object.mesh);
      if (object.material) {
        used.add(object.material);
      }
    }
    for (const resource of [...this.owned].reverse()) {
      if (!used.has(resource)) this.scope.release(resource);
    }
  }

  destroy() {
    this.shaders.clear();
    this.scope.destroy();
  }
}
