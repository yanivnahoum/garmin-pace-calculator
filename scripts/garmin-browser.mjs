import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ACTIVITY_URL = 'https://connect.garmin.com/app/activity/24144016703';
const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'dist');
const PROFILE_DIR = path.join(ROOT_DIR, '.playwright', 'garmin-native-profile');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'test-results', 'live');
const FIXTURE_PATH = path.join(ROOT_DIR, 'tests', 'fixtures', 'intervals-table.html');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUGGING_PORT = 9222;
const CDP_ENDPOINT = `http://127.0.0.1:${DEBUGGING_PORT}`;

function launchChrome({ debugging = false, setup = false } = {}) {
    const args = [`--user-data-dir=${PROFILE_DIR}`, '--no-first-run', ACTIVITY_URL];
    if (debugging) args.unshift(`--remote-debugging-port=${DEBUGGING_PORT}`);
    if (setup) args.unshift('chrome://extensions');

    const chrome = spawn(CHROME_PATH, args, { detached: true, stdio: 'ignore' });
    chrome.unref();
}

async function waitForCdp() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const response = await fetch(`${CDP_ENDPOINT}/json/version`);
            if (response.ok) return;
        } catch {
            // Chrome is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Chrome did not expose remote debugging at ${CDP_ENDPOINT}. Close the dedicated Garmin Chrome and retry.`);
}

async function connectToChrome() {
    try {
        return await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 5_000, noDefaults: true });
    } catch {
        throw new Error('Diagnostic Chrome is not running. Run npm run garmin:setup and leave that window open.');
    }
}

async function reloadExtension(context) {
    const page = await context.newPage();
    try {
        await page.goto('chrome://extensions');
        await page.waitForTimeout(500);
        const reloaded = await page.evaluate(() => {
            const manager = document.querySelector('extensions-manager');
            const list = manager?.shadowRoot?.querySelector('extensions-item-list');
            const item = [...(list?.shadowRoot?.querySelectorAll('extensions-item') ?? [])].find((candidate) =>
                candidate.shadowRoot?.querySelector('#name')?.textContent?.includes('Garmin Connect Pace Calculator'),
            );
            const reloadButton = item?.shadowRoot?.querySelector('#dev-reload-button');
            if (!(reloadButton instanceof HTMLElement)) return false;
            reloadButton.click();
            return true;
        });
        if (!reloaded) throw new Error('Garmin Connect Pace Calculator is not loaded unpacked in the diagnostic Chrome profile.');
    } finally {
        await page.close();
    }
}

async function openActivity(context) {
    const activityPages = context.pages().filter((candidate) => candidate.url() === ACTIVITY_URL);
    const page = activityPages.at(-1) ?? (await context.newPage());
    await Promise.all(activityPages.filter((candidate) => candidate !== page).map((candidate) => candidate.close()));

    if (page.url() !== ACTIVITY_URL) {
        await page.goto(ACTIVITY_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    if (!(await page.locator('html[data-garmin-pace-calculator="loaded"]').count())) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    return page;
}

async function authenticate() {
    launchChrome();
    console.log('Chrome opened without automation. Sign in to Garmin, confirm the activity loads, then close Chrome.');
}

async function setup() {
    launchChrome({ debugging: true, setup: true });
    await waitForCdp();
    console.log(`Chrome opened with the authenticated profile. In chrome://extensions, enable Developer mode and load unpacked: ${EXTENSION_DIR}`);
    console.log('Leave this Chrome window open, then run npm run garmin:diagnose.');
}

async function openIntervalsTab(page) {
    await page.getByText(/^Intervals$/i, { exact: true }).first().waitFor({ state: 'visible', timeout: 45_000 });

    const candidates = [
        page.getByRole('tab', { name: /^Intervals$/i }),
        page.getByRole('button', { name: /^Intervals$/i }),
        page.getByText(/^Intervals$/i, { exact: true }),
    ];

    for (const candidate of candidates) {
        const visibleCandidate = candidate.first();
        if (await visibleCandidate.isVisible().catch(() => false)) {
            await visibleCandidate.evaluate((element) => element.click());
            return;
        }
    }

    throw new Error('Could not find the Intervals tab below the activity charts.');
}

async function validateFixture() {
    const browser = await connectToChrome();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome did not expose its default browser context.');
    const fixture = await readFile(FIXTURE_PATH, 'utf8');
    await reloadExtension(context);

    const page = await context.newPage();
    try {
        await page.route(`${ACTIVITY_URL}?fixture=intervals`, (route) =>
            route.fulfill({ status: 200, contentType: 'text/html', body: fixture }),
        );
        await page.goto(`${ACTIVITY_URL}?fixture=intervals`, { waitUntil: 'domcontentloaded' });
        await page.locator('html[data-garmin-pace-calculator="loaded"]').waitFor({ timeout: 10_000 });
        const rows = page.locator('#tab-splits tbody > tr');
        await rows.nth(0).click();
        await rows.nth(1).click();
        const summary = page.locator('#interval-summary');
        await summary.waitFor({ state: 'visible', timeout: 10_000 });
        await page.waitForFunction(
            () => document.querySelector('#interval-summary')?.textContent?.includes('250.00'),
            undefined,
            { timeout: 10_000 },
        );
        const summaryText = (await summary.innerText()).replace(/\s+/g, ' ').trim();
        for (const expected of ['Selected Summary', 'Avg Time 0:05:00.0', 'Total Time 0:10:00.0', 'Total Distance 2', 'Avg Pace 5:00', 'Avg Power 250.00']) {
            if (!summaryText.includes(expected)) throw new Error(`Expected summary to contain "${expected}", received: ${summaryText}`);
        }
        console.log(`Fixture validation passed: ${summaryText}`);
    } finally {
        await page.close();
        await browser.close();
    }
}

async function diagnose() {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    const browser = await connectToChrome();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome did not expose its default browser context.');
    const consoleMessages = [];
    let page;
    context.on('console', (message) => {
        const entry = `[${message.type()}] ${message.text()}`;
        consoleMessages.push(entry);
        console.log(entry);
    });

    try {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        page = await openActivity(context);
        if (!page.url().startsWith('https://connect.garmin.com/app/activity/')) {
            throw new Error(`Garmin authentication is required. Run npm run garmin:auth first. Current URL: ${page.url()}`);
        }

        await openIntervalsTab(page);
        const intervalsTable = page.locator('#tab-splits table').first();
        await intervalsTable.waitFor({ state: 'visible', timeout: 30_000 });
        const firstInterval = intervalsTable.locator('tbody > tr').first();
        await firstInterval.evaluate((element) => element.click());
        await page.locator('#interval-summary').waitFor({ state: 'visible', timeout: 10_000 });

        const diagnostic = await page.evaluate(() => ({
            url: location.href,
            tabs: [...document.querySelectorAll('[role="tab"], button')]
                .map((element) => ({
                    text: element.textContent?.trim(),
                    role: element.getAttribute('role'),
                    ariaSelected: element.getAttribute('aria-selected'),
                    className: element.className,
                }))
                .filter(({ text }) => text),
            tables: [...document.querySelectorAll('table')].map((table) => ({
                id: table.id,
                className: table.className,
                headers: [...table.querySelectorAll('th')].map((header) => header.textContent?.trim()),
                rowCount: table.querySelectorAll('tbody tr').length,
                footerCount: table.querySelectorAll('tfoot').length,
                selectedRows: [...table.querySelectorAll('tbody tr')]
                    .filter((row) => row.matches('[aria-selected="true"], .active, [class*="selected"]'))
                    .map((row) => ({ className: row.className, ariaSelected: row.getAttribute('aria-selected') })),
            })),
            summary: document.querySelector('#interval-summary')?.textContent?.trim() ?? null,
        }));

        await writeFile(path.join(ARTIFACTS_DIR, 'diagnostic.json'), `${JSON.stringify(diagnostic, null, 2)}\n`);
        await intervalsTable.screenshot({ path: path.join(ARTIFACTS_DIR, 'intervals-table.png') });
        console.log(`Diagnostic artifacts written to ${path.relative(ROOT_DIR, ARTIFACTS_DIR)}`);
        console.log(JSON.stringify(diagnostic, null, 2));
    } finally {
        if (page) {
            await writeFile(path.join(ARTIFACTS_DIR, 'page.html'), await page.content()).catch(() => undefined);
            await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'intervals.png'), fullPage: true }).catch(() => undefined);
        }
        await writeFile(path.join(ARTIFACTS_DIR, 'console.log'), `${consoleMessages.join('\n')}\n`).catch(() => undefined);
        await context.tracing.stop({ path: path.join(ARTIFACTS_DIR, 'trace.zip') }).catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
}

const command = process.argv[2];
if (command === 'auth') {
    await authenticate();
} else if (command === 'setup') {
    await setup();
} else if (command === 'fixture') {
    await validateFixture();
} else if (command === 'diagnose') {
    await diagnose();
} else {
    throw new Error('Usage: node scripts/garmin-browser.mjs <auth|setup|fixture|diagnose>');
}
