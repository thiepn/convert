export interface PresentedIssue {
  code:string|null;
  title:string;
  message:string;
  recovery:string|null;
}

const RULES:Array<{
  codes:string[];
  title:string;
  message:string;
  recovery?:string;
}>=[
  {
    codes:["FORMAT_UNKNOWN"],
    title:"File format not recognized",
    message:"This file could not be identified reliably enough for local conversion.",
    recovery:"Check the file extension or try another copy of the file."
  },
  {
    codes:["FORMAT_UNSUPPORTED","ENGINE_UNAVAILABLE","IMAGE_ENGINE_UNAVAILABLE","OFFICE_ENGINE_UNAVAILABLE","NO_LOCAL_ROUTE"],
    title:"Conversion unavailable",
    message:"This browser does not currently have a safe local route for the selected conversion.",
    recovery:"Choose another output format, use Semantic structure mode where available, or try a browser with the required local engine support."
  },
  {
    codes:["MEMORY_BUDGET_EXCEEDED","DEVICE_MEMORY_LIMIT","PDF_MEMORY_LIMIT","PDF_QPDF_MEMORY_LIMIT",
      "SPREADSHEET_MEMORY_LIMIT","SQLITE_MEMORY_LIMIT","LEGACY_MEDIA_MEMORY_LIMIT","RAW_PREVIEW_MEMORY_LIMIT",
      "DOCUMENT_SEMANTIC_MEMORY_LIMIT","OFFICE_MEMORY_LIMIT","PSD_SIZE_LIMIT","MESH_SIZE_LIMIT","FONT_SIZE_LIMIT"],
    title:"File is too large for this device",
    message:"The conversion was stopped before unsafe memory use could destabilize this tab.",
    recovery:"Use a smaller file, a lower-memory conversion option, or Sequential batch mode."
  },
  {
    codes:["STORAGE_INSUFFICIENT","ARCHIVE_CREATE_BUDGET","ARCHIVE_EXTRACTION_BUDGET"],
    title:"Not enough safe local workspace",
    message:"The browser cannot reserve enough local space for this operation without exhausting its storage budget.",
    recovery:"Free browser/device storage, select fewer files, or choose a smaller output."
  },
  {
    codes:["PDF_PASSWORD_REQUIRED","ARCHIVE_PASSWORD_REQUIRED"],
    title:"Password required",
    message:"This file is encrypted and needs its password before it can be processed.",
    recovery:"Enter the file password and try again."
  },
  {
    codes:["PDF_PASSWORD_INCORRECT"],
    title:"Password was not accepted",
    message:"The supplied PDF password could not unlock this file.",
    recovery:"Check the password and try again."
  },
  {
    codes:["OUTPUT_INVALID"],
    title:"Output validation failed",
    message:"The converter produced data that did not pass the independent output checks, so it was not accepted as a successful result.",
    recovery:"Try a different output format or conversion route."
  },
  {
    codes:["NETWORK_PRIVACY_VIOLATION"],
    title:"Conversion stopped for privacy",
    message:"Unexpected external network activity was detected during the conversion.",
    recovery:"Reload the app and try again. The output was not accepted."
  },
  {
    codes:["ARCHIVE_BOMB_SUSPECTED","DOCUMENT_PACKAGE_UNSAFE","ARCHIVE_PATH_UNSAFE"],
    title:"Unsafe archive content blocked",
    message:"The archive/package triggered a security guard and was not expanded.",
    recovery:"Inspect the source archive with a trusted desktop tool before trying it again."
  },
  {
    codes:["DATA_QUERY_RESTRICTED"],
    title:"Query blocked",
    message:"This SQL query is outside the converter's read-only local query policy.",
    recovery:"Use one SELECT or WITH query without mutations, extensions, attachments, URLs, or external file-reader functions."
  },
  {
    codes:["RAW_PREVIEW_NOT_FOUND"],
    title:"No embedded RAW preview found",
    message:"This RAW file does not contain a usable embedded JPEG preview.",
    recovery:"Use a RAW developer for full sensor-data processing."
  },
  {
    codes:["CANCELLED"],
    title:"Conversion cancelled",
    message:"The local conversion was stopped.",
    recovery:"Resume the remaining batch tasks or run the conversion again."
  }
];

function extractCode(raw:string):string|null {
  const match=raw.trim().match(/^([A-Z][A-Z0-9_]{2,}):/);
  return match?.[1]??null;
}

function stripCode(raw:string):string {
  return raw.trim().replace(/^[A-Z][A-Z0-9_]{2,}:\s*/,"").trim();
}

export function presentIssue(input:unknown):PresentedIssue {
  const raw=input instanceof Error?input.message:String(input??"");
  const code=extractCode(raw);
  const rule=code?RULES.find(item=>item.codes.includes(code)):undefined;
  if(rule){
    return {
      code,
      title:rule.title,
      message:rule.message,
      recovery:rule.recovery??null
    };
  }

  if(/No local conversion route is available/i.test(raw)){
    return {
      code:"NO_LOCAL_ROUTE",
      title:"Conversion unavailable",
      message:"This browser does not currently have a safe local route for the selected conversion.",
      recovery:"Choose another output format."
    };
  }

  if(/abort|cancel/i.test(raw)){
    return {
      code:"CANCELLED",
      title:"Conversion cancelled",
      message:"The local conversion was stopped.",
      recovery:"Run it again when ready."
    };
  }

  const clean=stripCode(raw)||"An unexpected local conversion error occurred.";
  return {
    code,
    title:"Conversion could not be completed",
    message:clean,
    recovery:"Try the operation again. If it repeats, use a different conversion route."
  };
}

export function friendlyIssueText(input:unknown):string {
  const issue=presentIssue(input);
  return issue.title+". "+issue.message+(issue.recovery?" "+issue.recovery:"");
}
