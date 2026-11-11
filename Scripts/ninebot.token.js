/**
 * 九号出行 - Token 抓取脚本 (Loon http-request)
 *
 * 用途: 当打开九号 APP 的签到页面时, 自动从请求头中提取
 *       Authorization 与 device_id 并保存到 Loon 持久化存储。
 *
 * 匹配的请求: https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/*
 */

const STORE_KEY = "ninebot_accounts";

const headers = ($request && $request.headers) || {};

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  // 大小写兜底
  const lower = {};
  for (const k in obj) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    if (lower[k.toLowerCase()] !== undefined) return lower[k.toLowerCase()];
  }
  return "";
}

const authorization = pick(headers, "Authorization");
const deviceId = pick(headers, "device_id", "Device-ID", "Device-Id");

if (!authorization || !deviceId) {
  $notification.post("九号Token获取", "❌ 抓取失败", "请求头中未找到 Authorization 或 device_id");
  $done({});
} else {
  let accounts = [];
  const raw = $persistentStore.read(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.accounts)) accounts = parsed.accounts;
    } catch (e) {
      accounts = [];
    }
  }

  const idx = accounts.findIndex((a) => a.deviceId === deviceId);
  if (idx >= 0) {
    accounts[idx].authorization = authorization;
    accounts[idx].updatedAt = Date.now();
  } else {
    accounts.push({
      deviceId: deviceId,
      authorization: authorization,
      name: "账号" + (accounts.length + 1),
      updatedAt: Date.now(),
    });
  }

  $persistentStore.write(JSON.stringify({ accounts: accounts }), STORE_KEY);

  const msg = "deviceId: " + deviceId + "\nAuthorization: " + authorization.slice(0, 20) + "...";
  $notification.post("九号Token获取", "✅ 已保存 (共 " + accounts.length + " 个账号)", msg);
  $done({});
}
