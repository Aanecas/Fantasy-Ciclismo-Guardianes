import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  // Extiende el tipo Session para incluir uid
  interface Session {
    user: {
      uid?: string;            // nuestro ID de Google (token.sub)
      name?: string | null;
      email?: string | null;
      image?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  // Extiende el JWT para asegurar sub/uid
  interface JWT {
    sub?: string;   // viene del proveedor (Google)
  }
}
