import $ from "jquery";
import duration from "duration-pattern";

const intervalsTable = () => $('#tab-splits table');
const observer = new MutationObserver(function () {
    if (intervalsTable().length) {
        observer.disconnect();
        $('div.page-navigation > button').on('click', () => setTimeout(observe, 200));
        setup();
    }
});

const observe = () =>  {
    observer.observe(document.body, { childList: true, subtree: true });
}
observe();

let timeColumnIndex, distanceColumnIndex;
function setup() {
    initColumnIndexes();
    intervalsTable().find("> tbody").on('click', () => setTimeout(runAvg, 0));
}

const isTimeColumn = index => index === timeColumnIndex;
const isDistanceColumn = index => index === distanceColumnIndex;

function initColumnIndexes() {
    intervalsTable().find("> thead > tr > th").each((index, th) => {
        const columnName = $(th).text().trim() || $(th).find("span").text().trim();
        switch (columnName) {
            case "Time":
                timeColumnIndex = index;
                break;
            case "Distance":
                distanceColumnIndex = index;
                break;
            default:
                break;
        }
    });
    if (timeColumnIndex == null) console.error("Couldn't find the Time column!");
    if (distanceColumnIndex == null) console.error("Couldn't find the Distance column!");
}

function runAvg() {
    const activeLaps = intervalsTable().find('> tbody').find('> tr.active, > tr[class*="IntervalsTable_selected__"]:not(:has(> td > i))');

    const parseFloat2Decimals = val => parseFloat(parseFloat(val).toFixed(2));
    const countColons = str => str.split(":").length - 1;
    const hasHours = str => countColons(str) === 2;
    const parseTime = val => hasHours(val) ? duration.parse(val, "H:m:s") : duration.parse(`${val}00`, 'm:ss.SSS');

    const data = [];
    activeLaps.each((i, row) => {
        let cells = [...row.cells];
        const isSubLap = $(row).find('> tr').length > 0;
        if (isSubLap) {
            cells = ['', ...cells]
        }
        cells = cells.map(val => val.innerText)
            .map((val, index) => {
                let computedVal = val;
                if (isTimeColumn(index)) {
                    computedVal = parseTime(val);
                } else if (isDistanceColumn(index)) {
                    computedVal = parseFloat2Decimals(val);
                }
                return computedVal;
            });
        data.push(cells);
    });

    const timeFormat = "H:mm:ss.SS";
    const paceFormat = "m:ss.S"
    const avgTimeReducer = (accumulator, currentValue, i, a) => accumulator + (currentValue[timeColumnIndex] / a.length);
    const avgTime = duration.format(Math.round(Math.floor(data.reduce(avgTimeReducer, 0)) / 100) * 100, timeFormat).slice(0, -2);

    const comTimeReducer = (accumulator, currentValue) => accumulator + currentValue[timeColumnIndex];
    const comTimeMillis = data.reduce(comTimeReducer, 0);
    const comTime = duration.format(comTimeMillis, timeFormat).slice(0, -2);


    const totDistReducer = (accumulator, currentValue) => accumulator + currentValue[distanceColumnIndex];
    const totDist = parseFloat2Decimals(data.reduce(totDistReducer, 0));

    const avgPace = duration.format(Math.round(comTimeMillis / totDist), paceFormat).slice(0, -2);

    const tableFooter = intervalsTable().find('> tfoot');
    tableFooter.find('#interval-summary').remove();

    let td = '<td colspan="4">Select some laps!</td><td colspan="100%"></td>';
    if (activeLaps.length) {
        td = `<td colspan="3" style="padding: 8px; text-align: left;">Selected Summary</td><td><div style="font-size:9px">Avg Time</div><div>${avgTime}</div></td><td></td><td><div style="font-size:9px">Total Time</div><div>${comTime}</div></td><td><div style="font-size:9px">Total Dist</div><div>${totDist}</div></td><td><div style="font-size:9px">Avg Pace</div><div>${avgPace}</div></td><td colspan="100%"></td>`;
    }

    tableFooter.append(`<tr id="interval-summary" style="background: lightblue">${td}</tr>`);
}
