# handoff — family-binder

עודכן: 2026-09-19, סוף סשן המימוש הראשון.

## איפה אנחנו

| Phase | מצב |
|---|---|
| 0 שלד | ✅ |
| 1 Backend (Apps Script) | ✅ אומת חי, 32/32 ב-`backend/test-api.sh` |
| 2 Frontend | ✅ אומת חי ב-390/1280 (Playwright) |
| 3 מיגרציה מהבוט | ✅ 13 תורים · 13 תיקיות · 11 מסמכים `missing` · 7 הערות · 13→13 אירועים ביומן (0 כפולים) |
| 4 GitHub Pages | ✅ חי, CORS אומת מה-origin האמיתי |
| עיצוב | ✅ Heebo בלבד · מצב כהה הוסר · פלטת iOS (כחול מערכת, `#F2F2F7`) |
| **S5 בדיקה באייפון** | ⏳ **הצעד הבא** — לא בוצע |
| Phase 5 / S6 כיבוי הבוט | ⏳ אחרי S5 |

## מזהים תפעוליים (לא סודות)

| מה | ערך |
|---|---|
| אתר (Pages) | https://yossi126.github.io/family-binder/ |
| repo | https://github.com/yossi126/family-binder |
| Apps Script scriptId | `1PLyZP7Vl-dtaOPodtCE3oeC1q5-76oY0QMmVtcNCa95Tk2dCuh2Mn4Hj` |
| deployment id | `AKfycbwohxgzwAZOILyiA2GnO6WY35nK1hZU-bHx0txYKnOfrVhIGp5zE_ePL2kSViIM4WHj` |
| `/exec` URL | ב-`site/config.js` וב-`backend/.exec-url` |
| deployment version חי | `@5` |
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

1. המשתמש מבצע S5 (ראה `docs/next-session-prompt.md`). ממתינים ל-`iphone: ok` + פידבק על הפלטה.
2. אם נשבר משהו באייפון → תיקון, `git push`, אימות חי חוזר.
3. Phase 5: גיבוי `family_agent.db` מה-VM ל-`migration/` (git-ignored), ואז **S6** — המשתמש מאשר `sudo systemctl disable --now family-agent`.
4. סיום: README קצר למשתמש הקצה (איך מוסיפים תור / מעלים מסמך / מחליפים PIN), handoff סופי.

## דברים לדעת

- **תיקיית בדיקה אחת** נשארה תחת `ארכיון/` בדרייב (מה-`test-api.sh`). לא מזיקה; אפשר למחוק ידנית.
- `docs/screenshots/` מכיל 3 צילומים מהעיצוב **הישן** (טורקיז). נתוני בדיקה בלבד. לעדכן או למחוק.
- דטקטור impeccable רץ במצב degraded (בלי htmlparser2) — ממצאיו הם undercount.
- `clasp create-script` דורס את `appsscript.json` — אחרי create תמיד `git checkout appsscript.json` לפני push.
- `curl -L` נכשל מול Apps Script (411). ההארנס עושה POST → קורא `redirect_url` → GET.
- הקאש של Safari עקשן: אחרי deploy עיצובי, לרענן חזק / לסגור ולפתוח מהמסך הבית.
