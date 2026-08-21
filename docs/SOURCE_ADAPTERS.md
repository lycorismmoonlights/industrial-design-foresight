# 官方来源适配器配置

来源可在“来源管理”中选择 API 类型并填写 JSON。新来源默认停用，先手动同步验证，再确认启用。启用后可在“自动化运营”中继续编辑参数、测试抓取和查看日志。配置中不得放 API key、token、password 或 secret；这些值必须由运行时环境提供。

## BLS

支持 `seriesIds`，或带展示名的 `series`。未提供年份时抓取当前年和上一年；单次查询年份跨度不能超过 20 年。

```json
{
  "series": [
    { "id": "YOUR_BLS_SERIES_ID", "label": "设计相关就业指标" }
  ],
  "startYear": 2025,
  "endYear": 2026
}
```

`BLS_API_KEY` 可选；配置后用于更高的官方 API 配额。

## FRED

FRED 必须设置 `FRED_API_KEY`。每个来源最多配置 10 个系列。

```json
{
  "series": [
    { "id": "YOUR_FRED_SERIES_ID", "label": "制造业或就业指标" }
  ]
}
```

## SEC EDGAR

CIK 可不补前导零；每个来源最多 10 家公司。`forms` 省略时默认抓取 `10-K`、`10-Q` 和 `8-K`。

```json
{
  "companies": [
    { "cik": "YOUR_COMPANY_CIK", "name": "目标公司" }
  ],
  "forms": ["10-K", "10-Q", "8-K"]
}
```

必须设置类似 `IndustrialDesignForesight/0.3 contact@example.com` 的 `SEC_USER_AGENT`，并替换为真实联系地址。

## Eurostat

`dataset` 是 Eurostat 数据集代码；`filters` 直接映射为官方 Statistics API 的维度筛选参数。每个来源最多 10 个查询。

```json
{
  "queries": [
    {
      "dataset": "YOUR_DATASET_CODE",
      "label": "欧盟制造与创新指标",
      "filters": {
        "geo": "EU27_2020"
      }
    }
  ]
}
```

## 运行时变量

```text
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-flash
AI_PROCESSING_ENABLED=true
AI_DAILY_ITEM_LIMIT=30
AI_MAX_ATTEMPTS=3
FRED_API_KEY=...
BLS_API_KEY=...
SEC_USER_AGENT=IndustrialDesignForesight/0.3 contact@example.com
```

密钥不要提交到 Git。提交前运行 `git diff --check` 并检查 `.env*` 没有进入暂存区。
