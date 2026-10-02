import test from 'node:test';
import assert from 'node:assert/strict';
import { containDialogTab, createDialogFocusManager, makeDialogSiblingsInert } from '../src/app/dialogFocus.js';

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
