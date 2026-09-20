import { describe,expect,it } from "vitest";
import { validateLocalSelectQuery } from "../src/core/data/querySecurity";

describe("local data SQL policy",()=>{
  it("allows a single SELECT or WITH query",()=>{
    expect(validateLocalSelectQuery("SELECT * FROM data WHERE amount > 0")).toMatch(/^SELECT/);
    expect(validateLocalSelectQuery("WITH x AS (SELECT * FROM data) SELECT * FROM x")).toMatch(/^WITH/);
  });

  it("blocks mutation, attachments, extensions, and multiple statements",()=>{
    for(const query of [
      "DELETE FROM data",
      "ATTACH 'other.db' AS other",
      "INSTALL httpfs",
      "LOAD httpfs",
      "PRAGMA database_list",
      "SELECT * FROM data; DROP TABLE data"
    ]){
      expect(()=>validateLocalSelectQuery(query)).toThrow(/DATA_QUERY_RESTRICTED/);
    }
  });

  it("blocks network and external file readers",()=>{
    for(const query of [
      "SELECT * FROM 'https://example.com/data.parquet'",
      "SELECT * FROM read_parquet('secret.parquet')",
      "SELECT * FROM read_csv_auto('file.csv')",
      "SELECT readfile('/etc/passwd')"
    ]){
      expect(()=>validateLocalSelectQuery(query)).toThrow(/DATA_QUERY_RESTRICTED/);
    }
  });
});
