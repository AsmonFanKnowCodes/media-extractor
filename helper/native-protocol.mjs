export function encodeMessage(value) {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  if (json.length > 1024 * 1024)
    throw new Error("Native response is too large.");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length);
  return Buffer.concat([header, json]);
}

export function createDecoder(onMessage) {
  let pending = Buffer.alloc(0);
  return (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const size = pending.readUInt32LE(0);
      if (!size || size > 65536)
        throw new Error("Invalid native request size.");
      if (pending.length < size + 4) break;
      const value = JSON.parse(pending.subarray(4, size + 4).toString("utf8"));
      pending = pending.subarray(size + 4);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid native request.");
      onMessage(value);
    }
  };
}
