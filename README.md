# הקלסר הרפואי (family-binder)

אתר משפחתי לניהול תורים רפואיים ומסמכים. ללא שרת, ללא עלות.

**סטטוס:** חי ופעיל — https://yossi126.github.io/family-binder/
הבוט הקודם בטלגרם (`digweed-personal-agent`) כובה ב-20/9/2026; הנתונים הועברו לכאן.

- **אתר:** GitHub Pages (HTML + JS סטטי, עברית, RTL, mobile-first)
- **Backend:** Google Apps Script (Web App)
- **נתונים:** Google Sheets (master) · Google Drive (מסמכים) · Google Calendar (תזכורות)

**למשתמש:** [`docs/user-guide.md`](docs/user-guide.md) — איך מוסיפים תור, מעלים מסמך, מחליפים קוד כניסה.

למפתח: **מצב נוכחי ומזהים** ב-[`docs/handoff.md`](docs/handoff.md) · יומן העבודה ב-[`docs/progress.md`](docs/progress.md) · [`docs/plan.md`](docs/plan.md) הוא התוכנית המקורית (היסטורי).

## פריסה

| מה | פקודה |
|---|---|
| האתר | `git push` ל-`main` |
| ה-backend | `cd backend && clasp push --force && clasp create-deployment -i <deploymentId>` |

> **אף פעם לא** `create-deployment` בלי `-i` — זה יוצר deployment חדש ומשנה את כתובת ה-`/exec`.

## פרטיות

נתוני אמת (שמות, מספרי הפניות, פרטים רפואיים) לא נמצאים ב-repo הזה.
הם חיים רק ב-Google Sheet / Drive / Calendar הפרטיים. ה-PIN נשמר כ-Script Property בלבד.
