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
  private _animationId?: number;
  private _isRunning: boolean = false;
  private _lastFrameTime: number = 0;

  // 外部回调
  onUpdate?: (deltaTime: number) => void;
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
  async init(): Promise<void> {
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
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastFrameTime = performance.now();
    this._run();
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    this._isRunning = false;
    if (this._animationId !== undefined) {
      cancelAnimationFrame(this._animationId);
      this._animationId = undefined;
    }
  }

  /**
   * 调整画布大小
   * 建议在这里处理 devicePixelRatio，确保高清屏渲染清晰度
   */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.onResize) {
      this.onResize(this.canvas.width, this.canvas.height);
    }
  }

  /**
   * 内部循环函数
   */
  private _run(): void {
    if (!this._isRunning) return;

    // 计算 deltaTime (可选，建议使用 performance.now())
    const now = performance.now();
    const deltaTime = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    // 逻辑更新
    if (this.onUpdate) {
      this.onUpdate(deltaTime);
    }

    // 渲染调用
    if (this.onRender) {
      this.onRender();
    }

    this._animationId = requestAnimationFrame(() => this._run());
  }
}
