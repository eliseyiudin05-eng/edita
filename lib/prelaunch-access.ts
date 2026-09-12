export const OWNER_ACCESS_HASH="bfc66c41fc002c17d37c9649cce339179454851d26591ccae64b489df56ff3e1";

export const TESTER_ACCESS_HASHES=[
  "0ce7be98b37f10e52dc958e62b6d8d1d52c1a0d8b3641210cf9d04d2c1995f6a",
  "17a1fffa904f2ef090f52f5dae511e47f0f85aa8e617ca4372ad5be279bdec87",
  "070b76dfdde03c178a13329c05a52de04be8fb5e6f73faddbea8fccce51dd8b9",
  "c8b5e0f521be19cc082ce85694456086e5280ef889f7be8925c32af8ff1acbee",
  "48f86e75a8bf88ec08cb41f6ef0509fec6aef23125cdd81115fc74cb22d81c58"
] as const;

const acceptedHashes=new Set<string>([OWNER_ACCESS_HASH,...TESTER_ACCESS_HASHES]);

export function isAcceptedAccessHash(hash:string){
  return acceptedHashes.has(hash);
}

export function isTesterAccessHash(hash:string){
  return (TESTER_ACCESS_HASHES as readonly string[]).includes(hash);
}
