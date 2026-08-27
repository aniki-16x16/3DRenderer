export class ResourceCache {
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
  getBindGroupLayout(
    key: string,
    subType?: string,
  ): GPUBindGroupLayout | undefined {
    return this.bindGroupLayouts.get(getFinalKey(key, subType));
  }
  setBindGroupLayout(
    key: string,
    layout: GPUBindGroupLayout,
    subType?: string,
  ): void {
    this.bindGroupLayouts.set(getFinalKey(key, subType), layout);
  }

  private pipelineLayouts: Map<string, GPUPipelineLayout> = new Map();
  getPipelineLayout(
    key: string,
    subType?: string,
  ): GPUPipelineLayout | undefined {
    return this.pipelineLayouts.get(getFinalKey(key, subType));
  }
  setPipelineLayout(
    key: string,
    layout: GPUPipelineLayout,
    subType?: string,
  ): void {
    this.pipelineLayouts.set(getFinalKey(key, subType), layout);
  }

  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
  getRenderPipeline(
    key: string,
    subType?: string,
  ): GPURenderPipeline | undefined {
    return this.renderPipelines.get(getFinalKey(key, subType));
  }
  setRenderPipeline(
    key: string,
    pipeline: GPURenderPipeline,
    subType?: string,
  ): void {
    this.renderPipelines.set(getFinalKey(key, subType), pipeline);
  }
}

const deviceResourceCaches = new WeakMap<GPUDevice, ResourceCache>();

export function getResourceCache(device: GPUDevice): ResourceCache {
  const cached = deviceResourceCaches.get(device);
  if (cached) return cached;

  const cache = new ResourceCache();
  deviceResourceCaches.set(device, cache);
  return cache;
}

function getFinalKey(key: string, subType?: string): string {
  return subType === undefined ? key : `${key}::${subType}`;
}
