import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error("[middleware] Supabase の公開環境変数が未設定です。");
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(
          ({
            name,
            value,
            options,
          }: {
            name: string;
            value: string;
            options: CookieOptions;
          }) => supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if ((pathname === "/login" || pathname === "/signup") && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/records";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const isProtected =
    pathname.startsWith("/records") ||
    pathname.startsWith("/patients") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/records") ||
    pathname.startsWith("/api/patients") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/api/generate" ||
    pathname === "/api/transcribe";

  if (isProtected && !user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "未ログインです。" },
        { status: 401 }
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/records/:path*",
    "/patients",
    "/patients/new",
    "/patients/:path*",
    "/admin/:path*",
    "/api/records",
    "/api/records/:path*",
    "/api/patients",
    "/api/patients/:path*",
    "/api/admin/:path*",
    "/api/generate",
    "/api/transcribe",
    "/login",
    "/signup",
  ],
};
