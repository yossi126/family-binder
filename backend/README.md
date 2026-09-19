# backend — Google Apps Script

| קובץ | תפקיד |
|---|---|
| `Config.gs` | קבועים, Script Properties, עזרי טקסט/תאריך |
| `Sheet.gs` | שכבת הגישה לגיליון (ה-master) |
| `Drive.gs` | תיקיות וקבצים |
| `Calendar.gs` | אירועי יומן |
| `Api.gs` | `doGet` / `doPost`, אימות PIN, טבלת ה-actions |
| `Migration.gs` | ייבוא חד-פעמי מהבוט הישן |
| `Setup.gs` | `setup()` — הרצה ידנית חד-פעמית |

## Script Properties נדרשים

| key | מי מגדיר | מה |
|---|---|---|
| `ROOT_FOLDER_ID` | המשתמש, לפני `setup()` | תיקיית הדרייב הקיימת |
| `CALENDAR_ID` | המשתמש, לפני `setup()` | היומן המשפחתי הקיים |
| `PIN` | המשתמש | קוד הכניסה לאתר. **לא בקוד, לא בצ'אט** |
| `SHEET_ID` | `setup()` | נכתב אוטומטית |

## פריסה

```
clasp push
clasp deploy -i <deploymentId>   # תמיד -i, אחרת כתובת ה-/exec משתנה
```
