# הקלסר הרפואי (family-binder)

אתר משפחתי לניהול תורים רפואיים ומסמכים. ללא שרת, ללא עלות.

- **אתר:** GitHub Pages (HTML + JS סטטי, עברית, RTL, mobile-first)
- **Backend:** Google Apps Script (Web App)
- **נתונים:** Google Sheets (master) · Google Drive (מסמכים) · Google Calendar (תזכורות)

התיעוד המלא: [`docs/plan.md`](docs/plan.md) · יומן העבודה: [`docs/progress.md`](docs/progress.md)

## פריסה

| מה | פקודה |
|---|---|
| האתר | `git push` ל-`main` |
| ה-backend | `cd backend && clasp push --force && clasp create-deployment -i <deploymentId>` |

> **אף פעם לא** `create-deployment` בלי `-i` — זה יוצר deployment חדש ומשנה את כתובת ה-`/exec`.

## פרטיות

נתוני אמת (שמות, מספרי הפניות, פרטים רפואיים) לא נמצאים ב-repo הזה.
הם חיים רק ב-Google Sheet / Drive / Calendar הפרטיים. ה-PIN נשמר כ-Script Property בלבד.
