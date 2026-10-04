import { isHomeLeaveReady } from "../../app/homeNavigation.js";

// Home retains this game. Dismiss only the Settings launcher after an owned,
// settled return; a failed switch, pending command or account change keeps it.
export function shouldDismissYardSettingsAfterHome({ previous, homeOpen, activeScreen, state }) {
  return previous.open && !homeOpen
    && activeScreen === "settings"
    && state.activeTab === "room"
    && previous.accountSession === state.accountSession
    && previous.accountId === state.snapshot?.player?.id
    && isHomeLeaveReady(state, state.snapshot?.player?.id);
}
