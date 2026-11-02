# Project rules for Codex

- The project name is **LORE** and must stay LORE in UI titles and docs (for example, "the LORE overlay" and "THE LORE OF <channel>").
- Never use the em dash character (U+2014) anywhere: not in code, UI text, comments, chat messages, or docs. Use a comma, colon, period, parentheses, or a plain hyphen instead.
- The sandbox has no network access. Do not run npm install or call Twitch/OpenAI. Tests must be offline.
- Keep files small and well organized. Plain JS (ESM), no build step.
