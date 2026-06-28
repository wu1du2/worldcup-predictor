export function deterministicUuid(value) {
  const hex = simpleHashHex(value).padEnd(32, '0').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function simpleHashHex(value) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (const char of String(value)) {
    hashA ^= char.charCodeAt(0);
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= hashA;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }

  const chunks = [
    hashA,
    hashB,
    (hashA ^ hashB) >>> 0,
    Math.imul((hashA + hashB) >>> 0, 0xc2b2ae35) >>> 0,
  ];
  return chunks.map((chunk) => chunk.toString(16).padStart(8, '0')).join('');
}
