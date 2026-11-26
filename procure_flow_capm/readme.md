# ProcureFlow — CAP application

See the [root README](../README.md) for the full description.

```bash
npm install
npx cds watch          # http://localhost:4004/procureflow/webapp/index.html (demo users U1..U5, password = user id)
npm test               # end-to-end API tests
mbt build && cf deploy mta_archives/*.mtar   # SAP BTP Cloud Foundry
```

| Folder | Content |
|---|---|
| `db/` | CDS domain model + CSV seed data |
| `srv/` | OData V4 service + business logic (approval matrix, budget, 3-way match, payments) |
| `app/procureflow/` | SAPUI5 freestyle Fiori app |
| `app/router/` | SAP Application Router (XSUAA) |
| `test/` | `node --test` end-to-end tests |
