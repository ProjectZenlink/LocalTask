-- ================================================================
-- LocalTask v1（managed 模式重构）— Supabase 全量重建脚本
-- 模块 1 / 3：数据库 schema + 触发器 + RLS + 存储策略
--
-- 用法：整个文件复制进 SQL Editor，一次 Run。
-- ⚠️ 警告：本脚本会清空所有业务表、所有测试账号（auth.users）
--          和两个存储桶里的全部文件。仅在「数据可全清」前提下使用（已确认）。
-- 可重复执行：重跑 = 再次全量重置。
-- （已合并 m7 AM 工作台 与 m8 员工通道/三圈复核/AM 权限。）
-- 运行中若出现「[跳过] Supabase 禁止 SQL 直删存储对象」的提示属正常，不影响结果。
--
-- 跑完后的三步：
--   1) ⚠️ 先在网站上退出登录（清库后浏览器里的旧登录态已失效但不会自动消失，
--      带着旧会话去操作会报外键错误；退出登录或用无痕窗口即可）
--   2) 前端重新注册第一个账号（你自己的）
--   3) 回 SQL Editor 跑：select public.promote_to_admin('你的邮箱');
-- ================================================================

-- ----------------------------------------------------------------
-- 0. 全量清理（旧表、旧策略、旧函数、旧类型、测试数据、存储文件）
-- ----------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;

-- 清掉 storage.objects 上的全部旧策略（本项目里都是我们建的）
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 清空两个桶里的文件记录。
-- 注意：新版 Supabase 用 storage.protect_delete() 禁止 SQL 直删 storage 表
-- （报 42501，只许走 Storage API）。这里做成「尽力而为」：删不掉就跳过——
-- 旧测试文件只是无害孤儿，不影响任何功能；想彻底清可去
-- Dashboard → Storage 手动清空两个桶（纯可选）。
do $$
begin
  delete from storage.objects where bucket_id in ('kyc-documents', 'task-attachments');
  raise notice '[OK] 旧存储文件记录已清空';
exception when others then
  raise notice '[跳过] Supabase 禁止 SQL 直删存储对象 — 旧测试文件成为无害孤儿，可在 Dashboard → Storage 手动清空（可选）。原始报错: %', sqlerrm;
end $$;

-- 旧视图
drop view if exists public.public_profiles;
drop view if exists public.freelancer_pool;

-- 旧表（含本脚本自建表，保证可重跑）
-- [m42 修补] 重跑缺陷:m19 之后新增的表此前不在清理清单,重跑会残留旧结构
drop table if exists public.crm_notes cascade;
drop table if exists public.quick_replies cascade;
drop table if exists public.leads cascade;
drop table if exists public.message_translations cascade;
drop table if exists public.message_reads cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.message_violations cascade;
drop table if exists public.banned_words cascade;
drop table if exists public.payout_requests cascade;
drop table if exists public.todos cascade;
drop table if exists public.am_transfers cascade;
drop table if exists public.profile_change_requests cascade;
drop table if exists public.bonus_grants cascade;
drop table if exists public.checkins cascade;
drop table if exists public.custom_rate_items cascade;
drop table if exists public.payout_methods cascade;
drop table if exists public.blocked_email_domains cascade;

drop table if exists public.payments cascade;
drop table if exists public.disputes cascade;
drop table if exists public.ratings cascade;
drop table if exists public.submissions cascade;
drop table if exists public.task_submissions cascade;
drop table if exists public.applications cascade;
drop table if exists public.task_offers cascade;
drop table if exists public.task_items cascade;
drop table if exists public.tasks cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.am_notes cascade;
drop table if exists public.account_records cascade;
drop table if exists public.am_wallet_ledger cascade;
drop table if exists public.platform_acceptances cascade;
drop table if exists public.commission_rates cascade;
drop table if exists public.freelancer_companies cascade;
drop table if exists public.strikes cascade;
drop table if exists public.account_managers cascade;
drop table if exists public.clients cascade;
drop table if exists public.wallet_addresses cascade;
drop table if exists public.blacklist cascade;
drop table if exists public.kyc_ssn cascade;
drop table if exists public.kyc_documents cascade;
drop table if exists public.kyc_submissions cascade;
drop table if exists public.profiles cascade;

-- 旧函数（列出已知名 + 本脚本函数名，保证可重跑）
drop function if exists public.is_admin() cascade;
drop function if exists public.is_active_verified() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.protect_profile() cascade;
drop function if exists public.protect_profiles() cascade;
drop function if exists public.kyc_submission_after_insert() cascade;
drop function if exists public.update_rating_agg() cascade;
drop function if exists public.rating_aggregate() cascade;
drop function if exists public.on_task_closed() cascade;
drop function if exists public.task_closed() cascade;
drop function if exists public.on_submission() cascade;
drop function if exists public.handle_submission() cascade;
drop function if exists public.ensure_single_item() cascade;
drop function if exists public.offer_before_insert() cascade;
drop function if exists public.offer_after_insert() cascade;
drop function if exists public.offer_before_update() cascade;
drop function if exists public.offer_after_update() cascade;
drop function if exists public.submission_before_insert() cascade;
drop function if exists public.submission_after_insert() cascade;
drop function if exists public.submission_before_update() cascade;
drop function if exists public.submission_after_update() cascade;
drop function if exists public.respond_to_offer(uuid, boolean) cascade;
drop function if exists public.confirm_receipt(uuid) cascade;
drop function if exists public.expire_stale_offers() cascade;
drop function if exists public.promote_to_admin(text) cascade;

-- 兜底清理：public 里任何残余函数一律删除（v0 时代的 accept_task /
-- bump_completed / review_kyc / set_user_kyc / set_user_banned 等孤儿都在此清掉；
-- 跳过扩展自带函数。本脚本随后会重建全部所需函数。）
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    raise notice '[清理] 删除遗留函数: %', f.sig;
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

-- 旧类型
drop type if exists public.kyc_kind cascade;      -- [m42 修补] 重跑缺陷:m19 新增枚举漏在清理清单
drop type if exists public.bonus_state cascade;   -- [m42 修补] 同上
drop type if exists public.item_status cascade;
drop type if exists public.application_status cascade;
drop type if exists public.pack_type cascade;
drop type if exists public.payment_verification cascade;
drop type if exists public.dispute_status cascade;
drop type if exists public.dispute_resolution cascade;
drop type if exists public.escrow_status cascade;
drop type if exists public.task_status cascade;
drop type if exists public.offer_status cascade;
drop type if exists public.submission_status cascade;
drop type if exists public.platform_type cascade;
drop type if exists public.chain_network cascade;
drop type if exists public.token_symbol cascade;
drop type if exists public.kyc_status cascade;
drop type if exists public.kyc_doc_type cascade;
drop type if exists public.user_role cascade;

-- 清空测试账号（identities / sessions 级联删除）
delete from auth.users;

-- ----------------------------------------------------------------
-- 1. 枚举类型
-- ----------------------------------------------------------------

create type public.user_role  as enum ('user', 'am', 'admin', 'pending', 'lead');  -- m42:lead=访客线索(主脚本直建;迁移路径由 m42 alter 补入)
create type public.kyc_status as enum ('none', 'pending', 'verified', 'rejected');
create type public.kyc_doc_type as enum ('id_front', 'id_back', 'address_proof', 'selfie_handheld');
create type public.kyc_kind    as enum ('base', 'enhanced');            -- m19
create type public.bonus_state as enum ('locked', 'requested', 'paid'); -- m19

-- 支付组合（已锁定）：USDT·TRC20 / USDC·Ethereum / ETH·Ethereum → 不再有 base
create type public.chain_network as enum ('tron', 'ethereum');
create type public.token_symbol  as enum ('USDT', 'USDC', 'ETH');

-- 任务状态机（已锁定）：
-- unassigned → offered → in_progress → under_review → pending_payment → completed
-- 分支：cancelled；返修 = under_review 退回 in_progress（由 submission 审核驱动）
create type public.task_status as enum
  ('unassigned', 'offered', 'in_progress', 'under_review', 'pending_payment', 'completed', 'cancelled');

create type public.offer_status as enum ('pending', 'accepted', 'declined', 'expired', 'withdrawn');
create type public.submission_status as enum ('submitted', 'returned', 'approved');

-- ----------------------------------------------------------------
-- 2. 表
-- ----------------------------------------------------------------

-- 2.1 profiles：freelancer / admin（客户不是用户，见 clients 表）
create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  role                     public.user_role not null default 'user',
  display_name             text,
  full_name                text,
  date_of_birth            date,
  address                  text,
  city                     text,
  state                    text,
  address_zip              text,
  contact_whatsapp         text,                    -- AM ↔ freelancer 沟通渠道
  contact_telegram         text,
  contact_x                text,                    -- X (Twitter) 用户名
  phone_hash               text,                    -- 预留：短信 OTP（deferred）
  phone_verified           boolean not null default false,
  kyc_status               public.kyc_status not null default 'none',
  id_doc_hash              text,                    -- 拉黑去重用
  identity_composite_hash  text,
  open_to_work             boolean not null default false,  -- KYC 通过后才能开启（触发器强制）
  signup_bonus_usd         numeric not null default 2.99,   -- 注册奖励(Enhanced KYC 后可提现,m18)
  work_email               text,                            -- AM 代管工作邮箱(m18)
  email                    text,                            -- 注册邮箱(m22,触发器写入)
  work_email_password      text,
  enhanced_kyc_status      public.kyc_status not null default 'none',   -- m19 Enhanced KYC
  signup_bonus_state       public.bonus_state not null default 'locked',-- m19 奖励提现闸门
  bonus_tx_ref             text,                                        -- m19 打款凭证
  bonus_paid_at            timestamptz,
  payout_network           public.chain_network,    -- v1：每人一条链 + 一个地址
  payout_token             public.token_symbol,
  payout_address           text,
  payout_method            text not null default 'crypto',  -- 收款方式:crypto | paypal
  payout_paypal_email      text,
  is_suspended             boolean not null default false,  -- 可靠性暂停（AM 手动，可恢复）
  suspended_reason         text,
  is_banned                boolean not null default false,  -- 永久拉黑（仅欺诈）
  is_rejected              boolean not null default false,  -- 人才库驳回（AM 审核不通过；admin 可恢复）
  rejected_reason          text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint payout_method_check check (payout_method in ('crypto', 'paypal')),
  constraint paypal_email_check
    check (payout_paypal_email is null or payout_paypal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint payout_combo_check check (
    (payout_network is null and payout_token is null and payout_address is null)
    or (payout_network = 'tron'     and payout_token = 'USDT'
        and payout_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
    or (payout_network = 'ethereum' and payout_token in ('USDC', 'ETH')
        and payout_address ~ '^0x[0-9a-fA-F]{40}$')
  )
);

-- 2.2 KYC（沿用原设计；kyc_ssn 的 upsert 策略修复也一并保留）
create table public.kyc_submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           public.kyc_status not null default 'pending',
  kind             public.kyc_kind not null default 'base',   -- m19:base=注册三件套,enhanced=完整SSN+手持照
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create table public.kyc_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid references public.kyc_submissions(id) on delete cascade,
  doc_type      public.kyc_doc_type not null,
  storage_path  text not null,               -- kyc-documents/{uid}/...
  created_at    timestamptz not null default now()
);

create table public.kyc_ssn (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  ssn_full   text,                           -- 仅 admin 可读（RLS）
  ssn_last4  text,
  created_at timestamptz not null default now()
);

-- 2.3 blacklist：freelancer 欺诈永久拉黑（身份哈希防重注册）
create table public.blacklist (
  id                       uuid primary key default gen_random_uuid(),
  banned_user_id           uuid references public.profiles(id) on delete set null,
  reason                   text,
  id_doc_hash              text,
  identity_composite_hash  text,
  phone_hash               text,
  ssn_last4                text,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now()
);

-- 2.4 account_managers：账户经理（AM）。客户在站外（WhatsApp）由 AM 自己维护，
--     站内只登记 AM 本人；任务挂在 AM 名下；freelancer 可见 AM 的联系方式
--     （方便找到给自己派单的人）。
create table public.account_managers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  whatsapp   text,
  telegram   text,
  x          text,                                 -- X (Twitter) 用户名
  is_active  boolean not null default true,   -- 停用后不再出现在建任务下拉里
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.5 tasks：任务主表（付款字段直接放任务上，v1 不再有独立 payments 表）
create table public.tasks (
  id                      uuid primary key default gen_random_uuid(),
  am_id                   uuid references public.account_managers(id),  -- 负责本任务的 AM
  created_by              uuid references public.profiles(id) on delete set null,
  title                   text not null,
  description             text,                                  -- 可含链接；二维码等图片放附件
  attachment_paths        text[] not null default '{}',          -- briefs/{task_id}/...
  tags                    text[] not null default '{}',           -- AM 自由标签（如 Paypal），搜索/归类用
  acceptance_criteria     text not null,                         -- 验收标准（强制，裁决依据）
  amount                  numeric not null check (amount > 0),   -- 语义 = 美元（LT 账本 1 LT = $1）
  commission_override     numeric check (commission_override >= 0),  -- 单笔提成覆盖（admin 专属，触发器保护；空 = 按费率表）
  payout_network          public.chain_network,                  -- 接受时快照 freelancer 的链
  payout_token            public.token_symbol,                   -- 接受时快照 freelancer 的币
  payout_address          text,                                  -- 接受时快照 freelancer 的地址
  payout_method           text,                                  -- 接受时快照:crypto | paypal
  payout_paypal_email     text,
  status                  public.task_status not null default 'unassigned',
  deadline                timestamptz,
  assigned_freelancer     uuid references public.profiles(id) on delete set null,
  assigned_at             timestamptz,
  tx_hash                 text,                                  -- 客户提供，只存不验（显示为区块浏览器链接）
  paid_at                 timestamptz,
  paid_marked_by          uuid references public.profiles(id) on delete set null,
  payment_note            text,
  freelancer_confirmed_at timestamptz,                           -- freelancer 确认到账、无异议
  cancelled_reason        text,
  payout_requested_at     timestamptz,                            -- m21:freelancer 在钱包申请提现的时间
  share_token             uuid not null default gen_random_uuid(),  -- 客户只读分享链接
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint task_payout_combo_check check (
    (payout_network is null and payout_token is null)
    or (payout_network = 'tron'     and payout_token = 'USDT')
    or (payout_network = 'ethereum' and payout_token in ('USDC', 'ETH'))
  )
);

create index idx_tasks_status     on public.tasks (status);
create index idx_tasks_freelancer on public.tasks (assigned_freelancer);
create index idx_tasks_am         on public.tasks (am_id);
create index idx_tasks_tags       on public.tasks using gin (tags);
create unique index idx_tasks_share_token on public.tasks (share_token);

-- 2.6 task_offers：AM 发 offer → freelancer 一键接受/拒绝
create table public.task_offers (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  status        public.offer_status not null default 'pending',
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '48 hours'),  -- 过期窗口默认 48h
  responded_at  timestamptz
);

-- 同一任务同时只允许一个待响应 offer
create unique index one_pending_offer_per_task
  on public.task_offers (task_id) where (status = 'pending');
create index idx_offers_freelancer on public.task_offers (freelancer_id, status);

-- 2.7 task_submissions：交付物（带版本，支持多轮返修）
create table public.task_submissions (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  freelancer_id    uuid not null references public.profiles(id) on delete cascade,
  version          integer not null,
  content          text,                              -- 文字说明 / 链接
  attachment_paths text[] not null default '{}',      -- submissions/{task_id}/{uid}/...
  account_login    text,                              -- m20:本单开出的账号(freelancer 交付时必填)
  account_password text,                              -- m20:账号密码(审核可见;公开验收链接不返回)
  status           public.submission_status not null default 'submitted',
  review_note      text,                              -- 审核意见 / 返修说明
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (task_id, version)
);

create index idx_submissions_task on public.task_submissions (task_id);


-- 2.10 freelancer_companies：freelancer 与客户合开的公司资料（仅 admin 可见）
--      文件存 kyc-documents 桶 companies/{company_id}/... 路径（admin 上传）
create table public.freelancer_companies (
  id            uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  company_name  text not null,
  ein           text,
  state         text,
  notes         text,
  doc_paths     text[] not null default '{}',
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_fl_companies on public.freelancer_companies (freelancer_id);

-- ----------------------------------------------------------------
-- 3. 基础函数
-- ----------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 新用户注册 → 自动建 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'user';
  v_code text;
begin
  if new.email is not null and not public.email_domain_allowed(new.email::text) then
    raise exception 'Disposable email domains are not allowed. Please sign up with a real inbox.';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'staff_code', '') <> '' then
    select value into v_code from public.app_settings where key = 'staff_invite_code';
    if v_code is not null and new.raw_user_meta_data ->> 'staff_code' = v_code then
      v_role := 'pending';
    end if;
  end if;
  insert into public.profiles (id, display_name, role, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', v_role, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_am_touch       before update on public.account_managers
  for each row execute function public.touch_updated_at();
create trigger trg_flco_touch     before update on public.freelancer_companies
  for each row execute function public.touch_updated_at();
create trigger trg_tasks_touch    before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------
-- 4. profiles 保护触发器
--    历史教训：auth.uid() 在 SQL Editor 里为 null，必须放行 null-uid 上下文
-- ----------------------------------------------------------------

create or replace function public.protect_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- SQL Editor / 服务端上下文 / admin：放行
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- 钱包提现 RPC 内部上下文(m31/m40):打包/驳回/打款由 RPC 统一校验,触发器放行
  if coalesce(current_setting('app.wallet_rpc', true), '') = '1' then
    return new;
  end if;

  -- AM 审核 KYC：仅改 kyc_status（连带 updated_at）时放行，不限归属（m16）
  if public.is_am() and old.role = 'user'
     and (to_jsonb(new) - 'kyc_status' - 'enhanced_kyc_status' - 'updated_at')
         is not distinct from (to_jsonb(old) - 'kyc_status' - 'enhanced_kyc_status' - 'updated_at')
  then
    return new;
  end if;

  -- AM 对 freelancer（名下的，或池子里无归属的）：
  -- 只允许 ①认领（managed_by 从空 → 自己）②改暂停/驳回字段
  if public.is_am() and old.role = 'user'
     and (old.managed_by = public.current_am_id() or old.managed_by is null) then
    if new.managed_by is distinct from old.managed_by
       and not (old.managed_by is null and new.managed_by = public.current_am_id())
    then
      raise exception 'AMs may only claim unowned freelancers.';
    end if;
    if (to_jsonb(new) - 'is_suspended' - 'suspended_reason' - 'is_rejected' - 'rejected_reason' - 'managed_by' - 'work_email' - 'work_email_password' - 'signup_bonus_state' - 'bonus_tx_ref' - 'bonus_paid_at' - 'updated_at' - 'full_name' - 'display_name' - 'address' - 'city' - 'state' - 'address_zip')
       is distinct from
       (to_jsonb(old) - 'is_suspended' - 'suspended_reason' - 'is_rejected' - 'rejected_reason' - 'managed_by' - 'work_email' - 'work_email_password' - 'signup_bonus_state' - 'bonus_tx_ref' - 'bonus_paid_at' - 'updated_at' - 'full_name' - 'display_name' - 'address' - 'city' - 'state' - 'address_zip')
    then
      raise exception 'AMs may only change suspension/rejection/profile fields.';
    end if;
    return new;
  end if;

  -- 以下是 freelancer 本人自改的限制（错误信息用英文，freelancer 端是英文界面）

  -- 法定名/地址:建档首次填写(旧值为空)放行;之后只能走「申请修改-审批」(m25)
  if (old.full_name is not null and new.full_name is distinct from old.full_name)
     or (old.full_name is not null and new.display_name is distinct from old.display_name)
     or (old.address is not null and new.address is distinct from old.address)
     or (old.city is not null and new.city is distinct from old.city)
     or (old.state is not null and new.state is distinct from old.state)
     or (old.address_zip is not null and new.address_zip is distinct from old.address_zip)
  then
    raise exception 'Legal name and address changes must go through review. Please submit a change request.';
  end if;

  if new.kyc_status is distinct from old.kyc_status then
    if not (old.kyc_status in ('none', 'rejected') and new.kyc_status = 'pending') then
      raise exception 'You cannot change protected profile fields.';
    end if;
  end if;

  if new.enhanced_kyc_status is distinct from old.enhanced_kyc_status then
    if not (old.enhanced_kyc_status in ('none', 'rejected') and new.enhanced_kyc_status = 'pending') then
      raise exception 'You cannot change protected profile fields.';
    end if;
  end if;

  -- 注册奖励:本人只能在 Enhanced KYC 通过后,把 locked 改成 requested(申请提现)
  if new.signup_bonus_state is distinct from old.signup_bonus_state then
    if not (old.signup_bonus_state = 'locked'
            and new.signup_bonus_state = 'requested'
            and old.enhanced_kyc_status = 'verified') then
      raise exception 'Signup bonus can only be requested after Enhanced KYC is verified.';
    end if;
  end if;

  if new.role            is distinct from old.role
     or new.is_banned    is distinct from old.is_banned
     or new.is_suspended is distinct from old.is_suspended
     or new.suspended_reason is distinct from old.suspended_reason
     or new.is_rejected      is distinct from old.is_rejected
     or new.rejected_reason  is distinct from old.rejected_reason
     or new.phone_verified   is distinct from old.phone_verified
     or new.id_doc_hash      is distinct from old.id_doc_hash
     or new.identity_composite_hash is distinct from old.identity_composite_hash
     or new.work_email          is distinct from old.work_email
     or new.work_email_password is distinct from old.work_email_password
     or new.bonus_tx_ref        is distinct from old.bonus_tx_ref
     or new.bonus_paid_at       is distinct from old.bonus_paid_at
  then
    raise exception 'You cannot change protected profile fields.';
  end if;

  if new.open_to_work and old.kyc_status <> 'verified' then
    raise exception 'KYC verification is required before you can open to work.';
  end if;

  if (new.payout_method, new.payout_network, new.payout_token, new.payout_address, new.payout_paypal_email)
     is distinct from (old.payout_method, old.payout_network, old.payout_token, old.payout_address, old.payout_paypal_email)
     and exists (
       select 1 from public.tasks t
       where t.assigned_freelancer = new.id
         and t.status in ('in_progress', 'under_review', 'pending_payment')
     )
  then
    raise exception 'You cannot change your payout method while a task is active.';
  end if;

  return new;
end $$;

create trigger trg_protect_profiles before update on public.profiles
  for each row execute function public.protect_profiles();

-- 提交 KYC 单 → 自动把 profile 置为 pending（新前端无需再手动 update kyc_status；
-- 老前端那步冗余 update 变成 pending→pending，无副作用地通过）
create or replace function public.kyc_submission_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set kyc_status = 'pending'
  where id = new.user_id and kyc_status in ('none', 'rejected');
  return new;
end $$;

create trigger trg_kyc_submission_after_insert after insert on public.kyc_submissions
  for each row execute function public.kyc_submission_after_insert();

-- 4.5 任务提成字段保护：commission_override 仅 admin 可设/改
create or replace function public.protect_task_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.commission_override is not null then
      raise exception '提成覆盖只能由管理员设置。';
    end if;
  elsif new.commission_override is distinct from old.commission_override then
    raise exception '提成覆盖只能由管理员设置。';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_task_commission on public.tasks;
create trigger trg_protect_task_commission before insert or update on public.tasks
  for each row execute function public.protect_task_commission();

-- 4.6 防呆：禁止绕过 auth 直接删 profiles 行（正确入口见报错提示）
create or replace function public.protect_profile_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from auth.users u where u.id = old.id) then
    raise exception '请不要直接删除 profiles 行。正确做法：Supabase → Authentication → Users 里删除该用户，或在 SQL Editor 执行 select public.admin_delete_user(''对方邮箱'');（登录账号与全部关联会一并妥善处理）';
  end if;
  return old;
end $$;

drop trigger if exists trg_protect_profile_delete on public.profiles;
create trigger trg_protect_profile_delete before delete on public.profiles
  for each row execute function public.protect_profile_delete();

-- ----------------------------------------------------------------
-- 5. offer 生命周期触发器
-- ----------------------------------------------------------------

-- 发 offer 前的业务校验（无论谁发都校验，保证数据完整性）
create or replace function public.offer_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks%rowtype;
  v_fl   public.profiles%rowtype;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then
    raise exception 'Task not found.';
  end if;
  if v_task.status <> 'unassigned' then
    raise exception 'Task is not open for offers (current status: %).', v_task.status;
  end if;

  select * into v_fl from public.profiles where id = new.freelancer_id;
  if not found or v_fl.role <> 'user' then
    raise exception 'Freelancer not found.';
  end if;
  if v_fl.kyc_status <> 'verified' then
    raise exception 'Freelancer has not passed KYC.';
  end if;
  if v_fl.is_banned or v_fl.is_suspended then
    raise exception 'Freelancer is banned or suspended.';
  end if;
  if v_fl.is_rejected then
    raise exception 'Freelancer was rejected from the pool.';
  end if;
  if v_fl.managed_by is null then
    raise exception 'Freelancer has no account manager yet — claim or assign one first.';
  end if;

  new.status := 'pending';
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;

create trigger trg_offer_before_insert before insert on public.task_offers
  for each row execute function public.offer_before_insert();

-- 发出 offer → 任务进入 offered
create or replace function public.offer_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set status = 'offered'
  where id = new.task_id and status = 'unassigned';
  return new;
end $$;

create trigger trg_offer_after_insert after insert on public.task_offers
  for each row execute function public.offer_after_insert();

-- 终态保护 + 自动记录响应时间
create or replace function public.offer_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'Offer is already finalized (%).', old.status;
  end if;
  if old.status = 'pending' and new.status <> 'pending' and new.responded_at is null then
    new.responded_at := now();
  end if;
  return new;
end $$;

create trigger trg_offer_before_update before update on public.task_offers
  for each row execute function public.offer_before_update();

-- 状态落定后的任务联动：
--   accepted → 任务 in_progress + 指派 + 钱包快照
--   declined / expired / withdrawn → 任务退回 unassigned（拒单不罚，已锁定）
create or replace function public.offer_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fl   public.profiles%rowtype;
  v_task public.tasks%rowtype;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select * into v_task from public.tasks where id = new.task_id for update;
    if not found or v_task.status <> 'offered' then
      raise exception 'Task is no longer available.';
    end if;

    select * into v_fl from public.profiles where id = new.freelancer_id;
    if v_fl.is_banned or v_fl.is_suspended or v_fl.kyc_status <> 'verified' then
      raise exception 'Freelancer is no longer eligible to accept this offer.';
    end if;
    if coalesce(v_fl.payout_method, 'crypto') = 'paypal' then
      if v_fl.payout_paypal_email is null then
        raise exception 'Set your PayPal email before accepting tasks.';
      end if;
    elsif v_fl.payout_address is null then
      raise exception 'Set your payout wallet before accepting tasks.';
    end if;

    update public.tasks set
      status              = 'in_progress',
      assigned_freelancer = new.freelancer_id,
      assigned_at         = now(),
      payout_method       = coalesce(v_fl.payout_method, 'crypto'),  -- 快照整套收款方式：
      payout_network      = v_fl.payout_network,   -- 之后 TA 改收款方式不影响本任务
      payout_token        = v_fl.payout_token,
      payout_address      = v_fl.payout_address,
      payout_paypal_email = v_fl.payout_paypal_email
    where id = new.task_id;

  elsif old.status = 'pending' and new.status in ('declined', 'expired', 'withdrawn') then
    update public.tasks set status = 'unassigned'
    where id = new.task_id and status = 'offered';
  end if;

  return new;
end $$;

create trigger trg_offer_after_update after update on public.task_offers
  for each row execute function public.offer_after_update();

-- ----------------------------------------------------------------
-- 6. submission 生命周期触发器
-- ----------------------------------------------------------------

-- 提交校验 + 自动版本号
create or replace function public.submission_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status public.task_status;
begin
  select status into v_status from public.tasks
  where id = new.task_id and assigned_freelancer = new.freelancer_id;
  if not found then
    raise exception 'Task is not assigned to you.';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Task is not in progress (current status: %).', v_status;
  end if;

  new.version := (
    select coalesce(max(version), 0) + 1
    from public.task_submissions where task_id = new.task_id
  );
  new.status := 'submitted';
  return new;
end $$;

create trigger trg_submission_before_insert before insert on public.task_submissions
  for each row execute function public.submission_before_insert();

-- 提交后任务进入待审核
create or replace function public.submission_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set status = 'under_review'
  where id = new.task_id and status = 'in_progress';
  return new;
end $$;

create trigger trg_submission_after_insert after insert on public.task_submissions
  for each row execute function public.submission_after_insert();

-- 终审保护 + 自动记录审核人/时间
create or replace function public.submission_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'submitted' and new.status is distinct from old.status then
    raise exception 'Submission is already reviewed (%).', old.status;
  end if;
  if old.status = 'submitted' and new.status in ('approved', 'returned') then
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end $$;

create trigger trg_submission_before_update before update on public.task_submissions
  for each row execute function public.submission_before_update();

-- 审核结果驱动任务状态：approved → pending_payment；returned → in_progress（返修）
create or replace function public.submission_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'submitted' and new.status = 'approved' then
    update public.tasks set status = 'pending_payment'
    where id = new.task_id and status = 'under_review';
  elsif old.status = 'submitted' and new.status = 'returned' then
    update public.tasks set status = 'in_progress'
    where id = new.task_id and status = 'under_review';
  end if;
  return new;
end $$;

create trigger trg_submission_after_update after update on public.task_submissions
  for each row execute function public.submission_after_update();

-- ----------------------------------------------------------------
-- 7. freelancer 端 RPC（安全入口，前端只调这三个做变更）
-- ----------------------------------------------------------------


-- 确认到账、无异议 → 任务完成（关单）
create or replace function public.confirm_receipt(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.tasks%rowtype;
begin
  select * into v from public.tasks
  where id = p_task_id and assigned_freelancer = auth.uid()
  for update;

  if not found then
    raise exception 'Task not found.';
  end if;
  if v.status <> 'pending_payment' or v.paid_at is null then
    raise exception 'Task is not awaiting your payment confirmation.';
  end if;

  update public.tasks
  set freelancer_confirmed_at = now(), status = 'completed'
  where id = p_task_id;
end $$;

-- 惰性过期：admin 后台加载时调用一次即可（无 cron 也能正确过期）
create or replace function public.expire_stale_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update public.task_offers
  set status = 'expired'
  where status = 'pending' and expires_at < now();
  get diagnostics n = row_count;   -- AFTER 触发器会把对应任务退回 unassigned
  return n;
end $$;

-- 提升管理员：仅 SQL Editor（null uid）或已有 admin 可调
create or replace function public.promote_to_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an existing admin (or the SQL editor) can promote admins.';
  end if;
  update public.profiles p set role = 'admin'
  from auth.users u
  where u.id = p.id and lower(u.email) = lower(p_email);
  if not found then
    raise exception 'No user found with email %.', p_email;
  end if;
end $$;

-- 客户分享页：凭 share_token 匿名只读任务的文字信息（不含 freelancer 身份）；
-- 付款信息（方式/地址/哈希）仅在 待放款/已完成 状态下可见
create or replace function public.get_shared_task(p_token uuid)
returns table (
  title text, description text, acceptance_criteria text,
  amount numeric, status public.task_status, deadline timestamptz,
  payout_network public.chain_network, payout_token public.token_symbol,
  payout_address text, payout_method text, payout_paypal_email text,
  tx_hash text, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select t.title, t.description, t.acceptance_criteria,
         t.amount, t.status, t.deadline,
         case when t.status in ('pending_payment','completed') then t.payout_network end,
         case when t.status in ('pending_payment','completed') then t.payout_token end,
         case when t.status in ('pending_payment','completed') then t.payout_address end,
         case when t.status in ('pending_payment','completed') then t.payout_method end,
         case when t.status in ('pending_payment','completed') then t.payout_paypal_email end,
         case when t.status in ('pending_payment','completed') then t.tx_hash end,
         t.created_at
  from public.tasks t
  where t.share_token = p_token;
$$;

revoke all on function public.confirm_receipt(uuid)           from public, anon;
revoke all on function public.expire_stale_offers()           from public, anon;
revoke all on function public.promote_to_admin(text)          from public, anon;
grant execute on function public.confirm_receipt(uuid)           to authenticated;
grant execute on function public.expire_stale_offers()           to authenticated;
-- promote_to_admin 不授予任何 API 角色：只在 SQL Editor（postgres 角色）里调用。
revoke execute on function public.promote_to_admin(text) from authenticated;

-- ----------------------------------------------------------------
-- 8. RLS 策略（默认拒绝；freelancer 只能看到自己相关的东西）
-- ----------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.kyc_submissions  enable row level security;
alter table public.kyc_documents    enable row level security;
alter table public.kyc_ssn          enable row level security;
alter table public.blacklist        enable row level security;
alter table public.account_managers enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_offers      enable row level security;
alter table public.task_submissions enable row level security;
alter table public.freelancer_companies enable row level security;

-- profiles：本人 + admin（没有公开浏览，pool 走 admin 视图）
create policy p_profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy p_profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin());

-- KYC：沿用原策略（含 kyc_ssn 的 upsert 修复：本人可 update）
create policy p_kyc_sub_select on public.kyc_submissions for select
  using (user_id = auth.uid() or public.is_admin());
create policy p_kyc_sub_insert on public.kyc_submissions for insert
  with check (user_id = auth.uid());
create policy p_kyc_sub_update on public.kyc_submissions for update
  using (public.is_admin());

create policy p_kyc_doc_select on public.kyc_documents for select
  using (user_id = auth.uid() or public.is_admin());
create policy p_kyc_doc_insert on public.kyc_documents for insert
  with check (user_id = auth.uid());

create policy p_ssn_select on public.kyc_ssn for select
  using (user_id = auth.uid() or public.is_admin());
create policy p_ssn_insert on public.kyc_ssn for insert
  with check (user_id = auth.uid());
create policy p_ssn_update on public.kyc_ssn for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- blacklist：仅 admin（ratings/strikes 已于 m24 全站拆除）
-- account_managers：admin 全权；登录用户可读（freelancer 要能看到派单 AM 的联系方式）
create policy p_blacklist_admin on public.blacklist for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_am_admin on public.account_managers for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_am_select on public.account_managers for select
  using (auth.uid() is not null);

create policy p_flco_admin on public.freelancer_companies for all
  using (public.is_admin()) with check (public.is_admin());

-- tasks：freelancer 只能看到「指派给自己的」或「给自己发过 offer 的」；写全部走 admin / RPC
create policy p_tasks_select on public.tasks for select
  using (
    public.is_admin()
    or assigned_freelancer = auth.uid()
    or exists (
      select 1 from public.task_offers o
      where o.task_id = tasks.id and o.freelancer_id = auth.uid()
    )
  );
create policy p_tasks_insert on public.tasks for insert with check (public.is_admin());
create policy p_tasks_update on public.tasks for update using (public.is_admin());
create policy p_tasks_delete on public.tasks for delete using (public.is_admin());

-- task_offers：freelancer 看自己的；insert/update 仅 admin（freelancer 响应走 respond_to_offer）
create policy p_offers_select on public.task_offers for select
  using (freelancer_id = auth.uid() or public.is_admin());
create policy p_offers_insert on public.task_offers for insert with check (public.is_admin());
create policy p_offers_update on public.task_offers for update using (public.is_admin());
create policy p_offers_delete on public.task_offers for delete using (public.is_admin());

-- task_submissions：freelancer 提交自己的；审核（update）仅 admin
create policy p_subs_select on public.task_submissions for select
  using (freelancer_id = auth.uid() or public.is_admin());
create policy p_subs_insert on public.task_submissions for insert
  with check (freelancer_id = auth.uid() or public.is_admin());
create policy p_subs_update on public.task_submissions for update
  using (public.is_admin());

-- ----------------------------------------------------------------
-- 9. 存储桶 + 存储策略
--    路径约定（模块 2/3 前端按此实现）：
--      KYC 文件      : kyc-documents/{uid}/...
--      任务说明附件  : task-attachments/briefs/{task_id}/...        （admin 上传）
--      交付物附件    : task-attachments/submissions/{task_id}/{uid}/...（freelancer 上传）
-- ----------------------------------------------------------------

-- 两个桶在你的库里已存在；这里确保存在且为私有。
-- 若 Supabase 的存储保护拦截写入，跳过即可（桶已在、本就 private，无影响）。
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('kyc-documents', 'kyc-documents', false)
  on conflict (id) do update set public = false;

  insert into storage.buckets (id, name, public)
  values ('task-attachments', 'task-attachments', false)
  on conflict (id) do update set public = false;
exception when others then
  raise notice '[跳过] 桶写入被拦 — 两个桶已存在且为 private，无需处理。原始报错: %', sqlerrm;
end $$;

-- admin：两个桶全权限
create policy st_admin_all on storage.objects for all
  using (bucket_id in ('kyc-documents', 'task-attachments') and public.is_admin())
  with check (bucket_id in ('kyc-documents', 'task-attachments') and public.is_admin());

-- KYC：本人上传到自己目录、只读自己的
create policy st_kyc_insert on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy st_kyc_select on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 任务说明附件：被 offer / 被指派的 freelancer 可读
create policy st_briefs_select on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'briefs'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and (
          t.assigned_freelancer = auth.uid()
          or exists (
            select 1 from public.task_offers o
            where o.task_id = t.id and o.freelancer_id = auth.uid()
          )
        )
    )
  );

-- 交付物附件：被指派的 freelancer 上传到自己目录、只读自己的
create policy st_submission_insert on storage.objects for insert
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[3] = auth.uid()::text
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.assigned_freelancer = auth.uid()
    )
  );
create policy st_submission_select on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

-- ----------------------------------------------------------------
-- 10. admin 视图 freelancer_pool：因引用 12.2 的 managed_by 列，
--     实际创建移至 12.2 之后（见下）。
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------
-- 12. AM 工作台：账户经理的登录、名册、八项清单验收、提成钱包、
--     账号资料库（敏感）、备忘铃铛
-- ----------------------------------------------------------------

-- 12.1 平台类型（八项标准任务）与任务挂钩
create type public.platform_type as enum
  ('Paypal', 'Square', 'Wise', 'Airwallex', 'Ether.fi', 'Shopify', 'Etsy', 'Amazon', 'Other');

alter table public.tasks add column task_type public.platform_type;

-- 12.2 AM 登录绑定 与 freelancer 归属
alter table public.account_managers add column user_id uuid unique references public.profiles(id) on delete set null;
alter table public.profiles add column managed_by uuid references public.account_managers(id);
create index idx_profiles_managed_by on public.profiles (managed_by);

-- 12.2b 人才库视图（评分/strike/负载聚合 + 归属/驳回）
create view public.freelancer_pool
with (security_invoker = true) as
select
  p.id, p.display_name, p.full_name, p.kyc_status, p.open_to_work,
  p.is_suspended, p.is_banned,
  p.contact_whatsapp, p.contact_telegram, p.contact_x,
  p.payout_network, p.payout_token, p.payout_address,
  (select count(*) from public.tasks t
    where t.assigned_freelancer = p.id
      and t.status in ('in_progress', 'under_review', 'pending_payment')) as active_tasks,
  (select count(*) from public.tasks t
    where t.assigned_freelancer = p.id and t.status = 'completed')        as completed_tasks,
  p.created_at,
  p.managed_by,
  (p.kyc_status = 'rejected')                                             as is_rejected,
  p.payout_method,
  p.payout_paypal_email,
  p.email
from public.profiles p
where p.role = 'user';
grant select on public.freelancer_pool to authenticated;

-- 12.3 提成费率（admin 维护；记账时快照）
create table public.commission_rates (
  task_type  public.platform_type primary key,
  amount     numeric not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now()
);
insert into public.commission_rates (task_type)
select x from unnest(enum_range(null::public.platform_type)) x;

create trigger trg_rates_touch before update on public.commission_rates
  for each row execute function public.touch_updated_at();

-- 12.4 验收记录（绿灯；一人一平台一次）
create table public.platform_acceptances (
  id            uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  task_type     public.platform_type not null,
  task_id       uuid references public.tasks(id) on delete set null,
  am_id         uuid not null references public.account_managers(id),
  amount        numeric not null default 0,     -- 记账金额快照（覆盖优先，否则费率）
  status        text not null default 'approved'
                constraint acceptance_status_check
                check (status in ('pending_admin', 'approved', 'rejected', 'reopened')),  -- 四态:含跳审核
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  review_note   text,
  reopened_reason text,                              -- 跳审核:原因/操作者/时间
  reopened_by   uuid references public.profiles(id) on delete set null,
  reopened_at   timestamptz,
  accept_scope  text not null default 'platform',  -- 八项='platform'(一人一平台一次)；其他=任务id(一单一次)
  created_at    timestamptz not null default now()
);
-- 「一人一平台一次」不含已驳回：驳回后 AM 可重新验收
create unique index uq_acceptance_live
  on public.platform_acceptances (freelancer_id, task_type, accept_scope)
  where status <> 'rejected';

-- 12.5 AM 钱包流水（纯账本：余额 = commission 合计 − payout 合计）
create table public.am_wallet_ledger (
  id            uuid primary key default gen_random_uuid(),
  am_id         uuid not null references public.account_managers(id),
  kind          text not null check (kind in ('commission', 'payout')),
  amount        numeric not null check (amount >= 0),
  freelancer_id uuid references public.profiles(id) on delete set null,
  task_type     public.platform_type,
  acceptance_id uuid references public.platform_acceptances(id) on delete set null,
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_ledger_am on public.am_wallet_ledger (am_id);
create unique index uq_ledger_acceptance
  on public.am_wallet_ledger (acceptance_id) where acceptance_id is not null;  -- 一条验收最多一笔流水

-- 12.6 账号资料库（敏感：账号/密码/2FA/接码手机；仅 admin 与归属 AM 可见）
create table public.account_records (
  id               uuid primary key default gen_random_uuid(),
  freelancer_id    uuid not null references public.profiles(id) on delete cascade,
  task_type        public.platform_type not null,
  task_id          uuid references public.tasks(id) on delete set null,
  account_login    text,
  account_password text,
  twofa            text,
  phone_number     text,
  sms_link         text,
  phone_expires_on date,
  status           text not null default 'active'
                   constraint record_status_check
                   check (status in ('active', 'pending', 'review', 'closed')),  -- 正常/待审核/审核/关闭(m20)
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_records_freelancer on public.account_records (freelancer_id);
create index idx_records_expiry     on public.account_records (phone_expires_on);

create trigger trg_records_touch before update on public.account_records
  for each row execute function public.touch_updated_at();

-- 12.7 AM 备忘（铃铛）
create table public.am_notes (
  id         uuid primary key default gen_random_uuid(),
  am_id      uuid not null references public.account_managers(id) on delete cascade,
  content    text not null,
  remind_on  date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notes_am on public.am_notes (am_id);

-- 12.8 助手函数
create or replace function public.current_am_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from public.account_managers where user_id = auth.uid() $$;

create or replace function public.is_am()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.account_managers where user_id = auth.uid()) $$;

-- 12.9 RLS
alter table public.commission_rates     enable row level security;
alter table public.platform_acceptances enable row level security;
alter table public.am_wallet_ledger     enable row level security;
alter table public.account_records      enable row level security;
alter table public.am_notes             enable row level security;

create policy p_rates_read on public.commission_rates for select
  using (auth.uid() is not null);
create policy p_rates_admin on public.commission_rates for all
  using (public.is_admin()) with check (public.is_admin());

create policy p_pacc_admin on public.platform_acceptances for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_pacc_am on public.platform_acceptances for select
  using (am_id = public.current_am_id());

create policy p_led_admin on public.am_wallet_ledger for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_led_am on public.am_wallet_ledger for select
  using (am_id = public.current_am_id());

create policy p_rec_admin on public.account_records for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_rec_am on public.account_records for all
  using (exists (select 1 from public.profiles f
                 where f.id = freelancer_id and f.managed_by = public.current_am_id()))
  with check (exists (select 1 from public.profiles f
                      where f.id = freelancer_id and f.managed_by = public.current_am_id()));

create policy p_note_admin on public.am_notes for all
  using (public.is_admin()) with check (public.is_admin());
create policy p_note_am on public.am_notes for all
  using (am_id = public.current_am_id())
  with check (am_id = public.current_am_id());

-- AM 需要读 freelancer 档案与其任务（完成灯联动）
create policy p_profiles_am_read on public.profiles for select
  using (public.is_am() and role = 'user');
create policy p_tasks_am_read on public.tasks for select
  using (public.is_am() and (
    am_id = public.current_am_id()
    or exists (select 1 from public.profiles f
               where f.id = tasks.assigned_freelancer
                 and f.managed_by = public.current_am_id())
  ));

-- AM 可改自己的联系资料
create policy p_am_self_upd on public.account_managers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 12.10 RPC：绑定登录 / 认领 / 验收
create or replace function public.bind_am_login(p_am uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可绑定。';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(p_email);
  if v_uid is null then raise exception '找不到该邮箱的注册账号，请先让 TA 注册。'; end if;
  update public.account_managers set user_id = v_uid where id = p_am;
  if not found then raise exception 'AM 不存在。'; end if;
  update public.profiles set role = 'am' where id = v_uid;
end $$;

create or replace function public.unbind_am_login(p_am uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可解绑。';
  end if;
  select user_id into v_uid from public.account_managers where id = p_am;
  update public.account_managers set user_id = null where id = p_am;
  if v_uid is not null then
    update public.profiles set role = 'user' where id = v_uid and role = 'am';
  end if;
end $$;

create or replace function public.claim_freelancer(p_freelancer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_am uuid;
begin
  v_am := public.current_am_id();
  if v_am is null then raise exception '仅账户经理可认领。'; end if;
  update public.profiles set managed_by = v_am
  where id = p_freelancer and role = 'user' and managed_by is null
    and is_rejected = false and is_banned = false;
  if not found then raise exception '该 freelancer 不存在、已有归属或已被驳回。'; end if;
end $$;

create or replace function public.am_accept(p_freelancer uuid, p_type public.platform_type)
returns void language plpgsql security definer set search_path = public as $$
declare v_am uuid; v_task uuid; v_override numeric; v_rate numeric; v_acc uuid;
begin
  v_am := public.current_am_id();
  if v_am is null then raise exception '仅账户经理可验收。'; end if;
  if not exists (select 1 from public.profiles f
                 where f.id = p_freelancer and f.managed_by = v_am) then
    raise exception '该 freelancer 不在你的名下。';
  end if;
  select t.id, t.commission_override into v_task, v_override from public.tasks t
  where t.assigned_freelancer = p_freelancer
    and t.task_type = p_type and t.status = 'completed'
  order by t.freelancer_confirmed_at desc nulls last limit 1;
  if v_task is null then raise exception '该项还没有已完成的任务。'; end if;

  select amount into v_rate from public.commission_rates where task_type = p_type;

  begin
    insert into public.platform_acceptances
      (freelancer_id, task_type, task_id, am_id, amount, status)
    values (p_freelancer, p_type, v_task, v_am, coalesce(v_override, v_rate, 0), 'pending_admin')
    returning id into v_acc;
  exception when unique_violation then
    raise exception '这一项已经验收过了（或正在等平台复核）。';
  end;
end $$;

-- ----------------------------------------------------------------
-- 13. 员工注册通道（隐藏页 + 邀请码 + 待激活）、三圈提成复核、
--     AM 管教（暂停/驳回）与 AM 任务权限（RLS + 存储策略）
-- ----------------------------------------------------------------

-- 13.1 平台设置表（邀请码等；仅 admin 可读写，前端校验走 RPC）
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value)
values ('staff_invite_code', 'LTSTAFF-8QK4-2026')
on conflict (key) do nothing;

drop trigger if exists trg_settings_touch on public.app_settings;
create trigger trg_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

alter table public.app_settings enable row level security;
drop policy if exists p_settings_admin on public.app_settings;
create policy p_settings_admin on public.app_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- 13.2 admin 复核：通过 = 入 AM 钱包；驳回 = 记原因，AM 可重新验收
create or replace function public.review_acceptance(p_acceptance uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.platform_acceptances%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可复核提成。';
  end if;
  select * into v from public.platform_acceptances where id = p_acceptance for update;
  if not found then raise exception '记录不存在。'; end if;
  if v.status <> 'pending_admin' then raise exception '该笔已复核过（%）。', v.status; end if;

  if p_approve then
    update public.platform_acceptances
      set status = 'approved', decided_by = auth.uid(), decided_at = now(), review_note = v_note
      where id = p_acceptance;
    -- 每笔验收至多入账一次:跳审核复验通过时,若历史上已入过账则不再给钱（老板规则）
    if not exists (select 1 from public.am_wallet_ledger l
                   where l.acceptance_id = v.id and l.kind = 'commission') then
      insert into public.am_wallet_ledger
        (am_id, kind, amount, freelancer_id, task_type, acceptance_id, note, created_by)
      values (v.am_id, 'commission', v.amount, v.freelancer_id, v.task_type, v.id, v_note, auth.uid());
    end if;
  else
    if v_note is null then raise exception '驳回必须填写原因。'; end if;
    update public.platform_acceptances
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), review_note = v_note
      where id = p_acceptance;
  end if;
end $$;

-- 13.3 员工注册 RPC
-- 13.3.1 校验邀请码（注册页登录前调用，anon 可用；只回对/错，不回码）
create or replace function public.staff_code_ok(p_code text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.app_settings
                  where key = 'staff_invite_code' and value = btrim(coalesce(p_code, ''))) $$;

-- 13.3.2 待激活员工列表（含邮箱；仅 admin）
-- ⚠️ 必须用 plpgsql：SQL Editor 整个文件跑在一个事务里，language sql 的
--    函数体在创建时就会被解析校验，撞上「同事务内不能使用新枚举值 pending」
--    （55P04）。plpgsql 函数体到执行时才解析，避开这个限制。
create or replace function public.list_pending_staff()
returns table (id uuid, display_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可查看待激活员工。';
  end if;
  return query
  select p.id, p.display_name, u.email::text, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'pending'
  order by p.created_at desc;
end $$;

-- 13.3.3 激活：设为 AM（自动建档并绑定）或 Admin
create or replace function public.activate_staff(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.profiles%rowtype; v_email text; v_name text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可激活员工。';
  end if;
  if p_role not in ('am', 'admin') then
    raise exception '角色只能是 am 或 admin。';
  end if;
  select * into v from public.profiles where id = p_user for update;
  if not found or v.role <> 'pending' then
    raise exception '该账号不在待激活列表。';
  end if;

  if p_role = 'admin' then
    update public.profiles set role = 'admin' where id = p_user;
  else
    select u.email into v_email from auth.users u where u.id = p_user;
    v_name := coalesce(nullif(btrim(coalesce(v.display_name, '')), ''),
                       split_part(coalesce(v_email, 'AM'), '@', 1));
    begin
      insert into public.account_managers (name, user_id, created_by)
      values (v_name, p_user, auth.uid());
    exception when unique_violation then
      raise exception '该账号已绑定过 AM。';
    end;
    update public.profiles set role = 'am' where id = p_user;
  end if;
end $$;

-- 13.3.4 拒绝：删除该注册（连带 profile；只对 pending 生效）
create or replace function public.reject_staff(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可拒绝员工注册。';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'pending') then
    raise exception '该账号不在待激活列表。';
  end if;
  delete from auth.users where id = p_user;
end $$;

-- 13.4 AM 管教 RPC：暂停/恢复名下、人才库驳回；认领排除驳回/封禁
create or replace function public.am_set_suspended(p_freelancer uuid, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_am uuid;
begin
  v_am := public.current_am_id();
  if v_am is null then raise exception '仅账户经理可操作。'; end if;
  update public.profiles
    set is_suspended = p_suspend,
        suspended_reason = case when p_suspend then nullif(btrim(coalesce(p_reason, '')), '') else null end
  where id = p_freelancer and role = 'user' and managed_by = v_am and is_banned = false;
  if not found then raise exception '该 freelancer 不在你的名下（或已被封禁）。'; end if;
end $$;

create or replace function public.am_reject_freelancer(p_freelancer uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_am uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_am := public.current_am_id();
  if v_am is null then raise exception '仅账户经理可驳回。'; end if;
  if v_reason is null then raise exception '驳回必须填写原因。'; end if;
  update public.profiles
    set is_rejected = true, rejected_reason = v_reason
  where id = p_freelancer and role = 'user'
    and managed_by is null and is_banned = false and is_rejected = false;
  if not found then raise exception '只能驳回池子里无归属、未被驳回的 freelancer。'; end if;
end $$;

-- 13.5 RLS：AM 的任务/offer/交付/评分/strike 权限（全部限定在自己名下）
-- ⚠️ 关键：tasks 的旧策略引用 task_offers；若 offer/交付策略再直接
--    引用 tasks 会形成策略递归（infinite recursion）。所以这里的
--    「任务是否归我」判断走 security definer 辅助函数，绕过 RLS 断环。
create or replace function public.task_owned_by_am(p_task uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.tasks t
                  where t.id = p_task and t.am_id = public.current_am_id()) $$;

drop policy if exists p_tasks_am_insert on public.tasks;
create policy p_tasks_am_insert on public.tasks for insert
  with check (public.is_am() and am_id = public.current_am_id());
drop policy if exists p_tasks_am_update on public.tasks;
create policy p_tasks_am_update on public.tasks for update
  using (public.is_am() and am_id = public.current_am_id())
  with check (am_id = public.current_am_id());

drop policy if exists p_offers_am_select on public.task_offers;
create policy p_offers_am_select on public.task_offers for select
  using (public.is_am() and public.task_owned_by_am(task_id));
drop policy if exists p_offers_am_insert on public.task_offers;
create policy p_offers_am_insert on public.task_offers for insert
  with check (public.is_am()
    and public.task_owned_by_am(task_id)
    and exists (select 1 from public.profiles f
                where f.id = freelancer_id and f.managed_by = public.current_am_id()));
drop policy if exists p_offers_am_update on public.task_offers;
create policy p_offers_am_update on public.task_offers for update
  using (public.is_am() and public.task_owned_by_am(task_id));

drop policy if exists p_subs_am_select on public.task_submissions;
create policy p_subs_am_select on public.task_submissions for select
  using (public.is_am() and public.task_owned_by_am(task_id));
drop policy if exists p_subs_am_update on public.task_submissions;
create policy p_subs_am_update on public.task_submissions for update
  using (public.is_am() and public.task_owned_by_am(task_id));


-- 13.6 存储策略：AM 传/看自己任务的说明附件，看自己任务的交付附件
drop policy if exists st_am_briefs_insert on storage.objects;
create policy st_am_briefs_insert on storage.objects for insert
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'briefs'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.am_id = public.current_am_id()
    )
  );
drop policy if exists st_am_briefs_select on storage.objects;
create policy st_am_briefs_select on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'briefs'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.am_id = public.current_am_id()
    )
  );
drop policy if exists st_am_subs_select on storage.objects;
create policy st_am_subs_select on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'submissions'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.am_id = public.current_am_id()
    )
  );

-- 13.7 一键彻底删除用户：admin_delete_user('邮箱')
--   三道保险：仅 admin；不能删自己；不能删最后一个管理员。
create or replace function public.admin_delete_user(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_role public.user_role;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '仅管理员可删除用户。';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception '找不到邮箱为 % 的账号。', p_email;
  end if;
  if v_uid = auth.uid() then
    raise exception '不能删除自己当前登录的账号。';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception '这是唯一的管理员账号，不能删除。';
  end if;
  delete from auth.users where id = v_uid;   -- 级联删 profile；审计字段自动置空
end $$;

-- 13.8 「其他」任务逐单验收 + AM 全量档案读取（KYC/SSN/公司/存储）
create or replace function public.am_accept_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_am uuid; v_t public.tasks%rowtype; v_rate numeric; v_item numeric;
begin
  v_am := public.current_am_id();
  if v_am is null then raise exception '仅账户经理可验收。'; end if;

  select * into v_t from public.tasks where id = p_task;
  if not found then raise exception '任务不存在。'; end if;
  if v_t.task_type is null or v_t.task_type::text <> 'Other' then
    raise exception '这个入口只用于「其他」类型任务；八项平台请在清单上验收。';
  end if;
  if v_t.status <> 'completed' then raise exception '该任务还没有走完收款确认。'; end if;
  if v_t.assigned_freelancer is null then raise exception '该任务没有接单人。'; end if;
  if not exists (select 1 from public.profiles f
                 where f.id = v_t.assigned_freelancer and f.managed_by = v_am) then
    raise exception '接单人不在你的名下。';
  end if;

  if v_t.rate_item_id is not null then
    select amount into v_item from public.custom_rate_items where id = v_t.rate_item_id;
  end if;
  select amount into v_rate from public.commission_rates where task_type::text = 'Other';

  begin
    insert into public.platform_acceptances
      (freelancer_id, task_type, task_id, am_id, amount, status, accept_scope)
    values (v_t.assigned_freelancer, v_t.task_type, v_t.id, v_am,
            coalesce(v_t.commission_override, v_item, v_rate, 0), 'pending_admin', v_t.id::text);
  exception when unique_violation then
    raise exception '这个任务已经验收过了（或正在等平台复核）。';
  end;
end $$;

-- 13.8.1 AM 全量档案读取：KYC 单 / KYC 证件 / SSN / 公司资料（只读）
drop policy if exists p_kyc_sub_am_sel on public.kyc_submissions;
create policy p_kyc_sub_am_sel on public.kyc_submissions for select
  using (public.is_am() and exists (
    select 1 from public.profiles f where f.id = user_id and f.role = 'user'));

drop policy if exists p_kyc_doc_am_sel on public.kyc_documents;
create policy p_kyc_doc_am_sel on public.kyc_documents for select
  using (public.is_am() and exists (
    select 1 from public.profiles f where f.id = user_id and f.role = 'user'));

drop policy if exists p_ssn_am_sel on public.kyc_ssn;
create policy p_ssn_am_sel on public.kyc_ssn for select
  using (public.is_am() and exists (
    select 1 from public.profiles f where f.id = user_id and f.role = 'user'));

drop policy if exists p_flco_am_all on public.freelancer_companies;
create policy p_flco_am_all on public.freelancer_companies for all
  using (public.is_am() and exists (
    select 1 from public.profiles f where f.id = freelancer_id and f.role = 'user'))
  with check (public.is_am() and exists (
    select 1 from public.profiles f where f.id = freelancer_id and f.role = 'user'));

-- 13.8.2 存储：AM 可查看 KYC 文件与公司文件（只读；文本比较，不做 uuid 转换）
drop policy if exists st_am_kyc_select on storage.objects;
create policy st_am_kyc_select on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and public.is_am()
    and exists (
      select 1 from public.profiles f
      where f.id::text = (storage.foldername(name))[1] and f.role = 'user'
    )
  );

drop policy if exists st_am_codocs_select on storage.objects;
create policy st_am_codocs_select on storage.objects for select
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = 'companies'
    and public.is_am()
    and exists (
      select 1 from public.freelancer_companies c
      where c.id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists st_am_codocs_insert on storage.objects;
create policy st_am_codocs_insert on storage.objects for insert
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = 'companies'
    and public.is_am()
    and exists (
      select 1 from public.freelancer_companies c
      where c.id::text = (storage.foldername(name))[2]
    )
  );

-- 13.9 反欺诈 v1：身份指纹扫描 + 封禁入黑名单 + 一次性邮箱拦截
-- 1. 归一化与指纹辅助函数（纯函数,只给内部扫描用,不暴露给 API 角色）
create or replace function public.fp_norm_name(t text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.fp_norm_handle(t text)
returns text language sql immutable as $$
  select lower(ltrim(btrim(coalesce(t, '')), '@'))
$$;

create or replace function public.fp_norm_phone(t text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g')
$$;

create or replace function public.compute_identity_composite(p_name text, p_dob date, p_ssn4 text)
returns text language sql immutable as $$
  select case
    when p_name is null or btrim(p_name) = '' or p_dob is null
         or p_ssn4 is null or btrim(p_ssn4) = '' then null
    else encode(sha256(convert_to(
           public.fp_norm_name(p_name) || '|' || p_dob::text || '|' || btrim(p_ssn4),
           'UTF8')), 'hex')
  end
$$;

revoke all on function public.fp_norm_name(text)                          from public, anon, authenticated;
revoke all on function public.fp_norm_handle(text)                        from public, anon, authenticated;
revoke all on function public.fp_norm_phone(text)                         from public, anon, authenticated;
revoke all on function public.compute_identity_composite(text, date, text) from public, anon, authenticated;
grant execute on function public.fp_norm_name(text)                          to service_role;
grant execute on function public.fp_norm_handle(text)                        to service_role;
grant execute on function public.fp_norm_phone(text)                         to service_role;
grant execute on function public.compute_identity_composite(text, date, text) to service_role;

create table if not exists public.blocked_email_domains (
  domain     text primary key,
  created_at timestamptz not null default now()
);
alter table public.blocked_email_domains enable row level security;
drop policy if exists p_blocked_domains_admin on public.blocked_email_domains;
create policy p_blocked_domains_admin on public.blocked_email_domains for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.blocked_email_domains (domain) values
  ('mailinator.com'),('mailinator.net'),('mailinator.org'),('binkmail.com'),('bobmail.info'),
  ('guerrillamail.com'),('guerrillamail.net'),('guerrillamail.org'),('guerrillamail.biz'),
  ('guerrillamailblock.com'),('sharklasers.com'),('grr.la'),('spam4.me'),
  ('10minutemail.com'),('10minutemail.net'),('10mail.org'),('tempmailaddress.com'),
  ('temp-mail.org'),('temp-mail.io'),('tempmail.com'),('tempmail.net'),('tempmail.plus'),
  ('tempmailo.com'),('tempr.email'),('tempinbox.com'),('emltmp.com'),
  ('mail.tm'),('dropmail.me'),('1secmail.com'),('1secmail.org'),('1secmail.net'),
  ('yopmail.com'),('yopmail.fr'),('yopmail.net'),('cool.fr.nf'),('jetable.org'),
  ('trashmail.com'),('trashmail.de'),('trashmail.me'),('mytrashmail.com'),
  ('getnada.com'),('nada.email'),('dispostable.com'),('maildrop.cc'),('mailnesia.com'),
  ('mintemail.com'),('throwawaymail.com'),('fakeinbox.com'),('fakemailgenerator.com'),
  ('spamgourmet.com'),('mailcatch.com'),('moakt.com'),('moakt.cc'),('tmail.ws'),
  ('emailondeck.com'),('mohmal.com'),('anonbox.net'),('discard.email'),('discardmail.com'),
  ('spambog.com'),('spambog.de'),('mailsac.com'),('inboxkitten.com'),('harakirimail.com'),
  ('mailexpire.com'),('mail-temporaire.fr'),('luxusmail.org'),('disbox.net'),
  ('crazymailing.com'),('generator.email'),('mailpoof.com'),('burnermail.io'),
  ('mailhazard.com'),('zetmail.com'),('0-mail.com'),('33mail.com'),('mailtemp.net'),
  ('teleworm.us'),('armyspy.com'),('cuvox.de'),('dayrep.com'),('einrot.com'),
  ('fleckens.hu'),('gustr.com'),('jourrapide.com'),('rhyta.com'),('superrito.com'),
  ('wegwerfmail.de'),('wegwerfmail.net'),('wegwerfmail.org'),('wegwerfemail.de'),
  ('thisisnotmyrealemail.com'),('tradermail.info'),('veryrealemail.com'),('safetymail.info')
on conflict (domain) do nothing;

-- 13.9.1 域名预检 RPC（注册页先调它给友好报错;数据库触发器是最终兜底）
create or replace function public.email_domain_allowed(p_email text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_dom text;
begin
  v_dom := lower(split_part(coalesce(p_email, ''), '@', 2));
  if v_dom = '' then return false; end if;
  return not exists (
    select 1 from public.blocked_email_domains d
    where d.domain = v_dom or v_dom like '%.' || d.domain
  );
end $$;

-- 13.9.2 封禁自动入黑名单：is_banned 翻 true 的那一刻,把身份指纹快照进 blacklist
--    （之后删号也不丢;每人至多一条,重复封禁不重复入表）
create or replace function public.blacklist_on_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ssn4 text;
begin
  if new.role = 'user'
     and new.is_banned = true and old.is_banned = false
     and not exists (select 1 from public.blacklist b where b.banned_user_id = new.id) then
    select ssn_last4 into v_ssn4 from public.kyc_ssn where user_id = new.id;
    insert into public.blacklist
      (banned_user_id, reason, id_doc_hash, identity_composite_hash, ssn_last4, created_by)
    values
      (new.id, 'auto: banned in console', new.id_doc_hash,
       public.compute_identity_composite(new.full_name, new.date_of_birth, v_ssn4),
       v_ssn4, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_blacklist_on_ban on public.profiles;
create trigger trg_blacklist_on_ban
  after update on public.profiles
  for each row execute function public.blacklist_on_ban();

-- 13.9.3 KYC 风险扫描（admin / AM 可调;对全库现场计算比对）
create or replace function public.kyc_risk_scan(p_user uuid)
returns table (
  severity text, flag text, matched_user uuid,
  matched_name text, matched_banned boolean, detail text
) language plpgsql stable security definer set search_path = public as $$
declare
  s  public.profiles%rowtype;
  s_ssn4 text;
  s_comp text;
begin
  if not (auth.uid() is null or public.is_admin() or public.is_am()) then
    raise exception '仅管理员或账户经理可调用风险扫描。';
  end if;

  select * into s from public.profiles where id = p_user and role = 'user';
  if not found then raise exception 'Freelancer not found.'; end if;
  select k.ssn_last4 into s_ssn4 from public.kyc_ssn k where k.user_id = p_user;
  s_comp := public.compute_identity_composite(s.full_name, s.date_of_birth, s_ssn4);

  -- 红:姓名(归一化)+生日+SSN后四 完全一致 = 同一个人开多号
  return query
  select 'red'::text, 'identity_exact'::text, p.id, p.display_name, p.is_banned,
         'same name + DOB + SSN last-4'::text
  from public.profiles p
  join public.kyc_ssn k on k.user_id = p.id
  where p.id <> p_user and p.role = 'user'
    and s.full_name is not null and s.date_of_birth is not null and s_ssn4 is not null
    and public.fp_norm_name(p.full_name) = public.fp_norm_name(s.full_name)
    and p.date_of_birth = s.date_of_birth
    and k.ssn_last4 = s_ssn4;

  -- 红:生日+SSN后四一致但名字不同 = 改名换姓嫌疑
  return query
  select 'red'::text, 'dob_ssn4'::text, p.id, p.display_name, p.is_banned,
         'same DOB + SSN last-4, different name'::text
  from public.profiles p
  join public.kyc_ssn k on k.user_id = p.id
  where p.id <> p_user and p.role = 'user'
    and s.date_of_birth is not null and s_ssn4 is not null
    and p.date_of_birth = s.date_of_birth
    and k.ssn_last4 = s_ssn4
    and public.fp_norm_name(coalesce(p.full_name, '')) <> public.fp_norm_name(coalesce(s.full_name, ''));

  -- 红:证件文件哈希一致（预留:目前前端未写入,黑名单/未来接入后自动生效）
  return query
  select 'red'::text, 'id_doc'::text, p.id, p.display_name, p.is_banned,
         'same ID document hash'::text
  from public.profiles p
  where p.id <> p_user and p.role = 'user'
    and s.id_doc_hash is not null and p.id_doc_hash = s.id_doc_hash;

  -- 琥珀:联系方式撞车（归一化后比对;逐渠道报告）
  return query
  select 'amber'::text, 'contact'::text, p.id, p.display_name, p.is_banned,
         ('whatsapp: ' || p.contact_whatsapp)::text
  from public.profiles p
  where p.id <> p_user and p.role = 'user'
    and public.fp_norm_phone(s.contact_whatsapp) <> ''
    and public.fp_norm_phone(p.contact_whatsapp) = public.fp_norm_phone(s.contact_whatsapp);

  return query
  select 'amber'::text, 'contact'::text, p.id, p.display_name, p.is_banned,
         ('telegram: ' || p.contact_telegram)::text
  from public.profiles p
  where p.id <> p_user and p.role = 'user'
    and public.fp_norm_handle(s.contact_telegram) <> ''
    and public.fp_norm_handle(p.contact_telegram) = public.fp_norm_handle(s.contact_telegram);

  return query
  select 'amber'::text, 'contact'::text, p.id, p.display_name, p.is_banned,
         ('x: ' || p.contact_x)::text
  from public.profiles p
  where p.id <> p_user and p.role = 'user'
    and public.fp_norm_handle(s.contact_x) <> ''
    and public.fp_norm_handle(p.contact_x) = public.fp_norm_handle(s.contact_x);

  -- 琥珀:收款方式撞车（双侧都并集:多收款方式列表 ∪ 档案镜像列）
  return query
  select distinct 'amber'::text, 'payout'::text, p.id, p.display_name, p.is_banned,
         ('wallet: ' || w.addr)::text
  from (
    select m.user_id as uid, btrim(m.address) as addr
    from public.payout_methods m where m.address is not null
    union
    select pr.id, btrim(pr.payout_address)
    from public.profiles pr where pr.payout_address is not null
  ) w
  join public.profiles p on p.id = w.uid
  where p.id <> p_user and p.role = 'user'
    and w.addr in (
      select btrim(m2.address) from public.payout_methods m2
      where m2.user_id = p_user and m2.address is not null
      union
      select btrim(s.payout_address) where s.payout_address is not null
    );

  return query
  select distinct 'amber'::text, 'payout'::text, p.id, p.display_name, p.is_banned,
         ('paypal: ' || w.em)::text
  from (
    select m.user_id as uid, lower(m.paypal_email) as em
    from public.payout_methods m where m.paypal_email is not null
    union
    select pr.id, lower(pr.payout_paypal_email)
    from public.profiles pr where pr.payout_paypal_email is not null
  ) w
  join public.profiles p on p.id = w.uid
  where p.id <> p_user and p.role = 'user'
    and w.em in (
      select lower(m2.paypal_email) from public.payout_methods m2
      where m2.user_id = p_user and m2.paypal_email is not null
      union
      select lower(s.payout_paypal_email) where s.payout_paypal_email is not null
    );

  -- 黑名单:身份指纹命中(红) / 证件哈希命中(红) / 仅 SSN 后四命中(琥珀提示)
  return query
  select 'red'::text, 'blacklist'::text, b.banned_user_id, 'blacklist record'::text, true,
         'identity fingerprint matches a banned identity'::text
  from public.blacklist b
  where s_comp is not null and b.identity_composite_hash = s_comp
    and (b.banned_user_id is distinct from p_user);

  return query
  select 'red'::text, 'blacklist'::text, b.banned_user_id, 'blacklist record'::text, true,
         'ID document hash matches a banned identity'::text
  from public.blacklist b
  where s.id_doc_hash is not null and b.id_doc_hash = s.id_doc_hash
    and (b.banned_user_id is distinct from p_user);

  return query
  select 'amber'::text, 'blacklist'::text, b.banned_user_id, 'blacklist record'::text, true,
         'SSN last-4 matches a banned identity'::text
  from public.blacklist b
  where s_ssn4 is not null and b.ssn_last4 = s_ssn4
    and (b.banned_user_id is distinct from p_user)
    and (b.identity_composite_hash is null or s_comp is null or b.identity_composite_hash <> s_comp);
end $$;

-- 13.9.4 权限
revoke all on function public.email_domain_allowed(text) from public;
grant  execute on function public.email_domain_allowed(text) to anon, authenticated, service_role;
revoke all on function public.kyc_risk_scan(uuid) from public, anon;
grant  execute on function public.kyc_risk_scan(uuid) to authenticated, service_role;

-- 13.10 多收款方式 + 删除账户经理 + freelancer 自查账号资料
create table if not exists public.payout_methods (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  method       text not null check (method in ('crypto', 'paypal')),
  network      public.chain_network,
  token        public.token_symbol,
  address      text,
  paypal_email text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint pm_shape_check check (
    (method = 'crypto' and paypal_email is null and (
       (network = 'tron'     and token = 'USDT'
        and address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
    or (network = 'ethereum' and token in ('USDC', 'ETH')
        and address ~ '^0x[0-9a-fA-F]{40}$')))
    or
    (method = 'paypal' and network is null and token is null and address is null
     and paypal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  )
);
create index if not exists idx_pm_user on public.payout_methods (user_id);
create unique index if not exists uq_pm_default on public.payout_methods (user_id) where is_default;

alter table public.payout_methods enable row level security;
drop policy if exists p_pm_self on public.payout_methods;
create policy p_pm_self on public.payout_methods for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_pm_admin on public.payout_methods;
create policy p_pm_admin on public.payout_methods for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists p_pm_am_sel on public.payout_methods;
create policy p_pm_am_sel on public.payout_methods for select
  using (public.is_am() and exists (
    select 1 from public.profiles f where f.id = user_id and f.role = 'user'));

-- 13.10.1 设为默认 RPC：同步进档案镜像列（有进行中任务时会被档案保护触发器拦下 = 正确行为）
create or replace function public.set_default_payout(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.payout_methods%rowtype;
begin
  select * into v from public.payout_methods
  where id = p_id and (user_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Payout method not found.'; end if;

  update public.payout_methods set is_default = false
  where user_id = v.user_id and is_default and id <> p_id;
  update public.payout_methods set is_default = true where id = p_id;

  update public.profiles set
    payout_method       = v.method,
    payout_network      = v.network,
    payout_token        = v.token,
    payout_address      = v.address,
    payout_paypal_email = v.paypal_email
  where id = v.user_id;
end $$;

-- 13.10.2 删除账户经理 RPC（无账可删,有账只能停用）
create or replace function public.admin_delete_am(p_am uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception '仅管理员可删除账户经理。';
  end if;
  select user_id into v_uid from public.account_managers where id = p_am;
  if not found then raise exception '账户经理不存在。'; end if;
  if exists (select 1 from public.platform_acceptances where am_id = p_am)
     or exists (select 1 from public.am_wallet_ledger where am_id = p_am) then
    raise exception '该账户经理已有提成或钱包账目,不能删除;请改用「停用」保留账目。';
  end if;

  update public.profiles set managed_by = null where managed_by = p_am;
  update public.tasks set am_id = null where am_id = p_am;
  delete from public.account_managers where id = p_am;   -- am_notes 级联清理
  if v_uid is not null then
    update public.profiles set role = 'user' where id = v_uid and role = 'am';
  end if;
end $$;

-- 13.10.3 freelancer 查看自己的账号资料（集中账号模块）
drop policy if exists p_rec_user_sel on public.account_records;
create policy p_rec_user_sel on public.account_records for select
  using (freelancer_id = auth.uid());

-- 13.11 自定义费率细分（其他类任务的分档提成）
create table if not exists public.custom_rate_items (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  amount     numeric not null default 0 check (amount >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_rate_item_label
  on public.custom_rate_items (lower(label));

-- m20:Wise 双价固定条目(建任务自动带价;重跑不覆盖 AM 改价)
insert into public.custom_rate_items (label, amount)
  values ('Wise (pre-PayPal)', 5), ('Wise (with PayPal)', 10)
  on conflict (lower(label)) do nothing;

alter table public.custom_rate_items enable row level security;
drop policy if exists p_rate_items_admin on public.custom_rate_items;
create policy p_rate_items_admin on public.custom_rate_items for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists p_rate_items_staff on public.custom_rate_items;
create policy p_rate_items_staff on public.custom_rate_items for select
  using (public.is_am());

-- 2. 任务可挂细分（删细分不动任务,只脱钩）
alter table public.tasks add column if not exists rate_item_id uuid
  references public.custom_rate_items(id) on delete set null;

-- 13.12 跳审核处理闭环（四态状态机的三个入口）
-- 13.12.1 标记跳审核（admin 或归属 AM;从「已通过 / 待复核」打回）
create or replace function public.reopen_acceptance(p_acceptance uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.platform_acceptances%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception '标记跳审核必须填写原因。'; end if;
  select * into v from public.platform_acceptances where id = p_acceptance for update;
  if not found then raise exception '记录不存在。'; end if;
  if not (auth.uid() is null or public.is_admin() or v.am_id = public.current_am_id()) then
    raise exception '仅管理员或归属账户经理可标记跳审核。';
  end if;
  if v.status not in ('approved', 'pending_admin') then
    raise exception '当前状态（%）不能标记跳审核。', v.status;
  end if;

  update public.platform_acceptances
    set status = 'reopened', reopened_reason = v_reason,
        reopened_by = auth.uid(), reopened_at = now()
    where id = p_acceptance;

  -- 联动:该人该平台的「正常」账号记录切成「审核」
  update public.account_records
    set status = 'review'
    where freelancer_id = v.freelancer_id and task_type = v.task_type and status = 'active';
end $$;

-- 13.12.2 已解决,重新提交复核（归属 AM 或 admin;回到第二圈）
create or replace function public.resolve_reopened(p_acceptance uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.platform_acceptances%rowtype;
begin
  select * into v from public.platform_acceptances where id = p_acceptance for update;
  if not found then raise exception '记录不存在。'; end if;
  if not (auth.uid() is null or public.is_admin() or v.am_id = public.current_am_id()) then
    raise exception '仅管理员或归属账户经理可操作。';
  end if;
  if v.status <> 'reopened' then raise exception '该笔不在跳审核处理中（%）。', v.status; end if;

  update public.platform_acceptances
    set status = 'pending_admin',
        review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), review_note)
    where id = p_acceptance;
end $$;

-- 13.12.3 从账号记录标记跳审核（admin 账号页入口;自动找到对应验收一起打回）
create or replace function public.flag_account_review(p_record uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.account_records%rowtype; v_acc uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception '标记跳审核必须填写原因。'; end if;
  select * into r from public.account_records where id = p_record for update;
  if not found then raise exception '账号记录不存在。'; end if;
  if not (auth.uid() is null or public.is_admin()) then
    if not (public.is_am() and exists (
      select 1 from public.profiles f
      where f.id = r.freelancer_id and f.managed_by = public.current_am_id())) then
      raise exception '仅管理员或该 freelancer 的归属账户经理可操作。';
    end if;
  end if;

  update public.account_records set status = 'review' where id = p_record;

  select id into v_acc from public.platform_acceptances
    where freelancer_id = r.freelancer_id and task_type = r.task_type
      and status in ('approved', 'pending_admin')
      and (r.task_id is null or task_id is null or task_id = r.task_id)
    order by created_at desc limit 1;

  if v_acc is not null then
    update public.platform_acceptances
      set status = 'reopened', reopened_reason = v_reason,
          reopened_by = auth.uid(), reopened_at = now()
      where id = v_acc;
  end if;
end $$;

-- ----------------------------------------------------------------
-- 10.5 权限加固（让 Bolt/Supabase Security Audit 归零）
--   · 所有函数固定 search_path（防搜索路径劫持）
--   · 收回 PUBLIC / anon 的函数执行权（Postgres 默认全开，必须收）
--   · service_role 放行；authenticated 只授 4 个必要入口
-- ----------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;
grant  execute on function public.is_admin()                      to authenticated;
grant  execute on function public.confirm_receipt(uuid)           to authenticated;
grant  execute on function public.expire_stale_offers()           to authenticated;
grant  execute on function public.get_shared_task(uuid)           to anon, authenticated;
grant  execute on function public.current_am_id()                 to authenticated;
grant  execute on function public.is_am()                         to authenticated;
grant  execute on function public.claim_freelancer(uuid)          to authenticated;
grant  execute on function public.am_accept(uuid, public.platform_type) to authenticated;
grant  execute on function public.bind_am_login(uuid, text)       to authenticated;
grant  execute on function public.unbind_am_login(uuid)           to authenticated;
grant  execute on function public.task_owned_by_am(uuid)          to anon, authenticated;
grant  execute on function public.staff_code_ok(text)             to anon, authenticated;
grant  execute on function public.review_acceptance(uuid, boolean, text) to authenticated;
grant  execute on function public.list_pending_staff()            to authenticated;
grant  execute on function public.activate_staff(uuid, text)      to authenticated;
grant  execute on function public.reject_staff(uuid)              to authenticated;
grant  execute on function public.am_set_suspended(uuid, boolean, text)  to authenticated;
grant  execute on function public.am_reject_freelancer(uuid, text)       to authenticated;
grant  execute on function public.admin_delete_user(text)         to authenticated;
grant  execute on function public.am_accept_task(uuid)            to authenticated;
grant  execute on function public.kyc_risk_scan(uuid)              to authenticated;
grant  execute on function public.email_domain_allowed(text)       to anon, authenticated;
grant  execute on function public.set_default_payout(uuid)         to authenticated;
grant  execute on function public.admin_delete_am(uuid)            to authenticated;
grant  execute on function public.reopen_acceptance(uuid, text)    to authenticated;
grant  execute on function public.resolve_reopened(uuid, text)     to authenticated;
grant  execute on function public.flag_account_review(uuid, text)  to authenticated;

-- ----------------------------------------------------------------
-- ================================================================
-- m16 合并块：AM 获得与 admin 相同的 KYC 审核权限
--（策略需在 is_am() 定义之后重建，故置于此；触发器放行已在上方
--  protect_profiles 函数体内，总策略数不变）
-- ================================================================
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin()
         or (public.is_am() and role = 'user'));

drop policy if exists p_kyc_sub_update on public.kyc_submissions;
create policy p_kyc_sub_update on public.kyc_submissions for update
  using (public.is_admin() or public.is_am());

-- ================================================================
-- m18 合并块:直派 RPC(需在 is_admin/is_am 之后)
-- ================================================================
-- 3. 直派 RPC:发单校验 + 接受快照,一步到位
create or replace function public.assign_task_direct(p_task uuid, p_freelancer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks%rowtype;
  v_fl   public.profiles%rowtype;
begin
  if not (auth.uid() is null or public.is_admin() or public.is_am()) then
    raise exception '仅管理员或账户经理可以派任务。';
  end if;

  select * into v_task from public.tasks where id = p_task for update;
  if not found then
    raise exception 'Task not found.';
  end if;
  if v_task.status <> 'unassigned' then
    raise exception 'Task is not open for assignment (current status: %).', v_task.status;
  end if;

  select * into v_fl from public.profiles where id = p_freelancer;
  if not found or v_fl.role <> 'user' then
    raise exception 'Freelancer not found.';
  end if;
  if v_fl.kyc_status <> 'verified' then
    raise exception 'Freelancer has not passed KYC.';
  end if;
  if v_fl.is_banned or v_fl.is_suspended then
    raise exception 'Freelancer is banned or suspended.';
  end if;
  if v_fl.is_rejected then
    raise exception 'Freelancer was rejected from the pool.';
  end if;
  if v_fl.managed_by is null then
    raise exception 'Freelancer has no account manager yet — claim or assign one first.';
  end if;
  if coalesce(v_fl.payout_method, 'crypto') = 'paypal' then
    if v_fl.payout_paypal_email is null then
      raise exception 'Freelancer has not set a PayPal email yet.';
    end if;
  elsif v_fl.payout_address is null then
    raise exception 'Freelancer has not set a payout wallet yet.';
  end if;

  update public.tasks set
    status              = 'in_progress',
    assigned_freelancer = p_freelancer,
    assigned_at         = now(),
    payout_method       = coalesce(v_fl.payout_method, 'crypto'),  -- 快照整套收款方式:
    payout_network      = v_fl.payout_network,   -- 之后 TA 改收款方式不影响本任务
    payout_token        = v_fl.payout_token,
    payout_address      = v_fl.payout_address,
    payout_paypal_email = v_fl.payout_paypal_email
  where id = p_task;
end $$;

grant execute on function public.assign_task_direct(uuid, uuid) to authenticated;

-- ================================================================
-- m19 合并块:Enhanced KYC(SSN 读权 + 提交 RPC;需在 is_am 之后)
-- ================================================================
-- 5. AM 可读完整 SSN(审核 Enhanced 工单需与证件照比对)
drop policy if exists p_ssn_select on public.kyc_ssn;
create policy p_ssn_select on public.kyc_ssn for select
  using (user_id = auth.uid() or public.is_admin() or public.is_am());

-- 6. RPC:Enhanced KYC 提交(校验 + 写 SSN + 建工单,原子)
create or replace function public.submit_enhanced_kyc(p_ssn_full text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  public.profiles%rowtype;
  v_last4 text;
  v_sub   uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.role <> 'user' then
    raise exception 'Only freelancers can submit Enhanced KYC.';
  end if;
  if v_prof.kyc_status <> 'verified' then
    raise exception 'Complete basic verification first.';
  end if;
  if v_prof.enhanced_kyc_status not in ('none', 'rejected') then
    raise exception 'Enhanced KYC is already % — no new submission needed.', v_prof.enhanced_kyc_status;
  end if;
  if p_ssn_full !~ '^\d{9}$' then
    raise exception 'SSN must be exactly 9 digits.';
  end if;

  select ssn_last4 into v_last4 from public.kyc_ssn where user_id = v_uid;
  if v_last4 is null then
    raise exception 'No SSN on file from registration — contact support.';
  end if;
  if right(p_ssn_full, 4) <> v_last4 then
    raise exception 'SSN does not match the last 4 digits you provided at registration.';
  end if;

  update public.kyc_ssn set ssn_full = p_ssn_full where user_id = v_uid;

  insert into public.kyc_submissions (user_id, status, kind)
    values (v_uid, 'pending', 'enhanced')
    returning id into v_sub;

  update public.profiles set enhanced_kyc_status = 'pending' where id = v_uid;

  return v_sub;
end $$;

grant execute on function public.submit_enhanced_kyc(text) to authenticated;

-- ================================================================
-- m21 合并块:签到奖励 + 任务提现申请(需在 is_admin/is_am 之后)
-- ================================================================
-- 2. 签到表(RPC 专写,防客户端补签)
create table if not exists public.checkins (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  confirmed_at timestamptz,                                  -- m23:AM 复核时间(未复核不计连续)
  confirmed_by uuid references public.profiles(id),          -- m23:复核人
  primary key (user_id, day)
);
alter table public.checkins enable row level security;
drop policy if exists p_checkins_select on public.checkins;
create policy p_checkins_select on public.checkins for select
  using (user_id = auth.uid() or public.is_admin() or public.is_am());

-- 3. 签到奖励表(发放走 RPC;freelancer 申请走 RPC;AM/admin 可标记打款)
create table if not exists public.bonus_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null constraint grant_kind_check
             check (kind in ('streak_7', 'streak_15', 'streak_30')),
  amount     numeric not null check (amount >= 0),
  state      text not null default 'locked' constraint grant_state_check
             check (state in ('locked', 'requested', 'paid')),
  tx_ref     text,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.bonus_grants enable row level security;
drop policy if exists p_grants_select on public.bonus_grants;
create policy p_grants_select on public.bonus_grants for select
  using (user_id = auth.uid() or public.is_admin() or public.is_am());
drop policy if exists p_grants_staff_update on public.bonus_grants;
create policy p_grants_staff_update on public.bonus_grants for update
  using (public.is_admin() or public.is_am())
  with check (public.is_admin() or public.is_am());

-- 4. RPC:按任务申请提现
create or replace function public.request_task_payout(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  select * into v_task from public.tasks where id = p_task for update;
  if not found or v_task.assigned_freelancer is distinct from auth.uid() then
    raise exception 'Task not found.';
  end if;
  if v_task.status <> 'pending_payment' then
    raise exception 'Payout can be requested only after the task passes review.';
  end if;
  if v_task.payout_requested_at is not null then
    raise exception 'Payout already requested.';
  end if;
  update public.tasks set payout_requested_at = now() where id = p_task;
end $$;
grant execute on function public.request_task_payout(uuid) to authenticated;

-- 5. RPC:签到(北京时间日界线;连续 7/15/30 自动发放,各一次)
create or replace function public.do_checkin()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_today   date := (now() at time zone 'Asia/Shanghai')::date;
  v_new     integer;
  v_anchor  date;
  v_streak  integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'user' then
    raise exception 'Only freelancers can check in.';
  end if;

  insert into public.checkins (user_id, day) values (v_uid, v_today)
    on conflict do nothing;
  get diagnostics v_new = row_count;

  -- 连续已复核天数:锚在"今天或昨天中最近的已复核日"
  select max(day) into v_anchor from public.checkins
   where user_id = v_uid and confirmed_at is not null
     and day in (v_today, v_today - 1);
  if v_anchor is not null then
    select count(*) into v_streak from (
      select day, row_number() over (order by day desc) - 1 as rn
      from public.checkins
      where user_id = v_uid and confirmed_at is not null and day <= v_anchor
    ) x where (v_anchor - day) = rn;
  end if;

  return json_build_object('already', v_new = 0, 'streak', v_streak);
end $$;
grant execute on function public.do_checkin() to authenticated;

-- 6. RPC:申请提现签到奖励(Enhanced KYC 闸门)
create or replace function public.request_bonus_grant(p_grant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_g public.bonus_grants%rowtype;
  v_enh public.kyc_status;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  select * into v_g from public.bonus_grants where id = p_grant for update;
  if not found or v_g.user_id <> auth.uid() then
    raise exception 'Reward not found.';
  end if;
  if v_g.state <> 'locked' then
    raise exception 'Reward is already %.', v_g.state;
  end if;
  select enhanced_kyc_status into v_enh from public.profiles where id = auth.uid();
  if v_enh is distinct from 'verified' then
    raise exception 'Complete Enhanced KYC before requesting rewards.';
  end if;
  update public.bonus_grants set state = 'requested' where id = p_grant;
end $$;
grant execute on function public.request_bonus_grant(uuid) to authenticated;

-- ================================================================
-- m23 合并块:签到复核 RPC(需在 is_am/current_am_id 之后)
-- ================================================================
-- 3. 复核 RPC:名下 AM / admin;补核历史天可把断链接上;跨档即发奖
create or replace function public.confirm_checkin(p_user uuid, p_day date)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_row     public.checkins%rowtype;
  v_managed uuid;
  v_len     integer;
  v_granted text[] := '{}';
  v_k       text;
begin
  if not (auth.uid() is null or public.is_admin() or public.is_am()) then
    raise exception 'Only staff can confirm check-ins.';
  end if;

  select * into v_row from public.checkins
   where user_id = p_user and day = p_day for update;
  if not found then
    raise exception 'No check-in on % to confirm.', p_day;
  end if;

  if public.is_am() and not public.is_admin() then
    select managed_by into v_managed from public.profiles where id = p_user;
    if v_managed is distinct from public.current_am_id() then
      raise exception 'You can only confirm check-ins of your own freelancers.';
    end if;
  end if;

  if v_row.confirmed_at is null then
    update public.checkins
       set confirmed_at = now(), confirmed_by = auth.uid()
     where user_id = p_user and day = p_day;
  end if;

  -- 含 p_day 的已复核连续段(孤岛)长度:补核中间某天会把前后接成一段
  with c as (
    select day, day - (row_number() over (order by day))::int as g
    from public.checkins where user_id = p_user and confirmed_at is not null
  )
  select count(*) into v_len from c
   where g = (select g from c where day = p_day);

  if v_len >= 7 then
    insert into public.bonus_grants (user_id, kind, amount)
      values (p_user, 'streak_7', 4.99)
      on conflict do nothing returning kind into v_k;
    if v_k is not null then v_granted := v_granted || v_k; v_k := null; end if;
  end if;
  if v_len >= 15 then
    insert into public.bonus_grants (user_id, kind, amount)
      values (p_user, 'streak_15', 7.99)
      on conflict do nothing returning kind into v_k;
    if v_k is not null then v_granted := v_granted || v_k; v_k := null; end if;
  end if;
  if v_len >= 30 then
    insert into public.bonus_grants (user_id, kind, amount)
      values (p_user, 'streak_30', 15.99)
      on conflict do nothing returning kind into v_k;
    if v_k is not null then v_granted := v_granted || v_k; v_k := null; end if;
  end if;

  return json_build_object('day', p_day, 'streak', v_len, 'granted', v_granted);
end $$;
grant execute on function public.confirm_checkin(uuid, date) to authenticated;

-- ================================================================
-- m24 合并块:账号资料自动同步管道
-- ================================================================
-- 3. 每任务只自动建一条账号记录(部分唯一索引,兼作触发器防重)
create unique index if not exists uq_records_auto_task
  on public.account_records (task_id) where task_id is not null;

-- 4. 管道①:任务转入待打款 → 自动建账号记录(状态=待审核,凭证=交付快照)
create or replace function public.auto_account_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_login text; v_pass text;
begin
  if new.status = 'pending_payment' and old.status is distinct from 'pending_payment'
     and new.assigned_freelancer is not null and new.task_type is not null then
    select account_login, account_password into v_login, v_pass
      from public.task_submissions
     where task_id = new.id
     order by created_at desc limit 1;
    insert into public.account_records
      (freelancer_id, task_type, task_id, account_login, account_password, status, created_by)
    values
      (new.assigned_freelancer, new.task_type, new.id, v_login, v_pass, 'pending', auth.uid())
    on conflict (task_id) where task_id is not null do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_auto_account_record on public.tasks;
create trigger trg_auto_account_record
  after update on public.tasks
  for each row execute function public.auto_account_record();

-- 5. 管道②:验收进入 approved → 关联记录转正(仅翻待审核的)
create or replace function public.activate_account_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and new.task_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update public.account_records
       set status = 'active', updated_at = now()
     where task_id = new.task_id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists trg_activate_account_record on public.platform_acceptances;
create trigger trg_activate_account_record
  after insert or update on public.platform_acceptances
  for each row execute function public.activate_account_record();

-- ================================================================
-- m25 合并块:资料变更审批 + 归属转移(需在 is_admin/is_am/current_am_id 之后)
-- ================================================================
-- 1. 资料变更申请表
create table if not exists public.profile_change_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  new_full_name text,
  new_address   text,
  new_city      text,
  new_state     text,
  new_zip       text,
  status        text not null default 'pending' constraint pcr_status_check
                check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note   text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_pcr_pending
  on public.profile_change_requests (user_id) where status = 'pending';
alter table public.profile_change_requests enable row level security;
drop policy if exists p_pcr_select on public.profile_change_requests;
create policy p_pcr_select on public.profile_change_requests for select
  using (user_id = auth.uid() or public.is_admin()
         or (public.is_am() and exists (select 1 from public.profiles p
             where p.id = user_id and p.managed_by = public.current_am_id())));

-- 2. 归属转移申请表
create table if not exists public.am_transfers (
  id            uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  from_am       uuid not null references public.account_managers(id),
  to_am         uuid not null references public.account_managers(id),
  reason        text,
  status        text not null default 'pending' constraint transfer_status_check
                check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note   text,
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_transfer_pending
  on public.am_transfers (freelancer_id) where status = 'pending';
alter table public.am_transfers enable row level security;
drop policy if exists p_transfers_select on public.am_transfers;
create policy p_transfers_select on public.am_transfers for select
  using (public.is_admin()
         or (public.is_am() and (from_am = public.current_am_id() or to_am = public.current_am_id())));

-- 3. RPC:发起资料变更(全空拒;一人一单)
create or replace function public.request_profile_change(
  p_full_name text default null, p_address text default null,
  p_city text default null, p_state text default null, p_zip text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'user' then raise exception 'Only freelancers can request changes.'; end if;
  if coalesce(p_full_name, p_address, p_city, p_state, p_zip) is null then
    raise exception 'Nothing to change.';
  end if;
  begin
    insert into public.profile_change_requests
      (user_id, new_full_name, new_address, new_city, new_state, new_zip)
    values (v_uid, nullif(trim(p_full_name), ''), nullif(trim(p_address), ''),
            nullif(trim(p_city), ''), nullif(trim(p_state), ''), nullif(trim(p_zip), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have a pending change request.';
  end;
  return v_id;
end $$;
grant execute on function public.request_profile_change(text, text, text, text, text) to authenticated;

-- 4. RPC:撤回资料变更
create or replace function public.cancel_profile_change(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profile_change_requests
     set status = 'cancelled'
   where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'No pending request to cancel.'; end if;
end $$;
grant execute on function public.cancel_profile_change(uuid) to authenticated;

-- 5. RPC:裁决资料变更(名下 AM / admin;批准原子生效,显示名跟随法定名)
create or replace function public.decide_profile_change(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.profile_change_requests%rowtype;
  v_managed uuid;
begin
  select * into r from public.profile_change_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'No pending request.'; end if;
  if not (auth.uid() is null or public.is_admin()) then
    if not public.is_am() then raise exception 'Only staff can decide.'; end if;
    select managed_by into v_managed from public.profiles where id = r.user_id;
    if v_managed is distinct from public.current_am_id() then
      raise exception 'You can only decide requests of your own freelancers.';
    end if;
  end if;
  if p_approve then
    update public.profiles
       set full_name    = coalesce(r.new_full_name, full_name),
           display_name = coalesce(r.new_full_name, display_name),
           address      = coalesce(r.new_address, address),
           city         = coalesce(r.new_city, city),
           state        = coalesce(r.new_state, state),
           address_zip  = coalesce(r.new_zip, address_zip)
     where id = r.user_id;
  end if;
  update public.profile_change_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end $$;
grant execute on function public.decide_profile_change(uuid, boolean, text) to authenticated;

-- 6. RPC:发起归属转移(当前归属 AM;目标启用且非自己;一人一单)
create or replace function public.request_am_transfer(p_freelancer uuid, p_to_am uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_am_id();
  v_id uuid;
begin
  if v_me is null then raise exception 'Only AMs can request transfers.'; end if;
  if not exists (select 1 from public.profiles
                 where id = p_freelancer and role = 'user' and managed_by = v_me) then
    raise exception 'You can only transfer your own freelancers.';
  end if;
  if p_to_am = v_me then raise exception 'Target must be a different AM.'; end if;
  if not exists (select 1 from public.account_managers where id = p_to_am and is_active) then
    raise exception 'Target AM not found or inactive.';
  end if;
  begin
    insert into public.am_transfers (freelancer_id, from_am, to_am, reason)
    values (p_freelancer, v_me, p_to_am, nullif(trim(p_reason), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This freelancer already has a pending transfer.';
  end;
  return v_id;
end $$;
grant execute on function public.request_am_transfer(uuid, uuid, text) to authenticated;

-- 7. RPC:撤回归属转移(发起 AM)
create or replace function public.cancel_am_transfer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.am_transfers
     set status = 'cancelled'
   where id = p_id and from_am = public.current_am_id() and status = 'pending';
  if not found then raise exception 'No pending transfer to cancel.'; end if;
end $$;
grant execute on function public.cancel_am_transfer(uuid) to authenticated;

-- 8. RPC:裁决归属转移(admin 专用;批准即改归属)
create or replace function public.decide_am_transfer(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.am_transfers%rowtype;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception 'Only admin can decide transfers.';
  end if;
  select * into r from public.am_transfers where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'No pending transfer.'; end if;
  if p_approve then
    update public.profiles set managed_by = r.to_am where id = r.freelancer_id;
  end if;
  update public.am_transfers
     set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;
grant execute on function public.decide_am_transfer(uuid, boolean, text) to authenticated;

-- ================================================================
-- m26 合并块:站内聊天(需在 is_admin/is_am 之后)
-- ================================================================
-- 1. 会话表(a<b 规范序,两人一线)
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  a               uuid not null references public.profiles(id) on delete cascade,
  b               uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint conv_order check (a < b),
  constraint conv_unique unique (a, b)
);
alter table public.conversations enable row level security;
drop policy if exists p_conv_select on public.conversations;
create policy p_conv_select on public.conversations for select
  using (a = auth.uid() or b = auth.uid());

-- 2. 消息表
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null constraint msg_len check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists idx_messages_conv on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;
drop policy if exists p_msgs_select on public.messages;
create policy p_msgs_select on public.messages for select
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (c.a = auth.uid() or c.b = auth.uid())));

-- 3. 已读水位表
create table if not exists public.message_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.message_reads enable row level security;
drop policy if exists p_reads_select on public.message_reads;
create policy p_reads_select on public.message_reads for select
  using (user_id = auth.uid());

-- 4. 脏话词表(admin 维护;用户不可枚举) + 违规记录
create table if not exists public.banned_words (
  word       text primary key,
  created_at timestamptz not null default now()
);
alter table public.banned_words enable row level security;
drop policy if exists p_banned_admin on public.banned_words;
create policy p_banned_admin on public.banned_words for all
  using (public.is_admin()) with check (public.is_admin());
insert into public.banned_words (word) values
  ('傻逼'),('傻屄'),('妈的'),('媽的'),('操你'),('草泥马'),('去死'),('滚蛋'),('狗屎'),('贱人'),('婊子'),('废物'),
  ('fuck'),('shit'),('bitch'),('asshole'),('cunt'),('bastard'),('dickhead'),('motherfucker')
on conflict do nothing;

create table if not exists public.message_violations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  attempted_body  text not null,
  matched_word    text not null,
  created_at      timestamptz not null default now()
);
alter table public.message_violations enable row level security;
drop policy if exists p_viol_admin on public.message_violations;
create policy p_viol_admin on public.message_violations for select
  using (public.is_admin());

-- 5. 权限图:方向性"能否主动发起"
create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  sr public.user_role; rr public.user_role;
begin
  if p_sender = p_recipient or p_sender is null or p_recipient is null then return false; end if;
  select role into sr from public.profiles where id = p_sender;
  select role into rr from public.profiles where id = p_recipient;
  if sr is null or rr is null then return false; end if;
  if sr = 'admin' then return true; end if;
  if sr = 'am' then
    if rr in ('admin', 'am') then return true; end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = p_recipient and a.user_id = p_sender);
  end if;
  -- freelancer:只能主动找名下 AM
  if sr = 'user' then
    return rr = 'am' and exists (select 1 from public.profiles p
                                 join public.account_managers a on a.id = p.managed_by
                                 where p.id = p_sender and a.user_id = p_recipient);
  end if;
  return false;
end $$;

-- 6. 线是否仍可发送(换归属后 freelancer↔旧AM 只读)
create or replace function public.line_active(p_x uuid, p_y uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  rx public.user_role; ry public.user_role;
  fl uuid; other uuid;
begin
  select role into rx from public.profiles where id = p_x;
  select role into ry from public.profiles where id = p_y;
  if rx = 'user' and ry = 'user' then return false; end if;
  if rx = 'user' or ry = 'user' then
    fl := case when rx = 'user' then p_x else p_y end;
    other := case when rx = 'user' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = fl and a.user_id = other);
  end if;
  return true;  -- am↔am / am↔admin / admin↔admin
end $$;

-- 7. RPC:开线(找旧建新,一对一线)
create or replace function public.open_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  la uuid; gb uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if not public.can_message(v_uid, p_other) then
    raise exception 'You cannot start a conversation with this person.';
  end if;
  la := least(v_uid, p_other); gb := greatest(v_uid, p_other);
  insert into public.conversations (a, b) values (la, gb)
    on conflict (a, b) do nothing;
  select id into v_id from public.conversations where a = la and b = gb;
  return v_id;
end $$;
grant execute on function public.open_conversation(uuid) to authenticated;

-- 8. RPC:发送(参与者校验+旧线只读+脏话拦截并记违规)
create or replace function public.send_message(p_conversation uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.conversations%rowtype;
  v_body text := trim(p_body);
  v_hit text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if v_body is null or char_length(v_body) < 1 then raise exception 'Empty message.'; end if;
  if char_length(v_body) > 4000 then raise exception 'Message too long (max 4000 characters).'; end if;
  select * into c from public.conversations where id = p_conversation;
  if not found or (c.a <> v_uid and c.b <> v_uid) then
    raise exception 'Conversation not found.';
  end if;
  if not public.line_active(c.a, c.b) then
    raise exception 'This conversation is read-only.';
  end if;
  select word into v_hit from public.banned_words
   where position(lower(word) in lower(v_body)) > 0 limit 1;
  if v_hit is not null then
    -- 拦截不抛异常:异常会回滚违规记录;改为落盘后返回状态,前端据此提示
    insert into public.message_violations (user_id, conversation_id, attempted_body, matched_word)
    values (v_uid, p_conversation, left(v_body, 500), v_hit);
    return json_build_object('ok', false, 'error', 'civility');
  end if;
  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation, v_uid, v_body) returning id into v_id;
  update public.conversations set last_message_at = now() where id = p_conversation;
  return json_build_object('ok', true, 'id', v_id);
end $$;
grant execute on function public.send_message(uuid, text) to authenticated;

-- 9. RPC:已读水位
create or replace function public.mark_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversations
                 where id = p_conversation and (a = auth.uid() or b = auth.uid())) then
    raise exception 'Conversation not found.';
  end if;
  insert into public.message_reads (conversation_id, user_id, read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set read_at = now();
end $$;
grant execute on function public.mark_read(uuid) to authenticated;

-- 10. RPC:会话列表(对方名片+末条预览+未读数+是否只读)
create or replace function public.list_conversations()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.id,
      case when c.a = auth.uid() then c.b else c.a end                          as other_id,
      op.display_name                                                          as other_name,
      op.role                                                                  as other_role,
      c.last_message_at,
      (select body from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_body,
      (select count(*) from public.messages m where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz))::int     as unread,
      public.line_active(c.a, c.b)                                             as active
    from public.conversations c
    join public.profiles op on op.id = case when c.a = auth.uid() then c.b else c.a end
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    where c.a = auth.uid() or c.b = auth.uid()
    order by c.last_message_at desc
  ) x
$$;
grant execute on function public.list_conversations() to authenticated;

-- 11. RPC:未读总数(导航红点)
create or replace function public.unread_total()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(cnt), 0)::int from (
    select (select count(*) from public.messages m
            where m.conversation_id = c.id and m.sender_id <> auth.uid()
              and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz)) as cnt
    from public.conversations c
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    where c.a = auth.uid() or c.b = auth.uid()
  ) x
$$;
grant execute on function public.unread_total() to authenticated;

-- 12. RPC:可发起对象名录(按角色收敛)
create or replace function public.message_targets()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'user' then
    return (select coalesce(json_agg(json_build_object(
      'id', a.user_id, 'name', a.name, 'role', 'am')), '[]'::json)
      from public.profiles p join public.account_managers a on a.id = p.managed_by
      where p.id = v_uid and a.user_id is not null);
  elsif v_role = 'am' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, p.display_name as name, 'freelancer' as role
        from public.profiles p
        join public.account_managers me on me.user_id = v_uid
        where p.managed_by = me.id and p.role = 'user'
      union all
      select a.user_id, a.name, 'am' from public.account_managers a
        where a.is_active and a.user_id is not null and a.user_id <> v_uid
      union all
      select p.id, coalesce(p.display_name, 'Admin'), 'admin' from public.profiles p
        where p.role = 'admin'
      order by role, name
    ) t);
  elsif v_role = 'admin' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, coalesce(p.display_name, p.full_name, left(p.id::text, 8)) as name,
        case p.role when 'user' then 'freelancer' else p.role::text end as role
      from public.profiles p where p.id <> v_uid
      order by role, name
    ) t);
  end if;
  return '[]'::json;
end $$;
grant execute on function public.message_targets() to authenticated;

-- 13. Realtime 发布(本地无 supabase_realtime 时自动跳过)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ================================================================
-- m27 合并块:待办派单(需在 is_admin/is_am/current_am_id 之后)
-- ================================================================
-- 1. 待办表
create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  content      text not null constraint todo_len check (char_length(content) between 1 and 500),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  assigned_am  uuid references public.account_managers(id) on delete cascade,  -- null = admin 自留备忘
  status       text not null default 'open' constraint todo_status_check
               check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_todos_assigned on public.todos (assigned_am, status);
alter table public.todos enable row level security;

drop policy if exists p_todos_admin on public.todos;
create policy p_todos_admin on public.todos for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_todos_am_select on public.todos;
create policy p_todos_am_select on public.todos for select
  using (public.is_am() and assigned_am = public.current_am_id());

-- 2. RPC:完成待办(admin 任意;AM 仅指派给自己的;只置完成不改内容)
create or replace function public.complete_todo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.todos%rowtype;
begin
  select * into v from public.todos where id = p_id for update;
  if not found or v.status <> 'open' then raise exception 'No open todo found.'; end if;
  if not (auth.uid() is null or public.is_admin()
          or (public.is_am() and v.assigned_am = public.current_am_id())) then
    raise exception 'You can only complete todos assigned to you.';
  end if;
  update public.todos
     set status = 'done', completed_at = now(), completed_by = auth.uid()
   where id = p_id;
end $$;
grant execute on function public.complete_todo(uuid) to authenticated;

-- ================================================================
-- m28 合并块:函数执行权收紧(需在全部函数创建之后 = 收官段)
-- ================================================================
-- 1. 孤儿清除
drop function if exists public.respond_to_offer(uuid, boolean);

-- 2. 内部函数(触发器/helper):收回全部直接执行权
revoke execute on function public.activate_account_record() from public, anon, authenticated;
revoke execute on function public.auto_account_record() from public, anon, authenticated;
revoke execute on function public.blacklist_on_ban() from public, anon, authenticated;
revoke execute on function public.can_message(p_sender uuid, p_recipient uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.kyc_submission_after_insert() from public, anon, authenticated;
revoke execute on function public.line_active(p_x uuid, p_y uuid) from public, anon, authenticated;
revoke execute on function public.offer_after_insert() from public, anon, authenticated;
revoke execute on function public.offer_after_update() from public, anon, authenticated;
revoke execute on function public.offer_before_insert() from public, anon, authenticated;
revoke execute on function public.promote_to_admin(p_email text) from public, anon, authenticated;
revoke execute on function public.protect_profile_delete() from public, anon, authenticated;
revoke execute on function public.protect_profiles() from public, anon, authenticated;
revoke execute on function public.protect_task_commission() from public, anon, authenticated;
revoke execute on function public.submission_after_insert() from public, anon, authenticated;
revoke execute on function public.submission_after_update() from public, anon, authenticated;
revoke execute on function public.submission_before_insert() from public, anon, authenticated;
revoke execute on function public.submission_before_update() from public, anon, authenticated;
revoke execute on function public.task_owned_by_am(p_task uuid) from public, anon;
grant  execute on function public.task_owned_by_am(p_task uuid) to authenticated;  -- 策略引用,须保留(m29)

-- 3. 面向登录用户的 RPC:收回 public 与未登录执行权
revoke execute on function public.activate_staff(p_user uuid, p_role text) from public, anon;
revoke execute on function public.admin_delete_am(p_am uuid) from public, anon;
revoke execute on function public.admin_delete_user(p_email text) from public, anon;
revoke execute on function public.am_accept(p_freelancer uuid, p_type platform_type) from public, anon;
revoke execute on function public.am_accept_task(p_task uuid) from public, anon;
revoke execute on function public.am_reject_freelancer(p_freelancer uuid, p_reason text) from public, anon;
revoke execute on function public.am_set_suspended(p_freelancer uuid, p_suspend boolean, p_reason text) from public, anon;
revoke execute on function public.assign_task_direct(p_task uuid, p_freelancer uuid) from public, anon;
revoke execute on function public.bind_am_login(p_am uuid, p_email text) from public, anon;
revoke execute on function public.cancel_am_transfer(p_id uuid) from public, anon;
revoke execute on function public.cancel_profile_change(p_id uuid) from public, anon;
revoke execute on function public.claim_freelancer(p_freelancer uuid) from public, anon;
revoke execute on function public.complete_todo(p_id uuid) from public, anon;
revoke execute on function public.confirm_checkin(p_user uuid, p_day date) from public, anon;
revoke execute on function public.confirm_receipt(p_task_id uuid) from public, anon;
revoke execute on function public.current_am_id() from public, anon;
revoke execute on function public.decide_am_transfer(p_id uuid, p_approve boolean, p_note text) from public, anon;
revoke execute on function public.decide_profile_change(p_id uuid, p_approve boolean, p_note text) from public, anon;
revoke execute on function public.do_checkin() from public, anon;
revoke execute on function public.email_domain_allowed(p_email text) from public, anon;
revoke execute on function public.expire_stale_offers() from public, anon;
revoke execute on function public.flag_account_review(p_record uuid, p_reason text) from public, anon;
revoke execute on function public.get_shared_task(p_token uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_am() from public, anon;
revoke execute on function public.kyc_risk_scan(p_user uuid) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.list_pending_staff() from public, anon;
revoke execute on function public.mark_read(p_conversation uuid) from public, anon;
revoke execute on function public.message_targets() from public, anon;
revoke execute on function public.open_conversation(p_other uuid) from public, anon;
revoke execute on function public.reject_staff(p_user uuid) from public, anon;
revoke execute on function public.reopen_acceptance(p_acceptance uuid, p_reason text) from public, anon;
revoke execute on function public.request_am_transfer(p_freelancer uuid, p_to_am uuid, p_reason text) from public, anon;
revoke execute on function public.request_bonus_grant(p_grant uuid) from public, anon;
revoke execute on function public.request_profile_change(p_full_name text, p_address text, p_city text, p_state text, p_zip text) from public, anon;
revoke execute on function public.request_task_payout(p_task uuid) from public, anon;
revoke execute on function public.resolve_reopened(p_acceptance uuid, p_note text) from public, anon;
revoke execute on function public.review_acceptance(p_acceptance uuid, p_approve boolean, p_note text) from public, anon;
revoke execute on function public.send_message(p_conversation uuid, p_body text) from public, anon;
revoke execute on function public.set_default_payout(p_id uuid) from public, anon;
revoke execute on function public.staff_code_ok(p_code text) from public, anon;
revoke execute on function public.submit_enhanced_kyc(p_ssn_full text) from public, anon;
revoke execute on function public.unbind_am_login(p_am uuid) from public, anon;
revoke execute on function public.unread_total() from public, anon;

-- 4. anon 白名单:注册预检与分享页(显式回授,幂等)
grant execute on function public.email_domain_allowed(p_email text) to anon;
grant execute on function public.get_shared_task(p_token uuid) to anon;

-- 5. 风控 helper 固定 search_path
alter function public.compute_identity_composite(p_name text, p_dob date, p_ssn4 text) set search_path = public;
alter function public.fp_norm_handle(t text) set search_path = public;
alter function public.fp_norm_name(t text) set search_path = public;
alter function public.fp_norm_phone(t text) set search_path = public;


-- ================================================================
-- m30 合并块:脏话词表扩充
-- ================================================================
insert into public.banned_words (word) values
  -- 英文:轻中度侮辱
  ('stupid'),('idiot'),('moron'),('dumbass'),('jackass'),('retard'),
  ('loser'),('scumbag'),('shut up'),('screw you'),('piss off'),
  ('go to hell'),('wtf'),('stfu'),('suck'),('trash human'),('braindead'),
  ('pathetic'),('worthless'),('clown'),
  -- 中文:轻中度侮辱与常见变体
  ('智障'),('脑残'),('白痴'),('蠢货'),('蠢猪'),('笨蛋'),('你妈'),('尼玛'),
  ('nmsl'),('神经病'),('闭嘴'),('滚开'),('你滚'),('快滚'),('死全家'),
  ('找死'),('垃圾'),('煞笔'),('沙比'),('傻b'),('废柴'),('狗东西'),('贱货')
on conflict do nothing;


-- ================================================================
-- m31/m40 合并块:钱包统一提现工单(平行窗口 m31 重建 + 方案甲 + 四RPC)
-- ================================================================
-- 1. 工单表(m31 原样重建,生产已存在则空转)
create table if not exists public.payout_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  am_id         uuid references public.account_managers(id) on delete set null,
  total         numeric not null check (total > 0),
  items         jsonb not null,   -- [{kind:'task'|'grant'|'signup', ref, amount, label}]
  status        text not null default 'pending' constraint payout_req_status_check
                check (status in ('pending', 'paid_pending_confirm', 'completed', 'rejected')),
  tx_ref        text,
  note          text,
  reject_reason text,
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_payout_req_user on public.payout_requests (user_id);
create index if not exists idx_payout_req_am   on public.payout_requests (am_id, status);
alter table public.payout_requests enable row level security;
drop policy if exists p_payout_select on public.payout_requests;
create policy p_payout_select on public.payout_requests for select
  using (user_id = auth.uid() or public.is_admin()
         or (public.is_am() and am_id = public.current_am_id()));
drop policy if exists p_payout_admin on public.payout_requests;
create policy p_payout_admin on public.payout_requests for all
  using (public.is_admin()) with check (public.is_admin());

-- 2. 方案甲:进行中唯一约束只卡 pending(待确认不再挡新单)
drop index if exists public.uq_payout_req_open;
create unique index if not exists uq_payout_req_open
  on public.payout_requests (user_id) where status = 'pending';


-- 4. RPC:打包提现(收集 待结任务 + 已解锁签到奖励 + 可领注册奖励)
create or replace function public.request_wallet_payout()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kyc text;
  v_am uuid;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  r record;
  v_bonus text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  select kyc_status::text, managed_by into v_kyc, v_am from public.profiles where id = v_uid;
  if v_kyc is distinct from 'verified' then raise exception 'Complete KYC before requesting a payout.'; end if;
  for r in select t.id, t.title, t.amount from public.tasks t
    where t.assigned_freelancer = v_uid and t.status = 'pending_payment'
      and not exists (select 1 from public.payout_requests q
        where q.status <> 'rejected'
          and q.items @> jsonb_build_array(jsonb_build_object('kind', 'task', 'ref', t.id::text)))
  loop
    v_items := v_items || jsonb_build_object('kind', 'task', 'ref', r.id::text, 'amount', r.amount, 'label', r.title);
    v_total := v_total + r.amount;
  end loop;
  for r in select g.id, g.kind, g.amount from public.bonus_grants g
    where g.user_id = v_uid and g.state = 'locked'
  loop
    v_items := v_items || jsonb_build_object('kind', 'grant', 'ref', r.id::text, 'amount', r.amount, 'label', r.kind);
    v_total := v_total + r.amount;
    perform set_config('app.wallet_rpc', '1', true);
    update public.bonus_grants set state = 'requested' where id = r.id;
  end loop;
  select signup_bonus_state::text into v_bonus from public.profiles
    where id = v_uid and enhanced_kyc_status = 'verified';
  if v_bonus = 'locked' then
    v_items := v_items || jsonb_build_object('kind', 'signup', 'ref', v_uid::text, 'amount', 2.99, 'label', 'Signup bonus');
    v_total := v_total + 2.99;
    perform set_config('app.wallet_rpc', '1', true);
    update public.profiles set signup_bonus_state = 'requested' where id = v_uid;
  end if;
  if v_total <= 0 then raise exception 'Nothing to withdraw yet.'; end if;
  begin
    insert into public.payout_requests (user_id, am_id, total, items)
    values (v_uid, v_am, v_total, v_items) returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have a payout request in progress.';
  end;
  return v_id;
end $$;
grant execute on function public.request_wallet_payout() to authenticated;

-- 5. RPC:打款(admin 或归属 AM;方案甲=打款即结清源头)
create or replace function public.payout_mark_paid(p_id uuid, p_tx text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  q public.payout_requests%rowtype;
  it jsonb;
begin
  select * into q from public.payout_requests where id = p_id for update;
  if not found or q.status <> 'pending' then raise exception 'No pending payout request.'; end if;
  if not (auth.uid() is null or public.is_admin()
          or (public.is_am() and q.am_id = public.current_am_id())) then
    raise exception 'Only the owning AM or an admin can mark this paid.';
  end if;
  perform set_config('app.wallet_rpc', '1', true);
  for it in select * from jsonb_array_elements(q.items) loop
    if it->>'kind' = 'task' then
      update public.tasks set status = 'completed' where id = (it->>'ref')::uuid and status = 'pending_payment';
    elsif it->>'kind' = 'grant' then
      update public.bonus_grants set state = 'paid', tx_ref = coalesce(p_tx, tx_ref), paid_at = now()
        where id = (it->>'ref')::uuid;
    elsif it->>'kind' = 'signup' then
      update public.profiles set signup_bonus_state = 'paid', bonus_tx_ref = coalesce(p_tx, bonus_tx_ref), bonus_paid_at = now()
        where id = (it->>'ref')::uuid;
    end if;
  end loop;
  update public.payout_requests
     set status = 'paid_pending_confirm', tx_ref = nullif(trim(coalesce(p_tx, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;
grant execute on function public.payout_mark_paid(uuid, text) to authenticated;

-- 6. RPC:驳回(回滚源头,可重新打包)
create or replace function public.payout_reject(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  q public.payout_requests%rowtype;
  it jsonb;
begin
  select * into q from public.payout_requests where id = p_id for update;
  if not found or q.status <> 'pending' then raise exception 'No pending payout request.'; end if;
  if not (auth.uid() is null or public.is_admin()
          or (public.is_am() and q.am_id = public.current_am_id())) then
    raise exception 'Only the owning AM or an admin can reject this.';
  end if;
  perform set_config('app.wallet_rpc', '1', true);
  for it in select * from jsonb_array_elements(q.items) loop
    if it->>'kind' = 'grant' then
      update public.bonus_grants set state = 'locked' where id = (it->>'ref')::uuid and state = 'requested';
    elsif it->>'kind' = 'signup' then
      update public.profiles set signup_bonus_state = 'locked'
        where id = (it->>'ref')::uuid and signup_bonus_state = 'requested';
    end if;
  end loop;
  update public.payout_requests
     set status = 'rejected', reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;
grant execute on function public.payout_reject(uuid, text) to authenticated;

-- 7. RPC:确认到账(纯徽标,方案甲下不阻塞任何流程)
create or replace function public.confirm_wallet_payout(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payout_requests
     set status = 'completed', confirmed_at = now()
   where id = p_id and user_id = auth.uid() and status = 'paid_pending_confirm';
  if not found then raise exception 'No payout awaiting your confirmation.'; end if;
end $$;
grant execute on function public.confirm_wallet_payout(uuid) to authenticated;

-- 8. 聊天词表扩充(轻度侮辱词)
insert into public.banned_words (word) values
  ('stupid'),('idiot'),('dumb'),('moron'),('loser'),('trash'),('白痴'),('蠢货'),('垃圾'),('滚')
on conflict do nothing;


-- ================================================================
-- m41 合并块:聊天翻译缓存(配套 Edge Function translate-messages)
-- ================================================================
-- 每条消息每种目标语言只翻一次,全员复用;读权限跟随 messages 本身;
-- 写入只走 Edge Function(service_role 绕过 RLS,有意设计);不加 Realtime。
create table if not exists public.message_translations (
  message_id      uuid not null references public.messages(id) on delete cascade,
  target_lang     text not null constraint mt_lang_check check (target_lang in ('zh', 'en')),
  translated_text text not null constraint mt_len check (char_length(translated_text) between 1 and 8000),
  provider        text not null default 'deepl',
  created_at      timestamptz not null default now(),
  primary key (message_id, target_lang)
);
alter table public.message_translations enable row level security;

drop policy if exists p_mt_select on public.message_translations;
create policy p_mt_select on public.message_translations for select
  using (exists (select 1 from public.messages m where m.id = message_id));
-- 不建 insert/update/delete 策略:普通用户写入被 RLS 默认拒绝,仅 service_role 可写。



-- ================================================================
-- m42 合并块:线索引导系统(/join · 访客聊天 · 认领池 · 在线开关;含决策①安全修复
--            与 账号资料策略归一)
-- ================================================================
-- 1. 角色与在线状态字段
-- profiles.role 增加 lead(访客线索;匿名会话);同事务内不使用新枚举值,
-- 全部引用都在 plpgsql 函数体内(执行期解析),避开 55P04。
alter type public.user_role add value if not exists 'lead';

-- AM 在线双保险:接单开关 + 心跳(在线 = 开关开 且 心跳 2 分钟内新鲜)
alter table public.profiles add column if not exists accepting_leads boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- 消息类型:user=普通消息 / system=居中灰色系统通知(仅 service_role 与内部 RPC 写入)
alter table public.messages add column if not exists kind text not null default 'user'
  constraint msg_kind_check check (kind in ('user', 'system'));

-- 2. leads 线索表(公开引导页 /join 的落点;写入零匿名策略,只走 Edge Function 与 RPC)
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null constraint lead_name_len
                    check (char_length(btrim(full_name)) between 1 and 80),
  wa_e164           text not null constraint lead_wa_shape
                    check (wa_e164 ~ '^\+[1-9][0-9]{6,14}$'),   -- E.164 归一化,去重键
  telegram          text constraint lead_tg_shape
                    check (telegram is null or telegram ~ '^[A-Za-z0-9_]{5,32}$'),
  profile_id        uuid references public.profiles(id) on delete set null,  -- 当前匿名会话档
  assigned_am       uuid references public.account_managers(id) on delete set null,
  assigned_at       timestamptz,
  first_reply_at    timestamptz,          -- 归属 AM 首次回复(3 分钟认领水位的锚)
  status            text not null default 'new' constraint lead_status_check
                    check (status in ('new', 'contacted', 'converted', 'lost')),
  ref_token         uuid not null default gen_random_uuid(),    -- 专属注册链接 /signup?ref=
  converted_profile uuid references public.profiles(id) on delete set null,
  converted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists uq_leads_wa      on public.leads (wa_e164);
create unique index if not exists uq_leads_ref     on public.leads (ref_token);
create unique index if not exists uq_leads_profile on public.leads (profile_id) where profile_id is not null;
create index if not exists idx_leads_am on public.leads (assigned_am, status);

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
-- 读:员工全量(AM 认领池需要看非名下线索);lead 本人只见自己这条
drop policy if exists p_leads_staff_sel on public.leads;
create policy p_leads_staff_sel on public.leads for select
  using (public.is_admin() or public.is_am());
drop policy if exists p_leads_self_sel on public.leads;
create policy p_leads_self_sel on public.leads for select
  using (profile_id = auth.uid());
-- 写:不建任何 insert/update/delete 策略 —— 仅 service_role(Edge Function lead-intake)
-- 与 definer RPC 可写,有意设计,不要"修复"。

-- 3. handle_new_user 扩展:匿名会话建 lead 档;注册链接 ?ref= 自动转化并绑定归属
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'user';
  v_code text;
  v_ref  uuid;
  v_lead public.leads%rowtype;
begin
  -- m42:匿名会话(访客线索)→ 建 lead 档;跳过邮箱域名检查与员工码逻辑
  if new.email is null or btrim(new.email::text) = '' then
    insert into public.profiles (id, role)
    values (new.id, 'lead')
    on conflict (id) do nothing;
    return new;
  end if;

  if not public.email_domain_allowed(new.email::text) then
    raise exception 'Disposable email domains are not allowed. Please sign up with a real inbox.';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'staff_code', '') <> '' then
    select value into v_code from public.app_settings where key = 'staff_invite_code';
    if v_code is not null and new.raw_user_meta_data ->> 'staff_code' = v_code then
      v_role := 'pending';
    end if;
  end if;
  insert into public.profiles (id, display_name, role, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', v_role, new.email)
  on conflict (id) do nothing;

  -- m42:专属注册链接携带 lead_ref → 线索转化 + 归属绑定(跨设备生效)
  begin
    v_ref := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'lead_ref', '')), '')::uuid;
  exception when others then
    v_ref := null;
  end;
  if v_ref is not null and v_role = 'user' then
    select * into v_lead from public.leads
     where ref_token = v_ref and status <> 'converted';
    if found then
      update public.leads
         set status = 'converted', converted_profile = new.id, converted_at = now()
       where id = v_lead.id;
      if v_lead.assigned_am is not null then
        update public.profiles set managed_by = v_lead.assigned_am where id = new.id;
      end if;
    end if;
  end if;

  return new;
end $$;

-- 4. 聊天权限图扩展:lead ↔ 归属顾问
-- 方向性"能否主动发起":lead 只能找归属 AM;AM 可主动找名下 lead;admin 不变(任何人)
create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  sr public.user_role; rr public.user_role;
begin
  if p_sender = p_recipient or p_sender is null or p_recipient is null then return false; end if;
  select role into sr from public.profiles where id = p_sender;
  select role into rr from public.profiles where id = p_recipient;
  if sr is null or rr is null then return false; end if;
  if sr = 'admin' then return true; end if;
  if sr = 'am' then
    if rr in ('admin', 'am') then return true; end if;
    if rr = 'lead' then
      return exists (select 1 from public.leads l
                     join public.account_managers a on a.id = l.assigned_am
                     where l.profile_id = p_recipient and a.user_id = p_sender);
    end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = p_recipient and a.user_id = p_sender);
  end if;
  -- freelancer:只能主动找名下 AM
  if sr = 'user' then
    return rr = 'am' and exists (select 1 from public.profiles p
                                 join public.account_managers a on a.id = p.managed_by
                                 where p.id = p_sender and a.user_id = p_recipient);
  end if;
  -- lead:只能主动找归属顾问(m42)
  if sr = 'lead' then
    return rr = 'am' and exists (select 1 from public.leads l
                                 join public.account_managers a on a.id = l.assigned_am
                                 where l.profile_id = p_sender and a.user_id = p_recipient);
  end if;
  return false;
end $$;

-- 线是否仍可发送:lead 线随「当前归属 + 未转化」存活;改派/换设备/转化后旧线只读
create or replace function public.line_active(p_x uuid, p_y uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  rx public.user_role; ry public.user_role;
  fl uuid; other uuid;
begin
  select role into rx from public.profiles where id = p_x;
  select role into ry from public.profiles where id = p_y;
  -- lead 线(m42):对面是 admin 恒活;对面是当前归属 AM 且未转化才可发
  if rx = 'lead' or ry = 'lead' then
    fl := case when rx = 'lead' then p_x else p_y end;
    other := case when rx = 'lead' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    return exists (select 1 from public.leads l
                   join public.account_managers a on a.id = l.assigned_am
                   where l.profile_id = fl and a.user_id = other and l.status <> 'converted');
  end if;
  if rx = 'user' and ry = 'user' then return false; end if;
  if rx = 'user' or ry = 'user' then
    fl := case when rx = 'user' then p_x else p_y end;
    other := case when rx = 'user' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = fl and a.user_id = other);
  end if;
  return true;  -- am↔am / am↔admin / admin↔admin
end $$;

-- 可发起对象名录:lead 只见归属顾问;AM 名录并入名下未转化 lead
create or replace function public.message_targets()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'lead' then
    return (select coalesce(json_agg(json_build_object(
      'id', a.user_id, 'name', a.name, 'role', 'am')), '[]'::json)
      from public.leads l join public.account_managers a on a.id = l.assigned_am
      where l.profile_id = v_uid and a.user_id is not null);
  elsif v_role = 'user' then
    return (select coalesce(json_agg(json_build_object(
      'id', a.user_id, 'name', a.name, 'role', 'am')), '[]'::json)
      from public.profiles p join public.account_managers a on a.id = p.managed_by
      where p.id = v_uid and a.user_id is not null);
  elsif v_role = 'am' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, p.display_name as name, 'freelancer' as role
        from public.profiles p
        join public.account_managers me on me.user_id = v_uid
        where p.managed_by = me.id and p.role = 'user'
      union all
      select l.profile_id, l.full_name, 'lead'
        from public.leads l
        join public.account_managers me2 on me2.user_id = v_uid
        where l.assigned_am = me2.id and l.profile_id is not null and l.status <> 'converted'
      union all
      select a.user_id, a.name, 'am' from public.account_managers a
        where a.is_active and a.user_id is not null and a.user_id <> v_uid
      union all
      select p.id, coalesce(p.display_name, 'Admin'), 'admin' from public.profiles p
        where p.role = 'admin'
      order by role, name
    ) t);
  elsif v_role = 'admin' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, coalesce(p.display_name, p.full_name, left(p.id::text, 8)) as name,
        case p.role when 'user' then 'freelancer' else p.role::text end as role
      from public.profiles p where p.id <> v_uid
      order by role, name
    ) t);
  end if;
  return '[]'::json;
end $$;

-- 5. 首答水位:归属 AM 的第一条普通消息落地 → 记 first_reply_at,new 顺手转 contacted
create or replace function public.lead_first_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_am_id uuid;
  v_other uuid;
  c public.conversations%rowtype;
begin
  if new.kind is distinct from 'user' then return new; end if;   -- 系统通知不算回复
  select id into v_am_id from public.account_managers where user_id = new.sender_id;
  if v_am_id is null then return new; end if;                    -- 只有 AM 的发言计首答
  select * into c from public.conversations where id = new.conversation_id;
  if not found then return new; end if;
  v_other := case when c.a = new.sender_id then c.b else c.a end;
  update public.leads
     set first_reply_at = coalesce(first_reply_at, new.created_at),
         status = case when status = 'new' then 'contacted' else status end
   where profile_id = v_other and assigned_am = v_am_id and first_reply_at is null;
  return new;
end $$;

drop trigger if exists trg_lead_first_reply on public.messages;
create trigger trg_lead_first_reply after insert on public.messages
  for each row execute function public.lead_first_reply();

-- 6. 线程随线索走(内部函数):建/找新归属线,搬既有消息(旧 AM 从未回复,历史=留言+系统通知),
--    插入「已分配」系统通知;p_with_intro=true 时先插「已提交」通知(intake 首次分配用)
create or replace function public.lead_thread_assign(
  p_lead_profile uuid, p_old_am_user uuid, p_new_am_user uuid,
  p_new_am_name text, p_with_intro boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  la uuid; gb uuid;
  v_conv uuid; v_old_conv uuid;
begin
  if p_lead_profile is null or p_new_am_user is null then return null; end if;
  la := least(p_lead_profile, p_new_am_user);
  gb := greatest(p_lead_profile, p_new_am_user);
  insert into public.conversations (a, b) values (la, gb)
    on conflict (a, b) do nothing;
  select id into v_conv from public.conversations where a = la and b = gb;

  if p_old_am_user is not null and p_old_am_user <> p_new_am_user then
    select id into v_old_conv from public.conversations
     where a = least(p_lead_profile, p_old_am_user)
       and b = greatest(p_lead_profile, p_old_am_user);
    if v_old_conv is not null then
      update public.messages set conversation_id = v_conv
       where conversation_id = v_old_conv;
      delete from public.conversations where id = v_old_conv;  -- reads 级联清理
    end if;
  end if;

  if p_with_intro then
    insert into public.messages (conversation_id, sender_id, body, kind)
    values (v_conv, p_lead_profile, json_build_object('k', 'submitted')::text, 'system');
  end if;
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (v_conv, p_lead_profile,
          json_build_object('k', 'assigned', 'am', p_new_am_name)::text, 'system');
  update public.conversations set last_message_at = now() where id = v_conv;
  return v_conv;
end $$;

-- 7. 分配算法(仅 Edge Function 调用):在线 AM(开关开 + 心跳 2 分钟内)里挑未转化负载最少者
create or replace function public.pick_lead_am()
returns uuid language sql stable security definer set search_path = public as $$
  select a.id
  from public.account_managers a
  join public.profiles p on p.id = a.user_id
  where a.is_active
    and p.accepting_leads
    and p.last_seen_at > now() - interval '2 minutes'
  order by (select count(*) from public.leads l
            where l.assigned_am = a.id and l.status in ('new', 'contacted')) asc,
           random()
  limit 1
$$;

-- 8. AM 在线开关与心跳(工作台在线期间每 60 秒一跳)
create or replace function public.am_set_accepting(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set accepting_leads = p_on, last_seen_at = now()
   where id = auth.uid() and role = 'am';
  if not found then raise exception '仅账户经理可切换接收线索开关。'; end if;
end $$;

create or replace function public.am_heartbeat()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and role = 'am';
end $$;

-- 9. 认领(原子):status=new 且无首答 且 (无归属 或 分配超 3 分钟) 才可认领;
--    3 分钟 = 全站唯一常量(前端同名常量 LEAD_CLAIM_MINUTES=3);既有留言随认领转移
create or replace function public.claim_lead(p_lead uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_am_id();
  v_me_user uuid := auth.uid();
  v_me_name text;
  v_l public.leads%rowtype;
  v_old_user uuid;
  v_conv uuid;
begin
  if v_me is null then raise exception '仅账户经理可认领线索。'; end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status <> 'new' or v_l.first_reply_at is not null
     or (v_l.assigned_am is not null
         and v_l.assigned_at >= now() - interval '3 minutes') then
    raise exception '该线索当前不可认领(已被回复、认领未超时或状态已变更)。';
  end if;
  select a.user_id into v_old_user from public.account_managers a where a.id = v_l.assigned_am;
  select a.name into v_me_name from public.account_managers a where a.id = v_me;

  update public.leads set assigned_am = v_me, assigned_at = now() where id = p_lead;
  v_conv := public.lead_thread_assign(v_l.profile_id, v_old_user, v_me_user, v_me_name, false);
  return json_build_object('ok', true, 'conversation_id', v_conv);
end $$;

-- 10. 强制指派/改派(仅 admin):任意时点改归属;首答水位清零重新计时;线程随线索走
create or replace function public.admin_assign_lead(p_lead uuid, p_am uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_l public.leads%rowtype;
  v_new_user uuid; v_new_name text;
  v_old_user uuid;
  v_conv uuid;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception '仅管理员可强制指派线索。';
  end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status = 'converted' then raise exception '已转化线索不可改派。'; end if;
  select a.user_id, a.name into v_new_user, v_new_name
    from public.account_managers a where a.id = p_am and a.is_active;
  if not found then raise exception '目标账户经理不存在或已停用。'; end if;
  select a.user_id into v_old_user from public.account_managers a where a.id = v_l.assigned_am;

  update public.leads
     set assigned_am = p_am, assigned_at = now(), first_reply_at = null,
         status = case when status = 'lost' then 'new' else status end
   where id = p_lead;
  v_conv := public.lead_thread_assign(v_l.profile_id, v_old_user, v_new_user, v_new_name, false);
  return json_build_object('ok', true, 'conversation_id', v_conv);
end $$;

-- 11. 状态流转(归属 AM / admin):new·contacted·lost 三态互转;converted 只由注册链接产生
create or replace function public.lead_set_status(p_lead uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_l public.leads%rowtype;
begin
  if p_status not in ('new', 'contacted', 'lost') then
    raise exception '状态只能在 新线索/已联系/流失 之间流转。';
  end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status = 'converted' then raise exception '已转化线索不可改状态。'; end if;
  if not (auth.uid() is null or public.is_admin()
          or v_l.assigned_am = public.current_am_id()) then
    raise exception '仅归属账户经理或管理员可流转状态。';
  end if;
  update public.leads set status = p_status where id = p_lead;
end $$;

-- 12. 执行权:决策①补收四个钱包 RPC 的公共执行权(m28 之后创建的漏网;
--     anon 密钥不可再触达,正常前端零影响) + 本批新函数最小授权
revoke execute on function public.request_wallet_payout()      from public, anon;
revoke execute on function public.payout_mark_paid(uuid, text) from public, anon;
revoke execute on function public.payout_reject(uuid, text)    from public, anon;
revoke execute on function public.confirm_wallet_payout(uuid)  from public, anon;

revoke execute on function public.lead_first_reply()  from public, anon, authenticated;
revoke execute on function public.lead_thread_assign(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.lead_thread_assign(uuid, uuid, uuid, text, boolean) to service_role;
revoke execute on function public.pick_lead_am()      from public, anon, authenticated;
grant  execute on function public.pick_lead_am()      to service_role;

revoke execute on function public.am_set_accepting(boolean)      from public, anon;
revoke execute on function public.am_heartbeat()                 from public, anon;
revoke execute on function public.claim_lead(uuid)               from public, anon;
revoke execute on function public.admin_assign_lead(uuid, uuid)  from public, anon;
revoke execute on function public.lead_set_status(uuid, text)    from public, anon;
grant  execute on function public.am_set_accepting(boolean)      to authenticated, service_role;
grant  execute on function public.am_heartbeat()                 to authenticated, service_role;
grant  execute on function public.claim_lead(uuid)               to authenticated, service_role;
grant  execute on function public.admin_assign_lead(uuid, uuid)  to authenticated, service_role;
grant  execute on function public.lead_set_status(uuid, text)    to authenticated, service_role;

-- 13. 账号资料策略归一(存档陈旧点对齐生产):AM 权限拆为 查/增/改 三条,
--     刻意不含 delete —— 资料删除走「AM 申请 → admin 审批」是既定产品决定;
--     并为 update 补全 with check(轻微收紧:改动后记录仍须在名下,合法操作零影响)。
drop policy if exists p_rec_am     on public.account_records;
drop policy if exists p_rec_am_sel on public.account_records;
drop policy if exists p_rec_am_ins on public.account_records;
drop policy if exists p_rec_am_upd on public.account_records;
create policy p_rec_am_sel on public.account_records for select
  using (exists (select 1 from public.profiles f
                 where f.id = freelancer_id and f.managed_by = public.current_am_id()));
create policy p_rec_am_ins on public.account_records for insert
  with check (exists (select 1 from public.profiles f
                      where f.id = freelancer_id and f.managed_by = public.current_am_id()));
create policy p_rec_am_upd on public.account_records for update
  using (exists (select 1 from public.profiles f
                 where f.id = freelancer_id and f.managed_by = public.current_am_id()))
  with check (exists (select 1 from public.profiles f
                      where f.id = freelancer_id and f.managed_by = public.current_am_id()));



-- ================================================================
-- m43 合并块:聊天体验批(Support 接待档 · 备注 · 话术 · 对称回执)
-- ================================================================
-- 1. LocalTask Support 接待档(⑪ 排队页移除):
--    一个特殊 profiles 档,不可登录(auth.users 无邮箱无凭据、is_anonymous)、
--    永不出现在 AM 名录/派单/分配算法里(无 account_managers 行,is_am()=false);
--    全员离线时访客直接与它开线倾诉,AM 认领后既有留言原子搬进新顾问线。
--    身份标记存 app_settings('support_profile_id'),幂等重跑只校准档案字段。
do $$
declare v uuid;
begin
  select value::uuid into v from public.app_settings where key = 'support_profile_id';
  if v is null then
    v := gen_random_uuid();
    insert into auth.users (id, email, is_anonymous, aud, role, created_at, updated_at)
    values (v, null, true, 'authenticated', 'authenticated', now(), now());
    insert into public.app_settings (key, value) values ('support_profile_id', v::text);
  end if;
  -- 档案字段校准(首建由 handle_new_user 触发器落 lead 档;此处统一定型)
  update public.profiles
     set role = 'am', display_name = 'LocalTask Support'
   where id = v;
end $$;

-- 身份读取助手:仅回一个 uuid(访客前端要用它开线,授 authenticated 无害)
create or replace function public.support_profile_id()
returns uuid language sql stable security definer set search_path = public as
$$ select value::uuid from public.app_settings where key = 'support_profile_id' $$;

-- 2. 客户备注(① 决策1a:记录者本人 + admin 可见;一人对一客一条,可编辑)
create table if not exists public.crm_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  body       text not null constraint crm_note_len check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_crm_note unique (owner_id, subject_id)
);
create index if not exists idx_crm_subject on public.crm_notes (subject_id);
drop trigger if exists trg_crm_touch on public.crm_notes;
create trigger trg_crm_touch before update on public.crm_notes
  for each row execute function public.touch_updated_at();
alter table public.crm_notes enable row level security;
drop policy if exists p_crm_owner on public.crm_notes;
create policy p_crm_owner on public.crm_notes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists p_crm_admin_sel on public.crm_notes;
create policy p_crm_admin_sel on public.crm_notes for select
  using (public.is_admin());

-- 3. 自定义快捷话术(⑥:严格仅本人可见,admin 也看不到别人的)
create table if not exists public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  body       text not null constraint qr_len check (char_length(body) between 1 and 2000),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qr_owner on public.quick_replies (owner_id, sort);
drop trigger if exists trg_qr_touch on public.quick_replies;
create trigger trg_qr_touch before update on public.quick_replies
  for each row execute function public.touch_updated_at();
alter table public.quick_replies enable row level security;
drop policy if exists p_qr_owner on public.quick_replies;
create policy p_qr_owner on public.quick_replies for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 4. 对称已读回执(④ 决策2):水位从"只见自己"放宽为"会话双方互见"
drop policy if exists p_reads_select on public.message_reads;
create policy p_reads_select on public.message_reads for select
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (c.a = auth.uid() or c.b = auth.uid())));

-- 5. 权限图增 Support 分支:未归属且未转化的访客 ↔ Support 可通;其余一概不通
create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  sr public.user_role; rr public.user_role;
begin
  if p_sender = p_recipient or p_sender is null or p_recipient is null then return false; end if;
  select role into sr from public.profiles where id = p_sender;
  select role into rr from public.profiles where id = p_recipient;
  if sr is null or rr is null then return false; end if;
  if sr = 'admin' then return true; end if;
  if sr = 'am' then
    if rr in ('admin', 'am') then return true; end if;
    if rr = 'lead' then
      return exists (select 1 from public.leads l
                     join public.account_managers a on a.id = l.assigned_am
                     where l.profile_id = p_recipient and a.user_id = p_sender);
    end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = p_recipient and a.user_id = p_sender);
  end if;
  -- freelancer:只能主动找名下 AM
  if sr = 'user' then
    return rr = 'am' and exists (select 1 from public.profiles p
                                 join public.account_managers a on a.id = p.managed_by
                                 where p.id = p_sender and a.user_id = p_recipient);
  end if;
  -- lead:找归属顾问;或(m43)未归属未转化时找 LocalTask Support
  if sr = 'lead' then
    if p_recipient = public.support_profile_id() then
      return exists (select 1 from public.leads l
                     where l.profile_id = p_sender
                       and l.assigned_am is null and l.status <> 'converted');
    end if;
    return rr = 'am' and exists (select 1 from public.leads l
                                 join public.account_managers a on a.id = l.assigned_am
                                 where l.profile_id = p_sender and a.user_id = p_recipient);
  end if;
  return false;
end $$;

create or replace function public.line_active(p_x uuid, p_y uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  rx public.user_role; ry public.user_role;
  fl uuid; other uuid;
begin
  select role into rx from public.profiles where id = p_x;
  select role into ry from public.profiles where id = p_y;
  -- lead 线:对面 admin 恒活;对面 Support 在"未归属未转化"期间可发(m43);
  --         对面 AM 须为当前归属且未转化
  if rx = 'lead' or ry = 'lead' then
    fl := case when rx = 'lead' then p_x else p_y end;
    other := case when rx = 'lead' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    if other = public.support_profile_id() then
      return exists (select 1 from public.leads l
                     where l.profile_id = fl
                       and l.assigned_am is null and l.status <> 'converted');
    end if;
    return exists (select 1 from public.leads l
                   join public.account_managers a on a.id = l.assigned_am
                   where l.profile_id = fl and a.user_id = other and l.status <> 'converted');
  end if;
  if rx = 'user' and ry = 'user' then return false; end if;
  if rx = 'user' or ry = 'user' then
    fl := case when rx = 'user' then p_x else p_y end;
    other := case when rx = 'user' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    return exists (select 1 from public.profiles p
                   join public.account_managers a on a.id = p.managed_by
                   where p.id = fl and a.user_id = other);
  end if;
  return true;  -- am↔am / am↔admin / admin↔admin
end $$;

-- 6. lead_thread_assign 升 v2:新增 p_support —— 开线通知用「已连线 Support」模板
--    (返回签名变更需先卸旧签名;调用方 claim/admin_assign/Edge 同批升级)
drop function if exists public.lead_thread_assign(uuid, uuid, uuid, text, boolean);
create or replace function public.lead_thread_assign(
  p_lead_profile uuid, p_old_am_user uuid, p_new_am_user uuid,
  p_new_am_name text, p_with_intro boolean default false, p_support boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  la uuid; gb uuid;
  v_conv uuid; v_old_conv uuid;
begin
  if p_lead_profile is null or p_new_am_user is null then return null; end if;
  la := least(p_lead_profile, p_new_am_user);
  gb := greatest(p_lead_profile, p_new_am_user);
  insert into public.conversations (a, b) values (la, gb)
    on conflict (a, b) do nothing;
  select id into v_conv from public.conversations where a = la and b = gb;

  if p_old_am_user is not null and p_old_am_user <> p_new_am_user then
    select id into v_old_conv from public.conversations
     where a = least(p_lead_profile, p_old_am_user)
       and b = greatest(p_lead_profile, p_old_am_user);
    if v_old_conv is not null then
      update public.messages set conversation_id = v_conv
       where conversation_id = v_old_conv;
      delete from public.conversations where id = v_old_conv;  -- reads 级联清理
    end if;
  end if;

  if p_with_intro then
    insert into public.messages (conversation_id, sender_id, body, kind)
    values (v_conv, p_lead_profile, json_build_object('k', 'submitted')::text, 'system');
  end if;
  if p_support then
    insert into public.messages (conversation_id, sender_id, body, kind)
    values (v_conv, p_lead_profile, json_build_object('k', 'support')::text, 'system');
  else
    insert into public.messages (conversation_id, sender_id, body, kind)
    values (v_conv, p_lead_profile,
            json_build_object('k', 'assigned', 'am', p_new_am_name)::text, 'system');
  end if;
  update public.conversations set last_message_at = now() where id = v_conv;
  return v_conv;
end $$;

-- 7. 认领/指派兜底:线索原先无归属(在 Support 线)时,旧线主 = Support,
--    既有留言随认领原子搬进新顾问线,访客零断层
create or replace function public.claim_lead(p_lead uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_am_id();
  v_me_user uuid := auth.uid();
  v_me_name text;
  v_l public.leads%rowtype;
  v_old_user uuid;
  v_conv uuid;
begin
  if v_me is null then raise exception '仅账户经理可认领线索。'; end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status <> 'new' or v_l.first_reply_at is not null
     or (v_l.assigned_am is not null
         and v_l.assigned_at >= now() - interval '3 minutes') then
    raise exception '该线索当前不可认领(已被回复、认领未超时或状态已变更)。';
  end if;
  select a.user_id into v_old_user from public.account_managers a where a.id = v_l.assigned_am;
  v_old_user := coalesce(v_old_user, public.support_profile_id());
  select a.name into v_me_name from public.account_managers a where a.id = v_me;

  update public.leads set assigned_am = v_me, assigned_at = now() where id = p_lead;
  v_conv := public.lead_thread_assign(v_l.profile_id, v_old_user, v_me_user, v_me_name, false, false);
  return json_build_object('ok', true, 'conversation_id', v_conv);
end $$;

create or replace function public.admin_assign_lead(p_lead uuid, p_am uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_l public.leads%rowtype;
  v_new_user uuid; v_new_name text;
  v_old_user uuid;
  v_conv uuid;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception '仅管理员可强制指派线索。';
  end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status = 'converted' then raise exception '已转化线索不可改派。'; end if;
  select a.user_id, a.name into v_new_user, v_new_name
    from public.account_managers a where a.id = p_am and a.is_active;
  if not found then raise exception '目标账户经理不存在或已停用。'; end if;
  select a.user_id into v_old_user from public.account_managers a where a.id = v_l.assigned_am;
  v_old_user := coalesce(v_old_user, public.support_profile_id());

  update public.leads
     set assigned_am = p_am, assigned_at = now(), first_reply_at = null,
         status = case when status = 'lost' then 'new' else status end
   where id = p_lead;
  v_conv := public.lead_thread_assign(v_l.profile_id, v_old_user, v_new_user, v_new_name, false, false);
  return json_build_object('ok', true, 'conversation_id', v_conv);
end $$;

-- 8. 执行权:新函数最小授权(lead_thread_assign 换签名后 ACL 重置,须重授)
revoke execute on function public.support_profile_id() from public, anon;
grant  execute on function public.support_profile_id() to authenticated, service_role;
revoke execute on function public.lead_thread_assign(uuid, uuid, uuid, text, boolean, boolean) from public, anon, authenticated;
grant  execute on function public.lead_thread_assign(uuid, uuid, uuid, text, boolean, boolean) to service_role;



-- ================================================================
-- m44 合并块:重装备批(聊天附件 · 自动回复 · kind 三态 · send_message v2)
-- ================================================================
-- 1. 消息附件四列(⑦):图片/PDF ≤10MB;纯附件消息允许正文为空
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size integer;

-- 正文约束改造:有附件时正文可空(仍 ≤4000);无附件时保持 1..4000
alter table public.messages drop constraint if exists msg_len;
alter table public.messages drop constraint if exists msg_body_or_att;
alter table public.messages add constraint msg_body_or_att check (
  (char_length(body) between 1 and 4000)
  or (attachment_path is not null and char_length(body) <= 4000)
);
-- 附件形状:四列同生同灭;类型二选一;大小 1B..10MB(10485760)
alter table public.messages drop constraint if exists msg_att_shape;
alter table public.messages add constraint msg_att_shape check (
  (attachment_path is null and attachment_name is null
   and attachment_type is null and attachment_size is null)
  or (attachment_path is not null and attachment_name is not null
      and attachment_type in ('image', 'file')
      and attachment_size between 1 and 10485760)
);

-- 消息类型扩为三态:user=人写 / system=系统通知 / auto=自动回复(⑧)
alter table public.messages drop constraint if exists msg_kind_check;
alter table public.messages add constraint msg_kind_check
  check (kind in ('user', 'system', 'auto'));

-- 2. 聊天附件桶(私有) + 存储策略:路径 {conversation_id}/{uid}/{file}
--    上传=会话参与者 且 本人目录 且 线仍可发(line_active 进策略:只读线连传都不行);
--    读取=会话参与者;admin 全桶只读(督查)。
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do update set public = false;
exception when others then
  raise notice '[跳过] 桶写入被拦 — 桶已存在且为 private,无需处理。原始报错: %', sqlerrm;
end $$;

-- line_active 进存储策略,须回授 authenticated 执行权(同 m29 对 task_owned_by_am 的先例)
grant execute on function public.line_active(uuid, uuid) to authenticated;

drop policy if exists st_chat_insert on storage.objects;
create policy st_chat_insert on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.a = auth.uid() or c.b = auth.uid())
        and public.line_active(c.a, c.b)
    )
  );
drop policy if exists st_chat_select on storage.objects;
create policy st_chat_select on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.a = auth.uid() or c.b = auth.uid())
    )
  );
drop policy if exists st_chat_admin_sel on storage.objects;
create policy st_chat_admin_sel on storage.objects for select
  using (bucket_id = 'chat-attachments' and public.is_admin());

-- 3. send_message 升 v2(⑦):支持纯附件消息;附件路径强校验(必须是本会话+本人目录);
--    有正文才过脏话拦截;换签名须先卸旧 2 参版(避免 PostgREST 重载歧义)
drop function if exists public.send_message(uuid, text);
create or replace function public.send_message(
  p_conversation uuid, p_body text,
  p_att_path text default null, p_att_name text default null,
  p_att_type text default null, p_att_size integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.conversations%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_hit text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if char_length(v_body) < 1 and p_att_path is null then raise exception 'Empty message.'; end if;
  if char_length(v_body) > 4000 then raise exception 'Message too long (max 4000 characters).'; end if;
  select * into c from public.conversations where id = p_conversation;
  if not found or (c.a <> v_uid and c.b <> v_uid) then
    raise exception 'Conversation not found.';
  end if;
  if not public.line_active(c.a, c.b) then
    raise exception 'This conversation is read-only.';
  end if;
  if p_att_path is not null then
    -- 附件铁门:只认 本会话/本人 目录下的路径,防挂接他人文件
    if position(p_conversation::text || '/' || v_uid::text || '/' in p_att_path) <> 1 then
      raise exception 'Invalid attachment path.';
    end if;
    if p_att_type not in ('image', 'file') or coalesce(p_att_size, 0) not between 1 and 10485760
       or coalesce(btrim(p_att_name), '') = '' then
      raise exception 'Invalid attachment.';
    end if;
  end if;
  if char_length(v_body) >= 1 then
    select word into v_hit from public.banned_words
     where position(lower(word) in lower(v_body)) > 0 limit 1;
    if v_hit is not null then
      -- 拦截不抛异常:异常会回滚违规记录;改为落盘后返回状态,前端据此提示
      insert into public.message_violations (user_id, conversation_id, attempted_body, matched_word)
      values (v_uid, p_conversation, left(v_body, 500), v_hit);
      return json_build_object('ok', false, 'error', 'civility');
    end if;
  end if;
  insert into public.messages
    (conversation_id, sender_id, body, attachment_path, attachment_name, attachment_type, attachment_size)
  values
    (p_conversation, v_uid, v_body, p_att_path, p_att_name, p_att_type, p_att_size)
  returning id into v_id;
  update public.conversations set last_message_at = now() where id = p_conversation;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- 4. 自动回复(⑧):AM 自设开关与文案;仅当 AM 离线(心跳超 2 分钟)时代答;
--    每会话 60 分钟至多一次;kind='auto' → 不计首答(lead_first_reply 只认 user)、
--    不触发自身(递归天然中断);仅回应 客户侧(freelancer/lead) 的来信。
alter table public.profiles add column if not exists auto_reply_enabled boolean not null default false;
alter table public.profiles add column if not exists auto_reply_text text
  constraint auto_reply_len check (auto_reply_text is null or char_length(auto_reply_text) between 1 and 1000);

create or replace function public.am_set_auto_reply(p_on boolean, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if p_on and v_text is null then
    raise exception '开启自动回复前请先写好回复文案。';
  end if;
  update public.profiles
     set auto_reply_enabled = p_on, auto_reply_text = v_text
   where id = auth.uid() and role = 'am';
  if not found then raise exception '仅账户经理可设置自动回复。'; end if;
end $$;

create or replace function public.chat_auto_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sr public.user_role;
  c public.conversations%rowtype;
  v_other uuid;
  v_enabled boolean; v_text text; v_seen timestamptz;
begin
  if new.kind is distinct from 'user' then return new; end if;      -- 自动/系统不触发
  select role into sr from public.profiles where id = new.sender_id;
  if sr not in ('user', 'lead') then return new; end if;            -- 仅客户来信触发
  select * into c from public.conversations where id = new.conversation_id;
  if not found then return new; end if;
  v_other := case when c.a = new.sender_id then c.b else c.a end;
  select p.auto_reply_enabled, p.auto_reply_text, p.last_seen_at
    into v_enabled, v_text, v_seen
    from public.profiles p
    join public.account_managers a on a.user_id = p.id               -- 仅真 AM(排除 Support 档)
   where p.id = v_other;
  if not found or v_enabled is not true or v_text is null then return new; end if;
  if v_seen is not null and v_seen > now() - interval '2 minutes' then
    return new;                                                      -- 人在线,不抢话
  end if;
  if exists (select 1 from public.messages m
             where m.conversation_id = new.conversation_id
               and m.sender_id = v_other and m.kind = 'auto'
               and m.created_at > now() - interval '60 minutes') then
    return new;                                                      -- 每会话 60 分钟一次
  end if;
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (new.conversation_id, v_other, v_text, 'auto');
  update public.conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_chat_auto_reply on public.messages;
create trigger trg_chat_auto_reply after insert on public.messages
  for each row execute function public.chat_auto_reply();

-- 5. 执行权:换签名/新函数重授(m28 纪律)
revoke execute on function public.send_message(uuid, text, text, text, text, integer) from public, anon;
grant  execute on function public.send_message(uuid, text, text, text, text, integer) to authenticated, service_role;
revoke execute on function public.am_set_auto_reply(boolean, text) from public, anon;
grant  execute on function public.am_set_auto_reply(boolean, text) to authenticated, service_role;
revoke execute on function public.chat_auto_reply() from public, anon, authenticated;



-- ================================================================
-- m45 合并块:线索邮箱列
-- ================================================================
-- 1. 线索邮箱(v68 ③):/join 表单必填收集,用于后续"AM 上线回复邮件提醒"(提醒功能另批)
--    列可空以兼容存量行;新提交由 Edge 强制必填+格式校验,库侧兜底同形约束
alter table public.leads add column if not exists email text
  constraint lead_email_shape check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
create index if not exists idx_leads_email on public.leads (lower(email));



-- ================================================================
-- m46 合并块:消息增强批(会话/名录挂邮箱 · 个人贴纸库)
-- ================================================================
-- 1. 会话列表 v2(② 搜索与邮箱展示):新增 other_email —— freelancer/员工取 profiles.email,
--    访客取 leads.email(v68 收集);json 返回,加列不换签名,执行权原样保留
create or replace function public.list_conversations()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.id,
      case when c.a = auth.uid() then c.b else c.a end                          as other_id,
      op.display_name                                                          as other_name,
      op.role                                                                  as other_role,
      case when op.role = 'lead'
           then (select le.email from public.leads le where le.profile_id = op.id)
           else op.email end                                                   as other_email,
      c.last_message_at,
      (select body from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_body,
      (select count(*) from public.messages m where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz))::int     as unread,
      public.line_active(c.a, c.b)                                             as active
    from public.conversations c
    join public.profiles op on op.id = case when c.a = auth.uid() then c.b else c.a end
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    where c.a = auth.uid() or c.b = auth.uid()
    order by c.last_message_at desc
  ) x
$$;

-- 2. 名录 v2:员工视角的 freelancer/lead 条目挂 email(搜索与展示同源);
--    员工互见与访客/自由职业者视角不挂(无业务必要,少暴露少风险)
create or replace function public.message_targets()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'lead' then
    return (select coalesce(json_agg(json_build_object(
      'id', a.user_id, 'name', a.name, 'role', 'am')), '[]'::json)
      from public.leads l join public.account_managers a on a.id = l.assigned_am
      where l.profile_id = v_uid and a.user_id is not null);
  elsif v_role = 'user' then
    return (select coalesce(json_agg(json_build_object(
      'id', a.user_id, 'name', a.name, 'role', 'am')), '[]'::json)
      from public.profiles p join public.account_managers a on a.id = p.managed_by
      where p.id = v_uid and a.user_id is not null);
  elsif v_role = 'am' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, p.display_name as name, 'freelancer' as role, p.email
        from public.profiles p
        join public.account_managers me on me.user_id = v_uid
        where p.managed_by = me.id and p.role = 'user'
      union all
      select l.profile_id, l.full_name, 'lead', l.email
        from public.leads l
        join public.account_managers me2 on me2.user_id = v_uid
        where l.assigned_am = me2.id and l.profile_id is not null and l.status <> 'converted'
      union all
      select a.user_id, a.name, 'am', null::text from public.account_managers a
        where a.is_active and a.user_id is not null and a.user_id <> v_uid
      union all
      select p.id, coalesce(p.display_name, 'Admin'), 'admin', null::text from public.profiles p
        where p.role = 'admin'
      order by role, name
    ) t);
  elsif v_role = 'admin' then
    return (select coalesce(json_agg(t), '[]'::json) from (
      select p.id, coalesce(p.display_name, p.full_name, left(p.id::text, 8)) as name,
        case p.role when 'user' then 'freelancer' else p.role::text end as role,
        case when p.role = 'lead'
             then (select le.email from public.leads le where le.profile_id = p.id)
             else p.email end as email
      from public.profiles p where p.id <> v_uid
      order by role, name
    ) t);
  end if;
  return '[]'::json;
end $$;

-- 3. 个人贴纸库(③,仅员工):私有桶 chat-stickers,路径 {uid}/{file};
--    桶级硬限制:单张 ≤2MB、仅图片四型(服务端强制,非仅前端);
--    读取严格仅本人(admin 亦不可窥,与快捷话术同款纪律);上传/删除须员工身份。
--    发送时前端将贴纸复制为普通图片附件走 v64 全链,消息侧零新面。
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('chat-stickers', 'chat-stickers', false, 2097152,
          array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do update
    set public = false, file_size_limit = 2097152,
        allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
exception when others then
  raise notice '[跳过] 贴纸桶写入被拦:%', sqlerrm;
end $$;

drop policy if exists st_sticker_ins on storage.objects;
create policy st_sticker_ins on storage.objects for insert
  with check (
    bucket_id = 'chat-stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_admin() or public.is_am())
  );
drop policy if exists st_sticker_sel on storage.objects;
create policy st_sticker_sel on storage.objects for select
  using (bucket_id = 'chat-stickers'
         and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists st_sticker_del on storage.objects;
create policy st_sticker_del on storage.objects for delete
  using (bucket_id = 'chat-stickers'
         and (storage.foldername(name))[1] = auth.uid()::text
         and (public.is_admin() or public.is_am()));





-- ================================================================
-- m47 合并块:渠道与邀请码(source · 一客一码 · 邮箱回填 · last_message_id · 头像基建)
-- ================================================================
-- 1. 线索来源维度(渠道分账):join=落地页 / whatsapp=广告表单邀请
alter table public.leads add column if not exists source text not null default 'join'
  constraint lead_source_chk check (source in ('join', 'whatsapp'));
create index if not exists idx_leads_source on public.leads (source);

-- WA 邀请生成时尚无客户号码 → wa 允许为空,但仅限 whatsapp 来源;join 保持必填+E.164
alter table public.leads alter column wa_e164 drop not null;
alter table public.leads drop constraint if exists lead_wa_shape;
alter table public.leads add constraint lead_wa_shape check (
  (wa_e164 is null and source = 'whatsapp')
  or (wa_e164 is not null and wa_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

-- 2. 一客一码邀请(决策1A):生成即有主、生而 contacted(认领池只收 new,天然进不去);
--    备注即占位名,转化后前端换真人;销毁仅限未转化(本人或 admin)
create or replace function public.am_create_invite(p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_am_id();
  v_note text := btrim(coalesce(p_note, ''));
  v_id uuid; v_tok uuid;
begin
  if v_me is null then raise exception '仅账户经理可生成邀请。'; end if;
  if char_length(v_note) < 1 or char_length(v_note) > 60 then
    raise exception '请填写 1–60 字的客户备注。';
  end if;
  insert into public.leads (full_name, wa_e164, source, status, assigned_am, assigned_at)
  values (v_note, null, 'whatsapp', 'contacted', v_me, now())
  returning id, ref_token into v_id, v_tok;
  return json_build_object('ok', true, 'id', v_id, 'ref_token', v_tok);
end $$;

create or replace function public.am_destroy_invite(p_lead uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_l public.leads%rowtype;
begin
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '邀请不存在。'; end if;
  if v_l.source <> 'whatsapp' then raise exception '仅 WhatsApp 邀请可销毁。'; end if;
  if v_l.status = 'converted' then raise exception '已转化的邀请不可销毁。'; end if;
  if not (public.is_admin() or v_l.assigned_am = public.current_am_id()) then
    raise exception '只能销毁自己生成的邀请。';
  end if;
  delete from public.leads where id = p_lead;
  return json_build_object('ok', true);
end $$;

revoke execute on function public.am_create_invite(text) from public, anon;
grant  execute on function public.am_create_invite(text) to authenticated, service_role;
revoke execute on function public.am_destroy_invite(uuid) from public, anon;
grant  execute on function public.am_destroy_invite(uuid) to authenticated, service_role;

-- 3. 转化时回填注册邮箱(WA 邀请与 join 线索通用;handle_new_user 整函数重写)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'user';
  v_code text;
  v_ref  uuid;
  v_lead public.leads%rowtype;
begin
  -- m42:匿名会话(访客线索)→ 建 lead 档;跳过邮箱域名检查与员工码逻辑
  if new.email is null or btrim(new.email::text) = '' then
    insert into public.profiles (id, role)
    values (new.id, 'lead')
    on conflict (id) do nothing;
    return new;
  end if;

  if not public.email_domain_allowed(new.email::text) then
    raise exception 'Disposable email domains are not allowed. Please sign up with a real inbox.';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'staff_code', '') <> '' then
    select value into v_code from public.app_settings where key = 'staff_invite_code';
    if v_code is not null and new.raw_user_meta_data ->> 'staff_code' = v_code then
      v_role := 'pending';
    end if;
  end if;
  insert into public.profiles (id, display_name, role, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', v_role, new.email)
  on conflict (id) do nothing;

  -- m42:专属注册链接携带 lead_ref → 线索转化 + 归属绑定(跨设备生效)
  begin
    v_ref := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'lead_ref', '')), '')::uuid;
  exception when others then
    v_ref := null;
  end;
  if v_ref is not null and v_role = 'user' then
    select * into v_lead from public.leads
     where ref_token = v_ref and status <> 'converted';
    if found then
      update public.leads
         set status = 'converted', converted_profile = new.id, converted_at = now(),
             email = coalesce(nullif(btrim(new.email::text), ''), email)  -- m47:注册邮箱回填
       where id = v_lead.id;
      if v_lead.assigned_am is not null then
        update public.profiles set managed_by = v_lead.assigned_am where id = new.id;
      end if;
    end if;
  end if;

  return new;
end $$;

-- 4. 会话列表 v3:补 last_message_id(左栏最后一句走翻译缓存;json 加列不换签名)
create or replace function public.list_conversations()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.id,
      case when c.a = auth.uid() then c.b else c.a end                          as other_id,
      op.display_name                                                          as other_name,
      op.role                                                                  as other_role,
      case when op.role = 'lead'
           then (select le.email from public.leads le where le.profile_id = op.id)
           else op.email end                                                   as other_email,
      c.last_message_at,
      (select id from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_message_id,
      (select body from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_body,
      (select count(*) from public.messages m where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz))::int     as unread,
      public.line_active(c.a, c.b)                                             as active
    from public.conversations c
    join public.profiles op on op.id = case when c.a = auth.uid() then c.b else c.a end
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    where c.a = auth.uid() or c.b = auth.uid()
    order by c.last_message_at desc
  ) x
$$;

-- 5. 头像基建(A2):v0 遗产未随 v1 重建,本批补齐。
--    公开桶 avatars(≤2MB·JPG/PNG/WebP,桶级硬限);本人目录可传/改/删;
--    公开读走 public URL(头像低敏,免签名 URL 抖动);profiles.avatar_url 本人可改
--    (protect_profiles 黑白名单均不含此列,自更新天然放行)。
alter table public.profiles add column if not exists avatar_url text;
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 2097152,
        allowed_mime_types = array['image/jpeg','image/png','image/webp'];
exception when others then
  raise notice '[跳过] 头像桶写入被拦:%', sqlerrm;
end $$;
drop policy if exists st_avatar_ins on storage.objects;
create policy st_avatar_ins on storage.objects for insert
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists st_avatar_upd on storage.objects;
create policy st_avatar_upd on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists st_avatar_del on storage.objects;
create policy st_avatar_del on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);




-- ================================================================
-- m48 合并块:消息体验批Ⅲ(偏好三件 · 撤回 · 列表 v4 · 静音红点 · KYC 收编)
-- ================================================================
-- 1. 会话偏好(⑥ 置顶/静音/标记未读):一人一会话一行,严格仅本人
create table if not exists public.conversation_prefs (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  pinned_at       timestamptz,
  muted           boolean not null default false,
  manual_unread   boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
drop trigger if exists trg_cprefs_touch on public.conversation_prefs;
create trigger trg_cprefs_touch before update on public.conversation_prefs
  for each row execute function public.touch_updated_at();
alter table public.conversation_prefs enable row level security;
drop policy if exists p_cprefs_own on public.conversation_prefs;
create policy p_cprefs_own on public.conversation_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. 撤回(⑦ 决策5:仅 AM/AD 撤自己的,无时限):正文与附件清空,留占位标
alter table public.messages add column if not exists recalled_at timestamptz;
alter table public.messages drop constraint if exists msg_body_or_att;
alter table public.messages add constraint msg_body_or_att check (
  (recalled_at is not null)
  or (char_length(body) between 1 and 4000)
  or (attachment_path is not null and char_length(body) <= 4000)
);

-- 生产漂移防雷:平行开发时代残留过异返回类型的同名函数(42P13),先卸再建(新库无害)
drop function if exists public.recall_message(uuid);
create or replace function public.recall_message(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  m public.messages%rowtype;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role not in ('am', 'admin') then
    raise exception '仅员工可撤回消息。';
  end if;
  select * into m from public.messages where id = p_id for update;
  if not found then raise exception '消息不存在。'; end if;
  if m.sender_id <> v_uid then raise exception '只能撤回自己发送的消息。'; end if;
  if m.kind = 'system' then raise exception '系统通知不可撤回。'; end if;
  if m.recalled_at is not null then return json_build_object('ok', true); end if;
  update public.messages
     set body = '', attachment_path = null, attachment_name = null,
         attachment_type = null, attachment_size = null, recalled_at = now()
   where id = p_id;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.recall_message(uuid) from public, anon;
grant  execute on function public.recall_message(uuid) to authenticated, service_role;

-- 3. 会话列表 v4:偏好三列 + 对方头像 + 末条撤回/附件标;置顶优先排序
create or replace function public.list_conversations()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json) from (
    select c.id,
      case when c.a = auth.uid() then c.b else c.a end                          as other_id,
      op.display_name                                                          as other_name,
      op.avatar_url                                                            as other_avatar,
      op.role                                                                  as other_role,
      case when op.role = 'lead'
           then (select le.email from public.leads le where le.profile_id = op.id)
           else op.email end                                                   as other_email,
      c.last_message_at,
      (select id from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_message_id,
      (select body from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_body,
      (select m.recalled_at is not null from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_recalled,
      (select m.attachment_path is not null from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc limit 1)                                    as last_att,
      (select count(*) from public.messages m where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz))::int     as unread,
      pf.pinned_at, coalesce(pf.muted, false)                                  as muted,
      coalesce(pf.manual_unread, false)                                        as manual_unread,
      public.line_active(c.a, c.b)                                             as active
    from public.conversations c
    join public.profiles op on op.id = case when c.a = auth.uid() then c.b else c.a end
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    left join public.conversation_prefs pf
      on pf.conversation_id = c.id and pf.user_id = auth.uid()
    where c.a = auth.uid() or c.b = auth.uid()
    order by (pf.pinned_at is not null) desc, pf.pinned_at desc nulls last,
             c.last_message_at desc
  ) x
$$;

-- 4. 全局未读 v2:静音会话不计入导航红点(行内角标照常)
create or replace function public.unread_total()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(cnt), 0)::int from (
    select (select count(*) from public.messages m
            where m.conversation_id = c.id and m.sender_id <> auth.uid()
              and m.created_at > coalesce(r.read_at, 'epoch'::timestamptz)) as cnt
    from public.conversations c
    left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
    left join public.conversation_prefs pf
      on pf.conversation_id = c.id and pf.user_id = auth.uid()
    where (c.a = auth.uid() or c.b = auth.uid())
      and not coalesce(pf.muted, false)
  ) x
$$;

-- 5. mark_read v2:入场即清「手动未读」标
create or replace function public.mark_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.message_reads (conversation_id, user_id, read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set read_at = now();
  update public.conversation_prefs
     set manual_unread = false
   where user_id = auth.uid() and conversation_id = p_conversation
     and manual_unread;
end $$;

-- 6. KYC 审核收编(A1,三护栏:仅无主/仅转为 verified 这一刻/仅 AM 审核):
--    zzz 命名令其在守卫触发器之后执行,补写归属不再过守卫
create or replace function public.kyc_adopt()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_am uuid;
begin
  if new.kyc_status = 'verified'
     and old.kyc_status is distinct from 'verified'
     and new.managed_by is null then
    v_am := public.current_am_id();
    if v_am is not null then
      new.managed_by := v_am;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_zzz_kyc_adopt on public.profiles;
create trigger trg_zzz_kyc_adopt before update of kyc_status on public.profiles
  for each row execute function public.kyc_adopt();




-- ================================================================
-- m49 合并块:安全体检微批(kyc_adopt 直调权收回;生产幽灵加固在迁移侧条件执行)
-- ================================================================
-- 主线共用段:收回 kyc_adopt 触发器函数直调权(m48 新建时未收,默认 PUBLIC)
revoke execute on function public.kyc_adopt() from public, anon, authenticated;




-- ================================================================
-- m50 合并块:Performance 清零(策略包壳 · 外键索引 · 漂移清扫器)
-- ================================================================
-- 1. 策略壳(qual/with_check 逐条重设,表达式仅 auth.uid() 包壳,余字不动)
alter policy p_am_select on public.account_managers using (((select auth.uid()) IS NOT NULL));
alter policy p_am_self_upd on public.account_managers using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy p_rec_user_sel on public.account_records using ((freelancer_id = (select auth.uid())));
alter policy p_grants_select on public.bonus_grants using (((user_id = (select auth.uid())) OR is_admin() OR is_am()));
alter policy p_checkins_select on public.checkins using (((user_id = (select auth.uid())) OR is_admin() OR is_am()));
alter policy p_rates_read on public.commission_rates using (((select auth.uid()) IS NOT NULL));
alter policy p_cprefs_own on public.conversation_prefs using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy p_conv_select on public.conversations using (((a = (select auth.uid())) OR (b = (select auth.uid()))));
alter policy p_crm_owner on public.crm_notes using ((owner_id = (select auth.uid()))) with check ((owner_id = (select auth.uid())));
alter policy p_kyc_doc_insert on public.kyc_documents with check ((user_id = (select auth.uid())));
alter policy p_kyc_doc_select on public.kyc_documents using (((user_id = (select auth.uid())) OR is_admin()));
alter policy p_ssn_insert on public.kyc_ssn with check ((user_id = (select auth.uid())));
alter policy p_ssn_select on public.kyc_ssn using (((user_id = (select auth.uid())) OR is_admin() OR is_am()));
alter policy p_ssn_update on public.kyc_ssn using (((user_id = (select auth.uid())) OR is_admin())) with check (((user_id = (select auth.uid())) OR is_admin()));
alter policy p_kyc_sub_insert on public.kyc_submissions with check ((user_id = (select auth.uid())));
alter policy p_kyc_sub_select on public.kyc_submissions using (((user_id = (select auth.uid())) OR is_admin()));
alter policy p_leads_self_sel on public.leads using ((profile_id = (select auth.uid())));
alter policy p_reads_select on public.message_reads using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = message_reads.conversation_id) AND ((c.a = (select auth.uid())) OR (c.b = (select auth.uid())))))));
alter policy p_msgs_select on public.messages using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.a = (select auth.uid())) OR (c.b = (select auth.uid())))))));
alter policy p_pm_self on public.payout_methods using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy p_payout_select on public.payout_requests using (((user_id = (select auth.uid())) OR is_admin() OR (is_am() AND (am_id = current_am_id()))));
alter policy p_pcr_select on public.profile_change_requests using (((user_id = (select auth.uid())) OR is_admin() OR (is_am() AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = profile_change_requests.user_id) AND (p.managed_by = current_am_id())))))));
alter policy p_profiles_select on public.profiles using (((id = (select auth.uid())) OR is_admin()));
alter policy p_profiles_update on public.profiles using (((id = (select auth.uid())) OR is_admin() OR (is_am() AND (role = 'user'::user_role))));
alter policy p_qr_owner on public.quick_replies using ((owner_id = (select auth.uid()))) with check ((owner_id = (select auth.uid())));
alter policy p_offers_select on public.task_offers using (((freelancer_id = (select auth.uid())) OR is_admin()));
alter policy p_subs_insert on public.task_submissions with check (((freelancer_id = (select auth.uid())) OR is_admin()));
alter policy p_subs_select on public.task_submissions using (((freelancer_id = (select auth.uid())) OR is_admin()));
alter policy p_tasks_select on public.tasks using ((is_admin() OR (assigned_freelancer = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM task_offers o
  WHERE ((o.task_id = tasks.id) AND (o.freelancer_id = (select auth.uid())))))));
alter policy st_avatar_del on storage.objects using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_avatar_ins on storage.objects with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_avatar_upd on storage.objects using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text))) with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_briefs_select on storage.objects using (((bucket_id = 'task-attachments'::text) AND ((storage.foldername(name))[1] = 'briefs'::text) AND (EXISTS ( SELECT 1
   FROM tasks t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[2]) AND ((t.assigned_freelancer = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM task_offers o
          WHERE ((o.task_id = t.id) AND (o.freelancer_id = (select auth.uid())))))))))));
alter policy st_chat_insert on storage.objects with check (((bucket_id = 'chat-attachments'::text) AND ((storage.foldername(name))[2] = ((select auth.uid()))::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.a = (select auth.uid())) OR (c.b = (select auth.uid()))) AND line_active(c.a, c.b))))));
alter policy st_chat_select on storage.objects using (((bucket_id = 'chat-attachments'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.a = (select auth.uid())) OR (c.b = (select auth.uid()))))))));
alter policy st_kyc_insert on storage.objects with check (((bucket_id = 'kyc-documents'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_kyc_select on storage.objects using (((bucket_id = 'kyc-documents'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_sticker_del on storage.objects using (((bucket_id = 'chat-stickers'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (is_admin() OR is_am())));
alter policy st_sticker_ins on storage.objects with check (((bucket_id = 'chat-stickers'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (is_admin() OR is_am())));
alter policy st_sticker_sel on storage.objects using (((bucket_id = 'chat-stickers'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy st_submission_insert on storage.objects with check (((bucket_id = 'task-attachments'::text) AND ((storage.foldername(name))[1] = 'submissions'::text) AND ((storage.foldername(name))[3] = ((select auth.uid()))::text) AND (EXISTS ( SELECT 1
   FROM tasks t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[2]) AND (t.assigned_freelancer = (select auth.uid())))))));
alter policy st_submission_select on storage.objects using (((bucket_id = 'task-attachments'::text) AND ((storage.foldername(name))[1] = 'submissions'::text) AND ((storage.foldername(name))[3] = ((select auth.uid()))::text)));

-- 2. 外键索引
create index if not exists idx_kyc_submissions_user_id on public.kyc_submissions (user_id);
create index if not exists idx_kyc_submissions_reviewed_by on public.kyc_submissions (reviewed_by);
create index if not exists idx_kyc_documents_user_id on public.kyc_documents (user_id);
create index if not exists idx_kyc_documents_submission_id on public.kyc_documents (submission_id);
create index if not exists idx_blacklist_banned_user_id on public.blacklist (banned_user_id);
create index if not exists idx_blacklist_created_by on public.blacklist (created_by);
create index if not exists idx_account_managers_created_by on public.account_managers (created_by);
create index if not exists idx_tasks_created_by on public.tasks (created_by);
create index if not exists idx_tasks_paid_marked_by on public.tasks (paid_marked_by);
create index if not exists idx_task_offers_created_by on public.task_offers (created_by);
create index if not exists idx_task_submissions_freelancer_id on public.task_submissions (freelancer_id);
create index if not exists idx_task_submissions_reviewed_by on public.task_submissions (reviewed_by);
create index if not exists idx_freelancer_companies_created_by on public.freelancer_companies (created_by);
create index if not exists idx_platform_acceptances_task_id on public.platform_acceptances (task_id);
create index if not exists idx_platform_acceptances_am_id on public.platform_acceptances (am_id);
create index if not exists idx_platform_acceptances_decided_by on public.platform_acceptances (decided_by);
create index if not exists idx_platform_acceptances_reopened_by on public.platform_acceptances (reopened_by);
create index if not exists idx_am_wallet_ledger_freelancer_id on public.am_wallet_ledger (freelancer_id);
create index if not exists idx_am_wallet_ledger_created_by on public.am_wallet_ledger (created_by);
create index if not exists idx_account_records_created_by on public.account_records (created_by);
create index if not exists idx_tasks_rate_item_id on public.tasks (rate_item_id);
create index if not exists idx_checkins_confirmed_by on public.checkins (confirmed_by);
create index if not exists idx_profile_change_requests_reviewed_by on public.profile_change_requests (reviewed_by);
create index if not exists idx_am_transfers_from_am on public.am_transfers (from_am);
create index if not exists idx_am_transfers_to_am on public.am_transfers (to_am);
create index if not exists idx_am_transfers_decided_by on public.am_transfers (decided_by);
create index if not exists idx_conversations_b on public.conversations (b);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_message_reads_user_id on public.message_reads (user_id);
create index if not exists idx_message_violations_user_id on public.message_violations (user_id);
create index if not exists idx_message_violations_conversation_id on public.message_violations (conversation_id);
create index if not exists idx_todos_created_by on public.todos (created_by);
create index if not exists idx_todos_completed_by on public.todos (completed_by);
create index if not exists idx_payout_requests_decided_by on public.payout_requests (decided_by);
create index if not exists idx_leads_converted_profile on public.leads (converted_profile);
create index if not exists idx_conversation_prefs_conversation_id on public.conversation_prefs (conversation_id);

-- 3. 通用清扫器(漂移免疫):任何仍含裸 auth.uid() 的策略与仍未覆盖的外键,
--    运行时逐个补齐(含生产专属遗留对象与未来漂移;主线世界为无害空转)
do $$
declare r record; nq text; nc text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
      and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'
  loop
    nq := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    nc := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    execute 'alter policy ' || quote_ident(r.policyname)
         || ' on ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename)
         || coalesce(' using (' || nq || ')', '')
         || coalesce(' with check (' || nc || ')', '');
    raise notice '[包壳] %.%', r.tablename, r.policyname;
  end loop;
  for r in
    select c.conrelid::regclass::text as t, a.attname as col
    from pg_constraint c
    join unnest(c.conkey) with ordinality k(attnum, ord) on ord = 1
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i
                      where i.indrelid = c.conrelid and i.indkey[0] = k.attnum)
  loop
    execute format('create index if not exists %I on public.%I (%I)',
                   'idx_' || r.t || '_' || r.col, r.t, r.col);
    raise notice '[补索引] %.%', r.t, r.col;
  end loop;
end $$;




-- ================================================================
-- m51 合并块:聊天权限图 v3(AM 主动面 = 名下 + 无主)
-- ================================================================
-- 1. 聊天权限图 v3(决策A):AM 主动面 = 名下 + 无主;线活性同步。
--    整函数重写(json/boolean 同签名,执行权原样保留)。

create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  sr public.user_role; rr public.user_role;
begin
  if p_sender = p_recipient or p_sender is null or p_recipient is null then return false; end if;
  select role into sr from public.profiles where id = p_sender;
  select role into rr from public.profiles where id = p_recipient;
  if sr is null or rr is null then return false; end if;
  if sr = 'admin' then return true; end if;
  if sr = 'am' then
    if rr in ('admin', 'am') then return true; end if;
    if rr = 'lead' then
      return exists (select 1 from public.leads l
                     join public.account_managers a on a.id = l.assigned_am
                     where l.profile_id = p_recipient and a.user_id = p_sender);
    end if;
    -- m51:AM 可主动找「名下 + 无主」freelancer(与 KYC 审核范围同构;他人名下仍拒)
    return exists (select 1 from public.profiles p
                   where p.id = p_recipient and p.role = 'user'
                     and (p.managed_by is null
                          or exists (select 1 from public.account_managers a
                                     where a.id = p.managed_by and a.user_id = p_sender)));
  end if;
  -- freelancer:只能主动找名下 AM
  if sr = 'user' then
    return rr = 'am' and exists (select 1 from public.profiles p
                                 join public.account_managers a on a.id = p.managed_by
                                 where p.id = p_sender and a.user_id = p_recipient);
  end if;
  -- lead:找归属顾问;或(m43)未归属未转化时找 LocalTask Support
  if sr = 'lead' then
    if p_recipient = public.support_profile_id() then
      return exists (select 1 from public.leads l
                     where l.profile_id = p_sender
                       and l.assigned_am is null and l.status <> 'converted');
    end if;
    return rr = 'am' and exists (select 1 from public.leads l
                                 join public.account_managers a on a.id = l.assigned_am
                                 where l.profile_id = p_sender and a.user_id = p_recipient);
  end if;
  return false;
end $$;

create or replace function public.line_active(p_x uuid, p_y uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  rx public.user_role; ry public.user_role;
  fl uuid; other uuid;
begin
  select role into rx from public.profiles where id = p_x;
  select role into ry from public.profiles where id = p_y;
  -- lead 线:对面 admin 恒活;对面 Support 在"未归属未转化"期间可发(m43);
  --         对面 AM 须为当前归属且未转化
  if rx = 'lead' or ry = 'lead' then
    fl := case when rx = 'lead' then p_x else p_y end;
    other := case when rx = 'lead' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    if other = public.support_profile_id() then
      return exists (select 1 from public.leads l
                     where l.profile_id = fl
                       and l.assigned_am is null and l.status <> 'converted');
    end if;
    return exists (select 1 from public.leads l
                   join public.account_managers a on a.id = l.assigned_am
                   where l.profile_id = fl and a.user_id = other and l.status <> 'converted');
  end if;
  if rx = 'user' and ry = 'user' then return false; end if;
  if rx = 'user' or ry = 'user' then
    fl := case when rx = 'user' then p_x else p_y end;
    other := case when rx = 'user' then p_y else p_x end;
    if (select role from public.profiles where id = other) = 'admin' then return true; end if;
    -- m51:无主期间线保持可发;被他人认领后自动只读(既有换归属语义)
    return exists (select 1 from public.profiles p
                   where p.id = fl
                     and (p.managed_by is null
                          or exists (select 1 from public.account_managers a
                                     where a.id = p.managed_by and a.user_id = other)));
  end if;
  return true;  -- am↔am / am↔admin / admin↔admin
end $$;





-- ================================================================
-- m52 合并块:注册即线索(source signup · 自然注册入池 · 认领即收编开线)
-- ================================================================
-- 1. 线索来源扩容:注册直入(signup)
alter table public.leads drop constraint if exists lead_source_chk;
alter table public.leads add constraint lead_source_chk
  check (source in ('join', 'whatsapp', 'signup'));

-- 1b. 号码形状约束扩容:signup 与 whatsapp 同享"可空"(有号仍须 E.164)
alter table public.leads drop constraint if exists lead_wa_shape;
alter table public.leads add constraint lead_wa_shape
  check ((wa_e164 is null and source in ('whatsapp', 'signup'))
      or (wa_e164 is not null and wa_e164 ~ '^\+[1-9][0-9]{6,14}$'));

-- 2. 自然注册入池(handle_new_user 整函数重写)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'user';
  v_code text;
  v_ref  uuid;
  v_lead public.leads%rowtype;
begin
  -- m42:匿名会话(访客线索)→ 建 lead 档;跳过邮箱域名检查与员工码逻辑
  if new.email is null or btrim(new.email::text) = '' then
    insert into public.profiles (id, role)
    values (new.id, 'lead')
    on conflict (id) do nothing;
    return new;
  end if;

  if not public.email_domain_allowed(new.email::text) then
    raise exception 'Disposable email domains are not allowed. Please sign up with a real inbox.';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'staff_code', '') <> '' then
    select value into v_code from public.app_settings where key = 'staff_invite_code';
    if v_code is not null and new.raw_user_meta_data ->> 'staff_code' = v_code then
      v_role := 'pending';
    end if;
  end if;
  insert into public.profiles (id, display_name, role, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', v_role, new.email)
  on conflict (id) do nothing;

  -- m42:专属注册链接携带 lead_ref → 线索转化 + 归属绑定(跨设备生效)
  begin
    v_ref := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'lead_ref', '')), '')::uuid;
  exception when others then
    v_ref := null;
  end;
  if v_ref is not null and v_role = 'user' then
    select * into v_lead from public.leads
     where ref_token = v_ref and status <> 'converted';
    if found then
      update public.leads
         set status = 'converted', converted_profile = new.id, converted_at = now(),
             email = coalesce(nullif(btrim(new.email::text), ''), email)  -- m47:注册邮箱回填
       where id = v_lead.id;
      if v_lead.assigned_am is not null then
        update public.profiles set managed_by = v_lead.assigned_am where id = new.id;
      end if;
    end if;
  end if;

  -- m52:自然注册(无邀请码或未命中线索)→ 直接进入线索认领池
  if v_role = 'user'
     and not exists (select 1 from public.leads where converted_profile = new.id) then
    insert into public.leads (full_name, wa_e164, status, source, email,
                              converted_profile, converted_at)
    values (coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                     split_part(new.email::text, '@', 1)),
            null, 'new', 'signup', new.email::text, new.id, now());
  end if;

  return new;
end $$;

-- 3. 认领注册线 = 收编+开线+通知(claim_lead 整函数重写)
drop function if exists public.claim_lead(uuid);
create or replace function public.claim_lead(p_lead uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_am_id();
  v_me_user uuid := auth.uid();
  v_me_name text;
  v_l public.leads%rowtype;
  v_old_user uuid;
  v_conv uuid;
begin
  if v_me is null then raise exception '仅账户经理可认领线索。'; end if;
  select * into v_l from public.leads where id = p_lead for update;
  if not found then raise exception '线索不存在。'; end if;
  if v_l.status <> 'new' or v_l.first_reply_at is not null
     or (v_l.assigned_am is not null
         and v_l.assigned_at >= now() - interval '3 minutes') then
    raise exception '该线索当前不可认领(已被回复、认领未超时或状态已变更)。';
  end if;
  -- m52:注册即线索(source=signup,无匿名会话档)→ 认领 = 直接收编 + 开线 + 分配通知
  if v_l.profile_id is null and v_l.converted_profile is not null then
    update public.leads
       set assigned_am = v_me, assigned_at = now(), status = 'converted'
     where id = p_lead;
    update public.profiles set managed_by = v_me
     where id = v_l.converted_profile and managed_by is null;
    select a.name into v_me_name from public.account_managers a where a.id = v_me;
    v_conv := public.open_conversation(v_l.converted_profile);
    insert into public.messages (conversation_id, sender_id, body, kind)
    values (v_conv, v_me_user,
            json_build_object('k', 'assigned', 'am', v_me_name)::text, 'system');
    return json_build_object('ok', true, 'conversation_id', v_conv);
  end if;

  select a.user_id into v_old_user from public.account_managers a where a.id = v_l.assigned_am;
  v_old_user := coalesce(v_old_user, public.support_profile_id());
  select a.name into v_me_name from public.account_managers a where a.id = v_me;

  update public.leads set assigned_am = v_me, assigned_at = now() where id = p_lead;
  v_conv := public.lead_thread_assign(v_l.profile_id, v_old_user, v_me_user, v_me_name, false, false);
  return json_build_object('ok', true, 'conversation_id', v_conv);
end $$;
revoke execute on function public.claim_lead(uuid) from public, anon;
grant  execute on function public.claim_lead(uuid) to authenticated, service_role;




-- ================================================================
-- m53 合并块:清单自定义账号(custom_name · Other 窄口删除权)
-- ================================================================
-- 自定义账号(v80):Other 类型记录的命名位(该类型此前零 UI 入口,无历史包袱)
alter table public.account_records add column if not exists custom_name text;
alter table public.account_records drop constraint if exists record_custom_name_chk;
alter table public.account_records add constraint record_custom_name_chk
  check (custom_name is null or char_length(btrim(custom_name)) between 1 and 40);

-- 窄口删除权:仅 Other(自定义)记录,名下范围;标准八平台仍走 admin 治理
drop policy if exists p_rec_am_del_custom on public.account_records;
create policy p_rec_am_del_custom on public.account_records for delete
  using (task_type = 'Other'
         and exists (select 1 from public.profiles f
                     where f.id = freelancer_id
                       and f.managed_by = public.current_am_id()));


-- 11. 自检输出（跑完看这个结果）
--     期望：tables = 35，enums = 11，public_policies = 80，storage = 15  (m44 基线)
--           storage_policies = 21，buckets = 5  (m47)
-- ----------------------------------------------------------------

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE')                       as tables,
  (select count(distinct t.typname) from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace)                                     as enums,
  (select count(*) from pg_policies where schemaname = 'public')                       as public_policies,
  (select count(*) from pg_policies where schemaname = 'storage')                      as storage_policies,
  (select count(*) from storage.buckets
    where id in ('kyc-documents', 'task-attachments', 'chat-attachments', 'chat-stickers', 'avatars'))                                 as buckets;

-- ================================================================
-- 前端契约备忘（模块 2/3 按此实现，不用现在做任何事）
--
-- freelancer 端变更只走三个入口：
--   rpc respond_to_offer(p_offer_id, p_accept)  → 接受/拒绝 offer
--   rpc confirm_receipt(p_task_id)              → 确认到账、关单
--   insert task_submissions(task_id, freelancer_id, content, attachment_paths)
--     （version/status 由触发器自动处理；返修后再 insert 即新版本）
--   其余：update 自己的 profiles 行（钱包/联系方式/open_to_work）
--
-- admin 端：
--   直接读写 account_managers / tasks / task_offers / task_submissions
--   后台加载时调一次 rpc expire_stale_offers()（惰性过期）
--   标记已付款 = update tasks set tx_hash=..., paid_at=now(), paid_marked_by=auth.uid()
--   freelancer 池 = select * from freelancer_pool
--
-- tx_hash 展示为链接：
--   tron     → https://tronscan.org/#/transaction/{hash}
--   ethereum → https://etherscan.io/tx/{hash}
-- ================================================================
