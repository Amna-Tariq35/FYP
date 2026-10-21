-- ============================================================================
-- About 30 real Maybelline Fit Me shades
-- ============================================================================
--
-- Paste this in the Supabase SQL editor. It is NOT applied automatically.
-- Idempotent: safe to re-run. It only inserts. It does not update any
-- existing product_shades.shade_hex or shade_key.
--
-- Source: The Pudding / TidyTuesday allShades.csv (2021-03-30), one product:
-- Maybelline, Fit Me Matte + Poreless Liquid Foundation.
-- A row was kept only when the file had both a shade name and a #RRGGBB hex.
-- Both were copied exactly. The line was sorted by the file's lightness, then
-- 30 steps were kept from lightest to darkest. No hex was blended or invented.
-- The full shade file is not stored in this repo.
-- match_hex is left null. Try-on uses shade_hex.
-- The price matches the Fit Me product already in this catalog. The shade file
-- has no price.
-- ============================================================================

insert into public.makeup_products (
  product_key,
  name,
  brand,
  category,
  main_category,
  price,
  currency,
  is_skin_friendly,
  finish,
  coverage,
  is_active,
  description,
  skin_type,
  item_form
)
select
  'fnd_maybelline_fitme_liquid',
  'Fit Me Matte + Poreless Liquid Foundation',
  'Maybelline',
  'foundation',
  'makeup',
  9.99,
  'USD',
  true,
  'matte',
  'medium',
  true,
  'Maybelline Fit Me Matte + Poreless Liquid Foundation. Shade names and swatch colours are copied from the 2021 Pudding shade dataset.',
  'All',
  'Liquid'
where not exists (
  select 1
  from public.makeup_products p
  where p.product_key = 'fnd_maybelline_fitme_liquid'
);

insert into public.product_shades (
  shade_key,
  product_key,
  shade_name,
  shade_hex,
  shade_order,
  color_family,
  skin_tone,
  undertone
)
select
  v.shade_key,
  v.product_key,
  v.shade_name,
  v.shade_hex,
  v.shade_order,
  v.color_family,
  v.skin_tone,
  v.undertone
from (
  values
  ('sh_fnd_maybelline_fitme_liquid_102', 'fnd_maybelline_fitme_liquid', 'Fair Porcelain', '#FEF3EA', 1, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_105', 'fnd_maybelline_fitme_liquid', 'Fair Ivory', '#FEEDE2', 2, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_112', 'fnd_maybelline_fitme_liquid', 'Natural Ivory', '#F6E2D5', 3, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_115', 'fnd_maybelline_fitme_liquid', 'Ivory', '#F8D3B8', 4, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_122', 'fnd_maybelline_fitme_liquid', 'Creamy Beige', '#F2C8B0', 5, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_124', 'fnd_maybelline_fitme_liquid', 'Soft Sand', '#FACCA5', 6, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_118', 'fnd_maybelline_fitme_liquid', 'Light Beige', '#EFCEAF', 7, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_235', 'fnd_maybelline_fitme_liquid', 'Pure Beige', '#EBBFA7', 8, 'Nude', 'Fair', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_220', 'fnd_maybelline_fitme_liquid', 'Natural Beige', '#EAC5A0', 9, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_128', 'fnd_maybelline_fitme_liquid', 'Warm Nude', '#EBC099', 10, 'Nude', 'Light', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_130', 'fnd_maybelline_fitme_liquid', 'Buff Beige', '#EAB392', 11, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_230', 'fnd_maybelline_fitme_liquid', 'Natural Buff', '#E8AE8A', 12, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_242', 'fnd_maybelline_fitme_liquid', 'Light Honey', '#E1A58D', 13, 'Nude', 'Light', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_238', 'fnd_maybelline_fitme_liquid', 'Rich Tan', '#DBAE90', 14, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_228', 'fnd_maybelline_fitme_liquid', 'Soft Tan', '#E0B087', 15, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_320', 'fnd_maybelline_fitme_liquid', 'Natural Tan', '#DDA482', 16, 'Nude', 'Light', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_312', 'fnd_maybelline_fitme_liquid', 'Golden', '#D89878', 17, 'Nude', 'Light', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_245', 'fnd_maybelline_fitme_liquid', 'Classic Beige', '#C29679', 18, 'Brown', 'Medium', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_330', 'fnd_maybelline_fitme_liquid', 'Toffee', '#CC8C65', 19, 'Brown', 'Medium', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_335', 'fnd_maybelline_fitme_liquid', 'Classic Tan', '#CA8B5F', 20, 'Brown', 'Medium', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_338', 'fnd_maybelline_fitme_liquid', 'Spicy Brown', '#C68462', 21, 'Brown', 'Medium', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_334', 'fnd_maybelline_fitme_liquid', 'Warm Sun', '#CC8555', 22, 'Brown', 'Medium', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_358', 'fnd_maybelline_fitme_liquid', 'Latte', '#A9725A', 23, 'Brown', 'Medium', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_355', 'fnd_maybelline_fitme_liquid', 'Coconut', '#AE6742', 24, 'Brown', 'Medium', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_356', 'fnd_maybelline_fitme_liquid', 'Warm Coconut', '#AA663D', 25, 'Brown', 'Medium', 'Warm'),
  ('sh_fnd_maybelline_fitme_liquid_360', 'fnd_maybelline_fitme_liquid', 'Mocha', '#9E6033', 26, 'Brown', 'Deep', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_362', 'fnd_maybelline_fitme_liquid', 'Truffle', '#90653E', 27, 'Brown', 'Deep', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_370', 'fnd_maybelline_fitme_liquid', 'Deep Bronze', '#8B553F', 28, 'Brown', 'Deep', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_375', 'fnd_maybelline_fitme_liquid', 'Java', '#76503C', 29, 'Brown', 'Deep', 'Neutral'),
  ('sh_fnd_maybelline_fitme_liquid_380', 'fnd_maybelline_fitme_liquid', 'Espresso', '#5B3D33', 30, 'Brown', 'Deep', 'Neutral')
) as v(
  shade_key,
  product_key,
  shade_name,
  shade_hex,
  shade_order,
  color_family,
  skin_tone,
  undertone
)
where not exists (
  select 1
  from public.product_shades s
  where s.shade_key = v.shade_key
);
