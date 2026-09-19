/**
 * api.js — the only place that talks to Apps Script.
 *
 * Transport constraints that shape this file:
 *  - The body goes as text/plain. Any other content-type triggers a CORS
 *    preflight, and Apps Script never answers OPTIONS.
 *  - /exec replies 302 to googleusercontent; fetch follows it as a GET, which
 *    is exactly right and needs no special handling.
 *  - Errors come back as HTTP 200 with {ok:false,error}, so a non-ok HTTP
 *    status means the transport failed, not the action.
 */
(function (global) {
  'use strict';

  var PIN_KEY = 'fb.pin';
  var CACHE_KEY = 'fb.cache';

  /** Thrown for {ok:false} responses, so callers can branch on the code. */
  function ApiError(code, message) {
    this.name = 'ApiError';
    this.code = code;
    this.message = message || code;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var store = {
    getPin: function () {
      try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; }
    },
    setPin: function (pin) {
      try { localStorage.setItem(PIN_KEY, pin); } catch (e) { /* private mode */ }
    },
    clearPin: function () {
      try { localStorage.removeItem(PIN_KEY); } catch (e) { /* private mode */ }
    },
    getCache: function () {
      try {
        var raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    setCache: function (data) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* quota */ }
    },
    clearCache: function () {
      try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
    }
  };

  /**
   * Posts one action. `pinOverride` is used by the gate to test a PIN that has
   * not been stored yet.
   */
  function call(action, params, pinOverride) {
    var pin = pinOverride !== undefined ? pinOverride : store.getPin();
    var body = Object.assign({ pin: pin, action: action }, params || {});

    return fetch(global.API_URL, {
      method: 'POST',
      // text/plain keeps the request "simple" so no preflight is sent
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (res) {
      if (!res.ok) throw new ApiError('network', 'שגיאת רשת (' + res.status + ')');
      return res.text();
    }).then(function (text) {
      var json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        // Apps Script serves an HTML error page when the deployment is broken
        throw new ApiError('bad_response', 'תשובה לא צפויה מהשרת');
      }
      if (!json.ok) throw new ApiError(json.error || 'unknown', errorText(json.error));
      return json.data;
    }, function (netErr) {
      if (netErr instanceof ApiError) throw netErr;
      throw new ApiError('offline', 'אין חיבור לשרת');
    });
  }

  /** Maps a server error code to Hebrew. Unknown codes pass through as-is. */
  function errorText(code) {
    switch (code) {
      case 'unauthorized':        return 'קוד כניסה שגוי';
      case 'busy':                return 'מישהו אחר עורך כרגע, נסה שוב בעוד רגע';
      case 'server_not_configured': return 'השרת לא הוגדר (חסר PIN ב-Script Properties)';
      case 'bad_request':         return 'הבקשה לא תקינה';
      default:                    return code || 'שגיאה לא ידועה';
    }
  }

  /**
   * Shrinks a photo before upload: phone cameras produce 3-6MB files and the
   * Apps Script request body is capped well below that. PDFs pass through
   * untouched, since re-encoding them would destroy them.
   */
  var MAX_EDGE = 1600;
  var JPEG_QUALITY = 0.82;
  var HARD_LIMIT = 20 * 1024 * 1024;

  function prepareFile(file) {
    var isImage = file.type.indexOf('image/') === 0;

    // An oversized image is still worth trying: compression usually brings a
    // phone photo far under the limit. Anything else is refused up front.
    if (file.size > HARD_LIMIT && !isImage) {
      return Promise.reject(new ApiError('too_large', 'הקובץ גדול מדי (מעל 20MB)'));
    }

    if (!isImage) {
      return readAsBase64(file).then(function (base64) {
        return { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64: base64 };
      });
    }
    return compressImage(file).catch(function () {
      // HEIC and other formats the canvas cannot decode: send the original
      return readAsBase64(file).then(function (base64) {
        return { fileName: file.name, mimeType: file.type, base64: base64 };
      });
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);

        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('compress failed')); return; }
          readAsBase64(blob).then(function (base64) {
            resolve({
              fileName: withExtension(file.name, 'jpg'),
              mimeType: 'image/jpeg',
              base64: base64
            });
          }, reject);
        }, 'image/jpeg', JPEG_QUALITY);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  function withExtension(name, ext) {
    return String(name || 'image').replace(/\.[^.]+$/, '') + '.' + ext;
  }

  function readAsBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result);
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () { reject(new Error('read failed')); };
      reader.readAsDataURL(blob);
    });
  }

  global.api = {
    ApiError: ApiError,
    store: store,
    errorText: errorText,
    prepareFile: prepareFile,

    verifyPin: function (pin) { return call('bootstrap', {}, pin); },
    bootstrap: function () { return call('bootstrap'); },

    createAppointment: function (fields) { return call('appointments.create', fields); },
    updateAppointment: function (fields) { return call('appointments.update', fields); },
    deleteAppointment: function (id) { return call('appointments.delete', { id: id }); },

    addNote: function (appointmentId, text) {
      return call('notes.add', { appointmentId: appointmentId, text: text });
    },
    deleteNote: function (id) { return call('notes.delete', { id: id }); },

    uploadDocument: function (payload) { return call('documents.upload', payload); },
    updateDocument: function (id, description) {
      return call('documents.update', { id: id, description: description });
    },
    deleteDocument: function (id) { return call('documents.delete', { id: id }); }
  };
})(window);
