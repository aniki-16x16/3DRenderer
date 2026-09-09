import { ResourceScope } from "../foundation/ResourceScope";
import type { Scene } from "../core/Scene";
import { Material } from "../graphics/Material";
import { Shader } from "../graphics/Shader";
import { PBRMaterial } from "../materials/PBR";
import { PhongMaterial } from "../materials/Phong";
import { SolidColorMaterial } from "../materials/SolidColor";
import pbr from "../shaders/pbr.wgsl?raw";
import phong from "../shaders/phong.wgsl?raw";
import solid from "../shaders/solid.wgsl?raw";

const owners = new WeakMap<object, SceneResources>();

/** Renderer 拥有首次提交的资源；Scene.remove 仅移除引用，不销毁共享资源。 */
export class SceneResources {
  private scope = new ResourceScope();
  private initialized = new WeakSet<object>();
  private owned = new Set<{ destroy(): void }>();
  private shaders = new Map<string, Shader>();
  private customShaders = new WeakMap<Material, string>();
  private device: GPUDevice;
  private format: GPUTextureFormat;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
  }

  setShader(material: Material, code: string) {
    if (this.initialized.has(material)) throw new Error("Set shader before first render");
    this.customShaders.set(material, code);
  }

  private ensure<T extends { destroy(): void }>(resource: T, initialize: () => void) {
    if (this.initialized.has(resource)) return;
    const owner = owners.get(resource);
    if (owner && owner !== this) throw new Error("Resource already belongs to another renderer; create a separate instance");
    owners.set(resource, this);
    this.owned.add(resource);
    this.scope.adopt(resource, () => {
      try { resource.destroy(); }
      finally { owners.delete(resource); this.owned.delete(resource); this.initialized.delete(resource); }
    });
    initialize();
    this.initialized.add(resource);
  }

  prepare(scene: Scene) {
    if (this.scope.destroyed) throw new Error("SceneResources has been destroyed");
    for (const object of scene.objects) {
      const { mesh, material } = object;
      if (!mesh || !material) continue;
      this.ensure(mesh, () => mesh.initialize(this.device));
      if (material instanceof PhongMaterial) {
        for (const texture of [material.texture, material.normalTexture]) {
          if (texture) this.ensure(texture, () => { if (!texture.view) texture.initialize(this.device); });
        }
      }
      this.ensure(material, () => {
        const code = this.customShaders.get(material) ??
          (material instanceof PBRMaterial ? pbr : material instanceof PhongMaterial ? phong : material instanceof SolidColorMaterial ? solid : undefined);
        if (code === undefined) throw new Error(`Register a shader for ${material.label} before rendering`);
        let shader = this.shaders.get(code);
        if (!shader) { shader = new Shader(this.device, material.label, code); this.shaders.set(code, shader); }
        material.initialize(this.device, this.format, shader);
      });
      this.ensure(object, () => object.initialize(this.device));
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
        if (object.material instanceof PhongMaterial) {
          if (object.material.texture) used.add(object.material.texture);
          if (object.material.normalTexture) used.add(object.material.normalTexture);
        }
      }
    }
    for (const resource of [...this.owned].reverse()) {
      if (!used.has(resource)) this.scope.release(resource);
    }
  }

  destroy() { this.shaders.clear(); this.scope.destroy(); }
}
