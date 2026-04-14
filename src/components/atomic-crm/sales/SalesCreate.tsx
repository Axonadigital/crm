import { useMutation } from "@tanstack/react-query";
import { useDataProvider, useNotify, useRedirect, useTranslate } from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { SalesInputs } from "./SalesInputs";

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: async (result) => {
      if (result.invite_link) {
        try {
          await navigator.clipboard.writeText(result.invite_link);
        } catch {
          // Clipboard access can fail outside secure/user-granted contexts.
        }
      }
      if (result.temporary_password) {
        try {
          await navigator.clipboard.writeText(result.temporary_password);
        } catch {
          // Clipboard access can fail outside secure/user-granted contexts.
        }
      }

      notify("resources.sales.create.success", {
        messageArgs: {
          _:
            result.invite_link
              ? "User created. An invitation link has been copied as a fallback if the email does not arrive."
              : result.temporary_password
                ? "User created. A temporary password has been copied because invitation email delivery is unavailable."
              : "User created. They will soon receive an email to set their password.",
        },
      });

      if (result.invite_link) {
        window.prompt(
          translate("resources.sales.create.invite_link", {
            _: "Copy or share this invitation link",
          }),
          result.invite_link,
        );
      }
      if (result.temporary_password) {
        window.prompt(
          translate("resources.sales.create.temporary_password", {
            _: "Share this temporary password with the user",
          }),
          result.temporary_password,
        );
      }

      redirect("/sales");
    },
    onError: (error) => {
      notify(
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
        {
          type: "error",
        },
      );
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {translate("resources.sales.create.title", {
              _: "Create a new user",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
            <SalesInputs />
          </SimpleForm>
        </CardContent>
      </Card>
    </div>
  );
}
