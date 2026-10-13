/**
 * Generates one placeholder SVG per robot in the catalogue.
 *
 * These stand in until real product photography is available. To replace one,
 * drop a `<id>.jpg` next to the `<id>.svg` in ui/public/images/robots/ — the
 * server prefers the .jpg automatically, so no data changes are needed.
 *
 * Run: node mock-server/generate-placeholders.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'ui', 'public', 'images', 'robots');
const ROBOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'robots.json'), 'utf8'));

// Datasheet palette, matching docs/UI-CUSTOMISATION-IDEAS.md.
const INK = '#101826';
const PAPER = '#F7F8FA';
const GRID = '#E4E9F0';
const MARK = '#C3CBD8';
const SIGNAL = '#FF8A00';
const SLATE = '#5A6678';

/** Category line art, drawn on a 480x480 canvas centred around (240, 225). */
const GLYPHS = {
  'Educational kits': `
    <rect x="150" y="200" width="180" height="95" rx="10"/>
    <rect x="196" y="160" width="88" height="40" rx="6"/>
    <line x1="240" y1="160" x2="240" y2="120"/>
    <circle cx="240" cy="112" r="10" fill="${SIGNAL}" stroke="none"/>
    <circle cx="185" cy="305" r="28"/>
    <circle cx="295" cy="305" r="28"/>
    <circle cx="200" cy="245" r="9" fill="${SIGNAL}" stroke="none"/>
    <circle cx="280" cy="245" r="9" fill="${SIGNAL}" stroke="none"/>`,

  'Humanoid': `
    <circle cx="240" cy="130" r="38"/>
    <line x1="240" y1="168" x2="240" y2="190"/>
    <rect x="196" y="190" width="88" height="105" rx="10"/>
    <line x1="196" y1="215" x2="145" y2="265"/>
    <line x1="284" y1="215" x2="335" y2="265"/>
    <line x1="215" y1="295" x2="205" y2="365"/>
    <line x1="265" y1="295" x2="275" y2="365"/>
    <circle cx="196" cy="215" r="9" fill="${SIGNAL}" stroke="none"/>
    <circle cx="284" cy="215" r="9" fill="${SIGNAL}" stroke="none"/>
    <circle cx="228" cy="128" r="7" fill="${SIGNAL}" stroke="none"/>
    <circle cx="254" cy="128" r="7" fill="${SIGNAL}" stroke="none"/>`,

  'Robotic arms': `
    <path d="M160 350 L200 290 L280 290 L320 350 Z"/>
    <line x1="240" y1="290" x2="240" y2="230"/>
    <line x1="240" y1="230" x2="320" y2="165"/>
    <line x1="320" y1="165" x2="300" y2="110"/>
    <path d="M300 110 L275 96 M300 110 L322 92"/>
    <circle cx="240" cy="290" r="12" fill="${SIGNAL}" stroke="none"/>
    <circle cx="240" cy="230" r="10" fill="${SIGNAL}" stroke="none"/>
    <circle cx="320" cy="165" r="10" fill="${SIGNAL}" stroke="none"/>`,

  'Drones': `
    <rect x="200" y="205" width="80" height="60" rx="10"/>
    <line x1="200" y1="205" x2="150" y2="155"/>
    <line x1="280" y1="205" x2="330" y2="155"/>
    <line x1="200" y1="265" x2="150" y2="315"/>
    <line x1="280" y1="265" x2="330" y2="315"/>
    <circle cx="145" cy="150" r="34" stroke="${SIGNAL}"/>
    <circle cx="335" cy="150" r="34" stroke="${SIGNAL}"/>
    <circle cx="145" cy="320" r="34" stroke="${SIGNAL}"/>
    <circle cx="335" cy="320" r="34" stroke="${SIGNAL}"/>
    <circle cx="240" cy="235" r="10" fill="${SIGNAL}" stroke="none"/>`,

  'Mobile robots': `
    <rect x="140" y="215" width="200" height="90" rx="12"/>
    <circle cx="185" cy="318" r="26"/>
    <circle cx="295" cy="318" r="26"/>
    <rect x="205" y="170" width="70" height="45" rx="8" stroke="${SIGNAL}"/>
    <line x1="240" y1="170" x2="240" y2="140" stroke="${SIGNAL}"/>
    <path d="M175 260 H305" stroke-dasharray="14 12"/>
    <circle cx="240" cy="192" r="9" fill="${SIGNAL}" stroke="none"/>`,

  'Parts & sensors': `
    <rect x="135" y="165" width="210" height="150" rx="10"/>
    <rect x="195" y="215" width="90" height="60" rx="6" stroke="${SIGNAL}"/>
    <line x1="135" y1="195" x2="105" y2="195"/>
    <line x1="135" y1="240" x2="105" y2="240"/>
    <line x1="135" y1="285" x2="105" y2="285"/>
    <line x1="345" y1="195" x2="375" y2="195"/>
    <line x1="345" y1="240" x2="375" y2="240"/>
    <line x1="345" y1="285" x2="375" y2="285"/>
    <circle cx="165" cy="195" r="8" fill="${SIGNAL}" stroke="none"/>
    <circle cx="315" cy="290" r="8" fill="${SIGNAL}" stroke="none"/>`,
};

/** Short datasheet-style part code, e.g. "LEGO-EV3 · 0472". */
function partCode(robot) {
  let hash = 0;
  for (const ch of robot.id) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const serial = String(hash % 10000).padStart(4, '0');
  const stem = robot.id.split('-').slice(0, 2).join('-').toUpperCase();
  return `${stem} · ${serial}`;
}

function buildSvg(robot) {
  const glyph = GLYPHS[robot.category] || GLYPHS['Parts & sensors'];

  // Faint technical grid.
  const grid = [];
  for (let v = 40; v < 480; v += 40) {
    grid.push(`<line x1="${v}" y1="0" x2="${v}" y2="480"/>`);
    grid.push(`<line x1="0" y1="${v}" x2="480" y2="${v}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480" role="img" aria-label="${robot.name} placeholder">
  <rect width="480" height="480" fill="${PAPER}"/>
  <g stroke="${GRID}" stroke-width="1">${grid.join('')}</g>
  <g stroke="${MARK}" stroke-width="3" stroke-linecap="square">
    <path d="M20 44 V20 H44 M436 20 H460 V44 M460 436 V460 H436 M44 460 H20 V436"/>
  </g>
  <g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    ${glyph}
  </g>
  <text x="34" y="432" fill="${SLATE}" font-family="ui-monospace, 'IBM Plex Mono', 'Courier New', monospace" font-size="17" letter-spacing="1.5">${robot.category.toUpperCase()}</text>
  <text x="34" y="456" fill="${MARK}" font-family="ui-monospace, 'IBM Plex Mono', 'Courier New', monospace" font-size="14" letter-spacing="1.2">${partCode(robot)}</text>
</svg>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const robot of ROBOTS) {
  fs.writeFileSync(path.join(OUT_DIR, `${robot.id}.svg`), buildSvg(robot), 'utf8');
}

console.log(`Wrote ${ROBOTS.length} placeholder SVGs to ${OUT_DIR}`);
