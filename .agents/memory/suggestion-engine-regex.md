---
name: suggestion_engine.py regex character classes
description: How to write quote-matching regex character classes in Python raw strings without breaking the parser.
---

## Rule
In `backend/ai/suggestion_engine.py`, regex patterns that match quote characters must use `['"]` (single-quote then double-quote, no backslash), NOT `['\""]`.

**Why:** Inside a double-quoted raw string `r"..."`, the sequence `\"` is NOT an escape — Python sees the `"` as closing the string literal. The pattern `['\""]` therefore breaks the parser (SyntaxError or incorrect match). The fix `['"]` is a valid character class matching `'` or `"`.

**How to apply:** Whenever editing regexes in this file that need to match quotation marks, use `['"]` directly. This applies to all six regex calls in the rule-based NL parser section (split, remove-rows, rename, fill-missing).
