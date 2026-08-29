import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ACTIVITY_URL = process.argv[3] ?? 'https://connect.garmin.com/app/activity/24144016703';
const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'dist');
const PROFILE_DIR = path.join(ROOT_DIR, '.playwright', 'garmin-native-profile');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'test-results', 'live');
const FIXTURES = [
    { name: 'Intervals', path: path.join(ROOT_DIR, 'tests', 'fixtures', 'intervals-table.html') },
    { name: 'Laps', path: path.join(ROOT_DIR, 'tests', 'fixtures', 'laps-table.html') },
];
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUGGING_PORT = 9222;
const CDP_ENDPOINT = `http://127.0.0.1:${DEBUGGING_PORT}`;
const SPLITS_TABLE_SELECTOR = 'table[class^="IntervalsTable_table"], table[class^="SortableTable_table"]';

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

async function openSplitsTab(page) {
    await page
        .getByText(/^(Intervals|Laps)$/i, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 });

    const candidates = [
        page.getByRole('tab', { name: /^(Intervals|Laps)$/i }),
        page.getByRole('button', { name: /^(Intervals|Laps)$/i }),
        page.getByText(/^(Intervals|Laps)$/i, { exact: true }),
    ];

    for (const candidate of candidates) {
        const visibleCandidate = candidate.first();
        if (await visibleCandidate.isVisible().catch(() => false)) {
            await visibleCandidate.evaluate((element) => element.click());
            return;
        }
    }

    throw new Error('Could not find the Intervals or Laps tab below the activity charts.');
}

function intervalsTable(page) {
    return page.locator(SPLITS_TABLE_SELECTOR).first();
}

function selectedRowCount(rows) {
    return rows.evaluateAll(
        (elements) =>
            elements.filter((element) => element.className.includes('IntervalsTable_selected') || element.querySelector('td[class*="SortableTable_selected"]'))
                .length,
    );
}

async function assertSummary(page, rows, expectedValues) {
    const summary = page.locator('#interval-summary');
    await summary.waitFor({ state: 'visible', timeout: 10_000 });
    try {
        await page.waitForFunction(
            (expected) => {
                const summaryElement = document.querySelector('#interval-summary');
                const text = summaryElement instanceof HTMLElement ? summaryElement.innerText.replace(/\s+/g, ' ').trim() : undefined;
                return expected.every((value) => text?.includes(value));
            },
            expectedValues,
            { timeout: 10_000 },
        );
    } catch {
        const observedText = (await summary.innerText()).replace(/\s+/g, ' ').trim();
        const rowClasses = await rows.evaluateAll((elements) => elements.map((element) => element.className));
        throw new Error(`Expected ${JSON.stringify(expectedValues)}, received "${observedText}" with rows ${JSON.stringify(rowClasses)}`);
    }
    const summaryText = (await summary.innerText()).replace(/\s+/g, ' ').trim();
    if ((await page.locator('#interval-summary').count()) !== 1) {
        throw new Error('Expected exactly one summary footer row.');
    }
    return summaryText;
}

function parseDuration(value) {
    const parts = value.split(':').map(Number);
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

function parseSummaryValue(value) {
    return value.split(/\s+/).at(-1);
}

async function readSummary(page) {
    return page.locator('#interval-summary td').evaluateAll((cells) =>
        Object.fromEntries(
            cells.flatMap((cell) => {
                const label = cell.querySelector('.summary-label')?.textContent?.trim();
                return label ? [[label, cell.textContent?.replace(label, '').trim()]] : [];
            }),
        ),
    );
}

async function validateFixture() {
    const browser = await connectToChrome();
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome did not expose its default browser context.');
    await reloadExtension(context);

    try {
        for (const fixtureDefinition of FIXTURES) {
            const fixture = await readFile(fixtureDefinition.path, 'utf8');
            const fixtureUrl = `${ACTIVITY_URL}?fixture=${fixtureDefinition.name.toLowerCase()}`;
            const page = await context.newPage();
            try {
                await page.route(fixtureUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
                await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
                await page.locator('html[data-garmin-pace-calculator="loaded"]').waitFor({ timeout: 10_000 });
                const rows = intervalsTable(page).locator('tbody > tr');
                const emptyLayout = await page.evaluate(() => ({
                    tableWidth: document.querySelector('table')?.getBoundingClientRect().width,
                    titleWidth: document.querySelector('#interval-summary .selected-summary-title')?.getBoundingClientRect().width,
                }));

                await rows.nth(0).click();
                const singleSummary = await assertSummary(page, rows, ['Total Time 0:05:00.0', 'Total Distance 1', 'Avg Power 200.00']);
                const selectedLayout = await page.evaluate(() => ({
                    tableWidth: document.querySelector('table')?.getBoundingClientRect().width,
                    titleWidth: document.querySelector('#interval-summary .selected-summary-title')?.getBoundingClientRect().width,
                }));
                if (emptyLayout.tableWidth !== selectedLayout.tableWidth || emptyLayout.titleWidth !== selectedLayout.titleWidth) {
                    throw new Error(`Expected selection not to resize the summary table: ${JSON.stringify({ emptyLayout, selectedLayout })}`);
                }

                await rows.nth(1).click();
                const combinedSummary = await assertSummary(page, rows, ['Total Time 0:10:00.0', 'Total Distance 2', 'Avg Power 250.00']);

                await rows.nth(0).click();
                const deselectedSummary = await assertSummary(page, rows, ['Total Time 0:05:00.0', 'Total Distance 1', 'Avg Power 300.00']);
                if ((await selectedRowCount(rows)) !== 1) throw new Error('Expected only the second row to remain selected.');

                const selectAll = page.locator('.garmin-pace-select-all input');
                if (!(await selectAll.evaluate((checkbox) => checkbox.indeterminate))) {
                    throw new Error('Expected select-all to be indeterminate with a partial selection.');
                }

                await selectAll.check();
                const selectAllSummary = await assertSummary(page, rows, ['Total Time 0:10:00.0', 'Total Distance 2', 'Avg Power 250.00']);
                if ((await selectedRowCount(rows)) !== 2 || !(await selectAll.isChecked())) {
                    throw new Error('Expected select-all to select every row.');
                }

                const summaryPresentation = await page.locator('#interval-summary').evaluate((summary) => {
                    const labelsFit = [...summary.querySelectorAll('.summary-label')].every((label) => {
                        const cell = label.closest('td');
                        return cell && label.scrollWidth <= cell.clientWidth;
                    });
                    const valuesAreBold = [...summary.querySelectorAll('.summary-value')].every(
                        (cell) => Number.parseInt(getComputedStyle(cell).fontWeight, 10) >= 600,
                    );
                    const labels = [...summary.querySelectorAll('td')].map((cell) => cell.querySelector('.summary-label')?.textContent?.trim() ?? '');
                    const paceIndex = labels.indexOf('Avg Pace');
                    const powerIndex = labels.indexOf('Avg Power');
                    const summaryColumnCount = [...summary.cells].reduce((count, cell) => count + cell.colSpan, 0);
                    const tableColumnCount = summary.closest('table')?.querySelectorAll('thead > tr:first-child > th').length;
                    const style = getComputedStyle(summary);
                    return {
                        labelsFit,
                        valuesAreBold,
                        calculatedValuesAreContiguous: powerIndex < 0 || powerIndex === paceIndex + 1,
                        spansFullTableWidth: summaryColumnCount === tableColumnCount,
                        backgroundColor: style.backgroundColor,
                    };
                });
                if (
                    !summaryPresentation.labelsFit ||
                    !summaryPresentation.valuesAreBold ||
                    !summaryPresentation.calculatedValuesAreContiguous ||
                    !summaryPresentation.spansFullTableWidth ||
                    summaryPresentation.backgroundColor === 'rgba(0, 0, 0, 0)'
                ) {
                    throw new Error(`Expected a colored summary row with labels contained by their cells: ${JSON.stringify(summaryPresentation)}`);
                }

                await selectAll.uncheck();
                await page.waitForFunction(() => document.querySelector('#interval-summary')?.textContent?.replace(/\s+/g, ' ').includes('Select laps!'));
                if ((await selectedRowCount(rows)) !== 0 || (await selectAll.isChecked())) {
                    throw new Error('Expected select-all to deselect every row.');
                }

                await page.evaluate(() => {
                    const currentTable = document.querySelector('table');
                    if (!(currentTable instanceof HTMLTableElement)) throw new Error('Fixture table is missing.');

                    const headers = [...currentTable.querySelectorAll('thead th')].map((header) => header.textContent?.trim());
                    const firstRow = currentTable.tBodies[0]?.rows[0];
                    if (!firstRow) throw new Error('Fixture table row is missing.');
                    const setValue = (header, value) => {
                        const index = headers.indexOf(header);
                        if (index < 0 || !firstRow.cells[index]) throw new Error(`Fixture column ${header} is missing.`);
                        firstRow.cells[index].textContent = value;
                    };
                    setValue('Time', '6:00');
                    setValue('Cumulative Time', '6:00');
                    setValue('Distance', '1.50');
                    setValue('Avg Pace', '4:00');
                    setValue('Avg Power', '240');

                    document.querySelector('.garmin-pace-controls')?.remove();
                    currentTable.querySelector('tfoot')?.replaceChildren();
                    history.pushState({}, '', `${location.pathname}?activity=navigation-test`);
                });
                await page.locator('#interval-summary').waitFor({ state: 'visible', timeout: 10_000 });
                await page.locator('.garmin-pace-select-all input').waitFor({ state: 'visible', timeout: 10_000 });
                await page.waitForFunction(() => document.querySelector('#interval-summary')?.textContent?.replace(/\s+/g, ' ').includes('Select laps!'));
                await rows.nth(0).click();
                const navigationSummary = await assertSummary(page, rows, ['Total Time 0:06:00.0', 'Total Distance 1.5', 'Avg Power 240.00']);

                console.log(`${fixtureDefinition.name} single selection passed: ${singleSummary}`);
                console.log(`${fixtureDefinition.name} combined selection passed: ${combinedSummary}`);
                console.log(`${fixtureDefinition.name} deselection passed: ${deselectedSummary}`);
                console.log(`${fixtureDefinition.name} select all passed: ${selectAllSummary}`);
                console.log(`${fixtureDefinition.name} deselect all and summary presentation passed.`);
                console.log(`${fixtureDefinition.name} activity navigation passed: ${navigationSummary}`);
            } finally {
                await page.close();
            }
        }
    } finally {
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
        await reloadExtension(context);
        page = await openActivity(context);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (!page.url().startsWith('https://connect.garmin.com/app/activity/')) {
            throw new Error(`Garmin authentication is required. Run npm run garmin:auth first. Current URL: ${page.url()}`);
        }

        await openSplitsTab(page);
        const table = intervalsTable(page);
        await table.waitFor({ state: 'visible', timeout: 30_000 });
        await table
            .locator('th')
            .filter({ hasText: /^Time$/ })
            .waitFor({ state: 'visible', timeout: 30_000 });
        const headers = await table
            .locator('th')
            .evaluateAll((elements) =>
                elements.map((header) => header.querySelector('span:first-child')?.textContent?.trim() ?? header.textContent?.trim() ?? ''),
            );
        const timeIndex = headers.findIndex((header) => header.trim() === 'Time');
        const distanceIndex = headers.findIndex((header) => header.trim() === 'Distance');
        const powerIndex = headers.findIndex((header) => header.trim() === 'Avg Power');
        if (timeIndex < 0 || distanceIndex < 0) {
            throw new Error(`Live splits table is missing Time or Distance columns. Parsed headers: ${JSON.stringify(headers)}`);
        }

        const rows = table.locator('tbody > tr:not(:has(> td > svg))');
        if ((await rows.count()) < 2) throw new Error('Live Intervals table does not contain two selectable rows.');
        const rawRows = await rows.evaluateAll(
            (elements, indexes) => indexes.map((index) => [...elements[index].cells].map((cell) => cell.innerText.trim())),
            [0, 1],
        );
        const expectedRows = rawRows.map((cells) => ({
            time: parseDuration(cells[timeIndex]),
            distance: Number(cells[distanceIndex]),
            power: powerIndex >= 0 ? Number(cells[powerIndex]) : undefined,
        }));

        const selectedRows = table.locator(
            'tbody > tr[class*="IntervalsTable_selected"], tbody > tr[class*="Table_selected"], tbody > tr[class*="SortableTable_tableRow"]:has(> td[class*="SortableTable_selected"])',
        );
        for (let index = (await selectedRows.count()) - 1; index >= 0; index -= 1) {
            await selectedRows.nth(index).evaluate((element) => (element.cells[0] ?? element).click());
        }

        await rows.nth(0).evaluate((element) => (element.cells[0] ?? element).click());
        await page.waitForFunction(() => document.querySelector('#interval-summary')?.textContent?.includes('Selected Summary'));
        const singleSummary = await readSummary(page);

        await rows.nth(1).evaluate((element) => (element.cells[0] ?? element).click());
        await page.waitForFunction(
            (previousDistance) => !document.querySelector('#interval-summary')?.textContent?.includes(`Total Distance${previousDistance}`),
            singleSummary['Total Distance'],
        );
        const combinedSummary = await readSummary(page);

        await rows.nth(0).evaluate((element) => (element.cells[0] ?? element).click());
        await page.waitForFunction(
            (previousDistance) => !document.querySelector('#interval-summary')?.textContent?.includes(`Total Distance${previousDistance}`),
            combinedSummary['Total Distance'],
        );
        const deselectedSummary = await readSummary(page);

        const assertClose = (label, actual, expected, tolerance = 0.01) => {
            if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: expected ${expected}, received ${actual}`);
        };
        assertClose('Single total time', parseDuration(parseSummaryValue(singleSummary['Total Time'])), expectedRows[0].time, 0.11);
        assertClose('Single distance', Number(parseSummaryValue(singleSummary['Total Distance'])), expectedRows[0].distance);
        assertClose('Combined total time', parseDuration(parseSummaryValue(combinedSummary['Total Time'])), expectedRows[0].time + expectedRows[1].time, 0.11);
        assertClose('Combined distance', Number(parseSummaryValue(combinedSummary['Total Distance'])), expectedRows[0].distance + expectedRows[1].distance);
        assertClose('Deselected total time', parseDuration(parseSummaryValue(deselectedSummary['Total Time'])), expectedRows[1].time, 0.11);
        assertClose('Deselected distance', Number(parseSummaryValue(deselectedSummary['Total Distance'])), expectedRows[1].distance);
        if (expectedRows.every(({ power }) => Number.isFinite(power))) {
            const weightedPower =
                (expectedRows[0].time * expectedRows[0].power + expectedRows[1].time * expectedRows[1].power) / (expectedRows[0].time + expectedRows[1].time);
            assertClose('Combined weighted power', Number(parseSummaryValue(combinedSummary['Avg Power'])), weightedPower);
            assertClose('Deselected power', Number(parseSummaryValue(deselectedSummary['Avg Power'])), expectedRows[1].power);
        }
        const remainingSelected = await table
            .locator(
                'tbody > tr[class*="IntervalsTable_selected"], tbody > tr[class*="Table_selected"], tbody > tr[class*="SortableTable_tableRow"]:has(> td[class*="SortableTable_selected"])',
            )
            .count();
        if (remainingSelected !== 1) throw new Error(`Expected one selected row after deselection, received ${remainingSelected}.`);

        console.log(`Live single selection passed: ${JSON.stringify(singleSummary)}`);
        console.log(`Live combined selection passed: ${JSON.stringify(combinedSummary)}`);
        console.log(`Live deselection passed: ${JSON.stringify(deselectedSummary)}`);

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
        await intervalsTable(page)
            .screenshot({ path: path.join(ARTIFACTS_DIR, 'intervals-table.png') })
            .catch(() => undefined);
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
    throw new Error('Usage: node scripts/garmin-browser.mjs <auth|setup|fixture|diagnose> [activity-url]');
}
