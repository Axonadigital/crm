import { useTranslate } from "ra-core";
import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

import { EmailTemplateInputs } from "./EmailTemplateInputs";

export const EmailTemplateEdit = () => {
  const translate = useTranslate();
  return (
    <Edit
      title={translate("resources.email_templates.action.edit", {
        _: "Redigera e-postmall",
      })}
    >
      <SimpleForm>
        <EmailTemplateInputs />
      </SimpleForm>
    </Edit>
  );
};
