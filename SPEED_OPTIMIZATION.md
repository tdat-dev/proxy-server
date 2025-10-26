# Hướng dẫn giải quyết vấn đề dịch chậm

## 🐌 Vấn đề: Tại sao dịch lâu?

### Nguyên nhân chính:

**1. Render.com Free Plan - Cold Start (30-50 giây)**

- Server free sleep sau 15 phút không hoạt động
- Khi có request mới, cần 30-50 giây để wake up
- Đây là nguyên nhân chính làm dịch lâu ở lần đầu

**2. Gemini API response time (2-5 giây)**

- Thời gian xử lý bình thường của AI
- Phụ thuộc vào độ dài văn bản

**3. Network latency**

- Khoảng cách giữa client → Render server → Google API

---

## ✅ Giải pháp đã implement

### 1. Keep-alive mechanism (MỚI THÊM)

**Code đã thêm vào `server.js`:**

- Server tự ping chính nó mỗi 10 phút
- Giữ server luôn "thức" trên Render.com
- Giảm thiểu cold start

**Cần làm trên Render.com:**

1. Vào Dashboard → proxy-server
2. Click **Environment**
3. Thêm biến môi trường mới:
   ```
   Key: SELF_URL
   Value: https://proxy-server-4lb3.onrender.com
   ```
4. Click **Save Changes**
5. Server sẽ tự động redeploy

### 2. Translation Cache (ĐÃ CÓ)

- Cache bản dịch trong 72 giờ
- Request lặp lại trả về ngay lập tức
- Giảm 90% thời gian dịch cho văn bản đã dịch

### 3. Rate limiting (ĐÃ CÓ)

- 60 requests/phút
- Tránh spam, đảm bảo response ổn định

---

## 🚀 Cách cải thiện thêm

### Option 1: Upgrade Render Plan (Khuyến nghị)

**Render Starter Plan - $7/tháng:**

- ✅ KHÔNG có cold start
- ✅ Server luôn sẵn sàng
- ✅ Response nhanh mọi lúc (2-5 giây)
- ✅ 512MB RAM (đủ cho mọi request)

**Cách upgrade:**

1. Vào Render Dashboard
2. Chọn proxy-server
3. Click **Upgrade to Paid Plan**
4. Chọn **Starter** ($7/month)

### Option 2: Dùng UptimeRobot (MIỄN PHÍ)

**Tự động ping server mỗi 5 phút:**

1. Đăng ký tài khoản: https://uptimerobot.com
2. Tạo monitor mới:
   - Monitor Type: **HTTP(s)**
   - URL: `https://proxy-server-4lb3.onrender.com/health`
   - Monitoring Interval: **5 minutes**
   - Monitor Name: Translation Server Keep-Alive
3. Save

**Ưu điểm:**

- ✅ Miễn phí 100%
- ✅ Giữ server luôn thức
- ✅ Nhận email nếu server down

**Nhược điểm:**

- ⚠️ Vẫn có cold start nếu có 15 phút không có request thật
- ⚠️ UptimeRobot chỉ ping 5 phút/lần (Render sleep sau 15 phút idle)

### Option 3: Deploy lên Railway/Fly.io

**Railway.io:**

- $5/tháng cho 500 giờ runtime
- Không cold start
- Deploy dễ dàng từ GitHub

**Fly.io:**

- $1.94/tháng cho shared-cpu-1x
- Không cold start
- Global edge deployment

---

## 📊 So sánh thời gian response

| Tình huống                           | Thời gian  | Giải pháp                  |
| ------------------------------------ | ---------- | -------------------------- |
| **Cold Start (lần đầu sau 15 phút)** | 30-50 giây | UptimeRobot hoặc Paid Plan |
| **Cache hit (đã dịch)**              | <100ms     | ✅ Đã có                   |
| **Request bình thường**              | 2-5 giây   | ✅ Bình thường             |
| **Request với keep-alive**           | 2-5 giây   | ✅ Đã implement            |

---

## 🔧 Testing sau khi deploy

Sau khi thêm `SELF_URL` vào Render:

1. **Test keep-alive:**

   ```bash
   # Mở logs trên Render Dashboard
   # Sẽ thấy dòng: "✓ Keep-alive ping successful" mỗi 10 phút
   ```

2. **Test translation speed:**
   - Thử dịch 1 đoạn văn bản
   - Lần đầu: 2-5 giây (không còn cold start nếu keep-alive hoạt động)
   - Lần sau (cùng text): <100ms (cache hit)

---

## 📝 Checklist deploy

- [ ] Push code mới lên GitHub
- [ ] Render tự động deploy
- [ ] Thêm biến `SELF_URL` trên Render Dashboard
- [ ] Kiểm tra logs xem keep-alive có chạy không
- [ ] Test translation speed
- [ ] (Tùy chọn) Setup UptimeRobot để backup keep-alive

---

## 💡 Khuyến nghị

**Nếu đây là production extension (nhiều user):**
→ **Nên upgrade Render Starter Plan ($7/tháng)**

- Ổn định nhất
- Không phụ thuộc external service
- Performance tốt nhất

**Nếu chỉ personal use hoặc testing:**
→ **Keep-alive + UptimeRobot (FREE)**

- Đủ tốt cho vài chục user
- Tiết kiệm chi phí
- Chấp nhận được chút cold start đôi khi

---

## 🆘 Troubleshooting

**Vẫn chậm sau khi setup keep-alive?**

1. Kiểm tra logs trên Render:

   ```
   ✓ Keep-alive ping successful
   ```

   Nếu không thấy → Chưa thêm `SELF_URL`

2. Kiểm tra server có sleep không:

   ```bash
   curl https://proxy-server-4lb3.onrender.com/health
   ```

   Nếu mất >5 giây → Server đang cold start

3. Nếu vẫn chậm → Có thể do:
   - Gemini API bị rate limit
   - Network của bạn chậm
   - Text quá dài (>5000 ký tự)

**Liên hệ:**

- GitHub Issues: https://github.com/tdat-dev/proxy-server/issues
