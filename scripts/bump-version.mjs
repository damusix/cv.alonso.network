#!/usr/bin/env node
// Cache-busting version manager.
//
// Every local JS import carries a `?v=VERSION` query string (see CLAUDE.md). Keeping
// that string in sync across `assets/js/version.js`, `index.html`, and every import in
// `assets/js/**` by hand is error-prone — this script does it in one pass.
//
//   node scripts/bump-version.mjs             bump to today's date, next sequence (auto)
//   node scripts/bump-version.mjs 2026.07.24.3   set an explicit version
//   node scripts/bump-version.mjs --check     verify everything matches version.js; exit 1 on drift
//
// No dependencies — pure Node.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = join(ROOT, 'assets/js/version.js');
const INDEX_FILE = join(ROOT, 'index.html');
const VERSION_RE = /\d{4}\.\d{2}\.\d{2}\.\d+/;

// Every .js under assets/js, plus index.html.
function collectFiles() {
    const files = [INDEX_FILE];
    const walk = (dir) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (entry.endsWith('.js')) files.push(full);
        }
    };
    walk(join(ROOT, 'assets/js'));
    return files;
}

function currentVersion() {
    const m = readFileSync(VERSION_FILE, 'utf8').match(/VERSION\s*=\s*'([^']+)'/);
    if (!m) throw new Error(`Could not read VERSION from ${VERSION_FILE}`);
    return m[1];
}

// Auto-bump: today's date, sequence N+1 if today already stamped, else 1.
function nextVersion(current) {
    const d = new Date();
    const today = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const [y, mo, da, n] = current.split('.');
    const seq = `${y}.${mo}.${da}` === today ? Number(n) + 1 : 1;
    return `${today}.${seq}`;
}

function check(current) {
    const stale = [];
    for (const file of collectFiles()) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/\?v=(\d{4}\.\d{2}\.\d{2}\.\d+)/g)) {
            if (m[1] !== current) stale.push(`${file}: ?v=${m[1]}`);
        }
    }
    if (stale.length) {
        console.error(`Version drift — version.js is ${current} but found:`);
        for (const s of stale) console.error(`  ${s}`);
        console.error(`\nRun: node scripts/bump-version.mjs ${current}`);
        process.exit(1);
    }
    console.log(`OK — all ?v= references match ${current}`);
}

function bump(current, next) {
    if (!VERSION_RE.test(next)) throw new Error(`Invalid version "${next}" (expected YYYY.MM.DD.N)`);
    let changed = 0;
    // Normalize EVERY ?v=... query to `next` — not just the known-current string — so
    // any drifted reference (a stale pin left behind by a hand edit) self-heals on bump.
    for (const file of collectFiles()) {
        const text = readFileSync(file, 'utf8');
        const updated = text.replace(/\?v=\d{4}\.\d{2}\.\d{2}\.\d+/g, `?v=${next}`);
        if (updated !== text) { writeFileSync(file, updated); changed++; }
    }
    // version.js's own VERSION literal (not a ?v= query).
    const v = readFileSync(VERSION_FILE, 'utf8').replace(/(VERSION\s*=\s*')[^']+(')/, `$1${next}$2`);
    writeFileSync(VERSION_FILE, v);
    console.log(`Bumped ${current} -> ${next} (${changed} file(s) updated)`);
}

const arg = process.argv[2];
const current = currentVersion();

if (arg === '--check') {
    check(current);
} else {
    bump(current, arg || nextVersion(current));
}
