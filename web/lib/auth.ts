import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const rows = await query<UserRow>(
          "SELECT id, email, name, password_hash FROM users WHERE email = $1",
          [email]
        );

        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email;
        if (!email) return false;

        const existing = await query<UserRow>(
          "SELECT id FROM users WHERE email = $1",
          [email]
        );

        if (existing.length === 0) {
          const rows = await query<{ id: string }>(
            "INSERT INTO users (id, email, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id",
            [email, user.name ?? null]
          );
          user.id = rows[0].id;
        } else {
          user.id = existing[0].id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
