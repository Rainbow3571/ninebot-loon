/**
 * 九号出行 - Token 抓取脚本 v4 (Loon http-request)
 *
 * 手动开关: 插件详情页的「抓取Token开关」(对应 $argument)
 *   打开 -> 打开九号APP签到页才会抓取并弹一条通知
 *   关闭 -> 静默, 完全不弹通知 (默认)
 * 兜底: 若插件参数不生效, 可在 Loon「脚本 → 数据持久化」写入
 *       key = ninebot_capture, value = 1 强制开启
 *
 * 说明: 签到页会同时发 sign / status 两类请求, sign 的请求头里没有
 *       device_id, 因此这里对抓不到的请求一律静默跳过, 不再弹失败通知。
 */

const STORE_KEY = "ninebot_accounts";
const FORCE_KEY = "ninebot_capture";

function truthy(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE";
}

function switchOn() {
  // 1) 插件参数 (兼容对象 / 数组 / 字符串 三种形态)
  const a = typeof $argument === "undefined" ? undefined : $argument;
  if (truthy(a)) return true;
  if (a && typeof a === "object") {
    if (Array.isArray(a)) return truthy(a[0]) || truthy(a[1]);
    if (truthy(a.capture) || truthy(a.enabled)) return true;
  } else if (typeof a === "string") {
    if (/(?:^|[&,])?(?:capture|enabled)=true/i.test(a)) return true;
  }
  // 2) 持久化存储兜底
  return $persistentStore.read(FORCE_KEY) === "1";
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  const lower = {};
  for (const k in obj) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    if (lower[k.toLowerCase()] !== undefined) return lower[k.toLowerCase()];
  }
  return "";
}

// 开关关闭: 完全静默
if (!switchOn()) {
  $done({});
} else {
  const headers = ($request && $request.headers) || {};
  const authorization = pick(headers, "Authorization");
  const deviceId = pick(headers, "device_id", "Device-ID", "Device-Id");

  // 抓不到凭证 (例如 sign 请求把 deviceId 放在 body): 静默跳过, 不弹失败通知
  if (!authorization || !deviceId) {
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

    const idx = accounts.findIndex((x) => x.deviceId === deviceId);
    const now = Date.now();
    // 60 秒内重复抓到相同凭证: 只更新时间, 不再重复弹通知
    const duplicate =
      idx >= 0 &&
      accounts[idx].authorization === authorization &&
      now - (accounts[idx].updatedAt || 0) < 60000;

    if (idx >= 0) {
      accounts[idx].authorization = authorization;
      accounts[idx].updatedAt = now;
    } else {
      accounts.push({
        deviceId: deviceId,
        authorization: authorization,
        name: "账号" + (accounts.length + 1),
        updatedAt: now,
      });
    }

    const saved = JSON.stringify({ accounts: accounts });
    $persistentStore.write(saved, STORE_KEY);
    console.log("[" + STORE_KEY + "] " + saved);

    if (duplicate) {
      $done({});
    } else {
      const msg =
        "deviceId: " + deviceId +
        "\nAuthorization: " + authorization +
        "\n已保存账号数: " + accounts.length +
        "\n\n抓完记得回插件页把「抓取Token开关」关掉";
      $notification.post("九号Token获取", "✅ 已保存 (点通知复制完整数据)", msg, { clipboard: saved });
      $done({});
    }
  }
}
