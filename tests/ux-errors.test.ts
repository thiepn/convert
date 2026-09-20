import { describe,expect,it } from "vitest";
import { friendlyIssueText,presentIssue } from "../src/core/ux/errors";

describe("Phase 10 user-facing error presentation",()=>{
  it("turns memory guard codes into actionable language",()=>{
    const issue=presentIssue(new Error("DEVICE_MEMORY_LIMIT: PDF operation exceeds budget."));
    expect(issue.title).toBe("File is too large for this device");
    expect(issue.message).not.toContain("DEVICE_MEMORY_LIMIT");
    expect(issue.recovery).toMatch(/Sequential|smaller/i);
  });

  it("explains validation failures without exposing an internal-only code",()=>{
    expect(friendlyIssueText("OUTPUT_INVALID: parser mismatch")).toContain("Output validation failed");
    expect(friendlyIssueText("OUTPUT_INVALID: parser mismatch")).not.toContain("OUTPUT_INVALID");
  });

  it("preserves useful unknown messages while stripping code prefixes",()=>{
    const issue=presentIssue("SOMETHING_NEW: useful diagnostic");
    expect(issue.code).toBe("SOMETHING_NEW");
    expect(issue.message).toBe("useful diagnostic");
  });

  it("does not treat ordinary uppercase warning words as error codes",()=>{
    expect(presentIssue("RAW conversion extracts an embedded JPEG preview.").code).toBeNull();
    expect(presentIssue("PSD output is flattened.").code).toBeNull();
  });

  it("recognizes planner no-route wording",()=>{
    expect(presentIssue("No local conversion route is available on this browser.").code).toBe("NO_LOCAL_ROUTE");
  });
});
