import type { ReactNode } from "react";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="login-wrap">
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <LocaleSwitcher />
      </div>
      {children}
    </div>
  );
}
