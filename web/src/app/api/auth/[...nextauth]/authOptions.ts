import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { upsertUser } from "@/server/sheets";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, account, profile }) {
      // Guarda el sub (ID de Google) en el token la primera vez
      if (account && profile) token.sub = token.sub || (profile as any).sub;
      return token;
    },
    async session({ session, token }) {
      // Expón uid en session.user de forma tipada (ya ampliamos tipos antes)
      if (session.user) session.user.uid = token.sub;
      return session;
    },
  },

  events: {
    // Se ejecuta en servidor cuando un usuario inicia sesión con éxito
    async signIn({ user, account, profile }) {
      try {
        const uid =
          (account?.providerAccountId as string | undefined) ||
          ((profile as any)?.sub as string | undefined);

        if (!uid) return;

        await upsertUser({
          uid,
          email: user.email,
          name: user.name,
          image: user.image,
        });
      } catch (err) {
        // No rompemos el login si falla la escritura en Sheets; solo log
        console.error("Users upsert failed:", err);
      }
    },
  },
};