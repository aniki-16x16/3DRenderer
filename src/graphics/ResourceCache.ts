/** 缓存身份使用结构化参数，避免分隔符拼接造成碰撞。 */
export const resourceKeys = {
  materialLayout: (tag: string) => JSON.stringify(["material-layout", tag]),
  pipelineLayout: (ids: number[]) => JSON.stringify(["pipeline-layout", ids]),
  renderPipeline: (config: Record<string, unknown>) => JSON.stringify(["render-pipeline", config]),
};

export class ResourceCache {
  private getOrCreate<T>(cache: Map<string, T>, key: string, create: () => T): T {
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const value = create();
    cache.set(key, value);
    return value;
  }

  bindGroupLayout(key: string, create: () => GPUBindGroupLayout) {
    return this.getOrCreate(this.bindGroupLayouts, key, create);
  }

  pipelineLayout(key: string, create: () => GPUPipelineLayout) {
    return this.getOrCreate(this.pipelineLayouts, key, create);
  }

  renderPipeline(key: string, create: () => GPURenderPipeline) {
    return this.getOrCreate(this.renderPipelines, key, create);
  }

  private resourceIds = new WeakMap<object, number>();
  private nextResourceId = 1;

  getResourceId(resource: object): number {
    const cachedId = this.resourceIds.get(resource);
    if (cachedId !== undefined) return cachedId;

    const id = this.nextResourceId++;
    this.resourceIds.set(resource, id);
    return id;
  }

  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();

  private pipelineLayouts: Map<string, GPUPipelineLayout> = new Map();

  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
}

const deviceResourceCaches = new WeakMap<GPUDevice, ResourceCache>();

export function getResourceCache(device: GPUDevice): ResourceCache {
  const cached = deviceResourceCaches.get(device);
  if (cached) return cached;

  const cache = new ResourceCache();
  deviceResourceCaches.set(device, cache);
  return cache;
}
