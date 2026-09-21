# handoff — family-binder

עודכן: 2026-09-20, סשן 2.

## איפה אנחנו

| Phase | מצב |
|---|---|
| 0 שלד | ✅ |
| 1 Backend (Apps Script) | ✅ אומת חי, 32/32 ב-`backend/test-api.sh` |
| 2 Frontend | ✅ אומת חי ב-390/1280 (Playwright) |
| 3 מיגרציה מהבוט | ✅ 13 תורים · 13 תיקיות · 11 מסמכים `missing` · 7 הערות · 13→13 אירועים ביומן (0 כפולים) |
| 4 GitHub Pages | ✅ חי, CORS אומת מה-origin האמיתי |
| עיצוב | ✅ Heebo בלבד · מצב כהה הוסר · פלטת iOS (כחול מערכת, `#F2F2F7`) |
| S5 בדיקה באייפון | 🟡 ראשוני תקין (המשתמש). מצלמה/HEIC/מסך-הבית עדיין אצלו |
| תיעוד למשתמש | ✅ `docs/user-guide.md` |
| צפייה/שיתוף של הקובץ עצמו | ✅ `documents.fetch`, backend `@8` |
| שיתוף באייפון (2 לחיצות) | 🟡 תוקן ואומת מול סימולציית activation — ממתין לאישור באייפון |
| Phase 5 גיבוי DB | ✅ `migration/family_agent.db` (git-ignored) |
| **S6 כיבוי הבוט** | ✅ שירות + טיימר גיבוי כבויים ומנוטרלים |

## מזהים תפעוליים (לא סודות)

| מה | ערך |
|---|---|
| אתר (Pages) | https://yossi126.github.io/family-binder/ |
| repo | https://github.com/yossi126/family-binder |
| Apps Script scriptId | `1PLyZP7Vl-dtaOPodtCE3oeC1q5-76oY0QMmVtcNCa95Tk2dCuh2Mn4Hj` |
| deployment id | `AKfycbwohxgzwAZOILyiA2GnO6WY35nK1hZU-bHx0txYKnOfrVhIGp5zE_ePL2kSViIM4WHj` |
| `/exec` URL | ב-`site/config.js` וב-`backend/.exec-url` |
| deployment version חי | `@7` |
| PIN | **רק** ב-Script Properties + `backend/.pin` (git-ignored). לא בצ'אט. |

## פקודות

```bash
# backend (clasp 3.x — לא clasp deploy)
cd backend && clasp push --force && clasp create-deployment -i AKfycbwohxgzwAZOILyiA2GnO6WY35nK1hZU-bHx0txYKnOfrVhIGp5zE_ePL2kSViIM4WHj --description "v1"

# בדיקת backend מלאה (יוצרת ומוחקת תור בדיקה; קוראת PIN מ-backend/.pin)
bash backend/test-api.sh

# ספירות חיות (יומן / שורות / תיקיות) בלי לכתוב כלום
# POST {pin, action:"diagnose"} ל-/exec — ראה דוגמה ב-progress.md Phase 3

# אתר: פשוט
git push origin main       # .github/workflows/pages.yml מפרסם את site/
```

## מה אומת חי ומה לא

**אומת:** כל פעולות ה-API מול `/exec`; האתר ב-localhost מול ה-backend האמיתי (יצירה/עריכה/מחיקה/הערות/העלאת PDF דרך בורר קבצים); CORS מ-`https://yossi126.github.io`; טוקני העיצוב החיים ב-Pages.

**לא אומת (זה S5):** כניסה עם ה-PIN האמיתי מול כתובת ה-Pages (נמנעתי כדי לא להעביר PIN דרך הצ'אט); "הוסף למסך הבית" באייפון; העלאת **תמונה מהמצלמה** (הכיווץ ב-canvas ב-`api.js` לא נבדק על קובץ אמיתי מאייפון); HEIC.

## הבא — בדיוק

1. **המשתמש:** משתף את היומן עם האחות (כדי שהתזכורות יופיעו אצלה בלוח השנה).
   שיתוף תיקיית הדרייב **אינו חובה** מאז `documents.fetch` — צפייה ושיתוף
   מסמכים עובדים בלי הרשאה. בלי שיתוף יישברו רק: הקישור "פתח את התיקייה בדרייב"
   וקבצים מעל 8MB (שנופלים לקישור).
2. **שארית S5** — בדיקות באייפון ממשיכות אצל המשתמש; תקלות → תיקון, `git push`,
   אימות חי.
3. **מחיקת ה-VM** מקונסולת Oracle — כשהמשתמש מרוצה מהאתר. **לא בסקופ**, צעד ידני.
   הגיבוי כבר מקומי, כך שאין תלות.

## דברים לדעת

- **תיקיות בדיקה** נשארו תחת `ארכיון/` בדרייב (מ-`test-api.sh` ומבדיקות ה-fetch). לא מזיקות; אפשר למחוק ידנית.
- `documents.fetch` מוגבל ל-8MB (`MAX_FETCH_BYTES`). נמדד: 7MB עובר (תשובה 9.79MB), 9MB נדחה עם קישור.
- מחיקת תור מוחקת עכשיו גם את שורות המסמכים שלו. הקבצים **לא** נמחקים — הם נוסעים עם התיקייה לארכיון.
- **iOS מרשה `navigator.share` רק בתוך הלחיצה עצמה.** כל `await` לפניו הורג גם את השיתוף וגם את ה-fallback, בשקט. לכן השיתוף הוא בשתי לחיצות (הראשונה מורידה, השנייה משתפת), ואחרי "פתח" מספיקה אחת.
- דטקטור impeccable רץ במצב degraded (בלי htmlparser2) — ממצאיו הם undercount.
- `clasp create-script` דורס את `appsscript.json` — אחרי create תמיד `git checkout appsscript.json` לפני push.
- `curl -L` נכשל מול Apps Script (411). ההארנס עושה POST → קורא `redirect_url` → GET.
- הקאש של Safari עקשן: אחרי deploy עיצובי, לרענן חזק / לסגור ולפתוח מהמסך הבית.
- **SSH ל-VM:** `ssh -i ~/.ssh/oci-family-agent.key ubuntu@82.70.218.161`
  (המפתח לא בפרויקט). האפליקציה ב-`/opt/family-agent`, רצה כמשתמש `famagent`.
- הבוט כבוי ומנוטרל. להחזרה: `sudo systemctl enable --now family-agent`.
- **`migration/family_agent.db` הוא העותק היחיד** של 19 התרופות ו-8 ההפניות
  מהבוט — הן מעולם לא היו בסקופ האתר. git-ignored, כלומר לא מגובה בשום מקום אחר.
  אם הן חשובות, שווה עותק נוסף לפני מחיקת ה-VM.
- **לפני אימות מקומי:** לסגור את *כל* מופעי `http.server` דרך PowerShell — מופעים
  יתומים מסשנים קודמים מגישים קבצים ישנים ונראים כמו "השינוי לא נתפס".
