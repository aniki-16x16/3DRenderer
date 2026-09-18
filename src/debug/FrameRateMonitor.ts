const HISTORY_MS = 30_000;
const SAMPLE_MS = 250;
const SVG_NS = "http://www.w3.org/2000/svg";

/** 主循环的帧率统计与展示；不代表 GPU 单帧执行耗时。 */
export class FrameRateMonitor {
  private readonly element = document.createElement("aside");
  private readonly value = document.createElement("strong");
  private readonly scale = document.createElement("span");
  private readonly line = document.createElementNS(SVG_NS, "polyline");
  private readonly samples: { time: number; fps: number }[] = [];
  private lastTime: number | undefined;
  private duration = 0;
  private frames = 0;

  constructor() {
    this.element.className = "frame-rate-monitor";
    this.element.setAttribute("aria-label", "帧率监控，最近 30 秒");
    this.element.title = "主渲染循环帧率，每 250 毫秒采样；非 GPU 计时";
    const header = document.createElement("div");
    header.className = "frame-rate-monitor__header";
    const label = document.createElement("span");
    label.textContent = "FPS";
    this.value.textContent = "—";
    header.append(label, this.value);

    const graph = document.createElementNS(SVG_NS, "svg");
    graph.setAttribute("viewBox", "0 0 240 80");
    graph.setAttribute("aria-hidden", "true");
    const grid = document.createElementNS(SVG_NS, "path");
    grid.setAttribute("d", "M0 2H240 M0 40H240 M0 78H240");
    grid.setAttribute("class", "frame-rate-monitor__grid");
    this.line.setAttribute("class", "frame-rate-monitor__line");
    graph.append(grid, this.line);

    const axis = document.createElement("div");
    axis.className = "frame-rate-monitor__axis";
    const history = document.createElement("span");
    history.textContent = "−30 秒";
    const now = document.createElement("span");
    now.textContent = "现在";
    axis.append(history, this.scale, now);
    this.element.append(header, graph, axis);
    this.reset();
    document.body.append(this.element);
    document.addEventListener("visibilitychange", this.reset);
  }

  /** 每次主循环调用一次，时间单位为毫秒；首帧只建立计时基准。 */
  recordFrame(time: number): void {
    if (document.hidden) return;
    if (this.lastTime === undefined) {
      this.lastTime = time;
      return;
    }
    const delta = time - this.lastTime;
    this.lastTime = time;
    if (delta <= 0) return;
    this.duration += delta;
    this.frames++;
    if (this.duration < SAMPLE_MS) return;

    const fps = (this.frames * 1000) / this.duration;
    this.samples.push({ time, fps });
    while (this.samples.length && this.samples[0]!.time < time - HISTORY_MS) {
      this.samples.shift();
    }
    this.value.textContent = fps.toFixed(1);
    // 随历史峰值调整纵轴，兼容高刷新率显示器。
    const ceiling = Math.max(60, Math.ceil(Math.max(...this.samples.map((s) => s.fps)) / 30) * 30);
    this.scale.textContent = `0–${ceiling} FPS`;
    this.line.setAttribute(
      "points",
      this.samples
        .map((sample) => {
          const x = 1 + (1 - (time - sample.time) / HISTORY_MS) * 238;
          const y = 78 - (sample.fps / ceiling) * 76;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" "),
    );
    this.duration = 0;
    this.frames = 0;
  }

  private readonly reset = (): void => {
    this.lastTime = undefined;
    this.duration = 0;
    this.frames = 0;
    this.samples.length = 0;
    this.value.textContent = "—";
    this.scale.textContent = "0–60 FPS";
    this.line.setAttribute("points", "");
  };

  destroy(): void {
    document.removeEventListener("visibilitychange", this.reset);
    this.element.remove();
  }
}
