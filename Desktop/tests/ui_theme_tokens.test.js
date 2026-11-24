const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('   SyncBoard Milestone 6: UI Theme & Token Tests   ');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

// 1. Verify index.css has all required design tokens
console.log('--- 1. Testing Design Tokens in index.css ---');
const indexCssPath = path.join(__dirname, '../src/renderer/src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

const requiredTokens = [
  '--color-bg-app',
  '--color-bg-sidebar',
  '--color-surface',
  '--color-surface-inset',
  '--color-border',
  '--color-divider',
  '--color-control',
  '--color-control-border',
  '--color-control-hover',
  '--color-control-track',
  '--color-control-selected',
  '--color-chip-border',
  '--color-tile',
  '--color-nav-hover',
  '--color-nav-active',
  '--color-text',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-icon-muted',
  '--color-accent',
  '--color-accent-hover',
  '--color-on-accent',
  '--color-accent-tint-bg',
  '--color-accent-tint-text',
  '--color-accent-selected-bg',
  '--color-neutral-fill-bg',
  '--color-neutral-fill-text',
  '--color-badge-bg',
  '--color-badge-border',
  '--color-date-chip-bg',
  '--color-date-chip-text',
  '--color-danger-bg',
  '--color-danger-border',
  '--color-danger-text',
  '--color-toggle-on-knob',
  '--color-toggle-off-border',
  '--color-toggle-off-knob',
  '--color-chat-bg',
];

const rootBlock = indexCss.match(/:root\s*\{([^}]+)\}/s)?.[1] || '';
const darkBlock = indexCss.match(/\.dark\s*\{([^}]+)\}/s)?.[1] || '';

let allTokensInRoot = true;
let allTokensInDark = true;
for (const token of requiredTokens) {
  if (!rootBlock.includes(token)) allTokensInRoot = false;
  if (!darkBlock.includes(token)) allTokensInDark = false;
}

assert(allTokensInRoot, 'All 37 required color tokens defined in :root (Light Theme)');
assert(allTokensInDark, 'All 37 required color tokens defined in .dark (Dark Theme)');
assert(indexCss.includes('prefers-reduced-motion'), 'Transitions disabled on prefers-reduced-motion');

// 2. Verify tailwind.config.js maps tokens correctly
console.log('\n--- 2. Testing Tailwind Configuration ---');
const tailwindConfig = fs.readFileSync(path.join(__dirname, '../tailwind.config.js'), 'utf8');
assert(tailwindConfig.includes("darkMode: 'class'"), 'Tailwind configured with darkMode: class');
assert(tailwindConfig.includes('rgb(var(--color-bg-app) / <alpha-value>)'), 'Tailwind maps tokens using rgb(var(...) / <alpha-value>)');

// 3. Verify App.tsx dynamic aria-current and active menu highlight
console.log('\n--- 3. Testing Sidebar Dynamic aria-current="page" ---');
const appTsx = fs.readFileSync(path.join(__dirname, '../src/renderer/src/App.tsx'), 'utf8');
assert(appTsx.includes("isActive ? 'page' : undefined") && appTsx.includes("isActive = activeTab === item.id"), 'App.tsx binds aria-current="page" to activeTab');
assert(appTsx.includes('bg-nav-active') && appTsx.includes('hover:bg-nav-hover'), 'App.tsx highlights only active item with nav-active and others with nav-hover');

// 4. Verify no old hardcoded color classes remain in src/renderer/src
console.log('\n--- 4. Testing Zero Lingering Old Color Classes ---');
function scanDir(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...scanDir(full));
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sourceFiles = scanDir(path.join(__dirname, '../src/renderer/src'));
const oldColorPatterns = [/\bslate-[1-9]00\b/, /\bteal-[1-9]00\b/, /\bcyan-[1-9]00\b/, /\brose-[1-9]00\b/];

let lingeringFound = 0;
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pat of oldColorPatterns) {
    if (pat.test(content)) {
      console.error(`Found lingering old color in ${file}: ${pat}`);
      lingeringFound++;
    }
  }
}
assert(lingeringFound === 0, 'Zero lingering hardcoded slate/teal/cyan/rose Tailwind classes in source code');

console.log('\n====================================================');
console.log(`M6 Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) process.exit(1);
