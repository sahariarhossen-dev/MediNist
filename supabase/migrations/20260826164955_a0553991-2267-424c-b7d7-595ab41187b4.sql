UPDATE public.staff_security_settings
SET pin_lock_enabled = false,
    ip_restriction_enabled = false,
    updated_at = now()
WHERE pin_lock_enabled OR ip_restriction_enabled;