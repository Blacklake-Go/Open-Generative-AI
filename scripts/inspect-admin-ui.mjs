import fs from 'node:fs';
import path from 'node:path';

function scan(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') scan(full, results);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      const code = fs.readFileSync(full, 'utf8');
      results.push({ file: full, code });
    }
  }
  return results;
}

const adminPages = scan('app/admin');
const adminComponents = scan('components/admin');
const allAdmin = [...adminPages, ...adminComponents];

console.log(`Found ${adminPages.length} admin page files, ${adminComponents.length} admin component files.`);

const deadLinks = [];
const overlays = [];
const pointerEventsNone = [];
const buttonsWithoutActions = [];

for (const { file, code } of allAdmin) {
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('pointer-events-none')) {
      pointerEventsNone.push({ file, lineNum, text: line.trim() });
    }
    if (line.includes('fixed inset-0') || line.includes('absolute inset-0')) {
      overlays.push({ file, lineNum, text: line.trim() });
    }
    if (/href\s*=\s*["'](#|javascript:void\(0\)|javascript:;|)['"]/.test(line)) {
      deadLinks.push({ file, lineNum, text: line.trim() });
    }
  });

  // Check buttons in server components or without handlers
  const isClient = code.includes("'use client'") || code.includes('"use client"');
  const buttonMatches = [...code.matchAll(/<button\b([^>]*)>/g)];
  for (const match of buttonMatches) {
    const attrs = match[1];
    const hasOnClick = /onClick\b/.test(attrs);
    const hasTypeSubmit = /type\s*=\s*["']submit["']/.test(attrs);
    const isFormChild = false; // approximate
    if (!hasOnClick && !hasTypeSubmit && !isClient) {
      buttonsWithoutActions.push({ file, tag: match[0].slice(0, 100) });
    }
  }
}

console.log('\n--- DEAD LINKS (href="#") ---');
deadLinks.forEach(d => console.log(`${d.file}:${d.lineNum} -> ${d.text}`));

console.log('\n--- OVERLAYS ---');
overlays.forEach(o => console.log(`${o.file}:${o.lineNum} -> ${o.text}`));

console.log('\n--- POINTER EVENTS NONE ---');
pointerEventsNone.forEach(p => console.log(`${p.file}:${p.lineNum} -> ${p.text}`));

console.log('\n--- BUTTONS IN SERVER COMPONENTS WITHOUT ONCLICK/SUBMIT ---');
buttonsWithoutActions.forEach(b => console.log(`${b.file} -> ${b.tag}`));
