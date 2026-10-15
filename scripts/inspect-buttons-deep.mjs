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

const allAdmin = [...scan('app/admin'), ...scan('components/admin')];

const buttonIssues = [];
const linkIssues = [];

for (const { file, code } of allAdmin) {
  const isClient = code.includes("'use client'") || code.includes('"use client"');

  // Match all <button ...>...</button>
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = buttonRegex.exec(code)) !== null) {
    const attrs = match[1];
    const content = match[2].trim().replace(/\s+/g, ' ');
    const hasOnClick = /onClick\b/.test(attrs);
    const isSubmit = /type\s*=\s*["']submit["']/.test(attrs);
    
    if (!hasOnClick && !isSubmit) {
      buttonIssues.push({
        file,
        isClient,
        tag: `<button ${attrs.trim().slice(0, 60)}>`,
        content: content.slice(0, 40),
        reason: 'No onClick and not type="submit"'
      });
    }
  }

  // Match all <a ...> or <Link ...>
  const linkRegex = /<(a|Link)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  while ((match = linkRegex.exec(code)) !== null) {
    const tagType = match[1];
    const attrs = match[2];
    const content = match[3].trim().replace(/\s+/g, ' ');
    const hrefMatch = attrs.match(/href\s*=\s*(?:\{([^}]+)\}|["']([^"']*)["'])/);
    if (!hrefMatch) {
      linkIssues.push({ file, tag: `<${tagType}>`, content: content.slice(0, 40), reason: 'Missing href' });
    } else {
      const href = hrefMatch[2] || hrefMatch[1];
      if (href === '#' || href === '""' || href === "''") {
        linkIssues.push({ file, tag: `<${tagType} href="${href}">`, content: content.slice(0, 40), reason: 'Empty or anchor href' });
      }
    }
  }
}

console.log(`=== BUTTON ISSUES (${buttonIssues.length}) ===`);
buttonIssues.forEach(b => console.log(`[${b.file}] (isClient=${b.isClient}): ${b.tag} -> text: "${b.content}"`));

console.log(`\n=== LINK ISSUES (${linkIssues.length}) ===`);
linkIssues.forEach(l => console.log(`[${l.file}]: ${l.tag} -> text: "${l.content}"`));
