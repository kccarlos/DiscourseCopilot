# Contributing

Thanks for your interest in improving DiscourseCopilot!

- **Bugs and ideas:** open an [issue](https://github.com/kccarlos/DiscourseCopilot/issues) using one of the templates. For security problems, see [SECURITY.md](SECURITY.md) instead.
- **Code changes:** see [DEVELOPMENT.md](DEVELOPMENT.md) for setup, the project structure, and how to run the tests and build.

Before opening a pull request:

1. Keep the change focused on one problem.
2. Run `pnpm test`, `pnpm check` (lint + format check; `pnpm format` fixes formatting) and `pnpm build`, and load `dist/` in Chrome to check the change by hand. CI runs the same checks.
3. Add or update tests for new logic.
4. Describe what changed and how you verified it in the pull request.

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
