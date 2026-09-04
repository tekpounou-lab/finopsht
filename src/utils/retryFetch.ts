export const retryPromise = async <T>(promiseFn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await promiseFn();
    } catch (e: any) {
      if (i === maxRetries - 1) throw e;
      if (e?.message?.includes("client is offline") || e?.message?.includes("Failed to get document")) {
        console.warn(`Retry ${i + 1}/${maxRetries} after error: ${e.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw e; // Fail fast for permission/other errors
      }
    }
  }
  throw new Error("unreachable");
};
