// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  // Add providers as needed; empty array for now
  providers: [],
  // You can customize callbacks, pages, etc.
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
