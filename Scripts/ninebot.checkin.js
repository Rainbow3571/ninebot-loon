/**
 * 九号出行 - 每日自动签到 (Loon cron task)
 *
 * 依赖: 先用 http-request 抓取脚本保存 Token (ninebot.token.js)
 * 存储: $persistentStore -> ninebot_accounts
 *       格式: {"accounts":[{"deviceId":"...","authorization":"...","name":"账号1"}]}
 *
 * 流程: 查询签到状态 -> 未签到则调用签到接口 -> 结果通知
 */

const STORE_KEY = "ninebot_accounts";

const API_HOST = "cn-cbu-gateway.ninebot.com";
const URL_STATUS = "https://" + API_HOST + "/portal/api/user-sign/v2/status";
const URL_SIGN = "https://" + API_HOST + "/portal/api/user-sign/v2/sign";

const DEFAULT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420";

function loadAccounts() {
  const raw = $persistentStore.read(STORE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.accounts)) return parsed.accounts;
  } catch (e) {}
  return [];
}

function buildHeaders(authorization) {
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: authorization,
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Content-Type": "application/json",
    Host: API_HOST,
    Origin: "https://h5-bj.ninebot.com",
    Referer: "https://h5-bj.ninebot.com/",
    from_platform_1: "1",
    language: "zh",
    "User-Agent": DEFAULT_UA,
  };
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url: url, headers: headers }, (status, response, data) => {
      resolve({ status: status, data: data });
    });
  });
}

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url: url, headers: headers, body: body }, (status, response, data) => {
      resolve({ status: status, data: data });
    });
  });
}

async function checkOne(account) {
  const name = account.name || "未命名账号";
  const headers = buildHeaders(account.authorization);

  // 1. 查询状态
  const st = await httpGet(URL_STATUS + "?t=" + Date.now(), headers);
  let stBody = null;
  try {
    stBody = JSON.parse(st.data);
  } catch (e) {}

  if (!stBody || stBody.code !== 0 || !stBody.data) {
    const err = (stBody && stBody.msg) || "HTTP " + st.status + " / 无法解析响应";
    return { name: name, ok: false, msg: "Token 可能已失效: " + err };
  }

  const info = stBody.data;
  const result = {
    name: name,
    ok: true,
    consecutiveDays: info.consecutiveDays || 0,
    todayPoints: info.todayPoints || 0,
    signed: info.currentSignStatus === 1,
  };

  // 2. 已签到则直接返回
  if (result.signed) return result;

  // 3. 执行签到
  const sg = await httpPost(URL_SIGN, headers, JSON.stringify({ deviceId: account.deviceId }));
  let sgBody = null;
  try {
    sgBody = JSON.parse(sg.data);
  } catch (e) {}

  if (sgBody && sgBody.code === 0) {
    result.signed = true;
    // 重新查询一次, 拿最新连续天数
    const st2 = await httpGet(URL_STATUS + "?t=" + Date.now(), headers);
    try {
      const st2Body = JSON.parse(st2.data);
      if (st2Body && st2Body.code === 0 && st2Body.data) {
        result.consecutiveDays = st2Body.data.consecutiveDays || 0;
        result.todayPoints = st2Body.data.todayPoints || 0;
      }
    } catch (e) {}
  } else {
    result.ok = false;
    result.msg = (sgBody && sgBody.msg) || "HTTP " + sg.status;
  }
  return result;
}

(async () => {
  const accounts = loadAccounts();

  if (!accounts.length) {
    $notification.post("九号出行签到", "❌ 未配置", "请先在 Loon 中打开九号 APP 签到页面, 抓取 Token");
    $done();
    return;
  }

  const lines = [];
  for (const account of accounts) {
    const r = await checkOne(account);
    const statusIcon = r.ok && r.signed ? "✅ 已签到" : "❌ 失败";
    let line = statusIcon + " · " + r.name + " · 连续签到 " + r.consecutiveDays + " 天";
    if (r.ok && r.signed) line += " · 今日 +" + r.todayPoints + " 能量值";
    if (!r.ok && r.msg) line += " (" + r.msg + ")";
    lines.push(line);
  }

  const successCount = lines.filter((l) => l.indexOf("✅") === 0).length;
  const title = "九号出行签到 (" + successCount + "/" + accounts.length + ")";
  $notification.post(title, "", lines.join("\n"));
  console.log(title + "\n" + lines.join("\n"));
  $done();
})();
