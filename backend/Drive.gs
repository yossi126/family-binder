/**
 * Drive.gs — document storage. The root folder already exists and holds files
 * from before this project; setup() only adds three sub-folders under it and
 * never touches anything that was already there.
 */

function rootFolder_() {
  return DriveApp.getFolderById(requireProp_(PROP_ROOT_FOLDER, 'מזהה תיקיית הדרייב הקיימת'));
}

function folderById_(id) {
  return DriveApp.getFolderById(id);
}

/** Returns the existing child folder by name, or creates it. Idempotent. */
function ensureChildFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName() === name) return f;
  }
  return parent.createFolder(name);
}

function apptsFolder_()   { return folderById_(metaGet_('appts_folder_id')); }
function generalFolder_() { return folderById_(metaGet_('general_folder_id')); }
function archiveFolder_() { return folderById_(metaGet_('archive_folder_id')); }

/** Folder name for an appointment: "2026-10-04 – doctor – specialty". */
function apptFolderName_(appt) {
  var parts = [normDate_(appt.date), safeName_(appt.doctor)];
  if (str_(appt.specialty)) parts.push(safeName_(appt.specialty));
  return parts.filter(function (p) { return !!p; }).join(' – ');
}

function createApptFolder_(appt) {
  return apptsFolder_().createFolder(apptFolderName_(appt));
}

/** Renames the folder to match the current row. Silent when the folder is gone. */
function renameApptFolder_(folderId, appt) {
  if (!str_(folderId)) return;
  try {
    var f = folderById_(folderId);
    var want = apptFolderName_(appt);
    if (f.getName() !== want) f.setName(want);
  } catch (e) {
    logErr_('renameApptFolder_ ' + folderId, e);
  }
}

/**
 * Moves an appointment folder into ארכיון/ instead of deleting it.
 * Documents are never destroyed with an appointment.
 */
function archiveApptFolder_(folderId) {
  if (!str_(folderId)) return false;
  try {
    folderById_(folderId).moveTo(archiveFolder_());
    return true;
  } catch (e) {
    logErr_('archiveApptFolder_ ' + folderId, e);
    return false;
  }
}

function folderUrl_(folderId) {
  return str_(folderId) ? 'https://drive.google.com/drive/folders/' + folderId : '';
}

/**
 * Writes one uploaded file. `base64` is the raw file bytes, already stripped of
 * any data: URI prefix by the caller.
 */
function saveFile_(folder, fileName, mimeType, base64) {
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('הקובץ גדול מדי (מעל 20MB)');
  }
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName_(fileName) || 'file');
  var file = folder.createFile(blob);
  return {
    file_id: file.getId(),
    file_name: file.getName(),
    mime: file.getMimeType(),
    size: String(file.getSize()),
    web_view_link: file.getUrl()
  };
}

/**
 * Reads one file back as base64 so the site can hand the real bytes to the
 * share sheet instead of a Drive link. Apps Script has to hold the whole
 * payload in memory and base64 inflates it by ~4/3, so anything above
 * MAX_FETCH_BYTES is refused and the caller falls back to the link.
 */
function readFile_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var size = Number(file.getSize());
  if (size > MAX_FETCH_BYTES) {
    var err = new Error('too_large_to_fetch');
    err.tooLarge = true;
    throw err;
  }
  var blob = file.getBlob();
  return {
    file_name: file.getName(),
    mime: blob.getContentType() || file.getMimeType(),
    size: String(size),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function trashFile_(fileId) {
  if (!str_(fileId)) return false;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (e) {
    logErr_('trashFile_ ' + fileId, e);
    return false;
  }
}
