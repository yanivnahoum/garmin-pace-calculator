import duration from 'duration-pattern';

function countColons(str) {
	return str.split(':').length - 1;
}

function hasHours(str) {
	return countColons(str) === 2;
}

function parseTime(val) {
	return hasHours(val) ? duration.parse(val, 'H:m:s') : duration.parse(`${val}00`, 'm:ss.SSS');
}

function parseFloat2Decimals(val) {
	return parseFloat(parseFloat(val).toFixed(2));
}

export { parseTime, parseFloat2Decimals };
