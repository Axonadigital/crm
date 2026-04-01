import { EmailTemplateCreate } from "./EmailTemplateCreate";
import { EmailTemplateEdit } from "./EmailTemplateEdit";
import { EmailTemplateList } from "./EmailTemplateList";

export default {
  list: EmailTemplateList,
  create: EmailTemplateCreate,
  edit: EmailTemplateEdit,
  recordRepresentation: (record: { name: string }) => record.name,
};
