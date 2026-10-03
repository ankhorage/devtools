---
'@ankhorage/devtools': patch
---

Keep packed release verification strict for generic Node/Bun entrypoints while skipping platform-only
browser and React Native exports that do not explicitly declare a server runtime condition.
