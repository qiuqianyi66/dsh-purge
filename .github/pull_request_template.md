## 提交前检查

- [ ] 本地 `npm test` 全绿（`node --test`，无失败用例）。
- [ ] 入口文件通过 `node --check`：`lib/index.js`、`lib/core.js`、`lib/reapply.js`。
- [ ] 未提交 `node_modules/`、`*.tgz`、`*.log`、`*.asar`、`*.bak`、本地草稿或个人路径。
- [ ] 改动不触及红线：私网门禁、补丁幂等/还原链、更新通道、LICENSE/NOTICE 署名。

## 说明

- 关联的 Issue 写清编号（`#123`）。
- 破坏性改动或新配置项，在描述里写明影响范围与回滚方式。
- 截图/日志请脱敏，不要贴 Cookie、令牌或他人对话。
