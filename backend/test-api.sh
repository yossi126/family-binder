#!/usr/bin/env bash
# Live round-trip against the deployed /exec. Reads the PIN from backend/.pin
# (git-ignored) and never prints it. Creates a test appointment, exercises every
# write action, then deletes it and reports what is left to clean up by hand.
#
#   ./test-api.sh            full cycle
#   ./test-api.sh keep       full cycle but skip the delete, to inspect in the UI
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
EXEC_URL="$(cat "$HERE/.exec-url")"
PIN="$(tr -d '\r\n' < "$HERE/.pin")"
KEEP="${1:-}"
TMP="${TMPDIR:-/tmp}/fb-test.$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0

# Apps Script answers /exec with a 302 to googleusercontent. A browser follows
# that as a GET; curl -L re-sends the POST without Content-Length and Google
# rejects it with 411, so the redirect is followed explicitly as a GET here.
call() { # call <action> [extra-json-fields]
  local action="$1"
  local extra="${2:-}"
  local body="$TMP/body.json"
  if [ -n "$extra" ]; then
    printf '{"pin":"%s","action":"%s",%s}' "$PIN" "$action" "$extra" > "$body"
  else
    printf '{"pin":"%s","action":"%s"}' "$PIN" "$action" > "$body"
  fi
  post_file "$body"
}

post_file() { # post_file <path-to-json-body>
  local loc
  loc="$(curl -s -o /dev/null -w '%{redirect_url}' -X POST \
         -H 'Content-Type: text/plain' --data-binary "@$1" "$EXEC_URL")"
  if [ -z "$loc" ]; then
    echo '{"ok":false,"error":"no redirect returned"}'
    return
  fi
  curl -s "$loc"
}

# Reads a value out of a JSON response. Prints nothing when absent, so callers
# can distinguish a missing field from a real value.
jqv() { node -e "
let s='';
process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const o=JSON.parse(s); const v=eval('o$1'); process.stdout.write(v===undefined||v===null?'':String(v)); }
  catch(e){ process.stdout.write(''); }
});"; }

check() { # check <label> <expected> <actual> [context]
  if [ "$2" = "$3" ] && [ -n "$3" ]; then
    echo "  PASS  $1"; pass=$((pass+1))
  else
    echo "  FAIL  $1 — expected [$2] got [$3] ${4:-}"; fail=$((fail+1))
  fi
}

echo "== 1. doGet =="
GET="$(curl -sL "$EXEC_URL")"
check "doGet returns ok" "true" "$(echo "$GET" | jqv '.ok')" "$GET"

echo "== 2. wrong PIN is rejected =="
printf '{"pin":"definitely-not-the-pin","action":"bootstrap"}' > "$TMP/bad.json"
BAD="$(post_file "$TMP/bad.json")"
check "wrong pin -> unauthorized" "unauthorized" "$(echo "$BAD" | jqv '.error')" "$BAD"

echo "== 3. bootstrap (before) =="
B0="$(call bootstrap)"
A0="$(echo "$B0" | jqv '.data.appointments.length')"
D0="$(echo "$B0" | jqv '.data.documents.length')"
N0="$(echo "$B0" | jqv '.data.notes.length')"
check "bootstrap ok" "true" "$(echo "$B0" | jqv '.ok')" "$B0"
echo "        appointments=$A0 documents=$D0 notes=$N0"

echo "== 4. appointments.create =="
CREATE="$(call appointments.create \
  '"doctor":"בדיקת מערכת","specialty":"QA","date":"2030-01-15","time":"08:30","location":"מיקום בדיקה","companion":"אח","firstNote":"הערה ראשונה מהבדיקה"')"
APPT_ID="$(echo "$CREATE" | jqv '.data.appointment.id')"
EVENT_ID="$(echo "$CREATE" | jqv '.data.appointment.event_id')"
FOLDER_ID="$(echo "$CREATE" | jqv '.data.appointment.folder_id')"
check "create ok" "true" "$(echo "$CREATE" | jqv '.ok')" "$CREATE"
check "row has id" "yes" "$([ -n "$APPT_ID" ] && echo yes || echo no)"
check "calendar event created" "yes" "$([ -n "$EVENT_ID" ] && echo yes || echo no)"
check "drive folder created" "yes" "$([ -n "$FOLDER_ID" ] && echo yes || echo no)"
check "first note stored" "1" "$(echo "$CREATE" | jqv '.data.notes.length')"
# the leading zero must survive the sheet round-trip
check "time kept as 08:30" "08:30" "$(echo "$CREATE" | jqv '.data.appointment.time')"

echo "== 5. appointments.update (renames folder + event) =="
UPD="$(call appointments.update \
  "\"id\":\"$APPT_ID\",\"doctor\":\"בדיקת מערכת מעודכן\",\"date\":\"2030-02-20\",\"time\":\"10:45\"")"
check "update ok" "true" "$(echo "$UPD" | jqv '.ok')" "$UPD"
check "date changed" "2030-02-20" "$(echo "$UPD" | jqv '.data.appointment.date')"
check "time changed" "10:45" "$(echo "$UPD" | jqv '.data.appointment.time')"
check "folder id unchanged" "$FOLDER_ID" "$(echo "$UPD" | jqv '.data.appointment.folder_id')"

echo "== 6. notes.add =="
NOTE="$(call notes.add "\"appointmentId\":\"$APPT_ID\",\"text\":\"הערה שנייה מהבדיקה\"")"
check "note added" "true" "$(echo "$NOTE" | jqv '.ok')" "$NOTE"
check "two notes now" "2" "$(echo "$NOTE" | jqv '.data.notes.length')"

echo "== 7. documents.upload (small pdf) =="
PDF_B64='JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pg=='
UP="$(call documents.upload \
  "\"appointmentId\":\"$APPT_ID\",\"fileName\":\"test-doc.pdf\",\"mimeType\":\"application/pdf\",\"base64\":\"$PDF_B64\",\"description\":\"קובץ בדיקה\"")"
DOC_ID="$(echo "$UP" | jqv '.data.document.id')"
check "upload ok" "true" "$(echo "$UP" | jqv '.ok')" "$UP"
check "file landed in drive" "yes" \
  "$([ -n "$(echo "$UP" | jqv '.data.document.file_id')" ] && echo yes || echo no)"
check "status ok" "ok" "$(echo "$UP" | jqv '.data.document.status')"

echo "== 8. documents.upload (general, no appointment) =="
UPG="$(call documents.upload \
  "\"appointmentId\":\"\",\"fileName\":\"test-general.pdf\",\"mimeType\":\"application/pdf\",\"base64\":\"$PDF_B64\",\"description\":\"כללי בדיקה\"")"
GDOC_ID="$(echo "$UPG" | jqv '.data.document.id')"
check "general upload ok" "true" "$(echo "$UPG" | jqv '.ok')" "$UPG"
check "not linked to an appointment" "yes" \
  "$([ -z "$(echo "$UPG" | jqv '.data.document.appointment_id')" ] && echo yes || echo no)"

echo "== 9. documents.update =="
DU="$(call documents.update "\"id\":\"$DOC_ID\",\"description\":\"תיאור מעודכן\"")"
check "description updated" "תיאור מעודכן" "$(echo "$DU" | jqv '.data.document.description')" "$DU"

echo "== 10. oversized upload is refused =="
# built straight into the body file: 28MB will not fit on a command line
{ printf '{"pin":"%s","action":"documents.upload","appointmentId":"%s","fileName":"big.bin","mimeType":"application/octet-stream","base64":"' "$PIN" "$APPT_ID"
  node -e 'const c=Buffer.alloc(1024*1024,65);for(let i=0;i<28;i++)process.stdout.write(c);'
  printf '"}'
} > "$TMP/big.json"
OVER="$(post_file "$TMP/big.json")"
check "oversized rejected" "false" "$(echo "$OVER" | jqv '.ok')" "$(echo "$OVER" | head -c 160)"

echo "== 11. bootstrap (after) =="
B1="$(call bootstrap)"
A1="$(echo "$B1" | jqv '.data.appointments.length')"
D1="$(echo "$B1" | jqv '.data.documents.length')"
N1="$(echo "$B1" | jqv '.data.notes.length')"
echo "        appointments=$A1 documents=$D1 notes=$N1"
check "one more appointment" "$((A0+1))" "$A1"
check "two more documents"   "$((D0+2))" "$D1"
check "two more notes"       "$((N0+2))" "$N1"

if [ "$KEEP" = "keep" ]; then
  echo
  echo "KEEP mode: test appointment left in place."
  echo "  appointment id: $APPT_ID"
  exit 0
fi

echo "== 12. cleanup: documents.delete =="
for id in "$DOC_ID" "$GDOC_ID"; do
  DD="$(call documents.delete "\"id\":\"$id\"")"
  check "doc deleted" "true" "$(echo "$DD" | jqv '.ok')" "$DD"
done

echo "== 13. cleanup: appointments.delete =="
DEL="$(call appointments.delete "\"id\":\"$APPT_ID\"")"
check "delete ok" "true" "$(echo "$DEL" | jqv '.ok')" "$DEL"
check "calendar event removed" "true" "$(echo "$DEL" | jqv '.data.event_deleted')" "$DEL"
check "folder archived" "true" "$(echo "$DEL" | jqv '.data.folder_archived')" "$DEL"

echo "== 14. bootstrap (final) =="
B2="$(call bootstrap)"
A2="$(echo "$B2" | jqv '.data.appointments.length')"
N2="$(echo "$B2" | jqv '.data.notes.length')"
echo "        appointments=$A2 notes=$N2"
check "appointment count back to start" "$A0" "$A2"
# notes of a deleted appointment stay as history, so 2 more than the start
check "notes kept as history" "$((N0+2))" "$N2"

echo
echo "-------------------------------------------"
echo "PASS: $pass   FAIL: $fail"
echo "Manual cleanup left: the archived test folder under the archive folder."
[ "$fail" -eq 0 ] || exit 1
