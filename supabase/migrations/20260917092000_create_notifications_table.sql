-- Migration: Create notifications table for shop/tenant real-time notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant and user queries
CREATE INDEX IF NOT EXISTS idx_notifications_shop_id ON public.notifications(shop_id);
CREATE INDEX IF NOT EXISTS idx_notifications_pharmacy_id ON public.notifications(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view notifications for their shop or user'
  ) THEN
    CREATE POLICY "Users can view notifications for their shop or user"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (
      shop_id IN (
        SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
      )
      OR pharmacy_id IN (
        SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
      )
      OR user_id = auth.uid()
      OR user_id IS NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can insert notifications for their shop'
  ) THEN
    CREATE POLICY "Users can insert notifications for their shop"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (
      shop_id IN (
        SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
      )
      OR pharmacy_id IN (
        SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update their own notifications'
  ) THEN
    CREATE POLICY "Users can update their own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (
      user_id = auth.uid()
      OR shop_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid())
    );
  END IF;
END $$;
