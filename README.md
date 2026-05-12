# pt-assess

PWA สำหรับตรวจร่างกายคนไข้กายภาพบำบัด — ใช้บนมือถือหน้างาน, sync กลับคอมเพื่อวิเคราะห์เคสด้วย Claude Code

## Stack
- HTML + Tailwind CDN + Alpine.js (no build)
- localStorage + JSON export
- GitHub Pages host

## Forms (planned)
- [x] Stroke assessment (V0 MVP)
- [ ] Knee/LBP/Shoulder
- [ ] Pediatric / Geriatric balance

## Usage
1. Open `index.html` in browser (หรือ URL GitHub Pages)
2. iPhone: Add to Home Screen
3. กรอก → Save (localStorage) → Export JSON
4. JSON → คอม → Claude Code `/analyze-case` → full report
