---
'@ankhorage/devtools': patch
---

Write managed repository files before running the dependency install so a sync cannot invalidate its own packaged asset paths. Preserve repository-specific Prettier options in a create-only local configuration while keeping the shared wrapper centrally managed.
