import {createDefaultPlayer} from '../../../game-logic.js';
import {buildSnapshot,applyActionWithReceipt} from '../../../routes/player.js';

/** Deterministic player boundary for stateful navigation tests without Postgres.
 * Every mutation executes production dispatch/receipt code. The App, lazy game
 * components, controls, transport and UI are real; no store/navigation injection. */
export async function mountHomePlayerFixture(page){
 const player=createDefaultPlayer(`home_fixture_${Date.now()}_${Math.random()}`,'Home fixture',Date.now());
 await page.route('**/socket.io/**',route=>route.abort());
 await page.route(url=>url.pathname==='/api/player/snapshot',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(buildSnapshot(player))}));
 await page.route('**/api/player/mutate',async route=>{
  const body=route.request().postDataJSON();
  const result=await applyActionWithReceipt(player,body.action,body.payload||{},{clientActionId:body.clientActionId});
  await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
 });
 return player;
}
