/** Date.now is not a media clock. Refreshes correct drift forward without
 * replaying an already shown paw pose when a snapshot took longer to arrive. */
export class PresentationClock {
  constructor(monotonicNow = () => performance.now()) { this.monotonicNow=monotonicNow;this.serverMs=null;this.receivedMs=0; }
  read() { return this.serverMs === null ? null : this.serverMs+Math.max(0,this.monotonicNow()-this.receivedMs); }
  update(serverMs) {
    if(!Number.isSafeInteger(serverMs)||serverMs<0)throw Error('Invalid authoritative Yard clock');
    const previous=this.read();this.serverMs=previous===null?serverMs:Math.max(previous,serverMs);this.receivedMs=this.monotonicNow();
    return this.read();
  }
}
