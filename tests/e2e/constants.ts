export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/vocal_impact_test";
export const E2E_ADMIN = {
  name: "Echo Admin",
  email: "e2e-admin@iit.ac.lk",
  password: "e2e-password-123",
};
export const STORAGE_STATE = "playwright/.auth/admin.json";

/** A choir member with an ordinary MEMBER login (no committee powers). */
export const E2E_MEMBER = {
  firstName: "Mala",
  lastName: "Member",
  email: "mala.member@iit.ac.lk",
  password: "e2e-member-password",
};
export const MEMBER_STORAGE_STATE = "playwright/.auth/member.json";

/** An alumna who is still on the committee: signs in with alumni access and organises alumni practices. */
export const E2E_ALUMNA = {
  firstName: "Asha",
  lastName: "Alumna",
  email: "asha.alumna@iit.ac.lk",
  password: "e2e-alumna-password",
};
export const ALUMNA_STORAGE_STATE = "playwright/.auth/alumna.json";

/** Public test-only key for encrypted fields (same as the integration tests). */
export const E2E_DATA_ENCRYPTION_KEY = "dGVzdC1vbmx5LWtleS1kby1ub3QtdXNlLWFueXdoZXI=";
