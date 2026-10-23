-- Initial reference data and the first scheduled tour.
-- Facts not supplied by the company (seat capacity, child price, return
-- time, duration, booking deadline, cancellation policy, contact email)
-- are intentionally left NULL so an administrator can complete them.

INSERT INTO tour_categories (name, slug, description, sort_order) VALUES
  ('Weekend Escapes', 'weekend-escapes', 'Short, restorative trips out of the city.', 1),
  ('Nature & Farm Tours', 'nature-farm-tours', 'Farms, gardens, forests and the outdoors.', 2),
  ('Cultural Experiences', 'cultural-experiences', 'Heritage, communities, food and craft.', 3),
  ('Day Trips', 'day-trips', 'Guided excursions that return the same day.', 4),
  ('Wildlife & Safari', 'wildlife-safari', 'National parks and wildlife encounters.', 5),
  ('Group & Corporate', 'group-corporate', 'Team outings and private group travel.', 6);

INSERT INTO site_settings (key, value) VALUES
  ('company_name', '"Her Journey Tours and Travels"'),
  ('tagline', '"Journeys crafted with care across Rwanda"'),
  ('phone_primary', '"0783937619"'),
  ('phone_secondary', '"0789221347"'),
  ('whatsapp_number', '"+250783937619"'),
  ('contact_email', '""'),
  ('address', '""'),
  ('momo_pay_code', '"2262157"'),
  ('momo_merchant_name', '"Her Journey Tours and Travels"'),
  ('booking_hold_minutes', '120'),
  ('hero_title', '"Discover Rwanda, one unforgettable journey at a time"'),
  ('hero_subtitle', '"Guided tours, weekend escapes and scheduled trips. Choose your date, reserve your seat and pay securely with MoMo Pay."'),
  ('hero_image_key', 'null'),
  ('about_text', '"Her Journey Tours and Travels designs guided trips that let you slow down and experience the landscapes, food and people of Rwanda. Every trip is planned end to end: transport, guiding, entrance fees and meals, so you can simply enjoy the journey."'),
  ('social_instagram', '""'),
  ('social_facebook', '""'),
  ('social_tiktok', '""');

INSERT INTO tours (
  slug, title, short_description, description, category_id, status, is_featured, is_popular,
  destination, country, district_province, location, operator_name,
  departure_time, pickup_location,
  currency, pricing_basis, adult_price,
  meals, transportation, entrance_fees, guide_info,
  booking_phone, alternative_phone, booking_open,
  seo_title, seo_description, published_at
) VALUES (
  'eagle-view-farm-bugesera-weekend-escape',
  'Eagle View Farm Bugesera Weekend Escape',
  'A guided escape to Eagle View Farm in Bugesera with a farm visit, nature walks, a photoshoot, time to relax and lunch at Yellow Elephant Coffee.',
  'Leave the city behind for a relaxed, fully guided trip to Eagle View Farm in Bugesera, Rwanda.' || char(10) || char(10) ||
  'We depart at 7:00 AM from Rubis Gisementi Station. At the farm you will enjoy a guided farm visit, nature walks through the surrounding landscape, a photoshoot and unhurried time to relax. Lunch is served at Yellow Elephant Coffee.' || char(10) || char(10) ||
  'Transportation, entrance fees, guiding fees and lunch are all included in the price, so all you need to do is book your seat and enjoy the day.',
  (SELECT id FROM tour_categories WHERE slug = 'weekend-escapes'),
  'published', 1, 0,
  'Eagle View Farm, Bugesera', 'Rwanda', 'Bugesera District, Eastern Province', 'Eagle View Farm, Bugesera',
  'Her Journey Tours and Travels',
  '07:00', 'Rubis Gisementi Station',
  'RWF', 'per_person', 41000,
  'Lunch at Yellow Elephant Coffee', 'Transportation included, departing from Rubis Gisementi Station', 'Entrance fees included', 'Guiding fees included',
  '0783937619', '0789221347', 1,
  'Eagle View Farm Bugesera Weekend Escape | Her Journey Tours',
  'Guided trip to Eagle View Farm, Bugesera on 15 November 2026. Transport, entrance, guiding and lunch at Yellow Elephant Coffee included. 41,000 RWF per person.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO tour_list_items (tour_id, kind, text, sort_order) VALUES
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Entrance fees', 1),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Lunch at Yellow Elephant Coffee', 2),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Transportation', 3),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Guiding fees', 4),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Farm visit', 5),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Photoshoot', 6),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Relaxation', 7),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'included', 'Nature walks', 8),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'activity', 'Farm visit', 1),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'activity', 'Nature walks', 2),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'activity', 'Photoshoot', 3),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'activity', 'Relaxation', 4),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'highlight', 'Guided visit to Eagle View Farm in Bugesera', 1),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'highlight', 'Lunch at Yellow Elephant Coffee', 2),
  ((SELECT id FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape'), 'highlight', 'Nature walks and a photoshoot', 3);

INSERT INTO tour_departures (tour_id, start_date, departure_time, status)
SELECT id, '2026-11-15', '07:00', 'scheduled'
FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape';

-- Illustrated placeholders until real photographs are uploaded.
INSERT INTO tour_images (tour_id, kind, external_url, alt_text, is_placeholder, sort_order)
SELECT id, 'cover', '/images/placeholders/farm-hills.svg', 'Illustration of green farmland and hills at sunrise', 1, 0
FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape';
INSERT INTO tour_images (tour_id, kind, external_url, alt_text, is_placeholder, sort_order)
SELECT id, 'gallery', '/images/placeholders/lake-view.svg', 'Illustration of a lake framed by rolling hills', 1, 1
FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape';
INSERT INTO tour_images (tour_id, kind, external_url, alt_text, is_placeholder, sort_order)
SELECT id, 'gallery', '/images/placeholders/nature-walk.svg', 'Illustration of a winding trail through the countryside', 1, 2
FROM tours WHERE slug = 'eagle-view-farm-bugesera-weekend-escape';
