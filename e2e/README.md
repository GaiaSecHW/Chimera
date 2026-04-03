# PVC E2E Tests

## Setup
1. Copy `.env.e2e.example` to `.env.e2e`.
2. Fill `E2E_PASSWORD` (and optional overrides).
3. Install browsers once:
   ```bash
   npx playwright install chromium
   ```

## Run
```bash
npm run e2e
```

## Cases
- `pvc.blank.spec.ts`: 空白PVC创建 + 详情页基础管理
- `pvc.archive.spec.ts`: 压缩包上传 + 异步解压任务 + 目录结构校验
- `pvc.detail.spec.ts`: 详情页重命名/移动/下载/预览/删除
- `pvc.error.spec.ts`: 非法路径、删除根目录、重名冲突等异常路径
