-- Drop Client, Subscription, AuditLog models and associated enums
-- (removed from self-host schema — single-tenant has no billing/admin layer)

-- Drop tables (subscriptions references client via FK, so drop subscriptions first)
DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "Subscription";
DROP TABLE IF EXISTS "Client";

-- Drop enums
DROP TYPE IF EXISTS "Plan";
DROP TYPE IF EXISTS "ClientStatus";
DROP TYPE IF EXISTS "SubscriptionStatus";
