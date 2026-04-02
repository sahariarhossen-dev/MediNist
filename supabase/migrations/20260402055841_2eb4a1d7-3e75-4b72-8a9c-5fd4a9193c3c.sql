
-- Add location columns to pharmacies
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS division text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS upazila text;

-- Add phone column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- RLS policies for pharmacies
CREATE POLICY "Anyone can view pharmacies"
ON public.pharmacies FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated users can insert pharmacies"
ON public.pharmacies FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
