---
'@ankhorage/devtools': patch
---

Skip mutating package synchronization when release recovery has verified the published version and canonical release commit, with either its exact tag or no finalized tag. A conflicting tag remains an error.
