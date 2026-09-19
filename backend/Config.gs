/**
 * Config.gs — constants, script properties, shared helpers.
 * family-binder backend. All state lives in the Sheet; this file holds no data.
 */

var VERSION = 'v1';
var SCHEMA_VERSION = '1';

var TZ = 'Asia/Jerusalem';

/** Script Property keys. Set in Project Settings → Script Properties. */
var PROP_PIN            = 'PIN';               // set by the user, never in code
var PROP_SHEET_ID       = 'SHEET_ID';          // written by setup()
var PROP_ROOT_FOLDER    = 'ROOT_FOLDER_ID';    // set by the user before setup()
var PROP_CALENDAR_ID    = 'CALENDAR_ID';       // set by the user before setup()

/** Drive sub-folder names under the root folder. */
var FOLDER_APPTS   = 'תורים';
var FOLDER_GENERAL = 'כללי';
var FOLDER_ARCHIVE = 'ארכיון';

/** Sheet tab names. */
var TAB_APPTS = 'appointments';
var TAB_DOCS  = 'documents';
var TAB_NOTES = 'notes';
var TAB_META  = 'meta';

/** Column order per tab — the single source of truth for read and write. */
var COLS = {
  appointments: ['id', 'doctor', 'specialty', 'date', 'time', 'location', 'companion',
                 'event_id', 'folder_id', 'created_at', 'updated_at'],
  documents:    ['id', 'appointment_id', 'file_id', 'file_name', 'mime', 'size',
                 'description', 'web_view_link', 'status', 'uploaded_at'],
  notes:        ['id', 'appointment_id', 'text', 'created_at'],
  meta:         ['key', 'value']
};

/** Max upload size accepted from the client, in bytes (decoded). */
var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Ceiling for reading a file back out (documents.fetch). Base64 inflates the
 *  response by ~4/3 and Apps Script caps the response well below the upload
 *  limit, so this is deliberately much smaller. */
var MAX_FETCH_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------- properties

function props_() {
  return PropertiesService.getScriptProperties();
}

function prop_(key) {
  var v = props_().getProperty(key);
  return v === null ? '' : String(v).trim();
}

function requireProp_(key, hint) {
  var v = prop_(key);
  if (!v) {
    throw new Error('חסר Script Property: ' + key + (hint ? ' — ' + hint : ''));
  }
  return v;
}

// ---------------------------------------------------------------- utilities

function uuid_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Normalizes an incoming date to YYYY-MM-DD, or '' when unparseable. */
function normDate_(v) {
  var s = str_(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

/** Normalizes an incoming time to HH:MM (24h), or '' when unparseable. */
function normTime_(v) {
  var s = str_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  var h = Number(m[1]);
  if (h < 0 || h > 23) return '';
  return (h < 10 ? '0' + h : String(h)) + ':' + m[2];
}

/** Builds a Date in the script timezone from 'YYYY-MM-DD' + 'HH:MM'. */
function toDate_(dateStr, timeStr) {
  var d = normDate_(dateStr);
  var t = normTime_(timeStr) || '09:00';
  if (!d) throw new Error('תאריך לא תקין');
  var p = d.split('-').map(Number);
  var q = t.split(':').map(Number);
  return new Date(p[0], p[1] - 1, p[2], q[0], q[1], 0, 0);
}

/** Sanitizes a string for use as a Drive folder name. */
function safeName_(s) {
  return str_(s).replace(/[\/\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function logErr_(context, err) {
  console.error(context + ': ' + (err && err.stack ? err.stack : err));
}
