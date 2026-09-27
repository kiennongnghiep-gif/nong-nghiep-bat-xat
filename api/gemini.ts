import { GoogleGenAI } from "@google/genai";

export const SYSTEM_PROMPT = `Vai trò:
Bạn là chuyên gia tư vấn kỹ thuật nông nghiệp thông minh, đại diện cho Trung tâm Dịch vụ Tổng hợp xã Bát Xát. Nhiệm vụ của bạn là hỗ trợ bà con nông dân chẩn đoán bệnh, hướng dẫn kỹ thuật canh tác và xử lý sâu bệnh trên cây trồng một cách khoa học, hiệu quả và bền vững.

Thông tin đơn vị chủ quản:
Đơn vị: Trung tâm Dịch vụ Tổng hợp xã Bát Xát.
Hotline hỗ trợ khẩn cấp: 0834.027.818 hoặc 0913.178.035.

Nguyên tắc trả lời:
Chuyên nghiệp & Gần gũi: Sử dụng ngôn ngữ dễ hiểu đối với bà con nông dân, tránh thuật ngữ hàn lâm khó hiểu.
Đúng trọng tâm: Trả lời trực diện vào câu hỏi.
An toàn & Bền vững: Ưu tiên các biện pháp sinh học, quản lý dịch hại tổng hợp (IPM).
Sát thực tiễn: Lưu ý các điều kiện khí hậu, thổ nhưỡng đặc thù của vùng núi Bát Xát, Lào Cai.

Cấu trúc câu trả lời cho các nút gợi ý nhanh:
Khi người dùng nhấn vào các nút gợi ý, hãy trả lời theo cấu trúc: [Tổng quan] -> [Kỹ thuật trọng tâm] -> [Khuyến cáo vật tư].

Kịch bản chi tiết cho các chủ đề trọng tâm:
1. Cách trị sâu xanh hại lúa:
- Tổng quan (Chẩn đoán): Sâu xanh thường gây hại giai đoạn lúa non, ăn khuyết lá, làm giảm khả năng quang hợp.
- Kỹ thuật trọng tâm (Xử lý): Nếu mật độ thấp, khuyến khích bà con ngắt ổ trứng. Nếu mật độ cao (trên 5 con/m2), sử dụng các hoạt chất như: Indoxacarb hoặc Chlorantraniliprole.
- Khuyến cáo vật tư: Phun vào chiều mát khi sâu bò ra ăn.

2. Kỹ thuật chăm sóc cây dưa hấu:
- Tổng quan: Tập trung vào giai đoạn bón phân và bấm ngọn để đạt năng suất cao tại địa phương.
- Kỹ thuật trọng tâm: Bón lót phân chuồng ủ hoai mục + Lân. Bón thúc giai đoạn ra hoa bằng Kali để tăng độ ngọt. Thực hiện bấm ngọn, tỉa nhánh.
- Khuyến cáo vật tư: Chú ý bệnh héo rũ và lở cổ rễ trong điều kiện ẩm độ cao.

3. Kỹ thuật chăm sóc cây Lê:
- Tổng quan: Tập trung vào việc đốn tỉa và phòng trừ sâu đục thân.
- Kỹ thuật trọng tâm: Sau khi thu hoạch cần tỉa cành già, cành sâu bệnh, bón hữu cơ và lân phù hợp.
- Khuyến cáo vật tư: Chú ý sâu đục thân và bệnh rỉ sắt.

4. Chăn nuôi Lợn đen bản địa:
- Tổng quan: Giữ vững chất lượng thịt sạch, an toàn dịch bệnh.
- Kỹ thuật trọng tâm: Tận dụng phụ phẩm nông nghiệp; chuồng khô ráo, tránh gió lùa.
- Khuyến cáo vật tư: Tiêm phòng đầy đủ vaccine theo hướng dẫn thú y.

Cuối mỗi câu trả lời, hãy luôn hiển thị:
[📞 Gọi hỗ trợ kỹ thuật 0834027818]
[📸 Gửi ảnh bệnh phát sinh]
[📍 Báo cáo dịch hại tại địa phương]`;

const TEXT_MODELS = ["gemini-3.8-flash","gemini-3.6-flash","gemini-3.1-flash-lite","gemini-3-flash-preview"];
const IMAGE_MODELS = ["gemini-3.1-flash-image","gemini-3-pro-image"];

function applyHeaders(res:any){
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
const errText=(e:any)=>String(e?.message||e||"");
const stop=(e:any)=>/API_KEY_INVALID|INVALID API KEY|PERMISSION_DENIED|UNAUTHENTICATED/i.test(errText(e));
function status(e:any){const t=errText(e).toUpperCase(); if(/API_KEY_INVALID|INVALID API KEY|UNAUTHENTICATED/.test(t))return 401;if(t.includes("PERMISSION_DENIED"))return 403;if(/429|RESOURCE_EXHAUSTED|QUOTA/.test(t))return 429;if(/404|NOT_FOUND/.test(t))return 404;if(/503|UNAVAILABLE|HIGH DEMAND/.test(t))return 503;return 500;}

export default async function handler(req:any,res:any){
  applyHeaders(res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Chỉ hỗ trợ phương thức POST"});
  const apiKey=process.env.GEMINI_API_KEY;
  if(!apiKey) return res.status(500).json({error:"Máy chủ chưa được cấu hình GEMINI_API_KEY.",code:"GEMINI_KEY_MISSING"});
  const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  const {action,message,history,image,mimeType,prompt}=body;
  const genAI=new GoogleGenAI({apiKey});
  try{
    if(action==="chat"){
      let last:any;
      const normalizedHistory:any[]=[];
      for(const item of Array.isArray(history)?history:[]){
        const role=item?.role==="user"?"user":item?.role==="model"?"model":null;
        const text=item?.parts?.map((p:any)=>p?.text||"").join("\n").trim();
        if(!role||!text) continue;
        if(normalizedHistory.length===0 && role!=="user") continue;
        const prev=normalizedHistory[normalizedHistory.length-1];
        if(prev?.role===role){
          prev.parts[0].text += "\n" + text;
        }else{
          normalizedHistory.push({role,parts:[{text}]});
        }
      }
      if(normalizedHistory.at(-1)?.role==="user") normalizedHistory.pop();

      for(const model of TEXT_MODELS){try{
        const chat=genAI.chats.create({model,config:{systemInstruction:SYSTEM_PROMPT},history:normalizedHistory});
        const r=await chat.sendMessage({message});
        if(r?.text) return res.status(200).json({text:r.text,model});
      }catch(e){last=e;console.warn("[Gemini] model failed",model,errText(e));if(stop(e))break;}}
      throw last||new Error("Không nhận được phản hồi từ Gemini.");
    }
    if(action==="analyze"){
      const clean=image?.includes(",")?image.split(",")[1]:image;
      let last:any;
      for(const model of TEXT_MODELS){try{
        const r=await genAI.models.generateContent({model,contents:{parts:[{inlineData:{data:clean,mimeType:mimeType||"image/jpeg"}},{text:message||"Hãy phân tích hình ảnh cây trồng này."}]},config:{systemInstruction:SYSTEM_PROMPT}});
        if(r?.text) return res.status(200).json({text:r.text,model});
      }catch(e){last=e;if(stop(e))break;}}
      throw last||new Error("Không nhận được kết quả phân tích ảnh.");
    }
    if(action==="generate-image"){
      for(const model of IMAGE_MODELS){try{
        const r=await genAI.models.generateContent({model,contents:{parts:[{text:`Tạo hình ảnh minh họa nông nghiệp thực tế, rõ nét cho: ${prompt}`}]},config:{imageConfig:{aspectRatio:"1:1"}}});
        for(const p of r.candidates?.[0]?.content?.parts||[]) if(p.inlineData?.data) return res.status(200).json({imageUrl:`data:${p.inlineData.mimeType||"image/png"};base64,${p.inlineData.data}`,model});
      }catch(e){if(stop(e))break;}}
      return res.status(200).json({imageUrl:null});
    }
    return res.status(400).json({error:"Hành động không hợp lệ",code:"BAD_ACTION"});
  }catch(e:any){
    const s=status(e);
    return res.status(s).json({error:errText(e)||"Lỗi Gemini",code:s===401?"API_KEY_INVALID":s===403?"PERMISSION_DENIED":s===429?"QUOTA_EXCEEDED":s===404?"MODEL_NOT_FOUND":s===503?"MODEL_OVERLOAD":"GEMINI_ERROR"});
  }
}
