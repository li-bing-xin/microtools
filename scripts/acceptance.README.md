# acceptance.sh — 工厂验收套件（验证器）

- v1 由 Mika 于 2026-10-19 创建并冻结；**factory-lead 及一切 agent 不得修改本目录下验收文件**（契约 v3）。
- 修改流程：在项目 issue 提修改建议 → 成员或 Mika 批准 → 由 Mika/成员提交。
- 用法：`./scripts/acceptance.sh --app apps/<site> --base-url https://<preview-url> [--page /p]... [--exported-file exported.jpg]`
- 每个里程碑交付必须在项目 issue 粘贴本脚本的完整原始输出。
- v2 待加：零上传抓包断言、Playwright 交互 smoke。
