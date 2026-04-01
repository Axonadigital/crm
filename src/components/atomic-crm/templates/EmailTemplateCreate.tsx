import { useTranslate } from "ra-core";
import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { EmailTemplateInputs } from "./EmailTemplateInputs";

export const EmailTemplateCreate = () => {
  const translate = useTranslate();
  return (
    <Create
      title={translate("resources.email_templates.action.create", {
        _: "Skapa e-postmall",
      })}
    >
      <SimpleForm>
        <EmailTemplateInputs />
      </SimpleForm>
    </Create>
  );
};
