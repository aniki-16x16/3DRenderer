import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ResourceScope } from '../src/foundation/ResourceScope.ts';
import { StructLayout } from '../src/foundation/StructLayout.ts';
import { cameraLayout, lightLayout, pbrLayout, phongLayout } from '../src/graphics/BufferLayouts.ts';
import { ForwardRenderer } from '../src/renderer/ForwardRenderer.ts';
import { Scene } from '../src/core/Scene.ts';
import { Camera } from '../src/core/Camera.ts';
import { ParallelLight } from '../src/core/ParallelLight.ts';
import { Mesh } from '../src/graphics/Mesh.ts';
import { Object3D } from '../src/core/Object3D.ts';
import { PBRMaterial } from '../src/materials/PBR.ts';
import { StandardLayouts } from '../src/graphics/StandardLayouts.ts';

test('scope deduplicates, disposes in reverse order and continues after failure', () => {
  const scope = new ResourceScope(), calls = [];
  const a = { destroy() { calls.push('a'); } };
  scope.own(a); scope.own(a);
  scope.defer(() => { calls.push('b'); throw Error('failure'); });
  assert.throws(() => scope.destroy(), AggregateError);
  scope.destroy();
  assert.deepEqual(calls, ['b', 'a']);
  assert.throws(() => scope.own({ destroy() { calls.push('late'); } }));
  assert.equal(calls.at(-1), 'late');
});

test('CPU contract: offsets, integer encoding, matrix and tail padding', () => {
  assert.equal(lightLayout.byteSize, 48);
  assert.deepEqual(lightLayout.offsets, { position: 0, light_type: 12, color: 16, intensity: 28, direction: 32, range: 44 });
  assert.equal(cameraLayout.byteSize, 80);
  assert.equal(cameraLayout.offsets.light_count, 76);
  assert.equal(pbrLayout.byteSize, 32); assert.equal(phongLayout.byteSize, 32);
  const bytes = lightLayout.create({ position: [1, 2, 3], light_type: 2, intensity: 4 });
  const view = new DataView(bytes);
  assert.equal(view.getUint32(12, true), 2);
  assert.equal(view.getFloat32(28, true), 4);
  assert.equal(view.getFloat32(44, true), 0);
  const aligned = new StructLayout({ x: 'f32', v: 'vec3f' });
  assert.equal(aligned.offsets.v, 16); assert.equal(aligned.byteSize, 32);
  assert.throws(() => lightLayout.write(bytes, { position: [1, 2] }), RangeError);
  assert.throws(() => lightLayout.write(bytes, { light_type: -1 }), RangeError);
  assert.throws(() => lightLayout.write(bytes, { intensity: 2 }, 4), RangeError);
});

globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16 };
globalThis.GPUTextureUsage = { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_DST: 4 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2 };
function fixture() {
  const buffers = [], textures = [], writes = [];
  const pass = new Proxy({}, { get: () => () => {} });
  const device = {
    limits: { maxStorageBufferBindingSize: 48 * 8, maxBufferSize: 48 * 8 },
    createBuffer(desc) {
      const data = new ArrayBuffer(desc.size);
      const buffer = { ...desc, data, destroyed: 0, destroy() { this.destroyed++; }, getMappedRange() { return data; }, unmap() {} };
      buffers.push(buffer); return buffer;
    },
    createTexture(desc) {
      const texture = { width: desc.size[0], height: desc.size[1], destroyed: 0, destroy() { this.destroyed++; }, createView() { return {}; } };
      textures.push(texture); return texture;
    },
    createBindGroupLayout: d => ({ ...d }), createPipelineLayout: d => ({ ...d }),
    createRenderPipeline: d => ({ ...d }), createBindGroup: d => ({ ...d }),
    createSampler: d => ({ ...d }), createShaderModule: d => ({ ...d }),
    createCommandEncoder: () => ({ beginRenderPass: () => pass, finish: () => ({}) }),
    queue: { submit() {}, writeBuffer(buffer, offset, data) {
      const bytes = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
      assert.ok(offset + bytes.length <= buffer.size, 'GPU write stays in bounds');
      new Uint8Array(buffer.data).set(bytes, offset);
      writes.push(buffer);
    } },
  };
  const engine = { device, format: 'rgba8unorm', context: { getCurrentTexture: () => ({ createView: () => ({}) }) }, canvas: { width: 100, height: 100 } };
  return { engine, device, buffers, textures, writes };
}

test('renderer grows lights, uploads actual count after shrink and handles zero', () => {
  const f = fixture(), renderer = new ForwardRenderer(f.engine), scene = new Scene();
  scene.activeCamera = new Camera();
  for (const count of [0, 1, 3, 2, 0, 5]) {
    scene.lights = Array.from({ length: count }, () => new ParallelLight());
    renderer.render(scene);
    const camera = f.buffers.find(b => b.label === 'GlobalCameraBuffer');
    assert.equal(new DataView(camera.data).getUint32(76, true), count);
  }
  const lights = f.buffers.filter(b => b.label === 'LightBuffer');
  assert.deepEqual(lights.map(b => b.size), [48, 144, 288]);
  assert.deepEqual(lights.map(b => b.destroyed), [1, 1, 0]);
  scene.lights = Array.from({ length: 9 }, () => new ParallelLight());
  assert.throws(() => renderer.render(scene), RangeError);
  renderer.destroy(); renderer.destroy();
  assert.ok(f.buffers.every(b => b.destroyed === 1));
  assert.ok(f.textures.every(t => t.destroyed === 1));
});

test('shared mesh/material initialize once; collection retains live references', () => {
  const f = fixture(), renderer = new ForwardRenderer(f.engine), scene = new Scene();
  scene.activeCamera = new Camera();
  const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const material = new PBRMaterial({ baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1 });
  const a = new Object3D('a', mesh, material), b = new Object3D('b', mesh, material);
  scene.add(a).add(b); renderer.render(scene);
  const vertexBuffer = mesh.vertexBuffer, uniform = material.uniformBuffer, count = f.buffers.length;
  renderer.render(scene); assert.equal(f.buffers.length, count);
  scene.remove(a); renderer.resources.releaseUnused(scene);
  assert.equal(a.modelBuffer, null); assert.equal(vertexBuffer.destroyed, 0);
  const second = new ForwardRenderer(fixture().engine);
  assert.throws(() => second.render(scene), /another renderer/); second.destroy();
  scene.remove(b); renderer.resources.releaseUnused(scene);
  assert.equal(vertexBuffer.destroyed, 1); assert.equal(uniform.destroyed, 1);
  scene.add(a); renderer.render(scene); assert.notEqual(mesh.vertexBuffer, vertexBuffer);
  renderer.destroy(); assert.ok(f.buffers.every(b => b.destroyed === 1));
});

test('layouts are cached by device', () => {
  const a = fixture().device, b = fixture().device;
  assert.equal(StandardLayouts.forDevice(a), StandardLayouts.forDevice(a));
  assert.notEqual(StandardLayouts.forDevice(a), StandardLayouts.forDevice(b));
});

test('renderer constructor rolls back resources when initialization throws', () => {
  const f = fixture();
  let calls = 0;
  f.device.createBindGroup = descriptor => {
    if (++calls === 3) throw new Error('Injected bind group failure');
    return descriptor;
  };
  assert.throws(() => new ForwardRenderer(f.engine), /Injected/);
  assert.ok(f.buffers.length > 0);
  assert.ok(f.buffers.every(b => b.destroyed === 1));
  assert.ok(f.textures.every(t => t.destroyed === 1));
});

test('shader declarations retain the same named layout as the CPU', () => {
  for (const name of ['pbr', 'phong']) {
    const shader = readFileSync(new URL(`../src/shaders/${name}.wgsl`, import.meta.url), 'utf8');
    for (const [structName, layout] of [['CameraUniforms', cameraLayout], ['LightData', lightLayout], ['MaterialUniforms', name === 'pbr' ? pbrLayout : phongLayout]]) {
      const body = shader.match(new RegExp(`struct ${structName} \\{([^}]+)\\}`))[1];
      const fields = Object.fromEntries([...body.matchAll(/(\w+)\s*:\s*(\w+)\s*,/g)].map(m => [m[1], m[2]]));
      const declared = new StructLayout(fields);
      assert.deepEqual(declared.offsets, layout.offsets);
      assert.equal(declared.byteSize, layout.byteSize);
      if (structName === 'CameraUniforms') assert.equal(fields.light_count, 'u32');
      if (structName === 'LightData') assert.equal(fields.light_type, 'u32');
    }
  }
});
