# ריל #7 — "היום הוא המוצר"

ריל טיפוגרפי (HyperFrames, HTML→וידאו). זווית: התפריט הוא רק ההתחלה, **היום** (✓ + מעקב + החלפה) הוא המוצר.

- `today-is-the-product.mp4` — הנכס הסופי לפרסום (1080×1920, h264, 12.7ש', ~1.5MB).
- `today-reel.html` — המקור. עצמאי (טוען רק gsap + Heebo מ-CDN, אין נכסים מקומיים), אז אפשר לשחזר בכל scaffold של HyperFrames.

## לשחזר/לרנדר מחדש
HyperFrames מותקן מחוץ לריפו (`hyperframes-trial/`, on-demand). אם נמחק:

```bash
cd /c/Users/alexm/hyperframes-trial
npx hyperframes init trial --non-interactive --example blank --resolution portrait --skip-skills
cd trial && npm install ffprobe-static   # חובה לרינדור, לא מגיע עם init
```

ואז להעתיק את `today-reel.html` ל-`hyperframes-trial/trial/index.html` ולרנדר:

```bash
export PATH="/c/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/ffmpeg-static:$(pwd)/node_modules/ffprobe-static/bin/win32/x64:$PATH"
npx hyperframes lint && npx hyperframes validate && npx hyperframes inspect
npx hyperframes render --quality high --output renders/today-is-the-product.mp4
```

הכיתוב לפרסום + סטטוס: `internal/POST-LOG.md` (#7, בריפו הפנימי).
