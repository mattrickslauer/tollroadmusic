// The artist sign-up moved to /artist/join (the (artist) route group). Keep the
// old /signup URL working by redirecting.
import { redirect } from "next/navigation";

export default function SignupRedirect() {
  redirect("/artist/join");
}
