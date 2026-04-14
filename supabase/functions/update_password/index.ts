import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import type { User } from "jsr:@supabase/supabase-js@2";

function buildSetPasswordRedirectUrl() {
  const siteUrl =
    Deno.env.get("SITE_URL") ?? "https://crm.axonadigital.se";

  try {
    const url = new URL(siteUrl);
    url.hash = "/set-password";
    return url.toString();
  } catch (error) {
    console.error("Invalid SITE_URL:", siteUrl, error);
    return "https://crm.axonadigital.se/#/set-password";
  }
}

async function getUserEmail(user: User) {
  if (user.email) {
    return user.email;
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);

  if (error) {
    console.error("getUserById error:", error);
    return null;
  }

  return data.user?.email ?? null;
}

async function updatePassword(user: User) {
  const email = await getUserEmail(user);

  if (!email) {
    return createErrorResponse(400, "Authenticated user is missing an email");
  }

  const redirectTo = buildSetPasswordRedirectUrl();
  const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(
    email,
    { redirectTo },
  );

  if (error) {
    console.error("resetPasswordForEmail error:", error);
    return createErrorResponse(
      error.status ?? 500,
      error.message ?? "Internal Server Error",
    );
  }
  if (!data) {
    console.error("resetPasswordForEmail returned no data");
    return createErrorResponse(500, "Internal Server Error");
  }

  return createJsonResponse(true, {
    headers: corsHeaders,
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method === "PATCH") {
          return updatePassword(user);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
