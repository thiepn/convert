const CANDIDATES=[",",";","\t","|"] as const;

function rowDelimiterCounts(text:string,delimiter:string,maxRows=24):number[]{
  const counts:number[]=[];
  let count=0;
  let quoted=false;

  for(let i=0;i<text.length&&counts.length<maxRows;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){
        i++;
        continue;
      }
      quoted=!quoted;
      continue;
    }
    if(quoted) continue;
    if(char===delimiter){
      count++;
      continue;
    }
    if(char==="\n"){
      if(count>0) counts.push(count);
      count=0;
    }
  }
  if(count>0&&counts.length<maxRows) counts.push(count);
  return counts;
}

function scoreCounts(counts:number[]):number{
  if(!counts.length) return 0;
  const frequency=new Map<number,number>();
  for(const count of counts) frequency.set(count,(frequency.get(count)??0)+1);
  let mode=0,modeFrequency=0;
  for(const [count,freq] of frequency){
    if(freq>modeFrequency||(freq===modeFrequency&&count>mode)){
      mode=count;
      modeFrequency=freq;
    }
  }
  // Consistent multi-column rows dominate occasional punctuation.
  return modeFrequency*1000+mode*10+counts.length;
}

export function detectDelimitedTextSeparator(text:string):string{
  const sample=text.slice(0,128*1024).replace(/^\uFEFF/,"");
  let best=",";
  let bestScore=-1;
  for(const candidate of CANDIDATES){
    const score=scoreCounts(rowDelimiterCounts(sample,candidate));
    if(score>bestScore){
      bestScore=score;
      best=candidate;
    }
  }
  return best;
}
