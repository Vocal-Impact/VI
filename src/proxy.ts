import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic check only: bounce visitors without a session cookie to the
 * sign-in page. Real authorization happens in `requirePermission` on the
 * server for every page and action (a proxy is not a security boundary).
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals, public pages and any static file (logo, icons, manifest).
  matcher: ["/((?!api|_next/static|_next/image|sign-in|forbidden|.*\\.[a-z0-9]+$).*)"],
};
