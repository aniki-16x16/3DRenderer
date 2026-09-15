import { Object3D } from "./Object3D";
import { Camera } from "./Camera";
import { Light } from "./Light";
import type { Texture } from "../graphics/Texture";
import type { TextureResources } from "../graphics/TextureResources";
import { ResourceScope } from "../foundation/ResourceScope";

export interface SceneContext {
  readonly canvas: HTMLCanvasElement;
  readonly textures: TextureResources;
  readonly signal: AbortSignal;
  readonly setExposure: (value: number) => void;
}

export type SceneState = "new" | "loading" | "ready" | "destroyed";

export class Scene {
  readonly name: string;
  /** 场景拥有 GUI、控制器等辅助资源；不要重复登记 Renderer 接管的 Mesh/Material。 */
  protected readonly scope = new ResourceScope();
  private readonly abortController = new AbortController();
  private lifecycleState: SceneState = "new";

  constructor(name = "Scene") {
    this.name = name;
  }

  get state(): SceneState {
    return this.lifecycleState;
  }

  /** Application 调用一次；子类通过 setup 定义可复用的代码场景。 */
  async initialize(context: Omit<SceneContext, "signal">): Promise<void> {
    if (this.state !== "new")
      throw new Error(`Scene ${this.name} cannot initialize from ${this.state}`);
    this.lifecycleState = "loading";
    try {
      await this.setup({ ...context, signal: this.abortController.signal });
      this.abortController.signal.throwIfAborted();
      this.lifecycleState = "ready";
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  protected setup(_context: SceneContext): void | Promise<void> {}

  /** 初始化完成后由 Application 每帧调用，单位为秒。 */
  update(_deltaSeconds: number, _elapsedSeconds: number): void {}

  destroy() {
    if (this.state === "destroyed") return;
    this.lifecycleState = "destroyed";
    this.abortController.abort();
    try {
      this.scope.destroy();
    } finally {
      this.objects = [];
      this.lights = [];
      this.activeCamera = null;
      this.environment = null;
    }
  }
  objects: Object3D[] = [];
  lights: Light[] = [];
  activeCamera: Camera | null = null;
  /** 借用原始环境纹理；这里只保存引用，尚未接入背景或 IBL 采样。 */
  environment: Texture | null = null;

  add(object: Object3D): Scene;
  add(light: Light): Scene;
  add(item: Object3D | Light): Scene {
    if (this.state === "destroyed") throw new Error(`Scene ${this.name} has been destroyed`);
    if (item instanceof Object3D) {
      if (!this.objects.includes(item)) this.objects.push(item);
    } else if (item instanceof Light) {
      if (!this.lights.includes(item)) this.lights.push(item);
    }
    return this;
  }

  remove(object: Object3D): Scene;
  remove(light: Light): Scene;
  remove(item: Object3D | Light): Scene {
    if (item instanceof Object3D) {
      this.objects = this.objects.filter((obj) => obj !== item);
    } else if (item instanceof Light) {
      this.lights = this.lights.filter((l) => l !== item);
    }
    return this;
  }
}
