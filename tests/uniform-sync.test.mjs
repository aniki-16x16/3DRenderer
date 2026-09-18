import { test } from "node:test";
import assert from "node:assert/strict";
import { UniformSync } from "../src/gpu/UniformSync.ts";

test("uniform sync uploads first use, in-place changes and new targets, but skips unchanged bytes", () => {
  const sync = new UniformSync(16),
    writes = [];
  const device = {
    queue: { writeBuffer: (buffer, offset, data) => writes.push([buffer, data.slice(0)]) },
  };
  const a = {},
    b = {};
  sync.upload(device, a);
  sync.upload(device, a);
  assert.equal(writes.length, 1);
  new Float32Array(sync.data)[2] = 0.5;
  sync.upload(device, a);
  assert.equal(new Float32Array(writes[1][1])[2], 0.5);
  sync.upload(device, b);
  assert.equal(writes.length, 3);
  sync.reset();
  sync.upload(device, b);
  assert.equal(writes.length, 4);
});

test("failed upload does not mark bytes as synchronized", () => {
  const sync = new UniformSync(4),
    target = {};
  let attempts = 0;
  const device = {
    queue: {
      writeBuffer() {
        if (++attempts === 1) throw Error("failed");
      },
    },
  };
  assert.throws(() => sync.upload(device, target), /failed/);
  sync.upload(device, target);
  sync.upload(device, target);
  assert.equal(attempts, 2);
});
