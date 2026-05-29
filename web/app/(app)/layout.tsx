import Header from "@/components/Header";
import StatusProvider from "@/components/StatusProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper text-ink min-h-dvh">
      <StatusProvider>
        <Header />
        <main className="container-main py-6">{children}</main>
      </StatusProvider>
    </div>
  );
}
