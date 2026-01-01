## 2024-05-23 - Semantic Disabling
**Learning:** UX elements often use visual cues (like opacity or cursor change) to indicate disabled states without using the actual `disabled` attribute or `aria-disabled`. This hurts accessibility as screen readers and keyboard users might still interact with them.
**Action:** Always pair visual disabled styles with `disabled` attribute for buttons/inputs and `aria-disabled="true"` for other interactive elements. Add tooltips or titles to explain *why* an action is disabled.
