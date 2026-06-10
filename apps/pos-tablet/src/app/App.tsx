import { useEffect, useState } from "react";
import { ToastProvider } from "@pos/ui-kit";
import { useAuth } from "@pos/auth";

import LoginPage          from "../features/auth/LoginPage";
import OrientationGuard   from "../components/OrientationGuard";
import TweaksPanel, { useTweaks, type TweakValues } from "../components/TweaksPanel";
import PosScreen          from "../features/pos/PosScreen";
import AdminLayout        from "../layout/AdminLayout";
import LogoutSummaryScreen from "../features/reports/LogoutSummaryScreen";

type AppMode = "pos" | "admin" | "logout-summary";

const TWEAK_DEFAULTS: TweakValues = { typo: "rustica", density: "comoda", dark: false };

export default function App() {
  const { authenticated, role, canAccessAdmin, clearSession } = useAuth();
  const [mode, setMode] = useState<AppMode>("pos");
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    if (authenticated) setMode("pos");
  }, [authenticated]);

  useEffect(() => {
    if (mode === "admin" && !canAccessAdmin) setMode("pos");
  }, [mode, canAccessAdmin]);

  const tecpanClass = ["tecpan", tweaks.dark && "tecpan-dark"].filter(Boolean).join(" ");

  if (!authenticated) {
    return (
      <div className={tecpanClass} data-typo={tweaks.typo} data-density={tweaks.density}>
        <OrientationGuard>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </OrientationGuard>
        <TweaksPanel
          values={tweaks}
          onTypo={v => setTweak("typo", v)}
          onDensity={v => setTweak("density", v)}
          onDark={v => setTweak("dark", v)}
        />
      </div>
    );
  }

  return (
    <div className={tecpanClass} data-typo={tweaks.typo} data-density={tweaks.density}>
      <OrientationGuard>
        <ToastProvider>
          {mode === "pos" && (
            <PosScreen
              role={role}
              onGoToAdmin={() => { if (canAccessAdmin) setMode("admin"); }}
              onLogout={() => setMode("logout-summary")}
            />
          )}

          {mode === "admin" && (
            <AdminLayout
              role={role}
              onBackToPos={() => setMode("pos")}
              onLogout={() => setMode("logout-summary")}
            />
          )}

          {mode === "logout-summary" && (
            <LogoutSummaryScreen
              role={role}
              onContinueToLogin={clearSession}
            />
          )}
        </ToastProvider>
      </OrientationGuard>
      <TweaksPanel
        values={tweaks}
        onTypo={v => setTweak("typo", v)}
        onDensity={v => setTweak("density", v)}
        onDark={v => setTweak("dark", v)}
      />
    </div>
  );
}
