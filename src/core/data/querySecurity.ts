export function validateLocalSelectQuery(query:string):string {
  const trimmed=query.trim();
  if(!trimmed) return "";
  if(!/^(select|with)\b/i.test(trimmed)){
    throw new Error("DATA_QUERY_RESTRICTED: Only SELECT or WITH queries are allowed.");
  }
  if(trimmed.includes(";")){
    throw new Error("DATA_QUERY_RESTRICTED: Multiple SQL statements are blocked.");
  }
  if(/:\/\//.test(trimmed)||/\b(?:https?|ftp|file):/i.test(trimmed)){
    throw new Error("DATA_QUERY_RESTRICTED: Network/filesystem URLs are blocked.");
  }
  if(/\b(?:install|load|attach|detach|copy|export|import|pragma|call|create|insert|replace|update|delete|drop|alter|vacuum|reindex|analyze)\b/i.test(trimmed)){
    throw new Error("DATA_QUERY_RESTRICTED: Mutating, extension, and attachment statements are blocked.");
  }
  if(/\b(?:read_[a-z0-9_]+|glob|sqlite_scan|parquet_scan|csv_scan|json_scan|readfile|writefile|load_extension)\s*\(/i.test(trimmed)){
    throw new Error("DATA_QUERY_RESTRICTED: External file-reader functions are blocked.");
  }
  return trimmed;
}
