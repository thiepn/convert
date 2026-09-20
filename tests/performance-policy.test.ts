import { describe,expect,it } from "vitest";
import { memoryPreflight,recommendedBatchParallelism } from "../src/core/performance/Budget";
import { deriveDeviceProfile,memoryBackedSourceLimit } from "../src/core/performance/DeviceProfile";
import { estimateRouteResources } from "../src/core/performance/LargeFilePolicy";
import type { ConversionEdge } from "../src/core/planner/ConversionGraph";

const MiB=1024*1024;
const GiB=1024*MiB;

describe("Phase 9 device performance policy",()=>{
  it("derives conservative mobile and powerful profiles from device signals",()=>{
    const mobile=deriveDeviceProfile({
      hardwareConcurrency:8,
      deviceMemoryGB:4,
      coarsePointer:true,
      viewportWidth:412,
      opfs:true,
      crossOriginIsolated:true
    });
    expect(mobile.tier).toBe("mobile");
    expect(mobile.mobileLike).toBe(true);
    expect(mobile.maxBatchParallelism).toBe(1);

    const powerful=deriveDeviceProfile({
      hardwareConcurrency:16,
      deviceMemoryGB:16,
      coarsePointer:false,
      viewportWidth:1440,
      opfs:true,
      crossOriginIsolated:true
    });
    expect(powerful.tier).toBe("powerful");
    expect(powerful.maxBatchParallelism).toBe(3);
    expect(powerful.workingSetBudgetBytes).toBeGreaterThan(mobile.workingSetBudgetBytes);
  });

  it("scales memory-backed source limits with operation multiplier",()=>{
    const balanced=deriveDeviceProfile({
      hardwareConcurrency:8,
      deviceMemoryGB:8,
      coarsePointer:false,
      viewportWidth:1280,
      opfs:true,
      crossOriginIsolated:true
    });
    const twoX=memoryBackedSourceLimit(2,2*GiB,balanced);
    const sixX=memoryBackedSourceLimit(6,2*GiB,balanced);
    expect(twoX).toBeGreaterThan(sixX);
    expect(sixX).toBeGreaterThan(64*MiB);
  });

  it("rejects working sets above a device budget",()=>{
    const constrained=deriveDeviceProfile({
      hardwareConcurrency:2,
      deviceMemoryGB:2,
      coarsePointer:true,
      viewportWidth:360,
      opfs:false,
      crossOriginIsolated:false
    });
    expect(memoryPreflight(300*MiB,constrained).safe).toBe(true);
    expect(memoryPreflight(400*MiB,constrained).safe).toBe(false);
    expect(recommendedBatchParallelism(constrained)).toBe(1);
  });

  it("allows multi-gigabyte streaming sources without charging source size to RAM",()=>{
    const profile=deriveDeviceProfile({
      hardwareConcurrency:8,
      deviceMemoryGB:8,
      coarsePointer:false,
      viewportWidth:1280,
      opfs:true,
      crossOriginIsolated:true
    });
    const edge:ConversionEdge={
      from:"mp4",to:"webm-media",engineId:"mediabunny",
      qualityLoss:0,metadataLoss:[],temporaryMultiplier:1.1,streaming:true
    };
    const plan=estimateRouteResources(
      5*GiB,
      [edge],
      [{
        temporaryBytes:256*MiB,
        memoryBytes:256*MiB,
        workspaceBytes:6*GiB,
        outputBytes:5*GiB,
        sourceAccess:"streaming",
        outputAccess:"streaming",
        notes:["streaming"]
      }],
      profile
    );
    expect(plan.streamingInput).toBe(true);
    expect(plan.memoryBytes).toBe(256*MiB);
    expect(plan.workspaceBytes).toBe(6*GiB);
    expect(plan.largeFileMode).toBe(true);
  });
});
