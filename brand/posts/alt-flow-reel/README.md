# ריל "אכלתי משהו אחר" — פוסט #5

`alt-flow.mp4` — 1080×1920 (9:16), ‏~24 שניות, 30fps. הקלטת מסך אמיתית של האפליקציה: הוק על היום המסודר ← טאפ על "אכלתי משהו אחר" ← בחירת משולש פיצה מהבורר ← "עדכן ובנה מחדש" ← הבאנר הירוק והיום המעודכן ← נעילת מותג.

## שחזור

```bash
cd brand/posts
node record-alt-flow.mjs        # → alt-flow-reel/raw *.webm
FF="C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/ffmpeg-static/ffmpeg.exe"
cd alt-flow-reel
"$FF" -i <raw>.webm -vf "scale=1080:1920:flags=lanczos" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart -y alt-flow.mp4
```

הסקריפט מריץ chromium מקומי (playwright-core מ-web-to-reels), file:// על index.html, פרופיל קבוע (גבר 30, שמירה, צהריים), כיתובים צרובים בעברית וטבעת-טאפ על כל קליק. הכיתוב לפוסט + הוראות סטורי: `internal/POST-LOG.md` (#5).
