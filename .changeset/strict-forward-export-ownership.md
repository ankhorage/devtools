---
'@ankhorage/devtools': patch
---

Harden `ankhorage/no-forward-exports` so named package subpath entrypoints must own their exports, while root entrypoints and `index.*` barrels remain forwarding boundaries. The rule now also detects imported bindings that are re-exported through local export syntax, including aliased, type, and default exports.
