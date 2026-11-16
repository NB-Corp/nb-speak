// Bilingual split-stage scenarios (100% clean-room universal engineering & daily turns)
export const SCENARIOS = {
  en: [
    {
      id: 'sre',
      label: 'SRE Canary',
      persona: 'calm_sre',
      userPrompt: '25m into the 20% auth canary. Error rate is 0.02%, p99 is 38ms. Good to push 100%?',
      rawWall: `Based on the metrics you shared, you can likely proceed toward a 100% rollout, though there are several important operational caveats to keep in mind first:

1. **Traffic Slice Coverage**: Twenty-five minutes at 20% only exercises a fraction of peak connection-pool concurrency, meaning 5x traffic could trigger non-linear lock contention.
2. **Recommended Intermediate Gate**: Consider stepping to 50% for another 20 minutes while watching database wait queues.
3. **Rollback Thresholds**: Make sure an automated 0.1% error-rate rollback alarm is armed.

| Metric | Canary (20%) | Target SLA |
| --- | --- | --- |
| Error Rate | 0.02% | < 0.10% |
| Latency p99 | 38ms | < 80ms |

Let me know if you need anything else or want me to draft the rollout checklist for your review!`,
      speakToolCall: {
        bubbles: [
          'Error rate held at 0.02%, p99 dropped to 38ms',
          'Connection pool looks steady too, good to push 100%',
        ],
        voice_note: {
          text: 'Dashboard stayed dead quiet for twenty-five minutes straight. Flip it whenever you are ready.',
          emotion: 'calm',
        },
        end_turn: true,
      },
      artifacts: [
        {
          title: 'auth-canary-25m.md',
          kind: 'table',
          language: 'markdown',
          content: '| Metric      | Baseline | 20% Canary | Gate  |\n| ----------- | -------- | ---------- | ----- |\n| Error rate  | 0.03%    | 0.02%      | PASS  |\n| p99 latency | 61ms     | 38ms       | PASS  |\n| Pool wait   | 1.2ms    | 0.9ms      | PASS  |',
        },
      ],
    },
    {
      id: 'code',
      label: 'SQL Code Review',
      persona: 'sharp_lead',
      userPrompt: 'Orders dashboard timed out on tenant_id filter again. Spot what is missing?',
      rawWall: `### Root Cause & Fix for Orders Timeout

I have analyzed the query execution plan for your review! Here is everything I found:

- **Sequential Scan Bottleneck**: Filtering by \`tenant_id\` and sorting on \`created_at DESC\` forces Postgres to sort 4.2M rows in memory.
- **Locking Risk**: Running a standard \`CREATE INDEX\` will block live writes on primary.

\`\`\`sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created
ON orders (tenant_id, created_at DESC)
WHERE deleted_at IS NULL;
\`\`\`

Hope this helps! Please run this migration and get some rest after deploying.`,
      speakToolCall: {
        bubbles: [
          'Postgres is seq-scanning 4.2M rows because tenant_id + created_at lacks a partial index',
          'Dropped the concurrent migration SQL in the card so writes stay unblocked',
        ],
        end_turn: true,
      },
      artifacts: [
        {
          title: 'idx_orders_tenant_created.sql',
          kind: 'code',
          language: 'sql',
          content: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created\n  ON orders (tenant_id, created_at DESC)\n  WHERE deleted_at IS NULL;',
        },
      ],
    },
    {
      id: 'handoff',
      label: 'Daily Handoff + Voice',
      persona: 'warm_companion',
      userPrompt: 'Did the Thursday afternoon clinic slot go through? Heading out in ten.',
      rawWall: `I am reporting back to you that everything is all set!
1. I booked your Thursday 2:30 PM appointment window successfully.
2. I also organized the four-page intake packet on your desktop so you just need to sign the bottom page.
3. Also, Thursday afternoon clinic slot is booked and the four-page packet is on your desktop! Now go eat something warm!`,
      speakToolCall: {
        bubbles: [
          'Thursday two-thirty slot is locked in',
          'Four-page packet is on your desk, just needs a signature at the bottom',
        ],
        voice_note: {
          text: 'Wind picked up pretty hard outside just now. Grab a jacket before you head out the door.',
          emotion: 'warm',
        },
        end_turn: true,
      },
      artifacts: [],
    },
    {
      id: 'spec',
      label: '3rd Spec Change',
      persona: 'neutral_peer',
      userPrompt: 'Swear this is the real final tweak—can we nudge the header CTA back to forest green?',
      rawWall: `*sighs* Frequent requirement changes at the last minute reduce engineering velocity, so please try to finalize visual specifications earlier next time! However, I have updated the header CTA button color back to forest green (#284b37) for your kind review. Let me know if you need anything else.`,
      speakToolCall: {
        bubbles: [
          'Third "final" tweak is live on staging',
          'Forest green CTA is back, take a look and tell me this one sticks',
        ],
        end_turn: true,
      },
      artifacts: [],
    },
  ],
  zh: [
    {
      id: 'sre',
      label: 'SRE 灰度放量',
      persona: 'calm_sre',
      userPrompt: '登录改造 20% 灰度跑满 25 分钟了，错误率 0.02%，p99 38ms，能推全量吗？',
      rawWall: `向你汇报灰度评估结论，整体指标正常，但在推全量前建议注意以下三点风险：

1. **流量切面覆盖不足**：25 分钟仅覆盖单一时段，全量放大 5 倍流量可能导致数据库连接池出现排队等待。
2. **建议分阶段推进**：稳妥起见建议先推至 50% 观察 20 分钟，并提前设定好 0.1% 自动回滚红线。
3. **监控核对表**：

| 指标项 | 当前灰度 (20%) | 目标阈值 |
| --- | --- | --- |
| 错误率 | 0.02% | < 0.10% |
| p99 延迟 | 38ms | < 80ms |

请随时检阅，有任何需要我继续排查的地方随时告诉我！`,
      speakToolCall: {
        bubbles: [
          '错误率 0.02% 没动，p99 降到 38ms',
          '连接池水位也稳，直接推全量吧',
        ],
        voice_note: {
          text: '大盘安安静静跑了快半小时。你那边点完发布就能收工下班啦。',
          emotion: 'calm',
        },
        end_turn: true,
      },
      artifacts: [
        {
          title: 'auth-canary-25m.sql',
          kind: 'code',
          language: 'sql',
          content:
            "SELECT slice, err_rate, p99_ms, pool_wait_ms\n  FROM canary_rollup\n  WHERE service = 'auth' AND window = '25m';\n-- 20% 灰度 | 0.02% | 38ms | 0.9ms (零锁等待 · 通过)",
        },
      ],
    },
    {
      id: 'code',
      label: 'SQL 慢查询排查',
      persona: 'sharp_lead',
      userPrompt: '订单后台按 tenant_id 筛列表又超时了，帮看眼缺啥索引？',
      rawWall: `### 订单列表超时根因分析与修复方案

我已经顺手替你排查完执行计划了，具体原因如下：
- **全表扫描瓶颈**：按 \`tenant_id\` 过滤并按 \`created_at DESC\` 排序时缺少联合部分索引，触发了 420 万行内存排序。
- **锁表风险**：线上主库直接建索引会阻塞写入。

\`\`\`sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created
ON orders (tenant_id, created_at DESC)
WHERE deleted_at IS NULL;
\`\`\`

希望这对你有帮助！跑完迁移记得早点休息。`,
      speakToolCall: {
        bubbles: [
          'tenant_id 加 created_at 没建联合索引，420 万行全在内存硬排',
          '不锁表建索引的 SQL 放卡片里了，直接主库跑就行',
        ],
        end_turn: true,
      },
      artifacts: [
        {
          title: 'idx_orders_tenant_created.sql',
          kind: 'code',
          language: 'sql',
          content: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created\n  ON orders (tenant_id, created_at DESC)\n  WHERE deleted_at IS NULL;',
        },
      ],
    },
    {
      id: 'handoff',
      label: '日常代办 + 语音',
      persona: 'warm_companion',
      userPrompt: '周四下午那个门诊号约上了吗？我十分钟后出门。',
      rawWall: `向你汇报，事情都已经顺手替你办妥啦！
1. 周四下午 14:30 的门诊窗口已经成功预约好啦。
2. 四页资料表我已经整理好放在你书桌左上角，过去直接签个字就行啦。
3. 快去吃顿热乎的乖乖出发吧！`,
      speakToolCall: {
        bubbles: [
          '周四下午两点半约上了',
          '四页打印稿压在桌角，过去签个字就行',
        ],
        voice_note: {
          text: '外头刚起风降温了。出门前顺手抓件防风外套披上。',
          emotion: 'warm',
        },
        end_turn: true,
      },
      artifacts: [],
    },
    {
      id: 'spec',
      label: '第 3 次改需求',
      persona: 'neutral_peer',
      userPrompt: '发誓这次真最后一版——顶栏按钮能改回松针绿吗？',
      rawWall: `（叹气）频繁在上线前临时修改视觉需求会影响交付效率，下次请尽量提前确认定稿！不过我已经按照你的要求把顶栏主按钮颜色改回松针绿（#284b37）了，请检阅，有其它问题随时告诉我。`,
      speakToolCall: {
        bubbles: [
          '第三回“真最后一版”推测试服了',
          '松针绿换回去了，瞄一眼顺不顺眼',
        ],
        end_turn: true,
      },
      artifacts: [],
    },
  ],
};
