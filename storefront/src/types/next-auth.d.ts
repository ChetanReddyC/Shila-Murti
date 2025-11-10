import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    customerId?: string;
    user: {
      originalEmail?: string;
      originalPhone?: string;
      phone?: string;
      id?: string;
    } & DefaultSession["user"];
  }

  interface User {
    originalEmail?: string;
    originalPhone?: string;
    phone?: string;
    id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    customerId?: string;
    originalEmail?: string;
    originalPhone?: string;
    phone?: string;
    id?: string;
  }
}
