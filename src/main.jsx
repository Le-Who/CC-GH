import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Import legacy vanilla CSS for the mini-games overlay
import "./vanilla/css/base.css";
import "./vanilla/css/farm.css";
import "./vanilla/css/trivia.css";
import "./vanilla/css/match3.css";
import "./vanilla/css/blox.css";
import "./vanilla/css/hud.css";
import "./vanilla/css/pet.css";
import "./vanilla/css/merge.css";
// Import local fonts to comply with Discord CSP (no external Google Fonts)
import "@fontsource/bungee";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@fontsource/varela-round";

import "./vanilla/css/welcome.css";
import "./vanilla/css/store.css";
import "./vanilla/css/cozy-day.css"; // v7.1: Cozy Day theme overrides
import "./vanilla/css/soft-fantasy.css"; // v7.2: Soft Fantasy theme overrides
import "./vanilla/css/minimal-calm.css"; // v7.2: Minimal Calm theme overrides

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
