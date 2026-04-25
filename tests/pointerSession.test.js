import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPointerSession } from "../src/game-runtime/pointerSession.js";

function event(pointerId, x, y, extra = {}) {
  return { pointerId, global: { x, y }, ...extra };
}

describe("Pixi pointer session", () => {
  it("derives taps from pointer down/up distance and time", () => {
    let time = 1000;
    const taps = [];
    const session = createPointerSession({ now: () => time, onTap: (done) => taps.push(done) });

    session.start(event(1, 20, 30), { id: "cell" });
    time += 80;
    const done = session.end(event(1, 23, 34));

    assert.equal(done.tapped, true);
    assert.equal(done.data.id, "cell");
    assert.equal(taps.length, 1);
    assert.equal(session.isActive(), false);
  });

  it("keeps mismatched pointer ids from ending the active session", () => {
    const session = createPointerSession();
    session.start(event(5, 0, 0));

    assert.equal(session.end(event(6, 2, 2)), null);
    assert.equal(session.isActive(), true);
    assert.equal(session.end(event(5, 2, 2)).tapped, true);
    assert.equal(session.isActive(), false);
  });

  it("classifies movement past the tap threshold as a drag", () => {
    const drags = [];
    const session = createPointerSession({ onDragEnd: (done) => drags.push(done) });
    session.start(event(1, 10, 10));
    session.move(event(1, 60, 10));
    const done = session.end(event(1, 70, 12));

    assert.equal(done.tapped, false);
    assert.equal(done.moved, true);
    assert.equal(drags.length, 1);
  });

  it("releases active state on cancellation paths", () => {
    const cancellations = [];
    const session = createPointerSession({ onCancel: (done) => cancellations.push(done.reason) });
    session.start(event(1, 4, 4));

    const done = session.cancel("visibilitychange");

    assert.equal(done.cancelled, true);
    assert.equal(session.isActive(), false);
    assert.deepEqual(cancellations, ["visibilitychange"]);
  });
});

