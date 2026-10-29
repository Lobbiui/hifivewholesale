UPDATE organizations AS organization
SET business_phone = COALESCE(
      NULLIF(BTRIM(organization.business_phone), ''),
      NULLIF(BTRIM(application.business_phone), '')
    ),
    business_type = COALESCE(
      NULLIF(BTRIM(organization.business_type), ''),
      NULLIF(BTRIM(application.business_type), '')
    ),
    updated_at = CURRENT_TIMESTAMP
FROM buyer_applications AS application
WHERE application.organization_id = organization.id
  AND organization.organization_type = 'WHOLESALE_BUYER'
  AND (
    (
      NULLIF(BTRIM(organization.business_phone), '') IS NULL
      AND NULLIF(BTRIM(application.business_phone), '') IS NOT NULL
    )
    OR
    (
      NULLIF(BTRIM(organization.business_type), '') IS NULL
      AND NULLIF(BTRIM(application.business_type), '') IS NOT NULL
    )
  );
