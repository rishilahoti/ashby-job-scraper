import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfileData } from "@/lib/profile";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const data = await getProfileData(session.user.id);
  if (!data) redirect("/signin");

  return <ProfileClient initialData={data} />;
}
