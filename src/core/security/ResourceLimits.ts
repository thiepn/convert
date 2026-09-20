import { assertDecodedImageBudget } from "../performance/Budget";

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

export function assertSafeImageDimensions(width?: number, height?: number): void {
  if (!width || !height) return;
  try {
    assertDecodedImageBudget(width,height,1,4);
  } catch(error) {
    throw new ResourceLimitError(error instanceof Error?error.message:String(error));
  }
}
