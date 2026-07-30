# Security Policy

## Supported Versions

Imageryx is in Phase 1 (repository foundation) and has not yet reached a
tagged release. Security fixes land on `main` only.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately using one of:

1. [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) for this repository ("Security" tab → "Report a vulnerability").
2. Email andriipap01@gmail.com with details and, if possible, reproduction steps.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (a minimal example is ideal).
- The affected app/package and version or commit.

## What to expect

- Acknowledgement within a few days.
- An assessment of severity and, if confirmed, a plan for a fix.
- Credit in the fix's changelog entry, unless you prefer to stay anonymous.

## Scope notes for Phase 1

There are no production deployments, real storage/transformation providers,
uploads, or authenticated business routes yet — see [ROADMAP.md](ROADMAP.md).
Reports about the local health-check endpoints or dashboard shell are still
welcome (e.g. CORS misconfiguration, injection in the placeholder SVG
renderer), since those are real, running code.
