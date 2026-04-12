import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規登録",
  description: "メールアドレスとパスワードでアカウントを作成します。",
};

export default function SignupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
