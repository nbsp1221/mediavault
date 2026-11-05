# Server composition

This directory owns explicit server-side dependency assembly and cross-module adapters, not duplicated business logic or a generic DI framework. Routes consume the assembled services instead of creating database, filesystem, or media-tool dependencies.

Server-only HTTP helpers live in `app/routes/.server/`; the framework's public route registry remains explicit. See [architecture](../../../docs/architecture.md) for lifecycle and browser/server boundaries.
