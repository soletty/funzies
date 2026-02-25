import { cookies } from "next/headers";

const PULSE_ACCESS_CODE = process.env.PULSE_ACCESS_CODE || "pulse2026";
const COOKIE_NAME = "pulse_access";

export async function hasPulseAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === "granted";
}

export function verifyAccessCode(code: string): boolean {
  return code === PULSE_ACCESS_CODE;
}

export { COOKIE_NAME };
