import test from "node:test";
import assert from "node:assert/strict";
import { getExperienceLabel } from "./experience.ts";

test("getExperienceLabel extracts common JD year requirements", () => {
  assert.equal(
    getExperienceLabel("SRE", "You have 3+ years of experience in infrastructure engineering."),
    "3+ yrs"
  );
  assert.equal(
    getExperienceLabel(
      "Fullstack Engineer",
      "OUR IDEAL SOFTWARE ENGINEER WILL HAVE: 4 + years of industry experience designing and building scalable web applications."
    ),
    "4+ yrs"
  );
  assert.equal(
    getExperienceLabel("SRE", "Minimum of 5 years experience with distributed systems."),
    "5+ yrs"
  );
  assert.equal(
    getExperienceLabel("SRE", "Proven track record (6+ years) of architecting large-scale distributed systems."),
    "6+ yrs"
  );
  assert.equal(
    getExperienceLabel("SRE", "At least 2 years of experience with monitoring and observability."),
    "2+ yrs"
  );
});