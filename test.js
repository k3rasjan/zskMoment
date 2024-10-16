import jsdom from 'jsdom';
import fs from "fs";
const { JSDOM } = jsdom;

async function fetchTimetables() {
    let timetables = [];

    /* Use a while true loop so that we don't have to manually set the number of timetables */
    while (true) {
        try {
            const timetable = await fetchTimetable(timetables.length + 1);
            timetables.push(parseTimetable(timetable));
        } catch {
            break;
        }
    }

    return timetables;
}

async function fetchTimetable(timetableId) {
    const response = await fetch(
        `https://www.zsk.poznan.pl/plany_lekcji/2023plany/technikum/plany/o${timetableId}.html`,
    );

    if (response.status === 404) {
        throw new Error('Timetable not found');
    }

    return await response.text();
}

function parseTimetable(rawText) {
    const dom = new JSDOM(rawText).window.document;
    const classNumber = dom
        .querySelector('.tytulnapis')
        .textContent.split(' ')[0];
    const table = dom.querySelector('.tabela tbody');

    /* Remove the first row as it contains the table headers */
    table.querySelector('tr').remove();

    return {
        class: classNumber,
        table,
    };
}

function extractClassTimetable(timetable, classNumber) {
    const rows = timetable.querySelectorAll('tr');

    let classTimetable = [];

    rows.forEach((row) => {
        classTimetable.push(...extractTableRowData(row, classNumber));
    });

    return classTimetable;
}

function extractTableRowData(row, classNumber) {
    /* Remove the first column as it contains the lesson number */
    row.querySelector('td').remove();

    const [timeStart, timeEnd] = row
        .querySelector('td')
        .textContent.split('-')
        .map((time) => {
            /* Remove any leading or trailing whitespace */
            return time.trim();
        });

    row.querySelector('td').remove();
    const cells = row.querySelectorAll('td');
    let groups = [];

    cells.forEach((cell, cellIndex) => {
        const cellData = extractTableCellData(
            cell,
            cellIndex,
            classNumber,
            timeStart,
            timeEnd,
        );

        if (cellData) {
            groups.push(cellData);
        }
    });

    return groups;
}

function extractTableCellData(
    cell,
    cellIndex,
    classNumber,
    timeStart,
    timeEnd,
) {
    let spans = [...cell.querySelectorAll(':scope > span')];

    if (cell.textContent.trim() === '' || !spans.length) {
        return;
    }

    const day = cellIndex + 1;
    const groups = [];

    /**
     * If the first span contains 3 more spans, it means that the
     * lesson data is, for some reason, in a single span element.
     */
    if (spans[0].querySelectorAll(':scope > span').length === 3) {
        spans.forEach((span) => {
            const [subject, teacher, room] = [
                ...span.querySelectorAll(':scope > span'),
            ].map((span) => {
                return span.textContent.trim();
            });

            groups.push({
                class: classNumber,
                day,
                timeStart,
                timeEnd,
                subject,
                teacher: teacher?.length === 2 ? teacher : 'Unknown',
                room,
            });
        });

        return groups;
    }

    /* Iterate every 3 spans to get the lesson data */
    while (spans.length > 2) {
        const [subject, teacher, room] = [...spans.slice(0, 3)].map((span) => {
            return span.textContent.trim();
        });

        groups.push({
            class: classNumber,
            day,
            timeStart,
            timeEnd,
            subject,
            teacher: teacher?.length === 2 ? teacher : 'Unknown',
            room,
        });

        spans = spans.slice(3);
    }

    return groups;
}

function extractPlans(timetables) {
    const classPlans = {};
    const teacherPlans = {};
    const roomPlans = {};

    timetables.forEach((timetable) => {
        const parsedPlan = extractClassTimetable(
            timetable.table,
            timetable.class,
        );

        classPlans[timetable.class] = parsedPlan;

        parsedPlan.flat().forEach((lesson) => {
            const { teacher, room } = lesson;

            teacherPlans[teacher] = teacherPlans[teacher] || [];
            roomPlans[room] = roomPlans[room] || [];

            teacherPlans[teacher].push(lesson);
            roomPlans[room].push(lesson);
        });

        return parsedPlan;
    });

    return {
        classPlans,
        teacherPlans,
        roomPlans,
    };
}

const timetables = await fetchTimetables();
const { classPlans, teacherPlans, roomPlans } = extractPlans(timetables);

fs.writeFile("file.json", JSON.stringify(classPlans), (err)=>console.log(err));
