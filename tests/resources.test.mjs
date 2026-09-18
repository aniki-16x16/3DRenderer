import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ResourceScope } from "../src/utils/ResourceScope.ts";
import { StructLayout } from "../src/gpu/StructLayout.ts";
import {
  cameraLayout,
  lightLayout,
  pbrLayout,
  phongLayout,
} from "../src/renderer/layouts/BufferLayouts.ts";
import { ForwardRenderer } from "../src/renderer/ForwardRenderer.ts";
import { Scene } from "../src/scene/Scene.ts";
import { Camera } from "../src/scene/Camera.ts";
import { DirectionalLight } from "../src/scene/DirectionalLight.ts";
import { Mesh } from "../src/assets/Mesh.ts";
import { Object3D } from "../src/scene/Object3D.ts";
import { PBRMaterial } from "../src/materials/PBR.ts";
import { BindGroupLayouts } from "../src/renderer/layouts/BindGroupLayouts.ts";
import { Engine } from "../src/app/Engine.ts";
import { TextureResources } from "../src/assets/TextureResources.ts";
import { PhongMaterial } from "../src/materials/Phong.ts";
import { Application } from "../src/app/Application.ts";
import { SolidColorMaterial } from "../src/materials/SolidColor.ts";

test("scope deduplicates, disposes in reverse order and continues after failure", () => {
  const scope = new ResourceScope(),
    calls = [];
  const a = {
    destroy() {
      calls.push("a");
    },
  };
  scope.own(a);
  scope.own(a);
  scope.defer(() => {
    calls.push("b");
    throw Error("failure");
  });
  assert.throws(() => scope.destroy(), AggregateError);
  scope.destroy();
  assert.deepEqual(calls, ["b", "a"]);
  assert.throws(() =>
    scope.own({
      destroy() {
        calls.push("late");
      },
    }),
  );
  assert.equal(calls.at(-1), "late");
});

test("CPU contract: offsets, integer encoding, matrix and tail padding", () => {
  assert.equal(lightLayout.byteSize, 48);
  assert.deepEqual(lightLayout.offsets, {
    position: 0,
    light_type: 12,
    color: 16,
    intensity: 28,
    direction: 32,
    range: 44,
  });
  assert.equal(cameraLayout.byteSize, 80);
  assert.equal(cameraLayout.offsets.light_count, 76);
  assert.equal(pbrLayout.byteSize, 32);
  assert.equal(phongLayout.byteSize, 32);
  const bytes = lightLayout.create({ position: [1, 2, 3], light_type: 2, intensity: 4 });
  const view = new DataView(bytes);
  assert.equal(view.getUint32(12, true), 2);
  assert.equal(view.getFloat32(28, true), 4);
  assert.equal(view.getFloat32(44, true), 0);
  const aligned = new StructLayout({ x: "f32", v: "vec3f" });
  assert.equal(aligned.offsets.v, 16);
  assert.equal(aligned.byteSize, 32);
  assert.throws(() => lightLayout.write(bytes, { position: [1, 2] }), RangeError);
  assert.throws(() => lightLayout.write(bytes, { light_type: -1 }), RangeError);
  assert.throws(() => lightLayout.write(bytes, { intensity: 2 }, 4), RangeError);
});

globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16 };
globalThis.GPUTextureUsage = { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_DST: 4 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2 };
function fixture() {
  const buffers = [],
    textures = [],
    bindGroups = [],
    writes = [];
  const pass = new Proxy({}, { get: () => () => {} });
  const device = {
    limits: { maxStorageBufferBindingSize: 48 * 8, maxBufferSize: 48 * 8 },
    createBuffer(desc) {
      const data = new ArrayBuffer(desc.size);
      const buffer = {
        ...desc,
        data,
        destroyed: 0,
        destroy() {
          this.destroyed++;
        },
        getMappedRange() {
          return data;
        },
        unmap() {},
      };
      buffers.push(buffer);
      return buffer;
    },
    createTexture(desc) {
      const texture = {
        ...desc,
        width: desc.size[0],
        height: desc.size[1],
        destroyed: 0,
        destroy() {
          this.destroyed++;
        },
        createView() {
          return {};
        },
      };
      textures.push(texture);
      return texture;
    },
    createBindGroupLayout: (d) => ({ ...d }),
    createPipelineLayout: (d) => ({ ...d }),
    createRenderPipeline: (d) => ({ ...d }),
    createBindGroup: (d) => {
      const group = { ...d };
      bindGroups.push(group);
      return group;
    },
    createSampler: (d) => ({ ...d }),
    createShaderModule: (d) => ({ ...d }),
    createCommandEncoder: () => ({ beginRenderPass: () => pass, finish: () => ({}) }),
    queue: {
      writeTexture() {},
      submit() {},
      writeBuffer(buffer, offset, data) {
        const bytes = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
        assert.ok(offset + bytes.length <= buffer.size, "GPU write stays in bounds");
        new Uint8Array(buffer.data).set(bytes, offset);
        writes.push(buffer);
      },
    },
  };
  const engine = {
    elapsedSeconds: 0,
    device,
    format: "rgba8unorm",
    context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
    canvas: { width: 100, height: 100 },
  };
  return { engine, device, buffers, textures, writes, bindGroups };
}

function appFixture(t) {
  const f = fixture();
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  t.after(() => {
    globalThis.window = previousWindow;
  });
  f.engine.resize = () => f.engine.onResize?.(100, 100);
  f.engine.stop = () => {};
  f.engine.destroy = () => {
    f.engine.dead = true;
  };
  f.engine.start = () => {
    f.engine.started = true;
  };
  return { ...f, app: new Application(f.engine) };
}

test("application waits for setup, forwards frames, and rejects a second scene", async (t) => {
  const { app, engine } = appFixture(t);
  let resume,
    cleanup = 0;
  class Demo extends Scene {
    async setup() {
      this.scope.defer(() => cleanup++);
      this.activeCamera = new Camera();
      await new Promise((resolve) => {
        resume = resolve;
      });
    }
    update(delta, elapsed) {
      this.frame = [delta, elapsed];
    }
  }
  const scene = new Demo();
  const starting = app.start(scene);
  assert.equal(engine.started, undefined);
  assert.equal(app.activeScene, scene);
  const other = new Scene();
  await assert.rejects(app.start(other), /already has a scene/);
  assert.equal(other.state, "new");
  resume();
  await starting;
  assert.equal(engine.started, true);
  engine.onUpdate(0.1, 2);
  assert.deepEqual(scene.frame, [0.1, 2]);
  assert.equal(scene.activeCamera.aspect, 1);
  app.destroy();
  app.destroy();
  assert.equal(cleanup, 1);
  assert.equal(scene.state, "destroyed");
  assert.equal(app.activeScene, null);
});

test("application shutdown during setup never starts a frame loop", async (t) => {
  const { app, engine } = appFixture(t);
  let resume;
  class Slow extends Scene {
    async setup() {
      await new Promise((resolve) => {
        resume = resolve;
      });
    }
  }
  const scene = new Slow();
  const starting = app.start(scene);
  app.destroy();
  resume();
  await assert.rejects(starting, { name: "AbortError" });
  assert.equal(engine.started, undefined);
  assert.equal(scene.state, "destroyed");
});

test("application cleans up scene and GPU resources when update throws", async (t) => {
  const { app, engine, textures, buffers } = appFixture(t);
  class Broken extends Scene {
    update() {
      throw Error("update failed");
    }
  }
  const scene = new Broken();
  await app.start(scene);
  assert.throws(() => engine.onUpdate(1, 1), /update failed/);
  assert.equal(scene.state, "destroyed");
  assert.equal(engine.dead, true);
  assert.ok([...textures, ...buffers].every((r) => r.destroyed === 1));
});

test("renderer grows lights, uploads actual count after shrink and handles zero", () => {
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  for (const count of [0, 1, 3, 2, 0, 5]) {
    scene.lights = Array.from({ length: count }, () => new DirectionalLight());
    renderer.render(scene);
    const camera = f.buffers.find((b) => b.label === "FrameBindings-CameraBuffer");
    assert.equal(new DataView(camera.data).getUint32(76, true), count);
  }
  const lights = f.buffers.filter((b) => b.label === "FrameBindings-LightBuffer");
  assert.deepEqual(
    lights.map((b) => b.size),
    [48, 144, 288],
  );
  assert.deepEqual(
    lights.map((b) => b.destroyed),
    [1, 1, 0],
  );
  scene.lights = Array.from({ length: 9 }, () => new DirectionalLight());
  assert.throws(() => renderer.render(scene), RangeError);
  renderer.destroy();
  renderer.destroy();
  assert.ok(f.buffers.every((b) => b.destroyed === 1));
  assert.ok(f.textures.every((t) => t.destroyed === 1));
});

test("asset textures outlive scene collection and borrowed renderer; replacement refreshes only bindings", () => {
  const f = fixture();
  const assets = new TextureResources(f.device);
  const renderer = new ForwardRenderer(f.engine, assets);
  const scene = new Scene();
  scene.activeCamera = new Camera();
  const first = assets.createSolid([255, 0, 0, 255]);
  const second = assets.createSolid([0, 255, 0, 255]);
  scene.environment = first;
  const material = new PhongMaterial({ color: [1, 1, 1], texture: first });
  const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const object = new Object3D("texture-test", mesh, material);
  scene.add(object);
  renderer.render(scene);
  const group = material.bindGroup,
    pipeline = material.pipeline,
    uniform = material.uniformBuffer;
  material.texture = second;
  renderer.render(scene);
  assert.notEqual(material.bindGroup, group);
  assert.equal(material.bindGroup.entries[1].resource, second.view);
  assert.equal(material.pipeline, pipeline);
  assert.equal(material.uniformBuffer, uniform);
  const replacementGroup = material.bindGroup;
  renderer.render(scene);
  assert.equal(material.bindGroup, replacementGroup);
  scene.remove(object);
  renderer.resources.releaseUnused(scene);
  assert.equal(first.destroyed, false);
  assert.equal(second.destroyed, false);
  scene.add(object);
  material.texture = null;
  renderer.render(scene);
  assert.equal(material.bindGroup.entries[1].resource, assets.white.view);
  renderer.destroy();
  assert.equal(assets.normal.destroyed, false);
  assert.equal(first.destroyed, false);
  assets.destroy();
  assets.destroy();
  assert.ok(f.textures.every((t) => t.destroyed === 1));
});

test("clearing the environment restores black and unchanged frames reuse bindings", () => {
  const f = fixture();
  const renderer = new ForwardRenderer(f.engine);
  const scene = new Scene();
  scene.activeCamera = new Camera();
  const environment = renderer.textures.createSolid([255, 0, 0, 255]);
  try {
    for (const texture of [null, environment, null]) {
      scene.environment = texture;
      renderer.render(scene);
      const group = f.bindGroups.filter((g) => g.label === "FrameBindings-SceneBindGroup").at(-1);
      assert.equal(
        group.entries.find((entry) => entry.binding === 7).resource,
        (texture ?? renderer.textures.black).view,
      );
      renderer.render(scene);
      assert.equal(
        f.bindGroups.filter((g) => g.label === "FrameBindings-SceneBindGroup").at(-1),
        group,
      );
    }
    assert.equal(environment.destroyed, false);
  } finally {
    renderer.destroy();
  }
});

test("standalone renderer owns its default textures and rejects foreign-device assets", () => {
  const f = fixture();
  const renderer = new ForwardRenderer(f.engine);
  const white = renderer.textures.white,
    normal = renderer.textures.normal;
  renderer.destroy();
  assert.equal(white.destroyed, true);
  assert.equal(normal.destroyed, true);
  const foreign = new TextureResources(fixture().device);
  assert.throws(() => new ForwardRenderer(f.engine, foreign), /another GPUDevice/);
  foreign.destroy();
});

test("shared mesh/material initialize once; collection retains live references", () => {
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const material = new PBRMaterial({ baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1 });
  const a = new Object3D("a", mesh, material),
    b = new Object3D("b", mesh, material);
  scene.add(a).add(b);
  renderer.render(scene);
  const vertexBuffer = mesh.vertexBuffer,
    uniform = material.uniformBuffer,
    count = f.buffers.length;
  renderer.render(scene);
  assert.equal(f.buffers.length, count);
  scene.remove(a);
  renderer.resources.releaseUnused(scene);
  assert.equal(a.modelBuffer, null);
  assert.equal(vertexBuffer.destroyed, 0);
  const second = new ForwardRenderer(fixture().engine);
  assert.throws(() => second.render(scene), /another renderer/);
  second.destroy();
  scene.remove(b);
  renderer.resources.releaseUnused(scene);
  assert.equal(vertexBuffer.destroyed, 1);
  assert.equal(uniform.destroyed, 1);
  scene.add(a);
  renderer.render(scene);
  assert.notEqual(mesh.vertexBuffer, vertexBuffer);
  renderer.destroy();
  assert.ok(f.buffers.every((b) => b.destroyed === 1));
});

test("layouts are cached by device", () => {
  const a = fixture().device,
    b = fixture().device;
  assert.equal(BindGroupLayouts.forDevice(a), BindGroupLayouts.forDevice(a));
  assert.notEqual(BindGroupLayouts.forDevice(a), BindGroupLayouts.forDevice(b));
});

test("engine clock starts at zero and uploads seconds through scene binding 2", (t) => {
  let now = 5000,
    nextFrame;
  t.mock.method(performance, "now", () => now);
  const oldRAF = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const oldCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  globalThis.requestAnimationFrame = (callback) => {
    nextFrame = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => {
    if (oldRAF) Object.defineProperty(globalThis, "requestAnimationFrame", oldRAF);
    else delete globalThis.requestAnimationFrame;
    if (oldCancel) Object.defineProperty(globalThis, "cancelAnimationFrame", oldCancel);
    else delete globalThis.cancelAnimationFrame;
  });
  const f = fixture(),
    engine = new Engine(f.engine.canvas);
  Object.assign(engine, { device: f.device, format: f.engine.format, context: f.engine.context });
  const groups = [];
  f.device.createBindGroup = (desc) => {
    groups.push(desc);
    return desc;
  };
  const renderer = new ForwardRenderer(engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  engine.onRender = () => renderer.render(scene);
  engine.start();
  const time = f.buffers.find((b) => b.label === "FrameBindings-TimeBuffer");
  const seconds = () => new DataView(time.data).getFloat32(0, true);
  assert.equal(seconds(), 0);
  now += 1250;
  nextFrame();
  assert.equal(seconds(), 1.25);
  engine.stop();
  now += 2000;
  engine.start();
  assert.equal(seconds(), 3.25);
  scene.lights = Array.from({ length: 3 }, () => new DirectionalLight());
  now += 500;
  nextFrame();
  assert.equal(seconds(), 3.75);
  for (const group of groups.filter((g) => g.label === "FrameBindings-SceneBindGroup")) {
    assert.equal(group.entries.find((e) => e.binding === 2).resource.buffer, time);
    const layout = group.layout.entries.find((e) => e.binding === 2);
    assert.equal(layout.buffer.type, "uniform");
    assert.equal(layout.visibility, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
  }
  assert.equal(f.buffers.filter((b) => b.label === "FrameBindings-TimeBuffer").length, 1);
  engine.stop();
  renderer.destroy();
  assert.equal(time.destroyed, 1);
});

test("renderer constructor rolls back resources when initialization throws", () => {
  const f = fixture();
  let calls = 0;
  f.device.createBindGroup = (descriptor) => {
    if (++calls === 3) throw new Error("Injected bind group failure");
    return descriptor;
  };
  assert.throws(() => new ForwardRenderer(f.engine), /Injected/);
  assert.ok(f.buffers.length > 0);
  assert.ok(f.buffers.every((b) => b.destroyed === 1));
  assert.ok(f.textures.every((t) => t.destroyed === 1));
});

test("shader declarations retain the same named layout as the CPU", () => {
  for (const name of ["pbr", "phong"]) {
    const shader = readFileSync(new URL(`../src/materials/${name}.wgsl`, import.meta.url), "utf8");
    for (const [structName, layout] of [
      ["CameraUniforms", cameraLayout],
      ["LightData", lightLayout],
      ["MaterialUniforms", name === "pbr" ? pbrLayout : phongLayout],
    ]) {
      const body = shader.match(new RegExp(`struct ${structName} \\{([^}]+)\\}`))[1];
      const fields = Object.fromEntries(
        [...body.matchAll(/(\w+)\s*:\s*(\w+)\s*,/g)].map((m) => [m[1], m[2]]),
      );
      const declared = new StructLayout(fields);
      assert.deepEqual(declared.offsets, layout.offsets);
      assert.equal(declared.byteSize, layout.byteSize);
      if (structName === "CameraUniforms") assert.equal(fields.light_count, "u32");
      if (structName === "LightData") assert.equal(fields.light_type, "u32");
    }
  }
});

test("output preserves exposure and pipeline when its HDR input changes", () => {
  const f = fixture();
  const groups = [],
    pipelines = [],
    passes = [],
    commands = [];
  f.device.createBindGroup = (d) => {
    groups.push(d);
    return d;
  };
  f.device.createRenderPipeline = (d) => {
    pipelines.push(d);
    return d;
  };
  f.device.createCommandEncoder = () => ({
    beginRenderPass(d) {
      passes.push(d);
      return {
        setBindGroup: (index, group) => commands.push(["group", index, group]),
        setPipeline: (pipeline) => commands.push(["pipeline", pipeline]),
        draw: (count) => commands.push(["draw", count]),
        end() {},
      };
    },
    finish: () => ({}),
  });
  const renderer = new ForwardRenderer(f.engine);
  const scene = new Scene();
  scene.activeCamera = new Camera();
  scene.output.exposure = 3;
  renderer.render(scene);
  const pipelineCount = pipelines.length;
  const before = groups.find((g) => g.label === "OutputPass-bind-group");
  const exposure = before.entries[1].resource.buffer;
  assert.equal(new Float32Array(exposure.data)[0], 3);
  scene.output.exposure = 6;
  f.engine.canvas.width = 200;
  renderer.render(scene);
  const after = groups.filter((g) => g.label === "OutputPass-bind-group").at(-1);
  assert.notEqual(before.entries[0].resource, after.entries[0].resource);
  assert.equal(after.entries[1].resource.buffer, exposure);
  assert.equal(new Float32Array(exposure.data)[0], 6);
  const writeCount = f.writes.filter((buffer) => buffer === exposure).length;
  renderer.render(scene);
  assert.equal(f.writes.filter((buffer) => buffer === exposure).length, writeCount);
  assert.equal(groups.filter((g) => g.label === "OutputPass-bind-group").length, 2);
  assert.equal(pipelines.length, pipelineCount);
  const outputPasses = passes.filter((p) => p.label === "OutputPass-pass");
  assert.equal(outputPasses.length, 3);
  assert.equal(outputPasses[0].depthStencilAttachment, undefined);
  assert.deepEqual(
    commands.filter((c) => c[0] === "draw"),
    [
      ["draw", 3],
      ["draw", 3],
      ["draw", 3],
    ],
  );
  renderer.destroy();
  renderer.destroy();
  assert.equal(exposure.destroyed, 1);
  assert.throws(() => renderer.render(scene), /destroyed/);
});

test("passes share one model upload per object and submit in shadow/forward/output order", () => {
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  scene.add(new DirectionalLight());
  const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const material = new SolidColorMaterial({ r: 1, g: 1, b: 1 });
  const object = new Object3D("model", mesh, material);
  scene.add(object);
  const passes = [],
    draws = [];
  let submissions = 0;
  f.device.createCommandEncoder = () => ({
    beginRenderPass(descriptor) {
      passes.push(descriptor.label);
      assert.equal(f.writes.filter((b) => b === object.modelBuffer).length, submissions + 1);
      return new Proxy(
        {},
        {
          get:
            (_, method) =>
            (...args) => {
              if (method === "draw" || method === "drawIndexed")
                draws.push([descriptor.label, args[0]]);
            },
        },
      );
    },
    finish: () => ({}),
  });
  f.device.queue.submit = (commands) => {
    assert.equal(commands.length, 1);
    submissions++;
  };
  for (const x of [2, 4]) {
    object.transform.position = new Float32Array([x, 0, 0]);
    renderer.render(scene);
    assert.equal(new Float32Array(object.modelBuffer.data)[12], x);
  }
  assert.equal(submissions, 2);
  assert.deepEqual(passes, [
    "ShadowPass",
    "ForwardPass",
    "OutputPass-pass",
    "ShadowPass",
    "ForwardPass",
    "OutputPass-pass",
  ]);
  assert.equal(draws.length, 6);
  renderer.destroy();
  assert.ok([...f.buffers, ...f.textures].every((r) => r.destroyed === 1));
});

test("frame target allocation failure retains old attachments and retry replaces them once", () => {
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  renderer.render(scene);
  const originals = f.textures.filter((t) => t.label.startsWith("FrameTargets-"));
  const output = f.bindGroups.filter((g) => g.label === "OutputPass-bind-group").at(-1);
  const count = f.textures.length;
  renderer.render(scene);
  assert.equal(f.textures.length, count);
  const create = f.device.createTexture;
  f.device.createTexture = (descriptor) => {
    if (descriptor.label === "FrameTargets-HdrTexture") throw Error("allocation failed");
    return create(descriptor);
  };
  assert.throws(() => renderer.resize(200, 200), /allocation failed/);
  assert.ok(originals.every((t) => t.destroyed === 0));
  assert.equal(f.textures.at(-1).destroyed, 1);
  f.device.createTexture = create;
  renderer.render(scene);
  assert.equal(f.bindGroups.filter((g) => g.label === "OutputPass-bind-group").at(-1), output);
  f.engine.canvas.width = f.engine.canvas.height = 200;
  renderer.render(scene);
  assert.ok(originals.every((t) => t.destroyed === 1));
  renderer.destroy();
  assert.ok(f.textures.every((t) => t.destroyed === 1));
});

test("failed light rebinding preserves the old buffer and recovers without leaking", () => {
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  renderer.render(scene);
  const previous = f.bindGroups.filter((g) => g.label === "FrameBindings-SceneBindGroup").at(-1);
  const buffer = previous.entries.find((e) => e.binding === 1).resource.buffer;
  const create = f.device.createBindGroup;
  f.device.createBindGroup = (descriptor) => {
    if (descriptor.label === "FrameBindings-SceneBindGroup") throw Error("binding failed");
    return create(descriptor);
  };
  scene.lights = Array.from({ length: 3 }, () => new DirectionalLight());
  assert.throws(() => renderer.render(scene), /binding failed/);
  assert.equal(buffer.destroyed, 0);
  assert.equal(f.buffers.at(-1).destroyed, 1);
  f.device.createBindGroup = create;
  scene.lights = [];
  renderer.render(scene);
  assert.equal(
    f.bindGroups.filter((g) => g.label === "FrameBindings-SceneBindGroup").at(-1),
    previous,
  );
  const groupsBefore = f.bindGroups.length;
  scene.environment = renderer.textures.createSolid([255, 0, 0, 255]);
  scene.lights = Array.from({ length: 3 }, () => new DirectionalLight());
  renderer.render(scene);
  assert.equal(
    f.bindGroups.length,
    groupsBefore + 1,
    "growth and environment change share one new binding",
  );
  assert.equal(buffer.destroyed, 1);
  renderer.destroy();
  assert.ok([...f.buffers, ...f.textures].every((r) => r.destroyed === 1));
});

test("each renderer module rolls back constructor allocations", () => {
  for (const [method, label] of [
    ["createTexture", "ShadowPass-DepthTexture"],
    ["createBindGroup", "ShadowPass-BindGroup"],
    ["createBuffer", "FrameBindings-TimeBuffer"],
    ["createBindGroup", "FrameBindings-SceneBindGroup"],
    ["createBindGroupLayout", "OutputPass-bind-group-layout"],
    ["createRenderPipeline", "OutputPass"],
  ]) {
    const f = fixture(),
      original = f.device[method];
    f.device[method] = (descriptor) => {
      if (descriptor.label === label) throw Error("injected module failure");
      return original(descriptor);
    };
    assert.throws(() => new ForwardRenderer(f.engine), /injected module failure/);
    assert.ok(
      [...f.buffers, ...f.textures].every((r) => r.destroyed === 1),
      label,
    );
  }
});

test("materials supply their own shader source and explicit overrides remain available", async () => {
  const { Material } = await import("../src/materials/Material.ts");
  class CustomMaterial extends Material {
    shaderSource = "custom source";
  }
  const f = fixture(),
    renderer = new ForwardRenderer(f.engine),
    scene = new Scene();
  scene.activeCamera = new Camera();
  const first = new CustomMaterial(),
    second = new CustomMaterial(),
    overridden = new CustomMaterial();
  renderer.resources.setShaderSource(overridden, "override source");
  const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  for (const material of [first, second, overridden])
    scene.add(new Object3D("custom", mesh, material));
  renderer.render(scene);
  assert.equal(first.pipeline.vertex.module.code, "custom source");
  assert.equal(first.pipeline, second.pipeline);
  assert.equal(overridden.pipeline.vertex.module.code, "override source");
  assert.notEqual(overridden.pipeline, first.pipeline);
  assert.throws(() => renderer.resources.setShaderSource(first, "late"), /before first render/);
  renderer.destroy();
  assert.ok([...f.buffers, ...f.textures].every((r) => r.destroyed === 1));
});

test("application frame callback runs after rendering and errors trigger cleanup", async (t) => {
  const { app, engine } = appFixture(t);
  const calls = [];
  app.renderer.render = () => calls.push("render");
  const scene = new Scene();
  await app.start(scene, (elapsed) => {
    calls.push(elapsed);
    throw Error("observer failed");
  });
  engine.elapsedSeconds = 2;
  assert.throws(() => engine.onRender(), /observer failed/);
  assert.deepEqual(calls, ["render", 2]);
  assert.equal(scene.state, "destroyed");
  assert.equal(engine.dead, true);
});

test("material pipeline cache shares identical state and separates rendering contracts", async () => {
  const { Material } = await import("../src/materials/Material.ts");
  const { Shader } = await import("../src/gpu/Shader.ts");
  const f = fixture();
  const shader = new Shader(f.device, "same-label", "");
  const make = (format = "rgba16float", change = () => {}, source = shader, sceneLayout) => {
    const material = new Material("same-label");
    change(material);
    material.initialize(f.device, format, source, sceneLayout);
    return material;
  };
  const first = make(),
    second = make();
  assert.equal(first.pipeline, second.pipeline);
  assert.notEqual(first.bindGroup, second.bindGroup);
  assert.notEqual(first.pipeline, make("rgba8unorm").pipeline);
  assert.notEqual(
    first.pipeline,
    make("rgba16float", (m) => {
      m.cullMode = "none";
    }).pipeline,
  );
  assert.notEqual(
    first.pipeline,
    make("rgba16float", (m) => {
      m.topology = "line-list";
    }).pipeline,
  );
  assert.notEqual(
    first.pipeline,
    make("rgba16float", (m) => {
      m.enableFragment = false;
    }).pipeline,
  );
  assert.notEqual(
    first.pipeline,
    make("rgba16float", () => {}, new Shader(f.device, "same-label", "")).pipeline,
  );
  const otherLayout = f.device.createBindGroupLayout({ entries: [] });
  assert.notEqual(first.pipeline, make("rgba16float", () => {}, shader, otherLayout).pipeline);
});

test("all material properties synchronize once per frame without rebuilding GPU resources", () => {
  const cases = [
    {
      material: new PBRMaterial({ baseColor: [1, 1, 1, 1], metallic: 0, roughness: 0.5 }),
      change(m) {
        m.baseColor[0] = 0.25;
        m.metallic = 0.75;
        m.roughness = 0.125;
      },
      expected: [
        [0, 0.25],
        [16, 0.75],
        [20, 0.125],
      ],
    },
    {
      material: new PhongMaterial({ color: [1, 1, 1] }),
      change(m) {
        m.color[1] = 0.25;
        m.specularColor[2] = 0.5;
        m.shininess = 16;
      },
      expected: [
        [4, 0.25],
        [24, 0.5],
        [28, 16],
      ],
    },
    {
      material: new SolidColorMaterial({ r: 1, g: 1, b: 1 }),
      change(m) {
        m.color[0] = 0.125;
      },
      expected: [[0, 0.125]],
    },
  ];
  for (const { material, change, expected } of cases) {
    const f = fixture(),
      renderer = new ForwardRenderer(f.engine),
      scene = new Scene();
    scene.activeCamera = new Camera();
    const mesh = new Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const first = new Object3D("first", mesh, material),
      second = new Object3D("second", mesh, material);
    scene.add(first).add(second);
    let syncs = 0;
    const originalSync = material.syncUniforms.bind(material);
    material.syncUniforms = (device) => {
      syncs++;
      originalSync(device);
    };
    renderer.render(scene);
    const buffer = material.uniformBuffer,
      pipeline = material.pipeline,
      group = material.bindGroup;
    assert.equal(syncs, 1);
    assert.equal(f.writes.filter((b) => b === buffer).length, 1);
    renderer.render(scene);
    assert.equal(f.writes.filter((b) => b === buffer).length, 1);
    change(material);
    renderer.render(scene);
    assert.equal(syncs, 3);
    assert.equal(f.writes.filter((b) => b === buffer).length, 2);
    assert.equal(material.uniformBuffer, buffer);
    assert.equal(material.pipeline, pipeline);
    assert.equal(material.bindGroup, group);
    for (const [offset, value] of expected)
      assert.equal(new DataView(buffer.data).getFloat32(offset, true), value);
    scene.remove(first).remove(second);
    renderer.resources.releaseUnused(scene);
    scene.add(first);
    renderer.render(scene);
    assert.notEqual(material.uniformBuffer, buffer);
    for (const [offset, value] of expected)
      assert.equal(new DataView(material.uniformBuffer.data).getFloat32(offset, true), value);
    renderer.destroy();
  }
});
