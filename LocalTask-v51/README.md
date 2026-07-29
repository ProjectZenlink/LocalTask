# LocalTask v1 — managed 模式(模块 2:freelancer 侧)

AM 驱动的任务分派平台。freelancer 侧移动优先(底部 tab),admin 侧桌面优先。

## 快速开始
1. 数据库:先在 Supabase SQL Editor 跑最新的 `localtask_v1_rebuild.sql`(全量重置)。
2. 环境变量:复制 `.env.example` 为 `.env`,填入 Supabase URL 和 anon key。
3. `npm install && npm run dev`

## 页面结构
- `/offers` `/tasks` `/tasks/:id` `/earnings` `/me` — freelancer 四个主 tab + 任务详情(mobile-first)
- `/signup` `/login` `/build-profile` `/onboarding/kyc` — 注册与入驻
- `/admin` — KYC 审核队列 + 用户管理(桌面优先;任务侧管理在模块 3)

## freelancer 端只通过三个安全入口写库
- `rpc respond_to_offer(p_offer_id, p_accept)` — 接受/拒绝 offer
- `rpc confirm_receipt(p_task_id)` — 确认到账、关单
- `insert task_submissions(...)` — 提交交付物(版本号由触发器自动处理)
其余仅能 update 自己的 profiles 行(钱包/联系方式/open_to_work)。

## 存储路径约定
- KYC:`kyc-documents/{uid}/...`
- 任务说明附件:`task-attachments/briefs/{task_id}/...`(admin 上传,模块 3)
- 交付物:`task-attachments/submissions/{task_id}/{uid}/...`
