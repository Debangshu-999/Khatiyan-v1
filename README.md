# Khatiyan

PG and hostel management — the digital khatiyan.

The name comes from the traditional South Asian *khatiyan* — a register documenting who occupies what land. This project carries the same spirit into the modern PG/hostel domain.

## Project skeleton

This is a fresh skeleton — all module folders are empty. Code goes in module by module.

```
src/main/java/com/khatiyan/
├── config/            Cross-cutting Spring configuration
├── shared/            Code used across all modules
│   ├── audit/
│   ├── exception/
│   ├── identity/
│   └── money/
├── auth/              MODULE: authentication (phone OTP + PIN, JWT)
├── property/          MODULE: properties, rooms, owners, managers
├── tenancy/           MODULE: tenants, tenancies, rent due dates
├── concern/           MODULE: tenant concerns/tickets
├── notice/            MODULE: property notice board
├── discovery/         MODULE: local listings + Google Places
├── notification/      MODULE: FCM, SMS, in-app notifications
└── payment/           MODULE: Razorpay integration, ledger, receipts
```

Each module follows the same internal layout:

```
<module>/
├── <Module>.java       Public facade — only entrypoint for other modules
├── api/                REST controllers and DTOs (HTTP boundary)
├── domain/             Entities and value objects
├── repository/         JPA repositories
├── service/            Business logic
└── event/              Domain events published to other modules
```

## Module boundary rules

- Other modules access a module **only** through its `<Module>.java` facade
- Domain entities, repositories, and services are not imported across module boundaries
- Cross-module communication is either a synchronous facade call or an async domain event
- Each module owns its own database schema and migration folder
- ArchUnit tests will enforce these rules at build time (added in the test phase)

## Migration numbering

Flyway migrations live under `src/main/resources/db/migration/<module>/` and are picked up via the `spring.flyway.locations` list in `application.yml`. Versions are globally ordered using a module prefix:

```
V0xxx — shared (schemas, extensions)
V1xxx — auth
V2xxx — property
V3xxx — tenancy
V4xxx — concern
V5xxx — notice
V6xxx — discovery
V7xxx — notification
V8xxx — payment
```

Each module has 999 migrations of headroom and the global ordering respects cross-module dependencies (auth before property before tenancy, etc.). Always create new migrations as new files; never edit applied migrations.

## Running locally

Prerequisites: Java 21+, Maven 3.9+, PostgreSQL 16 running with credentials matching `.env.example`.

```bash
# 1. Set up environment
cp .env.example .env
# edit .env with your local DB details

# 2. Create the database (one-time)
psql -U postgres <<'SQL'
CREATE USER khatiyan WITH PASSWORD 'localdev';
CREATE DATABASE khatiyan OWNER khatiyan;
GRANT ALL PRIVILEGES ON DATABASE khatiyan TO khatiyan;
SQL

# 3. Build and run (will work once code is written)
mvn spring-boot:run
```

## Build order

Modules are best built in dependency order:

1. `shared/` — base entity, exceptions, identity, money
2. `config/` — Spring configuration, security, async
3. `auth/` — authentication is needed by everything else
4. `property/` — properties and rooms
5. `tenancy/` — depends on auth + property
6. `notification/` — used by everything that fires events
7. `concern/` — depends on tenancy
8. `notice/` — depends on property
9. `discovery/` — depends on property
10. `payment/` — depends on tenancy

## License

Private project, all rights reserved.
