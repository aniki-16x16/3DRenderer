import { test } from "node:test";
import assert from "node:assert/strict";
import { TextureResources } from "../src/assets/TextureResources.ts";

globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
globalThis.createImageBitmap = async () => {
  throw Error("Missing image mock");
};

function fixture() {
  const allocated = [];
  const device = {
    createTexture(d) {
      const texture = {
        width: d.size[0],
        height: d.size[1],
        format: d.format,
        destroyed: 0,
        createView: () => ({}),
        destroy() {
          this.destroyed++;
        },
      };
      allocated.push(texture);
      return texture;
    },
    queue: { writeTexture() {}, copyExternalImageToTexture() {} },
  };
  return { device, allocated, assets: new TextureResources(device) };
}

test("resources own unreferenced allocations, support float descriptors, and reject use after release", () => {
  const { assets, allocated, device } = fixture();
  const texture = assets.create({ size: [4, 2], format: "rgba16float", usage: 1 });
  assert.equal(texture.format, "rgba16float");
  assert.equal(texture.width, 4);
  assert.throws(() => texture.assertUsable({}), /another GPUDevice/);
  assert.equal(assets.white, assets.white);
  assert.throws(() => assets.release(assets.white), /Default textures/);
  assets.release(texture);
  assert.throws(() => texture.assertUsable(device), /destroyed/);
  assert.throws(() => texture.createView(), /destroyed/);
  assets.destroy();
  assets.destroy();
  assert.ok(allocated.every((t) => t.destroyed === 1));
  assert.throws(() => assets.create({}), /destroyed/);
  assert.throws(() => assets.white, /destroyed/);
});

test("image upload failure rolls back allocation without taking ownership of CPU image", () => {
  const { assets, allocated, device } = fixture();
  let closed = 0;
  device.queue.copyExternalImageToTexture = () => {
    throw Error("upload failed");
  };
  assert.throws(
    () =>
      assets.fromImage({
        width: 2,
        height: 2,
        close() {
          closed++;
        },
      }),
    /upload failed/,
  );
  assert.equal(allocated[0].destroyed, 1);
  assert.equal(closed, 0);
  assets.destroy();
  assert.equal(allocated[0].destroyed, 1);
});

test("destroy during decode closes late bitmap and never allocates a GPU texture", async (t) => {
  const { assets, allocated } = fixture();
  let finishDecode,
    startDecode,
    closed = 0;
  const decoding = new Promise((resolve) => {
    startDecode = resolve;
  });
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, blob: async () => ({}) }));
  t.mock.method(globalThis, "createImageBitmap", () => {
    startDecode();
    return new Promise((resolve) => {
      finishDecode = resolve;
    });
  });
  const loading = assets.loadImage("environment.png");
  await decoding;
  assets.destroy();
  finishDecode({
    width: 2,
    height: 1,
    close() {
      closed++;
    },
  });
  await assert.rejects(loading, { name: "AbortError" });
  assert.equal(closed, 1);
  assert.equal(allocated.length, 0);
});

test("failed and cancelled downloads allocate nothing; concurrent loads return independent assets", async (t) => {
  const { assets, allocated } = fixture();
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }));
  await assert.rejects(assets.loadImage("missing.png"), /404/);
  assert.equal(allocated.length, 0);
  let closed = 0;
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, blob: async () => ({}) }));
  t.mock.method(globalThis, "createImageBitmap", async () => ({
    width: 2,
    height: 1,
    close() {
      closed++;
    },
  }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(assets.loadImage("cancelled.png", {}, controller.signal), {
    name: "AbortError",
  });
  const [a, b] = await Promise.all([assets.loadImage("a.png"), assets.loadImage("b.png")]);
  assert.notEqual(a, b);
  assert.equal(closed, 2);
  assets.destroy();
  assert.ok(allocated.every((t) => t.destroyed === 1));
});
