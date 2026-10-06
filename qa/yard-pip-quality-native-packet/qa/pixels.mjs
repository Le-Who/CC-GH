import assert from 'node:assert/strict';
export const W = 390, H = 648, BYTES = W * H * 4;
export function assemble(chunks) {
  const out = Buffer.alloc(BYTES); let next = 0;
  for (const row of chunks) {
    assert.equal(row.y, next); assert.equal(row.width, W); assert.equal(row.height, H);
    assert.equal(row.rowOrder, 'bottom-up'); assert.equal(row.encoding, 'output-encoded premultiplied RGBA8');
    assert(Number.isInteger(row.rows) && row.rows >= 1 && row.rows <= 16 && next + row.rows <= H);
    const bytes = Buffer.from(row.dataBase64, 'base64'); assert.equal(bytes.length, W * row.rows * 4);
    bytes.copy(out, row.y * W * 4); next += row.rows;
  }
  assert.equal(next, H); return out;
}
export function exact(a, b, mask = null) {
  assert.equal(a.length, BYTES); assert.equal(b.length, BYTES);
  let comparedBytes = 0, mismatches = 0;
  for (let i = 0; i < BYTES; i++) if (!mask || mask[i >> 2]) { comparedBytes++; if (a[i] !== b[i]) mismatches++; }
  return {passed: comparedBytes > 0 && mismatches === 0, comparedBytes, mismatches};
}
export function separatedPropMask(props, actor) {
  assert.equal(props.length, BYTES); assert.equal(actor.length, BYTES);
  const mask = new Uint8Array(W * H); let pixels = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x; if (props[p * 4 + 3] < 230) continue;
    // Exclude actor/contact support plus a one-pixel neighborhood.
    let overlap = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (actor[((y + dy) * W + x + dx) * 4 + 3]) overlap = true;
    if (!overlap) { mask[p] = 1; pixels++; }
  }
  assert(pixels >= 64, 'Insufficient separated, opaque T2 pixels'); return {mask, pixels};
}
export function exteriorDiff(base, candidate) {
  assert.equal(base.length, BYTES); assert.equal(candidate.length, BYTES);
  let expandedPixels = 0, removedSupportPixels = 0, interiorByteChanges = 0, changedPixels = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, a = base[p + 3], b = candidate[p + 3];
    if (!a && b) expandedPixels++; if (a && !b) removedSupportPixels++;
    const interior = a && [[0,1],[0,-1],[1,0],[-1,0]].every(([dx,dy]) => base[(Math.max(0,Math.min(H-1,y+dy))*W+Math.max(0,Math.min(W-1,x+dx)))*4+3] > 0);
    let changed = false;
    for (let c = 0; c < 4; c++) if (base[p+c] !== candidate[p+c]) { changed = true; if (interior) interiorByteChanges++; }
    if (changed) changedPixels++;
  }
  return {passed: expandedPixels === 0 && removedSupportPixels === 0 && interiorByteChanges === 0,
    expandedPixels, removedSupportPixels, interiorByteChanges, changedPixels,
    visualAcceptance: 'PENDING: reject silhouette thinning, dark/colored fringes, blur, eye/fur detail loss; numeric invariants do not prove improvement'};
}
export function composite(bytes, background) {
  assert.equal(bytes.length, BYTES); assert([0,255].includes(background));
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const source = (y * W + x) * 4, dest = ((H - 1 - y) * W + x) * 3, alpha = bytes[source+3] / 255;
    for (let c = 0; c < 3; c++) rgb[dest+c] = Math.min(255, Math.round(bytes[source+c] + background * (1-alpha)));
  }
  return rgb; // Flip once; composite output-encoded premultiplied bytes without unpremultiplying identity data.
}
export function summarizeCost(value) {
  const percentile = (v,p) => [...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1];
  return {...value, rows: value.rows.map(row => ({...row,
    renderSubmitMs: {median: percentile(row.samples.map(s=>s.metrics.renderSubmitMs),.5), p95: percentile(row.samples.map(s=>s.metrics.renderSubmitMs),.95)},
    totalCallMs: {median: percentile(row.samples.map(s=>s.metrics.totalCallMs),.5), p95: percentile(row.samples.map(s=>s.metrics.totalCallMs),.95)},
  }))};
}
export function stableGardenBackground(baseline, candidate, rawBase, geometry) {
  assert.equal(baseline.info.width,candidate.info.width);assert.equal(baseline.info.height,candidate.info.height);
  assert.equal(baseline.info.channels,candidate.info.channels);
  const {width,height,channels}=baseline.info,stage=geometry.stageCSS,canvas=geometry.canvasCSS;
  let pixels=0,mismatches=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const px=stage.x+(x+.5)*stage.width/width,py=stage.y+(y+.5)*stage.height/height;
    const rx=Math.floor((px-canvas.x)*W/canvas.width),ry=Math.floor((py-canvas.y)*H/canvas.height);
    let occupied=false;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const a=rx+dx,b=ry+dy;if(a>=0&&a<W&&b>=0&&b<H&&rawBase[((H-1-b)*W+a)*4+3])occupied=true;
    }
    if(occupied)continue;pixels++;
    for(let c=0;c<channels;c++)if(baseline.data[(y*width+x)*channels+c]!==candidate.data[(y*width+x)*channels+c])mismatches++;
  }
  return{passed:pixels>=64&&mismatches===0,pixels,comparedBytes:pixels*channels,mismatches,
    method:'Actual device-scale garden screenshot pixels outside native actor/prop/contact alpha support plus a two-texel interpolation guard'};
}
