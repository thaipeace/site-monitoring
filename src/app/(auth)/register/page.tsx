import { register } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Đăng ký · Site Monitoring" };

export default function RegisterPage() {
  return <AuthForm mode="register" action={register} domain={process.env.ALLOWED_EMAIL_DOMAIN || undefined} />;
}
