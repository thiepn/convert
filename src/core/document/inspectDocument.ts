import { openZipPackage } from "./PackageInspector";
import type { DetailedDocumentInspection } from "./types";

function count(text:string|null,pattern:RegExp):number{
  if(!text) return 0;
  return [...text.matchAll(pattern)].length;
}
function matchValues(text:string|null,pattern:RegExp):string[]{
  if(!text) return [];
  const values:string[]=[];
  for(const match of text.matchAll(pattern)){
    const value=(match[1]??"").trim();
    if(value&&!values.includes(value)) values.push(value);
  }
  return values;
}
function xmlValue(text:string|null,tag:string):string|null{
  if(!text) return null;
  const escaped=tag.replace(/[.*+?^$(){}|[\]\\]/g,"\\$&");
  const match=text.match(new RegExp("<"+escaped+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+escaped+">","i"));
  return match?match[1].replace(/<[^>]+>/g,"").trim()||null:null;
}
function base(formatId:string,family:DetailedDocumentInspection["family"],size:number):DetailedDocumentInspection{
  return {
    formatId,family,compressedSize:size,expandedSize:null,packageEntries:null,
    paragraphs:null,headings:null,tables:null,images:null,comments:null,trackedChanges:null,
    footnotes:null,endnotes:null,equations:null,sections:null,slides:null,speakerNotes:null,
    charts:null,embeddedObjects:null,macros:false,externalLinks:null,fonts:[],
    title:null,author:null,warnings:[],engine:"Local document inspector"
  };
}

async function countExternalRelationships(pkg:NonNullable<Awaited<ReturnType<typeof openZipPackage>>>):Promise<number>{
  let total=0;
  const rels=pkg.entries.filter(entry=>entry.name.endsWith(".rels")&&entry.uncompressedSize<=2*1024*1024);
  for(const entry of rels.slice(0,500)){
    const text=await pkg.readText(entry.name,2*1024*1024);
    total+=count(text,/TargetMode\s*=\s*["']External["']/gi);
  }
  return total;
}

async function inspectDocx(blob:Blob,formatId:string):Promise<DetailedDocumentInspection>{
  const result=base(formatId,"writer",blob.size);
  const pkg=await openZipPackage(blob);
  if(!pkg) throw new Error("DOCUMENT_PACKAGE_CORRUPT: DOCX package could not be opened.");
  result.expandedSize=pkg.expandedSize;
  result.packageEntries=pkg.entries.length;
  result.warnings.push(...pkg.warnings);

  const documentXml=await pkg.readText("word/document.xml",24*1024*1024);
  const commentsXml=await pkg.readText("word/comments.xml",8*1024*1024);
  const footnotesXml=await pkg.readText("word/footnotes.xml",8*1024*1024);
  const endnotesXml=await pkg.readText("word/endnotes.xml",8*1024*1024);
  const fontsXml=await pkg.readText("word/fontTable.xml",4*1024*1024);
  const core=await pkg.readText("docProps/core.xml",2*1024*1024);

  result.paragraphs=count(documentXml,/<w:p(?:\s|>)/g);
  result.headings=count(documentXml,/<w:pStyle\b[^>]*w:val=["'](?:Heading|heading)[^"']*["']/g);
  result.tables=count(documentXml,/<w:tbl(?:\s|>)/g);
  result.images=pkg.entries.filter(entry=>entry.name.startsWith("word/media/")&&!entry.directory).length;
  result.comments=count(commentsXml,/<w:comment(?:\s|>)/g);
  result.trackedChanges=count(documentXml,/<w:(?:ins|del|moveFrom|moveTo)(?:\s|>)/g);
  result.footnotes=Math.max(0,count(footnotesXml,/<w:footnote(?:\s|>)/g)-2);
  result.endnotes=Math.max(0,count(endnotesXml,/<w:endnote(?:\s|>)/g)-2);
  result.equations=count(documentXml,/<m:oMath(?:Para)?(?:\s|>)/g);
  result.sections=count(documentXml,/<w:sectPr(?:\s|>)/g);
  result.embeddedObjects=pkg.entries.filter(entry=>entry.name.startsWith("word/embeddings/")&&!entry.directory).length;
  result.macros=pkg.entries.some(entry=>/word\/vbaProject\.bin$/i.test(entry.name));
  result.externalLinks=await countExternalRelationships(pkg);
  result.fonts=matchValues(fontsXml,/<w:font\b[^>]*w:name=["']([^"']+)["']/g);
  result.title=xmlValue(core,"dc:title");
  result.author=xmlValue(core,"dc:creator");
  if(result.macros) result.warnings.push("VBA macro payload detected. The fidelity converter will block this file.");
  if(result.externalLinks) result.warnings.push(result.externalLinks+" external relationship(s) detected; they are not fetched.");
  return result;
}

async function inspectPptx(blob:Blob,formatId:string):Promise<DetailedDocumentInspection>{
  const result=base(formatId,"presentation",blob.size);
  const pkg=await openZipPackage(blob);
  if(!pkg) throw new Error("DOCUMENT_PACKAGE_CORRUPT: PPTX package could not be opened.");
  result.expandedSize=pkg.expandedSize;
  result.packageEntries=pkg.entries.length;
  result.warnings.push(...pkg.warnings);

  const slideEntries=pkg.entries.filter(entry=>/^ppt\/slides\/slide\d+\.xml$/i.test(entry.name));
  let paragraphs=0;
  for(const entry of slideEntries.slice(0,2000)){
    const xml=await pkg.readText(entry.name,8*1024*1024);
    paragraphs+=count(xml,/<a:p(?:\s|>)/g);
  }
  const core=await pkg.readText("docProps/core.xml",2*1024*1024);
  result.slides=slideEntries.length;
  result.paragraphs=paragraphs;
  result.images=pkg.entries.filter(entry=>entry.name.startsWith("ppt/media/")&&!entry.directory).length;
  result.comments=pkg.entries.filter(entry=>/^ppt\/comments\/comment\d+\.xml$/i.test(entry.name)).length;
  result.speakerNotes=pkg.entries.filter(entry=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(entry.name)).length;
  result.charts=pkg.entries.filter(entry=>/^ppt\/charts\/chart\d+\.xml$/i.test(entry.name)).length;
  result.embeddedObjects=pkg.entries.filter(entry=>entry.name.startsWith("ppt/embeddings/")&&!entry.directory).length;
  result.macros=pkg.entries.some(entry=>/ppt\/vbaProject\.bin$/i.test(entry.name));
  result.externalLinks=await countExternalRelationships(pkg);
  result.title=xmlValue(core,"dc:title");
  result.author=xmlValue(core,"dc:creator");
  if(result.macros) result.warnings.push("VBA macro payload detected. The fidelity converter will block this file.");
  if(result.externalLinks) result.warnings.push(result.externalLinks+" external relationship(s) detected; they are not fetched.");
  return result;
}

async function inspectOdf(blob:Blob,formatId:string,family:"writer"|"presentation"):Promise<DetailedDocumentInspection>{
  const result=base(formatId,family,blob.size);
  const pkg=await openZipPackage(blob);
  if(!pkg) throw new Error("DOCUMENT_PACKAGE_CORRUPT: OpenDocument package could not be opened.");
  result.expandedSize=pkg.expandedSize;
  result.packageEntries=pkg.entries.length;
  const content=await pkg.readText("content.xml",32*1024*1024);
  const styles=await pkg.readText("styles.xml",8*1024*1024);
  const meta=await pkg.readText("meta.xml",2*1024*1024);

  result.paragraphs=count(content,/<text:p(?:\s|>)/g);
  result.headings=count(content,/<text:h(?:\s|>)/g);
  result.tables=count(content,/<table:table(?:\s|>)/g);
  result.images=pkg.entries.filter(entry=>entry.name.startsWith("Pictures/")&&!entry.directory).length;
  result.comments=count(content,/<office:annotation(?:\s|>)/g);
  result.trackedChanges=count(content,/<text:tracked-changes(?:\s|>)/g)+count(content,/<text:changed-region(?:\s|>)/g);
  result.footnotes=count(content,/<text:note\b[^>]*text:note-class=["']footnote["']/g);
  result.endnotes=count(content,/<text:note\b[^>]*text:note-class=["']endnote["']/g);
  result.equations=count(content,/<math:math(?:\s|>)/g);
  result.sections=count(content,/<text:section(?:\s|>)/g);
  result.slides=family==="presentation"?count(content,/<draw:page(?:\s|>)/g):null;
  result.speakerNotes=family==="presentation"?count(content,/<presentation:notes(?:\s|>)/g):null;
  result.embeddedObjects=pkg.entries.filter(entry=>/^Object(?:Replacements)?\//.test(entry.name)).length;
  result.externalLinks=count(content,/xlink:href=["'](?:https?:|file:|ftp:)/gi);
  result.fonts=matchValues(styles,/<style:font-face\b[^>]*style:name=["']([^"']+)["']/g);
  result.title=xmlValue(meta,"dc:title");
  result.author=xmlValue(meta,"meta:initial-creator");
  if(result.externalLinks) result.warnings.push(result.externalLinks+" external link(s) detected; they are not fetched.");
  return result;
}

async function inspectEpub(blob:Blob):Promise<DetailedDocumentInspection>{
  const result=base("epub","ebook",blob.size);
  const pkg=await openZipPackage(blob);
  if(!pkg) throw new Error("DOCUMENT_PACKAGE_CORRUPT: EPUB package could not be opened.");
  result.expandedSize=pkg.expandedSize;
  result.packageEntries=pkg.entries.length;
  const container=await pkg.readText("META-INF/container.xml",1024*1024);
  const rootfile=container?.match(/full-path=["']([^"']+\.opf)["']/i)?.[1]??pkg.entries.find(entry=>entry.name.endsWith(".opf"))?.name;
  const opf=rootfile?await pkg.readText(rootfile,8*1024*1024):null;
  result.sections=count(opf,/<itemref(?:\s|>)/gi);
  result.images=pkg.entries.filter(entry=>/\.(?:png|jpe?g|gif|webp|svg|avif)$/i.test(entry.name)).length;
  result.title=xmlValue(opf,"dc:title");
  result.author=xmlValue(opf,"dc:creator");
  result.externalLinks=0;
  return result;
}

function inspectTextFormat(blob:Blob,formatId:string,text:string):DetailedDocumentInspection{
  const result=base(formatId,"text",blob.size);
  result.expandedSize=blob.size;
  const normalized=text.replace(/\r\n?/g,"\n");
  result.paragraphs=normalized.split(/\n\s*\n/).filter(part=>part.trim()).length;
  if(formatId==="html-doc"){
    result.headings=count(text,/<h[1-6](?:\s|>)/gi);
    result.tables=count(text,/<table(?:\s|>)/gi);
    result.images=count(text,/<img(?:\s|>)/gi);
    result.externalLinks=count(text,/(?:src|href)\s*=\s*["'](?:https?:|file:|ftp:)/gi);
    result.title=text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,"").trim()??null;
  }else if(formatId==="markdown"){
    result.headings=count(text,/^#{1,6}\s+.+$/gm);
    result.images=count(text,/!\[[^\]]*\]\([^)]+\)/g);
    result.tables=count(text,/^\s*\|.*\|\s*$/gm)>1?1:0;
    result.externalLinks=count(text,/\]\((?:https?:|file:|ftp:)[^)]+\)/g);
  }else if(formatId==="latex"){
    result.headings=count(text,/\\(?:part|chapter|section|subsection|subsubsection)\*?\s*\{/g);
    result.tables=count(text,/\\begin\{(?:tabular|table)\}/g);
    result.images=count(text,/\\includegraphics(?:\[[^\]]*\])?\{/g);
    result.equations=count(text,/\\begin\{(?:equation|align|math|displaymath)\}/g);
    result.externalLinks=count(text,/\\(?:url|href)\s*\{(?:https?:|file:|ftp:)/g);
  }else if(formatId==="typst"){
    result.headings=count(text,/^=+\s+.+$/gm);
    result.images=count(text,/#image\s*\(/g);
    result.tables=count(text,/#table\s*\(/g);
  }
  if(result.externalLinks) result.warnings.push(result.externalLinks+" external reference(s) detected; converters do not fetch them.");
  return result;
}

export async function inspectDocumentBlob(blob:Blob,formatId:string):Promise<DetailedDocumentInspection>{
  if(["docx","docm"].includes(formatId)) return inspectDocx(blob,formatId);
  if(["pptx","pptm"].includes(formatId)) return inspectPptx(blob,formatId);
  if(formatId==="odt") return inspectOdf(blob,formatId,"writer");
  if(formatId==="odp") return inspectOdf(blob,formatId,"presentation");
  if(formatId==="epub") return inspectEpub(blob);

  if(["doc","ppt"].includes(formatId)){
    const result=base(formatId,"legacy",blob.size);
    result.warnings.push("Legacy binary Office documents receive limited structural inspection; macros cannot be ruled out.");
    result.macros=true;
    return result;
  }

  if(["rtf","html-doc","markdown","txt","latex","typst"].includes(formatId)){
    if(blob.size>64*1024*1024) throw new Error("DOCUMENT_TEXT_LIMIT: Text document is too large for semantic inspection.");
    return inspectTextFormat(blob,formatId,await blob.text());
  }

  throw new Error("DOCUMENT_INSPECTION_UNSUPPORTED: "+formatId);
}
