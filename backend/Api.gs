/**
 * Api.gs — the web app entry points.
 *
 * Transport notes that are easy to get wrong:
 *  - The client posts JSON as text/plain. Apps Script never answers OPTIONS,
 *    so any content-type that triggers a CORS preflight would fail outright.
 *  - /exec answers 302 to googleusercontent; clients must follow redirects.
 *  - Responses are always HTTP 200 with {ok:false,error} inside — an error
 *    status would surface to the browser as an opaque CORS failure.
 */

function doGet() {
  return json_({ ok: true, version: VERSION, time: nowIso_() });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return json_({ ok: false, error: 'bad_request' });
  }

  try {
    if (str_(req.pin) !== requireProp_(PROP_PIN, 'הגדר Script Property בשם PIN')) {
      return json_({ ok: false, error: 'unauthorized' });
    }
  } catch (authErr) {
    logErr_('auth', authErr);
    return json_({ ok: false, error: 'server_not_configured' });
  }

  var action = str_(req.action);
  var handler = ACTIONS[action];
  if (!handler) return json_({ ok: false, error: 'unknown_action: ' + action });

  var needsLock = action !== 'bootstrap';
  var lock = null;
  try {
    if (needsLock) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) return json_({ ok: false, error: 'busy' });
    }
    return json_({ ok: true, data: handler(req) });
  } catch (err) {
    logErr_('action ' + action, err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================== action table

var ACTIONS = {
  'bootstrap':           actBootstrap_,
  'appointments.create': actApptCreate_,
  'appointments.update': actApptUpdate_,
  'appointments.delete': actApptDelete_,
  'notes.add':           actNoteAdd_,
  'notes.delete':        actNoteDelete_,
  'documents.upload':    actDocUpload_,
  'documents.update':    actDocUpdate_,
  'documents.delete':    actDocDelete_,
  'migration.import':    actMigrationImport_,
  'migration.status':    actMigrationStatus_,
  'diagnose':            actDiagnose_
};

/** Read-only counts used to verify the migration. Writes nothing. */
function actDiagnose_() {
  return {
    calendar: countCalendarEvents(),
    rows: countBinderRows(),
    folders: countApptFolders()
  };
}

// ------------------------------------------------------------------ reading

function actBootstrap_() {
  var appts = readAll_(TAB_APPTS);
  var docs = readAll_(TAB_DOCS);
  var notes = readAll_(TAB_NOTES);

  appts.sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
  notes.sort(function (a, b) {
    return str_(a.created_at).localeCompare(str_(b.created_at));
  });
  docs.sort(function (a, b) {
    return str_(b.uploaded_at).localeCompare(str_(a.uploaded_at));
  });

  return {
    appointments: appts,
    documents: docs,
    notes: notes,
    meta: { schema_version: metaGet_('schema_version'), server_time: nowIso_() }
  };
}

// ------------------------------------------------------------- appointments

/** Picks only the fields a client is allowed to set on an appointment. */
function apptFields_(req) {
  return {
    doctor:    str_(req.doctor),
    specialty: str_(req.specialty),
    date:      normDate_(req.date),
    time:      normTime_(req.time),
    location:  str_(req.location),
    companion: str_(req.companion)
  };
}

/**
 * Order matters: folder → event → row. If the row write fails the projections
 * are rolled back, so a half-created appointment never survives.
 */
function actApptCreate_(req) {
  var f = apptFields_(req);
  if (!f.doctor) throw new Error('חסר שם רופא/מכון');
  if (!f.date) throw new Error('חסר תאריך');
  if (!f.time) throw new Error('חסרה שעה');

  var id = uuid_();
  var firstNote = str_(req.firstNote);
  var noteList = firstNote ? [{ text: firstNote }] : [];

  var folder = null, eventId = '';
  try {
    folder = createApptFolder_(f);
    var withFolder = {
      doctor: f.doctor, specialty: f.specialty, date: f.date, time: f.time,
      location: f.location, companion: f.companion, folder_id: folder.getId()
    };
    eventId = createEvent_(withFolder, noteList);

    var now = nowIso_();
    var row = {
      id: id, doctor: f.doctor, specialty: f.specialty, date: f.date, time: f.time,
      location: f.location, companion: f.companion,
      event_id: eventId, folder_id: folder.getId(),
      created_at: now, updated_at: now
    };
    insertRow_(TAB_APPTS, row);

    if (firstNote) {
      insertRow_(TAB_NOTES, {
        id: uuid_(), appointment_id: id, text: firstNote, created_at: now
      });
    }
    return { appointment: row, notes: notesFor_(id) };
  } catch (err) {
    // roll back the projections so no orphan event/folder is left behind
    if (eventId) { try { deleteEvent_(eventId); } catch (e2) { logErr_('rollback event', e2); } }
    if (folder) { try { folder.setTrashed(true); } catch (e3) { logErr_('rollback folder', e3); } }
    throw err;
  }
}

function actApptUpdate_(req) {
  var id = str_(req.id);
  var existing = getRow_(TAB_APPTS, id);
  if (!existing) throw new Error('התור לא נמצא');

  var patch = {};
  ['doctor', 'specialty', 'location', 'companion'].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(req, k)) patch[k] = str_(req[k]);
  });
  if (Object.prototype.hasOwnProperty.call(req, 'date')) {
    patch.date = normDate_(req.date);
    if (!patch.date) throw new Error('תאריך לא תקין');
  }
  if (Object.prototype.hasOwnProperty.call(req, 'time')) {
    patch.time = normTime_(req.time);
    if (!patch.time) throw new Error('שעה לא תקינה');
  }
  patch.updated_at = nowIso_();

  var updated = updateRow_(TAB_APPTS, id, patch);
  var notes = notesFor_(id);

  renameApptFolder_(updated.folder_id, updated);
  var newEventId = updateEvent_(updated, notes);
  if (newEventId && newEventId !== updated.event_id) {
    updated = updateRow_(TAB_APPTS, id, { event_id: newEventId });
  }
  return { appointment: updated, notes: notes };
}

/**
 * Deleting an appointment removes the row and the calendar event, but the
 * documents survive: the folder moves to the archive and the document rows
 * keep pointing at the old appointment id as history.
 */
function actApptDelete_(req) {
  var id = str_(req.id);
  var existing = getRow_(TAB_APPTS, id);
  if (!existing) throw new Error('התור לא נמצא');

  var eventDeleted = deleteEvent_(existing.event_id);
  var archived = archiveApptFolder_(existing.folder_id);
  deleteRow_(TAB_APPTS, id);

  return { id: id, event_deleted: eventDeleted, folder_archived: archived };
}

// -------------------------------------------------------------------- notes

function notesFor_(apptId) {
  return readAll_(TAB_NOTES)
    .filter(function (n) { return n.appointment_id === String(apptId); })
    .sort(function (a, b) { return str_(a.created_at).localeCompare(str_(b.created_at)); });
}

function actNoteAdd_(req) {
  var apptId = str_(req.appointmentId);
  var text = str_(req.text);
  if (!text) throw new Error('הערה ריקה');
  var appt = getRow_(TAB_APPTS, apptId);
  if (!appt) throw new Error('התור לא נמצא');

  var note = { id: uuid_(), appointment_id: apptId, text: text, created_at: nowIso_() };
  insertRow_(TAB_NOTES, note);

  var notes = notesFor_(apptId);
  updateEvent_(appt, notes);   // keep the calendar description in sync
  return { note: note, notes: notes };
}

/**
 * Removes one note. The calendar description is rebuilt from what is left, so
 * a note deleted here also disappears from the event.
 */
function actNoteDelete_(req) {
  var id = str_(req.id);
  var note = getRow_(TAB_NOTES, id);
  if (!note) throw new Error('ההערה לא נמצאה');

  deleteRow_(TAB_NOTES, id);

  var apptId = str_(note.appointment_id);
  var notes = apptId ? notesFor_(apptId) : [];
  if (apptId) {
    var appt = getRow_(TAB_APPTS, apptId);
    if (appt) updateEvent_(appt, notes);
  }
  return { id: id, notes: notes };
}

// ---------------------------------------------------------------- documents

/**
 * Uploads one file. An empty appointmentId stores it under the general folder.
 * replaceId fills in a placeholder row left by the migration (status=missing).
 */
function actDocUpload_(req) {
  var apptId = str_(req.appointmentId);
  var base64 = str_(req.base64);
  if (!base64) throw new Error('לא התקבל קובץ');

  var folder, appt = null;
  if (apptId) {
    appt = getRow_(TAB_APPTS, apptId);
    if (!appt) throw new Error('התור לא נמצא');
    folder = str_(appt.folder_id) ? folderById_(appt.folder_id) : createApptFolder_(appt);
    if (!str_(appt.folder_id)) updateRow_(TAB_APPTS, apptId, { folder_id: folder.getId() });
  } else {
    folder = generalFolder_();
  }

  var saved = saveFile_(folder, str_(req.fileName), str_(req.mimeType), base64);
  var replaceId = str_(req.replaceId);

  if (replaceId) {
    var placeholder = getRow_(TAB_DOCS, replaceId);
    if (placeholder) {
      var merged = updateRow_(TAB_DOCS, replaceId, {
        file_id: saved.file_id, file_name: saved.file_name, mime: saved.mime,
        size: saved.size, web_view_link: saved.web_view_link,
        status: 'ok', uploaded_at: nowIso_(),
        description: Object.prototype.hasOwnProperty.call(req, 'description')
          ? str_(req.description) : placeholder.description
      });
      return { document: merged, replaced: replaceId };
    }
  }

  var row = {
    id: uuid_(), appointment_id: apptId, file_id: saved.file_id,
    file_name: saved.file_name, mime: saved.mime, size: saved.size,
    description: str_(req.description), web_view_link: saved.web_view_link,
    status: 'ok', uploaded_at: nowIso_()
  };
  insertRow_(TAB_DOCS, row);
  return { document: row };
}

function actDocUpdate_(req) {
  var id = str_(req.id);
  if (!getRow_(TAB_DOCS, id)) throw new Error('המסמך לא נמצא');
  return { document: updateRow_(TAB_DOCS, id, { description: str_(req.description) }) };
}

/** Only for a file uploaded by mistake — it trashes the Drive file too. */
function actDocDelete_(req) {
  var id = str_(req.id);
  var doc = getRow_(TAB_DOCS, id);
  if (!doc) throw new Error('המסמך לא נמצא');
  var trashed = trashFile_(doc.file_id);
  deleteRow_(TAB_DOCS, id);
  return { id: id, file_trashed: trashed };
}
