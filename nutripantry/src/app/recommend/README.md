# Ingredient recipe search

Open `/recommend`, filter the ingredient dropdown by name, and select one or more
available ingredients. Selected ingredients appear as removable chips. Click
**Find recipes** to search published recipes throughout the catalogue.

- **Any matching ingredient** returns recipes sharing at least one selected name,
  ranked by the fraction of recipe ingredients available.
- **All recipe ingredients available** returns only recipes whose ingredient IDs
  are all included in the selection. Extra selected ingredients are allowed.
- Results show coverage, matched names, missing names, prep time, calories and
  expandable cooking instructions.
- Clear selection edits the form; Reset results returns to pantry recommendations.
- This is an ingredient-name search, without quantities, unit conversion, expiry
  validation, or semantic/vector search. It does not modify pantry stock.

Implementation: GET form with repeated `ingredient` parameters and a `mode`
parameter, handled by the existing server page. A parameterised SQL CTE aggregates
matches and missing ingredient names. No schema migration or embedding service is
required. Ingredient options come from the master ingredient table.

Verification: JSX compilation and controlled checks passed for validation,
duplicate removal, search selection/removal, option filtering and SQL mode
parameters. Database calls were mocked; live SQL execution and browser behaviour
are not verified by those checks.
