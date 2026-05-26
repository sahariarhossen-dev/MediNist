DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_subscription();