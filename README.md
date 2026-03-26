# MailFrame

An extensible IMAP webmail frontend with an easy theming and UI system.

## Overview

MailFrame is a backend-agnostic webmail frontend built for extensibility. Connect any IMAP-compatible backend through the provider contract, and customize the look and feel through the theming system without touching application logic.

## Goals

- Production-quality webmail shell that works with any IMAP backend
- Clean provider contract any backend adapter can implement
- Easy theming system with drop-in support for custom UI experiences
- Mobile-aware, accessible, and responsive by default
- Simple to self-host and extend

## Architecture

```
MailFrame Frontend (React + TypeScript)
    └── Provider Contract (REST API spec)
            ├── IMAP/SMTP Bridge (reference implementation)
            ├── Roundcube Adapter (optional)
            └── Any custom backend adapter
```

## Status

Version 1.0 — initial scaffold. See docs/roadmap.md for planned milestones.

## Getting started

Requirements: Node.js 20+, npm 10+

    npm install
    npm run dev

## License

GNU General Public License v3.0
