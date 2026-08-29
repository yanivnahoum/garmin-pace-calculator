import $ from 'jquery';
import { getIntervalsTable, initSummaryReport } from './intervals-table';
import './styles/main.scss';

// Execute on Document Ready
$(function () {
	document.documentElement.dataset.garminPaceCalculator = 'loaded';
	let initializedTable: HTMLTableElement | undefined;
	let initializedBody: HTMLTableSectionElement | undefined;
	let initializedHeaders = '';

	const initialize = () => {
		const nextTable = getIntervalsTable();
		const nextTableElement = nextTable.get(0);
		const nextBody = nextTableElement?.tBodies.item(0) ?? undefined;
		const nextHeaders = nextTable
			.find('> thead > tr')
			.first()
			.children('th')
			.map((_, header) => header.textContent?.trim() ?? '')
			.get()
			.join('\u001f');

		if (!nextTableElement || !nextBody || !nextTable.find('> thead > tr > th').length) {
			if (!nextTableElement) {
				initializedTable = undefined;
				initializedBody = undefined;
				initializedHeaders = '';
			}
			return;
		}
		if (nextTableElement === initializedTable && nextBody === initializedBody && nextHeaders === initializedHeaders) return;

		initSummaryReport();
		initializedTable = nextTableElement;
		initializedBody = nextBody;
		initializedHeaders = nextHeaders;
	};

	const observer = new MutationObserver(initialize);
	observer.observe(document.body, { childList: true, subtree: true });
	initialize();
});
