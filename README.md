# Overlöd prototype

Clickable prototype of the Overlöd V1 screens, built from the Claude Design canvas.

Open `index.html` (it forwards to the Train screen). Every screen is a standalone page:
`Main.dc.html` (Train), `Achievements.dc.html` (Progress), `Stats.dc.html`, `Exercises.dc.html`,
`ExerciseDetail.dc.html`, `Templates.dc.html` (Sessions).

`support.js` is a small runtime that renders the `.dc.html` templates in any browser.

URL options: `Achievements.dc.html?dark=1` (dark Progress), `ExerciseDetail.dc.html?exercise=Back%20squat`.
State resets when you move between tabs; each page is its own prototype.
