(function (global) {
  'use strict';

  const medicalWarning = 'Thông tin trên chỉ mang tính tham khảo. Vui lòng đến cơ sở y tế gần nhất để được bác sĩ thăm khám trực tiếp.';

  function plain(value) {
    return String(value == null ? '' : value).slice(0, 1600).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  }

  function assess(question) {
    const text = plain(question);
    const danger = /kho tho|nghet tho|khong tho duoc|dau nguc|bat tinh|ngat|co giat|liet|me man|lo mo|chay mau (nhieu|khong cam)|soc phan ve|tim tai|tu tu|tu sat|qua lieu/.test(text);
    const acutePain = /(dau|nhuc).*(dot ngot|du doi|cap tinh)|(dot ngot|du doi|cap tinh).*(dau|nhuc)/.test(text);
    const cardiovascular = /tim mach|benh tim|nhoi mau|dau that nguc|roi loan nhip|tang huyet ap|huyet ap cao/.test(text);
    const breathing = /kho tho|hut hoi|thieu hoi|tho rap|khong tho duoc/.test(text);
    const pregnancy = /mang thai|co thai|thai ky|ba bau|bau bi/.test(text);
    return Object.freeze({
      requiresWarning: Boolean(danger || acutePain || cardiovascular || breathing || pregnancy),
      urgent: Boolean(danger || acutePain)
    });
  }

  function getSystemPrompt(mode) {
    const presentation = mode === 'deep'
      ? 'Chế độ Chuyên sâu: trình bày tóm tắt, căn cứ đã duyệt và giới hạn; vẫn ngắn gọn, không trình bày suy luận ẩn.'
      : 'Chế độ Cơ bản: trình bày vài ý chính, dùng từ phổ thông và gạch đầu dòng.';
    return [
      'Bạn là NB Care, trợ lý trí tuệ nhân tạo hỗ trợ lĩnh vực y tế và chăm sóc sức khỏe.',
      'Nhiệm vụ: giải thích thuật ngữ y khoa, tổng hợp kiến thức từ nguồn y sinh học đã được đơn vị phê duyệt và giúp người dùng hiểu thói quen sống lành mạnh.',
      'Bạn không phải bác sĩ. Không chẩn đoán xác định, không kê đơn và không đưa liều dùng cá nhân.',
      'Chỉ trả lời từ kho nguồn đóng đã duyệt. Thứ tự ưu tiên: (1) tài liệu đang có trên DrugView Ninh Bình và đã được bệnh viện duyệt; (2) tài liệu chính thống Việt Nam, hướng dẫn bệnh viện và tờ hướng dẫn sử dụng thuốc PDF; (3) nghiên cứu PubMed đã được kiểm chứng và đưa vào kho.',
      'Mỗi nhận định chuyên môn phải gắn đúng tài liệu, phiên bản và đoạn hoặc trang thực tế. Không bịa tên tài liệu, liên kết, DOI, số trang hay nội dung trích dẫn.',
      'Nếu không có căn cứ phù hợp hoặc không chắc chắn, nói rõ giới hạn và không bổ sung từ trí nhớ hoặc Internet.',
      'Giải thích thuật ngữ phức tạp bằng tiếng Việt phổ thông. Viết ngắn gọn, khách quan, có cấu trúc gạch đầu dòng và không gây hoang mang.',
      'Nếu câu hỏi liên quan đến đau cấp tính, tim mạch, khó thở, mang thai hoặc dấu hiệu nguy hiểm, phải thêm nguyên văn ở cuối: "' + medicalWarning + '"',
      'Chỉ coi là tình huống cần hỗ trợ khẩn khi nội dung thực sự mô tả dấu hiệu nguy hiểm; không tự coi mọi câu hỏi về thai kỳ hoặc tim mạch là cấp cứu.',
      presentation
    ].join('\n');
  }

  global.NBCarePolicy = Object.freeze({
    name: 'NB Care',
    version: '1.0-demo',
    medicalWarning,
    assess,
    getSystemPrompt
  });
})(window);
