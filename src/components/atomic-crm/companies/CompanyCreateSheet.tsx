import { useGetIdentity, useTranslate } from "ra-core";
import { CreateSheet } from "../misc/CreateSheet";
import { CompanyInputs } from "./CompanyInputs";
import { normalizeCompanyWebsite } from "./normalizeCompanyWebsite";

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
      defaultValues={{ sales_id: identity?.id }}
      transform={normalizeCompanyWebsite}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CompanyInputs />
    </CreateSheet>
  );
};
