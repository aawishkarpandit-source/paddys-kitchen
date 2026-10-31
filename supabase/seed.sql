-- ════════════════════════════════════════════════════════════════════════════
--  Paddy's Kitchen — Demo seed data
--  Run AFTER schema.sql. Idempotent: re-running will not duplicate rows.
--  To fork for another restaurant: change slug/name here, or delete the
--  restaurant row (cascade wipes everything) and re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Restaurant with WiFi + theme settings read by the customer app -----------
insert into public.restaurants (name, slug, logo_url, settings)
select 'Paddy''s Kitchen', 'paddys-kitchen', null,
       $settings${
         "currency": "EUR",
         "wifi": {
           "ssid": "Paddys_Guest",
           "password": "stew2026!",
           "note": "Free for guests — ask us if it sleeps"
         },
         "hours": "Kitchen 12:00–21:30 · Pub til late",
         "contact": "+353 1 555 0132",
         "theme": { "primary": "#059669", "accent": "#F59E0B" }
       }$settings$::jsonb
where not exists (select 1 from public.restaurants where slug = 'paddys-kitchen');

-- 2. Categories ---------------------------------------------------------------
insert into public.categories (restaurant_id, name, display_order)
select r.id, c.name, c.ord
from public.restaurants r
cross join (values
  ('Starters', 0), ('Mains', 1), ('Burgers', 2),
  ('Sides', 3), ('Desserts', 4), ('Drinks', 5)
) as c(name, ord)
where r.slug = 'paddys-kitchen'
  and not exists (select 1 from public.categories x where x.restaurant_id = r.id);

-- 3. Menu items ----------------------------------------------------------------
insert into public.menu_items
      (restaurant_id, category_id, name, description, price, image_url, is_available, dietary_tags, display_order)
select r.id, cat.id, m.name, m.description, m.price, m.image_url, true, m.tags::text[], m.ord
from public.restaurants r
join public.categories cat on cat.restaurant_id = r.id
cross join (values
  -- Starters
  ('Starters', 'Seafood Chowder',  'Smoked haddock, leek & potato, brown bread',                       8.50, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=80', '{gf_option}', 0),
  ('Starters', 'Garlic Mushrooms', 'Breadcrumbs, garlic butter, tartare dip',                          7.00, 'https://images.unsplash.com/photo-1620414166828-58a7be8cd107?w=800&q=80', '{vegetarian}', 1),
  -- Mains
  ('Mains',    'Guinness Beef Stew',   'Slow-braised with root veg & soda bread — the house classic', 15.50, 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80', '{}', 0),
  ('Mains',    'Fish & Chips',         'Fresh haddock in beer batter, hand-cut chips, mushy peas',    14.95, 'https://images.unsplash.com/photo-1579105854982-4a3b3d6679a5?w=800&q=80', '{}', 1),
  ('Mains',    'Roast of the Day',     'Rotating roast, roasties, seasonal veg & proper gravy',       16.00, 'https://images.unsplash.com/photo-1579871494447-981bdbc22afc?w=800&q=80', '{}', 2),
  -- Burgers
  ('Burgers',  'Paddy''s Stack Burger','Two 6oz patties, smoked cheddar, bacon & secret sauce',       13.95, 'https://images.unsplash.com/photo-1568901346375-23c9450c5869?w=800&q=80', '{}', 0),
  ('Burgers',  'Classic Cheeseburger', 'Single 6oz beef patty, cheddar, pickle, burger sauce',        10.95, 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80', '{}', 1),
  ('Burgers',  'Veggie Bean Burger',   'Smoked paprika bean patty, avocado, vegan mayo',              11.50, 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=800&q=80', '{vegetarian,vegan}', 2),
  -- Sides
  ('Sides',    'Hand-Cut Chips',       'Twice-cooked, sea salt & rosemary',                            4.50, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80', '{vegetarian,vegan,gluten-free}', 0),
  ('Sides',    'Onion Rings',          'Golden crispy beer-battered',                                  4.95, 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=800&q=80', '{vegetarian}', 1),
  ('Sides',    'Garden Salad',         'Seasonal leaves, tomato, cucumber, house vinaigrette',         5.50, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80', '{vegetarian,vegan,gluten-free}', 2),
  -- Desserts
  ('Desserts', 'Baileys Cheesecake',   'Baileys cream on a biscuit base, chocolate drizzle',           7.50, 'https://images.unsplash.com/photo-1524361196580-3e63d9835330?w=800&q=80', '{vegetarian}', 0),
  ('Desserts', 'Warm Apple Pie',       'Custard or cream — you decide',                                6.50, 'https://images.unsplash.com/photo-1535920527002-b35e96722eb9?w=800&q=80', '{vegetarian}', 1),
  -- Drinks
  ('Drinks',   'Guinness',             'The black stuff, poured properly (takes 2 min)',               5.80, 'https://images.unsplash.com/photo-1615715385164-225c39b9a1f1?w=800&q=80', '{}', 0),
  ('Drinks',   'Craft Lager',          'Local brewery pilsner',                                        5.50, 'https://images.unsplash.com/photo-1608270586620-248294caca1e?w=800&q=80', '{}', 1),
  ('Drinks',   'Barista Coffee',       'Double shot, fresh beans',                                     3.80, 'https://images.unsplash.com/photo-1509042239860-ed550284f382?w=800&q=80', '{}', 2)
) as m(cat_name, name, description, price, image_url, tags, ord)
where r.slug = 'paddys-kitchen'
  and cat.name = m.cat_name
  and not exists (
    select 1 from public.menu_items x
    where x.restaurant_id = r.id and x.category_id = cat.id and x.name = m.name
  );

-- 4. Modifiers (note the required groups on burgers) ---------------------------
insert into public.item_modifiers (menu_item_id, group_name, option_name, additional_price, is_required, display_order)
select i.id, g.group_name, g.option_name, g.price, g.required, g.ord
from public.menu_items i
join public.restaurants r on r.id = i.restaurant_id
cross join (values
  ('Paddy''s Stack Burger', 'Cooking level',  'Medium',        0.00, true,  0),
  ('Paddy''s Stack Burger', 'Cooking level',  'Medium rare',   0.00, true,  1),
  ('Paddy''s Stack Burger', 'Cooking level',  'Well done',     0.00, true,  2),
  ('Paddy''s Stack Burger', 'Extras',         'Extra cheese',  1.20, false, 0),
  ('Paddy''s Stack Burger', 'Extras',         'Extra bacon',   1.80, false, 1),
  ('Paddy''s Stack Burger', 'Extras',         'Fried egg',     1.50, false, 2),
  ('Classic Cheeseburger',  'Cooking level',  'Medium',        0.00, true,  0),
  ('Classic Cheeseburger',  'Cooking level',  'Well done',     0.00, true,  1),
  ('Classic Cheeseburger',  'Extras',         'Jalapeños',     0.80, false, 0),
  ('Classic Cheeseburger',  'Extras',         'Extra patty',   3.50, false, 1),
  ('Veggie Bean Burger',    'Heat level',     'Mild',          0.00, true,  0),
  ('Veggie Bean Burger',    'Heat level',     'Hot',           0.00, true,  1),
  ('Veggie Bean Burger',    'Heat level',     'Paddy hot 🔥',  0.00, true,  2),
  ('Guinness Beef Stew',    'Bread',          'Soda bread',    0.00, false, 0),
  ('Guinness Beef Stew',    'Bread',          'Garlic bread',  1.00, false, 1),
  ('Fish & Chips',          'Side swap',      'Chips',         0.00, false, 0),
  ('Fish & Chips',          'Side swap',      'Side salad',    0.50, false, 1),
  ('Roast of the Day',      'Gravy',          'Proper gravy',  0.00, false, 0),
  ('Roast of the Day',      'Gravy',          'Extra gravy',   0.80, false, 1),
  ('Hand-Cut Chips',        'Toppings',       'Cheese & gravy',2.40, false, 0),
  ('Hand-Cut Chips',        'Toppings',       'Sea salt only', 0.00, false, 1),
  ('Barista Coffee',        'Milk',           'Regular',       0.00, false, 0),
  ('Barista Coffee',        'Milk',           'Oat milk',      0.50, false, 1)
) as g(item_name, group_name, option_name, price, required, ord)
where r.slug = 'paddys-kitchen' and i.name = g.item_name
  and not exists (
    select 1 from public.item_modifiers x
    where x.menu_item_id = i.id and x.group_name = g.group_name and x.option_name = g.option_name
  );

-- 5. Tables 1–6 ----------------------------------------------------------------
insert into public.tables (restaurant_id, table_number)
select r.id, t.num
from public.restaurants r
cross join (values ('1'), ('2'), ('3'), ('4'), ('5'), ('6')) as t(num)
where r.slug = 'paddys-kitchen'
  and not exists (select 1 from public.tables x where x.restaurant_id = r.id and x.table_number = t.num);

-- 6. (Optional) Wire a staff login AFTER creating an auth user:
--    Dashboard → Authentication → Add user (email: chef@paddys.demo, password: your own)
--    then copy its UUID below.
-- insert into public.staff_members (user_id, restaurant_id, name, role)
-- select '<auth-user-uuid>', r.id, 'Paddy (Owner)', 'owner'
-- from public.restaurants r where r.slug = 'paddys-kitchen'
-- and not exists (select 1 from public.staff_members s where s.user_id = '<auth-user-uuid>');
