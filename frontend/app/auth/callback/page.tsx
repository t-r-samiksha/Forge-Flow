import { Suspense } from "react";
import AuthCallback from "@/components/auth/AuthCallback";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
