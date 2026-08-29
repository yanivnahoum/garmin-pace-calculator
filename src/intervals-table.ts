import duration from 'duration-pattern';
import $ from 'jquery';
import { parseFloat2Decimals, parseTime } from './utils';

type ComputedIntervalValues = { time?: number; distance?: number; lapPower?: number };

const TIME_FORMAT = 'H:mm:ss.SS';
const PACE_FORMAT = 'm:ss.S';

function getIntervalsTable(): JQuery<HTMLTableElement> {
	return $('table[class^="IntervalsTable_table"], table[class^="SortableTable_table"]').first() as JQuery<HTMLTableElement>;
}

let table: JQuery<HTMLTableElement> | undefined;
let columnIndexes: { [key: string]: number } = {};

function getSelectableRows(): JQuery<HTMLTableRowElement> {
	if (!table) return $() as JQuery<HTMLTableRowElement>;
	return table.find('> tbody > tr').filter((_, row) => !$(row).find('> td > svg').length) as JQuery<HTMLTableRowElement>;
}

function getSelectedRows(): JQuery<HTMLTableRowElement> {
	if (!table) return $() as JQuery<HTMLTableRowElement>;
	return isIntervalTable(table)
		? (table
			.find('tr[class*="IntervalsTable_selected"], tr[class*="Table_selected"]')
			.filter((_, row) => !$(row).find('> td > svg').length) as JQuery<HTMLTableRowElement>)
		: (table.find('tr[class*="SortableTable_tableRow"]:has(> td[class*="SortableTable_selected"])') as JQuery<HTMLTableRowElement>);
}

function updateSelectAllControl() {
	const checkbox = $('.garmin-pace-select-all input');
	const selectableCount = getSelectableRows().length;
	const selectedCount = getSelectedRows().length;
	checkbox.prop('checked', selectableCount > 0 && selectedCount === selectableCount);
	checkbox.prop('indeterminate', selectedCount > 0 && selectedCount < selectableCount);
}

function addSelectAllControl() {
	if (!table || table.prev('.garmin-pace-controls').length) return;

	const control = $('<div class="garmin-pace-controls"><label class="garmin-pace-select-all"><input type="checkbox" /><span>Select all</span></label></div>');
	control.find('input').on('change', (event) => {
		const shouldSelect = (event.currentTarget as HTMLInputElement).checked;
		getSelectableRows().each((_, row) => {
			const isSelected = getSelectedRows().is(row);
			if (isSelected !== shouldSelect) (isIntervalTable(table!) ? row : row.cells[0])?.click();
		});
		setTimeout(showSummary, 0);
	});
	table.before(control);
}

function getData(): {
	activeLapsLength?: number;
	averageTime?: number;
	cumulativeTime?: number;
	totalDistance?: number;
	averagePace?: number;
	averagePower?: number | string;
} {
	console.log('Pace Calculator : getData');
	const { Time: timeColumnIndex, Distance: distanceColumnIndex } = columnIndexes;
	const lapPowerColumnIndex = columnIndexes['Avg Power'];

	if (!table || !timeColumnIndex || !distanceColumnIndex) return {};

	const activeLaps = getSelectedRows();

	const data: ComputedIntervalValues[] = [];

	activeLaps.each((_, row) => {
		const cells = [...row.cells];

		const isSubLap = $(row).find('> tr').length > 0;
		if (isSubLap) {
			cells.unshift(document.createElement('td'));
		}

		const cellsData: ComputedIntervalValues = {
			time: parseTime(cells[timeColumnIndex]?.innerText),
			distance: Number(cells[distanceColumnIndex]?.innerText),
			...(lapPowerColumnIndex ? { lapPower: Number(cells[lapPowerColumnIndex]?.innerText) } : {}),
		};

		data.push(cellsData);
	});

	const averageTime = duration
		.format(
			Math.round(
				Math.floor(
					data.reduce((accumulator, currentValue, _, a) => {
						if (!currentValue.time) return accumulator;
						accumulator += currentValue.time / a.length;
						return accumulator;
					}, 0),
				) / 100,
			) * 100,
			TIME_FORMAT,
		)
		.slice(0, -2);

	const cumulativeTimeMillis = data.reduce((accumulator, currentValue) => {
		if (!currentValue.time) return accumulator;
		accumulator += currentValue.time;
		return accumulator;
	}, 0);

	const cumulativeTime = duration.format(cumulativeTimeMillis, TIME_FORMAT).slice(0, -2);

	const calculatedDistance = data.reduce((accumulator, currentValue) => {
		if (!currentValue.distance) return accumulator;
		accumulator += currentValue.distance;
		return accumulator;
	}, 0);
	const totalDistance = parseFloat2Decimals(calculatedDistance);

	const averagePace = duration.format(Math.round(cumulativeTimeMillis / totalDistance), PACE_FORMAT).slice(0, -2);

	const calculatedAveragePower =
		data.reduce((accumulator, currentValue) => {
			if (!currentValue.lapPower || !currentValue.time) return accumulator;
			accumulator += currentValue.time * currentValue.lapPower;
			return accumulator;
		}, 0) / cumulativeTimeMillis;

	const averagePower = calculatedAveragePower ? calculatedAveragePower.toFixed(2) : 'N/A';

	return {
		activeLapsLength: activeLaps.length,
		averageTime,
		cumulativeTime,
		totalDistance,
		averagePace,
		averagePower,
	};
}

// Distinguish between interval tables and plain lap tables (class starts with "SortableTable_table")
function isIntervalTable(table: JQuery<HTMLTableElement>): boolean {
	const tableClass = table.attr('class');
	console.log(`Pace Calculator: #isIntervalTable - found table with id=${tableClass}`);
	return tableClass?.startsWith('IntervalsTable_table') ?? false;
}

function showSummary() {
	console.log('Pace Calculator : showSummary');
	if (!table) return;

	const { activeLapsLength, ...values } = getData();

	const tableFooter = table.find('> tfoot');
	tableFooter.find('#interval-summary').remove();
	updateSelectAllControl();

	const summaryRow = $(`<tr id="interval-summary"${activeLapsLength ? '' : ' class="summary-empty"'}></tr>`);

	const summaryTitleCell = $(
		`<td class="selected-summary-title"><span class="summary-cell-layout"><span>${activeLapsLength ? 'Selected Summary' : 'Select&nbsp;some laps!'}</span><span class="summary-width-reference" aria-hidden="true">Selected Summary</span></span></td>`,
	);
	const generateValueCell = (label: string, value: unknown, widthReference: string) =>
		$(
			`<td class="summary-value"><span class="summary-cell-layout"><span class="summary-cell-content"><span class="summary-label">${label}</span><br />${value}</span><span class="summary-width-reference" aria-hidden="true">${widthReference}</span></span></td>`,
		);

	const sortedColumns = [...Object.entries(columnIndexes)].sort(([_a, a_value], [_b, b_value]) => a_value - b_value);

	sortedColumns.forEach(([columnName, _]) => {
		switch (columnName.trim()) {
			case 'Interval':
				summaryRow.append($('<td></td>'));
				summaryRow.append(summaryTitleCell);
				break;
			case 'Laps':
				summaryRow.append(summaryTitleCell);
				break;
			case 'Time':
				summaryRow.append(generateValueCell('Avg Time', values.averageTime, 'Avg Time 00:00:00.0'));
				break;
			case 'Cumulative Time':
				summaryRow.append(generateValueCell('Total Time', values.cumulativeTime, 'Total Time 00:00:00.0'));
				break;
			case 'Distance':
				summaryRow.append(generateValueCell('Total Distance', values.totalDistance, 'Total Distance 000.00'));
				break;
			case 'Avg Pace':
				summaryRow.append(generateValueCell('Avg Pace', values.averagePace, 'Avg Pace 00:00.0'));
				break;
			case 'Avg Power':
				summaryRow.append(generateValueCell('Avg Power', values.averagePower, 'Avg Power 0000.00'));
				break;
		}
	});

	const remainingColumns = table.find('> thead > tr').first().children('th').length - summaryRow.children('td').length;
	if (remainingColumns > 0) summaryRow.append($(`<td colspan="${remainingColumns}"></td>`));

	tableFooter.append(summaryRow);
}

function initSummaryReport() {
	console.log('Pace Calculator : initSummaryReport');
	// reset
	table = undefined;
	columnIndexes = {};

	// initialize
	table = getIntervalsTable();

	if (!table?.length) return;

	const headersFromIntervals = 'th > span:first-child';
	const headersFromLaps = 'th > div > span:first-child';
	const intervalTableHeaders = table.find(`${headersFromIntervals}, ${headersFromLaps}`);

	intervalTableHeaders.each((idx, headerSpanElement) => {
		const columnName = headerSpanElement.outerText?.trim() || 'N/A';
		columnIndexes[columnName] = idx;
	});

	addSelectAllControl();
	table
		.find('> tbody')
		.off('click.garminPaceCalculator')
		.on('click.garminPaceCalculator', () => setTimeout(showSummary, 0));
	showSummary();
}

export { getIntervalsTable, initSummaryReport };
