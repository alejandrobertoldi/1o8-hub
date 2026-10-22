import jwt from "jsonwebtoken";

function getSecret(): string {
  const s = process.env.MONTHLY_REPORT_JWT_SECRET;
  if (!s) throw new Error("MONTHLY_REPORT_JWT_SECRET is not set");
  return s;
}

export function signReportToken(payload: object): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "5m", algorithm: "HS256" });
}

export function verifyReportToken<T>(token: string): T {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as T;
}
