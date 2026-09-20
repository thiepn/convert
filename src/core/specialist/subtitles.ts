export interface SubtitleCue {
  startMs:number;
  endMs:number;
  text:string;
}

function parseClock(value:string,ass=false):number {
  const normalized=value.trim().replace(",",".");
  const parts=normalized.split(":");
  if(parts.length<2||parts.length>3) throw new Error("SUBTITLE_TIME_INVALID: "+value);
  const seconds=Number(parts.pop());
  const minutes=Number(parts.pop());
  const hours=parts.length?Number(parts.pop()):0;
  if(!Number.isFinite(seconds)||!Number.isFinite(minutes)||!Number.isFinite(hours)){
    throw new Error("SUBTITLE_TIME_INVALID: "+value);
  }
  const multiplier=ass?1000:1000;
  return Math.round((hours*3600+minutes*60+seconds)*multiplier);
}

function srtTime(ms:number,decimal=","):string {
  const total=Math.max(0,Math.round(ms));
  const hours=Math.floor(total/3_600_000);
  const minutes=Math.floor((total%3_600_000)/60_000);
  const seconds=Math.floor((total%60_000)/1000);
  const millis=total%1000;
  return String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")+decimal+String(millis).padStart(3,"0");
}

function assTime(ms:number):string {
  const total=Math.max(0,Math.round(ms/10));
  const hours=Math.floor(total/360_000);
  const minutes=Math.floor((total%360_000)/6_000);
  const seconds=Math.floor((total%6_000)/100);
  const centis=total%100;
  return hours+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")+"."+String(centis).padStart(2,"0");
}

function splitLimited(value:string,count:number):string[] {
  const result:string[]=[];
  let rest=value;
  for(let i=1;i<count;i++){
    const index=rest.indexOf(",");
    if(index<0) break;
    result.push(rest.slice(0,index));
    rest=rest.slice(index+1);
  }
  result.push(rest);
  return result;
}

function cleanAssText(text:string):string {
  return text
    .replace(/\{\\[^}]*\}/g,"")
    .replace(/\\N/gi,"\n")
    .replace(/\\h/gi," ")
    .trim();
}

export function parseSubtitle(text:string,formatId:string):SubtitleCue[] {
  const normalized=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");

  if(formatId==="srt"){
    const cues:SubtitleCue[]=[];
    for(const block of normalized.split(/\n{2,}/)){
      const lines=block.split("\n").map(line=>line.trimEnd());
      const timingIndex=lines.findIndex(line=>line.includes("-->"));
      if(timingIndex<0) continue;
      const timing=lines[timingIndex].match(/^\s*([0-9:. ,]+)\s*-->\s*([0-9:. ,]+)/);
      if(!timing) continue;
      const textValue=lines.slice(timingIndex+1).join("\n").trim();
      if(!textValue) continue;
      cues.push({startMs:parseClock(timing[1]),endMs:parseClock(timing[2]),text:textValue});
    }
    if(!cues.length) throw new Error("SUBTITLE_PARSE_FAILED: No SRT cues were found.");
    return cues;
  }

  if(formatId==="vtt"){
    const cues:SubtitleCue[]=[];
    const blocks=normalized.replace(/^WEBVTT[^\n]*\n?/i,"").split(/\n{2,}/);
    for(const block of blocks){
      const lines=block.split("\n").map(line=>line.trimEnd());
      if(!lines.length||/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;
      const timingIndex=lines.findIndex(line=>line.includes("-->"));
      if(timingIndex<0) continue;
      const timing=lines[timingIndex].match(/^\s*([0-9:.]+)\s*-->\s*([0-9:.]+)/);
      if(!timing) continue;
      const textValue=lines.slice(timingIndex+1).join("\n").trim();
      if(!textValue) continue;
      cues.push({startMs:parseClock(timing[1]),endMs:parseClock(timing[2]),text:textValue});
    }
    if(!cues.length) throw new Error("SUBTITLE_PARSE_FAILED: No WebVTT cues were found.");
    return cues;
  }

  if(formatId==="ass"){
    const lines=normalized.split("\n");
    let inEvents=false;
    let fields=["Layer","Start","End","Style","Name","MarginL","MarginR","MarginV","Effect","Text"];
    const cues:SubtitleCue[]=[];
    for(const raw of lines){
      const line=raw.trim();
      if(/^\[Events\]$/i.test(line)){inEvents=true;continue;}
      if(/^\[/.test(line)){inEvents=false;continue;}
      if(!inEvents) continue;
      if(/^Format\s*:/i.test(line)){
        fields=line.replace(/^Format\s*:/i,"").split(",").map(value=>value.trim());
        continue;
      }
      if(!/^Dialogue\s*:/i.test(line)) continue;
      const values=splitLimited(line.replace(/^Dialogue\s*:/i,"").trim(),fields.length);
      const index=(name:string)=>fields.findIndex(field=>field.toLowerCase()===name.toLowerCase());
      const start=values[index("Start")]??"";
      const end=values[index("End")]??"";
      const body=values[index("Text")]??"";
      if(!start||!end||!body) continue;
      cues.push({startMs:parseClock(start,true),endMs:parseClock(end,true),text:cleanAssText(body)});
    }
    if(!cues.length) throw new Error("SUBTITLE_PARSE_FAILED: No ASS/SSA dialogue cues were found.");
    return cues;
  }

  throw new Error("SUBTITLE_FORMAT_UNSUPPORTED: "+formatId);
}

export function serializeSubtitle(cues:SubtitleCue[],formatId:string):string {
  if(!cues.length) throw new Error("SUBTITLE_EMPTY: No subtitle cues to write.");

  if(formatId==="srt"){
    return cues.map((cue,index)=>
      String(index+1)+"\n"+srtTime(cue.startMs)+" --> "+srtTime(cue.endMs)+"\n"+cue.text.trim()
    ).join("\n\n")+"\n";
  }

  if(formatId==="vtt"){
    return "WEBVTT\n\n"+cues.map(cue=>
      srtTime(cue.startMs,".")+" --> "+srtTime(cue.endMs,".")+"\n"+cue.text.trim()
    ).join("\n\n")+"\n";
  }

  if(formatId==="ass"){
    const header=[
      "[Script Info]",
      "ScriptType: v4.00+",
      "Collisions: Normal",
      "PlayResX: 1920",
      "PlayResY: 1080",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      "Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1",
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];
    const lines=cues.map(cue=>
      "Dialogue: 0,"+assTime(cue.startMs)+","+assTime(cue.endMs)+",Default,,0,0,0,,"+
      cue.text.replace(/\r?\n/g,"\\N")
    );
    return [...header,...lines].join("\n")+"\n";
  }

  throw new Error("SUBTITLE_FORMAT_UNSUPPORTED: "+formatId);
}
