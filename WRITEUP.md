# Brief Write-Up

Priority order: (1) end-to-end ticket lifecycle with role-based access and real-time updates; (2) AI integration (classification into six exact categories, four priority levels, KB-grounded draft responses with graceful degradation and cost-conscious context); (3) clean REST API with validation and meaningful errors; (4) dataset fidelity for all edge cases (production books, zero royalties, pending payouts, null fields).

Trade-offs: SQLite for zero-config local development with Prisma provider swappable to Postgres; no test infrastructure beyond a lightweight 3-case API suite; admin UI is functional over decorative. Prisma retained (schema, migrations, type-safe queries, seed upserts). Rate limiting, OpenAPI/Swagger UI, and deterministic fallbacks added. WebSocket auth enforced, internal notes isolated at query level.

Production evolution: managed Postgres, migration of richer sort/filter and pagination, file attachments, expanded automated tests (WS, AI mocked provider, authorization), prompt regression eval, and token-usage telemetry.
