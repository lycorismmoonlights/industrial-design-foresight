UPDATE `sources`
SET
	`adapter_config_json` = '{"enrichment":"eu_publication","maxDetailPagesPerRun":5,"maxAttachmentsPerItem":4}',
	`max_items_per_run` = 60,
	`next_fetch_at` = NULL,
	`etag` = NULL,
	`last_modified` = NULL,
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE
	`adapter_type` = 'rss'
	AND `feed_url` = 'https://single-market-economy.ec.europa.eu/node/3/rss_en';
--> statement-breakpoint
INSERT INTO `sources` (
	`id`, `owner_id`, `name`, `page_url`, `feed_url`, `source_type`, `source_category`,
	`default_credibility`, `enabled`, `last_new_count`, `created_at`, `updated_at`,
	`adapter_type`, `adapter_config_json`, `cadence`, `next_fetch_at`, `max_items_per_run`
)
SELECT
	lower(hex(randomblob(16))), owner.`owner_id`, 'BLS 美国制造业与劳动力', 'https://www.bls.gov/data/', NULL,
	'api', 'economic_data', 5, 1, 0,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	'bls',
	'{"series":[{"id":"CES3000000001","label":"美国制造业就业"},{"id":"CUSR0000SA0","label":"美国 CPI"},{"id":"LNS14000000","label":"美国失业率"},{"id":"CES0500000003","label":"美国私营非农平均时薪"}]}',
	'monthly', NULL, 60
FROM (SELECT DISTINCT `owner_id` FROM `sources`) AS owner
WHERE NOT EXISTS (
	SELECT 1 FROM `sources` AS existing
	WHERE existing.`owner_id` = owner.`owner_id` AND existing.`adapter_type` = 'bls' AND existing.`name` = 'BLS 美国制造业与劳动力'
);
--> statement-breakpoint
INSERT INTO `sources` (
	`id`, `owner_id`, `name`, `page_url`, `feed_url`, `source_type`, `source_category`,
	`default_credibility`, `enabled`, `last_new_count`, `created_at`, `updated_at`,
	`adapter_type`, `adapter_config_json`, `cadence`, `next_fetch_at`, `max_items_per_run`
)
SELECT
	lower(hex(randomblob(16))), owner.`owner_id`, 'Eurostat 欧盟宏观与制造业', 'https://ec.europa.eu/eurostat/', NULL,
	'api', 'economic_data', 5, 1, 0,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	'eurostat',
	'{"queries":[{"dataset":"sts_inpr_m","label":"欧盟制造业产出指数","recentPeriods":18,"filters":{"freq":"M","indic_bt":"PRD","nace_r2":"C","s_adj":"SCA","unit":"I21","geo":"EU27_2020"}},{"dataset":"namq_10_gdp","label":"欧盟实际 GDP","recentPeriods":8,"filters":{"freq":"Q","unit":"CLV10_MEUR","s_adj":"SCA","na_item":"B1GQ","geo":"EU27_2020"}},{"dataset":"prc_hicp_midx","label":"欧盟 HICP","recentPeriods":18,"filters":{"freq":"M","unit":"I15","coicop":"CP00","geo":"EU27_2020"}}]}',
	'monthly', NULL, 80
FROM (SELECT DISTINCT `owner_id` FROM `sources`) AS owner
WHERE NOT EXISTS (
	SELECT 1 FROM `sources` AS existing
	WHERE existing.`owner_id` = owner.`owner_id` AND existing.`adapter_type` = 'eurostat' AND existing.`name` = 'Eurostat 欧盟宏观与制造业'
);
