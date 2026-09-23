# Security Policy

DiscourseCopilot runs with access to the Discourse forums you visit and stores your AI provider API keys in your browser, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead, report them privately through GitHub:
[Report a vulnerability](https://github.com/kccarlos/DiscourseCopilot/security/advisories/new)

Include the affected version, steps to reproduce, and the impact you expect. You should get an initial response within a week.

## Scope

In scope, for example:
- Requests the extension makes to a site other than the forum you are on or the AI provider you configured
- Leaking API keys, forum content, or chat history to another site or extension
- Prompt injection from forum content that makes the extension take actions (not just produce misleading text)

Out of scope: vulnerabilities in Discourse itself, in AI providers, or in Chrome.

## Supported versions

Only the latest release receives security fixes.
