import { redirect } from "next/navigation";

// specs/00-foundation.md §8: "/" redirects to /documents or /login.
// Until auth lands (T05), send everyone to /login.
export default function Home() {
  redirect("/login");
}
