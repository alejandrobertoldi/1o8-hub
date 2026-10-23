import { redirect } from "next/navigation";

// The hub opens on My Dashboard. The clients list lives at /clients.
// (Client-role users never reach this: the proxy keeps them on /portal.)
export default function Home() {
  redirect("/me");
}
