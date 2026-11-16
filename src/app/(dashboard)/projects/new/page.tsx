import { NewProjectForm } from "@/components/new-project-form";
import { Card, PageHeader } from "@/components/ui";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="Tạo project" subtitle="Mỗi ứng dụng cần giám sát là một project." />
      <Card>
        <NewProjectForm />
      </Card>
    </>
  );
}
