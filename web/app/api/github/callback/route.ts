import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { encryptApiKey } from "@/lib/crypto";
import { query } from "@/lib/db";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.redirect(new URL("/?github=error", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("github_oauth_state")?.value;
  cookieStore.delete("github_oauth_state");

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?github=error", request.url));
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/?github=error", request.url));
  }

  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "IntellectualAssembly",
    },
  });

  if (!profileRes.ok) {
    return NextResponse.redirect(new URL("/?github=error", request.url));
  }

  const profile = await profileRes.json();
  const { encrypted, iv } = encryptApiKey(tokenData.access_token);

  await query(
    `INSERT INTO github_connections (user_id, github_username, github_avatar_url, encrypted_token, token_iv)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       github_username = $2,
       github_avatar_url = $3,
       encrypted_token = $4,
       token_iv = $5,
       connected_at = now()`,
    [user.id, profile.login, profile.avatar_url, encrypted, iv]
  );

  return NextResponse.redirect(new URL("/?github=connected", request.url));
}
