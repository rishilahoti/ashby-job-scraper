import AddCompanyForm from "@/components/AddCompanyForm";

export const metadata = {
  title: "Add Company — Ashby Tracker",
  description: "Add a new company to track by pasting their Ashby job board URL.",
};

export default function AddPage() {
  return <AddCompanyForm />;
}
