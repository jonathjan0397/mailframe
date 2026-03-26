# roundcube-modern

A modern webmail frontend with a pluggable backend and a custom theming system.

## Overview

roundcube-modern is a backend-agnostic webmail UI. Any mail backend that implements the provider contract can power the frontend. The theming system supports fully custom visual experiences without touching application logic.

## Goals

- A production-quality webmail shell that works with any IMAP/SMTP backend
- A clean provider contract any backend can implement
- A modular theming system with drop-in support for custom experiences
- Mobile-aware, accessible, and responsive by default

## Architecture

```
Frontend (React + TypeScript)
    └── Provider Contract (REST API spec)
            ├── Roundcube Bridge (reference implementation)
            ├── IMAP/SMTP Bridge (generic implementation)
            └── Any custom backend
```

## Status

Version 1.0 — initial scaffold. See `docs/roadmap.md` for planned milestones.

## Getting started

Requirements:
- Node.js 20+
- npm 10+

```bash
npm install
npm run dev
```

## License

GNU General Public License v3.0. See `LICENSE`.
