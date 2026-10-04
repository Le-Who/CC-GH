/** Derive actor-specific physical pages, including shared family root mapping. */
export function actorAtlasPages(manifest,manifestPath){
 const clips=[...Object.values(manifest.clips||{}),...Object.values(manifest.walk?.facings||{}),...Object.values(manifest.turns||{}),...Object.values(manifest.extraSourceClips||{})],pages={};
 if(manifest.format==='yard-mochi-canonical-runtime/v1'){
  clips.push({...manifest.sourceMedia.combined,assetBaseURL:new URL('combined/',new URL(manifestPath,'http://127.0.0.1')).href});
  for(const clip of [...Object.values(manifest.sourceMedia.cardinal.walk.facings),...Object.values(manifest.sourceMedia.cardinal.turns)])clips.push({...clip,assetBaseURL:new URL('cardinal/',new URL(manifestPath,'http://127.0.0.1')).href});
 }
 for(const clip of clips)for(const page of clip.pages||[]){
  const base=clip.assetBaseURL||(clip.assetRoot?manifest.roots?.[clip.assetRoot]?.path:manifestPath);
  if(!base)throw Error('Missing exact actor atlas root');
  const path=new URL(page.src,new URL(base,'http://127.0.0.1')).pathname;
  (pages[path]??=[]).push({cols:page.cols,tileWidth:page.tileWidth,tileHeight:page.tileHeight,offset:page.offset||0,count:page.count});
 }
 if(!Object.keys(pages).length)throw Error('Actor manifest has no physical atlas pages');return pages;
}
export function attributedDraw(row,pages){
 const descriptors=pages[new URL(row.url).pathname]||[],[x,y,w,h]=row.sourceCrop;
 return row.changedOpaquePixels>=16&&descriptors.some(p=>{
  if(w!==p.tileWidth||h!==p.tileHeight||x%w||y%h)return false;
  const index=y/h*p.cols+x/w;return index>=p.offset&&index<p.offset+p.count;
 });
}
