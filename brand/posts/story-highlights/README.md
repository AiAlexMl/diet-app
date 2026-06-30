# Story Highlights — @shapeatapp

נכסי סטורי + שערי הילייט (1080×1920, מותג ShapEat). מקור = HTML, פלט = PNG.

## הנכסים
| קובץ | שימוש |
|------|-------|
| `story-product.png` | פריים סטורי: "מה זה ShapEat" (להילייט המוצר) |
| `story-coach-1.png` | פריים סטורי: "האפליקציה שלך, המותג שלך" (הילייט מאמנים, ראשון) |
| `story-coach-2.png` | פריים סטורי: "גרסת המאמנים בדרך" + CTA (הילייט מאמנים, שני) |
| `cover-product.png` | שער הילייט "ShapEat" (אייקון צ'ק-ליסט) |
| `cover-coach.png` | שער הילייט "למאמנים" (אייקון משקולת) |

## סדר העלאה (תקציר)
- **הילייט "ShapEat":** הריל (כבר סטורי) + `story-product` (סטיקר לינק → shapeat.co.il). שער = `cover-product`.
- **הילייט "למאמנים":** `story-coach-1` ואז `story-coach-2` (סטיקר לינק → shapeat.co.il/coaches). שער = `cover-coach`.

הוראות מפורטות: בשיחה / בהמשך אפשר לתעד ב-POST-LOG.

## לרנדר מחדש
```bash
cd brand/posts/story-highlights
node shot-story.mjs story-product.html story-coach-1.html story-coach-2.html cover-product.html cover-coach.html
```
(playwright-core + chromium מקומי, אותו pipeline כמו `shot-single.mjs`. בדיקה ויזואלית: `node shot-story.mjs _contact.html`.)
