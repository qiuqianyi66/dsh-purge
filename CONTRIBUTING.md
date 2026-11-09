# 贡献指南

感谢愿意参与 dsh-purge。本仓库是原始 dsh-purge（作者 YuJunZhiXue）的衍生作品，由 qiuqianyi66 维护，基于 Apache-2.0 发布。

## 环境要求

- Node.js >= 18（开发实测内置运行时 Node 24）。
- 无需安装第三方运行时依赖；`@deepseek-ai/cordis` 为 peerDependency，由宿主提供。

## 本地开发

```bash
# 跑全量单元测试
npm test

# 语法检查入口
node --check lib/index.js
node --check lib/core.js
node --check lib/reapply.js
```

## 改动原则

- **小步改动**：一次 PR 只解决一个问题，不顺手重构无关代码。
- **承重墙默认不动**：补丁命中与幂等、私网/回环门禁、更新通道、备份还原链、LICENSE/NOTICE 署名。确需改动时在 PR 描述里说明理由与验证证据。
- **测试要有牙齿**：修 bug 先加一条能复现失败的用例；修复后通过，回退修复应失败。
- **证据可核验**：报告"测过了"要附上用例数、失败数与退出码，不靠主观判断。

## 边界红线

- 仅允许本机回环与 RFC1918 私网靶场使用；禁止公网攻击、外挂制作与任何形式倒卖。
- 保留 Apache-2.0 与 LICENSE/NOTICE 中的原始版权声明，禁止改许可证或重授权。
- 二开与再分发必须署名来源仓库 `qiuqianyi66/dsh-purge`，并保留版权声明。

## 提交与发布

- 提交信息用英文或中文简述动机；关联 Issue 写编号。
- 版本号、兼容矩阵与 `package.json` 的 `dshTarget` 保持一致。
- 发布由 `.github/workflows/release.yml` 按 tag 自动归档；不要手动上传打包产物覆盖 Release。
