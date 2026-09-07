import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecoder, encodeMessage } from "../helper/native-protocol.mjs";

test("native framing handles split headers, split UTF8 and batched messages", () => {
  const received = [];
  const decode = createDecoder((value) => received.push(value));
  const first = { id: 1, method: "download", params: { title: "日本語 🎥" } };
  const bytes = Buffer.concat([
    encodeMessage(first),
    encodeMessage({ id: 2, method: "jobs" }),
  ]);
  for (let i = 0; i < bytes.length; i += 3) decode(bytes.subarray(i, i + 3));
  assert.deepEqual(received, [first, { id: 2, method: "jobs" }]);
});
test("native framing rejects oversized, empty and malformed requests", () => {
  for (const size of [0, 65537]) {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(size);
    assert.throws(() => createDecoder(() => {})(header));
  }
  assert.throws(() => createDecoder(() => {})(Buffer.from([1, 0, 0, 0, 123])));
  assert.throws(() => createDecoder(() => {})(encodeMessage(null)));
  assert.throws(() => encodeMessage("a".repeat(1024 * 1024)));
});
