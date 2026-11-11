/**
 * 九号出行 - 查看已抓取的 Token (Loon generic 手动脚本)
 *
 * 用法: Loon → 脚本 → 手动脚本 / generic → 找到「九号Token查看」点一下,
 *       会以系统通知形式列出已保存的全部账号信息;
 *       点击通知会把完整 JSON 复制到剪贴板。
 */

const STORE_KEY = "ninebot_accounts";

const raw = $persistentStore.read(STORE_KEY);
let accounts = [];
try {
  const parsed = raw ? JSON.parse(raw) : null;
  if (parsed && Array.isArray(parsed.accounts)) accounts = parsed.accounts;
} catch (e) {}

console.log("[" + STORE_KEY + "] " + (raw || "(空)"));

if (!accounts.length) {
  $notification.post("九号Token查看", "❌ 暂无数据", "请先在 Loon 开启 MITM, 然后打开九号 APP 的签到页面抓取 Token");
  $done();
} else {
  const lines = accounts.map((a, i) => {
    const t = a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "未知";
    return (
      "账号" + (i + 1) + " " + (a.name || "未命名") +
      "\n  deviceId: " + (a.deviceId || "-") +
      "\n  Authorization: " + (a.authorization || "-") +
      "\n  抓取时间: " + t
    );
  });

  const subtitle = "✅ 已保存 " + accounts.length + " 个账号 (点通知复制完整数据)";
  const content = lines.join("\n\n");
  // clipboard: 点击通知时把完整 JSON 写入剪贴板
  $notification.post("九号Token查看", subtitle, content, { clipboard: raw || "" });
  $done();
}
