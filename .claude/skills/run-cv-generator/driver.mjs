#!/usr/bin/env node
/**
 * CV Generator driver — launches the static site and drives it with Playwright.
 *
 * Usage (from the repo root):
 *   node .claude/skills/run-cv-generator/driver.mjs smoke
 *   node .claude/skills/run-cv-generator/driver.mjs shot [name]
 *   node .claude/skills/run-cv-generator/driver.mjs print [name]  # PDF + one PNG per sheet
 *   node .claude/skills/run-cv-generator/driver.mjs repl          # stdin command loop
 *
 * Flags: --headed  --port <n>  --url <origin>  --keep-storage  --no-cdn-cache
 *        print only: --cv <file>  --css <file>  --paper Letter|A4
 *
 * Why a driver and not "npm start": `pnpm start` opens a real browser window and
 * blocks. The app also hard-blocks on Monaco resolving from jsdelivr — if that
 * request stalls, nothing renders and every window.* global stays undefined. The
 * driver caches CDN responses on disk and retries the load, which turns a flaky
 * ~1-in-4 blank page into a deterministic one.
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const SHOTS = path.join(REPO, 'tmp/run-shots');
const CDN_CACHE = path.join(REPO, 'tmp/cv-cdn-cache');

const argv = process.argv.slice(2);
const cmd = argv[0] || 'smoke';
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? dflt : argv[i + 1];
};

const HEADED = flag('headed');
const USE_CACHE = !flag('no-cdn-cache');
const KEEP_STORAGE = flag('keep-storage');

// Analytics never resolves in a fresh profile and only adds noise + latency.
const BLOCKED = /googletagmanager|google-analytics|analytics\.google|doubleclick/;

// ---------------------------------------------------------------- static server

const freePort = () => new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => res(port));
    });
});

async function startServer() {
    const bin = path.join(REPO, 'node_modules/.bin/http-server');
    if (!fs.existsSync(bin)) throw new Error('http-server missing — run `pnpm install` first');
    const port = Number(opt('port', 0)) || await freePort();
    const proc = spawn(bin, ['.', '-c-1', '-p', String(port), '--silent'], {
        cwd: REPO, stdio: 'ignore', detached: false,
    });
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 60; i++) {
        try {
            const r = await fetch(`${origin}/index.html`);
            if (r.ok) return { origin, proc };
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    proc.kill();
    throw new Error(`http-server never answered on ${origin}`);
}

// ---------------------------------------------------------------- cdn disk cache

function installRouting(page) {
    if (USE_CACHE) fs.mkdirSync(CDN_CACHE, { recursive: true });
    return page.route('**/*', async (route) => {
        const req = route.request();
        const url = req.url();

        if (BLOCKED.test(url)) return route.abort();
        if (!USE_CACHE || req.method() !== 'GET' || url.startsWith('http://127.0.0.1')) return route.continue();

        const key = createHash('sha1').update(url).digest('hex');
        const body = path.join(CDN_CACHE, `${key}.body`);
        const meta = path.join(CDN_CACHE, `${key}.json`);

        if (fs.existsSync(body) && fs.existsSync(meta)) {
            const { contentType } = JSON.parse(fs.readFileSync(meta, 'utf8'));
            return route.fulfill({ status: 200, contentType, body: fs.readFileSync(body) });
        }

        let res;
        try {
            res = await route.fetch({ timeout: 30_000 });
        } catch {
            return route.abort();
        }
        const buf = Buffer.from(await res.body());
        if (res.status() === 200) {
            fs.writeFileSync(body, buf);
            fs.writeFileSync(meta, JSON.stringify({ url, contentType: res.headers()['content-type'] || '' }));
        }
        return route.fulfill({ response: res, body: buf });
    });
}

// ---------------------------------------------------------------- app helpers

const READY = () =>
    typeof window.applyChanges === 'function' &&
    typeof window.monaco !== 'undefined' &&
    window.monaco.editor.getEditors().length > 0 &&
    !!document.getElementById('name')?.textContent;

async function newPage(browser, origin) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());          // resetData() uses confirm()
    await installRouting(page);
    await page.addInitScript(() => {
        // First visit pops the help modal over everything; suppress it.
        localStorage.setItem('cv-first-visit', 'true');
    });
    page.__origin = origin;
    return page;
}

/** Load the app and wait until Monaco + the CV render are both up. Retries the
 *  jsdelivr stall described at the top of this file. */
async function open(page, urlPath = '/index.html', { attempts = 3, timeout = 45_000 } = {}) {
    let last;
    for (let i = 1; i <= attempts; i++) {
        await page.goto(page.__origin + urlPath, { waitUntil: 'domcontentloaded' });
        // Clear once per session only — later open() calls are reload checks and must
        // see the CV/styles the earlier steps persisted.
        if (!KEEP_STORAGE && !page.__storageCleared) {
            page.__storageCleared = true;
            await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cv-first-visit', 'true'); });
            await page.reload({ waitUntil: 'domcontentloaded' });
        }
        try {
            await page.waitForFunction(READY, null, { timeout });
            return;
        } catch (e) {
            last = e;
            console.error(`[driver] app did not become ready (attempt ${i}/${attempts}) — reloading`);
        }
    }
    throw new Error(`app never became ready: ${last?.message}`);
}

const setEditorValue = (page, code) =>
    page.evaluate((c) => { window.monaco.editor.getEditors()[0].setValue(c); }, code);

const getEditorValue = (page) =>
    page.evaluate(() => window.monaco.editor.getEditors()[0].getValue());

/** Toast text is the only channel applyChanges() uses to report a failure —
 *  it catches everything and emits editor:save:error. */
const toasts = (page) =>
    page.evaluate(() => [...document.querySelectorAll('.toasts aside')].map((t) => t.innerText.trim()));

const clearToasts = (page) =>
    page.evaluate(() => { document.querySelector('.toasts').innerHTML = ''; });

async function apply(page) {
    await clearToasts(page);
    await page.evaluate(() => window.applyChanges());
    await page.waitForTimeout(300);
    return toasts(page);
}

async function shot(page, name) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: file });
    return file;
}

// ---------------------------------------------------------------- cvml

/** Same two regexes exports.js:65-66 uses, so a file that imports in the app
 *  parses here identically. */
function parseCvml(text) {
    const data = text.match(/\[cv-data js\]\n([\s\S]*?)(?=\n\[|$)/);
    const styles = text.match(/\[cv-styles\]\n([\s\S]*?)$/);
    if (!data) throw new Error('no [cv-data js] block found');
    return { code: data[1].trim(), styles: styles ? styles[1].trim() : null };
}

/** Load a real .cvml through the editor rather than through importCV() — the
 *  file picker can't be driven, and this exercises the same eval + Zod path. */
async function loadCvml(page, file, { baseStyles = false } = {}) {
    const { code, styles } = parseCvml(fs.readFileSync(path.resolve(REPO, file), 'utf8'));

    await setEditorValue(page, code);
    const t = await apply(page);
    if (t.some((x) => /Validation failed/i.test(x))) throw new Error(`CV rejected: ${t.join(' | ')}`);

    if (styles && !baseStyles) {
        await page.evaluate(() => window.setEditorMode('css'));
        await page.waitForFunction(() => window.monaco.editor.getEditors()[0].getModel().getLanguageId() === 'css');
        await setEditorValue(page, styles);
        await apply(page);
        await page.evaluate(() => window.setEditorMode('javascript'));
        await page.waitForTimeout(300);
    } else if (baseStyles) {
        await useBaseStyles(page);
    }
    return { hasStyles: !!styles, appliedStyles: !!styles && !baseStyles };
}

// ---------------------------------------------------------------- print capture

/** Drop any custom CSS so the CV renders under base.css + cv.css + print.css only.
 *  styles.js re-injects the concatenated defaults when the key is absent. */
async function useBaseStyles(page) {
    await page.evaluate(() => localStorage.removeItem('cv-custom-styles'));
    await open(page);
}

const hasRasterizer = () => {
    try {
        return spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' }).status !== null;
    } catch { return false; }
};

/**
 * Capture what ⌘P actually produces: a paginated PDF plus one PNG per sheet.
 * The PNGs are the point — a PDF tells you nothing until something rasterizes it,
 * and page breaks are exactly what print.css gets wrong.
 */
async function capturePrint(page, name, { paper = 'Letter' } = {}) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pdf = path.join(SHOTS, `${name}.pdf`);

    // print.css hides the editor, divider, FAB and footer but NOT `.toasts`, so a
    // lingering "CV saved!" bubble prints on top of the CV. Drop them so captures
    // are deterministic — see the note in SKILL.md.
    await clearToasts(page);
    await page.evaluate(() => document.fonts.ready);

    await page.emulateMedia({ media: 'print' });
    // No `margin` here on purpose — print.css sets `@page { margin: 0.75in }` and
    // passing margins would silently override it, so the capture would not match ⌘P.
    await page.pdf({ path: pdf, format: paper, printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: null });

    const out = { pdf, pages: [] };

    if (!hasRasterizer()) {
        // Fallback: paper-width screenshot under print media. Shows the print
        // stylesheet but not the pagination.
        const before = page.viewportSize();
        await page.emulateMedia({ media: 'print' });
        await page.setViewportSize({ width: paper === 'A4' ? 794 : 816, height: 1056 });
        const png = path.join(SHOTS, `${name}-continuous.png`);
        await page.screenshot({ path: png, fullPage: true });
        await page.emulateMedia({ media: null });
        await page.setViewportSize(before);
        out.pages = [png];
        out.note = 'pdftoppm not found — captured a continuous paper-width shot instead of per-page images';
        return out;
    }

    // Wipe earlier sheets first — a shorter CV would otherwise leave orphaned
    // page-3.png files behind and the glob below would report them as current.
    for (const f of fs.readdirSync(SHOTS)) {
        if (f.startsWith(`${name}-page`) && f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
    }

    const prefix = path.join(SHOTS, `${name}-page`);
    const r = spawnSync('pdftoppm', ['-png', '-r', '96', pdf, prefix], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`pdftoppm failed: ${r.stderr || r.status}`);
    out.pages = fs.readdirSync(SHOTS)
        .filter((f) => f.startsWith(`${name}-page`) && f.endsWith('.png'))
        .sort()
        .map((f) => path.join(SHOTS, f));
    return out;
}

// ---------------------------------------------------------------- fixtures

const SAMPLE_CV = `return {
    personal: {
        name: 'Ada Lovelace',
        title: 'Analytical Engine Programmer',
        email: 'ada@analytical.engine',
        phone: '+44 20 7946 0000',
        location: 'London, UK',
        links: [{ name: 'Notes', url: 'https://example.com/notes', icon: 'fas fa-globe' }]
    },
    summary: 'First **computer programmer**. Wrote the algorithm for Bernoulli numbers.',
    sections: [{
        id: 'driver-check',
        heading: 'Driver Check',
        items: [{
            title: 'Analytical Engine',
            subtitle: 'Note G',
            period: { start: '1842', end: '1843' },
            location: 'London',
            content: ['Wrote the *first* published algorithm'],
            tags: ['Algorithms', 'Mathematics']
        }]
    }]
};`;

const SAMPLE_CSS = `.cv-container header h1 { color: rgb(255, 0, 85); }`;

const INVALID_CV = `return { personal: { name: 'No Email' }, sections: [] };`;

// ---------------------------------------------------------------- smoke

async function smoke() {
    const results = [];
    const check = (name, pass, detail = '') => {
        results.push({ name, pass, detail });
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    };

    const { origin, proc } = await startServer();
    console.log(`[driver] serving ${REPO} at ${origin}`);
    const browser = await chromium.launch({ headless: !HEADED });
    const page = await newPage(browser, origin);

    try {
        await open(page);
        const name0 = await page.textContent('#name');
        check('default CV renders', name0 === 'Jane Anderson', `#name=${JSON.stringify(name0)}`);

        const sectionIds = await page.$$eval('#sections > section', (els) => els.map((e) => e.id));
        check('default sections render', sectionIds.length >= 3, sectionIds.join(','));
        console.log(`      ${await shot(page, '01-initial')}`);

        // --- apply a new CV through the JS editor
        await setEditorValue(page, SAMPLE_CV);
        let t = await apply(page);
        const name1 = await page.textContent('#name');
        const hasSection = await page.$('#driver-check') !== null;
        check('JS edit + apply re-renders CV', name1 === 'Ada Lovelace' && hasSection, `#name=${JSON.stringify(name1)} toasts=${JSON.stringify(t)}`);

        const md = await page.$eval('.summary', (e) => e.innerHTML);
        check('markdown parsed in summary', md.includes('<strong>computer programmer</strong>'));

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cv-data-result') || 'null'));
        check('result persisted to localStorage', stored?.personal?.name === 'Ada Lovelace');
        console.log(`      ${await shot(page, '02-custom-cv')}`);

        // --- invalid data surfaces a toast and leaves the CV alone
        await setEditorValue(page, INVALID_CV);
        t = await apply(page);
        const stillAda = (await page.textContent('#name')) === 'Ada Lovelace';
        check('invalid CV rejected with toast', t.some((x) => /Validation failed|email/i.test(x)) && stillAda, JSON.stringify(t));

        await setEditorValue(page, SAMPLE_CV);
        await apply(page);

        // --- print capture on base styles. Runs here, before any custom CSS exists,
        //     so what lands in tmp/run-shots is genuinely base.css + cv.css + print.css.
        const chromeInPrint = await page.evaluate(async () => {
            await document.fonts.ready;
            const q = (s) => getComputedStyle(document.querySelector(s)).display;
            return { editor: q('.editor-pane'), divider: q('.divider'), fab: q('.action-menu-container'), footer: q('.cv-container footer') };
        });
        await page.emulateMedia({ media: 'print' });
        const chromeHidden = await page.evaluate(() => {
            const q = (s) => getComputedStyle(document.querySelector(s)).display;
            return { editor: q('.editor-pane'), divider: q('.divider'), fab: q('.action-menu-container'), footer: q('.cv-container footer') };
        });
        await page.emulateMedia({ media: null });
        check('print media hides editor chrome', Object.values(chromeHidden).every((d) => d === 'none') && chromeInPrint.editor !== 'none', `screen=${JSON.stringify(chromeInPrint)} print=${JSON.stringify(chromeHidden)}`);

        const printed = await capturePrint(page, '03-print-base');
        check('print capture paginates on base styles', printed.pages.length >= 1, `${printed.pages.length} page(s)`);
        console.log(`      ${printed.pdf}`);
        for (const p of printed.pages) console.log(`      ${p}`);

        // --- styles tab
        await page.evaluate(() => window.setEditorMode('css'));
        await page.waitForFunction(() => window.monaco.editor.getEditors()[0].getModel().getLanguageId() === 'css');
        await setEditorValue(page, SAMPLE_CSS);
        t = await apply(page);
        const h1Color = await page.$eval('.cv-container header h1', (e) => getComputedStyle(e).color);
        check('CSS edit + apply restyles CV', h1Color === 'rgb(255, 0, 85)', `color=${h1Color} toasts=${JSON.stringify(t)}`);
        console.log(`      ${await shot(page, '04-styled')}`);

        // --- AI tab (no API key configured -> settings screen)
        await page.evaluate(() => window.setEditorMode('ai'));
        await page.waitForSelector('#aiContainer .ai-settings', { timeout: 30_000 });
        check('AI tab loads settings screen', true);
        console.log(`      ${await shot(page, '05-ai-tab')}`);
        await page.evaluate(() => window.setEditorMode('javascript'));

        // --- help modal
        await page.evaluate(() => window.showHelpModal());
        await page.waitForFunction(() => document.getElementById('helpModal')?.open === true);
        const helpLen = (await page.$eval('#modalContent', (e) => e.innerText)).length;
        check('help modal renders README content', helpLen > 500, `${helpLen} chars`);
        console.log(`      ${await shot(page, '06-help-modal')}`);
        await page.evaluate(() => window.closeModal());

        // --- CVML export
        const dl = await Promise.all([
            page.waitForEvent('download', { timeout: 15_000 }),
            page.evaluate(() => window.exportCV()),
        ]).then(([d]) => d);
        const out = path.join(SHOTS, dl.suggestedFilename());
        await dl.saveAs(out);
        const cvml = fs.readFileSync(out, 'utf8');
        check('CVML export downloads', cvml.includes('[cv-data js]') && cvml.includes('Ada Lovelace'), out);

        // --- print capture again, this time with the custom CSS applied, so a
        //     reviewer can diff styled vs base pagination side by side.
        const printedStyled = await capturePrint(page, '07-print-styled');
        check('print capture with custom CSS', printedStyled.pages.length >= 1, `${printedStyled.pages.length} page(s)`);
        for (const p of printedStyled.pages) console.log(`      ${p}`);

        // --- fullscreen toggle
        // toggleFullscreen() throws after mutating the DOM: editor.js:414 listens with
        // ({ data }) but LogosDX delivers the payload directly to exact-name listeners.
        // Swallow the throw and assert on the class it already set.
        const fsToggle = () => page.evaluate(() => { try { window.toggleFullscreen(); } catch (e) { return String(e.message); } });
        const fsErr = await fsToggle();
        const fs1 = await page.$eval('.split-view-container', (e) => e.className);
        await fsToggle();
        check('fullscreen toggle sets class', fs1.includes('fullscreen'), fs1);
        check('known bug: toggleFullscreen throws on editor:fullscreen listener', !!fsErr, fsErr || 'no longer throws — update SKILL.md gotcha');

        // --- persistence across reload
        await open(page, '/index.html', { attempts: 3 });
        const name2 = await page.textContent('#name');
        const color2 = await page.$eval('.cv-container header h1', (e) => getComputedStyle(e).color);
        check('CV + styles survive reload', name2 === 'Ada Lovelace' && color2 === 'rgb(255, 0, 85)', `${name2} / ${color2}`);
        console.log(`      ${await shot(page, '08-after-reload')}`);
    } finally {
        await browser.close();
        proc.kill();
    }

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log(`screenshots: ${SHOTS}`);
    process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------- repl

const HELP = `commands:
  open [path]           load the app, wait until Monaco + CV are ready
  ss <name>             screenshot -> tmp/run-shots/<name>.png
  tab js|css|ai         switch editor tab (setEditorMode)
  set <file>            load a file into the editor
  get                   print current editor contents
  apply                 applyChanges() + print any toasts
  cv <file>             set + apply in one step
  cvml <file>           load a real .cvml export (data + its [cv-styles])
  eval <js>             page.evaluate(() => <js>), prints JSON
  text <selector>       textContent of the first match
  html <selector>       innerHTML of the first match
  click <selector>
  toasts                list visible toasts
  reset                 resetData() (confirm auto-accepted)
  reload                reload + wait ready
  size <w> <h>          set viewport
  basestyles            drop custom CSS, reload on base.css + cv.css + print.css
  print <name> [paper]  paginated PDF + one PNG per sheet (Letter | A4)
  quit`;

async function repl() {
    const { origin, proc } = await startServer();
    const browser = await chromium.launch({ headless: !HEADED });
    const page = await newPage(browser, origin);
    console.log(`[driver] serving ${origin} — type 'help' for commands`);
    await open(page);
    console.log('ready');

    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
        const raw = line.trim();
        if (!raw) continue;
        const sp = raw.indexOf(' ');
        const verb = sp === -1 ? raw : raw.slice(0, sp);
        const rest = sp === -1 ? '' : raw.slice(sp + 1).trim();
        try {
            switch (verb) {
                case 'help': console.log(HELP); break;
                case 'open': await open(page, rest || '/index.html'); console.log('ready'); break;
                case 'reload': await open(page, '/index.html', { attempts: 3 }); console.log('ready'); break;
                case 'ss': console.log(await shot(page, rest || 'shot')); break;
                case 'tab': {
                    const mode = { js: 'javascript', javascript: 'javascript', css: 'css', ai: 'ai' }[rest];
                    if (!mode) { console.log('ERR: tab js|css|ai'); break; }
                    await page.evaluate((m) => window.setEditorMode(m), mode);
                    await page.waitForTimeout(500);
                    console.log(`mode=${mode}`);
                    break;
                }
                case 'set': await setEditorValue(page, fs.readFileSync(path.resolve(REPO, rest), 'utf8')); console.log('ok'); break;
                case 'get': console.log(await getEditorValue(page)); break;
                case 'apply': console.log(JSON.stringify(await apply(page))); break;
                case 'cv':
                    await setEditorValue(page, fs.readFileSync(path.resolve(REPO, rest), 'utf8'));
                    console.log(JSON.stringify(await apply(page)));
                    break;
                case 'eval': console.log(JSON.stringify(await page.evaluate(`(async () => (${rest}))()`), null, 2)); break;
                case 'text': console.log(await page.textContent(rest)); break;
                case 'html': console.log(await page.innerHTML(rest)); break;
                case 'click': await page.click(rest); console.log('ok'); break;
                case 'toasts': console.log(JSON.stringify(await toasts(page))); break;
                case 'reset': await page.evaluate(() => window.resetData()); await page.waitForTimeout(500); console.log('ok'); break;
                case 'size': {
                    const [w, h] = rest.split(/\s+/).map(Number);
                    await page.setViewportSize({ width: w, height: h });
                    console.log(`${w}x${h}`);
                    break;
                }
                case 'cvml': {
                    const r = await loadCvml(page, rest);
                    console.log(`loaded ${path.basename(rest)}  styles=${r.appliedStyles ? 'from file' : 'base'}`);
                    break;
                }
                case 'basestyles': await useBaseStyles(page); console.log('ok'); break;
                case 'print': {
                    const [n, paper] = rest.split(/\s+/);
                    const r = await capturePrint(page, n || 'print', { paper: paper || 'Letter' });
                    console.log(r.pdf);
                    for (const p of r.pages) console.log(p);
                    if (r.note) console.log(`note: ${r.note}`);
                    break;
                }
                case 'quit': case 'exit': rl.close(); break;
                default: console.log(`ERR: unknown command '${verb}' (try 'help')`);
            }
        } catch (e) {
            console.log(`ERR: ${e.message.split('\n')[0]}`);
        }
    }
    await browser.close();
    proc.kill();
    process.exit(0);
}

// ---------------------------------------------------------------- one-shot shot

async function oneShot() {
    const { origin, proc } = await startServer();
    const browser = await chromium.launch({ headless: !HEADED });
    const page = await newPage(browser, origin);
    await open(page);
    console.log(await shot(page, argv[1] && !argv[1].startsWith('--') ? argv[1] : 'app'));
    await browser.close();
    proc.kill();
}

// ---------------------------------------------------------------- one-shot print

async function oneShotPrint() {
    const name = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'print';
    const paper = opt('paper', 'Letter');

    const { origin, proc } = await startServer();
    const browser = await chromium.launch({ headless: !HEADED });
    const page = await newPage(browser, origin);
    try {
        const styleLabel = await loadContent(page);
        const r = await capturePrint(page, name, { paper });
        console.log(`paper: ${paper}  styles: ${styleLabel}`);
        console.log(`pdf:   ${r.pdf}`);
        console.log(`pages: ${r.pages.length}`);
        for (const p of r.pages) console.log(`       ${p}`);
        if (r.note) console.log(`note:  ${r.note}`);
    } finally {
        await browser.close();
        proc.kill();
    }
}

/** Shared --cvml / --cv / --css / --base-styles handling. Returns a label
 *  describing which stylesheet ended up applied. */
async function loadContent(page) {
    const cvFile = opt('cv', null);
    const cvmlFile = opt('cvml', null);
    const cssFile = opt('css', null);
    const forceBase = flag('base-styles');

    let styleLabel = 'base (base.css + cv.css + print.css)';
    {
        await open(page);
        if (cvmlFile) {
            const r = await loadCvml(page, cvmlFile, { baseStyles: forceBase });
            styleLabel = r.appliedStyles
                ? `from ${path.basename(cvmlFile)} [cv-styles]`
                : r.hasStyles ? 'base (file has [cv-styles], overridden by --base-styles)' : styleLabel;
        }
        if (cvFile) {
            await setEditorValue(page, fs.readFileSync(path.resolve(REPO, cvFile), 'utf8'));
            const t = await apply(page);
            if (t.some((x) => /Validation failed/i.test(x))) throw new Error(`CV rejected: ${t.join(' | ')}`);
        }
        if (cssFile) {
            await page.evaluate(() => window.setEditorMode('css'));
            await page.waitForTimeout(300);
            await setEditorValue(page, fs.readFileSync(path.resolve(REPO, cssFile), 'utf8'));
            await apply(page);
            await page.evaluate(() => window.setEditorMode('javascript'));
            styleLabel = cssFile;
        } else if (!cvmlFile) {
            // loadCvml() already settled the stylesheet; don't undo it here.
            await useBaseStyles(page);
        }
    }
    return styleLabel;
}

// ---------------------------------------------------------------- type sizes

/** What size does the type actually resolve to on screen vs on paper? Read off
 *  the live DOM rather than the CSS, since everything is rem-derived and the
 *  print block retunes the root. */
const SIZE_PROBE = () => {
    const px = (s) => { const el = document.querySelector(s); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
    return {
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        'body line-height': parseFloat(getComputedStyle(document.body).lineHeight),
        'h1 (name)': px('.cv-container header h1'),
        title: px('.cv-container header .info .title'),
        contact: px('.cv-container header .contact'),
        links: px('.cv-container header .links a'),
        summary: px('.summary'),
        'section h2': px('main section h2'),
        'item h3': px('main section .item .header h3'),
        period: px('main section .item .header .period'),
        meta: px('main section .item .meta'),
        bullet: px('main section .item .content li'),
        tag: px('main section .item .tags .tag'),
    };
};

async function typeSizes() {
    const { origin, proc } = await startServer();
    const browser = await chromium.launch({ headless: !HEADED });
    const page = await newPage(browser, origin);
    try {
        const styleLabel = await loadContent(page);

        const screen = await page.evaluate(SIZE_PROBE);
        await page.emulateMedia({ media: 'print' });
        const print = await page.evaluate(SIZE_PROBE);
        await page.emulateMedia({ media: null });

        const pt = (v) => (v == null ? '—' : `${(v * 0.75).toFixed(1)}pt`);
        const cell = (v, lh) => (v == null ? '—' : lh ? `${v}px` : `${v}px / ${pt(v)}`);

        console.log(`styles: ${styleLabel}`);
        console.log(`name:   ${await page.textContent('#name')}\n`);
        console.log('element'.padEnd(18) + 'screen'.padEnd(20) + 'print');
        for (const k of Object.keys(screen)) {
            const lh = k.includes('line-height');
            console.log(k.padEnd(18) + cell(screen[k], lh).padEnd(20) + cell(print[k], lh));
        }
    } finally {
        await browser.close();
        proc.kill();
    }
}

// ----------------------------------------------------------------

const URL_OVERRIDE = opt('url', null);
if (URL_OVERRIDE) {
    // Drive an already-running server instead of spawning one.
    const origin = URL_OVERRIDE.replace(/\/$/, '');
    // eslint-disable-next-line no-func-assign
    startServer = async () => ({ origin, proc: { kill() {} } });
}

if (cmd === 'smoke') await smoke();
else if (cmd === 'repl') await repl();
else if (cmd === 'shot') await oneShot();
else if (cmd === 'print') await oneShotPrint();
else if (cmd === 'sizes') await typeSizes();
else { console.error(`unknown command '${cmd}' — expected smoke | repl | shot | print | sizes`); process.exit(2); }
