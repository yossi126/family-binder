/**
 * Sheet.gs — the master store. Every tab is a flat table whose column order
 * comes from COLS. All cells are plain text: the tabs are formatted as '@' so
 * Sheets never reinterprets '2026-10-04' as a date or '08:30' as a duration.
 */

function ss_() {
  return SpreadsheetApp.openById(requireProp_(PROP_SHEET_ID, 'הרץ setup() פעם אחת'));
}

function tab_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('חסר טאב בגיליון: ' + name);
  return sh;
}

/**
 * Reads a whole tab as objects. Uses getDisplayValues so text stays text.
 * Returns [] for an empty tab (header row only).
 */
function readAll_(tabName) {
  var sh = tab_(tabName);
  var last = sh.getLastRow();
  var cols = COLS[tabName];
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!str_(row[0])) continue; // skip blank rows left by deletions
    var obj = {};
    for (var c = 0; c < cols.length; c++) obj[cols[c]] = str_(row[c]);
    out.push(obj);
  }
  return out;
}

/**
 * Appends one object as a row, in COLS order.
 *
 * Deliberately not appendRow: that ignores the column format and lets Sheets
 * reinterpret the value, which turns '08:30' into '8:30' and an ISO date into
 * a locale date. Writing into an explicitly text-formatted range keeps every
 * cell exactly as sent.
 */
function insertRow_(tabName, obj) {
  var sh = tab_(tabName);
  var cols = COLS[tabName];
  var row = cols.map(function (c) { return obj[c] === undefined ? '' : String(obj[c]); });
  var range = sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  return obj;
}

/** Finds the 1-based sheet row number whose `id` column matches, or 0. */
function findRowNum_(tabName, id) {
  var sh = tab_(tabName);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (str_(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

/** Patches named fields of one row. Returns the full updated object. */
function updateRow_(tabName, id, patch) {
  var sh = tab_(tabName);
  var cols = COLS[tabName];
  var rowNum = findRowNum_(tabName, id);
  if (!rowNum) throw new Error('לא נמצאה שורה: ' + tabName + '/' + id);

  var range = sh.getRange(rowNum, 1, 1, cols.length);
  var current = range.getDisplayValues()[0];
  var obj = {};
  for (var c = 0; c < cols.length; c++) {
    var key = cols[c];
    obj[key] = Object.prototype.hasOwnProperty.call(patch, key)
      ? str_(patch[key])
      : str_(current[c]);
  }
  range.setNumberFormat('@');
  range.setValues([cols.map(function (c2) { return obj[c2]; })]);
  return obj;
}

function deleteRow_(tabName, id) {
  var rowNum = findRowNum_(tabName, id);
  if (!rowNum) return false;
  tab_(tabName).deleteRow(rowNum);
  return true;
}

function getRow_(tabName, id) {
  var all = readAll_(tabName);
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}

// ---------------------------------------------------------------- meta tab

function metaAll_() {
  var rows = readAll_(TAB_META);
  var out = {};
  for (var i = 0; i < rows.length; i++) out[rows[i].key] = rows[i].value;
  return out;
}

function metaGet_(key) {
  var rows = readAll_(TAB_META);
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i].value;
  return '';
}

function metaSet_(key, value) {
  var sh = tab_(TAB_META);
  var last = sh.getLastRow();
  if (last >= 2) {
    var keys = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (str_(keys[i][0]) === key) {
        sh.getRange(i + 2, 2).setValue(String(value));
        return;
      }
    }
  }
  var range = sh.getRange(sh.getLastRow() + 1, 1, 1, 2);
  range.setNumberFormat('@');
  range.setValues([[key, String(value)]]);
}
