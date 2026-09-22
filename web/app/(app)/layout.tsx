import Header from "@/components/Header";
import StatusProvider from "@/components/StatusProvider";
import ChangelogToast from "@/components/ChangelogToast";
import { SessionProvider } from "next-auth/react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper text-ink min-h-dvh">
      <SessionProvider>
        <StatusProvider>
          <Header />
          <main className="container-main py-6">{children}</main>
          <ChangelogToast />
        </StatusProvider>
      </SessionProvider>
    </div>
  );
}
