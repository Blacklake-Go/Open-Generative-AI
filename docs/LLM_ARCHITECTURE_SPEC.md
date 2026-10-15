# KOYO Studio / SupDance 大模型全生命周期架构全景规范

> 本规范详细梳理了当前系统中大模型（文本 LLM、图像、视频、音频/音乐）从**接入上架、智能路由、金融结算、任务调度、多媒体归档到端侧交付**的完整端到端运转链路，并为整体架构重构与演进提供标准参考依据。

---

## 1. 架构拓扑全景图 (System Architecture Topology)

```mermaid
flowchart TD
    subgraph ClientLayer["客户端交付层 (Client & Consumption Layer)"]
        UI_STUDIO["KOYO Studio 10大创作台<br/>(/packages/studio)<br/>Image, Video, Cinema, LipSync..."]
        UI_CANVAS["SupDance Infinite Canvas<br/>(canvas.supdance.com)<br/>节点图谱, 批次卡片, 视差背景"]
        UI_AGENT["Creative Agent 对话助手<br/>(/api/v1/creative-agent)"]
    end

    subgraph APIGateway["统一 API 网关与鉴权层 (API Gateway & Auth)"]
        AUTH_MW["用户会话与权限校验<br/>getUserFromRequest & RequestGuard"]
        RATE_LIMIT["限流与防刷机制<br/>consumeRateLimit (60 req/h)"]
        IDEMP_LOCK["Idempotency-Key 幂等控制器<br/>acquireCreationIdempotencyLock"]
        API_ROUTER["业务入口路由<br/>/api/generation/quote<br/>/api/generations<br/>/api/canvas/jobs"]
    end

    subgraph FinanceCore["金融与双阶段计费核心 (Financial & Pricing Engine)"]
        PRICING_CALC["PricingEngine 动态定价计算<br/>参数加权 (时长/分辨率/步数) + 75% 毛利保底"]
        ROUTE_SNAP["RouteQuoteSnapshot 快照生成<br/>锁定渠道、预计成本、汇率与 TTL(300s)"]
        CREDIT_WALLET["CreditWallet 多桶钱包<br/>daily_free -> subscription -> perpetual"]
        TWO_PHASE_LEDGER["CreditLedgerV2 双阶段账本<br/>Phase 1: Reserve 预扣冻结<br/>Phase 2: Commit 提交 / Void 100%退款"]
    end

    subgraph RouterCore["智能选路与高可用熔断 (Smart Routing & Circuit Breaker)"]
        POLICY_EVAL["SmartRouter 策略决策<br/>cost (最低成本) | quality | stability | balanced"]
        FX_SNAPSHOT["实时汇率与动态询价<br/>exchange_rate_snapshots & MuAPI 探针"]
        CIRCUIT_BREAKER["CircuitBreaker 熔断降级中心<br/>连续失败/超时拉黑 -> 自动切换备选候选"]
    end

    subgraph ExecutionCore["任务调度与供应商适配 (Job Execution & Provider Adapters)"]
        JOB_STATE["任务状态机<br/>creations: queued -> processing -> succeeded/failed"]
        TASK_DISPATCH["调度引擎 GenerationCore<br/>同步直接执行 或 异步进队列"]
        ASYNC_WORKER["后台轮询与回调 Worker<br/>taskWorker.js 指数退避轮询 & /callback 接收"]
        ADAPTER_POOL["统一 Provider 适配器池 (BaseAdapter)<br/>OpenAI, 可灵, 智谱, 火山, 阿里, RunningHub, MuAPI"]
    end

    subgraph StorageCore["持久化归档与私有资产库 (Archival & Storage Service)"]
        INGEST_SVC["多媒体结果抓取服务<br/>ingestRemoteFile (自动重试 3 次)"]
        PRIVATE_OSS["私有对象存储归档<br/>COS / S3: generated/YYYY/MM/DD/uuid.ext"]
        USER_ASSETS["用户私有资产库<br/>ai_studio.user_assets 资产登记与引用"]
        CDN_SIGNER["安全签名直链生成<br/>HMAC-SHA1 10分钟防盗链 CDN URL"]
    end

    ClientLayer --> APIGateway
    APIGateway --> FinanceCore
    FinanceCore --> RouterCore
    FinanceCore --> ExecutionCore
    ExecutionCore --> ADAPTER_POOL
    ADAPTER_POOL --> ExecutionCore
    ExecutionCore --> StorageCore
    StorageCore --> FinanceCore
    StorageCore --> ClientLayer
```

---

## 2. 数据库实体关系 (Core Data Models & ERD)

```mermaid
erDiagram
    ai_models ||--o{ ai_provider_models : "has multiple provider channels"
    ai_models ||--o{ ai_official_price_versions : "has pricing versions"
    ai_models ||--o{ creations : "instantiated by tasks"
    
    users ||--|| credit_wallets : "owns"
    users ||--o{ creations : "creates"
    users ||--o{ user_assets : "owns"
    
    credit_wallets ||--o{ credit_reservations : "freezes balance in"
    credit_wallets ||--o{ credit_ledger_v2 : "records transactions in"
    
    credit_reservations ||--o| creations : "links 1:1 with"
    creations ||--o{ generation_events : "logs timeline events"
    creations ||--o{ provider_cost_records : "reconciles actual cost"
    creations ||--o| user_assets : "syncs to asset"

    ai_models {
        string id PK "逻辑模型ID (如 kling-v1-6, flux-pro)"
        string name "模型对外显示名称"
        string category "image, video, audio, text"
        boolean is_active "是否启用"
        jsonb capabilities "支持参数 (分辨率/比例/步数)"
    }

    ai_provider_models {
        string id PK "渠道绑定ID"
        string model_id FK "关联逻辑模型ID"
        string provider_id "供应商ID (kling, openai, volcengine...)"
        string provider_model_id "供应商底层物理模型名称"
        int priority "路由优先级"
        float weight "权重"
        boolean is_enabled "渠道可用性"
    }

    credit_wallets {
        string user_id PK "用户ID"
        int daily_free_credits "每日免费积分"
        int subscription_credits "订阅月度积分"
        int perpetual_credits "永久付费积分"
        int frozen_credits "当前生成中冻结积分"
        int version "乐观锁版本号"
        timestamp updated_at "更新时间"
    }

    credit_reservations {
        string id PK "预留号 uuid"
        string user_id FK "用户ID"
        int amount "冻结总积分"
        jsonb bucket_split_json "各桶扣除明细 (用于原路回退)"
        string status "RESERVED, COMMITTED, VOIDED, EXPIRED"
        timestamp expires_at "预留过期时间 (默认30分钟)"
    }

    creations {
        string id PK "任务唯一标识 taskId"
        string user_id FK "发起用户"
        string model FK "使用的逻辑模型"
        string studio_id "调用工作室 (image, video, canvas...)"
        string status "queued, processing, succeeded, failed, cancelled"
        string reservation_id FK "关联资金冻结号"
        string provider "最终执行路由渠道"
        string provider_request_id "上游供应商任务ID"
        string result_url "最终签名访问 URL"
        string result_object_key "对象存储私有路径"
        string idempotency_key "客户端幂等唯一键"
    }
```

---

## 3. 端到端生成业务时序图 (Full-Lifecycle Execution Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户 / 前端 (Studio/Canvas)
    participant GW as API 网关 & 路由
    participant PE as 定价引擎 (PricingEngine)
    participant SR as 智能路由 (SmartRouter)
    participant CW as 多桶钱包 (CreditService)
    participant GC as 任务执行器 (GenerationCore)
    participant PA as Provider Adapter (供应商)
    participant SS as 存储归档 (StorageService)

    Note over User,PE: 阶段 1：事前报价与路线快照锁定 (Quote Phase)
    User->>GW: POST /api/generation/quote (modelId, parameters)
    GW->>PE: createGenerationQuote()
    PE->>SR: routeGenerationTask(persistDecision=false)
    SR-->>PE: 返回最佳候选渠道、成本估算、汇率快照
    PE->>PE: 加成计算保底利润 (最低75%毛利率)，签署 quoteId
    PE-->>User: 返回 { quoteId, creditsQuoted, expiresAt(300s), routeSnapshot }

    Note over User,GC: 阶段 2：原子创建与资金预扣 (Reserve Phase)
    User->>GW: POST /api/generations (modelId, prompt, quoteId, Idempotency-Key)
    GW->>GW: 校验幂等锁与提示词安全审核
    GW->>PE: verifyAndConsumeQuote(quoteId)
    GW->>CW: reserveCredits(userId, creditsQuoted, quoteId)
    CW->>CW: 行锁锁定 credit_wallets，FIFO扣减可用积分，增加 frozen_credits
    CW-->>GW: 返回 reservationId (状态: RESERVED)
    GW->>GC: createGenerationTask()
    GC->>GC: 写入 creations 表 (status: queued)

    Note over GC,PA: 阶段 3：执行调度与异步轮询 (Execution Phase)
    GC->>PA: 适配并调用供应商接口 (submitTask)
    PA-->>GC: 返回 providerRequestId (上游已接单)
    GC->>GC: 更新 creations (status: processing)
    
    loop 异步退避轮询 或 Webhook
        GC->>PA: 查询任务状态 (pollStatus)
        PA-->>GC: 生成完成，返回临时媒体链接 (tempUrl)
    end

    Note over GC,SS: 阶段 4：对象存储沉降与私有资产同步 (Storage Phase)
    GC->>SS: ingestRemoteFile(tempUrl)
    SS->>SS: 流式抓取二进制，转存至私有 COS/S3 (generated/YYYY/MM/DD/uuid.ext)
    SS-->>GC: 返回 result_object_key
    GC->>SS: syncCreationToAsset() 写入用户私有资产库 (user_assets)

    Note over GC,CW: 阶段 5：双阶段正式扣款与审计对账 (Commit Phase)
    GC->>CW: commitCredits(reservationId, creationId)
    CW->>CW: 扣减 frozen_credits，标记 status=COMMITTED，记入 ledger
    GC->>GC: 记录供应商实际成本 (provider_cost_records)
    GC->>SS: 生成 10分钟 HMAC 安全 CDN 直链
    GC-->>User: 返回 { status: 'succeeded', url: signedCdnUrl, creation_id }

    Note over GC,CW: 异常分支：100% 极速解冻退款 (Void on Failure)
    opt 生成失败 或 存储抓取失败
        GC->>CW: voidCredits(reservationId, reason)
        CW->>CW: 释放 frozen_credits，全额原路补回 daily/subscription/perpetual 桶
        CW->>CW: 账本记入 TASK_RELEASE
        GC-->>User: 返回友好失败原因，积分零资损
    end
```

---

## 4. 目录改造对比图 (Modular Monolith)

```text
当前目录结构 (紧耦合单体)                       重构后目录结构 (单体模块化 Modular Monolith)
lib/                                           lib/
├── adapters/                                  ├── ai/                          <--- 统一 AIGC 核心域
│   ├── BaseAdapter.js                         │   ├── contracts/               <--- 核心接口与数据模型 (TS)
│   ├── OpenAIAdapter.js                       │   │   ├── provider.ts          <--- IModelProvider 标准契约
│   ├── VolcengineAdapter.js                   │   │   ├── generation.ts        <--- UnifiedGenerationRequest 规范
│   ├── KlingAdapter.js                        │   │   ├── billing.ts           <--- ITwoPhaseBillingLifecycle 规范
│   └── RunningHubAdapter.js                   │   │   └── realtime.ts          <--- 实时推送事件契约
│                                              │   ├── providers/               <--- 统一 Provider 网关插件池
├── services/                                  │   │   ├── base.provider.ts     <--- 抽象基类 (模板方法模式)
│   ├── generationCore.js (1690行大单体)       │   │   ├── registry.ts          <--- Provider 注册与寻址工厂
│   ├── smartRouter.js                         │   │   └── plugins/             <--- 各厂商沙盒化适配插件
│   ├── pricingEngine.js                       │   │       ├── openai.plugin.ts
│   └── taskWorker.js                          │   │       ├── volcengine.plugin.ts
│                                              │   │       ├── kling.plugin.ts
app/api/                                       │   │       └── runninghub.plugin.ts
│   ├── generations/route.js                   │   ├── billing/                 <--- 两阶段计费与事务状态机
│   └── canvas/jobs/route.js                   │   │   └── twoPhaseSettlement.ts<--- Reserve/Commit/Rollback 闭环
│                                              │   ├── core/                    <--- 新版精简调度管道
│                                              │   │   ├── pipeline.ts          <--- 统摄全链路的 Canonical Pipeline
│                                              │   │   └── smartRouter.ts       <--- 选路与熔断策略中间件
│                                              │   └── queue/                   <--- 异步调度与实时推送
│                                              │       ├── taskDispatcher.ts    <--- 任务异步派发器
│                                              │       ├── asyncWorker.ts       <--- 后台退避轮询与超时管理
│                                              │       └── realtimeEmitter.ts   <--- SSE 事件流推送中枢
│                                              app/api/
│                                              ├── generations/route.ts         <--- 变更为薄包装 (转调 Unified Pipeline)
│                                              ├── canvas/jobs/route.ts         <--- 变更为薄包装 (转调 Unified Pipeline)
│                                              └── generations/events/route.ts  <--- 新增: SSE 客户端实时事件订阅流
```
