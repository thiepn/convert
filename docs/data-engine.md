# Phase 6 Spreadsheets, Structured Data & Databases

Phase 6 separates workbook semantics, analytical data conversion, and SQLite database handling instead of treating every table-shaped file as the same format.

## Engines

### SheetJS Community Edition 0.20.3

SheetJS handles workbook semantics and legacy spreadsheet formats:

- XLSX
- XLSM input
- XLSB
- XLS
- ODS
- FODS
- CSV / TSV bridge
- JSON / JSON Lines bridge

Inspection includes worksheet names, hidden state, used ranges, cell counts, formulas, merges, hyperlinks, named ranges, workbook metadata, date-1904 mode, and VBA payload detection.

SheetJS parses formula expressions but does not calculate workbook formulas. Formula policy is explicit:

- Preserve formulas where the target workbook format can represent them.
- Export cached/result values for flat data targets or when the user selects values mode.

VBA is never executed and macro payloads are not preserved into generated Phase 6 workbooks.

Multi-sheet workbooks can be kept as workbooks. CSV/TSV/JSON all-sheet exports return the first sheet as the primary file and additional sheets as sidecar files. Single-table targets such as Parquet, Arrow, JSON Lines, and SQLite require First sheet or Selected sheet.

### LibreOffice Calc WASM

The existing lazy LibreOffice browser runtime now provides spreadsheet fidelity routes for XLS/XLSX/ODS/CSV and PDF output.

Use fidelity mode when appearance, print layout, formulas as interpreted by Calc, page setup, and workbook rendering matter more than lightweight semantic conversion.

LibreOffice may recalculate formulas and update cached results. XLSM is not passed directly into the fidelity engine; macro-enabled OOXML first goes through the semantic SheetJS route so VBA is stripped rather than executed.

### DuckDB-Wasm 1.32.0

DuckDB-Wasm handles:

- CSV
- TSV
- JSON
- JSON Lines / NDJSON
- Parquet
- Apache Arrow IPC

CSV/JSON/Parquet sources are registered as local browser file handles using DuckDB browser file-reader access instead of first copying the whole source into JavaScript memory.

Arrow IPC currently uses Arrow JS and is memory-gated.

Outputs include CSV, TSV, JSON arrays, JSON Lines, Parquet with Zstandard compression, and Arrow IPC.

Inspection includes schema inference, row count, data types, nullability, and a 20-row preview.

### sql.js 1.14.2

SQLite is handled separately because sql.js loads the database into WebAssembly memory.

Inspection includes user tables and views, columns, row counts, PRAGMA user_version, PRAGMA application_id, and selected-table preview.

SQLite can export a selected local table to CSV/TSV/JSON/JSONL, or materialize a restricted read-only query result.

JSON/JSONL can be imported into a generated SQLite database with conservative type inference.

## Conversion graph

Examples:

    XLSX -> JSON       SheetJS
         -> Parquet    DuckDB

    Parquet -> JSON    DuckDB
            -> XLSX    SheetJS

    SQLite -> JSON     sql.js
           -> XLSX     SheetJS

    XLSX -> JSON       SheetJS
         -> SQLite     sql.js

    XLSX -> PDF        LibreOffice Calc fidelity route

## Restricted local SQL

The optional SQL transform is deliberately not a general DuckDB/SQLite shell.

Only one SELECT or WITH statement is accepted.

Blocked patterns include:

- multiple statements / semicolons
- INSTALL / LOAD
- ATTACH / DETACH
- COPY / EXPORT / IMPORT
- PRAGMA / CALL
- CREATE / INSERT / REPLACE / UPDATE / DELETE / DROP / ALTER
- VACUUM / REINDEX / ANALYZE
- URLs such as http://, https://, ftp:// and file:
- read_* external file readers
- parquet_scan / csv_scan / json_scan / sqlite_scan
- glob
- readfile / writefile / load_extension

For DuckDB inputs, the local source is exposed as a view named data. For SQLite, the query can read local tables in the opened database.

## CSV dialects

CSV inspection defaults to DuckDB automatic delimiter/dialect detection. Users can override comma, semicolon, pipe, or tab when needed.

## Large-file model

DuckDB:
- CSV/JSON/Parquet use browser file handles.
- result exports are materialized from DuckDB's virtual filesystem.
- Arrow IPC input is memory-gated around 128 MiB mobile / 512 MiB desktop.

SheetJS:
- workbooks are memory-backed.
- source gate is approximately 64 MiB on coarse/mobile devices and 192 MiB on desktop.

sql.js:
- SQLite databases are memory-backed.
- source gate is approximately 128 MiB mobile and 512 MiB desktop.
- flat export/import row counts are guarded around 100,000 rows mobile and 500,000 rows desktop.

These are application safety gates, not theoretical format limits.

## Validation

Outputs are independently reopened:

- workbooks through SheetJS
- CSV/TSV/JSON/Parquet/Arrow through DuckDB
- SQLite through sql.js

A non-empty byte buffer alone is not considered a successful conversion.

## Known limits

- SheetJS CE does not calculate Excel formulas.
- LibreOffice may calculate formulas differently from Microsoft Excel for unsupported/proprietary functions.
- VBA macros are never executed and are not preserved into generated Phase 6 workbook targets.
- Complex Excel charts, PivotTables, slicers, external data connections, conditional formatting, and proprietary features may not survive semantic SheetJS conversions.
- Parquet/Arrow represent one logical table; multi-sheet workbooks require selecting one sheet before these targets.
- sql.js does not provide disk-streaming SQLite access; large databases are explicitly rejected rather than risking tab crashes.
- DuckDB SQL is intentionally restricted and cannot access URLs, load extensions, attach files, or mutate the local analytical database through the user query field.
