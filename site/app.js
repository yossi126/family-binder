/**
 * app.js — state, rendering and events.
 *
 * The server is the only source of truth: no optimistic updates. Every write
 * re-renders from what the server returned, so the screen can never disagree
 * with the Sheet. The last bootstrap is cached in localStorage purely so the
 * app paints instantly on a phone before the network answers.
 */
(function () {
  'use strict';

  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  var $ = function (s) { return document.querySelector(s); };

  // ------------------------------------------------------------------ dates

  var today = new Date(); today.setHours(0, 0, 0, 0);

  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function addDays(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d; }
  function parseISO(s) {
    var p = String(s || '').split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  function fmtDate(s) {
    var d = parseISO(s);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function dayDiff(s) { return Math.round((parseISO(s) - today) / 86400000); }

  /** Server timestamps are 'YYYY-MM-DDTHH:MM:SS' or 'YYYY-MM-DD HH:MM:SS'. */
  function fmtStamp(s) {
    var datePart = String(s || '').slice(0, 10);
    return datePart ? fmtDate(datePart) : '';
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  function fmtSize(bytes) {
    var n = Number(bytes);
    if (!n) return '';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  /**
   * A stable hue per specialty so the date tile of every appointment can be
   * read by kind before the title is. Seven muted hues, spread around the
   * wheel; the same specialty string always lands on the same one.
   */
  var SPEC_HUES = [210, 262, 340, 25, 145, 190, 300];
  function specHue(specialty) {
    var s = String(specialty || '').trim();
    if (!s) return 210;
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return SPEC_HUES[h % SPEC_HUES.length];
  }
  function specStyle(specialty) { return ' style="--spec-h:' + specHue(specialty) + '"'; }

  // ------------------------------------------------------------------ state

  var state = {
    appointments: [],
    documents: [],
    notes: [],
    filter: 'upcoming',
    q: '',
    selected: null,
    view: 'appts',
    editing: null,
    uploadTarget: null,
    replaceDoc: null,
    pendingUploads: [],   // rows rendered while a file is in flight
    loading: false
  };

  var el = {};

  // ------------------------------------------------------------------ icons

  var I = {
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    doc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    trashSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    open: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    person: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
  };

  // --------------------------------------------------------------- feedback

  var toastTimer = null;
  function toast(msg) {
    el.toast.querySelector('span').textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2600);
  }

  function banner(msg) {
    if (!msg) { el.banner.hidden = true; return; }
    el.bannerText.textContent = msg;
    el.banner.hidden = false;
  }

  /** Disables a button and shows a spinner for the duration of a promise. */
  function busy(btn, promise) {
    if (!btn) return promise;
    btn.setAttribute('aria-busy', 'true');
    return promise.finally(function () { btn.removeAttribute('aria-busy'); });
  }

  var isDesktop = function () { return matchMedia('(min-width:900px)').matches; };

  // ---------------------------------------------------------------- lookups

  function byId(id) {
    for (var i = 0; i < state.appointments.length; i++) {
      if (state.appointments[i].id === id) return state.appointments[i];
    }
    return null;
  }
  function docsFor(apptId) {
    var out = state.documents.filter(function (d) { return d.appointment_id === apptId; });
    return out.concat(state.pendingUploads.filter(function (p) { return p.appointment_id === apptId; }));
  }
  function generalDocs() {
    var out = state.documents.filter(function (d) { return !d.appointment_id; });
    return out.concat(state.pendingUploads.filter(function (p) { return !p.appointment_id; }));
  }
  function notesFor(apptId) {
    return state.notes.filter(function (n) { return n.appointment_id === apptId; });
  }

  function relPill(dateStr) {
    var n = dayDiff(dateStr);
    if (n === 0) return '<span class="pill today">היום</span>';
    if (n === 1) return '<span class="pill today">מחר</span>';
    if (n > 1 && n <= 7) return '<span class="pill soon">בעוד ' + n + ' ימים</span>';
    return '';
  }

  function filtered() {
    var q = state.q.trim();
    var ym = function (d) { return String(d).slice(0, 7); };
    var thisYm = iso(today).slice(0, 7);
    var nextYm = iso(new Date(today.getFullYear(), today.getMonth() + 1, 1)).slice(0, 7);

    var list = state.appointments.filter(function (a) {
      if (q && (a.doctor + ' ' + a.specialty + ' ' + a.location).indexOf(q) < 0) return false;
      switch (state.filter) {
        case 'upcoming':  return dayDiff(a.date) >= 0;
        case 'month':     return ym(a.date) === thisYm;
        case 'nextmonth': return ym(a.date) === nextYm;
        case 'past':      return dayDiff(a.date) < 0;
        default:          return true;
      }
    });
    list.sort(function (a, b) {
      return (a.date + a.time).localeCompare(b.date + b.time);
    });
    if (state.filter === 'past') list.reverse();
    return list;
  }

  // ------------------------------------------------------------- rendering

  function renderAgenda() {
    if (state.loading && !state.appointments.length) {
      el.agenda.innerHTML = '<div class="skeleton"><i></i><i></i><i></i></div>';
      return;
    }
    var list = filtered();
    if (!list.length) {
      el.agenda.innerHTML = '<div class="empty"><strong>אין תורים להצגה</strong>' +
        (state.q ? 'נסה חיפוש אחר' : 'לחץ על + כדי להוסיף תור') + '</div>';
      return;
    }

    var groups = [];
    var index = {};
    list.forEach(function (a) {
      var k = String(a.date).slice(0, 7);
      if (!index[k]) { index[k] = []; groups.push([k, index[k]]); }
      index[k].push(a);
    });

    var html = '';
    groups.forEach(function (pair) {
      var parts = pair[0].split('-');
      var items = pair[1];
      html += '<h2 class="month"><span>' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0] +
        '</span><small>' + items.length + ' ' + (items.length === 1 ? 'תור' : 'תורים') +
        '</small></h2><div class="cards">';

      items.forEach(function (a) {
        var d = parseISO(a.date);
        var n = dayDiff(a.date);
        var ds = docsFor(a.id);
        var nd = ds.length;
        var nMissing = ds.filter(function (x) { return x.status === 'missing'; }).length;
        var cls = ['card', n < 0 ? 'past' : '', n === 0 ? 'today' : ''].join(' ').trim();
        html += '<button type="button" class="' + cls + '" data-id="' + esc(a.id) +
          '" aria-current="' + (state.selected === a.id) + '"' + specStyle(a.specialty) + '>' +
          '<span class="date-block"><span class="day">' + d.getDate() +
          '</span><span class="wd">' + DAYS[d.getDay()] + '</span></span>' +
          '<span class="card-body">' +
          '<span class="row1"><span class="time">' + esc(a.time) + '</span>' + relPill(a.date) + '</span>' +
          '<span class="title" style="display:block">' + esc(a.doctor) +
          (a.specialty ? ' · ' + esc(a.specialty) : '') + '</span>' +
          '<span class="meta">' + I.pin +
          '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(a.location || '—') + '</span></span>' +
          '<span class="meta">' + I.doc + '<span class="count' + (nMissing ? ' has-missing' : '') + '">' +
          (nMissing ? nMissing + ' ' + (nMissing === 1 ? 'מסמך חסר' : 'מסמכים חסרים')
                    : nd ? nd + ' ' + (nd === 1 ? 'מסמך' : 'מסמכים') : 'אין מסמכים') + '</span>' +
          (a.companion ? '<span>·</span>' + I.person + '<span>' + esc(a.companion) + '</span>' : '') +
          '</span></span><span class="chev">' + I.chev + '</span></button>';
      });
      html += '</div>';
    });
    el.agenda.innerHTML = html;
  }

  /** One document row. Handles stored, placeholder, in-flight and failed rows. */
  function docRow(d) {
    if (d.pending) {
      return '<li class="doc' + (d.error ? ' failed' : '') + '" data-doc="' + esc(d.id) + '">' +
        '<span class="doc-icon">' + (d.error ? '!' : '…') + '</span>' +
        '<div class="doc-main"><div class="doc-name">' + esc(d.file_name) + '</div>' +
        (d.error
          ? '<div class="doc-sub error">' + esc(d.error) + '</div>'
          : '<div class="progress"><i style="transform:scaleX(' + ((d.progress || 10) / 100) + ')"></i></div>' +
            '<div class="doc-sub uploading-hint">מעלה לדרייב…</div>') +
        '</div><div class="doc-actions">' +
        (d.error ? '<button type="button" class="btn small" data-act="dismiss-failed">הסר</button>' : '') +
        '</div></li>';
    }

    if (d.status === 'missing') {
      return '<li class="doc" data-doc="' + esc(d.id) + '">' +
        '<span class="doc-icon missing">!</span>' +
        '<div class="doc-main"><div class="doc-name">' + esc(d.description || 'מסמך ללא תיאור') + '</div>' +
        '<div class="doc-sub">חסר קובץ — הועבר מהבוט, יש להעלות מחדש</div></div>' +
        '<div class="doc-actions"><button type="button" class="btn small" data-act="upload-missing">' +
        I.upload + ' העלה</button></div></li>';
    }

    var isPdf = String(d.mime).indexOf('pdf') >= 0;
    var kind = isPdf ? 'pdf' : 'img';
    var label = isPdf ? 'PDF' : 'IMG';
    var sub = [];
    if (d.description) sub.push(esc(d.description));
    if (d.uploaded_at) sub.push('הועלה ' + fmtStamp(d.uploaded_at));
    if (d.size) sub.push(fmtSize(d.size));

    return '<li class="doc" data-doc="' + esc(d.id) + '">' +
      '<span class="doc-icon ' + kind + '">' + label + '</span>' +
      '<div class="doc-main"><div class="doc-name">' + esc(d.file_name) + '</div>' +
      '<div class="doc-sub">' + sub.join(' · ') + '</div></div>' +
      '<div class="doc-actions">' +
      '<button type="button" class="iconbtn" data-act="open" title="פתח את המסמך" aria-label="פתח את המסמך">' + I.open + '</button>' +
      shareBtnHtml(d.id) +
      '<button type="button" class="iconbtn danger" data-act="delete-doc" title="מחק" aria-label="מחק מסמך">' + I.trashSmall + '</button>' +
      '</div></li>';
  }

  /**
   * The share button renders from the cache, so a re-render never disarms a
   * file that was already fetched (which would cost a pointless second trip).
   */
  function shareBtnHtml(id) {
    var ready = !!docCache[id];
    var label = ready ? 'שתף עכשיו' : 'שתף את הקובץ';
    return '<button type="button" class="iconbtn' + (ready ? ' is-ready' : '') +
      '" data-act="share" title="' + label + '" aria-label="' + label + '">' + I.share + '</button>';
  }

  function renderDetail() {
    var a = byId(state.selected);
    if (!a) {
      el.detail.classList.remove('open');
      el.detailContent.innerHTML = '';
      return;
    }
    var d = parseISO(a.date);
    var n = dayDiff(a.date);
    var ds = docsFor(a.id);
    var ns = notesFor(a.id);
    var when = 'יום ' + DAYS[d.getDay()] + ', ' + fmtDate(a.date) + ' · ' + esc(a.time);
    var folderUrl = a.folder_id ? 'https://drive.google.com/drive/folders/' + encodeURIComponent(a.folder_id) : '';

    el.detailContent.innerHTML =
      '<div class="detail-head">' +
        '<button type="button" class="iconbtn back" data-act="back" aria-label="חזרה">' + I.back + '</button>' +
        '<div class="grow"><div style="font-weight:700">' + esc(a.doctor) + '</div>' +
        '<div class="sub">' + when + '</div></div>' +
        '<button type="button" class="iconbtn" data-act="edit" aria-label="עריכה" title="עריכה">' + I.edit + '</button>' +
        '<button type="button" class="iconbtn danger" data-act="delete" aria-label="מחיקה" title="מחיקה">' + I.trash + '</button>' +
      '</div>' +
      '<div class="detail-body">' +
        '<section class="panel">' +
          '<div class="hero"' + specStyle(a.specialty) + '>' +
            '<span class="date-block"><span class="day">' + d.getDate() +
            '</span><span class="mon">' + MONTHS[d.getMonth()] + '</span></span>' +
            '<div><h2>' + esc(a.doctor) + '</h2>' +
            (a.specialty ? '<div class="spec">' + esc(a.specialty) + '</div>' : '') +
            '<div class="when">' + when + ' ' + relPill(a.date) +
            (n < 0 ? '<span class="pill soon">עבר</span>' : '') + '</div></div>' +
          '</div>' +
          '<dl class="kv">' +
            '<dt>מקום</dt><dd>' + esc(a.location || '—') + '</dd>' +
            '<dt>מלווה</dt><dd>' + esc(a.companion || '—') + '</dd>' +
            '<dt>מסמכים</dt><dd>' + (folderUrl
              ? '<a href="' + folderUrl + '" target="_blank" rel="noopener">' + I.cal +
                '<span style="vertical-align:middle;margin-inline-start:4px">פתח את התיקייה בדרייב</span></a>'
              : '—') + '</dd>' +
          '</dl>' +
        '</section>' +

        '<section class="panel section">' +
          // Filled only while the section is empty, where it is the one thing
          // to do; once documents exist it steps back to a tinted option.
          '<div class="section-head"><h3>מסמכים<span>' + ds.length + '</span></h3>' +
          '<button type="button" class="btn' + (ds.length ? '' : ' primary') + ' small" data-act="upload">' +
          I.upload + ' העלאת מסמך</button></div>' +
          (ds.length
            ? '<ul class="docs">' + ds.map(docRow).join('') + '</ul>'
            : '<div class="empty" style="padding:20px"><strong>אין מסמכים לתור הזה</strong>הפניה, טופס 17, סיכום ביקור — צלם או בחר קובץ</div>') +
        '</section>' +

        '<section class="panel section">' +
          '<div class="section-head"><h3>הערות<span>' + ns.length + '</span></h3></div>' +
          (ns.length
            ? '<ul class="notes">' + ns.map(function (nt) {
                return '<li><div class="note-main"><div>' + esc(nt.text) + '</div>' +
                  '<div class="at">' + fmtStamp(nt.created_at) + '</div></div>' +
                  '<button type="button" class="iconbtn" data-act="delete-note" data-note="' + esc(nt.id) +
                  '" aria-label="מחק הערה" title="מחק הערה">' + I.trashSmall + '</button></li>';
              }).join('') + '</ul>'
            : '<div class="doc-sub">עוד אין הערות</div>') +
          '<form class="note-form" data-act="note-form">' +
            '<input id="noteInput" placeholder="הוסף הערה…" autocomplete="off" required>' +
            '<button type="submit" class="btn">הוסף</button>' +
          '</form>' +
        '</section>' +
      '</div>';

    el.detail.classList.add('open');
  }

  function renderGeneralDocs() {
    var q = (el.qDocs.value || '').trim();
    var list = generalDocs().filter(function (d) {
      if (!q) return true;
      return ((d.file_name || '') + ' ' + (d.description || '')).indexOf(q) >= 0;
    }).sort(function (a, b) {
      return String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || ''));
    });
    el.generalDocs.innerHTML = list.length
      ? list.map(docRow).join('')
      : '<li class="empty"><strong>לא נמצאו מסמכים</strong></li>';

    // Same rule as the per-appointment section: filled only on an empty page.
    $('#btnUploadGeneral').classList.toggle('primary', !generalDocs().length);
  }

  /**
   * Desktop-only: what fills the detail column when nothing is selected. A
   * glance at the next appointment and the two numbers worth acting on,
   * instead of an empty dashed box.
   */
  function renderSummary() {
    if (!el.detailEmpty) return;
    var upcoming = state.appointments
      .filter(function (a) { return dayDiff(a.date) >= 0; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    var next = upcoming[0];
    var missing = state.documents.filter(function (x) { return x.status === 'missing'; }).length;
    var stored = state.documents.length - missing;

    if (!state.appointments.length) {
      el.detailEmpty.innerHTML = '<div class="summary"><div class="empty"><strong>הקלסר ריק</strong>לחץ על "תור חדש" כדי להוסיף את התור הראשון</div></div>';
      return;
    }

    var nextHtml = '';
    if (next) {
      var d = parseISO(next.date), n = dayDiff(next.date);
      var when = n === 0 ? 'היום' : n === 1 ? 'מחר' : 'בעוד ' + n + ' ימים';
      nextHtml = '<button type="button" class="summary-next" data-goto="' + esc(next.id) + '"' + specStyle(next.specialty) + '>' +
        '<span class="date-block"><span class="day">' + d.getDate() + '</span><span class="wd">' + MONTHS[d.getMonth()] + '</span></span>' +
        '<span><span class="summary-label">התור הבא · ' + when + '</span>' +
        '<span class="summary-title" style="display:block">' + esc(next.doctor) + (next.specialty ? ' · ' + esc(next.specialty) : '') + '</span>' +
        '<span class="summary-when" style="display:block">יום ' + DAYS[d.getDay()] + ', ' + fmtDate(next.date) + ' · ' + esc(next.time) +
        (next.location ? ' · ' + esc(next.location) : '') + '</span></span></button>';
    } else {
      nextHtml = '<div class="summary-next" style="cursor:default"><span class="date-block"><span class="day">—</span></span>' +
        '<span><span class="summary-label">אין תורים קרובים</span><span class="summary-title" style="display:block">כל התורים ברשימה עברו</span></span></div>';
    }

    el.detailEmpty.innerHTML = '<div class="summary">' + nextHtml +
      '<div class="summary-facts">' +
        '<button type="button" class="fact" data-filter-to="upcoming"><b>' + upcoming.length + '</b><span>' + (upcoming.length === 1 ? 'תור קרוב' : 'תורים קרובים') + '</span></button>' +
        '<button type="button" class="fact' + (missing ? ' warn' : '') + '" data-goto-docs="1"><b>' + missing + '</b><span>' + (missing === 1 ? 'מסמך חסר להעלאה' : 'מסמכים חסרים להעלאה') + '</span></button>' +
        '<button type="button" class="fact" data-goto-docs="1"><b>' + stored + '</b><span>' + (stored === 1 ? 'מסמך בדרייב' : 'מסמכים בדרייב') + '</span></button>' +
      '</div>' +
      '<div class="summary-hint">בחר תור מהרשימה כדי לראות פרטים, מסמכים והערות</div>' +
    '</div>';
  }

  function renderAll() {
    renderAgenda();
    renderDetail();
    renderSummary();
    if (state.view === 'docs') renderGeneralDocs();
  }

  // ---------------------------------------------------------------- routing

  /**
   * The hash is the address of the current screen, so the iPhone back gesture
   * closes the detail panel instead of leaving the site.
   */
  function applyHash() {
    var h = location.hash || '';
    var m = h.match(/^#\/appt\/(.+)$/);
    if (m) {
      state.selected = decodeURIComponent(m[1]);
      showView('appts', true);
    } else if (h === '#/docs') {
      state.selected = null;
      showView('docs', true);
    } else {
      state.selected = null;
      showView('appts', true);
    }
    renderAll();
  }

  function goto(hash) {
    if (location.hash === hash) applyHash();
    else location.hash = hash;
  }

  function showView(v, skipRender) {
    state.view = v;
    el.viewAppts.hidden = v !== 'appts';
    el.viewDocs.hidden = v !== 'docs';
    document.querySelectorAll('[data-nav]').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.nav === v ? 'page' : 'false');
    });
    if (!skipRender) renderAll();
    else if (v === 'docs') renderGeneralDocs();
  }

  // ------------------------------------------------------------------ data

  function applyData(data) {
    state.appointments = data.appointments || [];
    state.documents = data.documents || [];
    state.notes = data.notes || [];
  }

  function refresh(showBanner) {
    state.loading = true;
    return api.bootstrap().then(function (data) {
      state.loading = false;
      applyData(data);
      api.store.setCache(data);
      banner('');
      renderAll();
    }, function (err) {
      state.loading = false;
      if (err.code === 'unauthorized') { lock(); throw err; }
      if (showBanner !== false) banner('לא הצלחתי להתחבר לשרת. מוצגים הנתונים האחרונים שנשמרו.');
      renderAll();
      throw err;
    });
  }

  /** Clears the stored PIN and returns to the gate. */
  function lock() {
    api.store.clearPin();
    api.store.clearCache();
    state.appointments = []; state.documents = []; state.notes = [];
    el.app.hidden = true;
    el.gate.hidden = false;
    el.gateErr.textContent = 'קוד הכניסה כבר לא תקף. הקלד שוב.';
    el.gatePin.value = '';
    el.gatePin.focus();
  }

  // ---------------------------------------------------------------- uploads

  function startUpload(files, appointmentId, replaceId) {
    if (!files.length) return;

    var jobs = files.map(function (file) {
      var pending = {
        id: 'pending-' + Math.random().toString(36).slice(2),
        appointment_id: appointmentId || '',
        file_name: file.name,
        pending: true,
        progress: 15
      };
      state.pendingUploads.push(pending);
      return { file: file, pending: pending };
    });
    renderAll();

    var chain = Promise.resolve();
    var okCount = 0;

    jobs.forEach(function (job) {
      chain = chain.then(function () {
        job.pending.progress = 45;
        renderAll();
        return api.prepareFile(job.file).then(function (payload) {
          job.pending.progress = 70;
          renderAll();
          return api.uploadDocument({
            appointmentId: appointmentId || '',
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            base64: payload.base64,
            replaceId: replaceId || ''
          });
        }).then(function (res) {
          // the server returned the stored row: drop the placeholder and use it
          state.pendingUploads = state.pendingUploads.filter(function (p) { return p !== job.pending; });
          if (res.replaced) {
            state.documents = state.documents.map(function (d) {
              return d.id === res.replaced ? res.document : d;
            });
          } else {
            state.documents.unshift(res.document);
          }
          okCount++;
          replaceId = '';   // a replace target is consumed by the first file
          renderAll();
        }, function (err) {
          job.pending.error = err.message || 'ההעלאה נכשלה';
          job.pending.progress = 0;
          renderAll();
          if (err.code === 'unauthorized') lock();
        });
      });
    });

    return chain.then(function () {
      if (okCount) toast(okCount === 1 ? 'המסמך הועלה לדרייב' : okCount + ' מסמכים הועלו לדרייב');
    });
  }

  // ----------------------------------------------------------------- dialogs

  function openForm(a) {
    state.editing = a ? a.id : null;
    $('#dlgTitle').textContent = a ? 'עריכת תור' : 'תור חדש';
    $('#fDoctor').value = a ? a.doctor : '';
    $('#fSpec').value = a ? a.specialty : '';
    $('#fCompanion').value = a ? a.companion : '';
    $('#fDate').value = a ? a.date : iso(addDays(7));
    $('#fTime').value = a ? a.time : '09:00';
    $('#fLocation').value = a ? a.location : '';
    el.dlgForm.showModal();
    // No autofocus: on a phone it threw up the keyboard before the form was
    // even readable, covering half the fields. The user picks where to start.
    // showModal() would otherwise focus the first control — now Cancel — and
    // draw a focus ring on it, reading as "dismiss" being pre-selected.
    el.dlgForm.focus();
  }

  var confirmAction = null;
  function askConfirm(title, text, fn) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    confirmAction = fn;
    el.dlgConfirm.showModal();
  }

  // ------------------------------------------------------------------ wiring

  function wire() {
    // --- navigation
    document.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        goto(b.dataset.nav === 'docs' ? '#/docs' : '#/');
      });
    });
    window.addEventListener('hashchange', applyHash);

    // --- filters and search
    document.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        state.filter = c.dataset.filter;
        document.querySelectorAll('.chip').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === c));
        });
        renderAgenda();
      });
    });
    el.q.addEventListener('input', function (e) { state.q = e.target.value; renderAgenda(); });
    el.qDocs.addEventListener('input', renderGeneralDocs);

    // --- agenda
    el.agenda.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) goto('#/appt/' + encodeURIComponent(card.dataset.id));
    });

    // --- detail panel
    el.detail.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var a = byId(state.selected);
      var act = btn.dataset.act;

      if (act === 'back') { goto('#/'); return; }
      if (!a) return;

      switch (act) {
        case 'edit':
          openForm(a);
          break;

        case 'delete':
          askConfirm('למחוק את התור?',
            'השורה תימחק והאירוע יוסר מהיומן. תיקיית המסמכים בדרייב נשארת בארכיון.',
            function () {
              return api.deleteAppointment(a.id).then(function () {
                toast('התור נמחק. התיקייה הועברה לארכיון');
                goto('#/');
                return refresh();
              });
            });
          break;

        case 'upload':
          state.uploadTarget = a.id;
          state.replaceDoc = null;
          el.fileInput.click();
          break;

        case 'upload-missing':
          state.uploadTarget = a.id;
          state.replaceDoc = btn.closest('.doc').dataset.doc;
          el.fileInput.click();
          break;

        case 'open':
          openDoc(btn.closest('.doc').dataset.doc);
          break;

        case 'share':
          shareDoc(btn.closest('.doc').dataset.doc);
          break;

        case 'delete-doc':
          confirmDeleteDoc(btn.closest('.doc').dataset.doc);
          break;

        case 'dismiss-failed':
          var pid = btn.closest('.doc').dataset.doc;
          state.pendingUploads = state.pendingUploads.filter(function (p) { return p.id !== pid; });
          renderAll();
          break;

        case 'delete-note':
          var noteId = btn.dataset.note;
          busy(btn, api.deleteNote(noteId).then(function (res) {
            state.notes = state.notes.filter(function (n) { return n.id !== noteId; });
            renderDetail();
            toast('ההערה נמחקה');
          }, handleErr));
          break;
      }
    });

    el.detail.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-act="note-form"]')) return;
      e.preventDefault();
      var a = byId(state.selected);
      if (!a) return;
      var input = e.target.querySelector('input');
      var text = input.value.trim();
      if (!text) return;
      var submitBtn = e.target.querySelector('button[type="submit"]');

      busy(submitBtn, api.addNote(a.id, text).then(function (res) {
        state.notes = state.notes.filter(function (n) { return n.appointment_id !== a.id; })
                                 .concat(res.notes);
        renderDetail();
        toast('ההערה נשמרה');
      }, handleErr));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !isDesktop() && el.detail.classList.contains('open')) goto('#/');
    });

    // --- general documents page
    el.generalDocs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var docId = btn.closest('.doc, li').dataset.doc;
      if (btn.dataset.act === 'open') openDoc(docId);
      if (btn.dataset.act === 'share') shareDoc(docId);
      if (btn.dataset.act === 'delete-doc') confirmDeleteDoc(docId);
      if (btn.dataset.act === 'upload-missing') {
        state.uploadTarget = null;
        state.replaceDoc = docId;
        el.fileInput.click();
      }
      if (btn.dataset.act === 'dismiss-failed') {
        state.pendingUploads = state.pendingUploads.filter(function (p) { return p.id !== docId; });
        renderAll();
      }
    });
    $('#brandHome').addEventListener('click', function () {
      goto('#/');
    });

    $('#btnUploadGeneral').addEventListener('click', function () {
      state.uploadTarget = null;
      state.replaceDoc = null;
      el.fileInput.click();
    });

    // --- file picker
    el.fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(el.fileInput.files);
      el.fileInput.value = '';
      startUpload(files, state.uploadTarget, state.replaceDoc);
      state.replaceDoc = null;
    });

    // --- appointment form
    $('#fab').addEventListener('click', function () { openForm(null); });
    $('#btnNewDesktop').addEventListener('click', function () { openForm(null); });

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = {
        doctor: $('#fDoctor').value.trim(),
        specialty: $('#fSpec').value.trim(),
        companion: $('#fCompanion').value,
        date: $('#fDate').value,
        time: $('#fTime').value,
        location: $('#fLocation').value.trim()
      };
      if (!fields.doctor || !fields.date || !fields.time) return;

      var saveBtn = $('#btnSave');
      var editingId = state.editing;
      var work;

      if (editingId) {
        fields.id = editingId;
        work = api.updateAppointment(fields).then(function () {
          toast('התור עודכן — גם ביומן');
          return editingId;
        });
      } else {
        work = api.createAppointment(fields).then(function (res) {
          toast('התור נשמר: שורה, אירוע ביומן ותיקייה בדרייב');
          return res.appointment.id;
        });
      }

      busy(saveBtn, work.then(function (id) {
        el.dlgForm.close();
        return refresh().then(function () {
          // make sure the saved appointment is visible under the current filter
          if (state.filter !== 'all' && !byIdVisible(id)) {
            setFilter(dayDiff(fields.date) < 0 ? 'past' : 'upcoming');
          }
          goto('#/appt/' + encodeURIComponent(id));
        });
      }, handleErr));
    });

    $('#btnConfirmDelete').addEventListener('click', function () {
      var fn = confirmAction;
      confirmAction = null;
      el.dlgConfirm.close();
      if (fn) fn().catch(handleErr);
    });

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });
    [el.dlgForm, el.dlgConfirm].forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    });

    el.bannerRetry.addEventListener('click', function () { refresh().catch(function () {}); });

    // --- summary panel (desktop empty state)
    el.detailEmpty.addEventListener('click', function (e) {
      var go = e.target.closest('[data-goto]');
      if (go) { goto('#/appt/' + encodeURIComponent(go.dataset.goto)); return; }
      var f = e.target.closest('[data-filter-to]');
      if (f) { setFilter(f.dataset.filterTo); renderAgenda(); return; }
      if (e.target.closest('[data-goto-docs]')) goto('#/docs');
    });

    matchMedia('(min-width:900px)').addEventListener('change', renderAll);
  }

  function byIdVisible(id) {
    return filtered().some(function (a) { return a.id === id; });
  }
  function setFilter(f) {
    state.filter = f;
    document.querySelectorAll('.chip').forEach(function (x) {
      x.setAttribute('aria-pressed', String(x.dataset.filter === f));
    });
  }

  function handleErr(err) {
    if (err && err.code === 'unauthorized') { lock(); return; }
    toast((err && err.message) || 'משהו השתבש');
  }

  // ------------------------------------------------------------ doc actions

  function findDoc(id) {
    for (var i = 0; i < state.documents.length; i++) {
      if (state.documents[i].id === id) return state.documents[i];
    }
    return null;
  }

  /**
   * Object URLs for documents fetched this session. Kept alive until the page
   * is unloaded: a blob: URL handed to a new tab dies the moment it is
   * revoked, so revoking eagerly would break the tab we just opened.
   */
  var blobUrls = {};

  /**
   * Fetched file bytes, keyed by document id. Sharing needs the bytes in hand
   * *before* the tap that opens the share sheet (see shareDoc), so whatever a
   * view or an earlier share already downloaded is kept here and reused.
   */
  var docCache = {};

  function fetchDoc(id) {
    if (docCache[id]) return Promise.resolve(docCache[id]);
    return api.fetchDocument(id).then(function (got) {
      if (got) docCache[id] = got;
      return got;
    });
  }

  function docBlobUrl(id) {
    if (blobUrls[id]) return Promise.resolve(blobUrls[id]);
    return fetchDoc(id).then(function (got) {
      if (!got) return null;
      blobUrls[id] = URL.createObjectURL(got.blob);
      return blobUrls[id];
    });
  }

  window.addEventListener('pagehide', function () {
    for (var k in blobUrls) if (blobUrls.hasOwnProperty(k)) URL.revokeObjectURL(blobUrls[k]);
  });

  /** Last resort when the bytes cannot be had: the Drive page. */
  function openDriveLink(d) {
    if (d && d.web_view_link) window.open(d.web_view_link, '_blank', 'noopener');
    else toast('אין קישור לקובץ');
  }

  /**
   * Opens the document itself. Safari blocks window.open() inside an async
   * callback, so the tab is opened synchronously on the click and pointed at
   * the blob once it arrives.
   */
  function openDoc(id) {
    var d = findDoc(id);
    if (!d) return;
    if (!d.file_id) { toast('המסמך עדיין לא הועלה'); return; }

    var tab = window.open('', '_blank');
    docBlobUrl(id).then(function (url) {
      armShare(id);
      if (!url) {
        if (tab) tab.close();
        openDriveLink(d);
        return;
      }
      if (tab) tab.location = url;
      else window.open(url, '_blank', 'noopener');
    }).catch(function (err) {
      if (tab) tab.close();
      if (err && err.code === 'unauthorized') { lock(); return; }
      openDriveLink(d);
    });
  }

  /**
   * Shares the file itself, so the recipient gets a real PDF or photo rather
   * than a Drive link they may have no access to. Falls back to sharing the
   * link when the platform cannot share files or the file is too large.
   */
  /**
   * Sharing the file itself happens in two taps, and that is deliberate.
   *
   * iOS only honours navigator.share inside the tap that triggered it. Waiting
   * for the download first spends that user activation, so Safari rejects the
   * call and — because the rejection also lands outside an activation — the
   * link fallback dies just as silently. The button looks dead.
   *
   * So the first tap only downloads and re-labels the button; the second tap
   * shares synchronously from the cache. A document already opened (or shared)
   * this session is cached, and then the first tap shares straight away.
   */
  function shareDoc(id) {
    var d = findDoc(id);
    if (!d) return;
    if (!d.file_id) { toast('המסמך עדיין לא הועלה'); return; }

    if (docCache[id]) return shareCached(id, d);
    if (!canShareFile()) return shareLink(d);

    var btn = shareBtnFor(id);
    setShareBtnState(btn, 'loading');
    fetchDoc(id).then(function (got) {
      if (!got) { setShareBtnState(btn, 'idle'); return shareLink(d); }
      setShareBtnState(btn, 'ready');
      toast('הקובץ מוכן — לחץ שוב לשיתוף');
    }).catch(function (err) {
      setShareBtnState(btn, 'idle');
      if (err && err.code === 'unauthorized') { lock(); return; }
      shareLink(d);
    });
  }

  /** Shares from the cache, synchronously inside the tap. */
  function shareCached(id, d) {
    var got = docCache[id];
    var file = new File([got.blob], got.fileName, { type: got.mime });
    if (!canShareFile() || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
      return shareLink(d);
    }
    navigator.share({ files: [file], title: got.fileName }).catch(function (err) {
      // Dismissing the share sheet is not a failure.
      if (err && err.name !== 'AbortError') shareLink(d);
    });
  }

  function shareBtnFor(id) {
    return document.querySelector('[data-doc="' + cssEscape(id) + '"] [data-act="share"]');
  }

  /** Marks a share button as ready, so the next tap shares instead of fetching. */
  function armShare(id) {
    if (docCache[id]) setShareBtnState(shareBtnFor(id), 'ready');
  }

  function setShareBtnState(btn, state) {
    if (!btn) return;
    btn.classList.toggle('is-ready', state === 'ready');
    // aria-busy drives the spinner and already blocks pointer events; `disabled`
    // would additionally drop focus, which is worse for a keyboard user.
    if (state === 'loading') btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
    btn.setAttribute('aria-label',
      state === 'ready' ? 'שתף עכשיו' : state === 'loading' ? 'מכין את הקובץ…' : 'שתף את הקובץ');
    btn.setAttribute('title', btn.getAttribute('aria-label'));
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, function (m) { return '\\' + m; });
  }

  function canShareFile() {
    return !!(navigator.share && navigator.canShare && window.File);
  }

  function shareLink(d) {
    if (!d.web_view_link) { toast('אין קישור לקובץ'); return; }
    if (navigator.share) {
      navigator.share({ title: d.file_name, url: d.web_view_link }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(d.web_view_link).then(function () {
        toast('הקישור הועתק');
      }, function () { toast('לא הצלחתי להעתיק'); });
    } else {
      openDriveLink(d);
    }
  }

  function confirmDeleteDoc(id) {
    var d = findDoc(id);
    if (!d) return;
    askConfirm('למחוק את המסמך?',
      'הקובץ יעבור לפח באשפה של דרייב. השתמש בזה רק לקובץ שהועלה בטעות.',
      function () {
        return api.deleteDocument(id).then(function () {
          state.documents = state.documents.filter(function (x) { return x.id !== id; });
          toast('המסמך נמחק');
          renderAll();
        });
      });
  }

  // ------------------------------------------------------------------- boot

  function bootApp() {
    el.gate.hidden = true;
    el.app.hidden = false;

    var cached = api.store.getCache();
    if (cached) { applyData(cached); }
    applyHash();
    wire();
    refresh().catch(function () { /* banner already shown */ });
  }

  function bootGate() {
    el.gate.hidden = false;
    el.app.hidden = true;
    el.gatePin.focus();

    el.gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = el.gatePin.value.trim();
      if (!pin) return;
      el.gateErr.textContent = '';

      busy($('#gateBtn'), api.verifyPin(pin).then(function (data) {
        api.store.setPin(pin);
        api.store.setCache(data);
        applyData(data);
        bootApp();
      }, function (err) {
        el.gateErr.textContent = err.code === 'unauthorized'
          ? 'קוד כניסה שגוי'
          : (err.message || 'לא הצלחתי להתחבר');
        el.gatePin.select();
      }));
    });
  }

  function init() {
    el = {
      gate: $('#gate'), gateForm: $('#gateForm'), gatePin: $('#gatePin'), gateErr: $('#gateErr'),
      app: $('#app'), agenda: $('#agenda'), detail: $('#detail'), detailContent: $('#detailContent'),
      detailEmpty: $('#detailEmpty'),
      viewAppts: $('#view-appts'), viewDocs: $('#view-docs'),
      generalDocs: $('#generalDocs'), q: $('#q'), qDocs: $('#qDocs'),
      dlgForm: $('#dlgForm'), dlgConfirm: $('#dlgConfirm'), form: $('#form'),
      fileInput: $('#fileInput'), toast: $('#toast'),
      banner: $('#banner'), bannerText: $('#bannerText'), bannerRetry: $('#bannerRetry')
    };

    if (api.store.getPin()) bootApp();
    else bootGate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
