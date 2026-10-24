import { describe, expect, it } from "vitest";
import { can_access } from "../src/domain/permissions.js";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const PROJECT_B = "10000000-0000-4000-8000-000000000002";

describe("can_access (unit)", () => {
  it("allows global resources for any actor", () => {
    expect(can_access(USER_A, null, null, null)).toBe(true);
    expect(can_access(USER_B, PROJECT_A, null, null)).toBe(true);
  });

  it("denies when resource user_id does not match actor", () => {
    expect(can_access(USER_A, null, USER_B, null)).toBe(false);
  });

  it("denies when resource project_id does not match actor", () => {
    expect(can_access(USER_A, PROJECT_A, USER_A, PROJECT_B)).toBe(false);
  });

  it("allows when user and project both match", () => {
    expect(can_access(USER_A, PROJECT_A, USER_A, PROJECT_A)).toBe(true);
  });
});
