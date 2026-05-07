-- Deduplicate checklist rows while preferring active rows, then oldest id.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY community_id, template_key
      ORDER BY
        CASE
          WHEN deleted_at IS NULL THEN 0
          ELSE 1
        END,
        id
    ) AS rank
  FROM compliance_checklist_items
)
DELETE FROM compliance_checklist_items
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rank > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_checklist_community_template_key_active" ON "compliance_checklist_items" USING btree ("community_id","template_key") WHERE "compliance_checklist_items"."deleted_at" is null;
