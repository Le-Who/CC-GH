import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const rootDir = process.cwd();
const publicRoot = path.join(rootDir, "public", "games", "settlement");
const sourceRoot = path.join(rootDir, "assets-source", "imagegen", "settlement", "ui");
const titleAlphaSource = path.join(sourceRoot, "hud", "settlement-title-plaque-alpha.png");
const manifestPath = path.join(sourceRoot, "prod-ready-ui-chrome-manifest.json");

const webpOptions = {
  quality: 92,
  alphaQuality: 100,
  effort: 4,
  smartSubsample: false,
};

const alphaThreshold = 10;

function svg({ width, height, defs = "", body = "" }) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a2b13"/>
      <stop offset="0.47" stop-color="#211007"/>
      <stop offset="1" stop-color="#3a210e"/>
    </linearGradient>
    <linearGradient id="woodSoft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b3418"/>
      <stop offset="0.52" stop-color="#281409"/>
      <stop offset="1" stop-color="#130905"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff0a5"/>
      <stop offset="0.24" stop-color="#d99a2d"/>
      <stop offset="0.56" stop-color="#714116"/>
      <stop offset="1" stop-color="#ffd36b"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c1d86b"/>
      <stop offset="0.55" stop-color="#7d8f32"/>
      <stop offset="1" stop-color="#4f641f"/>
    </linearGradient>
    <linearGradient id="disabled" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5b5549"/>
      <stop offset="1" stop-color="#211d19"/>
    </linearGradient>
    <linearGradient id="blueActive" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#86e7ff"/>
      <stop offset="0.55" stop-color="#21678a"/>
      <stop offset="1" stop-color="#0c2d42"/>
    </linearGradient>
    <radialGradient id="glowGold" cx="50%" cy="50%" r="55%">
      <stop offset="0" stop-color="#fff0a0" stop-opacity=".74"/>
      <stop offset=".46" stop-color="#d79a2f" stop-opacity=".26"/>
      <stop offset="1" stop-color="#d79a2f" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#040200" flood-opacity=".55"/>
    </filter>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.95  0 0.72 0 0 0.53  0 0 0.25 0 0.05  0 0 0 .7 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${defs}
  </defs>
  ${body}
</svg>`);
}

function woodLines(width, height, inset = 18, opacity = 0.32) {
  const lines = [];
  const count = Math.max(2, Math.floor(height / 86));
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const y = inset + (height - inset * 2) * t;
    const wobble = ((index % 4) - 1.5) * Math.max(4, height * 0.008);
    const x1 = inset + ((index * 29) % Math.max(1, width * 0.08));
    const x2 = width - inset - ((index * 41) % Math.max(1, width * 0.09));
    const c1x = width * (0.18 + (index % 3) * 0.07);
    const c2x = width * (0.62 + (index % 2) * 0.09);
    lines.push(`<path d="M ${x1.toFixed(1)} ${(y + wobble).toFixed(1)} C ${c1x.toFixed(1)} ${(y - height * 0.025).toFixed(1)}, ${c2x.toFixed(1)} ${(y + height * 0.03).toFixed(1)}, ${x2.toFixed(1)} ${(y - wobble * 0.5).toFixed(1)}" fill="none" stroke="#8b5b28" stroke-width="${Math.max(1, height / 220)}" opacity="${opacity}"/>`);
    if (index % 2 === 0) {
      const knotX = inset + (width - inset * 2) * (0.25 + ((index * 17) % 40) / 100);
      const knotY = Math.max(inset, Math.min(height - inset, y + height * 0.012));
      lines.push(`<ellipse cx="${knotX.toFixed(1)}" cy="${knotY.toFixed(1)}" rx="${Math.max(6, width * 0.018).toFixed(1)}" ry="${Math.max(2, height * 0.006).toFixed(1)}" fill="none" stroke="#a16b32" stroke-width="${Math.max(1, height / 260)}" opacity="${opacity * 0.55}"/>`);
    }
  }
  return lines.join("");
}

function ornaments(width, height, { corner = true, mid = true, scale = 1 } = {}) {
  const r = Math.max(3, Math.min(width, height) * 0.035 * scale);
  const cornerMarkup = corner ? [
    [r * 4, r * 4],
    [width - r * 4, r * 4],
    [r * 4, height - r * 4],
    [width - r * 4, height - r * 4],
  ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gold)" stroke="#3d2209" stroke-width="${Math.max(1, r * 0.35)}"/>`).join("") : "";
  const diamond = (x, y, d) => `<path d="M ${x} ${y - d} L ${x + d} ${y} L ${x} ${y + d} L ${x - d} ${y} Z" fill="url(#gold)" stroke="#4a2608" stroke-width="${Math.max(1, d * 0.18)}"/>`;
  const midMarkup = mid ? [
    diamond(width / 2, Math.max(r * 2.8, 9), r * 1.4),
    diamond(width / 2, height - Math.max(r * 2.8, 9), r * 1.4),
  ].join("") : "";
  return `${cornerMarkup}${midMarkup}`;
}

function frameSvg(width, height, options = {}) {
  const {
    radius = Math.min(width, height) * 0.12,
    fill = "url(#wood)",
    edge = "url(#gold)",
    active = false,
    disabled = false,
    warning = false,
    ornate = true,
    innerInset = Math.max(8, Math.min(width, height) * 0.095),
    stroke = Math.max(2, Math.min(width, height) * 0.035),
  } = options;
  const glow = active ? `<rect x="${stroke}" y="${stroke}" width="${width - stroke * 2}" height="${height - stroke * 2}" rx="${radius}" fill="none" stroke="#ffe68d" stroke-width="${stroke * 1.35}" opacity=".58" filter="url(#softGlow)"/>` : "";
  const warningWash = warning ? `<rect x="${innerInset}" y="${innerInset}" width="${width - innerInset * 2}" height="${height - innerInset * 2}" rx="${Math.max(2, radius - innerInset * 0.5)}" fill="#9b4a12" opacity=".24"/>` : "";
  const muted = disabled ? " opacity=\".72\"" : "";
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)"${muted}>
        ${glow}
        <rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" rx="${radius}" fill="${disabled ? "url(#disabled)" : fill}" stroke="${edge}" stroke-width="${stroke}"/>
        <rect x="${innerInset}" y="${innerInset}" width="${width - innerInset * 2}" height="${height - innerInset * 2}" rx="${Math.max(2, radius - innerInset * 0.55)}" fill="${disabled ? "#221f1b" : "url(#woodSoft)"}" stroke="#6a3f18" stroke-width="${Math.max(1, stroke * 0.35)}" opacity=".96"/>
        ${woodLines(width, height, innerInset + 7, disabled ? 0.07 : 0.13)}
        ${warningWash}
        <rect x="${innerInset + 3}" y="${innerInset + 3}" width="${width - (innerInset + 3) * 2}" height="${Math.max(2, (height - (innerInset + 3) * 2) * 0.18)}" rx="${Math.max(2, radius * 0.18)}" fill="#ffe7a8" opacity="${disabled ? ".05" : ".10"}"/>
        ${ornate ? ornaments(width, height) : ""}
      </g>
    `,
  });
}

function circleSvg(width, height, options = {}) {
  const {
    active = false,
    disabled = false,
    badge = false,
    fill = "url(#wood)",
  } = options;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.39;
  const glow = active ? `<circle cx="${cx}" cy="${cy}" r="${r * 1.07}" fill="none" stroke="#ffe58c" stroke-width="${r * 0.16}" opacity=".66" filter="url(#softGlow)"/>` : "";
  const innerFill = badge ? "#b9231f" : disabled ? "url(#disabled)" : fill;
  const mark = badge ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.48}" fill="#df3b32" opacity=".5"/>` : "";
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)" opacity="${disabled ? ".72" : "1"}">
        ${glow}
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${innerFill}" stroke="url(#gold)" stroke-width="${Math.max(4, r * 0.15)}"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.76}" fill="none" stroke="#5d3310" stroke-width="${Math.max(2, r * 0.06)}"/>
        ${mark}
        <path d="M ${cx} ${cy - r * 1.05} L ${cx + r * 0.16} ${cy - r * 0.68} L ${cx} ${cy - r * 0.47} L ${cx - r * 0.16} ${cy - r * 0.68} Z" fill="url(#gold)" opacity=".9"/>
        <path d="M ${cx} ${cy + r * 1.05} L ${cx + r * 0.16} ${cy + r * 0.68} L ${cx} ${cy + r * 0.47} L ${cx - r * 0.16} ${cy + r * 0.68} Z" fill="url(#gold)" opacity=".9"/>
      </g>
    `,
  });
}

function navFrameSvg(width, height) {
  const slotCount = 6;
  const padX = width * 0.055;
  const padY = height * 0.18;
  const gap = width * 0.01;
  const slotW = (width - padX * 2 - gap * (slotCount - 1)) / slotCount;
  let slots = "";
  for (let index = 0; index < slotCount; index += 1) {
    const x = padX + index * (slotW + gap);
    slots += `<rect x="${x}" y="${padY}" width="${slotW}" height="${height - padY * 1.35}" rx="${height * 0.09}" fill="#1b0e06" stroke="#6e431a" stroke-width="${height * 0.012}" opacity=".58"/>`;
  }
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        <path d="M ${width * 0.035} ${height * 0.22} L ${width * 0.09} ${height * 0.12} H ${width * 0.91} L ${width * 0.965} ${height * 0.22} V ${height * 0.82} L ${width * 0.91} ${height * 0.92} H ${width * 0.09} L ${width * 0.035} ${height * 0.82} Z" fill="url(#wood)" stroke="url(#gold)" stroke-width="${height * 0.035}"/>
        ${woodLines(width, height, height * 0.18, 0.09)}
        ${slots}
        ${ornaments(width, height, { scale: 0.55 })}
      </g>
    `,
  });
}

function progressFrameSvg(width, height) {
  const inset = Math.max(6, height * 0.22);
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        <rect x="${height * 0.08}" y="${height * 0.18}" width="${width - height * 0.16}" height="${height * 0.64}" rx="${height * 0.28}" fill="#180c05" stroke="url(#gold)" stroke-width="${Math.max(2, height * 0.08)}"/>
        <rect x="${inset}" y="${height * 0.34}" width="${width - inset * 2}" height="${height * 0.32}" rx="${height * 0.15}" fill="#0b0604" stroke="#4e2a0c" stroke-width="${Math.max(1, height * 0.03)}"/>
      </g>
    `,
  });
}

function fillSvg(width, height, color = "green") {
  const gradient = color === "gold" ? "url(#gold)" : "url(#green)";
  return svg({
    width,
    height,
    body: `
      <rect x="0" y="${height * 0.12}" width="${width}" height="${height * 0.76}" rx="${height * 0.34}" fill="${gradient}"/>
      <rect x="${width * 0.025}" y="${height * 0.2}" width="${width * 0.95}" height="${height * 0.18}" rx="${height * 0.09}" fill="#fff2b0" opacity=".24"/>
    `,
  });
}

function headerStripSvg(width, height) {
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        <path d="M ${height * 0.42} ${height * 0.16} H ${width - height * 0.42} L ${width - height * 0.18} ${height * 0.5} L ${width - height * 0.42} ${height * 0.84} H ${height * 0.42} L ${height * 0.18} ${height * 0.5} Z" fill="url(#wood)" stroke="url(#gold)" stroke-width="${Math.max(2, height * 0.07)}"/>
        ${woodLines(width, height, height * 0.38, 0.09)}
        ${ornaments(width, height, { corner: false, mid: true, scale: 0.6 })}
      </g>
    `,
  });
}

function buttonSvg(width, height, options = {}) {
  const {
    state = "idle",
    wide = false,
  } = options;
  const disabled = state === "disabled";
  const active = state === "active" || state === "pressed" || state === "in-progress";
  const fill = state === "idle"
    ? "url(#wood)"
    : state === "in-progress"
      ? "url(#blueActive)"
      : active
        ? "url(#green)"
        : "url(#disabled)";
  return frameSvg(width, height, {
    radius: wide ? height * 0.26 : Math.min(width, height) * 0.18,
    fill,
    active,
    disabled,
    ornate: true,
    innerInset: Math.max(7, Math.min(width, height) * 0.12),
    stroke: Math.max(3, Math.min(width, height) * 0.05),
  });
}

function panelShellSvg(width, height, options = {}) {
  const { active = false, compact = false } = options;
  const stroke = Math.max(8, Math.min(width, height) * 0.02);
  const inner = compact ? Math.max(18, width * 0.045) : Math.max(26, width * 0.055);
  const innerW = width - inner * 2;
  const innerH = height - inner * 2;
  const panelGrain = `
    <rect x="${inner}" y="${inner}" width="${innerW}" height="${innerH}" rx="${width * 0.035}" fill="#160b05" stroke="#6d4217" stroke-width="${Math.max(3, stroke * 0.35)}" opacity=".96"/>
    <ellipse cx="${width * 0.24}" cy="${height * 0.24}" rx="${width * 0.28}" ry="${height * 0.18}" fill="#5a3313" opacity=".10"/>
    <ellipse cx="${width * 0.74}" cy="${height * 0.72}" rx="${width * 0.32}" ry="${height * 0.22}" fill="#4a2a10" opacity=".08"/>
    <path d="M ${inner + innerW * 0.06} ${inner + innerH * 0.30} C ${inner + innerW * 0.28} ${inner + innerH * 0.18}, ${inner + innerW * 0.54} ${inner + innerH * 0.41}, ${inner + innerW * 0.94} ${inner + innerH * 0.26}" fill="none" stroke="#8b5b28" stroke-width="${Math.max(4, width * 0.008)}" opacity=".08"/>
    <path d="M ${inner + innerW * 0.04} ${inner + innerH * 0.66} C ${inner + innerW * 0.28} ${inner + innerH * 0.78}, ${inner + innerW * 0.58} ${inner + innerH * 0.56}, ${inner + innerW * 0.96} ${inner + innerH * 0.70}" fill="none" stroke="#8b5b28" stroke-width="${Math.max(4, width * 0.007)}" opacity=".07"/>
    <rect x="${inner + width * 0.012}" y="${inner + height * 0.012}" width="${innerW - width * 0.024}" height="${Math.max(12, height * 0.045)}" rx="${width * 0.018}" fill="#ffe3a3" opacity=".045"/>
  `;
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        ${active ? `<rect x="${stroke}" y="${stroke}" width="${width - stroke * 2}" height="${height - stroke * 2}" rx="${width * 0.055}" fill="none" stroke="#ffe58c" stroke-width="${stroke * 1.1}" opacity=".42" filter="url(#softGlow)"/>` : ""}
        <rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" rx="${width * 0.055}" fill="url(#wood)" stroke="url(#gold)" stroke-width="${stroke}"/>
        ${panelGrain}
        ${ornaments(width, height, { scale: 0.82 })}
      </g>
    `,
  });
}

function glowSvg(width, height, color = "gold") {
  const fill = color === "blue" ? "#70e0ff" : "#ffe08a";
  return svg({
    width,
    height,
    body: `
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.42}" ry="${height * 0.42}" fill="${fill}" opacity=".2" filter="url(#softGlow)"/>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.31}" ry="${height * 0.31}" fill="${fill}" opacity=".22"/>
    `,
  });
}

function topbarFrameSvg(width, height) {
  const stroke = Math.max(5, height * 0.055);
  const pad = height * 0.18;
  const divisions = [0.19, 0.38, 0.995];
  const separators = divisions.slice(0, -1).map((ratio) => {
    const x = width * ratio;
    return `<path d="M ${x} ${height * 0.18} C ${x - height * 0.12} ${height * 0.34}, ${x - height * 0.12} ${height * 0.66}, ${x} ${height * 0.82}" fill="none" stroke="url(#gold)" stroke-width="${Math.max(2, stroke * 0.42)}" opacity=".64"/>`;
  }).join("");
  const resourceCells = [];
  const startX = width * 0.39;
  const endX = width - height * 0.42;
  const gap = height * 0.08;
  const cellW = (endX - startX - gap * 8) / 9;
  for (let index = 0; index < 9; index += 1) {
    const x = startX + index * (cellW + gap);
    resourceCells.push(`<rect x="${x.toFixed(1)}" y="${height * 0.2}" width="${cellW.toFixed(1)}" height="${height * 0.62}" rx="${height * 0.08}" fill="#140904" stroke="#654019" stroke-width="${Math.max(1, height * 0.016)}" opacity=".84"/>`);
  }
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        <path d="M ${height * 0.18} ${height * 0.5} L ${height * 0.56} ${height * 0.12} H ${width - height * 0.48} L ${width - height * 0.14} ${height * 0.5} L ${width - height * 0.48} ${height * 0.88} H ${height * 0.56} Z" fill="url(#wood)" stroke="url(#gold)" stroke-width="${stroke}"/>
        <rect x="${pad}" y="${height * 0.18}" width="${width - pad * 2}" height="${height * 0.64}" rx="${height * 0.12}" fill="#160b05" opacity=".62"/>
        <ellipse cx="${width * 0.22}" cy="${height * 0.46}" rx="${width * 0.16}" ry="${height * 0.34}" fill="#7b451b" opacity=".10"/>
        <ellipse cx="${width * 0.68}" cy="${height * 0.50}" rx="${width * 0.28}" ry="${height * 0.34}" fill="#6a3b17" opacity=".07"/>
        ${woodLines(width, height, height * 0.28, 0.06)}
        ${resourceCells.join("")}
        ${separators}
        <rect x="${height * 0.38}" y="${height * 0.16}" width="${width - height * 0.76}" height="${height * 0.13}" rx="${height * 0.06}" fill="#ffe6ac" opacity=".06"/>
        ${ornaments(width, height, { scale: 0.42 })}
      </g>
    `,
  });
}

function parchmentMapSvg(width, height) {
  const islands = [
    { cx: 250, cy: 235, rx: 135, ry: 90, color: "#9f7b39", rotate: -12 },
    { cx: 540, cy: 150, rx: 150, ry: 86, color: "#a48343", rotate: 10 },
    { cx: 720, cy: 285, rx: 112, ry: 72, color: "#8f713c", rotate: -8 },
    { cx: 430, cy: 340, rx: 155, ry: 76, color: "#92783c", rotate: 7 },
  ];
  const islandMarkup = islands.map((island, index) => `
    <g transform="rotate(${island.rotate} ${island.cx} ${island.cy})">
      <ellipse cx="${island.cx}" cy="${island.cy}" rx="${island.rx}" ry="${island.ry}" fill="${island.color}" stroke="#62421d" stroke-width="5"/>
      <ellipse cx="${island.cx - island.rx * 0.16}" cy="${island.cy - island.ry * 0.14}" rx="${island.rx * 0.62}" ry="${island.ry * 0.52}" fill="#5d6f39" opacity=".48"/>
      <path d="M ${island.cx - island.rx * 0.55} ${island.cy + island.ry * 0.12} C ${island.cx - island.rx * 0.1} ${island.cy - island.ry * 0.28}, ${island.cx + island.rx * 0.2} ${island.cy + island.ry * 0.34}, ${island.cx + island.rx * 0.56} ${island.cy - island.ry * 0.12}" fill="none" stroke="#3e4c28" stroke-width="10" opacity=".38"/>
      ${Array.from({ length: 6 }, (_, point) => {
        const x = island.cx - island.rx * 0.48 + point * island.rx * 0.18 + (index % 2) * 10;
        const y = island.cy - island.ry * 0.18 + ((point % 3) - 1) * island.ry * 0.18;
        return `<path d="M ${x} ${y + 22} L ${x + 20} ${y - 18} L ${x + 42} ${y + 22} Z" fill="#6b542d" stroke="#473116" stroke-width="3" opacity=".86"/>`;
      }).join("")}
    </g>`).join("");
  return svg({
    width,
    height,
    defs: `
      <radialGradient id="mapWater" cx="52%" cy="45%" r="72%">
        <stop offset="0" stop-color="#4f9aa1"/>
        <stop offset=".58" stop-color="#317277"/>
        <stop offset="1" stop-color="#234b55"/>
      </radialGradient>
      <filter id="paperNoise">
        <feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="3" seed="7"/>
        <feColorMatrix type="saturate" values=".18"/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 .22"/></feComponentTransfer>
      </filter>
    `,
    body: `
      <rect width="${width}" height="${height}" fill="#caa263"/>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#mapWater)" opacity=".74"/>
      <rect width="${width}" height="${height}" fill="#7a5226" opacity=".18" filter="url(#paperNoise)"/>
      <path d="M 28 36 C 170 4, 218 84, 344 45 S 566 12, 684 54 S 855 30, 995 64" fill="none" stroke="#e5c282" stroke-width="34" stroke-linecap="round" opacity=".42"/>
      <path d="M 32 ${height - 56} C 196 ${height - 12}, 298 ${height - 92}, 460 ${height - 50} S 748 ${height - 16}, 990 ${height - 74}" fill="none" stroke="#d8b06c" stroke-width="38" stroke-linecap="round" opacity=".36"/>
      ${islandMarkup}
      <path d="M 128 112 C 286 76, 408 225, 568 181 S 792 190, 902 104" fill="none" stroke="#efe0b8" stroke-width="4" stroke-dasharray="18 16" opacity=".55"/>
      <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="#6b451b" stroke-width="5" opacity=".7"/>
    `,
  });
}

function compassSvg(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.36;
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)" opacity=".94">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#c99d56" stroke="#533515" stroke-width="${r * 0.08}"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.76}" fill="none" stroke="#6d451b" stroke-width="${r * 0.04}"/>
        <path d="M ${cx} ${cy - r * 1.05} L ${cx + r * 0.22} ${cy - r * 0.18} L ${cx} ${cy + r * 0.08} L ${cx - r * 0.22} ${cy - r * 0.18} Z" fill="#6d2c17"/>
        <path d="M ${cx} ${cy + r * 1.05} L ${cx + r * 0.18} ${cy + r * 0.18} L ${cx} ${cy - r * 0.08} L ${cx - r * 0.18} ${cy + r * 0.18} Z" fill="#e8c373"/>
        <path d="M ${cx - r * 1.05} ${cy} L ${cx - r * 0.12} ${cy - r * 0.18} L ${cx + r * 0.08} ${cy} L ${cx - r * 0.12} ${cy + r * 0.18} Z" fill="#a26f2a"/>
        <path d="M ${cx + r * 1.05} ${cy} L ${cx + r * 0.12} ${cy - r * 0.18} L ${cx - r * 0.08} ${cy} L ${cx + r * 0.12} ${cy + r * 0.18} Z" fill="#a26f2a"/>
      </g>
    `,
  });
}

function markerSvg(width, height, tone = "available") {
  const colors = {
    home: ["#d8f08a", "#6f8e36", "#243a18"],
    available: ["#7be2ff", "#147eaa", "#082d4b"],
    selected: ["#fff09a", "#d68c16", "#4b2308"],
    locked: ["#9b927c", "#4e4539", "#1f1c18"],
  }[tone] ?? ["#7be2ff", "#147eaa", "#082d4b"];
  const r = Math.min(width, height) * 0.34;
  return svg({
    width,
    height,
    body: `
      <g filter="url(#shadow)">
        <circle cx="${width / 2}" cy="${height / 2}" r="${r * 1.14}" fill="url(#glowGold)" opacity="${tone === "selected" ? ".95" : ".35"}"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="${colors[1]}" stroke="url(#gold)" stroke-width="${r * 0.18}"/>
        <circle cx="${width / 2}" cy="${height / 2 - r * 0.12}" r="${r * 0.62}" fill="${colors[0]}" opacity=".72"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="${r * 0.55}" fill="${colors[2]}" opacity=".25"/>
      </g>
    `,
  });
}

function expeditionThumbSvg(width, height, tone = "forest") {
  const palette = {
    forest: ["#2e6535", "#9d984f", "#d8b35d", "#244d56"],
    ruins: ["#154b5d", "#2d90a9", "#97c8c9", "#153043"],
    volcano: ["#5d2419", "#c65424", "#f3b35a", "#21110d"],
    ice: ["#5f7d8f", "#b8d4d6", "#e6efe9", "#283644"],
  }[tone] ?? ["#2e6535", "#9d984f", "#d8b35d", "#244d56"];
  return svg({
    width,
    height,
    body: `
      <rect width="${width}" height="${height}" fill="${palette[3]}"/>
      <rect width="${width}" height="${height}" fill="url(#woodSoft)" opacity=".12"/>
      <path d="M 0 ${height * 0.72} C ${width * 0.22} ${height * 0.44}, ${width * 0.44} ${height * 0.82}, ${width * 0.68} ${height * 0.48} S ${width * 0.9} ${height * 0.62}, ${width} ${height * 0.42} V ${height} H 0 Z" fill="${palette[0]}"/>
      <path d="M 0 ${height * 0.84} C ${width * 0.3} ${height * 0.58}, ${width * 0.52} ${height * 0.94}, ${width} ${height * 0.68} V ${height} H 0 Z" fill="${palette[1]}" opacity=".78"/>
      <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${height * 0.18}" fill="${palette[2]}" opacity=".32"/>
      ${tone === "volcano" ? `<path d="M ${width * 0.45} ${height * 0.78} L ${width * 0.58} ${height * 0.22} L ${width * 0.75} ${height * 0.78} Z" fill="#2a1511"/><path d="M ${width * 0.55} ${height * 0.3} L ${width * 0.61} ${height * 0.56} L ${width * 0.52} ${height * 0.58} Z" fill="#f0722c"/>` : ""}
      ${tone === "ruins" ? `<path d="M ${width * 0.22} ${height * 0.72} L ${width * 0.34} ${height * 0.34} H ${width * 0.43} L ${width * 0.5} ${height * 0.72} Z" fill="#304a4a"/><path d="M ${width * 0.58} ${height * 0.72} L ${width * 0.64} ${height * 0.4} H ${width * 0.72} L ${width * 0.78} ${height * 0.72} Z" fill="#31565a"/>` : ""}
      ${tone === "forest" ? Array.from({ length: 8 }, (_, i) => `<path d="M ${18 + i * 14} ${height * 0.78} L ${30 + i * 14} ${height * 0.34} L ${44 + i * 14} ${height * 0.78} Z" fill="#173d1d" opacity=".74"/>`).join("") : ""}
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#e2b567" stroke-width="2" opacity=".72"/>
    `,
  });
}

function connectorSvg(width, height, orientation = "horizontal") {
  const horizontal = orientation === "horizontal";
  const pathData = horizontal
    ? `M ${width * 0.08} ${height * 0.5} H ${width * 0.88}`
    : `M ${width * 0.5} ${height * 0.08} V ${height * 0.88}`;
  return svg({
    width,
    height,
    body: `<path d="${pathData}" fill="none" stroke="#d8b06c" stroke-width="${Math.max(3, Math.min(width, height) * 0.16)}" stroke-dasharray="10 8" stroke-linecap="round" opacity=".78"/>`,
  });
}

const remainingScreenAssets = [
  // Screen 3: goals panel.
  { key: "panel.right.shell.goals", file: "ui/panel/right-panel-goals-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.goal-title", file: "ui/panel/right-panel-goals-title-strip.webp", width: 768, height: 96, render: headerStripSvg },
  { key: "panel.goals.summary.card", file: "ui/panel/goals-summary-card.webp", width: 640, height: 128, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },
  { key: "panel.goals.longterm.row", file: "ui/panel/goals-longterm-row.webp", width: 640, height: 104, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 4, ornate: false }) },
  { key: "panel.goals.daily.row", file: "ui/panel/goals-daily-row.webp", width: 640, height: 104, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 4, active: true, ornate: false }) },
  { key: "panel.goals.goal.icon-slot", file: "ui/panel/goals-icon-slot.webp", width: 72, height: 72, render: (w, h) => circleSvg(w, h) },
  { key: "panel.goals.reward.badge", file: "ui/status/goals-reward-badge.webp", width: 128, height: 96, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 8, stroke: 4, ornate: false }) },
  { key: "panel.goals.claim.button.idle", file: "ui/button/goals-claim-button-idle.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.goals.claim.button.disabled", file: "ui/button/goals-claim-button-disabled.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },
  { key: "panel.goals.claim.count.badge", file: "ui/status/goals-claim-count-badge.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { badge: true }) },
  { key: "panel.goals.refresh.chip", file: "ui/status/goals-refresh-chip.webp", width: 256, height: 64, render: (w, h) => frameSvg(w, h, { radius: 20, innerInset: 7, stroke: 3, ornate: false }) },
  { key: "panel.goals.progress.row", file: "ui/status/goals-progress-row.webp", width: 512, height: 64, render: progressFrameSvg },
  { key: "hud.bottomnav.button.goals.active", file: "ui/hud/bottom-nav-button-goals-active.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 9, active: true }) },
  { key: "hud.bottomnav.button.goals.idle", file: "ui/hud/bottom-nav-button-goals-idle.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 8 }) },

  // Screen 4: inventory and storage.
  { key: "panel.right.shell.inventory", file: "ui/panel/right-panel-inventory-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.inventory-strip", file: "ui/panel/right-panel-inventory-title-strip.webp", width: 768, height: 96, render: headerStripSvg },
  { key: "panel.inventory.summary.card", file: "ui/panel/inventory-summary-card.webp", width: 640, height: 128, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },
  { key: "panel.inventory.resource.row.idle", file: "ui/panel/inventory-resource-row-idle.webp", width: 640, height: 88, render: (w, h) => frameSvg(w, h, { radius: 13, innerInset: 9, stroke: 4, ornate: false }) },
  { key: "panel.inventory.resource.row.selected", file: "ui/panel/inventory-resource-row-selected.webp", width: 640, height: 88, render: (w, h) => frameSvg(w, h, { radius: 13, innerInset: 9, stroke: 4, active: true, ornate: false }) },
  { key: "panel.inventory.resource.row.warning", file: "ui/panel/inventory-resource-row-warning.webp", width: 640, height: 88, render: (w, h) => frameSvg(w, h, { radius: 13, innerInset: 9, stroke: 4, warning: true, ornate: false }) },
  { key: "panel.inventory.resource.icon.slot", file: "ui/panel/inventory-resource-icon-slot.webp", width: 72, height: 72, render: (w, h) => circleSvg(w, h) },
  { key: "panel.inventory.control.minus.idle", file: "ui/button/inventory-minus-idle.webp", width: 48, height: 48, render: (w, h) => buttonSvg(w, h) },
  { key: "panel.inventory.control.minus.disabled", file: "ui/button/inventory-minus-disabled.webp", width: 48, height: 48, render: (w, h) => buttonSvg(w, h, { state: "disabled" }) },
  { key: "panel.inventory.control.plus.idle", file: "ui/button/inventory-plus-idle.webp", width: 48, height: 48, render: (w, h) => buttonSvg(w, h, { state: "active" }) },
  { key: "panel.inventory.control.plus.disabled", file: "ui/button/inventory-plus-disabled.webp", width: 48, height: 48, render: (w, h) => buttonSvg(w, h, { state: "disabled" }) },
  { key: "panel.inventory.control.select.idle", file: "ui/button/inventory-select-idle.webp", width: 48, height: 48, render: (w, h) => buttonSvg(w, h, { state: "active" }) },
  { key: "panel.inventory.item.card.idle", file: "ui/panel/inventory-item-card-idle.webp", width: 128, height: 128, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 5 }) },
  { key: "panel.inventory.item.card.count.badge", file: "ui/status/inventory-item-count-badge.webp", width: 96, height: 64, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 7, stroke: 3, ornate: false }) },
  { key: "panel.inventory.action.button.idle", file: "ui/button/inventory-manage-button-idle.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.inventory.action.button.disabled", file: "ui/button/inventory-manage-button-disabled.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },

  // Screen 5: council and recommendations.
  { key: "panel.right.shell.council", file: "ui/panel/right-panel-council-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.council-icon-slot", file: "ui/panel/right-panel-council-icon-slot.webp", width: 128, height: 128, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "panel.council.recommendation.card.idle", file: "ui/panel/council-recommendation-card-idle.webp", width: 640, height: 128, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 4, ornate: false }) },
  { key: "panel.council.recommendation.card.hovered", file: "ui/panel/council-recommendation-card-hovered.webp", width: 640, height: 128, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 4, active: true, ornate: false }) },
  { key: "panel.council.advisor.portrait.slot", file: "ui/panel/council-advisor-portrait-slot.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "panel.council.recommendation.icon.slot", file: "ui/panel/council-recommendation-icon-slot.webp", width: 72, height: 72, render: (w, h) => frameSvg(w, h, { radius: 10, innerInset: 8, stroke: 4 }) },
  { key: "panel.council.follow.button.idle", file: "ui/button/council-follow-button-idle.webp", width: 240, height: 56, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.council.follow.button.disabled", file: "ui/button/council-follow-button-disabled.webp", width: 240, height: 56, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },
  { key: "panel.council.stage.card", file: "ui/panel/council-stage-card.webp", width: 640, height: 260, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 14, stroke: 5 }) },
  { key: "panel.council.stage.badge", file: "ui/panel/council-stage-badge.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "panel.council.priority.row.idle", file: "ui/panel/council-priority-row-idle.webp", width: 640, height: 72, render: (w, h) => frameSvg(w, h, { radius: 12, innerInset: 7, stroke: 3, ornate: false }) },
  { key: "panel.council.priority.row.active", file: "ui/panel/council-priority-row-active.webp", width: 640, height: 72, render: (w, h) => frameSvg(w, h, { radius: 12, innerInset: 7, stroke: 3, active: true, ornate: false }) },
  { key: "panel.council.open-research.button.idle", file: "ui/button/council-open-research-button-idle.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.council.open-research.button.disabled", file: "ui/button/council-open-research-button-disabled.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },

  // Screen 6: construction.
  { key: "panel.right.shell.construction", file: "ui/panel/right-panel-construction-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.construction-strip", file: "ui/panel/right-panel-construction-title-strip.webp", width: 768, height: 96, render: headerStripSvg },
  ...["production", "storage", "decor", "special"].flatMap((id) => [
    { key: `panel.construction.category.${id}.idle`, file: `ui/panel/construction-category-${id}-idle.webp`, width: 192, height: 112, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 10, stroke: 4 }) },
    { key: `panel.construction.category.${id}.active`, file: `ui/panel/construction-category-${id}-active.webp`, width: 192, height: 112, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 10, stroke: 4, active: true }) },
  ]),
  { key: "panel.construction.card.idle", file: "ui/panel/construction-card-idle.webp", width: 224, height: 256, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 12, stroke: 5 }) },
  { key: "panel.construction.card.selected", file: "ui/panel/construction-card-selected.webp", width: 224, height: 256, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 12, stroke: 5, active: true }) },
  { key: "panel.construction.card.locked", file: "ui/panel/construction-card-locked.webp", width: 224, height: 256, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 12, stroke: 5, disabled: true }) },
  { key: "panel.construction.card.art-glow", file: "ui/panel/construction-card-art-glow.webp", width: 192, height: 128, render: (w, h) => glowSvg(w, h) },
  { key: "panel.construction.cost-row", file: "ui/panel/construction-cost-row.webp", width: 192, height: 40, render: (w, h) => frameSvg(w, h, { radius: 12, innerInset: 5, stroke: 2, ornate: false }) },
  { key: "panel.construction.pager.button.idle", file: "ui/button/construction-pager-idle.webp", width: 64, height: 64, render: (w, h) => circleSvg(w, h) },
  { key: "panel.construction.pager.button.disabled", file: "ui/button/construction-pager-disabled.webp", width: 64, height: 64, render: (w, h) => circleSvg(w, h, { disabled: true }) },
  { key: "panel.construction.page-indicator", file: "ui/status/construction-page-indicator.webp", width: 128, height: 64, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 7, stroke: 3, ornate: false }) },
  { key: "panel.construction.placement.hint", file: "ui/panel/construction-placement-hint.webp", width: 640, height: 64, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 7, stroke: 3, active: true, ornate: false }) },
  { key: "scene.construction.plot.ring.idle", file: "ui/scene/construction-plot-ring-idle.webp", width: 384, height: 192, render: (w, h) => svg({ width: w, height: h, body: `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.42}" ry="${h * 0.31}" fill="none" stroke="#beff5f" stroke-width="${h * 0.08}" opacity=".72" filter="url(#softGlow)"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.35}" ry="${h * 0.25}" fill="none" stroke="#fff2a1" stroke-width="${h * 0.018}" opacity=".65"/>` }) },
  { key: "scene.construction.plot.ring.selected", file: "ui/scene/construction-plot-ring-selected.webp", width: 384, height: 192, render: (w, h) => svg({ width: w, height: h, body: `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.44}" ry="${h * 0.33}" fill="#d7ff70" opacity=".08"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.42}" ry="${h * 0.31}" fill="none" stroke="#d7ff70" stroke-width="${h * 0.1}" opacity=".9" filter="url(#softGlow)"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.34}" ry="${h * 0.24}" fill="none" stroke="#fff7ba" stroke-width="${h * 0.022}" opacity=".9"/>` }) },
  { key: "scene.construction.ghost.overlay", file: "ui/scene/construction-building-ghost-overlay.webp", width: 512, height: 512, render: (w, h) => svg({ width: w, height: h, body: `<rect width="${w}" height="${h}" fill="#c6f06f" opacity=".16"/><rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.84}" height="${h * 0.84}" rx="${w * 0.08}" fill="none" stroke="#d5ffc2" stroke-width="${w * 0.035}" opacity=".42" filter="url(#softGlow)"/>` }) },
  { key: "scene.construction.confirm.button.idle", file: "ui/button/construction-confirm-idle.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "scene.construction.confirm.button.pressed", file: "ui/button/construction-confirm-pressed.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "scene.construction.confirm.button.disabled", file: "ui/button/construction-confirm-disabled.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { disabled: true }) },
  { key: "toast.construction.confirm", file: "ui/toast/construction-confirm-toast.webp", width: 640, height: 112, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },

  // Screen 7: research tree.
  { key: "panel.right.shell.research", file: "ui/panel/right-panel-research-shell.webp", width: 960, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.research-strip", file: "ui/panel/right-panel-research-title-strip.webp", width: 960, height: 104, render: headerStripSvg },
  { key: "panel.research.intro.strip", file: "ui/panel/research-intro-strip.webp", width: 832, height: 72, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 8, stroke: 3, ornate: false }) },
  ...["farming", "trade", "culture"].flatMap((id) => [
    { key: `panel.research.category.${id}.idle`, file: `ui/tabs/research-category-${id}-idle.webp`, width: 288, height: 80, render: (w, h) => buttonSvg(w, h, { wide: true }) },
    { key: `panel.research.category.${id}.active`, file: `ui/tabs/research-category-${id}-active.webp`, width: 288, height: 80, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  ]),
  ...["complete", "available", "selected", "researching", "locked"].map((state) => ({
    key: `panel.research.node.${state}`,
    file: `ui/panel/research-node-${state}.webp`,
    width: 256,
    height: 168,
    render: (w, h) => frameSvg(w, h, {
      radius: 14,
      innerInset: 10,
      stroke: 4,
      active: state === "selected" || state === "available" || state === "researching",
      disabled: state === "locked",
      ornate: false,
      fill: state === "researching" ? "url(#blueActive)" : "url(#wood)",
    }),
  })),
  { key: "panel.research.node.icon-slot", file: "ui/panel/research-node-icon-slot.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h) },
  { key: "panel.research.node.check-badge", file: "ui/status/research-node-check-badge.webp", width: 64, height: 64, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "panel.research.node.lock-badge", file: "ui/status/research-node-lock-badge.webp", width: 64, height: 64, render: (w, h) => circleSvg(w, h, { disabled: true }) },
  { key: "panel.research.node.progress.frame", file: "ui/status/research-node-progress-frame.webp", width: 160, height: 32, render: progressFrameSvg },
  { key: "panel.research.node.progress.fill", file: "ui/status/research-node-progress-fill.webp", width: 160, height: 20, render: (w, h) => fillSvg(w, h, "green") },
  { key: "panel.research.connector.horizontal", file: "ui/panel/research-connector-horizontal.webp", width: 96, height: 24, render: (w, h) => connectorSvg(w, h, "horizontal") },
  { key: "panel.research.connector.vertical", file: "ui/panel/research-connector-vertical.webp", width: 24, height: 96, render: (w, h) => connectorSvg(w, h, "vertical") },
  { key: "panel.research.connector.arrowhead", file: "ui/panel/research-connector-arrowhead.webp", width: 32, height: 32, render: (w, h) => svg({ width: w, height: h, body: `<path d="M ${w * 0.2} ${h * 0.14} L ${w * 0.82} ${h * 0.5} L ${w * 0.2} ${h * 0.86} Z" fill="#d8b06c" opacity=".86"/>` }) },
  { key: "panel.research.detail.card", file: "ui/panel/research-detail-card.webp", width: 832, height: 176, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },
  { key: "panel.research.detail.divider", file: "ui/panel/research-detail-divider.webp", width: 16, height: 152, render: (w, h) => svg({ width: w, height: h, body: `<rect x="${w * 0.38}" y="0" width="${w * 0.24}" height="${h}" rx="${w * 0.12}" fill="url(#gold)" opacity=".54"/>` }) },
  { key: "panel.research.cost.row", file: "ui/panel/research-cost-row.webp", width: 384, height: 72, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 8, stroke: 3, ornate: false }) },
  { key: "panel.research.cost.item.ok", file: "ui/status/research-cost-item-ok.webp", width: 128, height: 48, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 5, stroke: 2, ornate: false }) },
  { key: "panel.research.cost.item.need", file: "ui/status/research-cost-item-need.webp", width: 128, height: 48, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 5, stroke: 2, warning: true, ornate: false }) },
  { key: "panel.research.study.button.idle", file: "ui/button/research-study-button-idle.webp", width: 360, height: 88, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.research.study.button.pressed", file: "ui/button/research-study-button-pressed.webp", width: 360, height: 88, render: (w, h) => buttonSvg(w, h, { state: "pressed", wide: true }) },
  { key: "panel.research.study.button.disabled", file: "ui/button/research-study-button-disabled.webp", width: 360, height: 88, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },
  { key: "panel.research.timer.icon", file: "ui/status/research-timer-hourglass.webp", width: 48, height: 48, render: (w, h) => circleSvg(w, h) },
  { key: "toast.research.started", file: "ui/toast/research-started-toast.webp", width: 640, height: 112, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },
  { key: "toast.research.complete", file: "ui/toast/research-complete-toast.webp", width: 640, height: 112, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5, active: true }) },

  // Screen 8: world map and expeditions.
  { key: "panel.right.shell.world-map", file: "ui/panel/right-panel-world-map-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.world-map-strip", file: "ui/panel/right-panel-world-map-title-strip.webp", width: 768, height: 104, render: headerStripSvg },
  { key: "panel.world-map.parchment.frame", file: "ui/panel/world-map-parchment-frame.webp", width: 672, height: 312, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 11, stroke: 5, fill: "#8a5b2a" }) },
  { key: "panel.world-map.parchment.base", file: "ui/map/world-map-archipelago-base.webp", width: 1024, height: 512, render: parchmentMapSvg },
  { key: "panel.world-map.compass", file: "ui/map/world-map-compass.webp", width: 96, height: 96, render: compassSvg },
  { key: "panel.world-map.marker.home", file: "ui/map/world-map-marker-home.webp", width: 64, height: 64, render: (w, h) => markerSvg(w, h, "home") },
  { key: "panel.world-map.marker.available", file: "ui/map/world-map-marker-available.webp", width: 64, height: 64, render: (w, h) => markerSvg(w, h, "available") },
  { key: "panel.world-map.marker.selected", file: "ui/map/world-map-marker-selected.webp", width: 64, height: 64, render: (w, h) => markerSvg(w, h, "selected") },
  { key: "panel.world-map.marker.locked", file: "ui/map/world-map-marker-locked.webp", width: 64, height: 64, render: (w, h) => markerSvg(w, h, "locked") },
  ...["idle", "active", "disabled"].map((state) => ({ key: `panel.world-map.filter.button.${state}`, file: `ui/tabs/world-map-filter-${state}.webp`, width: 96, height: 72, render: (w, h) => buttonSvg(w, h, { state: state === "active" ? "active" : state === "disabled" ? "disabled" : "idle", wide: true }) })),
  ...["idle", "selected", "active", "locked"].map((state) => ({ key: `panel.world-map.expedition.card.${state}`, file: `ui/panel/world-expedition-card-${state}.webp`, width: 672, height: state === "locked" ? 96 : 144, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 10, stroke: 4, active: state === "selected" || state === "active", disabled: state === "locked", ornate: false, fill: state === "active" ? "url(#blueActive)" : "url(#wood)" }) })),
  { key: "panel.world-map.expedition.thumbnail.forest", file: "ui/map/expedition-thumb-ancient-forest.webp", width: 128, height: 96, render: (w, h) => expeditionThumbSvg(w, h, "forest") },
  { key: "panel.world-map.expedition.thumbnail.ruins", file: "ui/map/expedition-thumb-drowned-ruins.webp", width: 128, height: 96, render: (w, h) => expeditionThumbSvg(w, h, "ruins") },
  { key: "panel.world-map.expedition.thumbnail.volcano", file: "ui/map/expedition-thumb-volcanic-mountains.webp", width: 128, height: 96, render: (w, h) => expeditionThumbSvg(w, h, "volcano") },
  { key: "panel.world-map.expedition.thumbnail.ice", file: "ui/map/expedition-thumb-ice-wastes.webp", width: 128, height: 96, render: (w, h) => expeditionThumbSvg(w, h, "ice") },
  ...["easy", "medium", "hard", "locked"].map((id) => ({ key: `panel.world-map.difficulty.${id}`, file: `ui/status/world-difficulty-${id}.webp`, width: 128, height: 40, render: (w, h) => frameSvg(w, h, { radius: 15, innerInset: 4, stroke: 2, ornate: false, disabled: id === "locked", warning: id === "hard" }) })),
  { key: "panel.world-map.reward-chip", file: "ui/status/world-expedition-reward-chip.webp", width: 96, height: 44, render: (w, h) => frameSvg(w, h, { radius: 12, innerInset: 5, stroke: 2, ornate: false }) },
  { key: "panel.world-map.send.button.idle", file: "ui/button/world-expedition-send-idle.webp", width: 288, height: 72, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.world-map.send.button.pressed", file: "ui/button/world-expedition-send-pressed.webp", width: 288, height: 72, render: (w, h) => buttonSvg(w, h, { state: "pressed", wide: true }) },
  { key: "panel.world-map.send.button.disabled", file: "ui/button/world-expedition-send-disabled.webp", width: 288, height: 72, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },
  { key: "panel.world-map.timer.icon", file: "ui/status/world-expedition-hourglass.webp", width: 48, height: 48, render: (w, h) => circleSvg(w, h) },
  { key: "toast.world-map.started", file: "ui/toast/world-expedition-started-toast.webp", width: 640, height: 112, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5 }) },
  { key: "toast.world-map.complete", file: "ui/toast/world-expedition-complete-toast.webp", width: 640, height: 112, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 12, stroke: 5, active: true }) },
  { key: "hud.bottomnav.button.world.active", file: "ui/hud/bottom-nav-button-world-active.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 9, active: true }) },
  { key: "hud.bottomnav.button.world.idle", file: "ui/hud/bottom-nav-button-world-idle.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 8 }) },
];

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function alphaBounds(file) {
  const image = sharp(file).ensureAlpha();
  const metadata = await image.metadata();
  const data = await image.raw().toBuffer();
  let left = metadata.width;
  let top = metadata.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= alphaThreshold) continue;
    const pixel = index / 4;
    const x = pixel % metadata.width;
    const y = Math.floor(pixel / metadata.width);
    if (x < left) left = x;
    if (y < top) top = y;
    if (x > right) right = x;
    if (y > bottom) bottom = y;
  }
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function writeWebp(asset) {
  const outputPath = path.join(publicRoot, asset.file);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  let buffer;
  if (asset.fromTitleSource && await fileExists(titleAlphaSource)) {
    const bounds = await alphaBounds(titleAlphaSource);
    if (!bounds) throw new Error(`Cannot trim empty title source: ${titleAlphaSource}`);
    buffer = await sharp(titleAlphaSource)
      .extract(bounds)
      .resize(asset.width, asset.height, { fit: "fill", kernel: "lanczos3" })
      .webp(webpOptions)
      .toBuffer();
  } else {
    buffer = await sharp(asset.render(asset.width, asset.height))
      .webp(webpOptions)
      .toBuffer();
  }
  await fs.writeFile(outputPath, buffer);
  const metadata = await sharp(outputPath).metadata();
  return {
    key: asset.key,
    file: path.relative(rootDir, outputPath).replaceAll(path.sep, "/"),
    width: metadata.width,
    height: metadata.height,
    alpha: Boolean(metadata.hasAlpha),
  };
}

const assetDefinitions = [
  // Screen 1: village overview HUD.
  { key: "hud.topbar.frame", file: "ui/hud/top-hud-bar-frame.webp", width: 1920, height: 128, render: topbarFrameSvg },
  { key: "hud.profile.frame", file: "ui/hud/profile-card-frame.webp", width: 512, height: 192, render: (w, h) => frameSvg(w, h, { radius: 34, innerInset: 22, stroke: 8 }) },
  { key: "hud.profile.avatar", file: "ui/hud/profile-avatar-frame.webp", width: 256, height: 256, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "hud.profile.level-badge", file: "ui/hud/profile-level-badge.webp", width: 128, height: 128, render: (w, h) => circleSvg(w, h, { fill: "#221006" }) },
  { key: "hud.settlement.plaque", file: "ui/hud/settlement-title-plaque.webp", width: 768, height: 192, fromTitleSource: true, render: (w, h) => headerStripSvg(w, h) },
  { key: "hud.resource.pill.idle", file: "ui/hud/resource-pill-idle.webp", width: 256, height: 128, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 14, stroke: 5, ornate: true }) },
  { key: "hud.resource.pill.active", file: "ui/hud/resource-pill-active.webp", width: 256, height: 128, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 14, stroke: 6, active: true, ornate: true }) },
  { key: "hud.resource.icon.slot", file: "ui/hud/resource-icon-slot.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h) },
  { key: "hud.leftdock.button.idle", file: "ui/hud/leftdock-button-idle.webp", width: 160, height: 160, render: (w, h) => circleSvg(w, h) },
  { key: "hud.leftdock.button.active", file: "ui/hud/leftdock-button-active.webp", width: 160, height: 160, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "hud.leftdock.badge", file: "ui/hud/notification-badge.webp", width: 96, height: 96, render: (w, h) => circleSvg(w, h, { badge: true }) },
  { key: "hud.bottomnav.frame", file: "ui/hud/bottom-nav-frame.webp", width: 1536, height: 256, render: navFrameSvg },
  { key: "hud.bottomnav.button.idle", file: "ui/hud/bottom-nav-button-idle.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 8 }) },
  { key: "hud.bottomnav.button.active", file: "ui/hud/bottom-nav-button-active.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 24, innerInset: 18, stroke: 9, active: true }) },
  { key: "hud.bottomnav.primary-build.idle", file: "ui/hud/primary-build-button-idle.webp", width: 224, height: 224, render: (w, h) => circleSvg(w, h) },
  { key: "hud.bottomnav.primary-build.active", file: "ui/hud/primary-build-button-active.webp", width: 224, height: 224, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "hud.bottomnav.collect.idle", file: "ui/hud/collect-button-idle.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 22, innerInset: 18, stroke: 8 }) },
  { key: "hud.bottomnav.collect.active", file: "ui/hud/collect-button-active.webp", width: 192, height: 192, render: (w, h) => frameSvg(w, h, { radius: 22, innerInset: 18, stroke: 9, active: true }) },
  { key: "panel.right.shell.overview", file: "ui/panel/right-panel-overview-shell.webp", width: 768, height: 1248, render: (w, h) => panelShellSvg(w, h) },
  { key: "panel.right.header.strip", file: "ui/panel/right-panel-header-strip.webp", width: 768, height: 96, render: headerStripSvg },
  { key: "panel.card.intro", file: "ui/panel/overview-intro-card.webp", width: 640, height: 128, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 13, stroke: 5 }) },
  { key: "panel.section.card", file: "ui/panel/overview-section-card.webp", width: 640, height: 160, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 14, stroke: 5 }) },
  { key: "panel.goal.row", file: "ui/panel/overview-goal-row.webp", width: 640, height: 96, render: (w, h) => frameSvg(w, h, { radius: 15, innerInset: 11, stroke: 4, ornate: false }) },
  { key: "panel.toast.collect", file: "ui/toast/collect-ready-toast.webp", width: 960, height: 128, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 14, stroke: 5 }) },
  { key: "panel.tab.idle", file: "ui/tabs/panel-tab-idle.webp", width: 192, height: 96, render: (w, h) => buttonSvg(w, h, { wide: true }) },
  { key: "panel.tab.active", file: "ui/tabs/panel-tab-active.webp", width: 192, height: 96, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "status.progress.frame", file: "ui/status/progress-frame.webp", width: 512, height: 64, render: progressFrameSvg },
  { key: "status.progress.fill.green", file: "ui/status/progress-fill-green.webp", width: 512, height: 32, render: (w, h) => fillSvg(w, h, "green") },
  { key: "status.progress.fill.gold", file: "ui/status/progress-fill-gold.webp", width: 512, height: 32, render: (w, h) => fillSvg(w, h, "gold") },
  { key: "status.badge.reward", file: "ui/status/reward-badge-shell.webp", width: 128, height: 96, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 9, stroke: 4, ornate: false }) },

  // Screen 2: building detail.
  { key: "panel.right.shell.building", file: "ui/panel/right-panel-building-shell.webp", width: 768, height: 1360, render: (w, h) => panelShellSvg(w, h, { active: true }) },
  { key: "panel.right.header.icon-slot", file: "ui/panel/right-panel-header-icon-slot.webp", width: 128, height: 128, render: (w, h) => circleSvg(w, h, { active: true }) },
  { key: "panel.building.description", file: "ui/panel/building-description-block.webp", width: 640, height: 96, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 11, stroke: 4 }) },
  { key: "panel.building.level-row", file: "ui/panel/building-level-row.webp", width: 640, height: 72, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 8, stroke: 4, ornate: false }) },
  { key: "panel.building.stats.card", file: "ui/panel/building-stats-card.webp", width: 320, height: 240, render: (w, h) => frameSvg(w, h, { radius: 16, innerInset: 12, stroke: 5 }) },
  { key: "panel.building.stats.row", file: "ui/panel/building-stat-row.webp", width: 288, height: 44, render: (w, h) => frameSvg(w, h, { radius: 8, innerInset: 5, stroke: 2, ornate: false }) },
  { key: "panel.building.action.primary.idle", file: "ui/button/building-upgrade-idle.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "active", wide: true }) },
  { key: "panel.building.action.primary.disabled", file: "ui/button/building-upgrade-disabled.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "disabled", wide: true }) },
  { key: "panel.building.action.primary.in-progress", file: "ui/button/building-upgrade-in-progress.webp", width: 640, height: 88, render: (w, h) => buttonSvg(w, h, { state: "in-progress", wide: true }) },
  { key: "panel.building.timer.pill", file: "ui/button/building-timer-pill.webp", width: 240, height: 56, render: (w, h) => frameSvg(w, h, { radius: 22, innerInset: 7, stroke: 3, ornate: false }) },
  { key: "panel.building.footer.card", file: "ui/panel/building-footer-card.webp", width: 192, height: 104, render: (w, h) => frameSvg(w, h, { radius: 14, innerInset: 10, stroke: 4 }) },
  { key: "panel.building.footer.small-icon", file: "ui/panel/building-footer-icon-slot.webp", width: 32, height: 32, render: (w, h) => circleSvg(w, h) },
  { key: "panel.toast.upgrade", file: "ui/toast/upgrade-start-toast.webp", width: 560, height: 128, render: (w, h) => frameSvg(w, h, { radius: 18, innerInset: 14, stroke: 5 }) },
  { key: "panel.toast.close", file: "ui/button/toast-close-button.webp", width: 48, height: 48, render: (w, h) => circleSvg(w, h) },
  { key: "panel.header.building-glow", file: "ui/panel/building-header-glow.webp", width: 128, height: 128, render: (w, h) => glowSvg(w, h) },
  ...remainingScreenAssets,
];

async function main() {
  const written = [];
  for (const asset of assetDefinitions) {
    written.push(await writeWebp(asset));
  }
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify({
    contract: "settlement-prod-ready-ui-chrome-v1",
    generatedAt: new Date().toISOString(),
    rules: {
      format: "webp",
      alpha: "direct alpha, no chroma-key source required",
      text: "none baked into generated UI chrome",
      fileShape: "one file per asset",
    },
    assets: written,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ writtenCount: written.length, manifest: path.relative(rootDir, manifestPath).replaceAll(path.sep, "/"), assets: written }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
