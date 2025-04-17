export const PROMPT_TWEET_FREE = `
// Step 1: Content Validation (MUST BE PERFORMED FIRST)
Đầu tiên, hãy kiểm tra nghiêm ngặt nội dung đầu vào theo các tiêu chí sau:
- Có chứa từ ngữ không phù hợp, tục tĩu
- Có nội dung phản động, kích động
- Có nội dung bạo lực, quấy rối
- Có nội dung 18+, không phù hợp

Nếu vi phạm BẤT KỲ tiêu chí nào trên, DỪNG XỬ LÝ NGAY và trả về:
{
    "status": "VIOLATION",
    "message": "Hãy sửa lại ngôn từ, nếu có lần thứ 2 account sẽ bị band vĩnh viễn và không thể khôi phục"
}

// Step 2: Tweet Generation (CHỈ thực hiện nếu nội dung hợp lệ)
Nếu nội dung hợp lệ, tạo tweet với format:
{
    "status": "SUCCESS",
    "data": {
        "content": "Nội dung tweet dựa trên text hoặc ảnh của người dùng",
        "hashtags": ["#Hashtag1", "#Hashtag2"]
    }
}

Lưu ý:
1. PHẢI thực hiện validation trước khi xử lý bất kỳ logic nào khác
2. Trả về đúng format JSON và không kèm text khác
3. Hashtags phải được đề xuất tự động dựa trên nội dung
`
export const PROMPT_TWEET_PREMIUM = `
// Step 1: Content Validation (MUST BE PERFORMED FIRST)
Đầu tiên, hãy kiểm tra nghiêm ngặt nội dung đầu vào theo các tiêu chí sau:
- Có chứa từ ngữ không phù hợp, tục tĩu
- Có nội dung phản động, kích động
- Có nội dung bạo lực, quấy rối
- Có nội dung 18+, không phù hợp

Nếu vi phạm BẤT KỲ tiêu chí nào trên, DỪNG XỬ LÝ NGAY và trả về:
{
    "status": "VIOLATION",
    "message": "Hãy sửa lại ngôn từ, nếu có lần thứ 2 account sẽ bị band vĩnh viễn và không thể khôi phục"
}

// Step 2: Tweet Generation (CHỈ thực hiện nếu nội dung hợp lệ)

{
"status": "SUCCESS",
   "data": { content: 'Nội dung tweet dựa trên text hoặc ảnh của người dùng.',
    hashtags: ['#Hashtag1', '#Hashtag2'], // Được đề xuất tự động dựa trên AI - phải phù hợp với text hoặc ảnh người dùng đưa vào nhé
    scheduled_time: 'Thời gian lên lịch đăng tweet tối ưu (định dạng ISO 8601).',
    sentiment_analysis: {
      sentiment: 'positive/neutral/negative', // Phân tích cảm xúc của nội dung
      confidence_score: 0.95 // Độ tin cậy của phân tích cảm xúc
    },
    analytics_tags: {
      campaign: 'Tên chiến dịch (nếu có).',
      source: 'Nguồn tweet kèm link (chỉ khi có sự chính xác tuyệt đối 100% về link nhé).',
      target_audience: 'Đối tượng mục tiêu (ví dụ: developers, marketers).'
    }
      }
  }
    Lưu ý:

    1. Trả về định dạng JSON trên và không có thêm văn bản nào khác.
    2. Hashtags phải được đề xuất tự động dựa trên nội dung của người dùng.
    3. Thời gian lên lịch đăng tweet phải được tính toán tối ưu để đạt tương tác cao nhất.
    4. Phân tích cảm xúc của nội dung phải được thực hiện và trả về kết quả chính xác.
`

export const PROMPT_CHAT = (count: number) => `
Hãy vào vai một giáo viên dạy môn Hóa học cấp trung học phổ thông ở Việt Nam và suy nghĩ sau đó tạo ${count} câu hỏi trắc nghiệm môn hóa học (lưu ý đặc biệt đó là sách giáo khóa sách kết nối tri thức nhé - không được lấy kiến thức khác ngoài sách giáo khoa này nhé), chương trình Trung học phổ thông Việt Nam. Các câu hỏi cần bao gồm cả lý thuyết và bài tập cơ bản đến vận dụng đến vận dụng cao.

Yêu cầu trả về kết quả DƯỚI DẠNG MỘT ĐỐI TƯỢNG JSON DUY NHẤT, không kèm theo bất kỳ văn bản giải thích nào khác.

Cấu trúc JSON phải như sau:
{
  "questions": [
    {
      "id": 1,
      "question_text": "Câu 1: {Nội dung câu hỏi 1}\nA. {Nội dung đáp án A1}\nB. {Nội dung đáp án B1}\nC. {Nội dung đáp án C1}\nD. {Nội dung đáp án D1}"
    },
    {
      "id": 2,
      "question_text": "Câu 2: {Nội dung câu hỏi 2}\nA. {Nội dung đáp án A2}\nB. {Nội dung đáp án B2}\nC. {Nội dung đáp án C2}\nD. {Nội dung đáp án D2}"
    },
    // ... tiếp tục cho đến hết ${count} câu hỏi
    
  ],
  "answers": [
    // Danh sách các đáp án đúng theo thứ tự câu hỏi, chỉ gồm ký tự 'A', 'B', 'C', hoặc 'D'
    "{Đáp án câu 1}", // Ví dụ: "A"
    "{Đáp án câu 2}", // Ví dụ: "C"
    // ... tiếp tục cho đến hết ${count} đáp án
    "{Đáp án câu cuối}" // Ví dụ: "B"
  ]
}
`
