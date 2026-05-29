
-- Normalize target_month that landed on last day of previous month due to TZ bug
UPDATE public.product_targets
SET target_month = date_trunc('month', target_month + interval '2 day')::date
WHERE EXTRACT(DAY FROM target_month) <> 1;

-- Recompute current_progress from sale_items for all targets
WITH agg AS (
  SELECT pt.id AS target_id,
         COALESCE(SUM(si.quantity), 0)::int AS qty
  FROM public.product_targets pt
  LEFT JOIN public.sales s
    ON s.pharmacy_id = pt.pharmacy_id
   AND s.user_id = pt.user_id
   AND s.status = 'completed'
   AND date_trunc('month', s.created_at)::date = pt.target_month
  LEFT JOIN public.sale_items si
    ON si.sale_id = s.id
   AND si.medicine_id = pt.medicine_id
  GROUP BY pt.id
)
UPDATE public.product_targets pt
SET current_progress = agg.qty,
    achieved_at = CASE
      WHEN agg.qty >= pt.target_quantity THEN COALESCE(pt.achieved_at, now())
      ELSE NULL
    END
FROM agg
WHERE agg.target_id = pt.id;
