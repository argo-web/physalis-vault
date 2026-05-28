import type { ReactNode } from "react";

// Root layout minimal : le layout [locale] fournit <html> et <body>.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
