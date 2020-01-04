import $ from "jquery";
import duration from "duration-pattern";

const intervalsTable = () => document.querySelector('#intervals-table');

if (intervalsTable()) {
    setup();
} else {
    const observer = new MutationObserver(function () {
        if (intervalsTable()) {
            observer.disconnect();
            setup();
        }
    });

    const config = { childList: true, subtree: true, attributes: false, characterData: false }
    observer.observe(document.body, config);
}


let timeColumnIndex, distanceColumnIndex;
function setup() {
    initColumnIndexes();
    $("#intervals-table > table > tbody").on('click', () => setTimeout(runAvg, 0));
}

const isTimeColumn = index => index === timeColumnIndex;
const isDistanceColumn = index => index === distanceColumnIndex;

function initColumnIndexes() {
    $("#intervals-table > table > thead > tr > th").each((index, th) => {
        switch (th.innerText.trim()) {
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
    if (timeColumnIndex == undefined) console.error("Couldn't find the Time column!");
    if (distanceColumnIndex == undefined) console.error("Couldn't find the Distance column!");
}

function runAvg() {
    const activeLaps = $('#intervals-table > table > tbody > tr.active');

    const parseFloat2Decimals = val => parseFloat(parseFloat(val).toFixed(2));

    const data = [];
    activeLaps.each((i, row) => {
        let cells = [...row.cells];
        cells = cells.map(val => val.innerText)
            .map((val, index) => {
                if (isTimeColumn(index)) return duration.parse(val + '00', 'm:ss.SSS');
                if (isDistanceColumn(index)) return parseFloat2Decimals(val);
                return val;
            });
        data.push(cells);
    });

    const avgTimeReducer = (accumulator, currentValue, i, a) => accumulator + (currentValue[timeColumnIndex] / a.length);
    const avgTime = duration.format(Math.round(Math.floor(data.reduce(avgTimeReducer, 0)) / 100) * 100, 'm:ss.S').slice(0, -2);

    const comTimeReducer = (accumulator, currentValue) => accumulator + currentValue[timeColumnIndex];
    const comTimeMillis = data.reduce(comTimeReducer, 0);
    const comTime = duration.format(comTimeMillis, 'm:ss.S').slice(0, -2);


    const totDistReducer = (accumulator, currentValue) => accumulator + currentValue[distanceColumnIndex];
    const totDist = parseFloat2Decimals(data.reduce(totDistReducer, 0));

    const avgPace = duration.format(Math.round(comTimeMillis / totDist), 'm:ss.S').slice(0, -2);

    const tableFooter = $('#intervals-table > table > tfoot');
    tableFooter.find('#interval-summary').remove();

    let td = '<td colspan="4">Select some laps!</td><td colspan="10"></td>';
    if (activeLaps.length) {
        td = `<td>Selected Summary</td><td><div style="font-size:9px">Avg Time</div><div>${avgTime}</div></td><td><div style="font-size:9px">Total Time</div><div>${comTime}</div></td><td></td><td><div style="font-size:9px">Total Dist</div><div>${totDist}</div></td><td></td><td></td><td><div style="font-size:9px">Avg Pace</div><div>${avgPace}</div></td><td></td><td></td><td></td><td></td><td></td>`;
    }

    tableFooter.append(`<tr id="interval-summary" style="background: lightblue">${td}</tr>`);
}