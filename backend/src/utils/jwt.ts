import jwt from "jsonwebtoken";

const SECRET_KEY = "zhitu_jwt_secret_key";
const EXPIRES_IN = "7d";

export function generateToken(payload: object): string {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (err) {
    return null;
  }
}
