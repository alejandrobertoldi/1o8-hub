ALTER TABLE shared_logins
  ADD COLUMN IF NOT EXISTS subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE shared_logins
SET subscriptions = jsonb_build_array(
  jsonb_build_object(
    'subscriptionId', COALESCE(
      NULLIF(btrim(COALESCE(subscription_id, '')), ''),
      NULLIF(subscription_ids->>0, ''),
      ''
    ),
    'activationCode', NULLIF(btrim(COALESCE(activation_code, '')), ''),
    'userLimit', user_limit,
    'usernames', CASE
      WHEN jsonb_typeof(usernames) = 'array' AND jsonb_array_length(usernames) > 0 THEN usernames
      WHEN COALESCE(btrim(username), '') <> '' THEN jsonb_build_array(username)
      ELSE '[]'::jsonb
    END
  )
)
WHERE subscriptions = '[]'::jsonb
  AND (
    COALESCE(btrim(username), '') <> ''
    OR COALESCE(btrim(activation_code), '') <> ''
    OR COALESCE(btrim(subscription_id), '') <> ''
    OR user_limit IS NOT NULL
    OR (jsonb_typeof(usernames) = 'array' AND jsonb_array_length(usernames) > 0)
    OR (jsonb_typeof(subscription_ids) = 'array' AND jsonb_array_length(subscription_ids) > 0)
  );

UPDATE shared_logins
SET subscriptions = subscriptions || extra.ids
FROM (
  SELECT
    id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'subscriptionId', subscription_ids->>idx,
          'activationCode', NULL,
          'userLimit', NULL,
          'usernames', '[]'::jsonb
        )
        ORDER BY idx
      ),
      '[]'::jsonb
    ) AS ids
  FROM shared_logins
  CROSS JOIN LATERAL generate_series(
    1,
    GREATEST(COALESCE(jsonb_array_length(subscription_ids), 1) - 1, 0)
  ) AS idx
  WHERE jsonb_typeof(subscription_ids) = 'array'
    AND jsonb_array_length(subscription_ids) > 1
  GROUP BY id
) extra
WHERE shared_logins.id = extra.id
  AND jsonb_array_length(extra.ids) > 0
  AND jsonb_array_length(shared_logins.subscriptions) = 1;
