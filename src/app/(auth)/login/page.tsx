import { Suspense } from "react";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Đăng nhập · Site Monitoring" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const domain = process.env.ALLOWED_EMAIL_DOMAIN || undefined;
  return (
    <Suspense fallback={<AuthForm mode="login" action={login} domain={domain} />}>
      <LoginForm searchParams={searchParams} domain={domain} />
    </Suspense>
  );
}

async function LoginForm({ searchParams, domain }: { searchParams: PageProps<"/login">["searchParams"]; domain?: string }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={login} domain={domain} next={typeof next === "string" ? next : undefined} />;
}
