DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'close-daily-transactions-midnight';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'close-daily-transactions-midnight',
  '5 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://api.medinist.com/functions/v1/close-daily-transactions',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcWN2aWRlenp6a2ZpcGNuZWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDU1NDMsImV4cCI6MjA5MDY4MTU0M30.cKElSFfqIyMNbzHhfbsjTEdb6Y4vaHnCrjI8-DK5UfU"}'::jsonb,
    body := jsonb_build_object('time', now())
  );
  $$
);