/**
 * Diagnose.gs — read-only checks, run from the editor when something needs
 * verifying against the live Google data. Nothing here writes.
 */

/**
 * Counts calendar events in a window around the imported appointments, so the
 * migration can be proved not to have double-booked anything. Run it before
 * and after the import and compare the two numbers.
 */
function countCalendarEvents() {
  var cal = calendar_();
  var from = new Date(2024, 0, 1);
  var to = new Date(2032, 0, 1);
  var events = cal.getEvents(from, to);

  // group by day so a duplicate pair is visible without printing any titles
  var byDay = {};
  for (var i = 0; i < events.length; i++) {
    var key = Utilities.formatDate(events[i].getStartTime(), TZ, 'yyyy-MM-dd');
    byDay[key] = (byDay[key] || 0) + 1;
  }
  var multi = Object.keys(byDay).filter(function (k) { return byDay[k] > 1; });

  var out = [
    'חלון: 2024-01-01 עד 2032-01-01',
    'סה"כ אירועים ביומן: ' + events.length,
    'ימים עם יותר מאירוע אחד: ' + multi.length + (multi.length ? ' → ' + multi.join(', ') : '')
  ].join('\n');
  console.log(out);
  return out;
}

/** Counts the rows the binder currently holds. */
function countBinderRows() {
  var docs = readAll_(TAB_DOCS);
  var out = [
    'תורים: ' + readAll_(TAB_APPTS).length,
    'מסמכים: ' + docs.length +
      ' (חסרי קובץ: ' + docs.filter(function (d) { return d.status === 'missing'; }).length + ')',
    'הערות: ' + readAll_(TAB_NOTES).length
  ].join('\n');
  console.log(out);
  return out;
}

/** Lists the appointment folders, to confirm one folder per imported row. */
function countApptFolders() {
  var it = apptsFolder_().getFolders();
  var n = 0;
  while (it.hasNext()) { it.next(); n++; }
  var out = 'תיקיות תחת ' + FOLDER_APPTS + '/: ' + n;
  console.log(out);
  return out;
}
