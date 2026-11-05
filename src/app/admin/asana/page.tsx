import { redirect } from "next/navigation";

/** Now a tab of Admin → Configuration; old links land there. */
export default function Page() {
  redirect("/admin/config?tab=asana");
}
