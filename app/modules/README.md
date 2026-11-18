# Backend modules

Modules own backend behavior and their meaningful I/O adapters. Business domains use policy/use-case/port boundaries where useful; technical modules need only the layers they use.

Library owns scoped metadata and ready catalog queries; ingest owns durable processing/publication; playback owns grants, resource authorization and recommendations; playlist owns membership/order. Shared protected-media formats live in the technical `media-assets` module, with no empty application/domain layers. Explicit module contracts and composition adapters connect these responsibilities without importing another business module's infrastructure.

See the current [architecture](../../docs/architecture.md) and canonical [repository guidance](../../AGENTS.md). Do not create speculative layers or parallel old/new module implementations.
