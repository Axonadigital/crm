import { useGetIdentity, useTranslate } from "ra-core";
import { CreateSheet } from "../misc/CreateSheet";
import { CompanyInputs } from "./CompanyInputs";

export interface CompanyCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CompanyCreateSheet = ({
  open,
  onOpenChange,
}: CompanyCreateSheetProps) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  return (
    <CreateSheet
      resource="companies"
      title={translate("resources.companies.action.create", {
        _: "New Company",
      })}
      defaultValues={{ sales_id: identity?.id, lead_status: "new" }}
      transform={(values) => {
        if (values.website && !values.website.startsWith("http")) {
          return { ...values, website: `https://${values.website}` };
        }
        return values;
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CompanyInputs />
    </CreateSheet>
  );
};
