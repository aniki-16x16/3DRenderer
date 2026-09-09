export interface Destroyable { destroy(): void }

/** 显式所有权：登记一次，按依赖的逆序清理；借用资源不登记。 */
export class ResourceScope {
  private cleanups = new Map<object, () => void>();
  private closed = false;

  get destroyed() { return this.closed; }

  own<T extends Destroyable>(resource: T): T {
    return this.adopt(resource, () => resource.destroy());
  }

  adopt<T extends object>(resource: T, cleanup: () => void): T {
    if (this.closed) {
      cleanup();
      throw new Error("ResourceScope has been destroyed");
    }
    if (!this.cleanups.has(resource)) this.cleanups.set(resource, cleanup);
    return resource;
  }

  defer(cleanup: () => void): void { this.adopt(cleanup, cleanup); }

  release(resource: object): void {
    const cleanup = this.cleanups.get(resource);
    this.cleanups.delete(resource);
    cleanup?.();
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    const cleanups = [...this.cleanups.values()].reverse();
    this.cleanups.clear();
    const errors: unknown[] = [];
    for (const cleanup of cleanups) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Resource cleanup failed");
  }
}
