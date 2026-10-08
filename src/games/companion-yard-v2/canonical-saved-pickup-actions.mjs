import {canonicalSavedFoodReady} from './canonical-saved-food-actions.mjs';
import {canonicalSavedPickupNewIntentAllowed} from '../../game-state/canonicalSavedPickupProtocol.mjs';

/** Only the selected, released source target may use the existing pickup
 * control. A saved scene remains generally read-only: no placement or move. */
export function canonicalSavedPickupCommandAllowed(snapshot,current,action,payload={},sceneState=current?.visualPrototype){
 return action==='yard.pickupGoodie'&&canonicalSavedFoodReady(snapshot,current,sceneState)
  &&canonicalSavedPickupNewIntentAllowed(snapshot,action,payload);
}
