export interface MeshData {
  vertices:Array<[number,number,number]>;
  triangles:Array<[number,number,number]>;
}

const MAX_VERTICES=2_000_000;
const MAX_TRIANGLES=1_500_000;

function guardMesh(vertices:number,triangles:number){
  if(vertices>MAX_VERTICES) throw new Error("MESH_COMPLEXITY_LIMIT: Mesh exceeds the guarded vertex limit.");
  if(triangles>MAX_TRIANGLES) throw new Error("MESH_COMPLEXITY_LIMIT: Mesh exceeds the guarded triangle limit.");
}

function finite3(values:number[]):[number,number,number] {
  if(values.length<3||values.slice(0,3).some(value=>!Number.isFinite(value))){
    throw new Error("MESH_COORDINATE_INVALID: Non-finite vertex coordinate.");
  }
  return [values[0],values[1],values[2]];
}

export function parseObj(text:string):MeshData {
  const vertices:Array<[number,number,number]>=[];
  const triangles:Array<[number,number,number]>=[];
  for(const raw of text.replace(/\r\n?/g,"\n").split("\n")){
    const line=raw.trim();
    if(!line||line.startsWith("#")) continue;
    if(line.startsWith("v ")){
      vertices.push(finite3(line.slice(2).trim().split(/\s+/).map(Number)));
      guardMesh(vertices.length,triangles.length);
    }else if(line.startsWith("f ")){
      const refs=line.slice(2).trim().split(/\s+/).map(token=>{
        const value=Number(token.split("/")[0]);
        if(!Number.isInteger(value)||value===0) throw new Error("MESH_FACE_INVALID: Invalid OBJ face index.");
        const index=value>0?value-1:vertices.length+value;
        if(index<0||index>=vertices.length) throw new Error("MESH_FACE_INVALID: OBJ face index is out of range.");
        return index;
      });
      for(let i=1;i+1<refs.length;i++){
        triangles.push([refs[0],refs[i],refs[i+1]]);
        guardMesh(vertices.length,triangles.length);
      }
    }
  }
  if(!vertices.length||!triangles.length) throw new Error("MESH_PARSE_FAILED: OBJ contains no triangle geometry.");
  return {vertices,triangles};
}

function isBinaryStl(bytes:Uint8Array):boolean {
  if(bytes.byteLength<84) return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const count=view.getUint32(80,true);
  return 84+count*50<=bytes.byteLength;
}

export function parseStl(bytes:Uint8Array):MeshData {
  if(isBinaryStl(bytes)){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const count=view.getUint32(80,true);
    guardMesh(count*3,count);
    const vertices:Array<[number,number,number]>=[];
    const triangles:Array<[number,number,number]>=[];
    let offset=84;
    for(let i=0;i<count;i++,offset+=50){
      const base=vertices.length;
      for(let vertex=0;vertex<3;vertex++){
        const p=offset+12+vertex*12;
        vertices.push(finite3([
          view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true)
        ]));
      }
      triangles.push([base,base+1,base+2]);
    }
    if(!triangles.length) throw new Error("MESH_PARSE_FAILED: STL contains no triangles.");
    return {vertices,triangles};
  }

  const text=new TextDecoder().decode(bytes);
  const values:Array<[number,number,number]>= [];
  const vertexPattern=/\bvertex\s+([+\-0-9.eE]+)\s+([+\-0-9.eE]+)\s+([+\-0-9.eE]+)/g;
  let match:RegExpExecArray|null;
  while((match=vertexPattern.exec(text))){
    values.push(finite3([Number(match[1]),Number(match[2]),Number(match[3])]));
    guardMesh(values.length,Math.floor(values.length/3));
  }
  if(values.length<3||values.length%3!==0) throw new Error("MESH_PARSE_FAILED: ASCII STL contains invalid triangle data.");
  const triangles:Array<[number,number,number]>=[];
  for(let i=0;i<values.length;i+=3) triangles.push([i,i+1,i+2]);
  return {vertices:values,triangles};
}

export function parsePly(text:string):MeshData {
  const normalized=text.replace(/\r\n?/g,"\n");
  const end=normalized.indexOf("end_header\n");
  if(end<0) throw new Error("MESH_PARSE_FAILED: PLY header is incomplete.");
  const header=normalized.slice(0,end).split("\n");
  const format=header.find(line=>line.startsWith("format "));
  if(format!=="format ascii 1.0") throw new Error("PLY_BINARY_UNSUPPORTED: Phase 7 supports ASCII PLY only.");

  let vertexCount=0,faceCount=0;
  let current="";
  const vertexProperties:string[]=[];
  for(const line of header){
    const parts=line.trim().split(/\s+/);
    if(parts[0]==="element"){
      current=parts[1]??"";
      if(current==="vertex") vertexCount=Number(parts[2]);
      if(current==="face") faceCount=Number(parts[2]);
    }else if(parts[0]==="property"&&current==="vertex"){
      vertexProperties.push(parts.at(-1)??"");
    }
  }
  if(!Number.isInteger(vertexCount)||vertexCount<1||!Number.isInteger(faceCount)||faceCount<1){
    throw new Error("MESH_PARSE_FAILED: PLY needs vertex and face elements.");
  }
  guardMesh(vertexCount,faceCount);

  const x=vertexProperties.indexOf("x"),y=vertexProperties.indexOf("y"),z=vertexProperties.indexOf("z");
  if(x<0||y<0||z<0) throw new Error("MESH_PARSE_FAILED: PLY vertex x/y/z properties are required.");

  const body=normalized.slice(end+"end_header\n".length).trim().split("\n");
  if(body.length<vertexCount+faceCount) throw new Error("MESH_PARSE_FAILED: PLY body is truncated.");
  const vertices:Array<[number,number,number]>=[];
  for(let i=0;i<vertexCount;i++){
    const fields=body[i].trim().split(/\s+/);
    vertices.push(finite3([Number(fields[x]),Number(fields[y]),Number(fields[z])]));
  }
  const triangles:Array<[number,number,number]>=[];
  for(let i=0;i<faceCount;i++){
    const fields=body[vertexCount+i].trim().split(/\s+/).map(Number);
    const count=fields[0];
    if(!Number.isInteger(count)||count<3||fields.length<count+1) continue;
    const refs=fields.slice(1,count+1);
    if(refs.some(ref=>!Number.isInteger(ref)||ref<0||ref>=vertices.length)) throw new Error("MESH_FACE_INVALID: PLY face index is out of range.");
    for(let j=1;j+1<refs.length;j++){
      triangles.push([refs[0],refs[j],refs[j+1]]);
      guardMesh(vertices.length,triangles.length);
    }
  }
  if(!triangles.length) throw new Error("MESH_PARSE_FAILED: PLY contains no triangle geometry.");
  return {vertices,triangles};
}

export function parseMesh(source:Uint8Array,formatId:string):MeshData {
  if(formatId==="stl") return parseStl(source);
  const text=new TextDecoder().decode(source);
  if(formatId==="obj") return parseObj(text);
  if(formatId==="ply") return parsePly(text);
  throw new Error("MESH_FORMAT_UNSUPPORTED: "+formatId);
}

export function writeObj(mesh:MeshData):Uint8Array {
  const lines=["# Converted locally by Thiepn Convert"];
  for(const [x,y,z] of mesh.vertices) lines.push("v "+x+" "+y+" "+z);
  for(const [a,b,c] of mesh.triangles) lines.push("f "+(a+1)+" "+(b+1)+" "+(c+1));
  return new TextEncoder().encode(lines.join("\n")+"\n");
}

export function writeStl(mesh:MeshData):Uint8Array {
  const buffer=new ArrayBuffer(84+mesh.triangles.length*50);
  const bytes=new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("Thiepn Convert binary STL").slice(0,80),0);
  const view=new DataView(buffer);
  view.setUint32(80,mesh.triangles.length,true);
  let offset=84;
  for(const triangle of mesh.triangles){
    for(let vertex=0;vertex<3;vertex++){
      const point=mesh.vertices[triangle[vertex]];
      const p=offset+12+vertex*12;
      view.setFloat32(p,point[0],true);view.setFloat32(p+4,point[1],true);view.setFloat32(p+8,point[2],true);
    }
    view.setUint16(offset+48,0,true);
    offset+=50;
  }
  return bytes;
}

export function writePly(mesh:MeshData):Uint8Array {
  const header=[
    "ply","format ascii 1.0","comment converted locally by Thiepn Convert",
    "element vertex "+mesh.vertices.length,
    "property float x","property float y","property float z",
    "element face "+mesh.triangles.length,
    "property list uchar int vertex_indices","end_header"
  ];
  const lines=[...header];
  for(const [x,y,z] of mesh.vertices) lines.push(x+" "+y+" "+z);
  for(const [a,b,c] of mesh.triangles) lines.push("3 "+a+" "+b+" "+c);
  return new TextEncoder().encode(lines.join("\n")+"\n");
}

export function writeMesh(mesh:MeshData,formatId:string):Uint8Array {
  if(formatId==="obj") return writeObj(mesh);
  if(formatId==="stl") return writeStl(mesh);
  if(formatId==="ply") return writePly(mesh);
  throw new Error("MESH_FORMAT_UNSUPPORTED: "+formatId);
}
