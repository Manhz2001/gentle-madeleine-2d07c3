const normal=value=>String(value||'').toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export const INTENTS=new Set(['general','interactions','special_dose','prescription_review','other']);
const INTRODUCTION='Xin chào, tôi là NBCare — trợ lý AI hỗ trợ thông tin thuốc tại BVĐK tỉnh Ninh Bình.\n\nTôi giúp tra cứu thuốc, tương tác, tương hợp/tương kỵ và liều theo chức năng thận từ các nguồn đã kết nối. Bạn có thể nhập câu hỏi hoặc tải ảnh để bắt đầu.';

export function shortNonClinicalResponse(text){
  const query=normal(text).replace(/[!?.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  if(/^(?:xin chao|chao|hello|hi|chao nbcare|xin chao nbcare|nbcare)$/.test(query))return INTRODUCTION;
  if(/^(?:cam on|cam on ban|cam on nbcare|thank you|thanks)$/.test(query))return 'Bạn có thể gửi thêm câu hỏi khi cần tra cứu.';
  if(/^(?:ban la ai|nbcare la gi|ban (?:co the )?(?:giup|ho tro|lam) (?:duoc )?gi)$/.test(query))return INTRODUCTION;
  if(/(?:huong dan|cach|lam (?:the )?nao).{0,35}(?:su dung nbcare|su dung ung dung|tai anh|chup anh|mo camera)/.test(query))return 'Bạn có thể nhập câu hỏi trực tiếp hoặc chọn Chụp ảnh/Tải ảnh. Kiểm tra lại chữ nhận dạng trước khi gửi nội dung ảnh để tra cứu.';
  if(/(?:lam (?:the )?nao|cach|vao|mo|dang nhap).{0,25}(?:chuyen sau|khu vuc noi bo)/.test(query))return 'Chọn Chuyên sâu rồi nhập mã truy cập trong cửa sổ của ứng dụng. Không gửi mã trong hội thoại. Sau khi mở quyền, hãy kiểm tra câu hỏi rồi bấm gửi.';
  if(/^(?:(?:cho toi biet|giai thich|su khac nhau giua|toi (?:nen|muon) chon|cach chon)\s+)?(?:nguon dong|nguon mo)\b/.test(query)&&/khac|la gi|chon|co gi|su dung|dung cung/.test(query))return 'Nguồn đóng chỉ dùng kho tài liệu được cấu hình. Nguồn mở có thể truy xuất thêm các kênh y khoa chính thống được cho phép. Cả hai đều cần bằng chứng thật cho dữ liệu lâm sàng.';
  if(/co ban|chuyen sau/.test(query)&&/khac nhau|khac gi|la gi/.test(query))return 'Cơ bản hỗ trợ tra cứu thông thường. Chuyên sâu dành cho khu vực nội bộ, cần mã truy cập; việc mở quyền không thay thế kiểm chứng nguồn hoặc xác minh danh tính người dùng.';
  if(/\b(?:thoi tiet|bong da|lam tho|viet tho|bai hat|gia vang|bitcoin|viet code|lap trinh|javascript|python|du lich|chung khoan)\b/.test(query))return 'NBCare tập trung hỗ trợ thông tin thuốc và sức khỏe. Bạn có thể gửi câu hỏi y khoa cần tra cứu để tôi hỗ trợ đúng phạm vi.';
  if(!query||query.length<3||/^(?:giup toi|tu van|tu van giup toi|lam sao|the nao|cai nay la gi|giai thich giup toi)$/.test(query))return 'Bạn muốn tìm hiểu thuốc, thuật ngữ hoặc vấn đề sức khỏe nào? Hãy nêu cụ thể một câu hỏi để tôi tra cứu đúng nội dung.';
  return null;
}

export function prescriptionReview(text,ocrText=''){
  const raw=normal(text),ocr=normal(ocrText);
  // A narrow negated clause must not turn a pairwise lookup into a full review.
  const query=raw.replace(/\b(?:khong|chua|chung toi khong|toi khong)\s+(?:(?:yeu cau|can|muon)\s+)?(?:tham dinh|ra soat|danh gia|kiem tra)\s+(?:toan bo\s+)?(?:don thuoc|toa thuoc|don|toa)\b/g,'');
  if(/\b(?:tham dinh|ra soat|danh gia tinh hop ly|duyet)\b.{0,65}\b(?:don thuoc|toa thuoc|don|toa)\b|\b(?:don thuoc|toa thuoc)\b.{0,65}\b(?:tham dinh|ra soat|hop ly|dung sai|co sai|co phu hop)\b/.test(query))return true;
  if(/\b(?:kiem tra|danh gia|doc|xem)\b.{0,35}\b(?:toan bo don|don thuoc hoan chinh|don thuoc nay|toa thuoc nay|don dinh kem)\b/.test(query))return true;
  const source=ocr||raw;
  const header=/\b(?:don thuoc|toa thuoc|prescription)\b/.test(source),doseRows=(source.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|g|ml|vien|ong|ui)\b/g)||[]).length;
  const patient=/ho (?:va )?ten|benh nhan|nguoi benh|patient|chan doan|diagnosis|ngay sinh|nam sinh/.test(source);
  return header&&patient&&doseRows>=2;
}

export function classifyIntent(text,{ocrText='',history=[]}={}){
  let query=String(text||'').slice(0,4000);const image=String(ocrText||'').slice(0,12000);
  if(prescriptionReview(query,image))return {intent:'prescription_review',requiresInternal:true};
  if(!image&&shortNonClinicalResponse(query))return {intent:'other',requiresInternal:false};
  const current=normal(query);
  if(/thuoc nay|cap nay|lieu tren|truong hop tren|nhu tren|tiep tuc|lam tiep/.test(current)){
    const prior=Array.isArray(history)?history.filter(turn=>turn?.role==='user'&&typeof turn.text==='string').slice(-1)[0]?.text:'';
    if(prior&&prescriptionReview(prior))return {intent:'prescription_review',requiresInternal:true};
    if(prior)query=prior.slice(0,4000)+'\n'+query;
  }
  const value=normal(query+'\n'+image);
  const concept=/^\s*(?:thuoc )?(?:khang sinh|khang thuoc|tuong tac(?: thuoc)?|canh giac duoc|chong chi dinh|than trong|tac dung phu|adr|egfr|crcl|creatinin(?:e)?|duoc dong hoc|duoc luc hoc|sinh kha dung|thoi gian ban thai|dinh duong|huyet ap|duong huyet)\s+(?:la gi|co y nghia|khac nhau|khac gi|duoc hieu|nghia la gi)/.test(value);
  const compatibilityConcept=/^\s*(?:tuong (?:ky|ki|hop)|y[- ]?site)\s+(?:la gi|co y nghia|khac nhau|khac gi|nghia la gi)/.test(value);
  if(concept||compatibilityConcept)return {intent:'other',requiresInternal:false};
  const special=/suy than|suy gan|xo gan|crcl|egfr|\bgfr\b|loc mau|tham tach|dialysis|child[- ]?pugh|thanh thai creatinin|chuc nang than|chuc nang gan|tre em|so sinh|nguoi cao tuoi|nguoi gia|beo phi|mang thai|cho con bu/.test(value);
  // Accent folding makes "liều" and "liệu" identical. Source/document words
  // must not turn a general health question into a medicine or dosing request.
  const clinicalQuery=value.replace(/\b(?:tai|du|tu|ngu|chat|vat) lieu\b/g,' ');
  const dosing=/\blieu\b|hieu chinh|dieu chinh|dosing|dosage|dose|bao nhieu|cach dung|cach su dung|dung the nao/.test(clinicalQuery);
  if(special&&dosing||/crcl|egfr|child[- ]?pugh/.test(value)&&/\d/.test(value)&&/thuoc|\blieu\b|dose|dosing/.test(value))return {intent:'special_dose',requiresInternal:false};
  const interactionQuery=value.replace(/cach (?:su )?dung chung/g,'');
  if(/tuong (?:ky|ki|hop)|y[- ]?site|pha chung|pha (?:cung|chung) (?:bom|tui)|truyen (?:cung|chung)(?: mot)? (?:duong|day)|cung (?:mot )?duong truyen/.test(interactionQuery))return {intent:'interactions',requiresInternal:false};
  if(/tuong tac|interaction|uong (?:cung|chung)|dung (?:cung|chung)|phoi hop|ket hop|dong thoi|co tuong ky/.test(interactionQuery))return {intent:'interactions',requiresInternal:false};
  if(/\b[a-z][a-z0-9-]{3,}\s*\+\s*[a-z][a-z0-9-]{3,}\b/.test(value))return {intent:'interactions',requiresInternal:false};
  if(/^\s*[a-z][a-z0-9-]{3,}(?:\s*[,;]\s*[a-z][a-z0-9-]{3,}){1,5}\s*[?.]?\s*$/.test(value))return {intent:'interactions',requiresInternal:false};
  const medicineQuestion=/\bthuoc\b|hoat chat|chi dinh|chong chi dinh|tac dung phu|adr\b|atc\b|ham luong|biet duoc|dang bao che|\blieu\b|\buong\b|\btiem\b|\btruyen\b|thong tin chung cua\s+[a-z]|thong tin (?:ve )?[a-z][a-z0-9-]{4,}\s*[?.]?\s*$|canh bao.{0,50}\b(?:cua|ve)\b|^\s*[a-z][a-z0-9-]{4,}\s+(?:chua benh|co tac dung|dung de|dung nhu)/.test(clinicalQuery);
  const isolatedName=/^\s*[a-z][a-z0-9-]{3,}(?:\s+\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui))?\s*$/.test(value)&&!/^\s*(?:creatinine|creatinin|cholesterol|diabetes|hypertension|health|hello|thanks|nbcare)\s*$/.test(value);
  return {intent:medicineQuestion||isolatedName?'general':'other',requiresInternal:false};
}

export function referralResponse(){return '**[PHÂN LOẠI]: YÊU CẦU THẨM ĐỊNH ĐƠN THUỐC — KHU VỰC NỘI BỘ**\n\nNBCare ở chế độ cơ bản không thẩm định toàn bộ đơn thuốc. Vui lòng chọn **Chuyên sâu** và nhập mã truy cập dành cho nhân viên y tế. Sau khi mở khu vực nội bộ, bạn có thể gửi lại yêu cầu thẩm định.\n\nKhông có nhận định lâm sàng hoặc đề xuất đổi thuốc được đưa ra trước khi mở khu vực nội bộ.';}
