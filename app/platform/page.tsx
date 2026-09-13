import PlatformApp from "@/components/platform-app";
import AuthGate from "@/components/auth-gate";

// The platform shell must always arrive with the current asset references.
// This avoids a stale HTML document pointing at an older hashed CSS file.
export const dynamic = "force-dynamic";

export default function PlatformPage() {
  return <AuthGate><PlatformApp /></AuthGate>;
}
