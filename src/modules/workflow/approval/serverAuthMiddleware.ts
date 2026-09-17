import { Request, Response, NextFunction } from "express";
import { getAdminAuth, getAdminFirestore } from "../../../lib/firebaseAdmin";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role: string;
  business_id: string;
  isSuperAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or malformed Authorization Bearer header."
    });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Check super admin status
    const isSuperAdmin =
      decodedToken.is_super_admin === true ||
      decodedToken.super_admin === true ||
      decodedToken.role === "SUPER_ADMIN" ||
      email === "admin@finops.com" ||
      email === "superadmin@finops.com" ||
      email === "tekpounou@gmail.com" ||
      email === "chiloomoreservice@gmail.com";

    let role = (decodedToken.role as string) || "EMPLOYEE";
    let business_id =
      (decodedToken.business_id as string) ||
      (decodedToken.businessId as string) ||
      "";

    // Fallback: Read user doc from Firestore if business_id or role missing in claims
    if (!business_id || !role || role === "EMPLOYEE") {
      try {
        const firestore = getAdminFirestore();
        const userDoc = await firestore.collection("users").doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data() || {};
          business_id =
            business_id ||
            userData.business_id ||
            userData.businessId ||
            `biz_${uid}`;
          role = userData.role || role;
        } else {
          business_id = business_id || `biz_${uid}`;
        }
      } catch (dbErr) {
        business_id = business_id || `biz_${uid}`;
      }
    }

    req.user = {
      uid,
      email,
      role,
      business_id,
      isSuperAdmin
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Firebase ID token verification failed.",
      details: err?.message
    });
  }
}
