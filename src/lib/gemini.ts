type GeminiPayload =
  | { action: "chat"; message: string; history: { role: string; parts: { text: string }[] }[] }
  | { action: "analyze"; image: string; mimeType: string; message: string }
  | { action: "generate-image"; prompt: string };

const API_URL="/api/gemini";
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function postGemini(payload:GeminiPayload,retry=true){
  let last:Error|null=null;
  for(let attempt=1;attempt<=(retry?2:1);attempt++){
    const c=new AbortController(); const id=window.setTimeout(()=>c.abort(),90000);
    try{
      const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},cache:"no-store",body:JSON.stringify(payload),signal:c.signal});
      const raw=await r.text(); let data:any={}; try{data=raw?JSON.parse(raw):{}}catch{data={error:raw||`HTTP ${r.status}`}}
      if(r.ok)return data;
      last=new Error(`HTTP ${r.status} - ${data?.error||"Lỗi máy chủ"}${data?.code ? ` - ${data.code}` : ""}`);
      if([502,503,504].includes(r.status)&&attempt<2){await wait(800);continue;}
      throw last;
    }catch(e:any){
      last=e?.name==="AbortError"?new Error("Yêu cầu tới chuyên gia đã quá thời gian chờ."):e instanceof Error?e:new Error(String(e));
      if(attempt<2&&/Failed to fetch|NetworkError|Load failed/i.test(last.message)){await wait(800);continue;}
      throw last;
    }finally{window.clearTimeout(id)}
  }
  throw last||new Error("Không thể kết nối tới chuyên gia.");
}
export async function chatWithGemini(message:string,history:{role:string;parts:{text:string}[]}[]=[]){const d=await postGemini({action:"chat",message,history});if(!d?.text)throw new Error("Máy chủ không trả về nội dung tư vấn.");return d.text;}
export async function analyzePlantImage(image:string,mimeType:string,message:string="Hãy phân tích hình ảnh cây trồng này."){const d=await postGemini({action:"analyze",image,mimeType,message});if(!d?.text)throw new Error("Máy chủ không trả về kết quả chẩn đoán ảnh.");return d.text;}
export async function generatePlantImage(prompt:string){try{const d=await postGemini({action:"generate-image",prompt},false);return d?.imageUrl||null}catch(e){console.warn(e);return null}}
