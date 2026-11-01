# Pantry frontend checkpoint

This increment covers the pantry interface and missing local setup files.
The project remains incomplete. Status below is based on source review, not a
claim that all database operations have been executed or marks awarded.

## Evaluation rubric status (50 marks)

| Rubric | Marks | Current evidence and remaining work |
|---|---:|---|
| ER diagram | 2 | Existing design PDF; reconcile its eight relational tables with the additional vector table in code. |
| Relational schema, keys, relationships, constraints | 3 | `db/01_schema.sql`; design PDF differs in types/defaults and needs updating. |
| SQL DDL with constraints | 4 | Nine tables and ALTER/DROP statements in source; live execution evidence pending. |
| NoSQL/vector creation | 4 | pgvector extension, vector(384) table and cosine index in source; verify on running DB. |
| Technology justification | 1 | App README explains PostgreSQL and pgvector choices. |
| DML operations | 4 | Seed INSERT, API upsert and SELECT exist; complete meaningful DELETE and demonstrate all four. |
| Nested/correlated/recursive and join queries | 4 | Joins and correlated count subqueries in views, nested query in db README; execution evidence and any required recursive example pending. |
| Advanced SQL: procedure/function, trigger, CTE | 6 | Three functions, one procedure, three triggers and four views in source; add a meaningful CTE example and capture results. |
| NoSQL/vector feature and CRUD | 7 | Retrieval SQL and embedding invalidation DELETE exist; embedding job only prints planned work. Populate vectors, demonstrate CRUD and similarity retrieval. |
| Next.js interface | 3 | Dashboard, login, pantry, recommendations and admin pages; pantry increment adds filters and add/top-up UI. Browser verification pending. |
| Backend/API/database integration | 2 | Existing `pg` pool, route handlers and transactions; pantry form now calls existing POST. Live integration check pending. |
| Authentication and two roles, including database RBAC | 4 | Signed cookie auth and app-level admin guard exist. Database roles/GRANT or equivalent enforcement are missing. Verify seeded login and access isolation. |
| Documentation, Git/GitHub | 2 | Setup docs, SQL examples and project tree present. Final report, screenshots and user-created commits pending. |
| Originality, individual contribution, modification/viva | 4 | Each member must explain and demonstrate their actual work; keep commits and contribution notes accurate. |
| Total | 50 | Completion status only; no predicted score. |

## Work completed in this increment

- Pantry summaries, ingredient search, category/freshness filters and empty states.
- Add/top-up form for signed-in users through the existing API/procedure.
- Read-only anonymous demo, field labels, status feedback and responsive styles.
- SQL DATE formatting on the server to avoid timezone shifts in expiry display.
- Missing `.gitignore` and `.env.example`; corrected app-folder and Docker setup.
- Removed an unsupported Next.js config key; kept the existing Next.js 14 setting.

## Manual acceptance checks still to run

Use the seeded demo database only. Record actual outcomes rather than marking
these passed in advance.

| Check | Expected result |
|---|---|
| Anonymous `/pantry` | Demo stock and filters; no add form. |
| Search `RICE` or surrounding spaces | Case-insensitive, trimmed ingredient matching. |
| Combine category and freshness | Both filters apply and count updates. |
| Search a nonexistent ingredient | Empty result message; Clear filters restores stock. |
| Sign in and select an ingredient | Form displays its unit and current quantity if present. |
| Add a new ingredient | Success message and refreshed inventory after server save. |
| Top up existing ingredient by 10 | Quantity increases by 10, rather than becoming 10. |
| Blank expiry on top-up | Existing expiry remains unchanged. |
| Past expiry date | DB trigger error displayed; stock unchanged. |
| Zero/negative quantity | Browser form rejects submission. |
| Missing/expired session on save | API 401 shown as sign-in feedback. |
| Failed network request | Error shown, controls enabled for retry. |
| 375px viewport and keyboard navigation | Controls usable, table scrolls, focus visible. |
| Different seeded user | Pantry reads/writes use that account, not the demo account. |

Automated checks passed: JSX compilation; guest/signed-in/empty server rendering; controlled search/filter/reset handlers; top-up request payload; success refresh; 401 feedback and form preservation; offline seed-password bcrypt comparison. API/router behavior was mocked for handler checks.
Production build blocked by a Node worker memory allocation failure. Live database
verification blocked by a Docker engine error. No browser screenshot is claimed.

## Intentionally left for later

- Pantry edit, delete and purchase-batch handling.
- Nutrition goal editor and saved-recipe controls.
- Real embedding generation, dataset import and semantic-search UI.
- Database roles/permissions and stronger session/route protection.
- CTE/other missing query demonstrations and database test evidence.
- Framework dependency update and regression verification.
- Final report and presentation screenshots.

## Final report outline from the instructor's email

1. Title page: course title/code, project title, both names and SRNs. Confirm the
   actual course code; do not invent it.
2. Abstract: problem, approach and the final demonstrated outcome.
3. Tech stack and database technology justification.
4. SQL commands: schema, constraints, indexes, DML, joins/subqueries, functions,
   procedure, triggers and CTE; include executed results.
5. Vector commands: extension/table/index creation, embedding model and source
   text, real CRUD examples, similarity metric and retrieval results.
6. Next.js project tree (starting point in the app README).
7. Actual application code and demo screenshots after live testing.
8. Evaluation rubric completion status, using the table above and updating it
   only when the corresponding work has been verified.

The two-member contribution section should describe actual responsibility and
changes. The design document, implementation and screenshots must agree before
submission. This checkpoint is not the final report.
