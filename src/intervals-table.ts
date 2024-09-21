import duration from 'duration-pattern';
import $ from 'jquery';
import { parseFloat2Decimals, parseTime } from './utils';

type ComputedIntervalValues = { time?: number; distance?: number; lapPower?: number };

const TIME_FORMAT = 'H:mm:ss.SS';
const PACE_FORMAT = 'm:ss.S';

function getIntervalsTable(): JQuery<HTMLTableElement> {
	return $('#tab-splits table');
}

let table: JQuery<HTMLTableElement> | undefined;
let columnIndexes: { [key: string]: number } = {};

function getData(): {
	activeLapsLength?: number;
	averageTime?: number;
	cumulativeTime?: number;
	totalDistance?: number;
	averagePace?: number;
	averagePower?: number | string;
} {
	console.log('Pace Calculator : getData');
	const { Time: timeColumnIndex, Distance: distanceColumnIndex, 'Lap Power': lapPowerColumnIndex } = columnIndexes;

	if (!table || !timeColumnIndex || !distanceColumnIndex) return {};

	const activeLaps = isIntervalTable(table) ? table.find('tr[class*="Table_selected"]:not(:has(> td > svg)') as JQuery<HTMLTableRowElement>
		: table.find('tr.active[class*="SortableTable_tableRow"]') as JQuery<HTMLTableRowElement>;

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
			lapPower: lapPowerColumnIndex ? Number(cells[lapPowerColumnIndex]?.innerText) : undefined,
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

	const summaryRow = $(`<tr id="interval-summary"></tr>`);

	const generateEmptyCell = () => $('<td class="summary-value"></td>');

	const summaryTitleCell = $(`<td class="selected-summary-title">${activeLapsLength ? 'Selected Summary' : 'Select&nbsp;some laps!'}</td>`);

	if (!activeLapsLength) {
		summaryRow.append(generateEmptyCell());
		summaryRow.append(summaryTitleCell);
		summaryRow.append($('<td colspan="100%"></td>'));
		tableFooter.append(summaryRow);
		return;
	}

	const sortedColumns = [...Object.entries(columnIndexes)].sort(([_a, a_value], [_b, b_value]) => a_value - b_value);

	sortedColumns.forEach(([columnName, _]) => {
		switch (columnName.trim()) {
			case 'Interval':
				summaryRow.append(summaryTitleCell);
				break;
			case 'Time':
				summaryRow.append($(`<td class="summary-value"><span class="summary-label">Avg Time</span><br />${values.averageTime}</td>`));
				break;
			case 'Cumulative Time':
				summaryRow.append($(`<td class="summary-value"><span class="summary-label">Total Time</span><br />${values.cumulativeTime}</td>`));
				break;
			case 'Distance':
				summaryRow.append($(`<td class="summary-value"><span class="summary-label">Total Distance</span><br />${values.totalDistance}</td>`));
				break;
			case 'Avg Pace':
				summaryRow.append($(`<td class="summary-value"><span class="summary-label">Avg Pace</span><br />${values.averagePace}</td>`));
				break;
			case 'Lap Power':
				summaryRow.append($(`<td class="summary-value"><span class="summary-label">Avg Power</span><br />${values.averagePower}</td>`));
				break;
			default:
				summaryRow.append(generateEmptyCell());
				break;
		}
	});

	tableFooter.append(summaryRow);
	return;
}

function initSummaryReport() {
	console.log('Pace Calculator : initSummaryReport');
	// reset
	table = undefined;
	columnIndexes = {};

	// initialize
	table = getIntervalsTable();

	if (!table || !table.length) return;

	const intervalTableHeaders = $('th > span');

	intervalTableHeaders.each((idx, headerSpanElement) => {
		const columnName = headerSpanElement.outerText?.trim() || 'N/A';
		columnIndexes[columnName] = idx;
	});

	table.find('> tbody').on('click', () => setTimeout(showSummary, 0));
}

export { getIntervalsTable, initSummaryReport };
