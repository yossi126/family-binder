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
