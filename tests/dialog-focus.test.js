import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { containDialogTab, createDialogFocusManager, getDialogFocusableElements, makeDialogSiblingsInert } from '../src/app/dialogFocus.js';

test('Tab stays inside the dialog and handles a dialog with no controls', () => {
  const focused = [], element = id => ({closest:()=>null,getClientRects:()=>[{}],focus:()=>focused.push(id)});
  const first=element('first'),last=element('last'),dialog={querySelectorAll:()=>[first,last],focus:()=>focused.push('dialog')};
  let prevented=0;
  containDialogTab({key:'Tab',preventDefault:()=>prevented++},dialog,last);
  containDialogTab({key:'Tab',shiftKey:true,preventDefault:()=>prevented++},dialog,first);
  containDialogTab({key:'Tab',preventDefault:()=>prevented++},{...dialog,querySelectorAll:()=>[]},null);
  assert.deepEqual(focused,['first','last','dialog']);assert.equal(prevented,3);
});

test('nested dialog inert ownership restores original values and preserves scrim access', () => {
  const sibling={inert:false,hasAttribute:()=>false},alreadyInert={inert:true,hasAttribute:()=>false},scrim={inert:false,hasAttribute:key=>key==='data-menu-blocker'};
  const dialog={parentElement:{children:[]}};dialog.parentElement.children=[dialog,sibling,alreadyInert,scrim];
  const a=makeDialogSiblingsInert(dialog),b=makeDialogSiblingsInert(dialog);
  assert.equal(sibling.inert,true);assert.equal(scrim.inert,false);
  a();a();assert.equal(sibling.inert,true);b();assert.equal(sibling.inert,false);assert.equal(alreadyInert.inert,true);
});

test('a body-level portal can keep the underlying Hub inert while leaving the scrim active', () => {
  const hub={inert:false,hasAttribute:()=>false},layer={inert:false,hasAttribute:()=>false,parentElement:{children:[]}};
  layer.parentElement.children=[hub,layer];
  const restore=makeDialogSiblingsInert(layer);assert.equal(hub.inert,true);assert.equal(layer.inert,false);
  restore();assert.equal(hub.inert,false);
});

test('replaced dialogs invalidate stale restore-focus work', () => {
  const manager=createDialogFocusManager(),a={isConnected:true,contains:()=>false},b={isConnected:true,contains:()=>false},target={isConnected:true};
  const owner=manager.begin(a);assert.equal(owner.isCurrent(),true);const canRestore=owner.end();
  const next=manager.begin(b);assert.equal(canRestore(target),false);assert.equal(next.isCurrent(),true);
  const after=next.end();assert.equal(after(target),true);assert.equal(after({...target,isConnected:false}),false);
});

test('closing a nested dialog may restore only inside its still-open parent', () => {
  const target={isConnected:true},outside={isConnected:true},manager=createDialogFocusManager();
  const parent=manager.begin({isConnected:true,contains:node=>node===target});
  const child=manager.begin({isConnected:true,contains:()=>false});const restore=child.end();
  assert.equal(restore(target),true);assert.equal(restore(outside),false);assert.equal(restore(target,outside),false);parent.end();
});


function gardenPortalHookHarness() {
  const frames = new Map(), effects = [], focusCalls = [];
  let sequence = 0;
  const body = { children: [] }, document = { body, activeElement: body };
  const hub = { inert: false, hasAttribute: () => false };
  const layer = { parentElement: body, children: [], hasAttribute: () => false };
  body.children = [hub, layer];
  const trigger = {
    isConnected: true, disabled: true,
    closest: () => hub.inert ? hub : null,
    focus() { if (!this.disabled && !hub.inert) { focusCalls.push('trigger'); document.activeElement = this; } },
  };
  const close = {
    isConnected: true, closest: () => null, getClientRects: () => [{}],
    focus() { focusCalls.push('close'); document.activeElement = this; },
  };
  const dialog = {
    isConnected: true, parentElement: layer, hasAttribute: () => false,
    querySelectorAll: () => [close], contains: node => node === close,
    addEventListener() {}, removeEventListener() {},
  };
  const scrim = { hasAttribute: name => name === 'data-menu-blocker' };
  layer.children = [dialog, scrim];layer.querySelector = () => null;
  const window = { requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id) };
  const source = fs.readFileSync(new URL('../src/app/useDialogFocus.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function useDialogFocus', 'function useDialogFocus');
  const context = { useEffect: fn => effects.push(fn), containDialogTab, createDialogFocusManager, getDialogFocusableElements, makeDialogSiblingsInert, window, document };
  vm.createContext(context);vm.runInContext(source + '\nthis.hook = useDialogFocus;', context);
  return {
    trigger, dialog, document, focusCalls,
    open(returnFocusRef) {
      context.hook({ current: dialog }, { returnFocusRef });
      const cleanup = effects.pop()(), restoreHub = makeDialogSiblingsInert(layer);
      return () => { cleanup(); restoreHub(); };
    },
    detach() { dialog.isConnected = false; close.isConnected = false; trigger.disabled = false; document.activeElement = body; },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
  };
}

test('explicit pre-commit Garden opener restores after disable blur and portal inert cleanup', () => {
  const h = gardenPortalHookHarness(), opener = { current: h.trigger };
  // Browser already blurred the disabled trigger before the dialog's passive effect.
  const close = h.open(opener);h.flush();
  assert.equal(h.focusCalls.at(-1), 'close');
  opener.current = null; // Garden close clears its ref; the hook owns the captured element.
  h.detach();close();
  assert.equal(h.focusCalls.filter(value => value === 'trigger').length, 0);
  h.flush();assert.equal(h.document.activeElement, h.trigger);
});

test('a mounted Garden dialog receives focus on its scheduled frame, not synchronously on open', () => {
  const h = gardenPortalHookHarness(), cleanup = h.open({ current: h.trigger });
  assert.equal(h.dialog.isConnected, true);
  assert.equal(h.dialog.contains(h.document.activeElement), false, 'Mounting does not flush animation-frame focus work');
  h.flush();
  assert.equal(h.dialog.contains(h.document.activeElement), true, 'The real focus hook claims focus on its next frame');
  assert.deepEqual(h.focusCalls, ['close']);
  h.detach();cleanup();h.flush();
  assert.equal(h.document.activeElement, h.trigger);
});

test('Garden opener survives Strict Mode effect replay without stale return-focus work', () => {
  const h = gardenPortalHookHarness(), opener = { current: h.trigger };
  const first = h.open(opener);h.flush();first();
  const second = h.open(opener);h.flush();
  assert.equal(h.focusCalls.filter(value => value === 'trigger').length, 0);
  h.detach();second();h.flush();
  assert.equal(h.focusCalls.filter(value => value === 'trigger').length, 1);
  assert.equal(h.document.activeElement, h.trigger);
});

test('without pre-commit capture the disabled opener loss is reproduced, and Garden wires the capture', () => {
  const h = gardenPortalHookHarness(), close = h.open(null);h.flush();h.detach();close();h.flush();
  assert.notEqual(h.document.activeElement, h.trigger);
  const source = fs.readFileSync(new URL('../src/games/garden-shelf/GardenPresentation.tsx', import.meta.url), 'utf8');
  assert.match(source, /useDialogFocus\(ref, \{ returnFocusRef: feedback.returnFocusRef \}\)/);
  assert.match(source, /openSpot = [\s\S]*?dialogOpener.current = opener[\s\S]*?setPanel\('spot'\)/);
  assert.match(source, /onDetails=\{\(event: any\) => openSpot\(s, p, plant\?\.id, event\?\.currentTarget\)\}/);
});
