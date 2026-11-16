# Penny

Before exploring or changing code here, load the `penny-codebase` skill (`.claude/skills/penny-codebase/`). It maps the features, data model, domain rules and conventions, so you don't have to rediscover them by reading files.

## Keep the knowledge current

Any change that adds, removes or changes a feature must update `.claude/skills/penny-codebase/` (SKILL.md and/or `references/`) in the same change. That includes:
- a page or route
- a persisted field or migration
- a category, type or subcategory
- an AI provider, model or prompt rule
- a convention

Delete entries from its "Known gaps" list when they're fixed. Before finishing, re-read the parts of the skill your change touches and correct anything now wrong.

## Checks

- There is no test suite. Run `npm run lint` and `npm run build`.
- For UI changes, drive the dev server in a headless browser. The skill's "Commands and verification" section describes how to seed data and mock the AI.
- Every new UI string goes in both `src/locales/en.js` and `src/locales/id.js`.
