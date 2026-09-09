import { Engine } from "../core/Engine";
import { ResourceScope } from "../foundation/ResourceScope";
import { ForwardRenderer } from "../renderer/ForwardRenderer";
import type { Scene } from "../core/Scene";

/** 一个 canvas/device 的生命周期入口。场景对象在首次渲染时自动准备。 */
export class Application {
  readonly scope = new ResourceScope();
  readonly engine: Engine;
  readonly renderer: ForwardRenderer;

  private constructor(engine: Engine) {
    this.engine = this.scope.own(engine);
    this.renderer = this.scope.own(new ForwardRenderer(engine));
    const resize = () => engine.resize();
    window.addEventListener("resize", resize);
    this.scope.defer(() => window.removeEventListener("resize", resize));
    engine.resize();
  }

  static async create(canvas: HTMLCanvasElement): Promise<Application> {
    const engine = new Engine(canvas);
    try {
      await engine.init();
      return new Application(engine);
    } catch (error) { engine.destroy(); throw error; }
  }

  start(scene: Scene) {
    if (this.scope.destroyed) throw new Error("Application has been destroyed");
    this.engine.onResize = (width, height) => {
      if (scene.activeCamera) scene.activeCamera.aspect = width / height;
    };
    this.engine.resize();
    this.engine.onRender = () => {
      try { this.renderer.render(scene); }
      catch (error) { this.destroy(); throw error; }
    };
    this.engine.start();
  }

  destroy() {
    this.engine.stop();
    this.scope.destroy();
  }
}
