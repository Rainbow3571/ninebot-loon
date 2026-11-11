# 九号出行 Loon 签到插件

基于 [waistu/Ninebot](https://github.com/waistu/Ninebot) 项目的接口实现，适配 Loon 插件格式。

## 文件结构

```
ninebot-loon/
├── ninebot.plugin          # Loon 插件配置文件
└── Scripts/
    ├── ninebot.token.js    # 抓包脚本: 自动提取 Authorization + device_id
    ├── ninebot.checkin.js  # 签到脚本: 每日定时签到 + 通知
    └── ninebot.view.js     # 手动脚本: 查看已保存的 Token
```

## 使用步骤

### 1. 安装插件

1. 在 Loon 中: `配置` → `插件` → 右上角 `+` → `从URL安装`，粘贴（jsDelivr CDN，国内可直连，自动取最新版）:

   ```
   https://cdn.jsdelivr.net/gh/Rainbow3571/ninebot-loon@9220d3f4db267be1b630e04ac29119e0c0950c7e/ninebot.plugin
   ```

   > 此链接绑定到已验证的具体提交，稳定可用。若想始终自动获取最新版本，把 `@9220d3f...` 换成 `@latest` 即可（jsDelivr 缓存刷新可能有数小时延迟）。

### 2. 信任 CA 证书（抓包必需）

1. Loon → `配置` → `通用` → `MITM` → 生成 CA 证书。
2. iOS 系统设置安装描述文件并信任；再在 `关于本机` → `证书信任设置` 中开启完全信任。
3. Loon → `配置` → `插件` → 选中本插件 → 确认 `MITM Overridden Hostname` 包含 `cn-cbu-gateway.ninebot.com`。

### 3. 抓取 Token

1. 开启 Loon 的 MITM（打开开关）。
2. 打开九号 APP → 进入「签到」页面。
3. 弹出通知「✅ 已保存」，即表示 Token 抓取成功。多账号可依次登录其他账号重复操作。

### 4. 查看已抓取的内容

两种任选：

- **一键查看（推荐）**：Loon → `脚本` → `手动脚本 / generic` → 点「九号Token查看」，会推送通知列出全部账号的 `deviceId` 和完整 `Authorization`；**点通知可复制完整 JSON**。
- **Loon 自带**：Loon → `脚本` → `数据持久化` → `读取指定数据` → 输入 key `ninebot_accounts` → 复制全部内容。

存储内容格式（key: `ninebot_accounts`）：

```json
{"accounts":[{"deviceId":"...","authorization":"Bearer ...","name":"账号1","updatedAt":1731300000000}]}
```

### 5. 签到

- 插件默认每天 **08:30** 自动签到，可在 Loon 插件详情中修改 cron 时间。
- 签到结果通过系统通知推送（含连续签到天数、今日能量值）。
- 如通知提示 Token 失效，重新执行第 3 步即可。

> 插件更新后，请在 Loon 插件页面刷新/重新安装插件，新脚本才会生效。

## 抓包/接口原理

- 签到: `POST https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign`，body `{"deviceId": "..."}`，请求头携带 `Authorization: Bearer ...` 与 `device_id`。
- 状态: `GET https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status`
- `code === 0` 为成功；`data.currentSignStatus === 1` 表示今日已签。

## 免责声明

本项目仅供学习研究，请勿用于商业用途。使用产生的一切后果由使用者自行承担。Token 等个人信息请勿提交到公开仓库。
