/**
 * Calendar.gs — the family calendar is a projection of the appointments tab.
 * Every write here is best-effort: a calendar failure must never lose the row,
 * which is the source of truth.
 */

function calendar_() {
  var id = requireProp_(PROP_CALENDAR_ID, 'מזהה היומן הקיים');
  var cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('היומן לא נמצא או שאין הרשאה: ' + id);
  return cal;
}

var EVENT_DURATION_MIN = 60;

function eventTitle_(appt) {
  var doctor = str_(appt.doctor);
  var spec = str_(appt.specialty);
  return spec ? doctor + ' – ' + spec : doctor;
}

/** Description shown in Google Calendar: companion, folder link, notes. */
function eventDescription_(appt, notes) {
  var lines = [];
  if (str_(appt.companion)) lines.push('מלווה: ' + appt.companion);
  var url = folderUrl_(appt.folder_id);
  if (url) lines.push('מסמכים: ' + url);
  if (notes && notes.length) {
    lines.push('');
    lines.push('הערות:');
    for (var i = 0; i < notes.length; i++) lines.push('• ' + str_(notes[i].text));
  }
  return lines.join('\n');
}

function createEvent_(appt, notes) {
  var start = toDate_(appt.date, appt.time);
  var end = new Date(start.getTime() + EVENT_DURATION_MIN * 60000);
  var ev = calendar_().createEvent(eventTitle_(appt), start, end, {
    location: str_(appt.location),
    description: eventDescription_(appt, notes || [])
  });
  return ev.getId();
}

/**
 * Looks up an event by id. Calendar API ids and CalendarApp ids differ by a
 * '@google.com' suffix, so try both before giving up.
 */
function findEvent_(eventId) {
  var id = str_(eventId);
  if (!id) return null;
  var cal = calendar_();
  var candidates = id.indexOf('@') >= 0 ? [id] : [id, id + '@google.com'];
  for (var i = 0; i < candidates.length; i++) {
    try {
      var ev = cal.getEventById(candidates[i]);
      if (ev) return ev;
    } catch (e) {
      // getEventById throws for malformed ids; keep trying the next shape
    }
  }
  return null;
}

/** Updates the event in place; recreates it when it has vanished. Returns the id. */
function updateEvent_(appt, notes) {
  var ev = findEvent_(appt.event_id);
  if (!ev) return createEvent_(appt, notes);
  try {
    var start = toDate_(appt.date, appt.time);
    var end = new Date(start.getTime() + EVENT_DURATION_MIN * 60000);
    ev.setTitle(eventTitle_(appt));
    ev.setTime(start, end);
    ev.setLocation(str_(appt.location));
    ev.setDescription(eventDescription_(appt, notes || []));
    return ev.getId();
  } catch (e) {
    logErr_('updateEvent_ ' + appt.event_id, e);
    return str_(appt.event_id);
  }
}

function deleteEvent_(eventId) {
  var ev = findEvent_(eventId);
  if (!ev) return false;
  try {
    ev.deleteEvent();
    return true;
  } catch (e) {
    logErr_('deleteEvent_ ' + eventId, e);
    return false;
  }
}

/** Deep link to the event in the Google Calendar UI. */
function eventUrl_(eventId) {
  var id = str_(eventId).replace(/@google\.com$/, '');
  if (!id) return '';
  return 'https://calendar.google.com/calendar/u/0/r/eventedit/' +
         Utilities.base64Encode(id + ' ' + requireProp_(PROP_CALENDAR_ID))
           .replace(/=+$/, '');
}
