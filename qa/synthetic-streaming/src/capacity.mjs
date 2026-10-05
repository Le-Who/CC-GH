export const LIMIT = 64 * 1024 * 1024, PAGE_CAP = 1572864;
// Reviewed shared reservations, deliberately NOT instantiated by this harness.
// The static-owner inventory already contains the 28,000-byte target owner.
export const RESERVES = Object.freeze({uiCatalog:17647352, sceneStills:7205996,
  cottageAndMask:1605632, sceneStillOwners:16, targetAlreadyIncluded:28000});
export const sharedReserve = RESERVES.uiCatalog + RESERVES.sceneStills + RESERVES.cottageAndMask;
export function capacity(width,height,dpr=2) {
  const backing=[width*dpr,height*dpr];
  const twoBackingBytes=backing[0]*backing[1]*4*2;
  const externalBytes=sharedReserve+twoBackingBytes;
  const totalDecodedBoundBytes=externalBytes+16*PAGE_CAP;
  return {width,height,dpr,backing,twoBackingBytes,externalBytes,totalDecodedBoundBytes,
    headroomBytes:LIMIT-totalDecodedBoundBytes,fits:totalDecodedBoundBytes<=LIMIT};
}
