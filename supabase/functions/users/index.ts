import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import {
  errorResponseFromUnknown,
  getOptionalBooleanField,
  getOptionalStringField,
  getPositiveIntegerField,
  parseRequiredJsonBody,
} from "../_shared/http.ts";

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

// --- Input validation helpers ---

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function isValidEmail(email: unknown): email is string {
  return (
    typeof email === "string" && EMAIL_REGEX.test(email) && email.length <= 254
  );
}

function isValidName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= MAX_NAME_LENGTH
  );
}

function isValidPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

// --- Route handlers ---

async function inviteUser(req: Request, currentUserSale: any) {
  try {
    const body = await parseRequiredJsonBody(req);
    const email = getOptionalStringField(body, "email");
    const password = getOptionalStringField(body, "password");
    const first_name = getOptionalStringField(body, "first_name");
    const last_name = getOptionalStringField(body, "last_name");
    const disabled = getOptionalBooleanField(body, "disabled");
    const administrator = getOptionalBooleanField(body, "administrator");

    if (!currentUserSale.administrator) {
      return createErrorResponse(401, "Not Authorized");
    }

    if (!isValidEmail(email)) {
      return createErrorResponse(400, "Invalid or missing email address");
    }
    if (!isValidPassword(password)) {
      return createErrorResponse(
        400,
        `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
      );
    }
    if (!isValidName(first_name)) {
      return createErrorResponse(
        400,
        "Invalid or missing first_name (max 100 chars)",
      );
    }
    if (!isValidName(last_name)) {
      return createErrorResponse(
        400,
        "Invalid or missing last_name (max 100 chars)",
      );
    }
    if (disabled === undefined) {
      return createErrorResponse(400, "disabled must be a boolean");
    }
    if (administrator === undefined) {
      return createErrorResponse(400, "administrator must be a boolean");
    }

    const { data, error: userError } = await supabaseAdmin.auth.admin.createUser(
      {
        email,
        password,
        user_metadata: { first_name, last_name },
      },
    );

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

        return createJsonResponse({
          data: sale,
        });
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

      return createJsonResponse({
        data: sale,
      });
    } catch (e) {
      console.error("Error patching sale:", e);
      return createErrorResponse(500, "Internal Server Error");
    }
  } catch (error) {
    return errorResponseFromUnknown(error);
  }
}

async function patchUser(req: Request, currentUserSale: any) {
  try {
    const body = await parseRequiredJsonBody(req);
    const sales_id = getPositiveIntegerField(body, "sales_id", {
      required: true,
    });
    const email = getOptionalStringField(body, "email");
    const first_name = getOptionalStringField(body, "first_name");
    const last_name = getOptionalStringField(body, "last_name");
    const avatar = getOptionalStringField(body, "avatar");
    const administrator = getOptionalBooleanField(body, "administrator");
    const disabled = getOptionalBooleanField(body, "disabled");

    if (email !== undefined && !isValidEmail(email)) {
      return createErrorResponse(400, "Invalid email address");
    }
    if (first_name !== undefined && !isValidName(first_name)) {
      return createErrorResponse(400, "Invalid first_name (max 100 chars)");
    }
    if (last_name !== undefined && !isValidName(last_name)) {
      return createErrorResponse(400, "Invalid last_name (max 100 chars)");
    }

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
        ban_duration: disabled === undefined
          ? undefined
          : disabled
          ? "87600h"
          : "none",
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
      return createJsonResponse({
        data: new_sale,
      });
    }

    try {
      await updateSaleDisabled(data.user.id, disabled ?? sale.disabled ?? false);
      const updatedSale = await updateSaleAdministrator(
        data.user.id,
        administrator ?? sale.administrator ?? false,
      );
      return createJsonResponse({
        data: updatedSale,
      });
    } catch (e) {
      console.error("Error patching sale:", e);
      return createErrorResponse(500, "Internal Server Error");
    }
  } catch (error) {
    return errorResponseFromUnknown(error);
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
