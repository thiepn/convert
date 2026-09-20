export interface SpreadsheetSheetInfo {
  name:string;
  hidden:boolean;
  range:string|null;
  rows:number|null;
  columns:number|null;
  cells:number;
  formulas:number;
  merges:number;
  hyperlinks:number;
}

export interface DetailedSpreadsheetInspection {
  formatId:string;
  sheets:SpreadsheetSheetInfo[];
  namedRanges:number;
  macros:boolean;
  date1904:boolean;
  author:string|null;
  title:string|null;
  company:string|null;
  warnings:string[];
  engine:string;
}

export interface DataColumnInfo {
  name:string;
  type:string;
  nullable:boolean;
}

export interface DetailedDataInspection {
  formatId:string;
  rows:number|null;
  columns:DataColumnInfo[];
  preview:Array<Record<string,unknown>>;
  warnings:string[];
  engine:string;
}

export interface DatabaseTableInfo {
  name:string;
  type:"table"|"view";
  rows:number|null;
  columns:DataColumnInfo[];
}

export interface DetailedDatabaseInspection {
  formatId:string;
  tables:DatabaseTableInfo[];
  userVersion:number|null;
  applicationId:number|null;
  warnings:string[];
  engine:string;
}

export interface SpreadsheetConversionOptions {
  routePreference:"semantic"|"fidelity";
  sheetPolicy:"first"|"selected"|"all";
  selectedSheet?:string;
  formulaMode:"preserve"|"values";
  delimiter:string;
  header:boolean;
}

export interface DataConversionOptions {
  routePreference?:"semantic";
  query?:string;
  selectedTable?:string;
  delimiter:string;
  header:boolean;
}
