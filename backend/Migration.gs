/**
 * Migration.gs — one-time import of the retired Telegram bot's export.
 *
 * The export JSON is posted to migration.import; it is never committed to the
 * repo. The import is idempotent by bot id: every row written carries its
 * source id in the meta tab as 'imported_appt_<botId>' so a second run links
 * to the existing row instead of duplicating it.
 *
 * Calendar events are reused wherever the bot recorded a gcal_event_id that
 * still resolves, so the import must not double-book the family calendar.
 */

var IMPORT_PREFIX_APPT = 'imported_appt_';
var IMPORT_PREFIX_DOC  = 'imported_doc_';
var IMPORT_PREFIX_NOTE = 'imported_note_';

/** Returns the binder id already imported for this bot id, or ''. */
function importedId_(prefix, botId) {
  return metaGet_(prefix + String(botId));
}

function markImported_(prefix, botId, binderId) {
  metaSet_(prefix + String(botId), binderId);
}

/**
 * Splits the bot's 'YYYY-MM-DDTHH:MM' into date and time.
 * Falls back to 09:00 when the export carries a date with no time.
 */
function splitApptAt_(value) {
  var s = str_(value);
  return {
    date: normDate_(s),
    time: normTime_(s.split('T')[1] || '') || '09:00'
  };
}

/**
 * migration.import — body: { pin, action, data: <the export JSON>, dryRun? }
 *
 * dryRun reports what would happen without writing anything, so the counts can
 * be checked against the export before committing to the real run.
 */
function actMigrationImport_(req) {
  var data = req.data;
  if (!data || typeof data !== 'object') throw new Error('חסר גוף הייצוא (data)');
  var dryRun = req.dryRun === true;

  var appts = data.appointments || [];
  var docs  = data.documents || [];
  var notes = data.notes || [];

  var report = {
    dry_run: dryRun,
    appointments: { total: appts.length, created: 0, skipped: 0,
                    event_reused: 0, event_created: 0 },
    documents:    { total: docs.length, created: 0, skipped: 0,
                    linked: 0, general: 0, missing: 0 },
    notes:        { total: notes.length, created: 0, skipped: 0 },
    errors: []
  };

  // ---- appointments -------------------------------------------------------
  var idMap = {};   // bot appointment id -> binder appointment id
  for (var i = 0; i < appts.length; i++) {
    var a = appts[i];
    try {
      var already = importedId_(IMPORT_PREFIX_APPT, a.id);
      if (already && getRow_(TAB_APPTS, already)) {
        idMap[a.id] = already;
        report.appointments.skipped++;
        continue;
      }

      var when = splitApptAt_(a.appointment_at);
      if (!when.date) throw new Error('תאריך לא תקין בתור ' + a.id);

      var fields = {
        doctor: str_(a.doctor), specialty: str_(a.specialty),
        date: when.date, time: when.time,
        location: str_(a.location), companion: str_(a.companion)
      };
      if (!fields.doctor) fields.doctor = 'תור';

      if (dryRun) {
        report.appointments.created++;
        if (findEvent_(a.gcal_event_id)) report.appointments.event_reused++;
        else report.appointments.event_created++;
        continue;
      }

      var folder = createApptFolder_(fields);
      fields.folder_id = folder.getId();

      // the bot may have left a per-appointment note in its own field
      var seedNotes = str_(a.notes) ? [{ text: str_(a.notes) }] : [];

      // reuse the bot's calendar event when it still exists — never double-book
      var eventId;
      var existingEvent = findEvent_(a.gcal_event_id);
      if (existingEvent) {
        eventId = updateEvent_(
          { doctor: fields.doctor, specialty: fields.specialty, date: fields.date,
            time: fields.time, location: fields.location, companion: fields.companion,
            folder_id: fields.folder_id, event_id: existingEvent.getId() },
          seedNotes);
        report.appointments.event_reused++;
      } else {
        eventId = createEvent_(fields, seedNotes);
        report.appointments.event_created++;
      }

      var now = nowIso_();
      var binderId = uuid_();
      insertRow_(TAB_APPTS, {
        id: binderId, doctor: fields.doctor, specialty: fields.specialty,
        date: fields.date, time: fields.time, location: fields.location,
        companion: fields.companion, event_id: eventId, folder_id: fields.folder_id,
        created_at: str_(a.created_at) || now, updated_at: now
      });

      if (seedNotes.length) {
        insertRow_(TAB_NOTES, {
          id: uuid_(), appointment_id: binderId, text: seedNotes[0].text,
          created_at: str_(a.created_at) || now
        });
      }

      markImported_(IMPORT_PREFIX_APPT, a.id, binderId);
      idMap[a.id] = binderId;
      report.appointments.created++;
    } catch (err) {
      logErr_('import appointment ' + a.id, err);
      report.errors.push('תור ' + a.id + ': ' + (err && err.message ? err.message : err));
    }
  }

  // ---- documents ----------------------------------------------------------
  // The bot lost the Drive files, so every document arrives as a placeholder
  // row with status 'missing'. The user re-uploads from Telegram through the
  // site, and documents.upload with replaceId fills the row in.
  for (var j = 0; j < docs.length; j++) {
    var d = docs[j];
    try {
      var doneDoc = importedId_(IMPORT_PREFIX_DOC, d.id);
      if (doneDoc && getRow_(TAB_DOCS, doneDoc)) {
        report.documents.skipped++;
        continue;
      }

      var links = d.appointment_ids || [];
      var apptBinderId = links.length ? str_(idMap[links[0]] || '') : '';
      if (apptBinderId) report.documents.linked++; else report.documents.general++;

      var hasFile = !!str_(d.drive_file_id);
      if (!hasFile) report.documents.missing++;

      if (dryRun) { report.documents.created++; continue; }

      var docId = uuid_();
      insertRow_(TAB_DOCS, {
        id: docId,
        appointment_id: apptBinderId,
        file_id: str_(d.drive_file_id),
        file_name: str_(d.original_filename),
        mime: '',
        size: '',
        description: str_(d.description),
        web_view_link: str_(d.drive_url),
        status: hasFile ? 'ok' : 'missing',
        uploaded_at: str_(d.created_at) || nowIso_()
      });
      markImported_(IMPORT_PREFIX_DOC, d.id, docId);
      report.documents.created++;
    } catch (err2) {
      logErr_('import document ' + d.id, err2);
      report.errors.push('מסמך ' + d.id + ': ' + (err2 && err2.message ? err2.message : err2));
    }
  }

  // ---- standalone notes ---------------------------------------------------
  // The bot's loose notes have no appointment; they are kept with an empty
  // appointment_id so nothing from the old system is silently dropped.
  for (var k = 0; k < notes.length; k++) {
    var n = notes[k];
    try {
      var doneNote = importedId_(IMPORT_PREFIX_NOTE, n.id);
      if (doneNote && getRow_(TAB_NOTES, doneNote)) { report.notes.skipped++; continue; }
      if (dryRun) { report.notes.created++; continue; }

      var noteId = uuid_();
      insertRow_(TAB_NOTES, {
        id: noteId, appointment_id: '', text: str_(n.content),
        created_at: str_(n.created_at) || nowIso_()
      });
      markImported_(IMPORT_PREFIX_NOTE, n.id, noteId);
      report.notes.created++;
    } catch (err3) {
      logErr_('import note ' + n.id, err3);
      report.errors.push('הערה ' + n.id + ': ' + (err3 && err3.message ? err3.message : err3));
    }
  }

  if (!dryRun) metaSet_('migration_done_at', nowIso_());
  return report;
}

/** Counts what is currently in the binder, for verifying the import. */
function actMigrationStatus_() {
  var docs = readAll_(TAB_DOCS);
  var missing = docs.filter(function (d) { return d.status === 'missing'; }).length;
  return {
    appointments: readAll_(TAB_APPTS).length,
    documents: docs.length,
    documents_missing: missing,
    documents_ok: docs.length - missing,
    notes: readAll_(TAB_NOTES).length,
    migration_done_at: metaGet_('migration_done_at')
  };
}
