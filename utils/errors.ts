export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type NormalizedError = Error & { status?: string | number; code?: string | number };

export function toError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return error as NormalizedError;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error(getErrorMessage(error)) as NormalizedError;
}
