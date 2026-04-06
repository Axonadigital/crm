import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";

// --- Input Validation ---

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

interface InviteUserInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  disabled: boolean;
  administrator: boolean;
}

interface PatchUserInput {
  sales_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  administrator?: boolean;
  disabled?: boolean;
}

function validateEmail(email: unknown): string | null {
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return "Invalid email format";
  }
  if (email.length > 254) {
    return "Email exceeds maximum length";
  }
  return null;
}

function validateName(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null; // optional
  if (typeof value !== "string") {
    return `${field} must be a string`;
  }
  if (value.length > MAX_NAME_LENGTH) {
    return `${field} exceeds maximum length of ${MAX_NAME_LENGTH}`;
  }
  return null;
}

function validateInviteInput(
  body: Record<string, unknown>,
): { data: InviteUserInput } | { error: string } {
  const { email, password, first_name, last_name, disabled, administrator } =
    body;

  if (!email) return { error: "email is required" };
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };

  if (!password || typeof password !== "string")
    return { error: "password is required and must be a string" };
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      error: `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  if (password.length > MAX_PASSWORD_LENGTH)
    return {
      error: `password exceeds maximum length of ${MAX_PASSWORD_LENGTH}`,
    };

  const fnErr = validateName(first_name, "first_name");
  if (fnErr) return { error: fnErr };
  const lnErr = validateName(last_name, "last_name");
  if (lnErr) return { error: lnErr };

  if (disabled !== undefined && typeof disabled !== "boolean")
    return { error: "disabled must be a boolean" };
  if (administrator !== undefined && typeof administrator !== "boolean")
    return { error: "administrator must be a boolean" };

  return {
    data: {
      email: email as string,
      password: password as string,
      first_name: (first_name as string) ?? "",
      last_name: (last_name as string) ?? "",
      disabled: (disabled as boolean) ?? false,
      administrator: (administrator as boolean) ?? false,
    },
  };
}

function validatePatchInput(
  body: Record<string, unknown>,
): { data: PatchUserInput } | { error: string } {
  const {
    sales_id,
    email,
    first_name,
    last_name,
    avatar,
    administrator,
    disabled,
  } = body;

  if (sales_id === undefined || sales_id === null)
    return { error: "sales_id is required" };
  if (
    typeof sales_id !== "number" ||
    !Number.isInteger(sales_id) ||
    sales_id <= 0
  ) {
    return { error: "sales_id must be a positive integer" };
  }

  if (email !== undefined) {
    const emailErr = validateEmail(email);
    if (emailErr) return { error: emailErr };
  }

  const fnErr = validateName(first_name, "first_name");
  if (fnErr) return { error: fnErr };
  const lnErr = validateName(last_name, "last_name");
  if (lnErr) return { error: lnErr };

  if (avatar !== undefined && typeof avatar !== "string")
    return { error: "avatar must be a string" };
  if (disabled !== undefined && typeof disabled !== "boolean")
    return { error: "disabled must be a boolean" };
  if (administrator !== undefined && typeof administrator !== "boolean")
    return { error: "administrator must be a boolean" };

  return {
    data: {
      sales_id: sales_id as number,
      email: email as string | undefined,
      first_name: first_name as string | undefined,
      last_name: last_name as string | undefined,
      avatar: avatar as string | undefined,
      administrator: administrator as boolean | undefined,
      disabled: disabled as boolean | undefined,
    },
  };
}

async function updateSaleDisabled(user_id: string, disabled: boolean) {
  return await supabaseAdmin
    .from("sales")
    .update({ disabled: disabled ?? false })
    .eq("user_id", user_id);
}

async function updateSaleAdministrator(
  user_id: string,
  administrator: boolean,
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ administrator })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function createSale(
  user_id: string,
  data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    disabled: boolean;
    administrator: boolean;
  },
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .insert({ ...data, user_id })
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error creating user:", salesError);
    throw salesError ?? new Error("Failed to create sale");
  }
  return sales.at(0);
}

async function updateSaleAvatar(user_id: string, avatar: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ avatar })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function inviteUser(req: Request, currentUserSale: any) {
  const body = await req.json();
  const validated = validateInviteInput(body);
  if ("error" in validated) {
    return createErrorResponse(400, validated.error);
  }
  const { email, password, first_name, last_name, disabled, administrator } =
    validated.data;

  if (!currentUserSale.administrator) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { first_name, last_name },
  });

  let user = data?.user;

  if (!user && userError?.code === "email_exists") {
    // This may happen if users cleared their database but not the users
    // We have to create the sale directly
    const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", {
      email,
    });

    if (!data || error) {
      console.error(
        `Error inviting user: error=${error ?? "could not fetch users for email"}`,
      );
      return createErrorResponse(500, "Internal Server Error");
    }

    user = data[0];
    try {
      const { data: existingSale, error: salesError } = await supabaseAdmin
        .from("sales")
        .select("*")
        .eq("user_id", user.id);
      if (salesError) {
        return createErrorResponse(salesError.status, salesError.message, {
          code: salesError.code,
        });
      }
      if (existingSale.length > 0) {
        return createErrorResponse(
          400,
          "A sales for this email already exists",
        );
      }

      const sale = await createSale(user.id, {
        email,
        password: "", // Never store plaintext passwords in the sales table
        first_name,
        last_name,
        disabled,
        administrator,
      });

      return new Response(
        JSON.stringify({
          data: sale,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      return createErrorResponse(
        (error as any).status ?? 500,
        (error as Error).message,
        {
          code: (error as any).code,
        },
      );
    }
  } else {
    if (userError) {
      console.error(`Error inviting user: user_error=${userError}`);
      return createErrorResponse(userError.status, userError.message, {
        code: userError.code,
      });
    }
    if (!data?.user) {
      console.error("Error inviting user: undefined user");
      return createErrorResponse(500, "Internal Server Error");
    }
    const { error: emailError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (emailError) {
      console.error(`Error inviting user, email_error=${emailError}`);
      return createErrorResponse(500, "Failed to send invitation mail");
    }
  }

  try {
    await updateSaleDisabled(user.id, disabled);
    const sale = await updateSaleAdministrator(user.id, administrator);

    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

async function patchUser(req: Request, currentUserSale: any) {
  const {
    sales_id,
    email,
    first_name,
    last_name,
    avatar,
    administrator,
    disabled,
  } = await req.json();
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", sales_id)
    .single();

  if (!sale) {
    return createErrorResponse(404, "Not Found");
  }

  // Users can only update their own profile unless they are an administrator
  if (!currentUserSale.administrator && currentUserSale.id !== sale.id) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data, error: userError } =
    await supabaseAdmin.auth.admin.updateUserById(sale.user_id, {
      email,
      ban_duration: disabled ? "87600h" : "none",
      user_metadata: { first_name, last_name },
    });

  if (!data?.user || userError) {
    console.error("Error patching user:", userError);
    return createErrorResponse(500, "Internal Server Error");
  }

  if (avatar) {
    await updateSaleAvatar(data.user.id, avatar);
  }

  // Only administrators can update the administrator and disabled status
  if (!currentUserSale.administrator) {
    const { data: new_sale } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", sales_id)
      .single();
    return new Response(
      JSON.stringify({
        data: new_sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }

  try {
    await updateSaleDisabled(data.user.id, disabled);
    const sale = await updateSaleAdministrator(data.user.id, administrator);
    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const currentUserSale = await getUserSale(user);
        if (!currentUserSale) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method === "POST") {
          return inviteUser(req, currentUserSale);
        }

        if (req.method === "PATCH") {
          return patchUser(req, currentUserSale);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
