-- 1. Drop the old function first so we can safely change the return type
DROP FUNCTION IF EXISTS get_user_badges();

-- 2. Create the updated function
CREATE OR REPLACE FUNCTION get_user_badges()
RETURNS TABLE (
  year        INT,
  month       INT,
  image_url   TEXT,
  status      TEXT,
  days_done   INT,
  days_needed INT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_joined_at    TIMESTAMPTZ;
  v_first_month  DATE;
  v_today        DATE := current_date;
BEGIN
  -- Get user creation date from auth.users
  SELECT created_at INTO v_joined_at FROM auth.users WHERE id = v_user_id;

  -- Always start from the current month of their join date
  v_first_month := date_trunc('month', v_joined_at)::DATE;

  RETURN QUERY
  SELECT
    mb.year,
    mb.month,
    mb.image_url,
    -- Determine badge status: 'locked', 'missed', or 'achieved'
    CASE
      -- If the month is the current month or a future month, it's locked (cannot be achieved yet)
      WHEN make_date(mb.year, mb.month, 1) >= date_trunc('month', v_today) THEN
        'locked'
      -- If they joined mid-month and this is their first month, they missed it (can never achieve it)
      WHEN EXTRACT(DAY FROM v_joined_at) != 1 AND date_trunc('month', v_joined_at)::DATE = make_date(mb.year, mb.month, 1) THEN
        'missed'
      -- Otherwise, check if they completed 'all_tasks' for every day of that month
      ELSE
        CASE WHEN (
          SELECT COUNT(*)::INT
          FROM activity_logs al
          WHERE al.user_id = v_user_id
            AND al.activity_type = 'all_tasks'
            AND date_trunc('month', al.activity_date::timestamp) = make_date(mb.year, mb.month, 1)
        ) = EXTRACT(DAY FROM (make_date(mb.year, mb.month, 1) + INTERVAL '1 month - 1 day'))::INT 
        THEN 'achieved' 
        ELSE 'missed' 
        END
    END AS status,
    (
      SELECT COUNT(*)::INT
      FROM activity_logs al
      WHERE al.user_id = v_user_id
        AND al.activity_type = 'all_tasks'
        AND date_trunc('month', al.activity_date::timestamp) = make_date(mb.year, mb.month, 1)
    ) AS days_done,
    EXTRACT(DAY FROM (make_date(mb.year, mb.month, 1) + INTERVAL '1 month - 1 day'))::INT AS days_needed
  FROM monthly_badges mb
  WHERE make_date(mb.year, mb.month, 1) >= v_first_month
    AND mb.year <= EXTRACT(YEAR FROM v_today)
  ORDER BY mb.year DESC, mb.month DESC;
END;
$$;
