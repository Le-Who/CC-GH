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

// Inject SDK dynamically to prevent Vite from analyzing it during build phase
const sdkScript = document.createElement("script");
sdkScript.src = "/js/discord-sdk.js";
document.head.appendChild(sdkScript);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
