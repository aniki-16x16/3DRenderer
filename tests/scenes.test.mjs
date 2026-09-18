import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene } from "../src/scene/Scene.ts";
import { DirectionalLight } from "../src/scene/DirectionalLight.ts";
import { OBJLoader } from "../src/assets/loaders/OBJLoader.ts";

test("scene setup runs once and owns auxiliary resources without destroying borrowed assets", async () => {
  let setups = 0,
    disposed = 0;
  const borrowed = {
    destroy() {
      throw Error("Borrowed asset was destroyed");
    },
  };
  class Demo extends Scene {
    setup(context) {
      setups++;
      this.context = context;
      this.scope.own({
        destroy() {
          disposed++;
        },
      });
      this.environment = borrowed;
      this.add(new DirectionalLight());
    }
  }
  const scene = new Demo("demo");
  await scene.initialize({});
  assert.equal(scene.state, "ready");
  await assert.rejects(scene.initialize({}), /cannot initialize/);
  assert.equal(setups, 1);
  scene.destroy();
  scene.destroy();
  assert.equal(disposed, 1);
  assert.equal(scene.context.signal.aborted, true);
  assert.equal(scene.environment, null);
  assert.deepEqual(scene.lights, []);
  assert.throws(() => scene.add(new DirectionalLight()), /destroyed/);
});

test("destroy during async setup prevents ready state and disposes late auxiliary resources", async () => {
  let resume,
    disposed = 0;
  class Slow extends Scene {
    async setup({ signal }) {
      this.signal = signal;
      await new Promise((resolve) => {
        resume = resolve;
      });
      this.scope.own({
        destroy() {
          disposed++;
        },
      });
    }
  }
  const scene = new Slow();
  const loading = scene.initialize({});
  assert.equal(scene.state, "loading");
  scene.destroy();
  assert.equal(scene.signal.aborted, true);
  resume();
  await assert.rejects(loading, /destroyed/);
  assert.equal(scene.state, "destroyed");
  assert.equal(disposed, 1);
});

test("setup failure rolls back GUI and controls", async () => {
  const released = [];
  class Broken extends Scene {
    setup() {
      this.scope.defer(() => released.push("controls"));
      this.scope.defer(() => released.push("gui"));
      throw Error("setup failed");
    }
  }
  const scene = new Broken();
  await assert.rejects(scene.initialize({}), /setup failed/);
  assert.deepEqual(released, ["gui", "controls"]);
  assert.equal(scene.state, "destroyed");
});

test("OBJ download rejects HTTP failures and cancellation before parsing", async (t) => {
  const loader = new OBJLoader();
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }));
  await assert.rejects(loader.load("missing.obj"), /404/);
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    text: async () => {
      controller.abort();
      return "";
    },
  }));
  await assert.rejects(loader.load("cancelled.obj", controller.signal), { name: "AbortError" });
});
