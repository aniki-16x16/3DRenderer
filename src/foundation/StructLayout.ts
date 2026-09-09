// 仅支持当前项目使用的 32 位标量、向量和 mat4；不冒充完整 WGSL 解析器。
const types = {
  f32: [4, 4, 1], u32: [4, 4, 1],
  vec2f: [8, 8, 2], vec3f: [16, 12, 3], vec4f: [16, 16, 4],
  mat4x4f: [16, 64, 16],
} as const;
type FieldType = keyof typeof types;
type Definition = Record<string, FieldType>;
type Value<T extends FieldType> = T extends "f32" | "u32" ? number : ArrayLike<number>;
type Values<T extends Definition> = { [K in keyof T]: Value<T[K]> };
const alignTo = (value: number, alignment: number) => Math.ceil(value / alignment) * alignment;

/** 字段顺序与 WGSL 声明一致；自动计算偏移、结构大小和尾部对齐。 */
export class StructLayout<T extends Definition> {
  readonly byteSize: number;
  readonly offsets: Readonly<Record<keyof T, number>>;
  private readonly fields: Readonly<T>;

  constructor(fields: T) {
    this.fields = Object.freeze({ ...fields });
    const offsets = {} as Record<keyof T, number>;
    let size = 0;
    let alignment = 1;
    for (const name of Object.keys(fields) as (keyof T)[]) {
      const [align, bytes] = types[fields[name]];
      size = alignTo(size, align);
      offsets[name] = size;
      size += bytes;
      alignment = Math.max(alignment, align);
    }
    this.offsets = Object.freeze(offsets);
    this.byteSize = alignTo(size, alignment);
  }

  create(values?: Partial<Values<T>>): ArrayBuffer {
    const buffer = new ArrayBuffer(this.byteSize);
    if (values) this.write(buffer, values);
    return buffer;
  }

  write(buffer: ArrayBuffer, values: Partial<Values<T>>, byteOffset = 0): void {
    if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + this.byteSize > buffer.byteLength) {
      throw new RangeError("Struct write exceeds buffer bounds");
    }
    const view = new DataView(buffer, byteOffset, this.byteSize);
    for (const name of Object.keys(values) as (keyof T)[]) {
      if (!Object.hasOwn(this.fields, name)) throw new Error(`Unknown field: ${String(name)}`);
      const type = this.fields[name];
      const value = values[name] as number | ArrayLike<number>;
      const count = types[type][2];
      const components = typeof value === "number" ? [value] : value;
      if (components.length !== count) throw new RangeError(`Invalid component count: ${String(name)}`);
      for (let i = 0; i < count; i++) {
        if (type === "u32") {
          if (!Number.isInteger(components[i]) || components[i] < 0 || components[i] > 0xffffffff) {
            throw new RangeError(`Invalid u32: ${String(name)}`);
          }
          view.setUint32(this.offsets[name] + i * 4, components[i], true);
        } else view.setFloat32(this.offsets[name] + i * 4, components[i], true);
      }
    }
  }
}
