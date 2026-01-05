# Palette's Journal

This journal documents critical UX and accessibility learnings.

## 2024-05-22 - [Initial Setup]
**Learning:** Establishing a journal helps track UX patterns and accessibility insights over time.
**Action:** Consult this journal before starting new tasks to ensure consistency and avoid repeating past mistakes.

## 2026-01-04 - [Custom Dropdown Accessibility]
**Learning:** Custom dropdowns often miss "escape to close" and "click outside to close" behaviors, which are critical for keyboard and mouse usability.
**Action:** Always implement `useClickOutside` and `Escape` key listeners for any non-modal overlay or dropdown.
