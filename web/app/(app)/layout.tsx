import Header from "@/components/Header";
import StatusProvider from "@/components/StatusProvider";
import NotificationStack from "@/components/NotificationStack";
import { SessionProvider } from "next-auth/react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper text-ink min-h-dvh">
      {/* Focus refetch = a server call (+ DB read in the jwt callback) every
          time someone returns from an Apply tab. Sign-in/out still update it. */}
      <SessionProvider refetchOnWindowFocus={false}>
        <StatusProvider>
          <Header />
          <main className="container-main py-6">{children}</main>
          <NotificationStack />
        </StatusProvider>
      </SessionProvider>
    </div>
  );
}
