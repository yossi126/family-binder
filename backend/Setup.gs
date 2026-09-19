/**
 * Setup.gs — run setup() once from the Apps Script editor.
 *
 * Before running, set these Script Properties (Project Settings → Script Properties):
 *   ROOT_FOLDER_ID  — the existing Drive folder that holds the documents
 *   CALENDAR_ID     — the existing family calendar
 *   PIN             — chosen by the user; never stored in this repo
 *
 * setup() is idempotent: run it again after a change and it repairs what is
 * missing without duplicating anything.
 */
function setup() {
  var root = rootFolder_();             // throws early if ROOT_FOLDER_ID is wrong
  var cal = calendar_();                // throws early if CALENDAR_ID is wrong
  var report = { sheet: '', created: [], reused: [] };

  // ---- 1. spreadsheet -----------------------------------------------------
  var sheetId = prop_(PROP_SHEET_ID);
  var ss;
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
      report.reused.push('גיליון');
    } catch (e) {
      sheetId = '';
    }
  }
  if (!sheetId) {
    ss = SpreadsheetApp.create('family-binder-data');
    sheetId = ss.getId();
    props_().setProperty(PROP_SHEET_ID, sheetId);
    // keep the data file next to the documents
    DriveApp.getFileById(sheetId).moveTo(root);
    report.created.push('גיליון');
  }
  report.sheet = sheetId;

  // ---- 2. tabs ------------------------------------------------------------
  [TAB_APPTS, TAB_DOCS, TAB_NOTES, TAB_META].forEach(function (name) {
    ensureTab_(ss, name, report);
  });

  // Apps Script always creates a default 'Sheet1'; drop it once ours exist.
  var extra = ss.getSheetByName('Sheet1') || ss.getSheetByName('גיליון1');
  if (extra && ss.getSheets().length > 1) ss.deleteSheet(extra);

  // ---- 3. drive sub-folders ----------------------------------------------
  var folders = {
    appts_folder_id:   ensureChildFolder_(root, FOLDER_APPTS),
    general_folder_id: ensureChildFolder_(root, FOLDER_GENERAL),
    archive_folder_id: ensureChildFolder_(root, FOLDER_ARCHIVE)
  };

  // ---- 4. meta ------------------------------------------------------------
  metaSet_('schema_version', SCHEMA_VERSION);
  metaSet_('root_folder_id', root.getId());
  metaSet_('calendar_id', cal.getId());
  Object.keys(folders).forEach(function (k) { metaSet_(k, folders[k].getId()); });

  var out = [
    'setup הושלם.',
    'גיליון: ' + ss.getUrl(),
    'נוצר: ' + (report.created.join(', ') || 'כלום (הכול כבר היה קיים)'),
    'קיים מקודם: ' + (report.reused.join(', ') || '—'),
    'PIN מוגדר: ' + (prop_(PROP_PIN) ? 'כן' : 'לא — יש להוסיף Script Property בשם PIN')
  ].join('\n');
  console.log(out);
  return out;
}

/** Creates the tab with its header row, or repairs a missing header. */
function ensureTab_(ss, name, report) {
  var cols = COLS[name];
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (report) report.created.push(name);
  } else if (report) {
    report.reused.push(name);
  }
  // force every column to plain text so Sheets never reformats ISO dates
  sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  var header = sh.getRange(1, 1, 1, cols.length);
  var current = header.getDisplayValues()[0];
  if (current.join('|') !== cols.join('|')) {
    header.setValues([cols]);
  }
  header.setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/** Convenience: prints the ids setup() recorded, for pasting into docs. */
function showConfig() {
  var m = metaAll_();
  var out = [
    'SHEET_ID: ' + prop_(PROP_SHEET_ID),
    'schema_version: ' + (m.schema_version || '-'),
    'appts_folder_id: ' + (m.appts_folder_id || '-'),
    'general_folder_id: ' + (m.general_folder_id || '-'),
    'archive_folder_id: ' + (m.archive_folder_id || '-'),
    'PIN set: ' + (prop_(PROP_PIN) ? 'yes' : 'NO')
  ].join('\n');
  console.log(out);
  return out;
}
