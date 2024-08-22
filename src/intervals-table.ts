import duration from 'duration-pattern';
import $ from 'jquery';
import { parseFloat2Decimals, parseTime } from './utils';
import { paceFormat, summaryLabelsMap, timeFormat } from './constants';

export const initialState: {
	table?: JQuery<HTMLTableElement>;
	columnIndexes: {
		Time?: number;
		Distance?: number;
		'Lap Power'?: number;
	};
	lapPowerColumnExists: boolean;
} = {
	table: undefined,
	columnIndexes: {
		Time: undefined,
		Distance: undefined,
		'Lap Power': undefined,
	},
	lapPowerColumnExists: false,
};

let { table, columnIndexes, lapPowerColumnExists } = initialState;

function getIntervalsTable(): JQuery<HTMLTableElement> {
	return $('#tab-splits table');
}

function getData(): {
	activeLapsLength?: number;
	averageTime?: number;
	cumulativeTime?: number;
	totalDistance?: number;
	averagePace?: number;
	averagePower?: number | string;
} {
	const { Time: timeColumnIndex, Distance: distanceColumnIndex, 'Lap Power': lapPowerColumnIndex } = columnIndexes;

	if (!table || !timeColumnIndex || !distanceColumnIndex || !lapPowerColumnIndex) return {};

	const activeLaps: JQuery<HTMLTableRowElement> = table.find(
		'> tbody > tr.active, > tr[class*="IntervalsTable_selected__"]:not(:has(> td > i))',
	) as JQuery<HTMLTableRowElement>;

	const data: number[][] = [];

	activeLaps.each((_, row) => {
		const cells = [...row.cells];

		if ($(row).find('> tr').length > 0) {
			cells.push($('<td></td>')[0] as HTMLTableCellElement);
		}

		const cellsData = cells.reduce((result: number[], cell: HTMLTableCellElement, index: number) => {
			const val = cell.innerText;
			if (!val) return result;

			let computedVal: number = Number(val);

			if (index === columnIndexes['Time']) {
				computedVal = parseTime(val);
			} else if (index === columnIndexes['Distance']) {
				computedVal = parseFloat2Decimals(val);
			}
			result.push(computedVal);
			return result;
		}, []);

		data.push(cellsData);
	});

	const averageTime = duration
		.format(
			Math.round(
				Math.floor(
					data.reduce((accumulator, currentValue, _, a) => {
						accumulator += currentValue[timeColumnIndex] / a.length;
						return accumulator;
					}, 0),
				) / 100,
			) * 100,
			timeFormat,
		)
		.slice(0, -2);

	const cumulativeTimeMillis = data.reduce((accumulator, currentValue) => {
		accumulator += currentValue[timeColumnIndex];
		return accumulator;
	}, 0);

	const cumulativeTime = duration.format(cumulativeTimeMillis, timeFormat).slice(0, -2);

	const calculatedDistance = data.reduce((accumulator, currentValue) => {
		accumulator += currentValue[distanceColumnIndex];
		return accumulator;
	}, 0);

	const totalDistance = parseFloat2Decimals(calculatedDistance);

	const averagePace = duration.format(Math.round(cumulativeTimeMillis / totalDistance), paceFormat).slice(0, -2);

	const averagePower = lapPowerColumnExists
		? parseFloat2Decimals(
				data.reduce((accumulator, currentValue) => {
					accumulator += currentValue[timeColumnIndex] * currentValue[lapPowerColumnIndex];
					return accumulator;
				}, 0) / cumulativeTimeMillis,
			)
		: 'N/A';

	return {
		activeLapsLength: activeLaps.length,
		averageTime,
		cumulativeTime,
		totalDistance,
		averagePace,
		averagePower,
	};
}

function showSummary(values, activeLapsCount) {
	console.info('Pace Calculator : showSummary');
	if (!table) return;

	const tableFooter = table.find('> tfoot');
	tableFooter.find('#interval-summary').remove();

	const summaryCellContent = activeLapsCount ? 'Selected Summary' : 'Select some laps!';
	const summaryRow = $(`<tr id="interval-summary"><td colspan="4">${summaryCellContent}</td></tr>`);

	if (!activeLapsCount) {
		tableFooter.append(summaryRow);
		return;
	}

	Object.entries(values).forEach(([key, value]) => {
		const dataCell = $(`<td class="summary-value"><div class="summary-label">${summaryLabelsMap[key]}</div><div>${value}</div></td>`);
		summaryRow.append(dataCell);
	});

	summaryRow.append($('<tr><td colspan="100%"></td><tr>'));

	tableFooter.append(summaryRow);
	return;
}

function runAvg() {
	console.info('Pace Calculator : runAvg');
	const { activeLapsLength, ...values } = getData();
	showSummary(values, activeLapsLength);
}

function initSummaryReport() {
	console.info('Pace Calculator : initSummaryReport');
	// reset
	table = initialState.table;
	columnIndexes = initialState.columnIndexes;

	// initialize
	table = getIntervalsTable();

	if (!table || !table.length) return;

	table.find('> thead > tr > th').each((index, th) => {
		const columnName = $(th).text().trim() || $(th).find('span').text().trim();
		columnIndexes[columnName] = index;
		if (columnName === 'Lap Power') {
			lapPowerColumnExists = true;
		}
	});
	// validate found columns
	Object.entries(columnIndexes).forEach(([key, value]) => {
		if (value === undefined) {
			console.error(`Couldn't find the ${key} column!`);
		}
	});

	table.find('> tbody').on('click', () => setTimeout(runAvg, 0));
}

export { getIntervalsTable, initSummaryReport };
