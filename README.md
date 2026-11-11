# 九号出行 Loon 签到插件 (v4)

基于 [waistu/Ninebot](https://github.com/waistu/Ninebot) 与 [Qcby/QcbyScript](https://github.com/Qcby/QcbyScript) 的接口实现，适配 Loon 插件格式。

## 功能

- 每日定时签到，通知显示 **连续签到天数 / 今日获得 N币 / N币余额**
- **自动开启惊喜盲盒**（连签奖励），并列出每个盲盒开出的奖励（N币、经验值、勋章、补签卡、抵扣券）
- **抓取 Token 手动开关**：默认关闭，平时进 APP 完全不弹通知；需要重抓时手动打开
- 抓包成功通知含完整 `Authorization`，**点通知复制完整 JSON**

## 文件结构

```
ninebot-loon/
├── ninebot.plugin          # Loon 插件配置 (含 [Argument] 抓包开关)
└── Scripts/
    ├── ninebot.token.js    # 抓包脚本 (受开关控制)
    ├── ninebot.checkin.js  # 签到 + 盲盒 + 统计脚本
    └── ninebot.view.js     # 可选手动脚本: 查看已保存的 Token
```

## 使用步骤

### 1. 安装插件

Loon → `配置` → `插件` → 右上角 `+` → `从URL安装`，粘贴（jsDelivr CDN，国内可直连，已验证）：

```
https://cdn.jsdelivr.net/gh/Rainbow3571/ninebot-loon@885cf1a37eee9ca1f6a19be69c3315c212ce09e0/ninebot.plugin
```

> 插件详情页「详细」里显示 **v4** 即为最新版。想跟随最新版可把 `@885cf1a...` 换成 `@latest`（jsDelivr 缓存可能滞后数小时）。

### 2. 信任 CA 证书（抓包必需）

1. Loon → `配置` → `通用` → `MITM` → 生成 CA 证书。
2. iOS 系统设置安装描述文件并信任；再在 `关于本机` → `证书信任设置` 中开启完全信任。
3. 确认插件页「主机名」包含 `cn-cbu-gateway.ninebot.com`。

### 3. 抓取 Token（一次性，抓完就关）

1. 插件详情页把 **「抓取Token开关」打开**。
2. 打开 Loon 的 MITM，进入九号 APP「签到」页面。
3. 收到「✅ 九号Token获取」通知即成功（点通知可复制完整 JSON）。
4. **回插件页把开关关掉**，之后进 APP 不会再弹任何通知。

> 为什么以前一下成功一下失败：签到页会同时发 `status`（请求头带 `device_id`，抓取成功）和 `sign`（deviceId 在 body 里，请求头没有）两类请求。v4 对抓不到凭证的请求**静默跳过**，不再发失败通知，并做了 60 秒内重复去重。

**开关不生效时的兜底**：Loon → `脚本` → `数据持久化` → `导入指定数据`，key 填 `ninebot_capture`，value 填 `1` 即强制开启；不需要时把这个 key 删掉。

### 4. 查看已抓取的内容

- **抓包通知**：开关打开时通知里就是完整 `deviceId` + `Authorization`。
- **Loon 数据持久化**：`脚本` → `数据持久化` → `读取指定数据` → key `ninebot_accounts`。
- **脚本日志**：Loon 日志里也会打印完整 JSON。

存储格式：

```json
{"accounts":[{"deviceId":"...","authorization":"Bearer ...","name":"账号1","updatedAt":1731300000000}]}
```

> 插件详情页只显示 REQUEST + CRON 两条脚本是正常的（Loon 不展示 generic 手动脚本）。

### 5. 签到通知示例

```
九号出行签到 (1/1)
✅ 账号1 · 今日签到完成
  连续签到 7 天
  今日获得 N币 +10
  今日数值字段: todayPoints=5
  N币余额: nCoinBalance=128
  🎁 盲盒 2/2 个: 3天盲盒 · N币 +10、经验值 +5
```

- **点击通知会复制全部原始响应 JSON**（status / blind-box / 签到奖励）。
- `N币余额` 由脚本自动扫描 `status` 响应里的数值字段识别；若显示「未识别」，把点通知复制到的原始数据发出来，即可精确适配字段名。
- 默认每天 **08:30** 执行；Token 失效时通知会提示，重做第 3 步即可。

## 接口清单

| 接口 | 方法 | 说明 |
|---|---|---|
| `/portal/api/user-sign/v2/status?t=<ts>` | GET | 签到状态、连续天数、N币相关字段 |
| `/portal/api/user-sign/v2/sign` | POST | body `{"deviceId":"..."}`，`code=540004` 视为已签到 |
| `/portal/api/user-sign/v2/blind-box/list?t=<ts>` | GET | `data.notOpenedBoxes[]`：`rewardStatus=1` 且 `blindBoxIds` 非空即可开 |
| `/portal/api/user-sign/v2/blind-box/receive` | POST | body `{"rewardId":"..."}`，`data.rewardType=2` 即 N币 |

所有请求头需带 `Authorization`、`device_id`、`Origin: https://h5-bj.ninebot.com` 等；漏掉 `device_id` 会导致奖励返回 0。

## 免责声明

本项目仅供学习研究，请勿用于商业用途。使用产生的一切后果由使用者自行承担。Token 等个人信息请勿提交到公开仓库。
