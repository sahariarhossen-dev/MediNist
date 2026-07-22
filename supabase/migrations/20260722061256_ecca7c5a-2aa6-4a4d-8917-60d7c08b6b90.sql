
ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_pharmacies_demo_expiry
  ON public.pharmacies (demo_expires_at)
  WHERE is_demo = true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Relax the profile update guard so the register/demo flow can set pharmacy_id/role via service role
-- (already handled via app.bypass_profile_guards).

CREATE OR REPLACE FUNCTION public.seed_demo_pharmacy(_pharmacy_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
  v_med_ids uuid[] := ARRAY[]::uuid[];
  v_cust_ids uuid[] := ARRAY[]::uuid[];
  v_med_id uuid;
  v_cust_id uuid;
  v_sale_id uuid;
  v_qty int;
  v_price numeric;
  v_subtotal numeric;
  v_total numeric;
  v_created timestamptz;
  i int;
  meds record;
  custs record;
BEGIN
  -- Seed 25 medicines
  FOR meds IN
    SELECT * FROM (VALUES
      ('Napa 500mg',      'Beximco',       'Paracetamol',     '500 mg',  'Tablet',   1.20,  400, 50, 10, 10),
      ('Napa Extra',      'Beximco',       'Paracetamol+Caffeine', '500 mg', 'Tablet', 2.00, 200, 30, 10, 10),
      ('Sergel 20',       'Healthcare',    'Esomeprazole',    '20 mg',   'Capsule',  7.00,  250, 40, 10, 10),
      ('Seclo 20',        'Square',        'Omeprazole',      '20 mg',   'Capsule',  4.50,  180, 30, 10, 10),
      ('Alatrol 10',      'Square',        'Cetirizine',      '10 mg',   'Tablet',   2.00,  350, 50, 10, 10),
      ('Monas 10',        'ACI',           'Montelukast',     '10 mg',   'Tablet',  10.00,  120, 20, 10, 10),
      ('Fexo 120',        'Square',        'Fexofenadine',    '120 mg',  'Tablet',   8.00,  150, 20, 10, 10),
      ('Ecosprin 75',     'Beximco',       'Aspirin',         '75 mg',   'Tablet',   1.50,  300, 40, 14, 10),
      ('Metfo 500',       'Square',        'Metformin',       '500 mg',  'Tablet',   3.00,  240, 30, 10, 10),
      ('Amdocal 5',       'Beximco',       'Amlodipine',      '5 mg',    'Tablet',   2.50,  200, 30, 10, 10),
      ('Bisocor 2.5',     'Square',        'Bisoprolol',      '2.5 mg',  'Tablet',   4.00,   80, 15, 10, 10),
      ('Losectil 20',     'Eskayef',       'Omeprazole',      '20 mg',   'Capsule',  4.00,   90, 20, 10, 10),
      ('Rivotril 0.5',    'Roche',         'Clonazepam',      '0.5 mg',  'Tablet',   6.00,   40,  8, 10, 10),
      ('Neuro-B',         'Popular',       'Vitamin B Complex','—',      'Tablet',   3.50,  100, 20, 10, 10),
      ('Xelodep 10',      'Square',        'Escitalopram',    '10 mg',   'Tablet',   9.00,   60, 10, 10, 10),
      ('Tufnil 200',      'Beximco',       'Tolfenamic Acid', '200 mg',  'Tablet',  12.00,   70, 10, 10, 10),
      ('Amodis 400',      'Square',        'Metronidazole',   '400 mg',  'Tablet',   2.20,  150, 30, 10, 10),
      ('Cef-3 200',       'Opsonin',       'Cefixime',        '200 mg',  'Capsule', 25.00,   40,  8, 10, 10),
      ('Ace Syrup',       'Square',        'Paracetamol',     '120 mg/5ml','Syrup', 45.00,   35, 10,  1,  1),
      ('Tuscolyn Syrup',  'Beximco',       'Dextromethorphan','—',       'Syrup',  90.00,   20,  5,  1,  1),
      ('Deltasone 5',     'Square',        'Prednisolone',    '5 mg',    'Tablet',   1.50,  100, 20, 10, 10),
      ('Salbet Inhaler',  'Popular',       'Salbutamol',      '100 mcg', 'Inhaler',260.00,   15,  3,  1,  1),
      ('Emistat 4',       'Renata',        'Ondansetron',     '4 mg',    'Tablet',   6.00,   80, 15, 10, 10),
      ('Xelor Cream',     'Square',        'Clotrimazole',    '1%',      'Topical', 55.00,   25,  5,  1,  1),
      ('Vitamin D3 40k',  'Radiant',       'Cholecalciferol', '40000 IU','Capsule', 20.00,   45,  8, 10, 10)
    ) AS t(name, company_name, generic_name, strength, product_type, price, stock_quantity, stock_alert, pcs_per_strip, strip_per_pack)
  LOOP
    v_med_id := gen_random_uuid();
    v_med_ids := array_append(v_med_ids, v_med_id);
    INSERT INTO public.medicines (
      id, pharmacy_id, name, company_name, generic_name, strength, product_type,
      price, stock_quantity, stock_alert, pcs_per_strip, strip_per_pack, expiry_date
    ) VALUES (
      v_med_id, _pharmacy_id, meds.name, meds.company_name, meds.generic_name, meds.strength, meds.product_type,
      meds.price, meds.stock_quantity, meds.stock_alert, meds.pcs_per_strip, meds.strip_per_pack,
      (v_now + (60 + (random() * 500)::int) * interval '1 day')::date
    );
  END LOOP;

  -- 3 low-stock alerts
  UPDATE public.medicines SET stock_quantity = 5 WHERE id = v_med_ids[13];
  UPDATE public.medicines SET stock_quantity = 3 WHERE id = v_med_ids[18];
  UPDATE public.medicines SET stock_quantity = 2 WHERE id = v_med_ids[22];

  -- Seed 8 customers
  FOR custs IN
    SELECT * FROM (VALUES
      ('Rahim Uddin',      '01711223344', 'Dhanmondi, Dhaka',      0),
      ('Karim Ahmed',      '01812345678', 'Mirpur 10, Dhaka',    350),
      ('Fatema Begum',     '01911223399', 'Gulshan, Dhaka',        0),
      ('Sabbir Hossain',   '01611998877', 'Uttara, Dhaka',       800),
      ('Nadia Islam',      '01512334455', 'Banani, Dhaka',         0),
      ('Jahangir Alam',    '01311776655', 'Mohammadpur, Dhaka',  200),
      ('Ayesha Siddika',   '01777889900', 'Bashundhara, Dhaka',    0),
      ('Mizanur Rahman',   '01888112233', 'Old Dhaka',             0)
    ) AS t(name, phone, address, total_due)
  LOOP
    v_cust_id := gen_random_uuid();
    v_cust_ids := array_append(v_cust_ids, v_cust_id);
    INSERT INTO public.customers (id, pharmacy_id, name, phone, address, total_due)
    VALUES (v_cust_id, _pharmacy_id, custs.name, custs.phone, custs.address, custs.total_due);
  END LOOP;

  -- Seed 15 completed sales spread across last 30 days (5 today)
  FOR i IN 1..15 LOOP
    v_med_id := v_med_ids[1 + (i % array_length(v_med_ids, 1))];
    v_qty := 3 + (i % 8);
    SELECT price INTO v_price FROM public.medicines WHERE id = v_med_id;
    v_price := COALESCE(v_price, 5);
    v_subtotal := v_price * v_qty;
    v_total := round(v_subtotal * 0.9, 2);
    IF i <= 5 THEN
      v_created := v_today_start + (i * interval '1 hour') + interval '9 hours';
    ELSE
      v_created := v_now - ((i - 5) * interval '2 days');
    END IF;

    v_sale_id := gen_random_uuid();
    INSERT INTO public.sales (id, pharmacy_id, user_id, sale_type, subtotal, discount_percent, discount_amount, total, status, created_at)
    VALUES (v_sale_id, _pharmacy_id, _user_id, 'retail', v_subtotal, 10, v_subtotal * 0.1, v_total, 'completed', v_created);

    INSERT INTO public.sale_items (sale_id, medicine_id, medicine_name, company_name, quantity, unit_price, total_price, discount_percent)
    SELECT v_sale_id, m.id, m.name, m.company_name, v_qty, v_price, v_subtotal, 10
    FROM public.medicines m WHERE m.id = v_med_id;
  END LOOP;

  -- A couple of customer dues today
  INSERT INTO public.customer_ledger (customer_id, pharmacy_id, user_id, entry_type, amount, description, occurred_at)
  VALUES
    (v_cust_ids[2], _pharmacy_id, _user_id, 'due', 350, 'Sample due', v_today_start + interval '11 hours'),
    (v_cust_ids[4], _pharmacy_id, _user_id, 'due', 800, 'Sample due', v_today_start + interval '13 hours');

  -- A cash out and an investment in for today so Cash in Hand looks realistic
  INSERT INTO public.cash_transactions (pharmacy_id, user_id, direction, category, party_name, amount, note, occurred_at)
  VALUES
    (_pharmacy_id, _user_id, 'in',  'other_in',      'Owner top-up',    5000, 'Opening cash', v_today_start + interval '8 hours'),
    (_pharmacy_id, _user_id, 'out', 'expense',       'Utility bill',     300, 'Electricity',  v_today_start + interval '10 hours'),
    (_pharmacy_id, _user_id, 'in',  'due_collection','Karim Ahmed',      200, 'Partial due',  v_today_start + interval '12 hours');
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_demo_pharmacy(uuid, uuid) TO service_role;
