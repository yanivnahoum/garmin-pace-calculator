import $ from 'jquery';
import { getIntervalsTable, initSummaryReport } from './intervals-table';
import './styles/main.scss';

function startObserving(observer) {
	observer.observe(document.body, { childList: true, subtree: true });
}

// Execute on Document Ready
$(function () {
	const observer = new MutationObserver(function () {
		if (!getIntervalsTable()?.length) return;
		observer.disconnect();
		$('div.page-navigation > button').on('click', () => setTimeout(() => startObserving(observer), 200));
		initSummaryReport();
	});
	startObserving(observer);
});
