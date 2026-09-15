-- Phase 3 category cleanup: normalize existing catalog values.
-- Current data uses makeup/skincare as main departments; treatment remains a skincare category.

update public.makeup_products
set category = lower(regexp_replace(trim(category), '[[:space:]-]+', '_', 'g'))
where category is not null;

update public.makeup_products
set main_category = lower(trim(main_category))
where main_category is not null;

update public.makeup_products
set category = 'eye_cream'
where category = 'eyecream';

update public.makeup_products
set main_category = 'skincare'
where category in ('cleanser', 'eye_cream', 'lash_care', 'moisturizer', 'sunscreen', 'treatment');

update public.makeup_products
set main_category = 'makeup'
where category in ('blush', 'eyelashes', 'eyeliner', 'eyeshadow', 'foundation', 'highlighter', 'lip_gloss', 'lipstick', 'mascara');
