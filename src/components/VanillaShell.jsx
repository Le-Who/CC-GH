import React, { useEffect, useRef } from "react";
import rawHtml from "../vanilla/htmlContent.html?raw";

function VanillaShell() {
  const containerRef = useRef(null);

  useEffect(() => {
    let initialized = false;

    // Defer the execution of main.js so the DOM gets painted first
    const initVanillaCode = async () => {
      if (initialized) return;
      initialized = true;
      try {
        const { default: bootApp } = await import("../vanilla/main.js");
        if (typeof bootApp === "function") {
          await bootApp();
        }
      } catch (e) {
        console.error("Error booting vanilla apps:", e);
      }
    };

    initVanillaCode();
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full pointer-events-auto"
        dangerouslySetInnerHTML={{ __html: rawHtml }}
      />

      {/* ═══ Pet Companion Overlay (Managed by Vanilla pet.js, highly optimized physics) ═══ */}
      <div className="pet-overlay dock-ground" id="pet-overlay">
        <div className="pet-container state-idle" id="pet-container">
          <div
            className="pet-mood-indicator"
            id="pet-mood-indicator"
            style={{ display: "none" }}
          ></div>
          <div className="pet-sprite" id="pet-sprite">
            🐕
          </div>
          <div className="pet-hearts" id="pet-hearts"></div>
        </div>
      </div>
    </>
  );
}

export default React.memo(VanillaShell);
