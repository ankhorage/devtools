---
'@ankhorage/devtools': patch
---

Scope the recommended ESLint rules to each `createConfig()` file set so composing multiple shared configs does not leak core rules such as `no-unused-vars` across unrelated TypeScript files.
