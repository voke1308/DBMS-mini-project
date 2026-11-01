# NutriPantry

Goal-based recipe recommendations from available pantry ingredients.

DBMS Experiential Learning - Level 3 Mini Project

Ojas Binjola (PES1UG24CS307), Prajin Ravi Shankar (PES1UG24CS328)

The application lives in **`nutripantry/`**. Open that folder in VS Code to run it.

- [Setup and execution](nutripantry/README.md)
- [Current checkpoint, rubric status and remaining work](nutripantry/CHECKPOINT.md)
- [Database commands and model](nutripantry/db/README.md)
- [Existing ER diagram and design document](nutripantry/NutriPantry_Database_Design.pdf)

PostgreSQL stores structured accounts, ingredients, pantry stock, recipes and
nutrition goals. pgvector provides the storage and retrieval scaffolding for
recipe embeddings. Generating and populating those embeddings remains pending.

The current increment adds a searchable pantry interface and an add/top-up form
on top of the existing API. This is an intermediate checkpoint, not the completed
project or final report.
