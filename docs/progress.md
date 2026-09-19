# progress

יומן חי. כל שלב נכתב כאן עם מה אומת בפועל (לא "קומפל").

---

## 2026-09-19 — החלטה ותכנון
החלטה + ארכיטקטורה + מוקאפ מאושר (`mockup/index.html`); נתוני הבוט יוצאו ל-`migration/bot-export.json` (git-ignored);
התוכנית נכתבה (`docs/plan.md`). המימוש מתחיל בסשן חדש מ-Phase 0.

## 2026-09-19 — Phase 0: שלד הפרויקט
- `git init` (branch `main`), `.gitignore` מרחיב: `migration/*.json|db`, `backend/.pin`, `backend/.clasprc.json`, `node_modules/`, `.playwright-mcp/`.
- מבנה תיקיות: `site/` (+`site/icons/`), `backend/`, `docs/screenshots/`. `mockup/` ו-`migration/` נשארים.
- `README.md` בעברית: מה זה, איך פורסים, הערת פרטיות.
- סביבה שאומתה: git 2.55, Node v22.23.2, npm 10.9.8 → `clasp` אפשרי (אין fallback להדבקה ידנית).
- מבנה `bot-export.json` נבדק (ספירות בלבד): 13 תורים, 11 מסמכים, 1 הערה, 8 הפניות (לא בסקופ).
  - כל 13 התורים מחזיקים `gcal_event_id` → יש סיכוי טוב לקשר אירועים קיימים במקום ליצור חדשים.
  - 3 מסמכים מקושרים לתור, 8 כלליים. לכל 11 אין `drive_file_id` → כולם ייובאו כ-`status: missing`.
  - `appointment_at` בפורמט `YYYY-MM-DDTHH:MM` → פיצול ל-`date` + `time`.
  - ל-0 תורים יש `companion` → העמודה תיובא ריקה.
- **פער שנמצא במוקאפ:** `.card.today::before` משתמש ב-`var(--today)` שלא מוגדר בשום מקום → הפס הצדדי של "היום" שקוף. יתוקן ב-Phase 2 (ימופה ל-`--accent`).

**הבא:** S1 — יצירת repo ב-GitHub ודחיפה ראשונה.

## 2026-09-19 — Phase 1: Backend ב-Apps Script
נפרס ואומת **חי** מול `/exec` האמיתי (Tier 2).

- `clasp` 3.4.1 (לא 2.x — התחביר שונה: `create-script` / `create-deployment -i`).
- הפרויקט נוצר, 8 קבצים נדחפו. `deployment` יחיד; כל redeploy הוא `create-deployment -i <id>` כך שכתובת ה-`/exec` לא משתנה (אומת: `@1` → `@2` → `@3`, אותה כתובת).
- `setup()` רץ פעם אחת: נוצרו הגיליון + 4 הטאבים; 3 תיקיות המשנה כבר היו/נוצרו תחת ה-root; `PIN` מוגדר.

### שינוי מהתוכנית (מאושר בפועל)
התוכנית אמרה ש-`setup()` יקרא את מזהי היומן/הדרייב מ-`bot-export.json`.
במקום זה הם **Script Properties** (`ROOT_FOLDER_ID`, `CALENDAR_ID`) שהמשתמש מגדיר —
כך מזהים אמיתיים לא עוברים דרך הצ'אט ולא נכנסים ל-git.

### באגים שנמצאו ותוקנו באימות החי
1. **`appendRow` מתעלם מפורמט העמודה** → `08:30` נשמר כ-`8:30`. תוקן: כל כתיבה היא
   `getRange().setNumberFormat('@')` ואז `setValues()`, לא `appendRow`.
2. **`curl -L` נכשל מול Apps Script** עם `411 Length Required`: אחרי ה-302 ל-googleusercontent
   curl שולח שוב POST בלי `Content-Length`. `--post302` גם נכשל (405 — היעד לא מקבל POST).
   הפתרון בהארנס: POST ל-`/exec`, קריאת `%{redirect_url}`, ואז **GET** אליו — מה שדפדפן עושה.
   **אין כאן באג בצד השרת** — `fetch` בדפדפן עושה את זה נכון לבד.
3. **חסרה פעולת `notes.delete`** — אי אפשר היה למחוק הערה שהוקלדה בטעות. נוספה,
   ומעדכנת גם את תיאור האירוע ביומן.

### מה אומת חי — 32/32 עברו (`backend/test-api.sh`)
`doGet` · PIN שגוי → `unauthorized` · `bootstrap` · `create` (שורה + אירוע + תיקייה + הערה ראשונה,
שעה נשמרת `08:30`) · `update` (תאריך/שעה משתנים, `folder_id` יציב) · `notes.add` ·
`documents.upload` לתור · upload כללי · `documents.update` · חסימת קובץ 28MB ·
`documents.delete` · `appointments.delete` (אירוע נמחק ביומן, תיקייה עברה לארכיון) ·
ההערות נשארות כהיסטוריה אחרי מחיקת תור.

הגיליון נוקה בסוף: 0 תורים, 0 מסמכים, 0 הערות. נשארה תיקיית בדיקה אחת תחת `ארכיון/` (לא מזיקה).

`Access-Control-Allow-Origin: *` מוחזר מ-`/exec` → CORS מהדפדפן יעבוד.

**הבא:** Phase 2 — frontend ב-`site/`.
