import { Engine } from "./Engine";
import { ResourceScope } from "../utils/ResourceScope";
import { ForwardRenderer } from "../renderer/ForwardRenderer";
import type { Scene } from "../scene/Scene";
import { TextureResources } from "../assets/TextureResources";

/** 一个 canvas/device 的生命周期入口。场景对象在首次渲染时自动准备。 */
export class Application {
  readonly scope = new ResourceScope();
  readonly engine: Engine;
  readonly renderer: ForwardRenderer;
  readonly textures: TextureResources;
  private scene: Scene | null = null;

  get activeScene(): Scene | null {
    return this.scene;
  }

  private constructor(engine: Engine) {
    this.engine = this.scope.own(engine);
    try {
      this.textures = this.scope.own(new TextureResources(engine.device!));
      this.renderer = this.scope.own(new ForwardRenderer(engine, this.textures));
      const resize = () => engine.resize();
      window.addEventListener("resize", resize);
      this.scope.defer(() => window.removeEventListener("resize", resize));
      engine.resize();
    } catch (error) {
      this.scope.destroy();
      throw error;
    }
  }

  static async create(canvas: HTMLCanvasElement): Promise<Application> {
    const engine = new Engine(canvas);
    try {
      await engine.initialize();
      return new Application(engine);
    } catch (error) {
      engine.destroy();
      throw error;
    }
  }

  /** onFrame 在每次渲染调用后执行，供入口连接 FPS 等调试工具；时间单位为秒。 */
  async start(scene: Scene, onFrame?: (elapsedSeconds: number) => void): Promise<void> {
    if (this.scope.destroyed) throw new Error("Application has been destroyed");
    if (this.scene)
      throw new Error("Application already has a scene; runtime switching is not supported");
    if (scene.state !== "new") throw new Error("Start requires a new scene instance");
    this.scene = this.scope.own(scene);
    try {
      await scene.initialize({
        canvas: this.engine.canvas,
        textures: this.textures,
      });
      if (this.scope.destroyed)
        throw new DOMException("Application was destroyed during scene setup", "AbortError");
      this.engine.onResize = (width, height) => {
        if (scene.activeCamera) scene.activeCamera.aspect = width / height;
      };
      this.engine.resize();
      this.engine.onUpdate = (delta, elapsed) => {
        try {
          if (scene.state !== "ready") throw new Error("Active scene is not ready");
          scene.update(delta, elapsed);
        } catch (error) {
          this.destroy();
          throw error;
        }
      };
      this.engine.onRender = () => {
        try {
          this.renderer.render(scene);
          onFrame?.(this.engine.elapsedSeconds);
        } catch (error) {
          this.destroy();
          throw error;
        }
      };
      this.engine.start();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  destroy() {
    this.engine.stop();
    try {
      this.scope.destroy();
    } finally {
      this.scene = null;
    }
  }
}
