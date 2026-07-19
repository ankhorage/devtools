---
'@ankhorage/devtools': patch
---

Keep ESLint 10 and wrap the React Native ESLint plugin with `@eslint/compat` so React Native and Expo profiles can run legacy plugin rules without `context.getSourceCode is not a function` crashes.
