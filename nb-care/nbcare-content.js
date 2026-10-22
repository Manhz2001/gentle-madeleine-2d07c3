(function (global) {
  'use strict';

  // All content in this file is a local interface fixture, not clinical advice.
  const sources = [
    {
      id: 'doc1',
      title: 'Thông tin đầu vào cho một câu hỏi tư vấn',
      type: 'Tài liệu mẫu',
      status: 'Tài liệu mẫu · minh họa giao diện',
      section: 'Mục 01 · Làm rõ câu hỏi',
      excerpt: 'Mẫu giao diện thu thập tên thuốc, hàm lượng, dạng bào chế, câu hỏi cụ thể và thông tin liên quan do người dùng chủ động cung cấp. Không yêu cầu tên đầy đủ, số căn cước, số điện thoại hay hồ sơ bệnh án có định danh. Tài liệu này chỉ mô tả luồng hỏi đáp trong bản demo.'
    },
    {
      id: 'doc2',
      title: 'Quy tắc sử dụng kho nguồn đóng',
      type: 'Tài liệu mẫu',
      status: 'Tài liệu mẫu · minh họa giao diện',
      section: 'Mục 02 · Nguồn và trích dẫn',
      excerpt: 'Thiết kế dự kiến chỉ tra cứu kho tài liệu được đơn vị lựa chọn và phê duyệt. Ưu tiên cao nhất tài liệu đang có trên DrugView Ninh Bình và đã được bệnh viện duyệt; sau đó là tài liệu chính thống Việt Nam, hướng dẫn bệnh viện và tờ hướng dẫn sử dụng thuốc PDF. Nghiên cứu được lập chỉ mục trên PubMed chỉ được sử dụng sau khi kiểm chứng và đưa vào kho cho phép; tên PubMed không tự xác nhận chất lượng của một nghiên cứu. Mỗi nhận định chuyên môn phải gắn đúng tài liệu và đoạn trích thực tế; không bịa tên tài liệu, đường dẫn, DOI hoặc số trang. Nếu thiếu căn cứ, thông báo giới hạn thay vì bổ sung từ trí nhớ hay tìm trực tiếp trên Internet. Bản demo chưa nạp tài liệu chuyên môn và không gọi mô hình AI.'
    },
    {
      id: 'doc3',
      title: 'Khung trả lời và giới hạn tư vấn',
      type: 'Tài liệu mẫu',
      status: 'Tài liệu mẫu · minh họa giao diện',
      section: 'Mục 03 · Hai mức độ trả lời',
      excerpt: 'Cả hai chế độ trả lời ngắn gọn, khách quan, có gạch đầu dòng và giải thích thuật ngữ bằng ngôn ngữ dễ hiểu. Cơ bản ưu tiên ý chính; Chuyên sâu thêm căn cứ và giới hạn, không dùng thêm nguồn chưa duyệt. NB Care không phải bác sĩ, không chẩn đoán xác định hoặc kê đơn riêng cho người dùng. Câu hỏi thuộc nhóm cần cảnh báo theo bộ hướng dẫn phải kèm nguyên văn dòng cảnh báo y tế. Các câu trả lời ở bản demo là kịch bản cố định để duyệt giao diện, không phải tư vấn từ mô hình AI.'
    }
  ];

  const suggestions = [
    {label: 'Hỏi về thuốc', question: 'Tôi cần cung cấp gì khi hỏi về thuốc?', icon: 'pill'},
    {label: 'Chuẩn bị trước khi khám', question: 'Tôi cần chuẩn bị thông tin gì trước khi hỏi về sức khỏe?', icon: 'clipboard'},
    {label: 'Tra cứu nguồn', question: 'NB Care sử dụng nguồn nào?', icon: 'book'},
    {label: 'Thuốc tiêm truyền', question: 'Tôi muốn hỏi về cách pha một thuốc tiêm.', icon: 'flask'}
  ];

  function normalize(value) {
    return String(value == null ? '' : value).slice(0, 1600).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  }

  function reply(title, summary, sections, sourceIds, followUps, extra) {
    return Object.assign({title, summary, sections, sourceIds, followUps, tone: 'normal', needsSource: false}, extra || {});
  }

  function sourcePolicy(deep) {
    return reply(
      'Nguồn của NB Care',
      'NB Care ưu tiên DrugView Ninh Bình và có thể tra cứu nguồn công khai chính thống.',
      deep ? [
        {title: 'Thứ tự ưu tiên nguồn', bullets: ['Ưu tiên cao nhất tài liệu đang có trên DrugView Ninh Bình và đã được bệnh viện duyệt.', 'Tiếp theo là tài liệu chính thống Việt Nam, hướng dẫn bệnh viện và tờ hướng dẫn sử dụng thuốc PDF.', 'Chỉ dùng nghiên cứu PubMed đã kiểm chứng, được đưa vào kho cho phép.', 'Cơ bản và Chuyên sâu dùng cùng thứ tự ưu tiên nguồn chính thống.']},
        {title: 'Cách kiểm chứng', bullets: ['Gắn đúng tài liệu và đoạn trích thực tế.', 'Không bịa tài liệu, đường dẫn, DOI hoặc số trang.', 'Không đủ căn cứ thì nói rõ giới hạn; không tự tìm trên Internet.']},
        {title: 'Trong bản xem trước', text: 'Các thẻ nguồn bên dưới là tài liệu mẫu mô tả thiết kế. Chúng không phải hướng dẫn chuyên môn của bệnh viện và không xác nhận một khuyến cáo điều trị.'}
      ] : [
        {title: 'Nguyên tắc', bullets: ['Ưu tiên tài liệu đã duyệt trên DrugView Ninh Bình, rồi đến nguồn chính thống Việt Nam.', 'Chỉ dùng nguồn chính thống có thể kiểm tra; trích đúng tài liệu và không tạo nguồn giả.', 'Chưa đủ căn cứ chính thống thì nói rõ giới hạn.']}
      ],
      ['doc2', 'doc3'],
      ['Cơ bản và Chuyên sâu khác nhau thế nào?', 'Tôi cần cung cấp gì khi hỏi về thuốc?']
    );
  }

  function intake(deep) {
    return reply(
      'Bắt đầu từ đúng thông tin',
      'Bạn có thể bắt đầu bằng tên thuốc và điều bạn muốn hỏi. Tôi sẽ giúp làm rõ câu hỏi trước khi tra cứu nguồn phù hợp.',
      deep ? [
        {title: 'Nhận diện thuốc', bullets: ['Tên biệt dược hoặc hoạt chất ghi trên nhãn.', 'Hàm lượng hoặc nồng độ và dạng bào chế.', 'Nội dung y lệnh hoặc hướng dẫn đang cần làm rõ, nếu có.']},
        {title: 'Bối cảnh câu hỏi', bullets: ['Bạn cần hỏi về cách dùng, tương tác, bảo quản hay một vấn đề khác?', 'Thông tin liên quan như nhóm tuổi, tiền sử dị ứng hoặc các thuốc đang dùng, nếu cần để làm rõ câu hỏi.']},
        {title: 'Bước tiếp theo', text: 'Khi có kho nguồn được duyệt, NB Care sẽ đối chiếu câu hỏi với tài liệu. Bản demo hiện chỉ minh họa cách trao đổi, chưa đưa ra kết luận về thuốc cụ thể.'}
      ] : [
        {title: 'Bạn cho tôi biết', bullets: ['Tên thuốc, hàm lượng và dạng thuốc.', 'Bạn muốn hỏi điều gì về thuốc đó?', 'Các thông tin liên quan mà bạn thấy cần làm rõ.']},
        {title: 'Lưu ý khi nhập', text: 'Không cần gửi tên đầy đủ, số căn cước hay thông tin nhận diện người bệnh.'}
      ],
      ['doc1', 'doc3'],
      ['NB Care sử dụng nguồn nào?', 'Tôi muốn hỏi về cách pha một thuốc tiêm.']
    );
  }

  function preparation(deep) {
    return reply(
      'Chuẩn bị cho một câu hỏi rõ ràng',
      'Bạn có thể sắp xếp điều muốn hỏi và các thông tin liên quan trước khi trao đổi với nhân viên y tế.',
      deep ? [
        {title: 'Mô tả vấn đề', bullets: ['Điều bạn đang quan tâm và câu hỏi muốn được giải đáp.', 'Diễn biến và thời điểm xuất hiện, nếu câu hỏi liên quan đến sức khỏe.', 'Thông tin về thuốc, dị ứng hoặc kết quả đã có mà bạn muốn làm rõ.']},
        {title: 'Giữ thông tin phù hợp', text: 'Chỉ nêu nội dung cần thiết cho câu hỏi. Bản demo không cần ảnh hồ sơ bệnh án hoặc dữ liệu định danh.'},
        {title: 'Giới hạn của bản demo', text: 'NB Care chưa đánh giá triệu chứng hoặc đề xuất xử trí. Câu trả lời ở đây là mẫu thiết kế cách thu thập thông tin để hỗ trợ trao đổi.'}
      ] : [
        {title: 'Có thể chuẩn bị', bullets: ['Một câu hỏi chính bạn muốn làm rõ.', 'Thông tin về thuốc hoặc tình trạng đang quan tâm.', 'Các nội dung đã được nhân viên y tế hướng dẫn và bạn cần giải thích thêm.']}
      ],
      ['doc1', 'doc3'],
      ['Tôi cần cung cấp gì khi hỏi về thuốc?', 'NB Care sử dụng nguồn nào?']
    );
  }

  function modeExplanation(deep) {
    return reply(
      'Hai chế độ, cùng một phạm vi nguồn',
      'Cả hai đều ngắn gọn, dễ hiểu, khách quan và không gây hoang mang. Chuyên sâu thêm căn cứ và giới hạn, không mở rộng phạm vi tư vấn.',
      deep ? [
        {title: 'Cách trình bày', bullets: ['Cơ bản: vài ý chính bằng ngôn ngữ phổ thông.', 'Chuyên sâu: tóm tắt, căn cứ và giới hạn rõ ràng.', 'Dùng gạch đầu dòng; giải thích thuật ngữ khó.']},
        {title: 'Giới hạn chung', bullets: ['Không chẩn đoán xác định hoặc kê đơn cá nhân.', 'Không suy đoán hay thêm nguồn chưa được duyệt.', 'Thiếu căn cứ thì nói rõ; thêm cảnh báo y tế khi thuộc nhóm quy định.']}
      ] : [
        {title: 'Bạn có thể chuyển bất cứ lúc nào', bullets: ['Cơ bản: ý chính, dễ đọc.', 'Chuyên sâu: thêm căn cứ và giới hạn.', 'Cùng nguồn đã duyệt; không chẩn đoán hay kê đơn.']},
        {title: 'Ở bản demo', text: 'Các câu trả lời là mẫu cố định, chưa có mô hình AI.'}
      ],
      ['doc2', 'doc3'],
      ['NB Care sử dụng nguồn nào?', 'Tôi cần cung cấp gì khi hỏi về thuốc?']
    );
  }

  function missingClinicalSource(deep) {
    return reply(
      'Chưa đủ nguồn để trả lời',
      'Tôi không phải bác sĩ. Bản demo chưa kết nối tài liệu chuyên môn nên chưa thể đưa ra kết luận y khoa hoặc hướng dẫn dùng thuốc cho trường hợp cụ thể.',
      deep ? [
        {title: 'Cần làm rõ', bullets: ['Vấn đề và nội dung bạn đang muốn tìm hiểu.', 'Nếu hỏi về thuốc: tên, hàm lượng hoặc nồng độ và dạng bào chế.', 'Tài liệu chuyên môn được duyệt tương ứng với câu hỏi.']},
        {title: 'Cách NB Care sẽ xử lý khi có dữ liệu', text: 'Tìm đúng tài liệu và phiên bản, hiển thị phần căn cứ, nêu thông tin còn thiếu rồi mới trình bày nội dung trong phạm vi nguồn.'},
        {title: 'Giới hạn', bullets: ['Không chẩn đoán xác định hoặc kê đơn cá nhân.', 'Không bịa căn cứ khi chưa có tài liệu.', 'Tài liệu mẫu của giao diện không phải căn cứ điều trị.']}
      ] : [
        {title: 'Để tiếp tục', bullets: ['Nêu rõ điều bạn muốn tìm hiểu.', 'Nếu liên quan đến thuốc, cho biết tên và hàm lượng.', 'Trao đổi với nhân viên y tế về quyết định chăm sóc thực tế.']}
      ],
      [],
      ['Tôi cần cung cấp gì khi hỏi về thuốc?', 'NB Care sử dụng nguồn nào?'],
      {tone: 'needs-source', needsSource: true}
    );
  }

  function urgentDemo(deep) {
    return reply(
      'Cần hỗ trợ trực tiếp',
      'NB Care demo không đánh giá hoặc xử trí tình huống khẩn cấp. Với tình huống cần hỗ trợ ngay, hãy liên hệ nhân viên y tế hoặc cơ sở y tế để được hỗ trợ trực tiếp.',
      deep ? [
        {title: 'Giới hạn của kênh chat', text: 'Bản xem trước không có người trực, không theo dõi tình trạng người bệnh và không thực hiện phân loại cấp cứu.'},
        {title: 'Mục đích hiển thị', text: 'Đây là mẫu giao diện thông báo giới hạn và chuyển hướng sang hỗ trợ trực tiếp, không phải một đánh giá y khoa cho nội dung bạn vừa nhập.'}
      ] : [],
      [],
      ['Xem giới hạn của NB Care'],
      {tone: 'urgent-demo'}
    );
  }

  function missingEducationalSource(deep, topic) {
    const terminology = topic === 'terminology';
    return reply(
      terminology ? 'Cần nguồn để giải thích đúng thuật ngữ' : 'Cần nguồn cho thông tin lối sống lành mạnh',
      terminology ? 'NB Care được thiết kế để giải thích thuật ngữ y khoa bằng ngôn ngữ phổ thông. Bản demo chưa có tài liệu được duyệt cho câu hỏi này nên chưa đưa ra định nghĩa chuyên môn.' : 'NB Care được thiết kế để giúp bạn hiểu các thói quen sống lành mạnh từ nguồn chuẩn. Bản demo chưa có tài liệu được duyệt cho câu hỏi này nên chưa đưa ra khuyến nghị cụ thể.',
      deep ? [
        {title: 'Để làm rõ', bullets: terminology ? ['Nêu thuật ngữ và câu chứa thuật ngữ đó.', 'Cho biết nội dung bạn muốn hiểu rõ hơn.'] : ['Nêu chủ đề bạn quan tâm, như sinh hoạt hoặc dinh dưỡng.', 'Cho biết điều bạn muốn tìm hiểu, không cần dữ liệu định danh.']},
        {title: 'Khi có dữ liệu', bullets: ['Đối chiếu trước với tài liệu đã duyệt trên DrugView Ninh Bình.', 'Nếu chưa có, dùng nguồn chính thống Việt Nam đã được đưa vào kho.', 'Giải thích ngắn gọn và gắn căn cứ thực tế.', 'Nêu giới hạn thay vì suy đoán.']}
      ] : [{title: 'Bạn có thể tiếp tục', bullets: [terminology ? 'Nêu thuật ngữ và ngữ cảnh cần giải thích.' : 'Nêu một thói quen hoặc chủ đề muốn tìm hiểu.', 'Chưa có nguồn phù hợp thì chưa đưa kết luận.']}],
      [],
      ['NB Care sử dụng nguồn nào?', 'Cơ bản và Chuyên sâu khác nhau thế nào?'],
      {tone: 'needs-source', needsSource: true}
    );
  }

  function buildResponse(question, mode, assessment) {
    const text = normalize(question), deep = mode === 'deep';
    if (assessment.urgent) return urgentDemo(deep);
    if (assessment.requiresWarning) return missingClinicalSource(deep);
    if (/nguon nao|su dung nguon|tai lieu nao|nguon dong|internet|kiem chung|tai lieu duoc duyet/.test(text)) return sourcePolicy(deep);
    if (/che do|chuyen sau|co ban|gioi han|cau tra loi.*gom/.test(text)) return modeExplanation(deep);
    if (/thuat ngu|dinh nghia|nghia la gi|giai thich.*y khoa/.test(text)) return missingEducationalSource(deep, 'terminology');
    if (/loi song|song lanh manh|thoi quen|dinh duong|an uong|the duc|van dong|giac ngu|ngu du/.test(text)) return missingEducationalSource(deep, 'lifestyle');
    if (/cung cap|thong tin gi|bat dau|hoi ve thuoc/.test(text) && /thuoc/.test(text)) return intake(deep);
    if (/truoc khi kham|di kham|truoc khi hoi|chuan bi|hoi ve suc khoe/.test(text)) return preparation(deep);
    if (/thuoc|lieu dung|cach pha|hoan nguyen|tiem|truyen|tuong tac|tuong ky|chong chi dinh|co thai|cho con bu|trieu chung|dau|sot|mg|mcg|paracetamol|motin/.test(text)) return missingClinicalSource(deep);
    return reply(
      'Tôi có thể giúp bạn làm rõ câu hỏi',
      'Bạn muốn hỏi về thuốc, chuẩn bị thông tin trước khi khám hay cách NB Care sử dụng nguồn tài liệu?',
      deep ? [
        {title: 'Cách bắt đầu', text: 'Nêu một vấn đề cụ thể và nội dung bạn muốn làm rõ. Tôi sẽ trình bày theo chế độ bạn đang chọn.'},
        {title: 'Phạm vi bản xem trước', text: 'Hội thoại là kịch bản có sẵn để duyệt giao diện. Chưa có mô hình AI, kết nối API hoặc kho tài liệu chuyên môn thực tế.'}
      ] : [{title: 'Bản demo giao diện', text: 'Bạn có thể thử câu hỏi gợi ý, chuyển chế độ và mở thẻ nguồn để xem cách NB Care trình bày câu trả lời.'}],
      ['doc2', 'doc3'],
      ['Tôi cần cung cấp gì khi hỏi về thuốc?', 'NB Care sử dụng nguồn nào?']
    );
  }

  function respond(question, mode) {
    const assessment = global.NBCarePolicy.assess(question);
    const answer = buildResponse(question, mode, assessment);
    if (assessment.requiresWarning) answer.medicalWarning = global.NBCarePolicy.medicalWarning;
    return answer;
  }

  global.NBCareContent = Object.freeze({
    suggestions: Object.freeze(suggestions.map(item => Object.freeze(item))),
    sources: Object.freeze(sources.map(item => Object.freeze(item))),
    respond
  });
})(window);

