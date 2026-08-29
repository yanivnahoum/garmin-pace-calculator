import $ from 'jquery';
import { getIntervalsTable, initSummaryReport } from './intervals-table';
import './styles/main.scss';

// Execute on Document Ready
$(function () {
	document.documentElement.dataset.garminPaceCalculator = 'loaded';
	let initializedTable: HTMLTableElement | undefined;
	let initializedBody: HTMLTableSectionElement | undefined;
	let initializedHeaders = '';
	let initializedRows = '';
	let initializedLocation = '';
	let animationFrame: number | undefined;
	let forceInitialization = false;

	const initialize = () => {
		animationFrame = undefined;
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
		const nextRows = nextBody?.textContent?.trim() ?? '';
		const nextLocation = window.location.href;

		if (!nextTableElement || !nextBody || !nextTable.find('> thead > tr > th').length) {
			if (!nextTableElement) {
				initializedTable = undefined;
				initializedBody = undefined;
				initializedHeaders = '';
				initializedRows = '';
			}
			return;
		}
		const hasControl = nextTable.prev('.garmin-pace-controls').length > 0;
		const hasSummary = nextTable.find('> tfoot > #interval-summary').length > 0;
		if (
			!forceInitialization &&
			nextTableElement === initializedTable &&
			nextBody === initializedBody &&
			nextHeaders === initializedHeaders &&
			nextRows === initializedRows &&
			nextLocation === initializedLocation &&
			hasControl &&
			hasSummary
		) {
			return;
		}

		forceInitialization = false;
		initSummaryReport();
		initializedTable = nextTableElement;
		initializedBody = nextBody;
		initializedHeaders = nextHeaders;
		initializedRows = nextRows;
		initializedLocation = nextLocation;
	};

	const scheduleInitialization = (force = false) => {
		forceInitialization ||= force;
		animationFrame ??= window.requestAnimationFrame(initialize);
	};

	const originalPushState = history.pushState;
	history.pushState = function(...args) {
		originalPushState.apply(this, args);
		scheduleInitialization(true);
	};
	const originalReplaceState = history.replaceState;
	history.replaceState = function(...args) {
		originalReplaceState.apply(this, args);
		scheduleInitialization(true);
	};
	window.addEventListener('popstate', () => scheduleInitialization(true));
	document.addEventListener(
		'click',
		(event) => {
			if (event.target instanceof Element && event.target.closest('.icon-arrow-left, .icon-arrow-right')) scheduleInitialization(true);
		},
		true,
	);

	const observer = new MutationObserver(() => scheduleInitialization());
	observer.observe(document.body, { childList: true, characterData: true, subtree: true });
	scheduleInitialization(true);
});
