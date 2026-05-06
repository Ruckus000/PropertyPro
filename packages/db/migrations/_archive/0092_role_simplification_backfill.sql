-- Migration 0092: Role Simplification — Backfill role_v2, is_unit_owner, permissions, metadata
-- Depends on 0091 (new columns). This is a data-only migration.

-- Step 1: Backfill role_v2, is_unit_owner, legacy_role, display_title, preset_key for ALL rows
UPDATE "public"."user_roles" SET
  legacy_role = role::text,
  role_v2 = CASE
    WHEN role IN ('owner', 'tenant') THEN 'resident'::"public"."user_role_v2"
    WHEN role = 'property_manager_admin' THEN 'pm_admin'::"public"."user_role_v2"
    ELSE 'manager'::"public"."user_role_v2"
  END,
  is_unit_owner = (role = 'owner'),
  preset_key = CASE role::text
    WHEN 'board_member' THEN 'board_member'
    WHEN 'board_president' THEN 'board_president'
    WHEN 'cam' THEN 'cam'
    WHEN 'site_manager' THEN 'site_manager'
    ELSE NULL
  END,
  display_title = CASE role::text
    WHEN 'owner' THEN 'Owner'
    WHEN 'tenant' THEN 'Resident'
    WHEN 'board_member' THEN 'Board Member'
    WHEN 'board_president' THEN 'Board President'
    WHEN 'cam' THEN 'Community Association Manager'
    WHEN 'site_manager' THEN 'Site Manager'
    WHEN 'property_manager_admin' THEN 'Property Manager Admin'
  END;

-- Step 2: Backfill permissions JSONB for manager roles (community-type-aware).
-- Each UPDATE targets (legacy_role, community_type) pairs via a JOIN on communities.

-- board_member in condo_718 / hoa_720
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":true,"write":true},"meetings":{"read":true,"write":true},"announcements":{"read":true,"write":true},"residents":{"read":true,"write":true},"settings":{"read":true,"write":false},"audit":{"read":true,"write":false},"compliance":{"read":true,"write":true},"maintenance":{"read":true,"write":true},"contracts":{"read":true,"write":true},"finances":{"read":true,"write":false},"violations":{"read":true,"write":true},"arc_submissions":{"read":true,"write":false},"polls":{"read":true,"write":true},"work_orders":{"read":true,"write":true},"amenities":{"read":true,"write":false},"packages":{"read":false,"write":false},"visitors":{"read":false,"write":false},"calendar_sync":{"read":false,"write":false},"accounting":{"read":false,"write":false},"esign":{"read":true,"write":true}},"document_categories":"all","can_manage_roles":false,"can_manage_settings":false,"is_board_member":true}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'board_member'
  AND c.community_type IN ('condo_718', 'hoa_720');

-- board_member in apartment (all-deny — role not valid in apartments but may exist)
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":false,"write":false},"meetings":{"read":false,"write":false},"announcements":{"read":false,"write":false},"residents":{"read":false,"write":false},"settings":{"read":false,"write":false},"audit":{"read":false,"write":false},"compliance":{"read":false,"write":false},"maintenance":{"read":false,"write":false},"contracts":{"read":false,"write":false},"finances":{"read":false,"write":false},"violations":{"read":false,"write":false},"arc_submissions":{"read":false,"write":false},"polls":{"read":false,"write":false},"work_orders":{"read":false,"write":false},"amenities":{"read":false,"write":false},"packages":{"read":false,"write":false},"visitors":{"read":false,"write":false},"calendar_sync":{"read":false,"write":false},"accounting":{"read":false,"write":false},"esign":{"read":false,"write":false}},"document_categories":"all","can_manage_roles":false,"can_manage_settings":false,"is_board_member":true}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'board_member'
  AND c.community_type = 'apartment';

-- board_president in condo_718 / hoa_720
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":true,"write":true},"meetings":{"read":true,"write":true},"announcements":{"read":true,"write":true},"residents":{"read":true,"write":true},"settings":{"read":true,"write":true},"audit":{"read":true,"write":false},"compliance":{"read":true,"write":true},"maintenance":{"read":true,"write":true},"contracts":{"read":true,"write":true},"finances":{"read":true,"write":true},"violations":{"read":true,"write":true},"arc_submissions":{"read":true,"write":true},"polls":{"read":true,"write":true},"work_orders":{"read":true,"write":true},"amenities":{"read":true,"write":true},"packages":{"read":true,"write":true},"visitors":{"read":true,"write":true},"calendar_sync":{"read":true,"write":true},"accounting":{"read":false,"write":false},"esign":{"read":true,"write":true}},"document_categories":"all","can_manage_roles":true,"can_manage_settings":true,"is_board_member":true}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'board_president'
  AND c.community_type IN ('condo_718', 'hoa_720');

-- board_president in apartment (all-deny)
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":false,"write":false},"meetings":{"read":false,"write":false},"announcements":{"read":false,"write":false},"residents":{"read":false,"write":false},"settings":{"read":false,"write":false},"audit":{"read":false,"write":false},"compliance":{"read":false,"write":false},"maintenance":{"read":false,"write":false},"contracts":{"read":false,"write":false},"finances":{"read":false,"write":false},"violations":{"read":false,"write":false},"arc_submissions":{"read":false,"write":false},"polls":{"read":false,"write":false},"work_orders":{"read":false,"write":false},"amenities":{"read":false,"write":false},"packages":{"read":false,"write":false},"visitors":{"read":false,"write":false},"calendar_sync":{"read":false,"write":false},"accounting":{"read":false,"write":false},"esign":{"read":false,"write":false}},"document_categories":"all","can_manage_roles":true,"can_manage_settings":true,"is_board_member":true}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'board_president'
  AND c.community_type = 'apartment';

-- cam in condo_718 / hoa_720
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":true,"write":true},"meetings":{"read":true,"write":true},"announcements":{"read":true,"write":true},"residents":{"read":true,"write":true},"settings":{"read":true,"write":false},"audit":{"read":true,"write":false},"compliance":{"read":true,"write":true},"maintenance":{"read":true,"write":true},"contracts":{"read":true,"write":true},"finances":{"read":true,"write":true},"violations":{"read":true,"write":true},"arc_submissions":{"read":true,"write":true},"polls":{"read":true,"write":true},"work_orders":{"read":true,"write":true},"amenities":{"read":true,"write":true},"packages":{"read":true,"write":true},"visitors":{"read":true,"write":true},"calendar_sync":{"read":true,"write":true},"accounting":{"read":true,"write":true},"esign":{"read":true,"write":true}},"document_categories":["rules","inspection_reports","announcements","meeting_minutes"],"can_manage_roles":true,"can_manage_settings":false,"is_board_member":false}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'cam'
  AND c.community_type IN ('condo_718', 'hoa_720');

-- cam in apartment (all-deny)
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":false,"write":false},"meetings":{"read":false,"write":false},"announcements":{"read":false,"write":false},"residents":{"read":false,"write":false},"settings":{"read":false,"write":false},"audit":{"read":false,"write":false},"compliance":{"read":false,"write":false},"maintenance":{"read":false,"write":false},"contracts":{"read":false,"write":false},"finances":{"read":false,"write":false},"violations":{"read":false,"write":false},"arc_submissions":{"read":false,"write":false},"polls":{"read":false,"write":false},"work_orders":{"read":false,"write":false},"amenities":{"read":false,"write":false},"packages":{"read":false,"write":false},"visitors":{"read":false,"write":false},"calendar_sync":{"read":false,"write":false},"accounting":{"read":false,"write":false},"esign":{"read":false,"write":false}},"document_categories":[],"can_manage_roles":true,"can_manage_settings":false,"is_board_member":false}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'cam'
  AND c.community_type = 'apartment';

-- site_manager in condo_718 / hoa_720 (all-deny — role not valid outside apartments)
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":false,"write":false},"meetings":{"read":false,"write":false},"announcements":{"read":false,"write":false},"residents":{"read":false,"write":false},"settings":{"read":false,"write":false},"audit":{"read":false,"write":false},"compliance":{"read":false,"write":false},"maintenance":{"read":false,"write":false},"contracts":{"read":false,"write":false},"finances":{"read":false,"write":false},"violations":{"read":false,"write":false},"arc_submissions":{"read":false,"write":false},"polls":{"read":false,"write":false},"work_orders":{"read":false,"write":false},"amenities":{"read":false,"write":false},"packages":{"read":false,"write":false},"visitors":{"read":false,"write":false},"calendar_sync":{"read":false,"write":false},"accounting":{"read":false,"write":false},"esign":{"read":false,"write":false}},"document_categories":[],"can_manage_roles":true,"can_manage_settings":false,"is_board_member":false}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'site_manager'
  AND c.community_type IN ('condo_718', 'hoa_720');

-- site_manager in apartment
UPDATE "public"."user_roles" ur SET permissions = '{"resources":{"documents":{"read":true,"write":true},"meetings":{"read":false,"write":false},"announcements":{"read":true,"write":true},"residents":{"read":true,"write":true},"settings":{"read":true,"write":false},"audit":{"read":true,"write":false},"compliance":{"read":false,"write":false},"maintenance":{"read":true,"write":true},"contracts":{"read":true,"write":true},"finances":{"read":true,"write":true},"violations":{"read":false,"write":false},"arc_submissions":{"read":false,"write":false},"polls":{"read":true,"write":true},"work_orders":{"read":true,"write":true},"amenities":{"read":true,"write":true},"packages":{"read":true,"write":true},"visitors":{"read":true,"write":true},"calendar_sync":{"read":true,"write":true},"accounting":{"read":true,"write":true},"esign":{"read":true,"write":true}},"document_categories":["rules","announcements","maintenance_records"],"can_manage_roles":true,"can_manage_settings":false,"is_board_member":false}'::jsonb
FROM "public"."communities" c
WHERE ur.community_id = c.id
  AND ur.role = 'site_manager'
  AND c.community_type = 'apartment';
