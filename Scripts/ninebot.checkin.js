/**
 * 九号出行 - 每日签到 v4 (Loon cron task)
 *
 * 功能:
 *   1. 查询签到状态 -> 未签到则签到
 *   2. 展示 连续签到天数 / 今日获得 N币 / N币余额
 *   3. 自动开启「惊喜盲盒」(blind-box/list -> rewardStatus=1 -> blind-box/receive)
 *   4. 通知里附带 status 原始字段, 点击通知复制完整 JSON
 *
 * 依赖: $persistentStore key `ninebot_accounts` (由 ninebot.token.js 写入)
 * 盲盒链路参考: Qcby/QcbyScript 的 HAR + 前端源码逆向 (2026-07)
 */

const STORE_KEY = "ninebot_accounts";

const API_HOST = "cn-cbu-gateway.ninebot.com";
const BASE = "https://" + API_HOST + "/portal/api/user-sign/v2";
const URL_STATUS = BASE + "/status";
const URL_SIGN = BASE + "/sign";
const URL_BOX_LIST = BASE + "/blind-box/list";
const URL_BOX_RECEIVE = BASE + "/blind-box/receive";

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

// 注意: device_id 请求头必须带, 否则部分接口返回空奖励
function buildHeaders(authorization, deviceId) {
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
    device_id: deviceId,
  };
}

function parseBody(data) {
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function httpGet(url, headers) {
  return new Promise((resolve) => {
    $httpClient.get({ url: url, headers: headers }, (error, response, data) => {
      resolve({ error: error, status: response && response.status, data: data });
    });
  });
}

function httpPost(url, headers, body) {
  return new Promise((resolve) => {
    $httpClient.post({ url: url, headers: headers, body: body }, (error, response, data) => {
      resolve({ error: error, status: response && response.status, data: data });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 奖励对象 -> 文案 + N币数值 (rewardType=2 即 N币)
function formatReward(reward) {
  const r = reward || {};
  const t = Number(r.rewardType !== undefined ? r.rewardType : r.type);
  const v = r.rewardValue !== undefined ? r.rewardValue : r.value !== undefined ? r.value : "";
  const n = t === 2 ? Number(v) || 0 : 0;
  let text;
  if (t === 1) text = "经验值 +" + v;
  else if (t === 2) text = "N币 +" + v;
  else if (t === 3) text = "勋章 " + (r.medalName || v || "");
  else if (t === 4) text = "补签卡 +" + v;
  else if (t === 5) text = "商城抵扣券";
  else if (v !== "" && v !== undefined) text = "类型" + (t || "?") + " " + v;
  else text = JSON.stringify(r);
  return { text: String(text).trim(), nCoin: n };
}

// 把 status.data 里的数值字段全部摊平, 用于自动识别 N币余额/今日获得
function flattenNumbers(obj, prefix, out, depth) {
  if (!obj || typeof obj !== "object" || depth > 3) return;
  for (const k in obj) {
    const v = obj[k];
    const path = prefix ? prefix + "." + k : k;
    if (typeof v === "number" && isFinite(v)) out.push([path, v]);
    else if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) out.push([path, Number(v)]);
    else if (v && typeof v === "object" && !Array.isArray(v)) flattenNumbers(v, path, out, depth + 1);
  }
}

function fieldLines(info) {
  const pairs = [];
  flattenNumbers(info, "", pairs, 0);
  const balance = pairs.filter(
    ([k]) => /(balance|total|remain|available|可用|余额|coin|points|积分|n币)/i.test(k) &&
      !/(today|daily|consecutive|leftDays|awardDays|rewardStatus|currentSignStatus|status)/i.test(k)
  );
  const gain = pairs.filter(([k]) => /(today|daily|gain|award|rewardValue|今日)/i.test(k));
  const fmt = (arr) => arr.slice(0, 2).map(([k, v]) => k + "=" + v).join(", ");
  return {
    balanceText: fmt(balance) || "未识别(点通知复制原始数据查看字段)",
    gainText: fmt(gain),
    fieldsText: pairs.slice(0, 12).map(([k, v]) => k + "=" + v).join(", "),
    raw: JSON.stringify(info),
  };
}

// 自动开启所有可领的惊喜盲盒
async function openBlindBoxes(headers) {
  const res = await httpGet(URL_BOX_LIST + "?t=" + Date.now(), headers);
  const body = parseBody(res.data);
  if (res.error || !body || body.code !== 0 || !body.data) {
    return { text: "盲盒: 列表获取失败", nCoin: 0, rewards: [], raw: res.data || String(res.error || "") };
  }

  const boxes = Array.isArray(body.data.notOpenedBoxes) ? body.data.notOpenedBoxes : [];
  const claimable = [];
  const pending = [];
  const seen = {};

  for (const box of boxes) {
    if (!box || typeof box !== "object") continue;
    const status = Number(box.rewardStatus);
    const ids = Array.isArray(box.blindBoxIds) ? box.blindBoxIds.filter(Boolean) : [];
    if (status === 1 && ids.length) {
      for (const id of ids) {
        if (!seen[id]) {
          seen[id] = true;
          claimable.push({ rewardId: id, awardDays: box.awardDays });
        }
      }
    } else if (status === 2 && box.leftDaysToOpen !== undefined && box.leftDaysToOpen !== null) {
      pending.push(box.awardDays + "天(还差" + box.leftDaysToOpen + "天)");
    }
  }

  if (!claimable.length) {
    let t = "盲盒: 暂无待开";
    if (pending.length) t += "；未到 " + pending.slice(0, 3).join("、");
    return { text: t, nCoin: 0, rewards: [], raw: JSON.stringify(body.data) };
  }

  const rewards = [];
  let nCoin = 0;
  let okCount = 0;
  for (const item of claimable) {
    const r = await httpPost(URL_BOX_RECEIVE, headers, JSON.stringify({ rewardId: item.rewardId }));
    const rb = parseBody(r.data);
    if (!r.error && rb && rb.code === 0) {
      const f = formatReward(rb.data || {});
      rewards.push((item.awardDays !== undefined ? item.awardDays + "天盲盒 · " : "") + f.text);
      nCoin += f.nCoin;
      okCount++;
    } else {
      rewards.push("领取失败: " + ((rb && rb.msg) || r.error || "HTTP " + r.status));
    }
    await wait(1000);
  }

  return {
    text: "🎁 盲盒 " + okCount + "/" + claimable.length + " 个: " + rewards.join("、"),
    nCoin: nCoin,
    rewards: rewards,
    raw: JSON.stringify(body.data),
  };
}

async function checkOne(account) {
  const name = account.name || "未命名账号";
  const headers = buildHeaders(account.authorization, account.deviceId);

  // 1. 查询状态
  const st = await httpGet(URL_STATUS + "?t=" + Date.now(), headers);
  const stBody = parseBody(st.data);
  if (st.error || !stBody || stBody.code !== 0 || !stBody.data) {
    const err = st.error ? "请求失败: " + st.error : (stBody && stBody.msg) || "HTTP " + st.status + " / 无法解析响应";
    return { name: name, ok: false, msg: "Token 可能已失效: " + err, raw: st.data || "" };
  }

  let info = stBody.data;
  let signN = 0;
  let justSigned = false;

  // 2. 未签到则签到
  if (Number(info.currentSignStatus || 0) !== 1) {
    const sg = await httpPost(URL_SIGN, headers, JSON.stringify({ deviceId: account.deviceId }));
    const sgBody = parseBody(sg.data);
    const already = sgBody && (sgBody.code === 540004 || /已签到|already signed|cannot sign in again/i.test(sgBody.msg || ""));
    if (sgBody && (sgBody.code === 0 || already)) {
      justSigned = true;
      if (sgBody.data && typeof sgBody.data === "object") signN += formatReward(sgBody.data).nCoin;
      // 重新拉一次状态, 拿最新连续天数与 N币字段
      const st2 = await httpGet(URL_STATUS + "?t=" + Date.now(), headers);
      const st2Body = parseBody(st2.data);
      if (st2Body && st2Body.code === 0 && st2Body.data) info = st2Body.data;
    } else {
      return {
        name: name,
        ok: false,
        msg: "签到失败: " + (sg.error || (sgBody && (sgBody.msg || sgBody.key)) || "HTTP " + sg.status),
        raw: sg.data || "",
      };
    }
  }

  // 3. 自动开惊喜盲盒
  let box = { text: "盲盒: 跳过", nCoin: 0, raw: "" };
  try {
    box = await openBlindBoxes(headers);
  } catch (e) {
    box = { text: "盲盒: 异常 " + e.message, nCoin: 0, raw: "" };
  }

  const fields = fieldLines(info);
  const statusGain = Number(info.todayPoints || info.todayN || info.todayNCoin || 0);
  // 今日获得 N币 = 签到奖励 + 盲盒奖励 + status 中今日字段
  const todayN = signN + box.nCoin + (statusGain > 0 ? statusGain : 0);

  return {
    name: name,
    ok: true,
    justSigned: justSigned,
    consecutiveDays: info.consecutiveDays || 0,
    todayN: todayN,
    balanceText: fields.balanceText,
    gainText: fields.gainText,
    fieldsText: fields.fieldsText,
    boxText: box.text,
    raw: JSON.stringify({ status: info, blindBox: box.raw, signRewardN: signN, boxRewardN: box.nCoin }),
  };
}

(async () => {
  const accounts = loadAccounts();
  if (!accounts.length) {
    $notification.post("九号出行签到", "❌ 未配置", "请在插件页打开「抓取Token开关」, 再打开九号 APP 签到页");
    $done();
    return;
  }

  const lines = [];
  const raws = [];
  let successCount = 0;

  for (const account of accounts) {
    let r;
    try {
      r = await checkOne(account);
    } catch (e) {
      r = { name: account.name || "账号", ok: false, msg: "执行异常: " + e.message, raw: "" };
    }

    if (r.ok) {
      successCount++;
      lines.push("✅ " + r.name + (r.justSigned ? " · 今日签到完成" : " · 今日已签到"));
      lines.push("  连续签到 " + r.consecutiveDays + " 天");
      lines.push("  今日获得 N币 +" + r.todayN + (r.gainText ? " (" + r.gainText + ")" : ""));
      lines.push("  N币余额: " + r.balanceText);
      lines.push("  " + r.boxText);
    } else {
      lines.push("❌ " + r.name + " · " + r.msg);
    }
    if (r.raw) raws.push(r.raw);
  }

  const title = "九号出行签到 (" + successCount + "/" + accounts.length + ")";
  // 点通知复制全部原始响应, 便于确认 N币余额的确切字段名
  $notification.post(title, "点通知复制原始数据(含全部字段)", lines.join("\n"), {
    clipboard: raws.join("\n\n"),
  });
  console.log(title + "\n" + lines.join("\n"));
  $done();
})();
