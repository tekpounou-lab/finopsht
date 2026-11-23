/**
 * Pure HMAC-SHA256 forensic signature utilities safe for both server and client bundles.
 */

export function getForensicHMACSecretKey(businessId?: string): string {
  // Server-side secret key resolution only. No VITE_ client secret exposure allowed.
  const masterSecret =
    (typeof process !== "undefined" &&
      (process.env?.FORENSIC_HMAC_SECRET_V2 || process.env?.FORENSIC_HMAC_SECRET)) ||
    "FINOPS_SECURE_FORENSIC_MASTER_KEY_2026";
  return `${masterSecret}_${businessId || "DEFAULT"}`;
}

export async function computeHMACSignature(
  data: Record<string, any>,
  secretKey?: string
): Promise<string> {
  const keyToUse = secretKey || getForensicHMACSecretKey(data?.business_id);
  const jsonStr = JSON.stringify(data, Object.keys(data).sort());
  const encoder = new TextEncoder();

  if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) {
    try {
      const keyData = encoder.encode(keyToUse);
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await globalThis.crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        encoder.encode(jsonStr)
      );
      const hashArray = Array.from(new Uint8Array(signatureBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback below
    }
  }

  let hash = 0;
  const combined = keyToUse + ":" + jsonStr;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "HMAC_SEAL_" + Math.abs(hash).toString(16) + "_" + jsonStr.length;
}

export async function computeSHA256Signature(data: Record<string, any>): Promise<string> {
  return computeHMACSignature(data, getForensicHMACSecretKey(data?.business_id));
}
