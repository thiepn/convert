import type { ConversionEngine,ConversionEstimate,EngineConvertRequest,EngineConvertResult } from "../../core/engines/Engine";

function escapeHtml(value:string):string {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function localElements(root:Document|Element,name:string):Element[]{
  return [...root.getElementsByTagName("*")].filter(node=>node.localName===name);
}

export class Fb2Engine implements ConversionEngine{
  readonly id="fb2-compat";
  readonly version="phase7-native-1";

  async prepare():Promise<void>{}
  isAvailable():boolean{return typeof DOMParser!=="undefined";}
  canConvert(from:string,to:string):boolean{return from==="fb2"&&to==="html-doc";}

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {temporaryBytes:Math.max(24*1024*1024,source.size*5),outputBytes:null,notes:["FB2 is parsed as XML and converted to semantic HTML; embedded binary images are not expanded."]};
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)) throw new Error("FB2_ROUTE_UNSUPPORTED: FB2 first converts to semantic HTML.");
    if(request.source.size>64*1024*1024) throw new Error("FB2_SIZE_LIMIT: FB2 document exceeds the guarded XML parsing limit.");

    request.onProgress?.(.2,"Parsing FictionBook XML");
    const xml=new DOMParser().parseFromString(await request.source.text(),"application/xml");
    if(xml.querySelector("parsererror")) throw new Error("FB2_XML_INVALID: FictionBook XML could not be parsed.");
    if(request.signal.aborted) throw new DOMException("FB2 conversion cancelled.","AbortError");

    const title=localElements(xml,"book-title")[0]?.textContent?.trim()||"FictionBook";
    const authors=localElements(xml,"author").map(author=>{
      const parts=["first-name","middle-name","last-name"].map(name=>localElements(author,name)[0]?.textContent?.trim()).filter(Boolean);
      return parts.join(" ");
    }).filter(Boolean);

    const bodies=localElements(xml,"body");
    const sections:string[]=[];
    for(const body of bodies){
      for(const section of localElements(body,"section")){
        const directTitle=[...section.children].find(node=>node.localName==="title");
        if(directTitle?.textContent?.trim()) sections.push("<h2>"+escapeHtml(directTitle.textContent.trim())+"</h2>");
        for(const child of [...section.children]){
          if(child.localName==="p"&&child.textContent?.trim()) sections.push("<p>"+escapeHtml(child.textContent.trim())+"</p>");
          if(child.localName==="subtitle"&&child.textContent?.trim()) sections.push("<h3>"+escapeHtml(child.textContent.trim())+"</h3>");
          if(child.localName==="empty-line") sections.push("<br>");
        }
      }
    }
    if(!sections.length){
      for(const paragraph of localElements(xml,"p")){
        const value=paragraph.textContent?.trim();
        if(value) sections.push("<p>"+escapeHtml(value)+"</p>");
      }
    }

    const html="<!doctype html><html><head><meta charset=\"utf-8\"><title>"+escapeHtml(title)+"</title></head><body><h1>"+
      escapeHtml(title)+"</h1>"+(authors.length?"<p>"+escapeHtml(authors.join(", "))+"</p>":"")+sections.join("\n")+"</body></html>";
    return {
      blob:new Blob([html],{type:"text/html;charset=utf-8"}),
      warnings:["FB2 conversion keeps readable document structure and text. Embedded cover/images, custom styles, notes/link semantics, and FictionBook-specific metadata may be reduced."],
      details:{title,authors:authors.length}
    };
  }

  dispose():void{}
}
