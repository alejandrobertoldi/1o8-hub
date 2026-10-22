import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role:
        | "owner"
        | "super_admin"
        | "admin"
        | "editor"
        | "viewer"
        | "client"
        | "pending"
        | "prospect";
      /** True when role is owner or super_admin (derived; also dual-read from legacy flag). */
      isSuperAdmin: boolean;
      allowedSections: string[];
      clientIdCode?: string | null;
      // aac.client_status for the user's (first) client code; "Prospect" => show demo data
      clientStatus?: string | null;
    };
  }
}
