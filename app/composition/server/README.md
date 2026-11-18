# Server composition

This directory owns explicit server-side dependency assembly and cross-module adapters, not duplicated business logic or a generic DI framework. Routes consume the assembled services instead of creating database, filesystem, or media-tool dependencies.

Playback and playlist catalog adapters consume the library-owned `ReadyVideoCatalogPort` and implement the consumer's port. They translate projections and playlist item metadata without owning library SQL, access predicates or media readiness. Playback owns related-video selection. Keep actual implementation construction in the corresponding `*.server.ts` composition entry point.

Server-only HTTP helpers live in `app/routes/.server/`; the framework's public route registry remains explicit. See [architecture](../../../docs/architecture.md) for lifecycle and browser/server boundaries.
