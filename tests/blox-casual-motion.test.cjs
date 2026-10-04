const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('../recovery-tools/verification/blox/scene-verification.cjs');
function drop(h){const {env,composition:c}=h,s=c.slots[0];h.targets()[100].emit('pointerdown',env.event(s.left+s.width/2,s.top+s.height/2));env.flush();const end=env.event(c.board.left+c.board.cell*4.5,c.board.top+c.board.cell*4.5);env.app.stage.emit('globalpointermove',end);env.flush();env.app.stage.emit('pointerup',end);}
test('Blox confirmed effects are bounded and interruption drops late network feedback',async()=>{
  for(const interruption of ['destroy','pause','resize','hidden','blur']){
    const h=await harness('source',390,844);let resolve;h.data.onBloxDrop=()=>new Promise(r=>resolve=r);drop(h);
    if(interruption==='destroy')h.scene.destroy();else if(interruption==='pause')h.scene.update({...h.data,blox:{...h.data.blox,gameActive:false}});else if(interruption==='resize')h.scene.resize(h.data);else if(interruption==='hidden'){h.env.document.visibilityState='hidden';h.env.document.emit('visibilitychange');}else h.env.window.emit('blur');
    resolve({clear:{cleared:2,rows:[4],cols:[3]}});await new Promise(setImmediate);h.env.flush();
    if(interruption!=='destroy'){assert.equal(h.env.app.stage.children[2].children.length,0,interruption);h.scene.destroy();}
    assert.equal(h.env.tickers.size,0);assert.equal(h.env.window.listenerCount,0);assert.equal(h.env.document.listenerCount,0);
  }
  const h=await harness('source',390,844);drop(h);await new Promise(setImmediate);
  assert.ok(h.env.app.stage.children[2].children.length>0);assert.ok(h.env.app.stage.children[2].children.length<=48);
  assert.equal(h.env.app.stage.children[2].children.filter(n=>n.text).length,0,'no centre-screen reward copy');
  for(let i=0;i<30;i++)for(const tick of h.env.tickers)tick({deltaMS:1000/60});
  assert.equal(h.env.app.stage.children[2].children.length,0);h.scene.destroy();
});
