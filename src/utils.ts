import duration from 'duration-pattern';

function countColons(str: string) {
	return str.split(':').length - 1;
}

function hasHours(str: string) {
	return countColons(str) === 2;
}

function parseTime(val?: string) {
	if (!val) return;
	return hasHours(val) ? duration.parse(val, 'H:m:s') : duration.parse(`${val}00`, 'm:ss.SSS');
}

function parseFloat2Decimals(val?: number): number {
	if (val == undefined || isNaN(val)) {
		console.error(`${val} is not a valid number!`);
		return 0;
	}
	return parseFloat(val.toFixed(2));
}

export { parseTime, parseFloat2Decimals };
