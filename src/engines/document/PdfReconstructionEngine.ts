import type {
  ConversionEngine,
  ConversionEstimate,
  EngineConvertRequest,
  EngineConvertResult
} from "../../core/engines/Engine";
import { PdfEngine } from "../pdf/PdfEngine";
import { PandocDocumentEngine } from "./PandocDocumentEngine";

const OUTPUTS=new Set(["txt","markdown","html-doc","docx","odt","rtf","latex","typst","epub"]);

export class PdfReconstructionEngine implements ConversionEngine{
  readonly id="pdf-reconstruction";
  readonly version="phase4-text-reconstruction";
  constructor(
    private readonly pdf:PdfEngine,
    private readonly pandoc:PandocDocumentEngine
  ) {}

  isAvailable():boolean{
    return this.pdf.isAvailable()&&this.pandoc.isAvailable();
  }

  canConvert(from:string,to:string):boolean{
    return from==="pdf"&&OUTPUTS.has(to);
  }

  async estimate(source:Blob):Promise<ConversionEstimate>{
    return {
      temporaryBytes:Math.max(256*1024*1024,source.size*3),
      outputBytes:null,
      notes:["PDF reconstruction extracts reading text and then creates an editable semantic document; exact PDF layout is not preserved."]
    };
  }

  async convert(request:EngineConvertRequest):Promise<EngineConvertResult>{
    if(!this.canConvert(request.sourceFormatId,request.targetFormatId)){
      throw new Error("PDF_RECONSTRUCTION_UNSUPPORTED: Unsupported editable target.");
    }
    request.onProgress?.(.08,"Extracting PDF reading text");
    const password=String(request.options?.password??"")||undefined;
    const extracted=await this.pdf.extractText(request.source,password);

    const warnings=[
      "Editable reconstruction: PDF page layout, floating objects, fonts, headers/footers, and exact pagination may not survive.",
      "PDF text is reconstructed from positioned text runs; reading order may require manual correction in complex multi-column documents."
    ];

    if(request.targetFormatId==="txt"){
      const blob=new Blob([extracted.text],{type:"text/plain;charset=utf-8"});
      return {blob,warnings};
    }

    const markdown=extracted.pages
      .map(page=>"<!-- Page "+page.page+" -->\n\n"+page.text.trim())
      .join("\n\n---\n\n");
    const source=new Blob([markdown],{type:"text/markdown;charset=utf-8"});
    request.onProgress?.(.38,"Building editable document");

    const result=await this.pandoc.convert({
      ...request,
      source,
      sourceFormatId:"markdown",
      targetFormatId:request.targetFormatId,
      targetMime:request.targetMime,
      onProgress:(progress,stage)=>request.onProgress?.(.38+progress*.58,stage)
    });

    return {
      ...result,
      warnings:[...warnings,...(result.warnings??[])]
    };
  }

  dispose():void{}
}
