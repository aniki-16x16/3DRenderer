/**
 * 引擎核心类
 * 负责管理 WebGPU 上下文、设备初始化、以及主渲染循环
 */
export class Engine {
  canvas: HTMLCanvasElement;

  // WebGPU 核心对象
  adapter: GPUAdapter | null = null;
  device: GPUDevice | null = null;
  context: GPUCanvasContext | null = null;
  format: GPUTextureFormat | null = null;

  // 渲染循环控制
  private animationId?: number;
  private running: boolean = false;
  private lastFrameTime: number = 0;
  private startTime?: number;
  private elapsedTime = 0;

  /** 当前帧距首次 start 的秒数；停止期间的时间也计入。 */
  get elapsedSeconds(): number {
    return this.elapsedTime;
  }

  // 外部回调
  onUpdate?: (deltaTime: number, totalTime: number) => void;
  onRender?: () => void;
  onResize?: (width: number, height: number) => void;

  /**
   * @param canvas 用于渲染的 HTMLCanvas 元素
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * 初始化 WebGPU API
   */
  async initialize(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser.");
    }
    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      throw new Error("Failed to get GPU adapter.");
    }
    this.device = await this.adapter.requestDevice();
    if (!this.device) {
      throw new Error("Failed to get GPU device.");
    }
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("Failed to get WebGPU canvas context");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context!.configure({
      device: this.device!,
      format: this.format!,
      alphaMode: "premultiplied",
    });
  }

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.startTime ??= this.lastFrameTime;
    this.tick();
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    this.running = false;
    if (this.animationId !== undefined) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  destroy(): void {
    this.stop();
    this.context?.unconfigure();
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.onUpdate = undefined;
    this.onRender = undefined;
    this.onResize = undefined;
  }

  /**
   * 调整画布大小
   * 建议在这里处理 devicePixelRatio，确保高清屏渲染清晰度
   */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.onResize) {
      this.onResize(this.canvas.width, this.canvas.height);
    }
  }

  /**
   * 内部循环函数
   */
  private tick(): void {
    if (!this.running) return;

    // 计算 deltaTime (可选，建议使用 performance.now())
    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.elapsedTime = (now - this.startTime!) / 1000;

    // 逻辑更新
    if (this.onUpdate) {
      this.onUpdate(deltaTime, this.elapsedTime);
    }

    // 渲染调用
    if (this.onRender) {
      this.onRender();
    }

    if (this.running) this.animationId = requestAnimationFrame(() => this.tick());
  }
}
