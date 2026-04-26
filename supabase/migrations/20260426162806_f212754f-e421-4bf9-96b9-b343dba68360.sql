create or replace function public.search_medicines(
  _pharmacy_id uuid,
  _query text
)
returns setof public.medicines
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.medicines
  where pharmacy_id = _pharmacy_id
    and regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(coalesce(_query, '')), '[^a-z0-9]', '', 'g') || '%'
  order by
    case
      when regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
           like regexp_replace(lower(coalesce(_query, '')), '[^a-z0-9]', '', 'g') || '%'
      then 0 else 1
    end,
    name
  limit 10;
$$;