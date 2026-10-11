// Bot Telegram: mở game + bán vật phẩm bằng Telegram Stars
// Chạy: BOT_TOKEN=xxx WEBAPP_URL=https://game-cua-ban.vercel.app node bot.js
import { Bot, InlineKeyboard } from "grammy";
import express from "express";
import crypto from "node:crypto";

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = process.env.PORT || 3000;
if (!BOT_TOKEN || !WEBAPP_URL) throw new Error("Thiếu BOT_TOKEN hoặc WEBAPP_URL");

// Giá phải khớp với PRODUCTS trong index.html
const PRODUCTS = {
  lives5:   { title: "Hồi đầy 5 mạng",  description: "Nạp đầy 5 mạng để chơi tiếp ngay",   stars: 20 },
  inf1h:    { title: "Mạng vô hạn 1 giờ", description: "Chơi không giới hạn mạng trong 60 phút", stars: 35 },
  moves5:   { title: "+5 lượt đi",      description: "Thêm 5 lượt để hoàn thành màn chơi", stars: 15 },
  hammer3:  { title: "3 Búa",           description: "Đập vỡ bất kỳ ô nào trên bàn",       stars: 25 },
  shuffle3: { title: "3 lần Trộn",      description: "Xáo trộn lại toàn bộ bàn chơi",      stars: 20 },
  starter:  { title: "Gói khởi đầu",    description: "5 Búa + 5 lần Trộn",                 stars: 50 },
};

const bot = new Bot(BOT_TOKEN);

bot.command("start", (ctx) =>
  ctx.reply("🍓 Chào mừng đến Ghép Trái Cây!\nGhép 3 trái giống nhau để ghi điểm và vượt màn.", {
    reply_markup: new InlineKeyboard().webApp("🎮 Chơi ngay", WEBAPP_URL),
  })
);

// Telegram yêu cầu bot bán hàng bằng Stars có lệnh hỗ trợ thanh toán
bot.command("paysupport", (ctx) =>
  ctx.reply("Cần hỗ trợ thanh toán? Hãy mô tả vấn đề, kèm thời gian mua. Chúng tôi sẽ phản hồi trong 24 giờ.")
);

// Bắt buộc: xác nhận đơn trong vòng 10 giây, nếu không giao dịch sẽ bị hủy
bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on("message:successful_payment", (ctx) => {
  const p = ctx.message.successful_payment;
  // TODO: lưu vào database (charge_id dùng để hoàn tiền nếu cần)
  console.log("💰", ctx.from.id, p.total_amount, "Stars", p.invoice_payload, p.telegram_payment_charge_id);
});

// Kiểm tra initData do Telegram ký, để biết request thật sự đến từ người chơi
function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (calc !== hash) return null;
  return JSON.parse(params.get("user") || "{}");
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => res.send("OK"));

app.post("/api/invoice", async (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: "initData không hợp lệ" });
  const p = PRODUCTS[req.body.item];
  if (!p) return res.status(400).json({ error: "Không có sản phẩm này" });
  try {
    const link = await bot.api.raw.createInvoiceLink({
      title: p.title,
      description: p.description,
      payload: JSON.stringify({ item: req.body.item, uid: user.id, t: Date.now() }),
      currency: "XTR", // XTR = Telegram Stars
      prices: [{ label: p.title, amount: p.stars }],
    });
    res.json({ link });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Lỗi tạo hóa đơn" });
  }
});

app.listen(PORT, () => console.log("API chạy ở cổng", PORT));
bot.start();
console.log("Bot đã chạy");
