# family-binder — תוכנית מימוש

> ## ✅ התוכנית הושלמה — 2026-09-20
>
> **המסמך הזה הוא היסטורי.** הוא מתאר את התוכנית כפי שנכתבה מראש, בזמן עתיד,
> ולא את המצב הנוכחי. כל השלבים (0–5) ונקודות העצירה (S1–S6) בוצעו:
> האתר חי, הבוט הישן כובה, וה-DB גובה מקומית.
>
> **למצב עדכני:** [`handoff.md`](handoff.md) · **למה קרה בפועל:** [`progress.md`](progress.md)
> · **למשתמש הקצה:** [`user-guide.md`](user-guide.md)
>
> קרא כאן רק כדי להבין *למה* הארכיטקטורה כזו. מקומות שבהם המימוש סטה מהתוכנית
> מתועדים ב-`progress.md` תחת "שינוי מהתוכנית".

> מחליף את הבוט `digweed-personal-agent` (טלגרם + LLM + VM) באתר פשוט שהמשפחה מנהלת בעצמה.
> נכתב 2026-09-19. המוקאפ המאושר: `mockup/index.html`. נתוני הבוט: `migration/bot-export.json`.

## 0. עקרונות שאין לשנות

- **אפס שרת, אפס LLM, אפס עלות.** GitHub Pages (סטטי) + Google Apps Script (backend) + Google Sheets / Drive / Calendar.
- **ה-Sheet הוא ה-master.** שורה לכל תור מחזיקה `event_id` (יומן) ו-`folder_id` (דרייב). יומן ודרייב הם השלכות של ה-Sheet, לא מקורות אמת.
- **כל כתיבה עוברת דרך ה-API.** האתר לא פונה ישירות ליומן/דרייב.
- **Plain HTML + vanilla JS, בלי build, בלי framework.** RTL, עברית, mobile-first (רוב השימוש מאייפון).
- **מסמכים לא נמחקים.** מחיקת תור מעבירה את התיקייה ל-`ארכיון/`.
- **היקף:** תורים + מסמכים לכל תור + הערות + מסמכים כלליים. **לא** הפניות / TODO / תרופות.
- **פרטיות:** נתוני אמת (שמות רופאים, מספרי הפניות) לא מופיעים בקוד, במוקאפים, בצ'אט ובקבצי דוקומנטציה. הם חיים רק ב-Sheet/דרייב/יומן ובקובץ הייצוא (git-ignored).
- **PIN** לא נכתב בקוד ולא בצ'אט — נשמר כ-Script Property ב-Apps Script ומוקלד ידנית ע"י המשתמש.

## 1. ארכיטקטורה

```
iPhone / מחשב ──HTTPS──▶ GitHub Pages (site/)  ──fetch POST──▶ Apps Script /exec (backend/)
                                                                 │  runs as the owner's Google account
                                                                 ├─▶ Google Sheet   (master: appointments, documents, notes)
                                                                 ├─▶ Google Drive   (root: existing "אמא — מסמכים רפואיים" folder)
                                                                 └─▶ Google Calendar (existing family calendar)
```

מזהי היומן ותיקיית ה-root קיימים ב-`migration/bot-export.json` → `meta`. משתמשים בהם כמו שהם, לא יוצרים חדשים.

### 1.1 Sheet — `family-binder-data` (נוצר ע"י `setup()`)

| tab | columns |
|---|---|
| `appointments` | `id`, `doctor`, `specialty`, `date` (YYYY-MM-DD), `time` (HH:MM), `location`, `companion`, `event_id`, `folder_id`, `created_at`, `updated_at` |
| `documents` | `id`, `appointment_id` (ריק = כללי), `file_id`, `file_name`, `mime`, `size`, `description`, `web_view_link`, `status` (`ok` / `missing`), `uploaded_at` |
| `notes` | `id`, `appointment_id`, `text`, `created_at` |
| `meta` | `key`, `value` (`schema_version`, `root_folder_id`, `calendar_id`, `appts_folder_id`, `general_folder_id`, `archive_folder_id`) |

`id` = `Utilities.getUuid()`. תאריכים כטקסט ISO, לא כתאריכי Sheets (מונע בלגן timezone).

### 1.2 Drive

```
אמא — מסמכים רפואיים/          ← root קיים (meta.GOOGLE_DRIVE_FOLDER_ID). לא נוגעים בקבצים הקיימים בו.
  תורים/
    2026-10-04 – <doctor> – <specialty>/   ← תיקייה לכל תור, שם נגזר מהשורה, משתנה בעדכון
  כללי/                         ← מסמכים כלליים, שטוח
  ארכיון/                       ← תיקיות של תורים שנמחקו
```

### 1.3 Calendar

אירוע לכל תור ביומן הקיים (meta.GOOGLE_CALENDAR_ID): title `‎<doctor> – <specialty>`, start = date+time, משך שעה, `location`, `description` = מלווה + קישור לתיקייה + ההערות. עדכון תור → עדכון אירוע; מחיקה → מחיקת אירוע. אירועים שהבוט יצר מקושרים לפי `gcal_event_id` מהייצוא (ראה §5).

### 1.4 API (Apps Script Web App)

- **Transport:** `POST /exec`, body = JSON **כ-`text/plain`** (מונע preflight — Apps Script לא עונה ל-OPTIONS). `fetch` עם `redirect:'follow'` (Apps Script עונה 302 ל-googleusercontent).
- **Envelope:** request `{ pin, action, ...params }` → response `{ ok:true, data }` או `{ ok:false, error }`. PIN שגוי → `error:"unauthorized"`.
- **`doGet`** → `{ ok:true, version, time }` לבדיקת חיים ולאימות איזה deployment רץ.
- **LockService** על כל כתיבה (שני משתמשים).

| action | params | effect |
|---|---|---|
| `bootstrap` | — | כל התורים + מסמכים + הערות בקריאה אחת (טעינה ראשונית) |
| `appointments.create` | doctor, specialty, date, time, location, companion, firstNote? | event → folder → row (בסדר הזה; אם השורה נכשלת, מנקים event+folder) |
| `appointments.update` | id, fields… | row + event + rename folder |
| `appointments.delete` | id | delete row + event, move folder → `ארכיון/`, מסמכים נשארים בשורות עם `appointment_id` ישן (היסטוריה) |
| `notes.add` | appointmentId, text | row + append ל-description של האירוע |
| `documents.upload` | appointmentId (או null), fileName, mimeType, base64, description?, replaceId? | `folder.createFile(blob)` → row (`replaceId` = ממלא placeholder `missing`) |
| `documents.update` | id, description | עדכון תיאור |
| `documents.delete` | id | trash file + delete row — רק לקובץ שהועלה בטעות |
| `documents.sync` | appointmentId? | reconcile: קבצים שנוספו ידנית בדרייב נכנסים לאינדקס (nice-to-have) |

מגבלות: גוף בקשה ≤ ~50MB ב-Apps Script → הלקוח מכווץ תמונות (canvas, צלע ארוכה 1600px, JPEG 0.82) לפני העלאה; PDF עובר כמו שהוא; חוסמים קבצים > 20MB עם הודעה ברורה.

`appsscript.json`: `timeZone: "Asia/Jerusalem"`, `runtimeVersion: "V8"`, `webapp: { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" }`, `oauthScopes` מפורשים: spreadsheets, drive, calendar.

### 1.5 Frontend (`site/`)

```
site/
  index.html          ← מבנה מהמוקאפ
  styles.css          ← CSS מהמוקאפ (tokens, light/dark, RTL)
  app.js              ← state, rendering, routing (hash: #/appt/<id>, #/docs)
  api.js              ← fetch wrapper, PIN, envelope, retries, error → toast
  config.js           ← API_URL בלבד (לא סוד)
  manifest.webmanifest, icons/   ← "הוסף למסך הבית" באייפון (apple-touch-icon, theme-color)
```

- PIN: בפעם הראשונה מסך הקלדה קטן → `localStorage`. `unauthorized` מנקה ומבקש שוב.
- Cache: תוצאת `bootstrap` האחרונה ב-`localStorage` → ציור מיידי, ואז רענון ברקע.
- כל פעולה: spinner על הכפתור, toast הצלחה/שגיאה בעברית, אין optimistic updates (פשטות).
- העלאה: `<input type="file" accept="image/*,application/pdf" multiple>` (באייפון פותח מצלמה/גלריה/קבצים), progress לכל קובץ.
- "פתח" = `web_view_link` בטאב חדש (Drive מציג PDF/תמונה, ומשם הדפסה/שיתוף). "שתף" = `navigator.share({url})` כשזמין, אחרת העתקת קישור.
- הרשאות צפייה בקבצים: תיקיית ה-root משותפת לאחות בדרייב (צעד ידני, §S5).

## 2. שלבי מימוש

כל שלב נגמר ב-**אימות חי** (לא קומפילציה) ובעדכון `docs/progress.md`. נקודות עצירה מסומנות **S#** — רק בהן עוצרים ומבקשים משהו מהמשתמש; בכל השאר ממשיכים לבד.

### Phase 0 — שלד הפרויקט
1. `git init`, `.gitignore` (`migration/*.json`, `backend/.clasp.json`? — לא: `.clasp.json` מכיל רק scriptId, נשאר; `node_modules/`, `.playwright-mcp/`).
2. מבנה: `site/`, `backend/`, `docs/`, `mockup/` (נשאר כרפרנס), `migration/`.
3. `docs/progress.md` (יומן חי), `CLAUDE.md` כבר קיים — לעדכן אם השתנה משהו.
4. **S1 — המשתמש:** יוצר repo **ציבורי** `family-binder` ב-GitHub (בלי README) ומדביק את ה-URL. אני מוסיף remote ודוחף.

### Phase 1 — Backend ב-Apps Script
1. בדיקה: `node --version`. אם יש Node → `npm i -g @google/clasp`. אם אין → fallback: קוד מודבק ידנית בעורך (המשתמש מדביק, אני מייצר קובץ אחד מאוחד).
2. **S2 — המשתמש:** (א) מפעיל Apps Script API ב-https://script.google.com/home/usersettings ; (ב) מריץ `clasp login` (דפדפן) בחשבון גוגל **הפרטי** שבו היומן והדרייב.
3. `clasp create --type webapp --title "family-binder" --rootDir backend` ; כתיבת `backend/Code.gs` (+ `Sheet.gs`, `Drive.gs`, `Calendar.gs`, `Api.gs`), `appsscript.json`.
4. `setup()`: יוצר את ה-Sheet עם הטאבים והכותרות, יוצר `תורים/`, `כללי/`, `ארכיון/` תחת ה-root הקיים, כותב `meta`. אידמפוטנטי (בודק לפני שיוצר).
5. **S3 — המשתמש:** `clasp open` → מריץ `setup()` פעם אחת בעורך → מאשר הרשאות; ב-Project Settings → Script Properties מוסיף `PIN` (המשתמש בוחר, לא מקליד לי). מדווח "בוצע".
6. `clasp push && clasp deploy -d "v1"` → שומרים את **deployment id** ו-**/exec URL** ב-`docs/progress.md` (לא סוד). כל deploy עתידי: `clasp deploy -i <id>`.
7. **אימות חי (Tier 2):** `curl` ל-`doGet`; ואז סבב מלא ב-curl עם PIN (המשתמש מקליד את ה-PIN לקובץ מקומי git-ignored `backend/.pin` שממנו ה-curl קורא — או מריץ את פקודות ה-curl בעצמו): create → נוצרו שורה + אירוע + תיקייה; update → שם התיקייה והאירוע השתנו; notes.add; documents.upload של PDF קטן → הקובץ בתיקייה; delete → התיקייה ב-`ארכיון/`, האירוע נעלם. בדיקת PIN שגוי → unauthorized. ניקוי: מוחקים את תיקיית הבדיקה מהארכיון.

### Phase 2 — Frontend
1. העתקת המוקאפ ל-`site/` ופיצול ל-`index.html / styles.css / app.js`. מחליפים את נתוני הדוגמה ב-`api.js` + `bootstrap`.
2. מסך PIN, טעינה, שגיאות, cache.
3. העלאה אמיתית: קריאת קובץ → כיווץ תמונה → base64 → `documents.upload` עם progress. מסמכים במצב `missing` מציגים "העלה" עם `replaceId`.
4. ניתוב ב-hash כדי ש-"חזרה" באייפון תעבוד, ושאפשר לשלוח קישור לתור ספציפי.
5. manifest + אייקונים + meta ל-iOS.
6. **אימות חי:** `python -m http.server` ב-`site/` + Playwright ב-390px וב-1280px מול ה-backend האמיתי: bootstrap מציג את הנתונים, יצירת תור בדיקה, העלאת קובץ, מחיקה + ניקוי. צילומי מסך ל-`docs/screenshots/` (בלי נתוני אמת — משתמשים בתור הבדיקה בלבד).

### Phase 3 — מיגרציה מהבוט
1. פעולת API חד-פעמית `migration.import` (או סקריפט `migration/import.gs` שרץ פעם אחת מהעורך) שקורא JSON ומבצע: לכל תור → שורה + תיקייה; אם `gcal_event_id` קיים ו-`CalendarApp.getEventById` מוצא אותו → מקשרים; אחרת יוצרים אירוע חדש. לכל מסמך → שורה `status: missing` עם `description` והקישור לתור לפי `appointment_ids` (ריק → כללי). ההערה היחידה → `notes`.
2. הזרמת הנתונים: ה-JSON נשלח ל-API כ-body (הוא קטן, ~20KB). **הקובץ עצמו לא נכנס ל-git.**
3. **אימות חי:** 13 שורות בטאב, 13 תיקיות תחת `תורים/`, 0 אירועים כפולים ביומן (ספירה לפני/אחרי), 11 שורות `missing`. באתר: הרשימה מציגה את התורים, כל "חסר קובץ" מציג כפתור העלה.
4. אחר כך המשתמש מעלה מהטלגרם את המסמכים הרלוונטיים דרך האתר (לא חלק מהאוטומציה).

### Phase 4 — פריסה ל-GitHub Pages
1. `site/` נדחף ל-`main`. ‏`.nojekyll`. ‏`config.js` עם ה-URL של `/exec`.
2. **S4 — המשתמש:** Settings → Pages → Deploy from branch → `main` / `/site` (או root אם נחליט על מבנה שטוח). מדביק את כתובת ה-Pages.
3. **אימות חי:** Playwright מול כתובת ה-Pages (לא localhost): PIN → bootstrap → פתיחת תור. בדיקת CORS מול origin האמיתי.
4. **S5 — המשתמש:** פותח באייפון, "הוסף למסך הבית", בודק העלאת תמונה מהמצלמה. משתף את תיקיית ה-root בדרייב ואת היומן עם האחות (אם עדיין לא), שולח לה URL + PIN.

### Phase 5 — כיבוי הבוט
1. גיבוי: `scp` של `data/family_agent.db` מה-VM ל-`migration/` (git-ignored). כבר יש `bot-export.json`.
2. **S6 — המשתמש מאשר:** `sudo systemctl disable --now family-agent` על ה-VM. ה-VM עצמו נשאר עד שהמשתמש מרוצה מהאתר, ואז נמחק ידנית מקונסולת Oracle (לא בסקופ).
3. עדכון `docs/progress.md` + `docs/handoff.md` סופי, ו-README קצר בעברית: איך מוסיפים תור, איך מעלים מסמך, איך מחליפים PIN, איך עושים deploy לשינוי (`git push` לאתר / `clasp push && clasp deploy -i <id>` ל-backend).

## 3. הגדרת "גמור"
- מהאייפון: מוסיפים תור → מופיע ביומן של גוגל תוך שניות, יש תיקייה בדרייב, מעלים תמונה מהמצלמה ורואים אותה ברשימה, "פתח" מציג אותה, אפשר להדפיס/לשלוח משם.
- מהמחשב: אותו דבר ב-1280px, כולל עריכה ומחיקה.
- האחות פותחת את הכתובת, מקלידה PIN פעם אחת, רואה את אותם נתונים.
- הבוט כבוי, אין תהליך שדורש תחזוקה חוץ מ-`git push`.

## 4. סיכונים ידועים ומה עושים
- **Apps Script לא עונה ל-OPTIONS** → body תמיד `text/plain`; לא מוסיפים headers מותאמים.
- **302 redirect ב-/exec** → `fetch` default follows; ב-curl `-L`.
- **`getEventById` על מזהים מה-Calendar API** → מנסים גם `<id>` וגם `<id>@google.com`; אם לא נמצא — אירוע חדש (ואז הישן ביומן נשאר; לספור לפני/אחרי ולנקות ידנית).
- **גודל העלאה / זמן ריצה (6 דק')** → כיווץ תמונות בצד לקוח, קובץ אחד לבקשה, חסימת > 20MB.
- **שני משתמשים בו-זמנית** → LockService, ו-`bootstrap` מחדש אחרי כל כתיבה.
- **Sheets ממיר טקסט לתאריכים/מספרים** → כותבים דרך `setNumberFormat('@')` על העמודות, וקוראים עם `getDisplayValues()`.
- **URL של /exec משתנה** רק אם יוצרים deployment חדש — לכן תמיד `clasp deploy -i <id>`.
- **אין `gh` CLI מקומי** → כל פעולת GitHub שהיא לא `git push` היא S-point של המשתמש.
