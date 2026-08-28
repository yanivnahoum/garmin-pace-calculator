import $ from 'jquery';
import { getIntervalsTable, initSummaryReport } from './intervals-table';
import './styles/main.scss';

function startObserving(observer) {
	observer.observe(document.body, { childList: true, subtree: true });
}

// Execute on Document Ready
$(function () {
	document.documentElement.dataset.garminPaceCalculator = 'loaded';
	const initialize = (observer: MutationObserver) => {
		if (!getIntervalsTable()?.length) return;
		observer.disconnect();
		$('div.page-navigation > button').on('click', () => setTimeout(() => startObserving(observer), 200));
		initSummaryReport();
	};
	const observer = new MutationObserver(() => initialize(observer));
	initialize(observer);
	if (!getIntervalsTable()?.length) startObserving(observer);
});
