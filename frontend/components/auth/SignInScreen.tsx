"use client";

import { useSearchParams } from "next/navigation";
import SignInForm from "./SignInForm";

/** Full-page sign-in — the real redirect target on a 401 from any
 * protected API call (§36), and a normal link destination too. Same
 * SignInForm the header dropdown uses, just not tucked in a menu. */
export default function SignInScreen() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;

  return (
    <div className="mx-auto max-w-[420px] px-6 py-24">
      <div
        className="rounded-2xl border border-line p-[26px]"
        style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
      >
        <h1 className="mb-1 font-display text-lg font-semibold">Sign in to ForgeFlow</h1>
        <p className="mb-5 font-mono text-[11.5px] text-mute">
          Real email sign-in — no password, no simulated identity.
        </p>
        <SignInForm next={next} />
      </div>
    </div>
  );
}
