import type { Scene } from "../scene/Scene";
import { TextureResources } from "../assets/TextureResources";
import { ResourceScope } from "../utils/ResourceScope";
import { SceneResources } from "./SceneResources";
import { FrameBindings } from "./FrameBindings";
import { FrameTargets, HDR_FORMAT } from "./FrameTargets";
import { sortObjectsByMaterial } from "./drawObjects";
import { ShadowPass } from "./passes/ShadowPass";
import { encodeForwardPass } from "./passes/ForwardPass";
import { OutputPass } from "./passes/OutputPass";

/** Renderer 只借用运行环境信息，不依赖应用或帧循环的具体实现。 */
export interface RenderHost {
  readonly device: GPUDevice | null;
  readonly context: GPUCanvasContext | null;
  readonly format: GPUTextureFormat | null;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly elapsedSeconds: number;
}

/** 负责逐帧编排和一次命令提交；各模块管理各自的资源生命周期。 */
export class ForwardRenderer {
  private readonly scope = new ResourceScope();
  private readonly host: RenderHost;
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly targets: FrameTargets;
  private readonly frameBindings: FrameBindings;
  private readonly shadowPass: ShadowPass;
  private readonly outputPass: OutputPass;
  readonly resources: SceneResources;
  readonly textures: TextureResources;

  constructor(host: RenderHost, textures?: TextureResources) {
    const { device, context, format } = host;
    if (!device || !context || !format)
      throw new Error("Initialize render host before constructing ForwardRenderer");
    this.host = host;
    this.device = device;
    this.context = context;
    try {
      if (textures && textures.device !== device)
        throw new Error("TextureResources belongs to another GPUDevice");
      this.textures = textures ?? this.scope.own(new TextureResources(device));
      this.resources = this.scope.own(new SceneResources(device, HDR_FORMAT, this.textures));
      this.targets = this.scope.own(new FrameTargets(device));
      this.shadowPass = this.scope.own(new ShadowPass(device, format));
      this.frameBindings = this.scope.own(
        new FrameBindings(
          device,
          this.textures,
          this.shadowPass.depthView,
          this.shadowPass.matrixBuffer,
        ),
      );
      this.outputPass = this.scope.own(new OutputPass());
      this.outputPass.initialize(device, format);
    } catch (error) {
      this.scope.destroy();
      throw error;
    }
  }

  resize(width: number, height: number): void {
    if (this.scope.destroyed) throw new Error("Renderer has been destroyed");
    this.targets.resize(width, height);
    this.outputPass.setInput(this.targets.colorView);
  }

  render(scene: Scene): void {
    if (this.scope.destroyed) throw new Error("Renderer has been destroyed");
    const camera = scene.activeCamera;
    if (!camera) return;
    scene.environment?.assertUsable(this.device);
    this.resources.prepare(scene);
    this.resize(this.host.canvas.width, this.host.canvas.height);
    this.frameBindings.update(camera, scene.lights, this.host.elapsedSeconds, scene.environment);
    this.shadowPass.update(scene.lights[0]);
    const objects = sortObjectsByMaterial(scene.objects);
    const target = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    this.shadowPass.encode(encoder, objects);
    encodeForwardPass(
      encoder,
      objects,
      this.frameBindings.bindGroup,
      this.targets.colorView,
      this.targets.depthView,
    );
    this.outputPass.encode(encoder, target, scene.output);
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.scope.destroy();
  }
}
