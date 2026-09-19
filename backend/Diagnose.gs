/**
 * Diagnose.gs — run these from the editor when setup() cannot reach something.
 * They print only what is needed to identify the problem; nothing here writes.
 */

/**
 * Prints the calendars this account can actually open, so the right
 * CALENDAR_ID can be copied without guessing. The configured id is checked
 * first and reported as reachable or not.
 */
function diagnoseCalendar() {
  var lines = [];
  var configured = prop_(PROP_CALENDAR_ID);

  lines.push('החשבון שמריץ: ' + Session.getEffectiveUser().getEmail());
  lines.push('CALENDAR_ID שהוגדר: ' + (configured ? maskId_(configured) : '(ריק)'));

  if (configured) {
    var found = null;
    try { found = CalendarApp.getCalendarById(configured); } catch (e) {
      lines.push('  שגיאה בפתיחה: ' + e.message);
    }
    lines.push('  נגיש? ' + (found ? 'כן — ' + found.getName() : 'לא'));
  }

  lines.push('');
  lines.push('היומנים שהחשבון הזה רואה:');
  var cals = CalendarApp.getAllCalendars();
  for (var i = 0; i < cals.length; i++) {
    var c = cals[i];
    lines.push('  [' + (i + 1) + '] ' + c.getName() +
               (c.isOwnedByMe() ? ' (בבעלותי)' : '') +
               '\n      id: ' + c.getId());
  }
  lines.push('');
  lines.push('העתק את ה-id הנכון אל ה-Script Property בשם CALENDAR_ID.');

  var out = lines.join('\n');
  console.log(out);
  return out;
}

/** Checks the Drive root folder without printing its id. */
function diagnoseDrive() {
  var configured = prop_(PROP_ROOT_FOLDER);
  var lines = ['ROOT_FOLDER_ID שהוגדר: ' + (configured ? maskId_(configured) : '(ריק)')];
  try {
    var f = DriveApp.getFolderById(configured);
    lines.push('נגיש? כן — ' + f.getName());
    lines.push('תיקיות משנה קיימות:');
    var it = f.getFolders();
    var n = 0;
    while (it.hasNext() && n < 25) { lines.push('  · ' + it.next().getName()); n++; }
    if (!n) lines.push('  (אין)');
  } catch (e) {
    lines.push('נגיש? לא — ' + e.message);
  }
  var out = lines.join('\n');
  console.log(out);
  return out;
}

/** Shows an id as first/last 4 characters, so logs can be shared safely. */
function maskId_(id) {
  var s = String(id);
  return s.length <= 12 ? s.slice(0, 2) + '…' : s.slice(0, 4) + '…' + s.slice(-4) + ' (' + s.length + ' תווים)';
}
